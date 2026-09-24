from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import cases, missions, replay, stations
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Hackcity operations API", lifespan=lifespan)
for r in (stations.router, cases.router, missions.router, replay.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
