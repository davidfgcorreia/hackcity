"""Analytics API for the /insights web page. Read-only over schema `derived` (+ metadata).

Only aggregates leave this service: no card hashes, device ids or individual journeys.
Every response carries `meta` (source, period, method notes) so the page can label each layer
as observed / inferred proxy / screening score, as the analytics requirements ask.
"""
import json
from typing import Any

from fastapi import FastAPI, HTTPException

from analytics.db import pg

app = FastAPI(title="Hackcity analytics API")

BIKE = "Bicycle trips/events, 18 Aug–8 Sep 2026 (cartoes.xlsx, viagens.xlsx)"
TRANSIT = "Card validations and dated TML GTFS plans, 31 Aug–6 Sep 2026"


def rows(query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with pg() as c, c.cursor() as cur:
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


@app.get("/analytics/overview")
def overview():
    return {
        "b5": one("SELECT * FROM derived.b5_detector_validation"),
        "journeys": one("SELECT * FROM derived.journey_summary"),
        "bike": one("""SELECT (SELECT count(*) FROM bike.trips) trips,
                              (SELECT count(*) FROM derived.trip_endpoints WHERE kind='start') valid_trips,
                              (SELECT count(*) FROM bike.stations) stations,
                              (SELECT count(*) FROM derived.parking_intervals WHERE outside) outside_intervals,
                              (SELECT count(*) FROM derived.parking_intervals WHERE outside AND minutes > 120) supported_120,
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
                                        count(*) FILTER (WHERE minutes > 120) over_120
                                 FROM derived.parking_intervals WHERE outside GROUP BY 1 ORDER BY 2 DESC"""),
        "meta": {"source": BIKE, "kind": "observed",
                 "notes": ["Outside = beyond station area + 30 m (EPSG:3763).",
                           "Supported = parked strictly more than 120 min.",
                           "Cells with fewer than 5 outside intervals are marked insufficient."]},
    }


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
        "weights": [
            {"component": "Observed bicycle demand", "weight": 0.35, "status": "measured", "input": "valid trip starts + ends in cell"},
            {"component": "Outside-station parking", "weight": 0.25, "status": "measured", "input": "intervals > 120 min outside station + 30 m"},
            {"component": "Complete-journey improvement", "weight": 0.20, "status": "unavailable", "input": "needs walk/cycle network"},
            {"component": "Transport-coverage gap", "weight": 0.10, "status": "estimate", "input": "scheduled departures/h within 333 m straight line"},
            {"component": "Population / equity", "weight": 0.05, "status": "unavailable", "input": "INE census not ingested"},
            {"component": "Bus delay", "weight": 0.05, "status": "missing (neutral 0.5)", "input": "no validated stop-level delay"},
        ],
        "meta": {"kind": "screening score (provisional weights, not approved)",
                 "notes": ["Candidates: 250 m cells whose centre is > 150 m from every station area.",
                           "Components are percentile ranks within the candidate set; unavailable components are excluded, "
                           "not zero, and the score is renormalised over the available 75 % of weight.",
                           "Score suppressed when fewer than 5 outside-station intervals contribute.",
                           "Candidate areas, not installation sites: legal/safety feasibility is an unchecked gate."]},
    }


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
                   s.weekday_departures, round(s.weekday_daytime_departures_per_hour::numeric, 1) departures_per_hour,
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


@app.get("/analytics/{name}")
def unknown(name: str):
    raise HTTPException(404, f"no analytics output named {name}")
