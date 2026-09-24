"""Real-time detection from the provider's GBFS feeds (the default operating mode).

Every `gbfs_poll_s` (feed ttl): free_bike_status -> core.gbfs_tracker (identity by position,
since public bike_id rotates) -> core.vehicle_state fold -> detector -> cases -> replan.
Station areas come from the live station_information and are refreshed periodically, so the
buffer uses the shape that applied when the bike was observed.
Transitions (appeared / disappeared / state change) are stored in vehicle_events (source=gbfs)
as evidence and to restore parking clocks after a restart.
"""
import asyncio
import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.core.gbfs_tracker import Sighting, Tracker
from app.core.geo import ZoneIndex
from app.core.vehicle_state import VehicleState, apply_event
from app.db import SessionLocal
from app.models import Station, VehicleEvent
from app.schemas import LiveState
from app.services import cases, clock, missions
from app.services.replay import to_event

log = logging.getLogger("live")


def http_fetch(url: str) -> dict:
    r = httpx.get(url, timeout=15)
    r.raise_for_status()
    return r.json()


def _ts(epoch) -> datetime | None:
    return datetime.fromtimestamp(epoch, timezone.utc) if epoch else None


class LiveEngine:
    def __init__(self, session_factory=SessionLocal, fetch=http_fetch):
        self._sf, self._fetch = session_factory, fetch
        self._lock = threading.Lock()
        self._task: asyncio.Task | None = None
        self.running = False
        self.tracker = Tracker(settings.move_tolerance_m, 0.05, settings.gbfs_gone_grace_s,
                               settings.gbfs_stale_report_min)
        self.states: dict[str, VehicleState] = {}
        self._distance = None
        self._types: dict[str, str] = {}
        self._stations_at: datetime | None = None
        self._restored = False
        self.last_poll: datetime | None = None
        self.last_error: str | None = None
        self.in_feed = 0
        self.last_changes: list[str] = []

    def state(self) -> LiveState:
        return LiveState(running=self.running, last_poll=self.last_poll, last_error=self.last_error,
                         vehicles_in_feed=self.in_feed, tracked=len(self.tracker.tracks),
                         form_factors=settings.gbfs_form_factors, last_changes=self.last_changes)

    def feeds(self) -> dict[str, str]:
        index = json.loads(Path(settings.gbfs_index_file).read_text())
        return {f["name"]: f["url"] for f in index["data"]["en"]["feeds"]}

    def _refresh_stations(self, db, feeds, now: datetime) -> None:
        if self._stations_at and now - self._stations_at < timedelta(minutes=settings.gbfs_station_refresh_min):
            return
        stations = self._fetch(feeds["station_information"])["data"]["stations"]
        rows = [dict(id=s["station_id"], name=s["name"], lat=float(s["lat"]), lng=float(s["lon"]),
                     area=s["station_area"]) for s in stations if s.get("station_area")]
        stmt = insert(Station).values(rows)
        db.execute(stmt.on_conflict_do_update(index_elements=[Station.id],
                                              set_={"name": stmt.excluded.name, "area": stmt.excluded.area}))
        db.commit()
        zones = ZoneIndex([r["area"] for r in rows], settings.buffer_m, settings.metric_crs)
        self._distance = lru_cache(maxsize=100_000)(zones.distance_outside_m)
        self._types = {t["vehicle_type_id"]: t["form_factor"]
                       for t in self._fetch(feeds["vehicle_types"])["data"]["vehicle_types"]}
        self._stations_at = now

    def _restore(self, db, now: datetime) -> None:
        """Fold stored gbfs transitions so parking clocks survive an API restart."""
        type_of = {}
        for e in db.scalars(select(VehicleEvent).where(VehicleEvent.source == "gbfs").order_by(VehicleEvent.event_time)):
            self.states[e.device_id] = apply_event(self.states.get(e.device_id), to_event(e), settings.move_tolerance_m)
            if e.vehicle_type_id:
                type_of[e.device_id] = (self._types.get(e.vehicle_type_id, "unknown"), e.vehicle_type_id)
        self.tracker.restore(self.states, type_of, now)
        self._restored = True

    def poll_once(self, now: datetime | None = None) -> list[str]:
        now = now or datetime.now(timezone.utc)
        wanted = {f.strip() for f in settings.gbfs_form_factors.split(",")}
        with self._lock, self._sf() as db:
            feeds = self.feeds()
            self._refresh_stations(db, feeds, now)
            if not self._restored:
                self._restore(db, now)
            bikes = self._fetch(feeds["free_bike_status"])["data"]["bikes"]
            sightings = [
                Sighting(b["vehicle_type_id"], self._types.get(b["vehicle_type_id"], "unknown"), b["lat"], b["lon"],
                         bool(b.get("is_disabled")), bool(b.get("is_reserved")), b.get("current_fuel_percent"),
                         _ts(b.get("last_reported")))
                for b in bikes
            ]
            sightings = [s for s in sightings if s.form_factor in wanted]
            self.in_feed = len(sightings)
            types = {t.id: t.sighting.vehicle_type_id for t in self.tracker.tracks.values()}
            rows = []
            for ev in self.tracker.update(sightings, now):
                prev = self.states.get(ev.device_id)
                self.states[ev.device_id] = apply_event(prev, ev, settings.move_tolerance_m)
                if ev.event_types != {"located"} or (prev and prev.state != ev.state):
                    type_id = self.tracker.tracks[ev.device_id].sighting.vehicle_type_id \
                        if ev.device_id in self.tracker.tracks else types.get(ev.device_id)
                    rows.append(dict(id=f"gbfs-{uuid4().hex}", source="gbfs", device_id=ev.device_id,
                                     vehicle_type_id=type_id, state=ev.state, event_types=sorted(ev.event_types),
                                     lat=ev.lat, lng=ev.lng, event_time=now, received_at=now))
            if rows:
                db.execute(insert(VehicleEvent).values(rows))
            gone = [d for d, s in self.states.items() if not s.at_rest and d not in self.tracker.tracks]
            changes = cases.sync_all(db, self.states, self._distance, now, cases.rules("live"), source="live")
            for d in gone:  # a vanished vehicle never comes back under the same track id
                del self.states[d]
            db.commit()
            if changes:
                missions.replan_all(db, "; ".join(changes[:3]) + (f" (+{len(changes) - 3} more)" if len(changes) > 3 else ""))
                self.last_changes = (changes + self.last_changes)[:20]
            self.last_poll, self.last_error = now, None
            return changes

    async def start(self) -> LiveState:
        from app.services.replay import engine as replay  # live and replay are exclusive modes

        replay.pause()
        clock.set_sim_time(None)
        if not self.running:
            self.running = True
            self._task = asyncio.create_task(self._run())
        return self.state()

    def pause(self) -> LiveState:
        self.running = False
        return self.state()

    async def _run(self) -> None:
        while self.running:
            try:
                await asyncio.to_thread(self.poll_once)
            except Exception as e:  # keep polling through feed hiccups
                self.last_error = f"{type(e).__name__}: {e}"
                log.exception("live poll failed")
            await asyncio.sleep(settings.gbfs_poll_s)


engine = LiveEngine()
