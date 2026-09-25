"""Analytics API for the /insights web page. Read-only over schema `derived` (+ metadata).

Only aggregates leave this service: no card hashes, device ids or individual journeys.
Every response carries `meta` (source, period, method notes) so the page can label each layer
as observed / inferred proxy / screening score, as the analytics requirements ask.
"""
import json
import threading
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import FastAPI, HTTPException

from analytics import bird_score, laya
from analytics.db import pg

app = FastAPI(title="Hackcity analytics API")

BIKE = "Bicycle trips/events, 19 Aug–8 Sep 2026 Lisbon time, plus 19 trips after midnight on 9 Sep (cartoes.xlsx, viagens.xlsx)"
TRANSIT = "Card validations and dated TML GTFS plans, 31 Aug–6 Sep 2026"


def rows(query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with pg(interactive=True) as c, c.cursor() as cur:
        cur.execute(query, params)
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def one(query: str, params: tuple = ()) -> dict[str, Any]:
    r = rows(query, params)
    return r[0] if r else {}


def features(query: str, params: tuple = ()) -> dict:
    """Query returning a `geometry` column (GeoJSON text) + properties -> FeatureCollection."""
    out = []
    for r in rows(query, params):
        geom = r.pop("geometry")
        out.append({"type": "Feature", "geometry": json.loads(geom) if geom else None, "properties": r})
    return {"type": "FeatureCollection", "features": out}


@app.get("/analytics/health")
def health():
    return {"ok": True}



def clock_text() -> str:
    """How the 120-minute clock counted in the current analysis tables, for method notes."""
    e = enforcement()
    if e.get("enabled") is False:
        return "in a row (24 h clock)"
    if e.get("enabled") is None:
        return "in a row (tables built before the enforcement window; rebuild with analytics.derive)"
    return f"counted only {e['from_hour']:02d}:00–{e['until_hour']:02d}:00 {e['tz']} (the clock pauses outside)"


@app.get("/analytics/enforcement")
def enforcement():
    """The abandonment clock the analysis tables were built with (not necessarily the current .env)."""
    if not one("SELECT to_regclass('derived.enforcement_setting') IS NOT NULL ok")["ok"]:
        return {"enabled": None, "note": "tables built before the enforcement window existed; run analytics.derive"}
    return one("SELECT enabled, from_hour, until_hour, tz, abandon_minutes, built_at FROM derived.enforcement_setting")

@app.get("/analytics/overview")
def overview():
    return {
        "b5": one("SELECT * FROM derived.b5_detector_validation"),
        "journeys": one("SELECT * FROM derived.journey_summary"),
        "bike": one("""SELECT (SELECT count(*) FROM bike.trips) trips,
                              (SELECT count(*) FROM derived.trip_endpoints WHERE kind='start') valid_trips,
                              (SELECT count(*) FROM bike.stations) stations,
                              (SELECT count(*) FROM derived.parking_intervals WHERE outside) outside_intervals,
                              (SELECT count(*) FROM derived.parking_intervals WHERE outside AND enforced_minutes > 120) supported_120,
                              (SELECT round(100.0 * count(*) FILTER (WHERE station_id IS NOT NULL) / count(*), 1)
                                 FROM derived.trip_endpoints WHERE kind='end') pct_ends_in_station_area,
                              (SELECT round(100.0 * count(*) FILTER (WHERE in_parking_zone) / count(*), 1)
                                 FROM derived.trip_endpoints WHERE kind='end') pct_ends_in_parking_zone"""),
        "candidates": one("SELECT count(*) screened, count(score) scored FROM derived.station_candidates"),
        "meta": {"sources": [BIKE, TRANSIT], "generated_from": "schema derived"},
    }


@app.get("/analytics/inventory")
def inventory():
    """Data inventory: every ingest step with rows read/kept and the filter applied."""
    return {
        "steps": rows("""SELECT DISTINCT ON (target) target, step, rows_read, rows_kept, filter, sources, finished_at
                         FROM meta.ingest_log WHERE step <> 'derive' ORDER BY target, finished_at DESC"""),
        "coverage": rows("SELECT * FROM derived.coverage ORDER BY validations DESC"),
    }


@app.get("/analytics/recovery")
def recovery():
    return {
        "cells": features("""SELECT ST_AsGeoJSON(geom, 6) geometry, cell_id, trip_ends, outside_intervals, supported_120,
                                    supported_with_evidence, outside_per_100_trip_ends, median_hours_parked,
                                    provider_recoveries, median_hours_to_provider_recovery, insufficient
                             FROM derived.recovery_by_cell WHERE outside_intervals > 0 OR trip_ends >= 5"""),
        "b5": one("SELECT * FROM derived.b5_detector_validation"),
        "by_end_reason": rows("""SELECT end_reason, count(*) n, round(avg(minutes)) avg_minutes,
                                        count(*) FILTER (WHERE enforced_minutes > 120) over_120
                                 FROM derived.parking_intervals WHERE outside GROUP BY 1 ORDER BY 2 DESC"""),
        "meta": {"source": BIKE, "kind": "observed",
                 "notes": ["Outside = beyond station area + 30 m (EPSG:3763).",
                           "Supported = parked strictly more than 120 min.",
                           "Cells with fewer than 5 outside intervals are marked insufficient."]},
    }


@app.get("/analytics/map/cells")
def map_cells(size: int = 250):
    """Aggregate underlying 250 m counts; never average already-calculated rates."""
    if size not in (250, 500, 1000, 0):
        raise HTTPException(400, "size must be 250, 500, 1000 or 0 (all Cascais)")
    key = "'Cascais'" if size == 0 else \
        "(floor(ST_X(ST_Centroid(g.geom_m)) / %(size)s)::int || '_' || floor(ST_Y(ST_Centroid(g.geom_m)) / %(size)s)::int)"
    sql = f"""WITH grouped AS (
      SELECT {key} area_id, ST_Transform(g.geom_m, 3763) geom_m,
             r.trip_ends, r.outside_intervals, r.supported_120, r.supported_with_evidence,
             r.provider_recoveries
      FROM derived.recovery_by_cell r JOIN derived.grid_250 g USING (cell_id)
    ), totals AS (
      SELECT area_id, ST_UnaryUnion(ST_Collect(geom_m)) geom_m,
             sum(trip_ends) trip_ends, sum(outside_intervals) outside_intervals,
             sum(supported_120) supported_120, sum(supported_with_evidence) supported_with_evidence,
             sum(provider_recoveries) provider_recoveries
      FROM grouped GROUP BY area_id
    )
    SELECT ST_AsGeoJSON(ST_Transform(geom_m, 4326), 6) geometry, area_id,
           trip_ends, outside_intervals, supported_120, supported_with_evidence, provider_recoveries,
           round(100.0 * outside_intervals / nullif(trip_ends, 0), 1) outside_per_100_trip_ends,
           outside_intervals < 5 insufficient
    FROM totals"""
    return {"cells": features(sql, {"size": size} if size else {}),
            "meta": {"source": BIKE, "period": "19 Aug–8 Sep 2026 (Lisbon time)", "unit_m": size or "municipality",
                     "kind": "observed aggregate", "notes": ["Rates use summed counts; <5 outside intervals is insufficient."]}}


@app.get("/analytics/map/routes")
def map_routes(day: date | None = None, hour: int | None = None):
    """Representative dated GTFS shapes, not live vehicle tracks."""
    if hour is not None and not 0 <= hour <= 23:
        raise HTTPException(400, "hour must be 0–23")
    schedule_day = day or date(2026, 9, 2)
    weekday = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[schedule_day.weekday()]
    routes = features("""WITH popular AS (
      SELECT t.plan_id, p.agency_id, t.route_id, t.shape_id, r.route_short_name, r.route_type,
             count(*) services,
             row_number() OVER (PARTITION BY t.plan_id, t.route_id ORDER BY count(*) DESC) choice
      FROM gtfs.trips t JOIN gtfs.routes r ON r.plan_id=t.plan_id AND r.route_id=t.route_id
      JOIN gtfs.plans p ON p.plan_id=t.plan_id
      WHERE p.plan_year=2026 AND p.agency_id IN ('HF16N', 'N18KL', 'LA77N')
        AND r.route_type IN ('2', '3') AND t.shape_id IS NOT NULL
      GROUP BY 1,2,3,4,5,6
    ), chosen AS (
      SELECT * FROM (SELECT popular.*, row_number() OVER (PARTITION BY agency_id ORDER BY services DESC) agency_rank
                     FROM popular WHERE choice=1) r
      WHERE (agency_id='HF16N' AND agency_rank<=50)
         OR (agency_id='N18KL' AND agency_rank<=15)
         OR (agency_id='LA77N' AND agency_rank<=60)
    ), lines AS (
      SELECT c.route_id, c.route_short_name, c.route_type, c.services,
             ST_MakeLine(ST_SetSRID(ST_MakePoint(s.shape_pt_lon::float, s.shape_pt_lat::float), 4326)
                         ORDER BY s.shape_pt_sequence::int) geom
      FROM chosen c JOIN gtfs.shapes s ON s.plan_id=c.plan_id AND s.shape_id=c.shape_id
      GROUP BY 1,2,3,4
    )
    SELECT ST_AsGeoJSON(ST_Simplify(geom, 0.00007), 6) geometry, route_id,
           route_short_name, route_type, services FROM lines
    WHERE ST_Intersects(geom, ST_MakeEnvelope(-9.50,38.665,-9.295,38.78,4326))""")
    frequency = rows(f"""SELECT r.route_short_name, count(*) departures
      FROM gtfs.trips t JOIN gtfs.plans p ON p.plan_id=t.plan_id
      JOIN gtfs.routes r ON r.plan_id=t.plan_id AND r.route_id=t.route_id
      JOIN gtfs.stop_times st ON st.plan_id=t.plan_id AND st.trip_id=t.trip_id AND st.stop_sequence='1'
      WHERE p.plan_year=2026 AND p.agency_id IN ('HF16N','N18KL','LA77N')
        AND (EXISTS (SELECT 1 FROM gtfs.calendar c WHERE c.plan_id=t.plan_id AND c.service_id=t.service_id
                     AND %s BETWEEN c.start_date AND c.end_date AND c.{weekday}='1')
             OR EXISTS (SELECT 1 FROM gtfs.calendar_dates cd WHERE cd.plan_id=t.plan_id AND cd.service_id=t.service_id
                        AND cd.date=%s AND cd.exception_type='1'))
        AND NOT EXISTS (SELECT 1 FROM gtfs.calendar_dates cd WHERE cd.plan_id=t.plan_id AND cd.service_id=t.service_id
                        AND cd.date=%s AND cd.exception_type='2')
        AND (%s::int IS NULL OR split_part(st.departure_time,':',1)::int %% 24=%s)
      GROUP BY 1""", (schedule_day.strftime("%Y%m%d"),) * 3 + (hour, hour))
    by_name = {r["route_short_name"]: r["departures"] for r in frequency}
    for f in routes["features"]:
        f["properties"]["scheduled_departures"] = by_name.get(f["properties"]["route_short_name"], 0)
    return {"routes": routes,
            "meta": {"source": "Dated 2026 GTFS plans", "kind": "scheduled route geometry",
                     "schedule_day": str(schedule_day),
                     "notes": ["Representative shape per route; animated vehicles are illustrative, not live positions."]}}


@app.get("/analytics/map/station-areas")
def map_station_areas():
    return {"areas": features("""SELECT ST_AsGeoJSON(area, 6) geometry,
                                        ST_AsGeoJSON(ST_Transform(ST_Buffer(ST_Transform(area, 3763), 30), 4326), 6) buffer_geometry,
                                        station_id, name
                                 FROM bike.stations"""),
            "meta": {"source": "Supplied station_information snapshot, 11 Sep 2026",
                     "kind": "station polygons", "notes": ["Parking eligibility uses each polygon plus 30 metres in EPSG:3763."]}}


@app.get("/analytics/map/station-flows")
def map_station_flows(day: date | None = None, hour: int | None = None):
    if hour is not None and not 0 <= hour <= 23:
        raise HTTPException(400, "hour must be 0–23")
    return {"stations": features("""SELECT ST_AsGeoJSON(s.geom,6) geometry,s.station_id,s.name,
      count(e.trip_id) FILTER (WHERE e.kind='start') departures,
      count(e.trip_id) FILTER (WHERE e.kind='end') arrivals
      FROM bike.stations s LEFT JOIN derived.trip_endpoints e ON e.station_id=s.station_id
        AND (%(day)s::date IS NULL OR e.date_local=%(day)s::date)
        AND (%(hour)s::int IS NULL OR e.hour_local=%(hour)s::int)
      GROUP BY s.station_id,s.name,s.geom""", {"day": day, "hour": hour}),
      "meta": {"source": BIKE, "kind": "observed station trip flow", "notes": [
          "Trip assignment uses the station polygon, not its 30 m parking buffer."]}}


@app.get("/analytics/map/stops")
def map_stops(day: date | None = None, hour: int | None = None):
    if hour is not None and not 0 <= hour <= 23:
        raise HTTPException(400, "hour must be 0–23")
    params = {"day": day, "hour": hour,
              "label": "saturday" if day and day.weekday() >= 5 else "weekday"}
    return {"stops": features("""WITH frequency AS (
      SELECT agency_id,stop_id,
        CASE WHEN %(hour)s::int IS NULL
          THEN sum(departures) FILTER (WHERE hour_local BETWEEN 7 AND 19) / 13.0
          ELSE sum(departures) FILTER (WHERE hour_local=%(hour)s::int) END departures
      FROM derived.stop_frequency WHERE day_label=%(label)s
      GROUP BY 1,2
    ), boardings AS (
      SELECT agency_id,stop_id,count(*) boardings,count(DISTINCT card_hash) cards
      FROM transit26.validations v WHERE v.in_cascais AND v.event_type IN (1,13)
        AND (%(day)s::date IS NULL OR (v.event_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
        AND (%(hour)s::int IS NULL OR extract(hour FROM v.event_time AT TIME ZONE 'Europe/Lisbon')::int=%(hour)s::int)
      GROUP BY 1,2
    )
    SELECT ST_AsGeoJSON(s.geom,6) geometry,s.agency_id,a.agency_name,s.stop_id,s.stop_name,
      s.max_routes_in_an_hour,coalesce(f.departures,0) departures_per_hour,
      CASE WHEN b.cards>=5 THEN b.boardings ELSE NULL END weekly_boardings
    FROM derived.stop_service s LEFT JOIN ref.agencies a ON a.agency_id=s.agency_id
    LEFT JOIN frequency f ON f.agency_id=s.agency_id AND f.stop_id=s.stop_id
    LEFT JOIN boardings b ON b.agency_id=s.agency_id AND b.stop_id=s.stop_id
    WHERE ST_Intersects(s.geom,ST_MakeEnvelope(-9.50,38.665,-9.295,38.78,4326))""", params),
      "meta": {"source": TRANSIT, "kind": "scheduled departures and observed boardings", "notes": [
          "Frequency uses representative dated weekday/Saturday plans.",
          "Boardings with fewer than five distinct cards are suppressed."]}}


CANDIDATE_WEIGHTS = [
            {"component": "Observed bicycle demand", "weight": 0.35, "status": "measured", "input": "valid trip starts + ends in cell"},
            {"component": "Outside-station parking", "weight": 0.25, "status": "measured", "input": "intervals > 120 counted minutes (see /analytics/enforcement) outside station + 30 m"},
            {"component": "Complete-journey improvement", "weight": 0.20, "status": "unavailable", "input": "needs walk/cycle network"},
            {"component": "Transport-coverage gap", "weight": 0.10, "status": "estimate", "input": "scheduled departures/h within 333 m straight line"},
            {"component": "Population / equity", "weight": 0.05, "status": "unavailable", "input": "INE census not ingested"},
            {"component": "Bus delay", "weight": 0.05, "status": "missing (neutral 0.5)", "input": "no validated stop-level delay"},
]


@app.get("/analytics/candidates")
def candidates():
    return {
        "cells": features("""SELECT ST_AsGeoJSON(geom, 6) geometry, cell_id, rank, score, trip_endpoints, trip_starts,
                                    trip_ends, outside_intervals, supported_120, departures_per_hour_333m,
                                    round(nearest_station_m::numeric) nearest_station_m, operators_333m,
                                    round(demand_n::numeric, 3) demand_n, round(parking_n::numeric, 3) parking_n,
                                    round(transport_gap_n::numeric, 3) transport_gap_n, bus_delay_n,
                                    score_without_demand, score_without_parking, score_without_transport_gap,
                                    score_without_bus_delay, weight_available, insufficient,
                                    ST_Y(centroid) lat, ST_X(centroid) lon
                             FROM derived.station_candidates ORDER BY rank NULLS LAST"""),
        "weights": CANDIDATE_WEIGHTS,
        "meta": {"kind": "screening score (provisional weights, not approved)",
                 "notes": ["Candidates: 250 m cells whose centre is > 150 m from every station area.",
                           "Components are percentile ranks within the candidate set; unavailable components are excluded, "
                           "not zero, and the score is renormalised over the available 75 % of weight.",
                           "Score suppressed when fewer than 5 outside-station intervals contribute.",
                           "Candidate areas, not installation sites: legal/safety feasibility is an unchecked gate."]},
    }


def map_filters(size: int, day: date | None, hour: int | None) -> dict:
    if size < 50 or size > 1000 or size % 50:
        raise HTTPException(400, "size must be 50–1000 m in 50 m steps")
    if hour is not None and not 0 <= hour <= 23:
        raise HTTPException(400, "hour must be 0–23")
    return {"size": size, "day": day, "hour": hour}


@app.get("/analytics/map/analysis-cells")
def analysis_cells(size: int = 250, day: date | None = None, hour: int | None = None):
    """Build a metric grid from underlying points, including 50 m detail."""
    p = map_filters(size, day, hour)
    sql = """WITH events AS (
      SELECT floor(ST_X(pt_m) / %(size)s)::int i, floor(ST_Y(pt_m) / %(size)s)::int j,
             count(*) FILTER (WHERE kind='end') trip_ends,
             count(*) FILTER (WHERE kind='start') trip_starts,
             0::bigint outside_intervals, 0::bigint supported_120, 0::bigint provider_recoveries
      FROM derived.trip_endpoints
      WHERE (%(day)s::date IS NULL OR date_local=%(day)s::date)
        AND (%(hour)s::int IS NULL OR hour_local=%(hour)s::int)
      GROUP BY 1,2
      UNION ALL
      SELECT floor(ST_X(pt_m) / %(size)s)::int, floor(ST_Y(pt_m) / %(size)s)::int,
             0,0, count(*), count(*) FILTER (WHERE enforced_minutes > 120),
             count(*) FILTER (WHERE end_reason='provider_recovery')
      FROM derived.parking_intervals WHERE outside
        AND (%(day)s::date IS NULL OR (start_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
        AND (%(hour)s::int IS NULL OR extract(hour FROM start_time AT TIME ZONE 'Europe/Lisbon')::int=%(hour)s::int)
      GROUP BY 1,2
    ), totals AS (
      SELECT i,j,sum(trip_ends) trip_ends,sum(trip_starts) trip_starts,
        sum(outside_intervals) outside_intervals,sum(supported_120) supported_120,
        sum(provider_recoveries) provider_recoveries FROM events GROUP BY 1,2
    )
    SELECT ST_AsGeoJSON(ST_Transform(ST_MakeEnvelope(i*%(size)s,j*%(size)s,(i+1)*%(size)s,(j+1)*%(size)s,3763),4326),6) geometry,
      i::text || '_' || j::text area_id, trip_ends,trip_starts,outside_intervals,supported_120,
      provider_recoveries, round(100.0*outside_intervals/nullif(trip_ends,0),1) outside_per_100_trip_ends,
      outside_intervals < 5 insufficient
    FROM totals WHERE trip_ends+trip_starts+outside_intervals > 0"""
    return {"cells": features(sql, p), "meta": {"source": BIKE, "size_m": size,
            "kind": "observed aggregate", "notes": ["Dates and hours use Europe/Lisbon; sparse parking evidence is marked insufficient."]}}


@app.get("/analytics/map/analysis-candidates")
def analysis_candidates(size: int = 250, day: date | None = None, hour: int | None = None):
    p = map_filters(size, day, hour)
    sql = """WITH ep AS (
      SELECT floor(ST_X(pt_m)/%(size)s)::int i, floor(ST_Y(pt_m)/%(size)s)::int j,
        count(*) trip_endpoints, count(*) FILTER (WHERE kind='start') trip_starts,
        count(*) FILTER (WHERE kind='end') trip_ends
      FROM derived.trip_endpoints WHERE (%(day)s::date IS NULL OR date_local=%(day)s::date)
        AND (%(hour)s::int IS NULL OR hour_local=%(hour)s::int) GROUP BY 1,2
    ), park AS (
      SELECT floor(ST_X(pt_m)/%(size)s)::int i, floor(ST_Y(pt_m)/%(size)s)::int j,
        count(*) outside_intervals, count(*) FILTER (WHERE enforced_minutes>120) supported_120
      FROM derived.parking_intervals WHERE outside
        AND (%(day)s::date IS NULL OR (start_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
        AND (%(hour)s::int IS NULL OR extract(hour FROM start_time AT TIME ZONE 'Europe/Lisbon')::int=%(hour)s::int)
      GROUP BY 1,2
    ), cells AS (
      SELECT coalesce(e.i,p.i) i,coalesce(e.j,p.j) j,
        coalesce(e.trip_endpoints,0) trip_endpoints,coalesce(e.trip_starts,0) trip_starts,
        coalesce(e.trip_ends,0) trip_ends,coalesce(p.outside_intervals,0) outside_intervals,
        coalesce(p.supported_120,0) supported_120
      FROM ep e FULL JOIN park p USING(i,j)
    ), stop_rate AS MATERIALIZED (
      SELECT agency_id, stop_id, sum(departures) / CASE WHEN %(hour)s::int IS NULL THEN 13.0 ELSE 1.0 END departures
      FROM derived.stop_frequency
      WHERE day_label=CASE WHEN %(day)s::date IS NOT NULL AND extract(isodow FROM %(day)s::date)>=6 THEN 'saturday' ELSE 'weekday' END
        AND (CASE WHEN %(hour)s::int IS NULL THEN hour_local BETWEEN 7 AND 19 ELSE hour_local=%(hour)s::int END)
      GROUP BY 1,2
    ), centred AS MATERIALIZED (
      SELECT c.*, ST_SetSRID(ST_MakePoint((i+0.5)*%(size)s,(j+0.5)*%(size)s),3763) centre FROM cells c
    ), nearby_service AS (
      SELECT c.i, c.j, sum(r.departures) departures, string_agg(DISTINCT l.agency_id, ',') operators
      FROM centred c JOIN derived.stop_locations l ON ST_DWithin(l.geom_m,c.centre,333)
      JOIN stop_rate r USING(agency_id,stop_id) GROUP BY 1,2
    ), raw AS MATERIALIZED (
      SELECT c.*,
        (SELECT min(ST_Distance(s.area_m,c.centre)) FROM derived.stations_m s) nearest_station_m,
        coalesce(n.departures,0) departures_per_hour_333m, n.operators operators_333m
      FROM centred c LEFT JOIN nearby_service n USING(i,j)
    ), scored AS (
      SELECT *,percent_rank() OVER (ORDER BY trip_endpoints) demand_n,
        percent_rank() OVER (ORDER BY supported_120) parking_n,
        1-least(1,departures_per_hour_333m/6.0) transport_gap_n
      FROM raw WHERE nearest_station_m>150
    ), ranked AS (
      SELECT *,CASE WHEN outside_intervals>=5 THEN
        round(((0.35*demand_n+0.25*parking_n+0.10*transport_gap_n+0.05*0.5)/0.75)::numeric,3)
        END score,
        CASE WHEN outside_intervals>=5 THEN round(((0.25*parking_n+0.10*transport_gap_n+0.05*0.5)/0.40)::numeric,3) END score_without_demand,
        CASE WHEN outside_intervals>=5 THEN round(((0.35*demand_n+0.10*transport_gap_n+0.05*0.5)/0.50)::numeric,3) END score_without_parking,
        CASE WHEN outside_intervals>=5 THEN round(((0.35*demand_n+0.25*parking_n+0.05*0.5)/0.65)::numeric,3) END score_without_transport_gap,
        CASE WHEN outside_intervals>=5 THEN round(((0.35*demand_n+0.25*parking_n+0.10*transport_gap_n)/0.70)::numeric,3) END score_without_bus_delay
      FROM scored
    )
    SELECT ST_AsGeoJSON(ST_Transform(ST_MakeEnvelope(i*%(size)s,j*%(size)s,(i+1)*%(size)s,(j+1)*%(size)s,3763),4326),6) geometry,
      i::text || '_' || j::text cell_id,trip_endpoints,trip_starts,trip_ends,outside_intervals,supported_120,
      round(nearest_station_m::numeric) nearest_station_m,round(departures_per_hour_333m::numeric,1) departures_per_hour_333m,
      round(demand_n::numeric,3) demand_n,round(parking_n::numeric,3) parking_n,
      round(transport_gap_n::numeric,3) transport_gap_n,0.5 bus_delay_n,score,
      score_without_demand,score_without_parking,score_without_transport_gap,score_without_bus_delay,
      0.75 weight_available,operators_333m,
      CASE WHEN score IS NOT NULL THEN rank() OVER (ORDER BY score DESC NULLS LAST) END rank,
      outside_intervals<5 insufficient,
      ST_Y(ST_Transform(centre,4326)) lat,ST_X(ST_Transform(centre,4326)) lon
    FROM ranked"""
    return {"cells": features(sql, p), "weights": CANDIDATE_WEIGHTS,
            "meta": {"kind": "provisional screening score", "size_m": size,
            "notes": ["Only observed bike activity is ranked; less than five outside intervals withholds a score.",
                      "The display-only parking age filter does not alter the fixed >120 min score input."]}}


@app.get("/analytics/map/people")
def map_people(size: int = 250, day: date | None = None, hour: int | None = None):
    p = map_filters(size, day, hour)
    return {"cells": features("""WITH grouped AS (
        SELECT floor(ST_X(l.geom_m)/%(size)s)::int i,floor(ST_Y(l.geom_m)/%(size)s)::int j,
          count(*) boardings,count(DISTINCT v.card_hash) cards
        FROM transit26.validations v JOIN derived.stop_locations l USING(agency_id,stop_id)
        WHERE v.in_cascais AND v.event_type IN (1,13)
          AND (%(day)s::date IS NULL OR (v.event_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
          AND (%(hour)s::int IS NULL OR extract(hour FROM v.event_time AT TIME ZONE 'Europe/Lisbon')::int=%(hour)s::int)
        GROUP BY 1,2
      ) SELECT ST_AsGeoJSON(ST_Transform(ST_MakeEnvelope(i*%(size)s,j*%(size)s,(i+1)*%(size)s,(j+1)*%(size)s,3763),4326),6) geometry,
        i::text || '_' || j::text area_id,boardings,cards FROM grouped WHERE cards>=5""", p),
        "meta": {"source": TRANSIT, "kind": "observed boarding hotspot", "notes": [
            "Card validations indicate boardings, not distinct people present or vehicle occupancy.",
            "Groups below five distinct cards are suppressed; CP rail has no validations in this delivery."]}}


@app.get("/analytics/map/journey-context")
def journey_context(size: int, area_id: str):
    map_filters(size, None, None)
    i, j = area_indices(area_id)
    centre = (i + 0.5) * size, (j + 0.5) * size
    return {"flows": rows("""SELECT origin_municipality,dest_municipality,journeys,cards,
       with_transfer,observed_destinations
       FROM derived.od_flows
       WHERE ST_DWithin(ST_Transform(origin_pt,3763),ST_SetSRID(ST_MakePoint(%s,%s),3763),750)
          OR ST_DWithin(ST_Transform(dest_pt,3763),ST_SetSRID(ST_MakePoint(%s,%s),3763),750)
       ORDER BY journeys DESC LIMIT 12""", (centre[0], centre[1], centre[0], centre[1])),
      "meta": {"kind": "inferred journey context", "notes": [
          "Flows use 1 km origin/destination zones and can cross the selected finer square.",
          "Groups below five distinct cards are suppressed; no CP rail validations in the supplied sample."]}}


@app.get("/analytics/map/scheduled-vehicles")
def scheduled_vehicles(day: date = date(2026, 9, 2), hour: int = 12, minute: int = 0):
    """Position a scheduled trip between its surrounding timed stops, including stop dwell."""
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise HTTPException(400, "invalid local time")
    weekday = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[day.weekday()]
    params = {"day": day.strftime("%Y%m%d"), "seconds": hour * 3600 + minute * 60}
    return {"vehicles": features(f"""WITH positioned AS (
      SELECT DISTINCT ON (s.plan_id,s.trip_id) s.*,
        greatest(0,least(1,(
          s.dist + coalesce(s.next_dist-s.dist,0) * CASE
            WHEN %(seconds)s<=s.departure_s OR s.next_arrival_s IS NULL OR s.next_arrival_s<=s.departure_s THEN 0
            ELSE greatest(0,least(1,(%(seconds)s-s.departure_s)::float/(s.next_arrival_s-s.departure_s))) END
          -s.min_dist)/nullif(s.max_dist-s.min_dist,0))) fraction
      FROM derived.scheduled_segments s
      WHERE int4range(s.arrival_s,coalesce(s.next_arrival_s,s.departure_s),'[]') @> %(seconds)s::int  -- psycopg sends < 32768 as smallint
        AND (EXISTS (SELECT 1 FROM gtfs.calendar c WHERE c.plan_id=s.plan_id AND c.service_id=s.service_id
                     AND %(day)s BETWEEN c.start_date AND c.end_date AND c.{weekday}='1')
             OR EXISTS (SELECT 1 FROM gtfs.calendar_dates cd WHERE cd.plan_id=s.plan_id AND cd.service_id=s.service_id
                        AND cd.date=%(day)s AND cd.exception_type='1'))
        AND NOT EXISTS (SELECT 1 FROM gtfs.calendar_dates cd WHERE cd.plan_id=s.plan_id AND cd.service_id=s.service_id
                        AND cd.date=%(day)s AND cd.exception_type='2')
      ORDER BY s.plan_id,s.trip_id,s.arrival_s DESC
    )
    SELECT ST_AsGeoJSON(ST_LineInterpolatePoint(sh.geom,p.fraction),6) geometry,
      p.trip_id,p.route_short_name,p.route_type FROM positioned p
      JOIN derived.schedule_shapes sh ON sh.plan_id=p.plan_id AND sh.shape_id=p.shape_id
    WHERE p.fraction IS NOT NULL
      AND ST_Contains(ST_MakeEnvelope(-9.50,38.665,-9.295,38.78,4326),
                      ST_LineInterpolatePoint(sh.geom,p.fraction))
    LIMIT 120""", params),
      "meta": {"source": "dated GTFS stop times and shapes", "kind": "scheduled position estimate",
               "day": str(day), "local_time": f"{hour:02d}:{minute:02d}",
               "notes": ["Interpolated between timed stops; holds position during scheduled dwell.",
                         "Not a live vehicle position and not adjusted for delays."]}}


@app.get("/analytics/map/stop-departures")
def stop_departures(agency_id: str, stop_id: str, day: date | None = None, hour: int | None = None):
    if hour is not None and not 0 <= hour <= 23:
        raise HTTPException(400, "hour must be 0–23")
    schedule_day = day or date(2026, 9, 2)
    weekday = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[schedule_day.weekday()]
    return {"departures": rows(f"""SELECT r.route_short_name route,r.route_type,
      st.departure_time time_local,t.trip_headsign direction
      FROM gtfs.stop_times st JOIN gtfs.trips t ON t.plan_id=st.plan_id AND t.trip_id=st.trip_id
      JOIN gtfs.routes r ON r.plan_id=t.plan_id AND r.route_id=t.route_id
      JOIN gtfs.plans p ON p.plan_id=t.plan_id
      WHERE p.agency_id=%s AND st.stop_id=%s
        AND (EXISTS (SELECT 1 FROM gtfs.calendar c WHERE c.plan_id=t.plan_id AND c.service_id=t.service_id
                     AND %s BETWEEN c.start_date AND c.end_date AND c.{weekday}='1')
             OR EXISTS (SELECT 1 FROM gtfs.calendar_dates cd WHERE cd.plan_id=t.plan_id AND cd.service_id=t.service_id
                        AND cd.date=%s AND cd.exception_type='1'))
        AND NOT EXISTS (SELECT 1 FROM gtfs.calendar_dates cd WHERE cd.plan_id=t.plan_id AND cd.service_id=t.service_id
                        AND cd.date=%s AND cd.exception_type='2')
        AND (%s::int IS NULL OR split_part(st.departure_time,':',1)::int %% 24=%s)
      GROUP BY r.route_short_name,r.route_type,st.departure_time,t.trip_headsign
      ORDER BY st.departure_time LIMIT 30""", (agency_id,stop_id) + (schedule_day.strftime("%Y%m%d"),) * 3 + (hour,hour)),
      "meta": {"source": "dated GTFS representative service day", "kind": "scheduled"}}


@app.get("/analytics/stations")
def stations():
    return {
        "stations": features("""
            SELECT ST_AsGeoJSON(s.geom, 6) geometry, s.station_id, s.name,
                   COALESCE(sum(f.departures), 0) departures, COALESCE(sum(f.arrivals), 0) arrivals,
                   COALESCE(sum(f.net_flow), 0) net_flow,
                   round(COALESCE(sum(f.departures) FILTER (WHERE NOT f.is_weekend) / max(f.n_days) FILTER (WHERE NOT f.is_weekend), 0), 1) weekday_departures_per_day
            FROM bike.stations s LEFT JOIN derived.station_flows f USING (station_id)
            GROUP BY s.station_id, s.name, s.geom"""),
        "meta": {"source": BIKE, "kind": "observed trip flow",
                 "notes": ["A trip counts for a station only when its endpoint is inside the station area.",
                           "Net flow = arrivals − departures. Not stock: no inventory history exists."]},
    }


@app.get("/analytics/stations/{station_id}")
def station_profile(station_id: str):
    return {"hourly": rows("""SELECT is_weekend, hour_local, departures, arrivals, net_flow, n_days
                              FROM derived.station_flows WHERE station_id = %s ORDER BY is_weekend, hour_local""",
                           (station_id,))}


@app.get("/analytics/transit")
def transit():
    return {
        "stops": features("""
            SELECT ST_AsGeoJSON(s.geom, 6) geometry, s.agency_id, a.agency_name, s.stop_id, s.stop_name,
                   s.weekday_departures, s.max_routes_in_an_hour,
                   round(s.weekday_daytime_departures_per_hour::numeric, 1) departures_per_hour,
                   COALESCE(b.validations, 0) weekly_boardings
            FROM derived.stop_service s
            LEFT JOIN ref.agencies a ON a.agency_id = s.agency_id
            LEFT JOIN (SELECT agency_id, stop_id, sum(validations) validations FROM derived.stop_boardings GROUP BY 1, 2) b
                   ON b.agency_id = s.agency_id AND b.stop_id = s.stop_id
            WHERE ST_Intersects(s.geom, ST_MakeEnvelope(-9.50, 38.665, -9.295, 38.78, 4326))"""),
        "bus_delay": rows("""SELECT * FROM derived.bus_delay_routes ORDER BY route, time_window"""),
        "transfer_proxy": {"summary": rows("SELECT * FROM derived.transfer_proxy_summary ORDER BY kind DESC"),
                           "placebo": one("SELECT * FROM derived.transfer_proxy_placebo")},
        "boardings_by_hour": rows("""SELECT is_weekend, hour_local, sum(validations) validations
                                     FROM derived.stop_boardings GROUP BY 1, 2 ORDER BY 1, 2"""),
        "meta": {"source": TRANSIT + "; realised MobiCascais services M01–M36",
                 "notes": ["Frequency = scheduled departures (dated plan), weekday 2 Sep 2026.",
                           "Boardings = entry validations; not alightings or occupancy.",
                           "Delay = max(0, actual − planned departure) from the operator spreadsheet; earliness separate."]},
    }


@app.get("/analytics/journeys")
def journeys(limit: int = 300):
    return {
        "flows": features("""SELECT ST_AsGeoJSON(ST_MakeLine(origin_pt, dest_pt), 5) geometry, origin_zone, dest_zone,
                                    origin_municipality, dest_municipality, journeys, cards, am_peak, pm_peak,
                                    with_transfer, observed_destinations
                             FROM derived.od_flows ORDER BY journeys DESC LIMIT %s""", (limit,)),
        "municipalities": rows("SELECT * FROM derived.municipality_flows ORDER BY journeys DESC"),
        "transfers": rows("""SELECT from_operator, from_line, to_operator, to_line, transfers, cards, median_gap_min
                             FROM derived.transfer_pairs WHERE touches_cascais ORDER BY transfers DESC LIMIT 25"""),
        "summary": one("SELECT * FROM derived.journey_summary"),
        "meta": {"source": TRANSIT, "kind": "inferred proxy (aggregated)",
                 "notes": ["A card is not a verified person; groups under 5 cards are suppressed.",
                           "Journey = boardings chained within 60 min. Destination = observed Metro exit, else the "
                           "next boarding that day (trip chaining), else the day's first origin.",
                           "CP rail has no validations in this delivery, so rail legs are invisible."]},
    }


@app.get("/analytics/weather")
def weather():
    return {
        "by_class": rows("""SELECT 'rain' AS factor, rain_class AS level, count(*) hours,
                                   round(avg(trip_starts), 1) avg_starts_per_hour
                            FROM derived.weather_bike WHERE hour_of_day BETWEEN 8 AND 20 GROUP BY 1, 2
                            UNION ALL
                            SELECT 'temperature', temp_class, count(*), round(avg(trip_starts), 1)
                            FROM derived.weather_bike WHERE hour_of_day BETWEEN 8 AND 20 GROUP BY 1, 2
                            UNION ALL
                            SELECT 'wind', wind_class, count(*), round(avg(trip_starts), 1)
                            FROM derived.weather_bike WHERE hour_of_day BETWEEN 8 AND 20 GROUP BY 1, 2"""),
        "hourly": rows("""SELECT hour_local, trip_starts, temperature_2m, precipitation, wind_speed_10m
                          FROM derived.weather_bike ORDER BY hour_utc"""),
        "meta": {"source": "ERA5 hourly via Open-Meteo (grid estimate, not a street sensor)", "kind": "descriptive association",
                 "notes": ["Daytime hours 08–20 only. No causal claim; weather is not used in any ranking."]},
    }


LAYA_POOL = """WITH c AS (
  SELECT sc.*, ST_Centroid(g.geom_m) c_m FROM derived.station_candidates sc JOIN derived.grid_250 g USING (cell_id)
  WHERE sc.score IS NOT NULL
), ep AS (
  SELECT e.cell_id, count(DISTINCT date_local) active_days, round(avg(is_weekend::int)::numeric, 3) weekend_share,
         array_agg(hour_local) hours
  FROM derived.trip_endpoints e JOIN c USING (cell_id) GROUP BY 1
), pk AS (
  SELECT p.cell_id, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) / 60)::numeric, 1) median_hours_parked,
         count(*) FILTER (WHERE end_reason = 'provider_recovery') provider_recoveries,
         count(*) FILTER (WHERE end_reason = 'new_trip') reused_by_rider
  FROM derived.parking_intervals p JOIN c USING (cell_id) WHERE p.outside GROUP BY 1
), bo AS (
  SELECT ST_Transform(min(geom), 3763) g, sum(validations) v FROM derived.stop_boardings GROUP BY agency_id, stop_id
), od AS (
  SELECT ST_Transform(origin_pt, 3763) o, ST_Transform(dest_pt, 3763) d, journeys FROM derived.od_flows
)
SELECT ST_AsGeoJSON(c.geom, 6) geometry, c.cell_id, c.rank screening_rank, c.score screening_score,
       c.trip_endpoints, c.trip_starts, c.trip_ends, c.outside_intervals, c.supported_120,
       round(c.departures_per_hour_333m, 1)::float departures_per_hour_333m, round(c.nearest_station_m) nearest_station_m,
       c.operators_333m, coalesce(ep.active_days, 0) active_days, ep.weekend_share::float, ep.hours,
       pk.median_hours_parked::float, coalesce(pk.provider_recoveries, 0) provider_recoveries,
       coalesce(pk.reused_by_rider, 0) reused_by_rider,
       (SELECT coalesce(sum(v), 0) FROM bo WHERE ST_DWithin(bo.g, c.c_m, 333)) weekly_boardings_333m,
       (SELECT coalesce(sum(journeys), 0) FROM od WHERE ST_DWithin(od.o, c.c_m, 750) OR ST_DWithin(od.d, c.c_m, 750)) journeys_750m,
       (SELECT s.name FROM derived.stations_m s ORDER BY ST_Distance(s.area_m, c.c_m) LIMIT 1) nearest_station,
       (SELECT string_agg(DISTINCT stop_name, ' · ') FROM derived.stop_service s WHERE ST_DWithin(s.geom_m, c.c_m, 333)) stops_333m,
       ST_Y(c.centroid) lat, ST_X(c.centroid) lon
FROM c LEFT JOIN ep USING (cell_id) LEFT JOIN pk USING (cell_id)"""

LAYA_META = {"source": f"{BIKE}; {TRANSIT}", "kind": "recommendation model (open, provisional, not approved)",
             "notes": ["Laya re-ranks the eligible station candidate cells; scores are relative to that pool.",
                       "Boardings are validations, not unique people; journeys are 1 km zone flows touching 750 m.",
                       "Candidate areas, not installation sites: legal/safety feasibility is an unchecked gate."]}


def laya_meta() -> dict:
    """LAYA_META plus the abandonment clock the tables were built with (> 120 min is counted minutes)."""
    return {**LAYA_META, "notes": [*LAYA_META["notes"], f"Abandonment (> 120 min outside station + 30 m) is {clock_text()}."]}


# Every table Laya reads. analytics.derive (and a dump restore) drops and recreates each one, which gives it
# a new OID, so their OIDs identify the build: any rebuild changes the key and the cached ranking is dropped.
LAYA_INPUTS = ("derived.station_candidates", "derived.grid_250", "derived.trip_endpoints", "derived.parking_intervals",
               "derived.stop_boardings", "derived.od_flows", "derived.stations_m", "derived.stop_service",
               "derived.enforcement_setting")
_laya_cache: dict[tuple, list[dict[str, Any]]] = {}
_laya_lock = threading.Lock()


def laya_inputs_version() -> tuple[int, ...]:
    """OIDs of Laya's input tables (0 when missing); one catalogue lookup, well under a millisecond."""
    return tuple(r["oid"] for r in rows(
        "SELECT coalesce(to_regclass(t)::oid::bigint, 0) oid FROM unnest(%s::text[]) WITH ORDINALITY u(t, i) ORDER BY i",
        (list(LAYA_INPUTS),)))


def _laya_memo(what: tuple, compute, version: tuple | None = None):
    """Cache `compute()` per (input build, what). Laya is deterministic (seeded perturbations) and its labels come
    from derived.enforcement_setting, an input too, so a hit is exactly what recomputing would return.
    Callers must not mutate the result."""
    key = (version or laya_inputs_version(), *what)
    with _laya_lock:
        if key in _laya_cache:
            return _laya_cache[key]
    value = compute()
    with _laya_lock:
        if any(k[0] != key[0] for k in _laya_cache):  # a rebuild happened: drop every older build's entries
            _laya_cache.clear()
        _laya_cache[key] = value
    return value


def laya_ranked(top_n: int, version: tuple | None = None, size: int = 250) -> list[dict[str, Any]]:
    """The ranked pool at a square size; robustness and verdicts depend on `top_n`, so each pair is cached."""
    return _laya_memo(("ranked", top_n, size), lambda: _laya_compute(top_n, size), version)


# Laya's pool at any square size: the dynamic screening ranking's scored cells (same eligibility: centre
# > 150 m from every station area, >= 5 outside parkings) plus the same evidence LAYA_POOL gathers.
LAYA_POOL_SIZED = """WITH c AS (
  SELECT u.i, u.j, u.cell_id, ST_SetSRID(ST_MakePoint((u.i + 0.5) * %(size)s, (u.j + 0.5) * %(size)s), 3763) c_m
  FROM unnest(%(i)s::int[], %(j)s::int[], %(ids)s::text[]) u(i, j, cell_id)
), ep AS (
  SELECT c.cell_id, count(DISTINCT date_local) active_days, round(avg(is_weekend::int)::numeric, 3) weekend_share,
         array_agg(hour_local) hours
  FROM derived.trip_endpoints e JOIN c ON floor(ST_X(e.pt_m) / %(size)s)::int = c.i AND floor(ST_Y(e.pt_m) / %(size)s)::int = c.j
  GROUP BY 1
), pk AS (
  SELECT c.cell_id, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) / 60)::numeric, 1) median_hours_parked,
         count(*) FILTER (WHERE end_reason = 'provider_recovery') provider_recoveries,
         count(*) FILTER (WHERE end_reason = 'new_trip') reused_by_rider
  FROM derived.parking_intervals p JOIN c ON floor(ST_X(p.pt_m) / %(size)s)::int = c.i AND floor(ST_Y(p.pt_m) / %(size)s)::int = c.j
  WHERE p.outside GROUP BY 1
), bo AS (
  SELECT ST_Transform(min(geom), 3763) g, sum(validations) v FROM derived.stop_boardings GROUP BY agency_id, stop_id
), od AS (
  SELECT ST_Transform(origin_pt, 3763) o, ST_Transform(dest_pt, 3763) d, journeys FROM derived.od_flows
)
SELECT c.cell_id, coalesce(ep.active_days, 0) active_days, ep.weekend_share::float, ep.hours,
       pk.median_hours_parked::float, coalesce(pk.provider_recoveries, 0) provider_recoveries,
       coalesce(pk.reused_by_rider, 0) reused_by_rider,
       (SELECT coalesce(sum(v), 0) FROM bo WHERE ST_DWithin(bo.g, c.c_m, 333)) weekly_boardings_333m,
       (SELECT coalesce(sum(journeys), 0) FROM od WHERE ST_DWithin(od.o, c.c_m, 750) OR ST_DWithin(od.d, c.c_m, 750)) journeys_750m,
       (SELECT s.name FROM derived.stations_m s ORDER BY ST_Distance(s.area_m, c.c_m) LIMIT 1) nearest_station,
       (SELECT string_agg(DISTINCT stop_name, ' · ') FROM derived.stop_service s WHERE ST_DWithin(s.geom_m, c.c_m, 333)) stops_333m
FROM c LEFT JOIN ep USING (cell_id) LEFT JOIN pk USING (cell_id)"""


def _laya_pool(size: int) -> list[dict[str, Any]]:
    """Eligible cells with Laya's evidence. 250 m uses the canonical derived pool (what the Station candidates
    tab shows); other sizes rebuild it from the dynamic screening ranking at that size, over all dates."""
    if size == 250:
        return [{**r, "size_m": 250} for r in rows(LAYA_POOL)]
    screened = [f for f in analysis_candidates(size)["cells"]["features"] if f["properties"]["score"] is not None]
    if not screened:
        return []
    props = [f["properties"] for f in screened]
    ij = [tuple(int(v) for v in p["cell_id"].split("_")) for p in props]
    extra = {r["cell_id"]: r for r in rows(LAYA_POOL_SIZED, {
        "size": size, "i": [a for a, _ in ij], "j": [b for _, b in ij], "ids": [p["cell_id"] for p in props]})}
    pool = []
    for f, p in zip(screened, props):
        pool.append({"geometry": json.dumps(f["geometry"]), "cell_id": p["cell_id"], "size_m": size,
                     "screening_rank": p["rank"], "screening_score": p["score"],
                     **{k: p[k] for k in ("trip_endpoints", "trip_starts", "trip_ends", "outside_intervals", "supported_120",
                                          "departures_per_hour_333m", "nearest_station_m", "operators_333m", "lat", "lon")},
                     **{k: v for k, v in extra.get(p["cell_id"], {}).items() if k != "cell_id"}})
    return pool


def _laya_compute(top_n: int, size: int = 250) -> list[dict[str, Any]]:
    pool = []
    for r in _laya_pool(size):
        hours = r.pop("hours", None) or []
        r["hourly"] = [hours.count(h) for h in range(24)]
        r["geometry"] = json.loads(r["geometry"])
        pool.append({k: float(v) if isinstance(v, Decimal) else v for k, v in r.items()})
    return laya.rank(pool, top_n)


LAYA_SIZES = range(50, 1001, 50)


def prewarm_laya(top_n: int = 10) -> None:
    """Fill the cache for every square size the decision map offers, so a size change is instant.
    Runs in a background thread at startup; a later rebuild changes the key and requests recompute lazily."""
    for size in (250, *(s for s in LAYA_SIZES if s != 250)):
        try:
            laya_recommendations(top_n, pool=True, size=size)
        except Exception as e:  # tables missing (fresh install) or DB down: the endpoint reports it on request
            print(f"laya prewarm stopped at {size} m: {e}")
            return


@app.on_event("startup")
def _start_laya_prewarm() -> None:
    threading.Thread(target=prewarm_laya, name="laya-prewarm", daemon=True).start()


@app.get("/analytics/laya")
def laya_recommendations(limit: int = 10, pool: bool = False, size: int = 250):
    """Laya's top station-area recommendations with the evidence behind each score.
    `pool=true` also returns every eligible cell, scored against the same top `limit` (the decision map's lookup).
    `size` (50–1000 m) re-scores the pool on that grid; each size is cached and pre-warmed at startup."""
    if not 1 <= limit <= 50:
        raise HTTPException(400, "limit must be 1–50")
    map_filters(size, None, None)
    version = laya_inputs_version()  # the only query on a cache hit
    return _laya_memo(("recommendations", limit, pool, size), lambda: _laya_response(limit, pool, version, size), version)


def _laya_response(limit: int, pool: bool, version: tuple, size: int = 250) -> dict:
    ranked = laya_ranked(limit, version, size)
    top = ranked[:limit]
    return {"model": laya.model_card(), "size_m": size, "pool_size": len(ranked), "recommendations": top,
            **({"pool": ranked} if pool else {}),
            "summary": {"strong": sum(r["verdict"] == "strong candidate" for r in top),
                        "pilot": sum(r["verdict"].startswith("pilot") for r in top),
                        "also_top_in_screening": sum((r["screening_rank"] or 999) <= limit for r in top),
                        "trip_endpoints": sum(r["trip_endpoints"] for r in top),
                        "supported_120": sum(r["supported_120"] for r in top)},
            "abandonment_clock": clock_text(), "enforcement": enforcement(),
            "meta": laya_meta()}


@app.get("/analytics/laya/{cell_id}")
def laya_score(cell_id: str, top_n: int = 10, size: int = 250):
    """Laya's score for one candidate cell, ranked against the whole eligible pool at that square size."""
    map_filters(size, None, None)
    version = laya_inputs_version()
    for r in laya_ranked(top_n, version, size):
        if r["cell_id"] == cell_id:
            clock, meta = _laya_memo(("labels",), lambda: (clock_text(), laya_meta()), version)
            return {"model": {"name": "Laya", "version": laya.VERSION}, "result": r,
                    "abandonment_clock": clock, "meta": meta}
    raise HTTPException(404, "not an eligible candidate: > 150 m from stations and at least 5 outside parkings required")


def area_indices(area_id: str) -> tuple[int, int]:
    try:
        i, j = (int(v) for v in area_id.split("_"))
    except (ValueError, TypeError):
        raise HTTPException(400, "invalid area ID") from None
    return i, j


PARKING_BANDS = ["under 30 min", "30–120 min", "120 min–6 h", "6–24 h", "over 24 h"]


@app.get("/analytics/map/cell-profile")
def cell_profile(size: int, area_id: str, day: date | None = None):
    """Hourly profile and parking evidence for one square of the dynamic grid (Europe/Lisbon)."""
    p = map_filters(size, day, None)
    p["i"], p["j"] = area_indices(area_id)
    cell = """floor(ST_X(pt_m)/%(size)s)::int=%(i)s AND floor(ST_Y(pt_m)/%(size)s)::int=%(j)s"""
    trips = rows(f"""SELECT is_weekend,hour_local,
        count(*) FILTER (WHERE kind='start') trip_starts,count(*) FILTER (WHERE kind='end') trip_ends
      FROM derived.trip_endpoints WHERE {cell} AND (%(day)s::date IS NULL OR date_local=%(day)s::date)
      GROUP BY 1,2 ORDER BY 1,2""", p)
    days = rows("""SELECT is_weekend,count(DISTINCT date_local) n_days FROM derived.trip_endpoints
      WHERE %(day)s::date IS NULL OR date_local=%(day)s::date GROUP BY 1""", p)
    parking = rows(f"""WITH iv AS (
        SELECT minutes,enforced_minutes,end_reason,
          extract(isodow FROM start_time AT TIME ZONE 'Europe/Lisbon')>=6 is_weekend,
          extract(hour FROM start_time AT TIME ZONE 'Europe/Lisbon')::int hour_local
        FROM derived.parking_intervals WHERE outside AND {cell}
          AND (%(day)s::date IS NULL OR (start_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date))
      SELECT is_weekend,hour_local,count(*) outside_intervals,count(*) FILTER (WHERE enforced_minutes>120) supported_120
      FROM iv GROUP BY 1,2 ORDER BY 1,2""", p)
    bands = rows(f"""SELECT CASE WHEN minutes<30 THEN 0 WHEN enforced_minutes<=120 THEN 1 WHEN minutes<360 THEN 2
          WHEN minutes<1440 THEN 3 ELSE 4 END band,count(*) intervals
        FROM derived.parking_intervals WHERE outside AND {cell}
          AND (%(day)s::date IS NULL OR (start_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
        GROUP BY 1 ORDER BY 1""", p)
    reasons = rows(f"""SELECT end_reason,count(*) intervals,count(*) FILTER (WHERE enforced_minutes>120) over_120
        FROM derived.parking_intervals WHERE outside AND {cell}
          AND (%(day)s::date IS NULL OR (start_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
        GROUP BY 1 ORDER BY 2 DESC""", p)
    boardings = rows("""SELECT extract(isodow FROM v.event_time AT TIME ZONE 'Europe/Lisbon')>=6 is_weekend,
        extract(hour FROM v.event_time AT TIME ZONE 'Europe/Lisbon')::int hour_local,
        count(*) boardings,count(DISTINCT v.card_hash) cards
      FROM transit26.validations v JOIN derived.stop_locations l USING(agency_id,stop_id)
      WHERE v.in_cascais AND v.event_type IN (1,13)
        AND floor(ST_X(l.geom_m)/%(size)s)::int=%(i)s AND floor(ST_Y(l.geom_m)/%(size)s)::int=%(j)s
        AND (%(day)s::date IS NULL OR (v.event_time AT TIME ZONE 'Europe/Lisbon')::date=%(day)s::date)
      GROUP BY 1,2 ORDER BY 1,2""", p)
    return {"area_id": area_id, "size_m": size, "day": str(day) if day else None,
            "trip_hours": trips, "parking_hours": parking, "days": days,
            "parking_bands": [{"band_index": r["band"], "band": PARKING_BANDS[r["band"]], "intervals": r["intervals"]} for r in bands],
            "end_reasons": reasons,
            "boarding_hours": [{k: v for k, v in r.items() if k != "cards"} for r in boardings if r["cards"] >= 5],
            "boarding_hours_suppressed": sum(1 for r in boardings if r["cards"] < 5),
            "meta": {"sources": [BIKE, TRANSIT], "kind": "observed aggregate for one square",
                     "notes": ["Hours are Europe/Lisbon local time; parking hour is the interval start.",
                               "Boarding hours with fewer than five distinct cards are withheld."]}}


@app.get("/analytics/map/stop-profile")
def stop_profile(agency_id: str, stop_id: str):
    """Observed boardings by hour at one stop, from the suppressed aggregate table."""
    hours = rows("""SELECT is_weekend,hour_local,validations,distinct_cards,n_days
      FROM derived.stop_boardings WHERE agency_id=%s AND stop_id=%s ORDER BY 1,2""", (agency_id, stop_id))
    return {"hours": [{k: v for k, v in r.items() if k != "distinct_cards"} for r in hours if r["distinct_cards"] >= 5],
            "suppressed_hours": sum(1 for r in hours if r["distinct_cards"] < 5),
            "meta": {"source": TRANSIT, "kind": "observed boardings",
                     "notes": ["Entry validations; not alightings, occupancy or distinct people.",
                               "Hours with fewer than five distinct cards are withheld."]}}


CATALOGUE = [
    {"key": "bike_trips", "name": "Bicycle trips", "kind": "observed", "used_in": ["grid", "candidates", "stations"],
     "meaning": "Valid trip starts and ends by local date/hour; a trip belongs to a station only inside the station polygon.",
     "coverage": "Cascais bike-share operating area", "unit": "trip endpoints",
     "sql": "SELECT min(date_local)::text period_start,max(date_local)::text period_end,count(*) FILTER (WHERE kind='start') rows FROM derived.trip_endpoints"},
    {"key": "parking", "name": "Parking intervals outside stations", "kind": "derived from observed events",
     "used_in": ["grid", "candidates"],
     "meaning": "Rest intervals beyond the station polygon plus 30 m; > 120 minutes {clock} is the operational rule. A pickup is a provider recovery ending an interval.",
     "coverage": "Bike event sample", "unit": "intervals",
     "sql": "SELECT min(start_time AT TIME ZONE 'Europe/Lisbon')::date::text,max(start_time AT TIME ZONE 'Europe/Lisbon')::date::text,count(*) FROM derived.parking_intervals WHERE outside"},
    {"key": "stations", "name": "Bike stations", "kind": "reference geometry", "used_in": ["stations"],
     "meaning": "Supplied station polygons; the parking zone adds a 30 m EPSG:3763 buffer.",
     "coverage": "Station_information snapshot, 11 Sep 2026", "unit": "stations",
     "sql": "SELECT NULL,NULL,count(*) FROM bike.stations"},
    {"key": "validations_2026", "name": "Transit card validations 2026", "kind": "observed", "used_in": ["people", "stops"],
     "meaning": "Boardings (entry validations) in Cascais. A card is not a person; groups under five cards are suppressed. CP rail has no validations.",
     "coverage": "Cascais stops of TML operators", "unit": "validations",
     "sql": "SELECT min(event_time AT TIME ZONE 'Europe/Lisbon')::date::text,max(event_time AT TIME ZONE 'Europe/Lisbon')::date::text,count(*) FROM transit26.validations WHERE in_cascais"},
    {"key": "journeys", "name": "Inferred card journeys", "kind": "inferred proxy", "used_in": ["people"],
     "meaning": "Boardings chained within 60 min; destinations from Metro exits or next boarding. Aggregated to 1 km zones.",
     "coverage": "Journeys touching Cascais", "unit": "journeys",
     "sql": "SELECT NULL,NULL,sum(journeys)::bigint FROM derived.od_flows"},
    {"key": "gtfs", "name": "Dated GTFS plans", "kind": "scheduled", "used_in": ["bus", "rail", "stops", "candidates"],
     "meaning": "Timetables in force during the sample week; drive route intensity, stop departures and pale timetable vehicles.",
     "coverage": "MobiCascais, Carris Metropolitana, CP and other TML operators", "unit": "plans",
     "sql": "SELECT to_date(min(active_from)::text,'YYYYMMDD')::text,to_date(max(active_until)::text,'YYYYMMDD')::text,count(*) FROM gtfs.plans WHERE plan_year=2026"},
    {"key": "bus_delay", "name": "MobiCascais realised services", "kind": "observed", "used_in": ["bus"],
     "meaning": "Planned vs actual departure per service M01–M36; route colour is the median departure delay.",
     "coverage": "MobiCascais M01–M36", "unit": "services",
     "sql": "SELECT min(planned_departure)::date::text,max(planned_departure)::date::text,count(*) FROM bus26.services_m01_m36"},
    {"key": "vehicle_positions_2026", "name": "Transit vehicle positions 2026", "kind": "observed", "used_in": [],
     "meaning": "Historical GPS pings; not yet used on the map (per-stop delay is future work).",
     "coverage": "TML operators in Cascais", "unit": "positions",
     "sql": "SELECT min(event_time AT TIME ZONE 'Europe/Lisbon')::date::text,max(event_time AT TIME ZONE 'Europe/Lisbon')::date::text,count(*) FROM transit26.vehicle_positions"},
    {"key": "transit_2025", "name": "Transit sample October 2025", "kind": "observed (separate study)", "used_in": [],
     "meaning": "APEX validations, rides and vehicle events for 2025. Kept separate; never mixed with 2026 layers.",
     "coverage": "2025 plans", "unit": "validations",
     "sql": "SELECT min(event_time AT TIME ZONE 'Europe/Lisbon')::date::text,max(event_time AT TIME ZONE 'Europe/Lisbon')::date::text,count(*) FROM transit25.apex_validations"},
    {"key": "weather", "name": "Hourly weather", "kind": "model estimate", "used_in": [],
     "meaning": "ERA5 via Open-Meteo grid estimate; descriptive association only, used in no ranking.",
     "coverage": "One grid point over Cascais", "unit": "hours",
     "sql": "SELECT min(time)::date::text,max(time)::date::text,count(*) FROM weather.hourly"},
]


@app.get("/analytics/map/catalogue")
def catalogue():
    """Every source behind the decision map with its period, row count, meaning and the layers using it."""
    out = []
    for entry in CATALOGUE:
        try:
            with pg(interactive=True) as c:
                start, end, count = c.execute(entry["sql"]).fetchone()
            available = True
        except Exception:  # a source missing from an older dump is reported, not fatal
            start = end = count = None
            available = False
        out.append({k: v.format(clock=clock_text()) if k == "meaning" else v for k, v in entry.items() if k != "sql"} |
                   {"period_start": start, "period_end": end, "rows": count, "available": available})
    return {"sources": out, "live": [
        {"key": "gbfs", "name": "GBFS bikes and station status", "kind": "live", "used_in": ["bikes", "unmoved", "stations"],
         "meaning": "Provider feed polled by the operations API; bike IDs rotate, so tracking is position-based."},
        {"key": "transit_live", "name": "TML GO / Carris Metropolitana vehicles", "kind": "live", "used_in": ["bus", "rail", "stops"],
         "meaning": "Fresh positions (≤120 s) and arrival estimates where the feeds supply them."},
        {"key": "cases", "name": "Operational cases", "kind": "operational", "used_in": ["cases"],
         "meaning": f"Detector cases (strictly over 120 minutes outside station + 30 m, {clock_text()}), live or replay."}]}


def csv_response(name: str, meta_lines: list[str], records: list[dict]):
    import csv
    import io

    from fastapi.responses import Response
    buf = io.StringIO()
    for line in meta_lines:
        buf.write(f"# {line}\n")
    if records:
        w = csv.DictWriter(buf, fieldnames=list(records[0].keys()))
        w.writeheader()
        w.writerows(records)
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


def filter_lines(p: dict) -> list[str]:
    return [f"generated: {date.today().isoformat()}",
            f"filters: square {p['size']} m (EPSG:3763), date {p['day'] or 'all 19 Aug–8 Sep 2026 (Lisbon)'}, "
            f"hour {'%02d:00 Europe/Lisbon' % p['hour'] if p['hour'] is not None else 'all'}",
            f"definitions: outside = beyond station polygon + 30 m; supported_120 = outside interval with > 120 min {clock_text()}; "
            "insufficient = fewer than 5 outside intervals"]


def centre_of(geometry: dict) -> tuple[float, float]:
    ring = geometry["coordinates"][0][:-1]
    return (round(sum(pt[1] for pt in ring) / len(ring), 6), round(sum(pt[0] for pt in ring) / len(ring), 6))


@app.get("/analytics/map/analysis-cells.csv")
def analysis_cells_csv(size: int = 250, day: date | None = None, hour: int | None = None):
    data = analysis_cells(size, day, hour)
    records = [{**f["properties"], "centre_lat": centre_of(f["geometry"])[0], "centre_lon": centre_of(f["geometry"])[1]}
               for f in data["cells"]["features"]]
    return csv_response(f"cascais-cells-{size}m.csv", [f"source: {BIKE}"] + filter_lines(map_filters(size, day, hour)), records)


@app.get("/analytics/map/analysis-candidates.csv")
def analysis_candidates_csv(size: int = 250, day: date | None = None, hour: int | None = None):
    data = analysis_candidates(size, day, hour)
    records = sorted((f["properties"] for f in data["cells"]["features"]),
                     key=lambda r: (r["rank"] is None, r["rank"] or 0))
    return csv_response(f"cascais-candidates-{size}m.csv", [
        "kind: provisional screening score, not an approved site list",
        "score = (0.35 demand + 0.25 parking >120 min + 0.10 transport gap + 0.05 neutral bus delay) / 0.75; "
        "components are percentile ranks; score withheld below 5 outside intervals",
    ] + filter_lines(map_filters(size, day, hour)), records)


@app.get("/analytics/map/station-flows.csv")
def station_flows_csv(day: date | None = None, hour: int | None = None):
    data = map_station_flows(day, hour)
    records = [{**f["properties"], "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0]}
               for f in data["stations"]["features"]]
    return csv_response("cascais-station-flows.csv", [f"source: {BIKE}",
        f"filters: date {day or 'all'}, hour {hour if hour is not None else 'all'} (Europe/Lisbon)",
        "definitions: a trip belongs to a station only when its endpoint is inside the station polygon"], records)


# --------------------------------------------------------------------------- Bird performance
BIRD_SOURCE = "Bird event log (viagens.xlsx): maintenance_pick_up, provider_drop_off, trips; 19 Aug–8 Sep 2026, Lisbon time"
RESPONSE_BANDS = [(120, "≤ 2 h"), (360, "2–6 h"), (720, "6–12 h"), (1440, "12–24 h"), (None, "> 24 h")]


def response_bands(minutes_after_threshold: list[float]) -> list[dict]:
    """How long after becoming abandoned (120 min outside) Bird picked the bike up, in bands."""
    counts = [0] * len(RESPONSE_BANDS)
    for m in minutes_after_threshold:
        i = next(k for k, (limit, _) in enumerate(RESPONSE_BANDS) if limit is None or m <= limit)
        counts[i] += 1
    return [{"band": label, "band_index": i, "bikes": counts[i]} for i, (_, label) in enumerate(RESPONSE_BANDS)]


def bird_tables_ready() -> None:
    if not one("SELECT to_regclass('derived.bird_legs') IS NOT NULL ok")["ok"]:
        raise HTTPException(503, "Bird tables missing: run `make analytics-map-prep` (or analytics.derive)")


@app.get("/analytics/bird")
def bird():
    """Bird's abandonment record, pickup response and station balancing, reconstructed from its event log."""
    bird_tables_ready()
    abandon = one("""SELECT count(*) abandonments,
        count(*) FILTER (WHERE end_reason='provider_recovery') bird_recovered,
        count(*) FILTER (WHERE end_reason='new_trip') rider_took,
        count(*) FILTER (WHERE end_reason='moved') moved,
        count(*) FILTER (WHERE end_reason='left_area') left_area,
        count(*) FILTER (WHERE end_reason='censored') still_open,
        count(*) FILTER (WHERE start_event='provider_drop_off') bird_dropped_outside,
        count(*) FILTER (WHERE later_evidence) with_later_evidence,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes_after_threshold) FILTER (WHERE end_reason='provider_recovery')) median_response_min,
        round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes_after_threshold) FILTER (WHERE end_reason='provider_recovery')) p90_response_min,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes_after_threshold)) median_abandoned_min
      FROM derived.bird_abandonments""")
    prevented = one("""SELECT count(*) FILTER (WHERE end_reason='provider_recovery' AND enforced_minutes<=120) bird_before_threshold,
        count(*) outside_intervals,
        count(*) FILTER (WHERE start_event='provider_drop_off') bird_dropoffs_outside
      FROM derived.parking_intervals WHERE outside""")
    responses = [r["m"] for r in rows("""SELECT minutes_after_threshold::float m FROM derived.bird_abandonments
                                          WHERE end_reason='provider_recovery'""")]
    operations = rows("""SELECT kind, count(*) legs, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)::numeric) median_min,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY distance_m)::numeric) median_m,
        count(*) FILTER (WHERE from_outside) from_outside, count(*) FILTER (WHERE to_outside) to_outside,
        count(*) FILTER (WHERE dropoff_battery - pickup_battery > 0.2) charged
      FROM derived.bird_legs GROUP BY kind ORDER BY kind""")
    totals = one("""SELECT count(*) FILTER (WHERE event_type='maintenance_pick_up') pickups,
        count(*) FILTER (WHERE event_type='provider_drop_off') dropoffs,
        count(DISTINCT device_id) FILTER (WHERE event_type='maintenance_pick_up') bikes_handled
      FROM bike.events""")
    balancing = one("""WITH typical AS (
        SELECT station_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY bikes) median_bikes
        FROM derived.station_stock_hourly GROUP BY station_id
      ), moves AS (SELECT * FROM derived.bird_legs WHERE kind <> 'in_place' AND pickup_local >= timestamp '2026-08-25')
      SELECT count(*) FILTER (WHERE NOT to_outside) into_stations,
        count(*) FILTER (WHERE NOT to_outside AND to_stock = 0) into_empty,
        count(*) FILTER (WHERE NOT to_outside AND to_stock < t_to.median_bikes) into_below_typical,
        count(*) FILTER (WHERE NOT from_outside) out_of_stations,
        count(*) FILTER (WHERE NOT from_outside AND from_stock > t_from.median_bikes) out_of_above_typical,
        count(*) FILTER (WHERE from_outside) from_outside
      FROM moves m LEFT JOIN typical t_to ON t_to.station_id=m.to_station LEFT JOIN typical t_from ON t_from.station_id=m.from_station""")
    stock = one("""SELECT count(*) FILTER (WHERE hour_of_day BETWEEN 7 AND 21) service_hours,
        count(*) FILTER (WHERE hour_of_day BETWEEN 7 AND 21 AND bikes=0) empty_service_hours,
        count(DISTINCT station_id) FILTER (WHERE bikes=0 AND hour_of_day BETWEEN 7 AND 21) stations_ever_empty,
        count(DISTINCT station_id) stations
      FROM derived.station_stock_hourly""")
    spells = rows("""SELECT refilled_by, count(*) spells, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY empty_hours)::numeric,1) median_hours
      FROM derived.station_empty_spells GROUP BY 1 ORDER BY 2 DESC""")
    daily = rows("""WITH d AS (SELECT generate_series(date '2026-08-19', date '2026-09-08', interval '1 day')::date d)
      SELECT d.d::text AS day,
        (SELECT count(*) FROM derived.bird_abandonments a WHERE a.abandoned_local::date=d.d) abandonments,
        (SELECT count(*) FROM derived.bird_abandonments a WHERE a.abandoned_local::date=d.d AND a.end_reason<>'provider_recovery') not_recovered_by_bird,
        (SELECT count(*) FROM bike.events e WHERE e.event_type='maintenance_pick_up' AND (e.event_time AT TIME ZONE 'Europe/Lisbon')::date=d.d) pickups,
        (SELECT count(*) FROM derived.bird_legs l WHERE l.kind<>'in_place' AND l.dropoff_local::date=d.d) relocations,
        (SELECT round(100.0*count(*) FILTER (WHERE bikes=0)/nullif(count(*),0),1) FROM derived.station_stock_hourly h
           WHERE h.hour_local::date=d.d AND h.hour_of_day BETWEEN 7 AND 21) pct_empty_service_hours
      FROM d ORDER BY d.d""")
    hourly = rows("""WITH h AS (SELECT generate_series(0,23) hr)
      SELECT h.hr AS hour,
        (SELECT count(*) FROM derived.bird_abandonments a WHERE extract(hour FROM a.abandoned_local)=h.hr) abandonments,
        (SELECT count(*) FROM bike.events e WHERE e.event_type='maintenance_pick_up'
           AND extract(hour FROM e.event_time AT TIME ZONE 'Europe/Lisbon')=h.hr) pickups,
        (SELECT count(*) FROM derived.bird_legs l WHERE l.kind<>'in_place' AND extract(hour FROM l.dropoff_local)=h.hr) relocations
      FROM h ORDER BY h.hr""")
    return {"abandonment": abandon, "prevented": prevented, "response_bands": response_bands(responses),
            "operations": operations, "totals": totals, "balancing": balancing, "stock": stock, "empty_spells": spells,
            "daily": daily, "hourly": hourly, "days": 21, "stock_from": "2026-08-25", "stock_days": 15,
            "station_score": station_score_summary(bird_stations()),
            "meta": {"source": BIRD_SOURCE, "kind": "reconstructed from the operator's event log",
                     "notes": [f"Abandoned = outside the station polygon + 30 m for more than 120 minutes {clock_text()}; the status is fineable whoever collects the bike.",
                               "A leg is a maintenance_pick_up followed by the same bike's next provider_drop_off: < 50 m is an in-place check; >= 50 m a relocation (local <= 2 km, long > 2 km).",
                               "Station stock is rebuilt from rest intervals inside each parking zone (rentable or low-battery), hourly from 25 Aug, after the parked fleet stabilises; it is a lower bound, not the provider's station_status.",
                               "Balancing measures use relocations from 25 Aug, when station stock is reliable.",
                               "No station capacity is published, so 'below typical' compares with the station's own median hourly stock.",
                               f"Station score (provisional): 100 × mean of availability (07–21 h with ≥ 1 bike), Bird's share of refills after the station went empty, and Bird's collection rate for abandonments whose nearest station area is within {bird_score.CATCHMENT_M} m (≥ {bird_score.MIN_ABANDONMENTS} needed). Missing parts are excluded, not zero. Good ≥ {bird_score.GOOD:.0f}, fair ≥ {bird_score.FAIR:.0f}, poor below."]}}


def station_score_summary(stations: dict) -> dict:
    """Bands, the median, a 10-point histogram, and the best/worst stations with at least two parts."""
    rows_ = [f["properties"] for f in stations["features"]]
    scored = [r for r in rows_ if r["score"] is not None]
    solid = sorted((r for r in scored if r["parts_used"] >= 2), key=lambda r: (-r["score"], r["name"]))
    pick = lambda r: {k: r[k] for k in ("station_id", "name", "score", "band", "parts_used", "part_availability",
                                        "part_refill", "part_collection", "abandonments_near", "bird_collected_near")}
    ordered = sorted(r["score"] for r in scored)
    median = None if not ordered else (ordered[len(ordered) // 2] if len(ordered) % 2 else (ordered[len(ordered) // 2 - 1] + ordered[len(ordered) // 2]) / 2)
    return {"stations": len(rows_), "scored": len(scored), "median": median,
            "bands": {b: sum(r["band"] == b for r in scored) for b in ("good", "fair", "poor")},
            "parts_used": {n: sum(r["parts_used"] == n for r in scored) for n in (1, 2, 3)},
            "histogram": [{"from": lo, "to": lo + 10, "stations": sum(lo <= r["score"] < lo + 10 or (lo == 90 and r["score"] == 100) for r in scored)}
                          for lo in range(0, 100, 10)],
            "best": [pick(r) for r in solid[:5]], "worst": [pick(r) for r in solid[::-1][:5]],
            "thresholds": {"good": bird_score.GOOD, "fair": bird_score.FAIR, "catchment_m": bird_score.CATCHMENT_M,
                           "min_abandonments": bird_score.MIN_ABANDONMENTS}}


def bird_stations() -> dict:
    """Per-station balancing plus the provisional Bird performance score (analytics/bird_score.py)."""
    fc = features("""WITH stock AS (
              SELECT station_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY bikes) median_bikes,
                count(*) FILTER (WHERE bikes=0 AND hour_of_day BETWEEN 7 AND 21) empty_service_hours,
                count(*) FILTER (WHERE hour_of_day BETWEEN 7 AND 21) service_hours
              FROM derived.station_stock_hourly GROUP BY 1
            ), spells AS (
              SELECT station_id, count(*) spells, count(*) FILTER (WHERE refilled_by='bird') refilled_by_bird,
                count(*) FILTER (WHERE refilled_by='rider') refilled_by_rider FROM derived.station_empty_spells GROUP BY 1
            ), moves AS (
              SELECT station_id, sum(into_station) relocations_in, sum(out_of_station) relocations_out FROM (
                SELECT to_station station_id, 1 into_station, 0 out_of_station FROM derived.bird_legs WHERE kind<>'in_place' AND to_station IS NOT NULL
                UNION ALL SELECT from_station, 0, 1 FROM derived.bird_legs WHERE kind<>'in_place' AND from_station IS NOT NULL) x GROUP BY 1
            ), near AS (  -- each abandonment belongs to its nearest station area, if within the catchment
              SELECT n.station_id, count(*) abandonments_near,
                count(*) FILTER (WHERE a.end_reason='provider_recovery') bird_collected_near,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutes_after_threshold)
                  FILTER (WHERE a.end_reason='provider_recovery') median_response_near_min
              FROM derived.bird_abandonments a
              CROSS JOIN LATERAL (
                SELECT s.station_id, ST_Distance(s.area_m, ST_Transform(ST_SetSRID(ST_MakePoint(a.lon, a.lat), 4326), 3763)) d
                FROM derived.stations_m s
                ORDER BY s.area_m <-> ST_Transform(ST_SetSRID(ST_MakePoint(a.lon, a.lat), 4326), 3763) LIMIT 1) n
              WHERE n.d <= %(catchment)s GROUP BY 1
            )
            SELECT ST_AsGeoJSON(s.geom,6) geometry, s.station_id, s.name, st.median_bikes, st.empty_service_hours,
              coalesce(sp.spells,0) empty_spells, coalesce(sp.refilled_by_bird,0) refilled_by_bird, coalesce(sp.refilled_by_rider,0) refilled_by_rider,
              coalesce(m.relocations_in,0) relocations_in, coalesce(m.relocations_out,0) relocations_out,
              st.service_hours, coalesce(nr.abandonments_near,0) abandonments_near, coalesce(nr.bird_collected_near,0) bird_collected_near,
              round(nr.median_response_near_min::numeric) median_response_near_min
            FROM bike.stations s JOIN stock st USING(station_id) LEFT JOIN spells sp USING(station_id) LEFT JOIN moves m USING(station_id)
              LEFT JOIN near nr USING(station_id)""", {"catchment": bird_score.CATCHMENT_M})
    for f in fc["features"]:
        p = f["properties"]
        parts = bird_score.parts(p["service_hours"] or 0, p["empty_service_hours"] or 0, p["refilled_by_bird"],
                                 p["refilled_by_rider"], p["abandonments_near"], p["bird_collected_near"])
        score, used, band = bird_score.station_score(parts)
        p.update({f"part_{k}": None if v is None else round(v, 3) for k, v in parts.items()})
        p.update({"score": score, "parts_used": used, "band": band})
    return fc


@app.get("/analytics/bird/map")
def bird_map():
    """Abandonment points (outcome + hotspot cloud) and per-station balancing for the Bird map."""
    bird_tables_ready()
    return {
        "abandonments": features("""SELECT ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(lon,lat),4326),6) geometry, interval_id,
            end_reason, abandoned_local::text, round(minutes_after_threshold) minutes_after_threshold,
            round(distance_outside_m::numeric) distance_outside_m, start_event FROM derived.bird_abandonments"""),
        "stations": bird_stations(),
        "meta": {"source": BIRD_SOURCE, "kind": "reconstructed from the operator's event log"}}


@app.get("/analytics/bird/abandonments.csv")
def bird_abandonments_csv():
    bird_tables_ready()
    return csv_response("bird-abandonments.csv", [f"source: {BIRD_SOURCE}",
        f"definition: outside station polygon + 30 m for more than 120 minutes {clock_text()}; abandoned_local is when the counted 120 min passed (Europe/Lisbon)",
        "end_reason: provider_recovery = Bird pickup, new_trip = rider, moved/left_area, censored = still open at data end"],
        rows("""SELECT interval_id, device_id, abandoned_local, end_time AT TIME ZONE 'Europe/Lisbon' ended_local, end_reason,
                  minutes_after_threshold, round(distance_outside_m::numeric) distance_outside_m, start_event, lat, lon
                FROM derived.bird_abandonments ORDER BY abandoned_local"""))


@app.get("/analytics/bird/stations.csv")
def bird_stations_csv():
    bird_tables_ready()
    records = [{**f["properties"], "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0]}
               for f in bird_map()["stations"]["features"]]
    return csv_response("bird-station-balancing.csv", [f"source: {BIRD_SOURCE}",
        "stock: bikes at rest in the parking zone (polygon + 30 m), rebuilt hourly 25 Aug–8 Sep (earlier days are a warm-up); service hours 07–21",
        "empty spell: consecutive empty hours; refilled_by: first parking after it (Bird drop-off or rider trip end)"], records)


@app.get("/analytics/{name}")
def unknown(name: str):
    raise HTTPException(404, f"no analytics output named {name}")
