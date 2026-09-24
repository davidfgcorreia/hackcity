from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Case, CaseEvent
from app.schemas import CaseCorrectionIn, CaseDetail, CaseOut, CaseStatus, FieldCaseIn

router = APIRouter(tags=["cases"])


@router.get("/cases", response_model=list[CaseOut])
def list_cases(status: CaseStatus | None = None, db: Session = Depends(get_db)):
    q = select(Case).order_by(Case.updated_at.desc())
    if status:
        q = q.where(Case.status == status)
    return db.scalars(q).all()


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
    # TODO(T-C3): trigger replan for active missions
    return case


@router.patch("/cases/{case_id}", response_model=CaseOut)
def correct_case(case_id: int, body: CaseCorrectionIn, db: Session = Depends(get_db)):
    """Correction/override. Previous values are kept in the timeline entry."""
    case = db.get(Case, case_id) or _404()
    changes = body.model_dump(exclude_none=True, exclude={"actor", "reason"})
    before = {k: getattr(case, k) for k in changes}
    for k, v in changes.items():
        setattr(case, k, v)
    case.timeline.append(CaseEvent(kind="correction", actor=body.actor,
                                   detail={"reason": body.reason, "before": before, "after": changes}))
    db.commit()
    return case


@router.get("/cases/{case_id}/export")
def export_case(case_id: int, db: Session = Depends(get_db)):
    """Evidence record for the municipal enforcement process. Format TO CONFIRM (T-E4)."""
    case = get_case(case_id, db)
    return CaseDetail.model_validate(case).model_dump(mode="json")


def _404():
    raise HTTPException(404)
