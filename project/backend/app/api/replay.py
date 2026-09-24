from datetime import datetime

from fastapi import APIRouter

from app.schemas import ReplayState
from app.services.replay import engine

router = APIRouter(tags=["replay (demo mode)"])


@router.get("/replay", response_model=ReplayState)
def state():
    return engine.state()


@router.post("/replay/start", response_model=ReplayState)
def start(from_time: datetime | None = None, speed: float | None = None):
    return engine.start(from_time, speed)


@router.post("/replay/pause", response_model=ReplayState)
def pause():
    return engine.pause()


@router.post("/replay/step", response_model=ReplayState)
def step(minutes: float = 10):
    """Advance simulated time manually — handy for the scripted demo and debugging."""
    return engine.step(minutes)
