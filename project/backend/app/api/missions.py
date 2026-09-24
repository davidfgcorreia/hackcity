from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import MissionOut, Outcome, PositionIn, ReplanIn
from app.services import missions as svc

router = APIRouter(tags=["missions"])


@router.get("/missions/current", response_model=MissionOut | None)
def current_mission(operator_id: str, db: Session = Depends(get_db)):
    """Field app polls this every few seconds; a new `version` means the route changed."""
    return svc.current_mission(db, operator_id)


@router.post("/missions/replan", response_model=MissionOut)
def replan(body: ReplanIn, db: Session = Depends(get_db)):
    """Creates the operator's mission on first call; start = the operator's current position."""
    reason = "Off route — new route calculated" if body.reason == "off_route" else "route requested by operator"
    return svc.replan(db, body.operator_id, body.lat, body.lng, reason=reason)


@router.post("/missions/{mission_id}/depot", response_model=MissionOut)
def depot_arrived(mission_id: int, body: PositionIn, db: Session = Depends(get_db)):
    """Van unloaded at the depot: capacity is free again, next trip is planned."""
    return svc.depot_arrived(db, mission_id, body.lat, body.lng)


@router.post("/stops/{stop_id}/outcome", response_model=MissionOut)
def record_outcome(
    stop_id: int,
    outcome: Outcome = Form(...),
    actor: str = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    device_id: str | None = Form(None),
    notes: str | None = Form(None),
    client_uuid: str | None = Form(None),  # offline retries are idempotent
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    if outcome == Outcome.picked_up and (photo is None or not device_id):
        raise HTTPException(422, "pickup requires bicycle ID and photo")
    return svc.record_outcome(db, stop_id, outcome, actor, lat, lng, device_id, notes, client_uuid, photo)
