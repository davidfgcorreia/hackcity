"""Abandonment verdict for one bicycle at simulated/real time `now`. Pure function.

candidate  -> outside, parked <= threshold, or only the trip-end position is known

The threshold counts only minutes inside the daily enforcement window (default 08:00–20:00
Europe/Lisbon); outside it the clock pauses (see app.core.enforcement).
uncertain  -> location error or comms state could place it inside / hide its position
supported  -> outside and parked > threshold, awaiting fresh evidence
eligible   -> supported + fresh observation or field confirmation -> may be dispatched
"""
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

from app.core.enforcement import enforced_minutes

from app.core.vehicle_state import VehicleState


class Verdict(StrEnum):
    none = "none"  # inside permitted area: no case
    gone = "gone"  # not at rest (trip, removed, ...): resolves any open case
    candidate = "candidate"
    uncertain = "uncertain"
    supported = "supported"
    eligible = "eligible"


@dataclass(frozen=True)
class Rules:
    abandon_minutes: int = 120
    fresh_max_age_min: int = 60
    require_fresh_observation: bool = True
    location_error_m: float = 0.0
    enforce_window: bool = True
    enforce_from_hour: int = 8
    enforce_until_hour: int = 20
    enforce_tz: str = "Europe/Lisbon"

    def counted_minutes(self, start: datetime, end: datetime) -> float:
        if not self.enforce_window:
            return max(0.0, (end - start).total_seconds() / 60)
        return enforced_minutes(start, end, ZoneInfo(self.enforce_tz), self.enforce_from_hour, self.enforce_until_hour)

    @property
    def window_label(self) -> str:
        return f"{self.enforce_from_hour:02d}:00–{self.enforce_until_hour:02d}:00" if self.enforce_window else "24 h"


@dataclass(frozen=True)
class Result:
    verdict: Verdict
    reason: str
    distance_outside_m: float | None = None
    rest_minutes: float | None = None     # wall-clock minutes at rest
    counted_minutes: float | None = None  # minutes inside the enforcement window


def evaluate(
    v: VehicleState,
    distance_outside_m: Callable[[float, float], float],
    now: datetime,
    rules: Rules,
    field_confirmed: bool = False,
) -> Result:
    if not v.at_rest or v.lat is None:
        return Result(Verdict.gone, f"not at rest (state={v.state})")

    d = distance_outside_m(v.lat, v.lng)
    if d == 0:
        return Result(Verdict.none, "inside station area + buffer", 0.0)

    minutes = (now - v.rest_since).total_seconds() / 60
    counted = rules.counted_minutes(v.rest_since, now)
    window = rules.window_label
    if d <= rules.location_error_m:
        return Result(Verdict.uncertain, f"{d:.0f} m outside but location error is {rules.location_error_m:.0f} m", d, minutes, counted)
    if v.uncertain_state:
        return Result(Verdict.uncertain, f"provider state {v.state}: position may be stale", d, minutes, counted)
    if counted <= rules.abandon_minutes:
        return Result(Verdict.candidate, f"{d:.0f} m outside, parked {minutes:.0f} min, {counted:.0f} counted in {window} "
                                         f"(needs > {rules.abandon_minutes})", d, minutes, counted)

    fresh = (
        v.last_observed_at_rest is not None
        and v.last_observed_at_rest > v.rest_since
        and now - v.last_observed_at_rest <= timedelta(minutes=rules.fresh_max_age_min)
    )
    if field_confirmed or fresh or not rules.require_fresh_observation:
        why = "field confirmed" if field_confirmed else "fresh observation" if fresh else "fresh-evidence rule disabled"
        return Result(Verdict.eligible, f"{d:.0f} m outside, {counted:.0f} min counted in {window}; {why}", d, minutes, counted)
    return Result(Verdict.supported, f"{d:.0f} m outside, {counted:.0f} min counted in {window}; awaiting fresh observation", d, minutes, counted)
