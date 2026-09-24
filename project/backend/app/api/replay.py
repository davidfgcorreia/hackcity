from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.schemas import ReplayState
from app.services.replay import engine

router = APIRouter(tags=["replay (demo mode)"])


@router.get("/replay", response_model=ReplayState)
def state():
    return engine.state()


@router.post("/replay/start", response_model=ReplayState)
async def start(from_time: datetime | None = None, speed: float | None = None):
    """Start or resume. `from_time` jumps forward (history before it is folded); `speed` = sim s per real s."""
    try:
        return await engine.start(from_time, speed)
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/replay/pause", response_model=ReplayState)
def pause():
    return engine.pause()


@router.post("/replay/step", response_model=ReplayState)
async def step(minutes: float = 10):
    """Advance simulated time manually — handy for the scripted demo and debugging."""
    return await engine.step(minutes)


@router.post("/replay/reset", response_model=ReplayState)
def reset():
    """Demo only: deletes all cases and missions and rewinds the clock."""
    return engine.reset()
