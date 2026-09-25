from datetime import UTC, datetime
from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.models import Case, CaseEvent, Stop
from app.schemas import (
    CaseCorrectionIn,
    CaseDetail,
    CaseOut,
    CaseStatus,
    FieldCaseIn,
    KpiOut,
    Outcome,
)
from app.services import cases as cases_svc
from app.services import missions

router = APIRouter(tags=["cases"])

CLOSED_STATUSES = {CaseStatus.picked_up.value, CaseStatus.resolved.value}
STAFF_EVENT_KINDS = {"correction", "approved", "export", "override"}
FIELD_EVENT_KINDS = {"field_outcome", "field_report"}


@router.get("/rules")
def detection_rules():
    """The active abandonment rule, so every screen explains the same clock."""
    return {"abandon_minutes": settings.abandon_minutes, "buffer_m": settings.buffer_m,
            "enforce_window": settings.enforce_window, "enforce_from_hour": settings.enforce_from_hour,
            "enforce_until_hour": settings.enforce_until_hour, "enforce_tz": settings.enforce_tz}


@router.get("/cases", response_model=list[CaseOut])
def list_cases(status: CaseStatus | None = None, current: bool = False, source: str | None = None,
               db: Session = Depends(get_db)):
    """`current=true` keeps only the active mode's cases (live or replay, plus field reports);
    `source` selects one source (the field demo loads `demo`)."""
    q = select(Case).order_by(Case.updated_at.desc())
    if status:
        q = q.where(Case.status == status)
    if current:
        q = q.where(Case.source.in_(cases_svc.active_sources()))
    if source:
        q = q.where(Case.source == source)
    return db.scalars(q).all()


# Declared before /cases/{case_id} so "kpis" is not parsed as a case id.
@router.get("/cases/kpis", response_model=KpiOut)
def case_kpis(db: Session = Depends(get_db)):
    """Pilot measures from ops req §10: detection volume, failed visits, time to pickup."""
    cases = db.scalars(select(Case)).all()
    by_status: dict[str, int] = {s.value: 0 for s in CaseStatus}
    for case in cases:
        if case.status in by_status:
            by_status[case.status] += 1
    open_cases = sum(1 for c in cases if c.status not in CLOSED_STATUSES)

    visits = db.scalars(select(Stop).where(Stop.outcome.is_not(None))).all()
    not_found = sum(1 for s in visits if s.outcome == Outcome.not_found)

    events = db.scalars(select(CaseEvent).order_by(CaseEvent.case_id, CaseEvent.id)).all()
    durations: list[float] = []
    per_case: dict[int, list[CaseEvent]] = {}
    for ev in events:
        per_case.setdefault(ev.case_id, []).append(ev)
    for entries in per_case.values():
        eligible_at = _first_time(entries, CaseStatus.eligible)
        if eligible_at is None:
            continue
        picked_at = _first_time(entries, CaseStatus.picked_up, after=eligible_at)
        if picked_at is not None:
            durations.append((picked_at - eligible_at).total_seconds() / 60)

    return KpiOut(
        by_status=by_status,
        open_cases=open_cases,
        visits_completed=len(visits),
        not_found_visits=not_found,
        not_found_rate=(not_found / len(visits)) if visits else None,
        picked_up_total=by_status[CaseStatus.picked_up.value],
        median_eligible_to_pickup_min=round(median(durations), 1) if durations else None,
    )


@router.get("/cases/{case_id}", response_model=CaseDetail)
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = db.scalar(select(Case).where(Case.id == case_id).options(selectinload(Case.timeline)))
    if not case:
        raise HTTPException(404)
    return case


@router.post("/cases/field", response_model=CaseOut, status_code=201)
def report_field_case(body: FieldCaseIn, db: Session = Depends(get_db)):
    """Operator-found bicycle: new case, collection waits for reviewer approval."""
    case = Case(device_id=body.device_id, status=CaseStatus.uncertain, source="field",
                lat=body.lat, lng=body.lng, reason="reported in field; awaiting approval",
                field_confirmed=True, needs_approval=True)
    case.timeline.append(CaseEvent(kind="field_report", actor=body.actor, detail=body.model_dump()))
    db.add(case)
    db.commit()
    return case


@router.post("/cases/{case_id}/approve", response_model=CaseOut)
def approve_case(case_id: int, actor: str, db: Session = Depends(get_db)):
    case = db.get(Case, case_id) or _404()
    case.needs_approval = False
    case.status = CaseStatus.eligible
    case.timeline.append(CaseEvent(kind="approved", actor=actor))
    db.commit()
    missions.replan_all(db, f"bike {case.device_id[:8]} approved by {actor}")
    return case


@router.patch("/cases/{case_id}", response_model=CaseOut)
def correct_case(case_id: int, body: CaseCorrectionIn, db: Session = Depends(get_db)):
    """Correction/override. Previous values are kept in the timeline entry.

    Only fields the client actually sent are applied, so `{"blocked_reason": null}` unblocks
    a case while an omitted `blocked_reason` leaves it alone.
    """
    case = db.get(Case, case_id) or _404()
    sent = body.model_fields_set - {"actor", "reason"}
    changes = {k: getattr(body, k) for k in sent}
    before = {k: getattr(case, k) for k in changes}
    for k, v in changes.items():
        setattr(case, k, v)
    case.timeline.append(CaseEvent(kind="correction", actor=body.actor,
                                   detail={"reason": body.reason,
                                           "before": _jsonable(before),
                                           "after": _jsonable(changes)}))
    db.commit()
    if changes:
        missions.replan_all(db, f"bike {case.device_id[:8]} corrected: {body.reason}")
    return case


@router.get("/cases/{case_id}/export")
def export_case(case_id: int, actor: str | None = None, db: Session = Depends(get_db)):
    """Evidence record for the municipal enforcement process (ops req §8).

    It preserves what was observed and when, what was inferred, which rule was applied, what
    staff changed and what the operator found. It is evidence, not a penalty decision.
    Passing `actor` records the export itself in the case timeline.
    """
    case = get_case(case_id, db)
    detail = CaseDetail.model_validate(case).model_dump(mode="json")
    timeline = detail["timeline"]

    reference = _reference_time(case)
    rest_since = _aware(case.rest_since)
    minutes = counted = None
    if rest_since and reference:
        minutes = round((reference - rest_since).total_seconds() / 60, 1)
        counted = round(cases_svc.rules(case.source).counted_minutes(rest_since, reference), 1)

    record = {
        "export_version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "exported_by": actor,
        "case": {k: v for k, v in detail.items() if k != "timeline"},
        "rule_applied": {
            "source": "docs/operations_requirements.md §4",
            "abandon_minutes": settings.abandon_minutes,
            "comparison": "strictly greater than",
            "enforcement_window": (f"{settings.enforce_from_hour:02d}:00–{settings.enforce_until_hour:02d}:00 {settings.enforce_tz}"
                                   if settings.enforce_window else "off: the clock runs 24 h"),
            "station_area_buffer_m": settings.buffer_m,
            "boundary_counts_as_inside": True,
            "metric_crs": settings.metric_crs,
            "move_tolerance_m": settings.move_tolerance_m,
            "fresh_max_age_min": settings.fresh_max_age_min,
            "require_fresh_observation": cases_svc.rules(case.source).require_fresh_observation,
            "default_location_error_m": settings.default_location_error_m,
        },
        "inferred": {
            "status": case.status,
            "reason": case.reason,
            "distance_outside_m": case.distance_outside_m,
            "rest_since": case.rest_since.isoformat() if case.rest_since else None,
            "last_observed_at": case.last_observed_at.isoformat() if case.last_observed_at else None,
            "reference_time": reference.isoformat() if reference else None,
            "minutes_at_rest": minutes,
            "counted_minutes": counted,
            "exceeds_threshold": (counted > settings.abandon_minutes) if counted is not None else None,
            "field_confirmed": case.field_confirmed,
            "needs_approval": case.needs_approval,
            "blocked_reason": case.blocked_reason,
        },
        "observations": [e for e in timeline
                         if e["kind"] not in STAFF_EVENT_KINDS | FIELD_EVENT_KINDS],
        "staff_actions": [e for e in timeline if e["kind"] in STAFF_EVENT_KINDS],
        "field_outcomes": [e for e in timeline if e["kind"] in FIELD_EVENT_KINDS],
        "timeline": timeline,
    }

    if actor:
        # Appended after the record is built, so an export never contains itself.
        case.timeline.append(CaseEvent(kind="export", actor=actor, detail={"export_version": 1}))
        db.commit()
    return record


def _first_time(entries: list[CaseEvent], status: CaseStatus,
                after: datetime | None = None) -> datetime | None:
    """First moment a case reached `status`, using event time and falling back to arrival time."""
    for ev in entries:
        if _status_of(ev) != status:
            continue
        when = _aware(ev.event_time or ev.recorded_at)
        if when is None or (after is not None and when < after):
            continue
        return when
    return None


def _aware(value: datetime | None) -> datetime | None:
    """Tests may run on a backend that hands back naive timestamps; they are UTC by contract."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _status_of(ev: CaseEvent) -> str | None:
    """Read the new status out of a timeline entry.

    T-B4 appends an entry on every status change; both shapes the contract allows are
    accepted — `kind="status_change"` with `detail={"to": ...}`, or `kind` set to the status
    itself. A field outcome of `picked_up` also marks the case picked up.
    """
    detail = ev.detail or {}
    for key in ("to", "status", "new_status"):
        value = detail.get(key)
        if isinstance(value, str) and value in CaseStatus.__members__:
            return value
    if ev.kind in CaseStatus.__members__:
        return ev.kind
    if ev.kind == "field_outcome" and detail.get("outcome") == Outcome.picked_up:
        return CaseStatus.picked_up
    return None


def _reference_time(case: Case) -> datetime | None:
    """Latest moment the case has evidence for — the clock the duration is measured against."""
    times = [_aware(e.event_time) for e in case.timeline if e.event_time]
    return max(times) if times else _aware(case.updated_at)  # type: ignore[type-var]


def _jsonable(values: dict) -> dict:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in values.items()}


def _404():
    raise HTTPException(404)
