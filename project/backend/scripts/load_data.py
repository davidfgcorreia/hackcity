"""Load stations + bicycle events from the read-only datasets mount. Idempotent.

    docker compose exec api python -m scripts.load_data
"""
import json
from pathlib import Path

import pandas as pd
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.db import SessionLocal, init_db
from app.models import Station, VehicleEvent

DATA = Path(settings.data_dir)


def load_stations(db) -> int:
    stations = json.loads((DATA / "station_information.json").read_text())["data"]["stations"]
    rows = [dict(id=s["station_id"], name=s["name"], lat=float(s["lat"]), lng=float(s["lon"]),
                 area=s["station_area"]) for s in stations]
    db.execute(insert(Station).values(rows).on_conflict_do_nothing())
    return len(rows)


def load_events(db) -> int:
    df = pd.read_excel(DATA / "viagens.xlsx").rename(columns={"battery %": "battery"})  # fraction 0-1
    df = df.dropna(subset=["timestamp", "vehicle_state", "event_types"])  # 2 known empty rows
    # naive timestamps -> explicit tz once, at ingestion (assumption documented in config)
    times = pd.to_datetime(df["timestamp"]).dt.tz_localize(settings.source_tz).dt.tz_convert("UTC")
    nan = lambda v: None if pd.isna(v) else v  # noqa: E731
    rows = [
        dict(id=str(r.event_id), device_id=str(r.device_id), state=r.vehicle_state,
             event_types=[t.strip(" '[]\"") for t in str(r.event_types).split(",")],
             lat=nan(r.lat), lng=nan(r.lng), trip_id=nan(r.trip_ids), event_time=t.to_pydatetime(),
             battery=nan(r.battery))
        for r, t in zip(df.itertuples(), times)
    ]
    for i in range(0, len(rows), 5000):
        db.execute(insert(VehicleEvent).values(rows[i : i + 5000]).on_conflict_do_nothing())
    return len(rows)


if __name__ == "__main__":
    init_db()
    with SessionLocal() as db:
        print("stations", load_stations(db))
        print("events", load_events(db))
        db.commit()
