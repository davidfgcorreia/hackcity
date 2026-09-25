"""Enforcement window for the abandonment clock. Pure functions, kept identical to
backend/app/core/enforcement.py so historical analysis applies the operational rule.

Only minutes inside the daily window (08:00–20:00 Europe/Lisbon by default) count toward the
abandonment threshold; the clock pauses outside it. A bike parked at 19:30 has 30 counted minutes
at 20:00 and reaches 120 at 09:30 the next day. Windows are built per local date, so daylight-saving
changes shift them with the wall clock.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo


def _windows(start: datetime, end: datetime, tz: ZoneInfo, from_hour: int, until_hour: int):
    day = start.astimezone(tz).date()
    last = end.astimezone(tz).date()
    while day <= last:
        yield datetime.combine(day, time(from_hour), tz), datetime.combine(day, time(until_hour), tz)
        day += timedelta(days=1)


def enforced_minutes(start: datetime, end: datetime, tz: ZoneInfo, from_hour: int = 8, until_hour: int = 20) -> float:
    """Minutes of [start, end) that fall inside the daily enforcement window."""
    if end <= start:
        return 0.0
    total = 0.0
    for w0, w1 in _windows(start, end, tz, from_hour, until_hour):
        lo, hi = max(start, w0), min(end, w1)
        if hi > lo:
            total += (hi - lo).total_seconds() / 60
    return total


def threshold_reached_at(start: datetime, minutes: float, tz: ZoneInfo, from_hour: int = 8, until_hour: int = 20) -> datetime:
    """The moment the enforced clock started at `start` reaches `minutes` counted minutes."""
    remaining = minutes
    horizon = start + timedelta(days=max(2, int(minutes // max(1, (until_hour - from_hour) * 60)) + 2))
    for w0, w1 in _windows(start, horizon, tz, from_hour, until_hour):
        lo = max(start, w0)
        if w1 <= lo:
            continue
        available = (w1 - lo).total_seconds() / 60
        if available >= remaining:
            return lo + timedelta(minutes=remaining)
        remaining -= available
    raise ValueError("threshold beyond horizon")  # unreachable for a positive window
