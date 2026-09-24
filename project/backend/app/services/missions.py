"""Mission building on top of app.core.routing. Owner: workstream C (T-C1..T-C4)."""
from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Mission


def current_mission(db: Session, operator_id: str) -> Mission | None:
    return db.scalar(
        select(Mission)
        .where(Mission.operator_id == operator_id, Mission.status == "active")
        .options(selectinload(Mission.stops))
    )


def replan(db: Session, operator_id: str, lat: float, lng: float, reason: str) -> Mission:
    """TODO(T-C2): eligible, unblocked, approved cases -> core.routing.plan_mission from (lat,lng)
    -> rewrite planned stops (+ final depot stop), set case.status=assigned, bump version,
    set last_change = "<what changed>, <why>, next: <target>". Queued cases stay eligible."""
    raise HTTPException(501, "T-C2 replan not implemented")


def record_outcome(db: Session, stop_id, outcome, actor, lat, lng, device_id, notes, client_uuid,
                   photo: UploadFile | None) -> Mission:
    """TODO(T-C4): idempotent on client_uuid; save photo to settings.uploads_dir;
    stop -> done; case -> picked_up | resolved | blocked (unsafe/inaccessible/unable_to_load);
    CaseEvent(kind='field_outcome'); then replan from (lat,lng)."""
    raise HTTPException(501, "T-C4 record_outcome not implemented")
