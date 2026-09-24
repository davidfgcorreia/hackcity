"""Operational "now": the replay's simulated time in demo mode, wall-clock UTC otherwise."""
from datetime import datetime, timezone

_sim_time: datetime | None = None


def set_sim_time(t: datetime | None) -> None:
    global _sim_time
    _sim_time = t


def now() -> datetime:
    return _sim_time or datetime.now(timezone.utc)
