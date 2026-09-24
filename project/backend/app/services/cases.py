"""Case lifecycle: turn detector verdicts into persisted cases + timeline entries.

- verdict none/gone -> close the open case as `resolved` with the reason (new trip, provider pickup, ...)
- candidate/uncertain/supported/eligible -> create or update the device's open detector case;
  a CaseEvent is appended only when something changes (event_time = operational now)
- an assigned bike that stops being eligible returns a replan reason; the replan drops its stop
- cases awaiting approval or blocked (unsafe/inaccessible) keep their status
"""
from collections.abc import Callable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.detector import Result, Rules, Verdict, evaluate
from app.core.vehicle_state import VehicleState
from app.models import Case, CaseEvent

OPEN = ("candidate", "uncertain", "supported", "eligible", "assigned")
GONE_REASON = {
    "on_trip": "started a trip",
    "reserved": "was reserved",
    "removed": "was recovered by the provider",
    "elsewhere": "left the operating area",
}


def rules() -> Rules:
    return Rules(settings.abandon_minutes, settings.fresh_max_age_min,
                 settings.require_fresh_observation, settings.default_location_error_m)


def short(device_id: str) -> str:
    return device_id[:8]


def sync_all(db: Session, states: dict[str, VehicleState], distance_fn: Callable[[float, float], float],
             now: datetime, rules: Rules) -> list[str]:
    """Evaluate every relevant bike; return replan reasons (empty = routes unaffected)."""
    open_cases = {c.device_id: c for c in db.scalars(
        select(Case).where(Case.status.in_(OPEN), Case.source == "detector"))}
    # a pickup / field "not found" closes that parking interval for good, even though the
    # historical feed still shows the bike parked there
    closed = set(db.execute(select(Case.device_id, Case.rest_since).where(Case.status.in_(("picked_up", "resolved")))))
    reasons = []
    for state in states.values():
        case = open_cases.get(state.device_id)
        if case is None and (not state.at_rest or (state.device_id, state.rest_since) in closed):
            continue
        result = evaluate(state, distance_fn, now, rules, field_confirmed=bool(case and case.field_confirmed))
        if reason := _apply(db, case, state, result, now):
            reasons.append(reason)
    return sorted(reasons, key=lambda r: "removed" not in r)  # removals first: they matter most to the operator


def _apply(db: Session, case: Case | None, state: VehicleState, result: Result, now: datetime) -> str | None:
    bike = short(state.device_id)

    if result.verdict in (Verdict.none, Verdict.gone):
        if case is None:
            return None
        why = "is back inside a station area" if result.verdict == Verdict.none else \
            GONE_REASON.get(state.state, f"changed state to {state.state}")
        was_assigned = case.status == "assigned"
        set_status(db, case, "resolved", f"bike {why}", now)
        if was_assigned:  # the replan drops its stop and bumps the route version
            return f"bike {bike} {why} — stop removed"
        return None

    status = result.verdict.value
    if case is None:
        case = Case(device_id=state.device_id, status=status, source="detector", lat=state.lat, lng=state.lng,
                    rest_since=state.rest_since, distance_outside_m=result.distance_outside_m, reason=result.reason)
        db.add(case)
        db.add(CaseEvent(case=case, kind="status", actor="detector", event_time=now,
                         detail={"from": None, "to": status, "reason": result.reason}))
        return f"new eligible bike {bike}" if status == "eligible" else None

    if (case.lat, case.lng) != (state.lat, state.lng):  # state position only changes on a confirmed move
        db.add(CaseEvent(case=case, kind="moved", actor="detector", event_time=now,
                         detail={"from": [case.lat, case.lng], "to": [state.lat, state.lng]}))
        case.lat, case.lng, case.field_confirmed = state.lat, state.lng, False
    case.rest_since, case.distance_outside_m, case.reason = state.rest_since, result.distance_outside_m, result.reason

    if case.status == "assigned":
        if status == "eligible":
            return None
        set_status(db, case, status, result.reason, now)
        return f"bike {bike} no longer eligible ({status}) — stop removed"
    if case.needs_approval or case.status == status:
        return None
    set_status(db, case, status, result.reason, now)
    return f"new eligible bike {bike}" if status == "eligible" else None


def set_status(db: Session, case: Case, status: str, reason: str, now: datetime, actor: str = "detector") -> None:
    db.add(CaseEvent(case=case, kind="status", actor=actor, event_time=now,
                     detail={"from": case.status, "to": status, "reason": reason}))
    case.status, case.reason = status, reason
