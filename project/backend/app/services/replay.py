"""Demo mode: replay supplied events against a simulated clock.

Only events with event_time <= sim_time are visible (no look-ahead). Each tick:
  1. fold new events (cursor, sim_time] into per-bike state (core.vehicle_state)
  2. evaluate every at-rest bike, because a bike becomes abandoned without any new event
  3. sync cases; if routes are affected, replan active missions
"""
import asyncio
import threading
from datetime import datetime, timedelta
from functools import lru_cache

from sqlalchemy import delete, func, select

from app.config import settings
from app.core.geo import ZoneIndex
from app.core.vehicle_state import Event, VehicleState, apply_event
from app.db import SessionLocal
from app.models import Case, CaseEvent, Mission, Station, Stop, VehicleEvent
from app.schemas import ReplayState
from app.services import cases, clock, missions


def to_event(e: VehicleEvent) -> Event:
    return Event(e.device_id, e.event_time, e.state, frozenset(e.event_types), e.lat, e.lng)


class ReplayEngine:
    def __init__(self, session_factory=SessionLocal):
        self._sf = session_factory
        self._lock = threading.Lock()
        self._task: asyncio.Task | None = None
        self._distance = None
        self.speed = settings.replay_speed
        self.running = False
        self._clear()

    def _clear(self) -> None:
        self.states: dict[str, VehicleState] = {}
        self.cursor: datetime | None = None
        self.sim_time: datetime | None = None
        self.last_changes: list[str] = []
        clock.set_sim_time(None)

    def state(self) -> ReplayState:
        return ReplayState(running=self.running, sim_time=self.sim_time, speed=self.speed,
                           last_changes=self.last_changes)

    def distance_fn(self, db):
        if self._distance is None:
            zones = ZoneIndex([s.area for s in db.scalars(select(Station))], settings.buffer_m, settings.metric_crs)
            self._distance = lru_cache(maxsize=100_000)(zones.distance_outside_m)
        return self._distance

    def tick(self, to_time: datetime) -> list[str]:
        with self._lock, self._sf() as db:
            q = select(VehicleEvent).where(VehicleEvent.event_time <= to_time)
            if self.cursor is not None:
                q = q.where(VehicleEvent.event_time > self.cursor)
            for e in db.scalars(q.order_by(VehicleEvent.event_time, VehicleEvent.id)):
                self.states[e.device_id] = apply_event(self.states.get(e.device_id), to_event(e),
                                                       settings.move_tolerance_m)
            self.cursor = self.sim_time = to_time
            clock.set_sim_time(to_time)
            changes = cases.sync_all(db, self.states, self.distance_fn(db), to_time, cases.rules())
            db.commit()
            if changes:
                missions.replan_all(db, "; ".join(changes[:3]) + (f" (+{len(changes) - 3} more)" if len(changes) > 3 else ""))
                self.last_changes = (changes + self.last_changes)[:20]
            return changes

    def _first_event_time(self) -> datetime:
        with self._sf() as db:
            return db.scalar(select(func.min(VehicleEvent.event_time)))

    def _seek(self, from_time: datetime | None) -> None:
        if from_time is not None and self.cursor is not None and from_time < self.cursor:
            raise ValueError("cannot go back in time; POST /replay/reset first")
        if self.sim_time is None:
            self.sim_time = from_time or self._first_event_time()
            self.tick(self.sim_time)
        elif from_time is not None:
            self.tick(from_time)

    async def start(self, from_time: datetime | None, speed: float | None) -> ReplayState:
        self.speed = speed or self.speed
        await asyncio.to_thread(self._seek, from_time)
        if not self.running:
            self.running = True
            self._task = asyncio.create_task(self._run())
        return self.state()

    async def _run(self) -> None:
        while self.running:
            await asyncio.sleep(1)
            if self.running:
                await asyncio.to_thread(self.tick, self.sim_time + timedelta(seconds=self.speed))

    def pause(self) -> ReplayState:
        self.running = False
        return self.state()

    async def step(self, minutes: float) -> ReplayState:
        await asyncio.to_thread(self._seek, None)
        await asyncio.to_thread(self.tick, self.sim_time + timedelta(minutes=minutes))
        return self.state()

    def reset(self) -> ReplayState:
        """Demo only: forget replay state and delete cases and missions (events and stations stay)."""
        self.running = False
        with self._lock, self._sf() as db:
            for model in (Stop, Mission, CaseEvent, Case):
                db.execute(delete(model))
            db.commit()
            self._clear()
        return self.state()


engine = ReplayEngine()
