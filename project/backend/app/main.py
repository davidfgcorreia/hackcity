from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import cases, live, missions, replay, stations
from app.config import settings
from app.db import init_db
from app.services.live import engine as live_engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if settings.live_enabled:
        await live_engine.start()
    yield
    live_engine.pause()


app = FastAPI(title="Hackcity operations API", lifespan=lifespan)
for r in (stations.router, cases.router, missions.router, live.router, replay.router):
    app.include_router(r, prefix="/api")
app.mount("/api/uploads", StaticFiles(directory=settings.uploads_dir, check_dir=False), name="uploads")


@app.get("/api/health")
def health():
    return {"ok": True}
