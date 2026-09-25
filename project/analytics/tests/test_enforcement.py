"""The enforcement window: the 120-minute clock counts only 08:00–20:00 Europe/Lisbon."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from analytics.enforcement import enforced_minutes, threshold_reached_at

LISBON = ZoneInfo("Europe/Lisbon")


def lisbon(*args):
    return datetime(*args, tzinfo=LISBON)


def test_daytime_parking_counts_every_minute():
    assert enforced_minutes(lisbon(2026, 9, 1, 10), lisbon(2026, 9, 1, 12, 30), LISBON) == 150


def test_clock_pauses_from_20_to_08():
    assert enforced_minutes(lisbon(2026, 9, 1, 19, 30), lisbon(2026, 9, 2, 9, 30), LISBON) == 120
    assert threshold_reached_at(lisbon(2026, 9, 1, 19, 30), 120, LISBON) == lisbon(2026, 9, 2, 9, 30)


def test_parking_before_8_starts_counting_at_8():
    assert threshold_reached_at(lisbon(2026, 9, 1, 2), 120, LISBON) == lisbon(2026, 9, 1, 10)


def test_window_follows_lisbon_wall_clock_across_the_october_time_change():
    # 25 Oct 2026: clocks go back at 02:00; 08:00 Lisbon is 07:00 UTC before and 08:00 UTC after.
    start = datetime(2026, 10, 24, 18, 0, tzinfo=timezone.utc)  # 19:00 Lisbon (UTC+1)
    assert threshold_reached_at(start, 120, LISBON) == datetime(2026, 10, 25, 9, 0, tzinfo=timezone.utc)  # 09:00 Lisbon (UTC)


def test_empty_or_reversed_interval_counts_nothing():
    t = lisbon(2026, 9, 1, 10)
    assert enforced_minutes(t, t, LISBON) == 0
