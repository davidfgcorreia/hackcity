"""Abandonment verdict for one bicycle at simulated/real time `now`. Pure function.

candidate  -> outside, parked <= threshold, or only the trip-end position is known
uncertain  -> location error or comms state could place it inside / hide its position
supported  -> outside and parked > threshold, awaiting fresh evidence
eligible   -> supported + fresh observation or field confirmation -> may be dispatched
"""
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

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


@dataclass(frozen=True)
class Result:
    verdict: Verdict
    reason: str
    distance_outside_m: float | None = None
    rest_minutes: float | None = None


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
    if d <= rules.location_error_m:
        return Result(Verdict.uncertain, f"{d:.0f} m outside but location error is {rules.location_error_m:.0f} m", d, minutes)
    if v.uncertain_state:
        return Result(Verdict.uncertain, f"provider state {v.state}: position may be stale", d, minutes)
    if minutes <= rules.abandon_minutes:
        return Result(Verdict.candidate, f"{d:.0f} m outside, parked {minutes:.0f} min (needs > {rules.abandon_minutes})", d, minutes)

    fresh = (
        v.last_observed_at_rest is not None
        and v.last_observed_at_rest > v.rest_since
        and now - v.last_observed_at_rest <= timedelta(minutes=rules.fresh_max_age_min)
    )
    if field_confirmed or fresh or not rules.require_fresh_observation:
        why = "field confirmed" if field_confirmed else "fresh observation" if fresh else "fresh-evidence rule disabled"
        return Result(Verdict.eligible, f"{d:.0f} m outside for {minutes:.0f} min; {why}", d, minutes)
    return Result(Verdict.supported, f"{d:.0f} m outside for {minutes:.0f} min; awaiting fresh observation", d, minutes)
