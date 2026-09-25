from fastapi import APIRouter

from app.schemas import LiveState
from app.services.live import engine

router = APIRouter(tags=["live (provider GBFS feed)"])


@router.get("/live", response_model=LiveState)
def state():
    return engine.state()


@router.get("/live/bikes")
def bikes():
    return {"bikes": engine.bike_positions(), "last_poll": engine.last_poll}


@router.post("/live/start", response_model=LiveState)
async def start():
    """Resume real-time detection (pauses the replay)."""
    return await engine.start()


@router.post("/live/pause", response_model=LiveState)
def pause():
    return engine.pause()


@router.post("/live/poll", response_model=LiveState)
def poll():
    """Poll the feed once now (debugging)."""
    engine.poll_once()
    return engine.state()
