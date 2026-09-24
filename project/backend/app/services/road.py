"""Road routing through OSRM (OpenStreetMap), with a straight-line fallback.

matrix(points) -> driving seconds between every pair (OSRM /table), or None if unavailable
route(points)  -> road geometry, legs and turn-by-turn steps (OSRM /route), or a straight-line
                  route flagged engine="straight-line" so the app can say it is not a road route.
Points are (lat, lng). OSRM wants lng,lat.
"""
import httpx

from app.config import settings
from app.core.geo import haversine_m

FALLBACK_SPEED_MS = 25 / 3.6  # urban average for straight-line ETAs
MAX_START_SNAP_M = 250  # do not start kilometres away from the operator's GPS fix
MAX_STOP_SNAP_M = 1500  # longer bike access remains visible as a dashed segment
STEP_KEYS = ("name", "ref", "destinations", "exits", "rotary_name", "mode", "driving_side", "distance", "duration")

_client = httpx.Client(timeout=3)


def _coords(points: list[tuple[float, float]]) -> str:
    return ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in points)


def _get(path: str, params: dict) -> dict | None:
    if settings.routing_engine != "osrm":
        return None
    try:
        r = _client.get(f"{settings.osrm_url}{path}", params=params)
        r.raise_for_status()
        data = r.json()
        return data if data.get("code") == "Ok" else None
    except (httpx.HTTPError, ValueError):
        return None


def matrix(points: list[tuple[float, float]]) -> list[list[float]] | None:
    data = _get(f"/table/v1/driving/{_coords(points)}", {"annotations": "duration"})
    return data["durations"] if data else None


def _step(s: dict) -> dict:
    m = s["maneuver"]
    return {"maneuver": {k: m[k] for k in ("type", "modifier", "location", "bearing_after", "exit") if k in m},
            **{k: s[k] for k in STEP_KEYS if k in s}}


def route(points: list[tuple[float, float]]) -> dict:
    data = _get(f"/route/v1/driving/{_coords(points)}",
                {"overview": "full", "geometries": "geojson", "steps": "true"})
    if data:
        r = data["routes"][0]
        waypoints = [w["location"] for w in data.get("waypoints", [])]
        if len(waypoints) != len(points):
            waypoints = None
        if waypoints and any(haversine_m(lat, lng, snapped[1], snapped[0]) >
                             (MAX_START_SNAP_M if i == 0 else MAX_STOP_SNAP_M)
                             for i, ((lat, lng), snapped) in enumerate(zip(points, waypoints))):
            return straight_line(points)
        return {"engine": "osrm", "geometry": r["geometry"], "distance_m": r["distance"], "duration_s": r["duration"],
                "waypoints": waypoints,
                "legs": [{"distance_m": leg["distance"], "duration_s": leg["duration"],
                          "steps": [_step(s) for s in leg["steps"]]} for leg in r["legs"]]}
    return straight_line(points)


def straight_line(points: list[tuple[float, float]]) -> dict:
    legs = []
    for (a_lat, a_lng), (b_lat, b_lng) in zip(points, points[1:]):
        d = haversine_m(a_lat, a_lng, b_lat, b_lng) * settings.detour_factor
        legs.append({"distance_m": d, "duration_s": d / FALLBACK_SPEED_MS, "steps": []})
    return {"engine": "straight-line",
            "waypoints": None,
            "geometry": {"type": "LineString", "coordinates": [[lng, lat] for lat, lng in points]},
            "distance_m": sum(leg["distance_m"] for leg in legs), "duration_s": sum(leg["duration_s"] for leg in legs),
            "legs": legs}
