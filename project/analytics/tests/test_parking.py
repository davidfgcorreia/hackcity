from datetime import datetime, timedelta, timezone

import pandas as pd

from analytics.derive.parking import intervals

T0 = datetime(2026, 9, 1, 10, tzinfo=timezone.utc)
POS = (38.70, -9.42)


def ev(minutes, state, etype, pos=POS, device="b1"):
    return {"device_id": device, "event_time": T0 + timedelta(minutes=minutes), "vehicle_state": state,
            "event_type": etype, "lat": pos[0], "lon": pos[1]}


def run(*events, end=600):
    return intervals(pd.DataFrame(events), T0 + timedelta(minutes=end))


def test_trip_start_ends_interval_as_new_trip():
    [iv] = run(ev(0, "available", "trip_end"), ev(150, "on_trip", "trip_start"))
    assert iv["end_reason"] == "new_trip" and iv["minutes"] == 150 and not iv["left_censored"]


def test_provider_pickup_is_recovery():
    [iv] = run(ev(0, "available", "trip_end"), ev(300, "removed", "maintenance_pick_up"))
    assert iv["end_reason"] == "provider_recovery"


def test_same_position_telemetry_is_later_evidence_not_a_new_interval():
    [iv] = run(ev(0, "available", "trip_end"), ev(130, "available", "battery_low"), ev(200, "on_trip", "trip_start"))
    assert iv["observations"] == 1 and iv["later_evidence"]


def test_cancelled_trip_without_move_keeps_one_interval():
    [iv] = run(ev(0, "available", "trip_end"), ev(60, "available", "trip_cancel"), ev(200, "on_trip", "trip_start"))
    assert iv["minutes"] == 200


def test_real_move_splits_interval():
    ivs = run(ev(0, "available", "trip_end"), ev(60, "available", "located", (38.701, -9.42)))
    assert [i["end_reason"] for i in ivs] == ["moved", "censored"]


def test_open_interval_is_censored_at_data_end():
    [iv] = run(ev(0, "available", "trip_end"), end=500)
    assert iv["end_reason"] == "censored" and iv["minutes"] == 500
