from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Station
from app.schemas import StationOut

router = APIRouter(tags=["stations"])


@router.get("/stations", response_model=list[StationOut])
def list_stations(db: Session = Depends(get_db)):
    return db.scalars(select(Station)).all()
