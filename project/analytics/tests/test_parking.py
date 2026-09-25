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


def test_clock_counts_only_enforcement_hours_so_evening_parking_is_abandoned_next_morning():
    # 18:30 UTC = 19:30 Lisbon (summer time): 30 counted minutes, paused overnight, 120 reached 09:30 Lisbon.
    start = datetime(2026, 9, 1, 18, 30, tzinfo=timezone.utc)
    [iv] = intervals(pd.DataFrame([{"device_id": "b1", "event_time": start, "vehicle_state": "available",
                                    "event_type": "trip_end", "lat": POS[0], "lon": POS[1]}]),
                     start + timedelta(hours=16))
    assert iv["minutes"] == 16 * 60
    assert iv["enforced_minutes"] == 30 + 210  # 19:30-20:00 and 08:00-11:30 Lisbon
    assert iv["abandoned_at"] == datetime(2026, 9, 2, 8, 30, tzinfo=timezone.utc)  # 09:30 Lisbon


def test_night_parking_does_not_reach_the_threshold():
    start = datetime(2026, 9, 1, 21, 0, tzinfo=timezone.utc)  # 22:00 Lisbon
    [iv] = intervals(pd.DataFrame([{"device_id": "b1", "event_time": start, "vehicle_state": "available",
                                    "event_type": "trip_end", "lat": POS[0], "lon": POS[1]}]),
                     start + timedelta(hours=9))  # 07:00 Lisbon
    assert iv["enforced_minutes"] == 0 and iv["abandoned_at"] is None


def test_window_switched_off_counts_every_minute():
    from analytics.derive.parking import counted_clock
    start = datetime(2026, 9, 1, 21, 0, tzinfo=timezone.utc)  # 22:00 Lisbon
    counted, at = counted_clock(start, start + timedelta(minutes=150), window=False)
    assert counted == 150 and at == start + timedelta(minutes=120)
    counted, at = counted_clock(start, start + timedelta(minutes=150), window=True)
    assert counted == 0 and at is None
