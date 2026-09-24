"""Fold provider events into the latest per-bicycle rest state. Pure, no I/O.

Rules (operations_requirements.md §4):
- a credible trip end / drop-off at rest starts the parking clock;
- a cancelled trip, located or comms_restored event resets it only if the bike actually moved;
- telemetry at the same position does not reset it, but counts as a fresh observation.
"""
from dataclasses import dataclass, replace
from datetime import datetime

from app.core.geo import haversine_m

REST_STATES = {"available", "non_operational"}
UNCERTAIN_STATES = {"non_contactable", "missing"}
REST_START_EVENTS = {"trip_end", "provider_drop_off", "trip_enter_jurisdiction", "reservation_cancel"}


@dataclass(frozen=True)
class Event:
    device_id: str
    time: datetime
    state: str
    event_types: frozenset[str]
    lat: float | None
    lng: float | None


@dataclass(frozen=True)
class VehicleState:
    device_id: str
    state: str
    lat: float | None
    lng: float | None
    last_event_time: datetime
    rest_since: datetime | None = None          # None = not at rest (on trip, removed, ...)
    last_observed_at_rest: datetime | None = None  # latest same-position observation after rest_since

    @property
    def at_rest(self) -> bool:
        return self.rest_since is not None

    @property
    def uncertain_state(self) -> bool:
        return self.state in UNCERTAIN_STATES


def apply_event(prev: VehicleState | None, ev: Event, move_tolerance_m: float) -> VehicleState:
    lat, lng = (ev.lat, ev.lng) if ev.lat is not None else ((prev.lat, prev.lng) if prev else (None, None))

    if ev.state not in REST_STATES | UNCERTAIN_STATES or "decommissioned" in ev.event_types:
        return VehicleState(ev.device_id, ev.state, lat, lng, ev.time)

    if prev is None or not prev.at_rest or ev.event_types & REST_START_EVENTS:
        return VehicleState(ev.device_id, ev.state, lat, lng, ev.time, rest_since=ev.time)

    moved = (
        ev.lat is not None
        and prev.lat is not None
        and haversine_m(prev.lat, prev.lng, ev.lat, ev.lng) > move_tolerance_m
    )
    if moved:  # confirmed move starts a new dwell interval
        return VehicleState(ev.device_id, ev.state, ev.lat, ev.lng, ev.time, rest_since=ev.time)

    # same position: keep clock and position (ignore GPS jitter), record fresh observation
    observed = ev.time if ev.lat is not None and ev.state in REST_STATES else prev.last_observed_at_rest
    return replace(prev, state=ev.state, last_event_time=ev.time, last_observed_at_rest=observed)
