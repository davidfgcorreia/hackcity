"""API contract. Mirror of frontend/src/types.ts — change both together."""
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CaseStatus(StrEnum):
    candidate = "candidate"
    uncertain = "uncertain"
    supported = "supported"
    eligible = "eligible"
    assigned = "assigned"
    picked_up = "picked_up"
    resolved = "resolved"


class Outcome(StrEnum):
    picked_up = "picked_up"
    not_found = "not_found"
    in_use = "in_use"
    provider_recovered = "provider_recovered"
    unsafe = "unsafe"
    inaccessible = "inaccessible"
    unable_to_load = "unable_to_load"


class StationOut(ORM):
    id: str
    name: str
    lat: float
    lng: float
    area: dict


class CaseOut(ORM):
    id: int
    device_id: str
    status: CaseStatus
    source: str
    lat: float
    lng: float
    rest_since: datetime | None
    last_observed_at: datetime | None
    distance_outside_m: float | None
    reason: str
    needs_approval: bool
    blocked_reason: str | None
    updated_at: datetime


class CaseEventOut(ORM):
    id: int
    kind: str
    detail: dict
    actor: str
    event_time: datetime | None
    recorded_at: datetime


class CaseDetail(CaseOut):
    timeline: list[CaseEventOut]


class FieldCaseIn(BaseModel):
    """Operator reports a bicycle not on their route. Needs approval before pickup."""
    device_id: str
    lat: float
    lng: float
    notes: str | None = None
    actor: str


class CaseCorrectionIn(BaseModel):
    """Staff correction/override. Reason and actor are mandatory (evidence is never erased).

    Only fields present in the request body are applied, so an explicit `null` clears a
    value — that is how a reviewer unblocks a case (T-E3).
    """
    actor: str
    reason: str
    lat: float | None = None
    lng: float | None = None
    status: CaseStatus | None = None
    blocked_reason: str | None = None


class StopOut(ORM):
    id: int
    case_id: int | None
    seq: int
    kind: str
    status: str
    lat: float
    lng: float
    outcome: Outcome | None
    photo_path: str | None  # served at /api/uploads/<photo_path>
    eta_s: float | None = None


class MissionOut(ORM):
    id: int
    operator_id: str
    status: str
    version: int
    last_change: str | None
    total_km: float | None
    capacity: int
    stops: list[StopOut]
    route_geojson: dict | None = None   # GeoJSON LineString, van -> stops -> depot, on roads
    route_waypoints: list[list[float]] | None = None  # OSRM snapped [lng, lat], start then each stop
    route_legs: list | None = None      # [{distance_m, duration_s, steps: [OSRM step]}] one per stop + depot
    duration_s: float | None = None
    distance_m: float | None = None
    routing_engine: str | None = None   # "osrm" or "straight-line" (road engine unavailable)


class PositionIn(BaseModel):
    lat: float
    lng: float


class ReplanIn(PositionIn):
    operator_id: str
    reason: str | None = None  # e.g. "off_route" when the app detects the van left the route


class LiveState(BaseModel):
    running: bool
    last_poll: datetime | None
    last_error: str | None
    vehicles_in_feed: int  # after the form-factor filter
    tracked: int
    form_factors: str
    last_changes: list[str] = []


class ReplayState(BaseModel):
    running: bool
    sim_time: datetime | None
    speed: float
    last_changes: list[str] = []  # newest first: what the detector changed on recent ticks


class KpiOut(BaseModel):
    """Operational results for the review KPI strip (T-E6, ops req §10).

    `by_status` always carries every CaseStatus key, zero-filled, so the UI can render a
    stable set of chips.
    """
    by_status: dict[CaseStatus, int]
    open_cases: int
    visits_completed: int
    not_found_visits: int
    not_found_rate: float | None       # not_found_visits / visits_completed
    picked_up_total: int
    median_eligible_to_pickup_min: float | None
