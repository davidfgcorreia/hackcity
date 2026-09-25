from datetime import datetime, timedelta, timezone

from app.api.stations import MIN_BENCHMARK_DAYS, TargetIn, set_station_target, station_balance
from app.models import Station, StationStatus


def add_station(db, days_of_history: int, peak: int, current: int):
    now = datetime.now(timezone.utc)
    db.add(Station(id="s1", name="Station", lat=38.7, lng=-9.4, area={"type": "MultiPolygon", "coordinates": []}))
    for day in range(1, days_of_history):
        at = now - timedelta(days=day)
        db.add(StationStatus(station_id="s1", bikes_available=peak, collected_at=at, reported_at=at))
    db.add(StationStatus(station_id="s1", bikes_available=current, collected_at=now, reported_at=now))
    db.commit()


def test_station_balance_withholds_peak_benchmark_until_enough_days_are_observed(db):
    add_station(db, days_of_history=2, peak=10, current=5)

    [row] = station_balance(db)
    assert row["observed_peak"] == 10
    assert row["benchmark"] is None
    assert row["benchmark_status"] == "insufficient_history"
    assert row["occupancy_ratio"] is None


def test_station_balance_uses_status_peak_then_saved_operator_target(db):
    add_station(db, days_of_history=MIN_BENCHMARK_DAYS, peak=10, current=5)

    [initial] = station_balance(db)
    assert initial["observed_days"] >= MIN_BENCHMARK_DAYS
    assert initial["benchmark_status"] == "observed_peak"
    assert float(initial["occupancy_ratio"]) == 0.5

    set_station_target("s1", TargetIn(bikes=20), db)
    [updated] = station_balance(db)
    assert updated["operator_target"] == 20
    assert updated["benchmark_status"] == "operator_target"
    assert float(updated["occupancy_ratio"]) == 0.25


def test_operator_target_applies_without_snapshot_history(db):
    add_station(db, days_of_history=1, peak=0, current=3)
    set_station_target("s1", TargetIn(bikes=6), db)

    [row] = station_balance(db)
    assert row["benchmark_status"] == "operator_target"
    assert float(row["occupancy_ratio"]) == 0.5
