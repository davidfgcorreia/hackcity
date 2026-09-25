from datetime import datetime, timedelta, timezone

from app.services.transit import _vehicle


def test_tml_position_uses_observation_time_and_converts_speed():
    now = datetime.now(timezone.utc)
    row = {"vehicle_id": "[HF16N]42", "agency_id": "HF16N", "latitude": 38.7,
           "longitude": -9.4, "route_short_name": "M01", "speed": 36,
           "received_at": int(now.timestamp() * 1000)}
    vehicle = _vehicle(row, "TML GO")
    assert vehicle is not None
    assert vehicle["route"] == "M01"
    assert vehicle["speed_mps"] == 10
    assert vehicle["source"] == "TML GO"


def test_stale_or_out_of_area_position_is_not_shown_as_live():
    now = datetime.now(timezone.utc)
    stale = {"id": "1", "lat": 38.7, "lon": -9.4, "timestamp": int((now - timedelta(minutes=3)).timestamp())}
    far = {"id": "2", "lat": 38.9, "lon": -9.4, "timestamp": int(now.timestamp())}
    assert _vehicle(stale, "Carris Metropolitana") is None
    assert _vehicle(far, "Carris Metropolitana") is None
