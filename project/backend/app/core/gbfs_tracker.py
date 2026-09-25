"""Follow parked vehicles across GBFS snapshots although the public `bike_id` rotates.

GBFS 2.x rotates `bike_id` on every response (privacy), so identity is re-established by
position: a sighting of the same vehicle type within `tolerance_m` of a tracked vehicle, with a
compatible battery level, is the same parked vehicle. A repeat counts as fresh only when the
provider's `last_reported` advances. Pure, no I/O.

Emitted events use the same shape as the provider event log, so the detector is unchanged:
  gbfs_appeared    -> new track (rest clock starts at first sighting: a lower bound)
  located          -> re-found at (about) the same position
  gbfs_disappeared -> missing for longer than `gone_grace_s`; cause remains unknown
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import uuid4

from app.core.geo import haversine_m
from app.core.vehicle_state import Event, VehicleState

NOT_IN_FEED = "missing"


@dataclass(frozen=True)
class Sighting:
    vehicle_type_id: str
    form_factor: str
    lat: float
    lng: float
    is_disabled: bool
    is_reserved: bool
    fuel: float | None
    last_reported: datetime | None


@dataclass
class Track:
    id: str
    sighting: Sighting
    last_seen: datetime
    state: str
    missing_since: datetime | None = None
    last_source_reported: datetime | None = None


@dataclass
class Tracker:
    tolerance_m: float = 10.0
    fuel_tolerance: float = 0.05
    gone_grace_s: float = 180
    stale_report_min: float = 30
    missing_retention_s: float = 86_400
    tracks: dict[str, Track] = field(default_factory=dict)

    def state_of(self, s: Sighting, now: datetime) -> str:
        if s.is_reserved:
            return "reserved"
        if s.last_reported and now - s.last_reported > timedelta(minutes=self.stale_report_min):
            return "non_contactable"  # position may be stale -> uncertain, never "fresh"
        return "non_operational" if s.is_disabled else "available"

    def _same(self, t: Track, s: Sighting) -> float | None:
        if t.sighting.vehicle_type_id != s.vehicle_type_id:
            return None
        if t.sighting.fuel is not None and s.fuel is not None and abs(t.sighting.fuel - s.fuel) > self.fuel_tolerance:
            return None
        d = haversine_m(t.sighting.lat, t.sighting.lng, s.lat, s.lng)
        return d if d <= self.tolerance_m else None

    def update(self, sightings: list[Sighting], now: datetime) -> list[Event]:
        events: list[Event] = []
        unmatched = dict(self.tracks)
        pending = []
        # exact position first (most parked vehicles), then nearest within tolerance
        by_pos = {}
        for t in unmatched.values():
            by_pos.setdefault((t.sighting.vehicle_type_id, t.sighting.lat, t.sighting.lng), []).append(t)
        for s in sightings:
            bucket = by_pos.get((s.vehicle_type_id, s.lat, s.lng))
            t = next((t for t in bucket or [] if t.id in unmatched and self._same(t, s) is not None), None)
            if t:
                self._continue(unmatched.pop(t.id), s, now, events)
            else:
                pending.append(s)
        for s in pending:
            best = min(((d, t) for t in unmatched.values() if (d := self._same(t, s)) is not None),
                       default=None, key=lambda x: x[0])
            if best:
                self._continue(unmatched.pop(best[1].id), s, now, events)
            else:
                state = self.state_of(s, now)
                t = Track(f"{s.form_factor}-{uuid4().hex[:12]}", s, now, state,
                          last_source_reported=s.last_reported)
                self.tracks[t.id] = t
                events.append(Event(t.id, now, state, frozenset({"gbfs_appeared"}), s.lat, s.lng,
                                    observed_at=s.last_reported))
        for t in unmatched.values():
            missing_for = (now - t.last_seen).total_seconds()
            if missing_for > self.gone_grace_s and t.missing_since is None:
                t.missing_since = now
                t.state = NOT_IN_FEED
                events.append(Event(t.id, now, NOT_IN_FEED, frozenset({"gbfs_disappeared"}), None, None))
            if missing_for > self.missing_retention_s:
                del self.tracks[t.id]
        return events

    def _continue(self, t: Track, s: Sighting, now: datetime, events: list[Event]) -> None:
        previous = t.last_source_reported
        state = self.state_of(s, now)
        fresh = (s.last_reported is not None and s.last_reported <= now
                 and (previous is None or s.last_reported > previous)
                 and state != "non_contactable")
        changed = state != t.state
        t.sighting, t.last_seen, t.state, t.missing_since = s, now, state, None
        if s.last_reported and (previous is None or s.last_reported > previous):
            t.last_source_reported = s.last_reported
        if fresh:
            events.append(Event(t.id, now, state, frozenset({"located"}), s.lat, s.lng,
                                observed_at=s.last_reported))
        elif changed:
            # A changed feed flag is useful evidence, but an unchanged source timestamp
            # must never turn this poll into a new location observation.
            events.append(Event(t.id, now, state, frozenset({"feed_state"}), None, None))

    def restore(self, states: dict[str, VehicleState], type_of: dict[str, tuple[str, str]], now: datetime,
                source_seen: dict[str, datetime] | None = None) -> None:
        """Rebuild tracks after a restart from persisted state, so parking clocks survive.
        `type_of`: device_id -> (form_factor, vehicle_type_id)."""
        for st in states.values():
            if st.at_rest and st.lat is not None and st.device_id in type_of:
                ff, type_id = type_of[st.device_id]
                s = Sighting(type_id, ff, st.lat, st.lng, False, False, None,
                             (source_seen or {}).get(st.device_id))
                self.tracks[st.device_id] = Track(st.device_id, s, st.last_event_time, st.state,
                                                   st.last_event_time if st.state == NOT_IN_FEED else None,
                                                   s.last_reported)
