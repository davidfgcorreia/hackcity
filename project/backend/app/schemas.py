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
    """Staff correction/override. Reason and actor are mandatory (evidence is never erased)."""
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


class MissionOut(ORM):
    id: int
    operator_id: str
    status: str
    version: int
    last_change: str | None
    total_km: float | None
    capacity: int
    stops: list[StopOut]


class PositionIn(BaseModel):
    lat: float
    lng: float


class ReplanIn(PositionIn):
    operator_id: str


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
