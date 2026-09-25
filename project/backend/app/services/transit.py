"""Best-effort official transit feeds. Never turn missing data into a live estimate."""
from datetime import datetime, timezone
from time import monotonic

import httpx

TML = "https://go.tmlmobilidade.pt/hub/api/v1"
CM = "https://api.carrismetropolitana.pt/v2"
BOX = (-9.50, 38.665, -9.295, 38.78)
_cache: dict[str, tuple[float, object]] = {}


def _fetch(url: str, ttl: int = 4):
    cached = _cache.get(url)
    if cached and monotonic() - cached[0] < ttl:
        return cached[1]
    r = httpx.get(url, timeout=8)
    r.raise_for_status()
    payload = r.json()
    _cache[url] = (monotonic(), payload)
    return payload


def _items(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        data = payload.get("data", payload)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("vehicles") or data.get("positions") or data.get("entity") or []
    return []


def _vehicle(row, source):
    if not isinstance(row, dict):
        return None
    vehicle_data = row.get("vehicle") if isinstance(row.get("vehicle"), dict) else {}
    pos = row.get("position") or vehicle_data.get("position") or row
    if not isinstance(pos, dict):
        return None
    lat = pos.get("lat", pos.get("latitude"))
    lon = pos.get("lon", pos.get("longitude"))
    try:
        lat, lon = float(lat), float(lon)
    except (ValueError, TypeError):
        return None
    if not (BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]):
        return None
    stamp = row.get("timestamp") or row.get("received_at") or row.get("created_at") or row.get("observed_at")
    if isinstance(stamp, (int, float)) and stamp > 1e11:
        stamp /= 1000
    try:
        observed = datetime.fromtimestamp(float(stamp), timezone.utc) if stamp else None
    except (ValueError, TypeError, OverflowError):
        observed = None
    if observed is None or abs((datetime.now(timezone.utc) - observed).total_seconds()) > 120:
        return None
    trip = row.get("trip") or {}
    if not isinstance(trip, dict):
        trip = {}
    speed = pos.get("speed", row.get("speed"))
    try:
        speed_mps = float(speed) / 3.6 if speed is not None else None
    except (ValueError, TypeError):
        speed_mps = None
    return {"id": str(row.get("id") or row.get("vehicle_id") or vehicle_data.get("id") or ""),
            "lat": lat, "lon": lon, "speed_mps": speed_mps,
            "bearing": pos.get("bearing", row.get("bearing")),
            "agency_id": str(row.get("agency_id") or ""),
            "route": str(row.get("line_id") or row.get("route_short_name") or row.get("route_id") or trip.get("route_id") or ""),
            "trip_id": str(row.get("trip_id") or trip.get("trip_id") or ""),
            "stop_id": str(row.get("stop_id") or row.get("current_stop_id") or ""),
            "observed_at": observed.isoformat(), "source": source}


def vehicles():
    errors = []
    collected = []
    for source, url in (("TML GO", f"{TML}/realtime/vehicles/positions"),
                        ("Carris Metropolitana", f"{CM}/vehicles")):
        try:
            collected.extend(v for row in _items(_fetch(url)) if (v := _vehicle(row, source)))
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            errors.append(f"{source}: {type(exc).__name__}")
    unique = {}
    for v in collected:
        key = (v["route"], v["id"])
        if key not in unique or v["observed_at"] > unique[key]["observed_at"]:
            unique[key] = v
    return {"vehicles": list(unique.values()), "errors": errors,
            "fetched_at": datetime.now(timezone.utc).isoformat()}


def arrivals(stop_id: str):
    if not stop_id.isalnum() or len(stop_id) > 40:
        return {"arrivals": [], "error": "invalid stop ID"}
    try:
        payload = _fetch(f"{TML}/realtime/eta/by-stop/{stop_id}", 15)
        result = []
        for row in _items(payload) if isinstance(payload, dict) and "data" not in payload else payload.get("data", []):
            if not isinstance(row, dict):
                continue
            trip_id = str(row.get("trip_id") or "")
            eta_at = row.get("eta_at")
            if not eta_at:
                continue
            try:
                eta = datetime.fromtimestamp(float(eta_at) / 1000, timezone.utc)
            except (ValueError, TypeError, OverflowError):
                continue
            if (eta - datetime.now(timezone.utc)).total_seconds() < -60:
                continue
            result.append({"route": trip_id.split("]")[-1].split("_")[0], "trip_id": trip_id,
                           "vehicle_id": row.get("vehicle_id"), "eta_at": eta.isoformat(),
                           "eta_seconds": row.get("eta_seconds"), "source": "TML GO"})
        return {"arrivals": sorted(result, key=lambda x: x["eta_at"])[:20],
                "source": "TML GO", "kind": "live estimate"}
    except (httpx.HTTPError, ValueError, TypeError):
        return {"arrivals": [], "source": "TML GO", "error": "live arrival estimates unavailable"}
