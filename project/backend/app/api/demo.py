from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import MissionOut
from app.services import demo

router = APIRouter(tags=["demo (presentation)"])


@router.post("/demo/mission", response_model=MissionOut)
def start_demo_mission(db: Session = Depends(get_db)):
    """Reset the presentation demo: 5 fixed bikes and operator "demo"'s mission from the depot."""
    return demo.reset_demo(db)
