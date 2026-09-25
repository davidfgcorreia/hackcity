"""Operational "now": the replay's simulated time in demo mode, wall-clock UTC otherwise."""
from datetime import datetime, timezone

_sim_time: datetime | None = None


def set_sim_time(t: datetime | None) -> None:
    global _sim_time
    _sim_time = t


def now() -> datetime:
    return _sim_time or datetime.now(timezone.utc)


def mode() -> str:
    """`replay` while a simulated clock is set (running or paused), `live` otherwise.
    Starting live clears the simulated clock (services/live.py), so the two never overlap."""
    return "replay" if _sim_time is not None else "live"
