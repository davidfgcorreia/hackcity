"""Bicycle sample (already Cascais-only): stations, trips, provider events."""
import json

import pandas as pd

from analytics.config import DATA
from analytics.db import file_info, logged, point_geom, replace_table, sql


def run(d) -> None:
    src = DATA / "station_information.json"
    with logged("bike", "bike.stations", "all 157 (snapshot 11 Sep 2026)", file_info(src)) as log:
        st = json.loads(src.read_text())["data"]["stations"]
        df = pd.DataFrame([{"station_id": s["station_id"], "name": s["name"], "lat": float(s["lat"]),
                            "lon": float(s["lon"]), "area_geojson": json.dumps({"type": "MultiPolygon", **s["station_area"]})}
                           for s in st])
        d.register("stations_df", df)
        log["rows_kept"] = log["rows_read"] = replace_table(d, "bike.stations", "SELECT * FROM stations_df")
        point_geom("bike.stations")
        sql("""ALTER TABLE bike.stations ADD COLUMN area geometry(MultiPolygon, 4326)
                 GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(area_geojson), 4326)) STORED;
               CREATE INDEX ON bike.stations USING gist (area)""")

    src = DATA / "cartoes.xlsx"
    with logged("bike", "bike.trips", "nonempty rows; naive times assumed UTC (MDS)", file_info(src)) as log:
        df = pd.read_excel(src)
        log["rows_read"] = len(df)
        df = df.dropna(subset=["trip_id"]).drop_duplicates("trip_id")
        df.columns = [c.strip().lower().replace(" ", "_").replace("í", "i") for c in df.columns]
        for c in ("start_time", "end_time"):
            df[c] = pd.to_datetime(df[c]).dt.tz_localize("UTC")
        d.register("trips_df", df)
        log["rows_kept"] = replace_table(d, "bike.trips", """
            SELECT trip_id, device_id, trip_type, start_time, end_time, duration AS duration_s,
                   cleaned_distance AS distance_km, standard_cost AS standard_cost_cents,
                   actual_cost AS actual_cost_cents, start_latitude AS start_lat, start_longitude AS start_lon,
                   end_latitude AS end_lat, end_longitude AS end_lon
            FROM trips_df
            WHERE start_latitude BETWEEN 30 AND 45 AND end_latitude BETWEEN 30 AND 45""")
        sql("""ALTER TABLE bike.trips
                 ADD COLUMN start_geom geometry(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(start_lon,start_lat),4326)) STORED,
                 ADD COLUMN end_geom geometry(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(end_lon,end_lat),4326)) STORED;
               CREATE INDEX ON bike.trips USING gist (start_geom); CREATE INDEX ON bike.trips USING gist (end_geom)""")

    src = DATA / "viagens.xlsx"
    with logged("bike", "bike.events", "drop rows without time/state; naive times assumed UTC", file_info(src)) as log:
        df = pd.read_excel(src).rename(columns={"battery %": "battery"})
        log["rows_read"] = len(df)
        df = df.dropna(subset=["timestamp", "vehicle_state", "event_types"]).drop_duplicates("event_id")
        df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.tz_localize("UTC")
        df["event_types"] = df["event_types"].astype(str).str.strip("[]'\" ")
        d.register("events_df", df)
        log["rows_kept"] = replace_table(d, "bike.events", """
            SELECT CAST(event_id AS VARCHAR) event_id, CAST(device_id AS VARCHAR) device_id, vehicle_state,
                   event_types AS event_type, lat, lng AS lon, CAST(trip_ids AS VARCHAR) trip_id,
                   "timestamp" AS event_time, battery
            FROM events_df""")
        point_geom("bike.events")
        sql("CREATE INDEX ON bike.events (device_id, event_time)")
