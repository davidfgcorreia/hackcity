"""Dated GTFS plans.

2026: fetched from the TML plan index for every operator seen in the validations (+ CP), using
the plan active in the sample week. MobiCascais, CP and Carris Metropolitana area 41 keep full
schedules for trips that touch the study area; the other operators keep stops and routes only,
which is enough to place a card's validations outside Cascais on the map.
2025: the four local October 2025 plans (for the separate 2025 bundle), same trip filter.
"""
import hashlib
import zipfile
from datetime import datetime, timezone

import httpx

from analytics.config import BBOX, CACHE, FINAL, SAMPLE_WEEK, TML_PLANS_URL, bbox_sql
from analytics.db import logged, pg, point_geom, release, sql

FULL_SCHEDULE = {"HF16N", "N18KL", "LA77N"}  # MobiCascais, CP, Viação Alvorada (area 41)
STOPS_ONLY = {"IA2N9", "IA9T6", "BNA17", "YA15B", "A2L1N", "LTP61", "7NTB1"}

TABLES = {
    "stops": ["stop_id", "stop_name", "stop_lat", "stop_lon", "parent_station", "location_type"],
    "routes": ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color"],
    "trips": ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id", "pattern_id"],
    "stop_times": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "shape_dist_traveled"],
    "calendar_dates": ["service_id", "date", "exception_type"],
    "calendar": ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                 "start_date", "end_date"],
    "shapes": ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
}


def _download(plan: dict) -> tuple[str, dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / f"gtfs_{plan['agency_id']}_{plan['_id']}"
    zpath = dest.with_suffix(".zip")
    url = plan["operation_gtfs_normalized_url"] or plan["operation_gtfs_original_url"]
    if not zpath.exists():
        with httpx.stream("GET", url, timeout=300, follow_redirects=True) as r:
            r.raise_for_status()
            with open(zpath, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
    if not dest.exists():
        with zipfile.ZipFile(zpath) as z:
            z.extractall(dest)
    sha = hashlib.sha256(zpath.read_bytes()).hexdigest()
    return str(dest), {"plan_id": plan["_id"], "agency_id": plan["agency_id"], "agency_name": plan["agency_name"],
                       "active_from": plan["active_from"], "active_until": plan["active_until"], "url": url.split("?")[0],
                       "sha256": sha, "retrieved_at": datetime.now(timezone.utc).isoformat()}


def _find(folder: str, name: str):
    from pathlib import Path

    hits = list(Path(folder).rglob(f"{name}.txt"))
    return hits[0] if hits else None


def _load_plan(d, folder: str, plan_id: str, agency_id: str, year: int, full: bool) -> None:
    """Stage each GTFS file in DuckDB, keep the study-area subset, append to gtfs.* tables."""
    for name, cols in TABLES.items():
        f = _find(folder, name)
        if f is None or (not full and name not in ("stops", "routes")):
            continue
        d.execute(f"CREATE OR REPLACE TEMP TABLE g_{name} AS SELECT * FROM read_csv('{f}', all_varchar=true, header=true)")
        have = {r[0] for r in d.execute(f"DESCRIBE g_{name}").fetchall()}
        sel = ", ".join(c if c in have else f"NULL::VARCHAR AS {c}" for c in cols)
        d.execute(f"CREATE OR REPLACE TEMP TABLE s_{name} AS SELECT '{plan_id}' plan_id, '{agency_id}' agency_id_plan, {year} plan_year, {sel} FROM g_{name}")
    if full:
        # trips that call at least one stop inside the study area, with their whole stop sequence
        d.execute(f"""CREATE OR REPLACE TEMP TABLE keep_trips AS
            SELECT DISTINCT st.trip_id FROM s_stop_times st JOIN s_stops s USING (stop_id)
            WHERE {bbox_sql('CAST(s.stop_lat AS DOUBLE)', 'CAST(s.stop_lon AS DOUBLE)')}""")
        d.execute("DELETE FROM s_trips WHERE trip_id NOT IN (SELECT trip_id FROM keep_trips)")
        d.execute("DELETE FROM s_stop_times WHERE trip_id NOT IN (SELECT trip_id FROM keep_trips)")
        if "s_shapes" in {r[0] for r in d.execute("SHOW TABLES").fetchall()}:
            d.execute("DELETE FROM s_shapes WHERE shape_id NOT IN (SELECT shape_id FROM s_trips)")
        d.execute("DELETE FROM s_routes WHERE route_id NOT IN (SELECT route_id FROM s_trips)")
    for name in TABLES:
        if f"s_{name}" in {r[0] for r in d.execute("SHOW TABLES").fetchall()}:
            d.execute(f"INSERT INTO pg.gtfs.{name} SELECT * FROM s_{name}")
            d.execute(f"DROP TABLE s_{name}")
    release(d)


def run(d) -> None:
    with pg() as c:
        for name, cols in TABLES.items():
            c.execute(f"DROP TABLE IF EXISTS gtfs.{name} CASCADE")
            c.execute(f"CREATE TABLE gtfs.{name} (plan_id text, agency_id_plan text, plan_year int, "
                      + ", ".join(f"{col} text" for col in cols) + ")")
        c.execute("DROP TABLE IF EXISTS gtfs.plans; CREATE TABLE gtfs.plans (plan_id text, agency_id text, agency_name text,"
                  " plan_year int, active_from int, active_until int, scope text, source jsonb)")
    release(d)

    plans = httpx.get(TML_PLANS_URL, timeout=60).json()["data"]
    wanted = FULL_SCHEDULE | STOPS_ONLY
    active = [p for p in plans if p["agency_id"] in wanted
              and p["active_from"] <= SAMPLE_WEEK[1] and p["active_until"] >= SAMPLE_WEEK[0]]
    for p in active:
        full = p["agency_id"] in FULL_SCHEDULE
        with logged("gtfs", f"gtfs:{p['agency_id']}:{p['_id']}", "stop_times of trips touching study area" if full else "stops (+routes) for geolocation") as log:
            folder, meta = _download(p)
            _load_plan(d, folder, p["_id"], p["agency_id"], 2026, full)
            log["sources"] = [meta]
            with pg() as c:
                c.execute("INSERT INTO gtfs.plans VALUES (%s,%s,%s,2026,%s,%s,%s,%s)",
                          (p["_id"], p["agency_id"], p["agency_name"], p["active_from"], p["active_until"],
                           "full" if full else "stops_routes", __import__("json").dumps(meta)))
                table = "stop_times" if full else "stops"
                log["rows_kept"] = c.execute(f"SELECT count(*) FROM gtfs.{table} WHERE plan_id=%s", (p["_id"],)).fetchone()[0]

    for folder in sorted((FINAL / "operation-plans").iterdir()):
        if not folder.is_dir():
            continue
        agency = folder.name.split("_")[1]
        with logged("gtfs", f"gtfs:2025:{folder.name}", "stop_times of trips touching study area", [{"path": str(folder)}]) as log:
            _load_plan(d, str(folder), folder.name, agency, 2025, True)
            with pg() as c:
                c.execute("INSERT INTO gtfs.plans VALUES (%s,%s,NULL,2025,NULL,NULL,'full',%s)",
                          (folder.name, agency, __import__("json").dumps({"path": str(folder)})))
                log["rows_kept"] = c.execute("SELECT count(*) FROM gtfs.stop_times WHERE plan_id=%s", (folder.name,)).fetchone()[0]

    sql("""ALTER TABLE gtfs.stops ADD COLUMN lat double precision, ADD COLUMN lon double precision;
           UPDATE gtfs.stops SET lat = stop_lat::double precision, lon = stop_lon::double precision
             WHERE stop_lat ~ '^-?[0-9.]+$' AND stop_lon ~ '^-?[0-9.]+$';""")
    point_geom("gtfs.stops")
    sql("""CREATE INDEX ON gtfs.stops (agency_id_plan, stop_id); CREATE INDEX ON gtfs.stop_times (plan_id, trip_id);
           CREATE INDEX ON gtfs.stop_times (plan_id, stop_id); CREATE INDEX ON gtfs.trips (plan_id, trip_id)""")
    print(f"  bbox for trip filter: {BBOX}")
