"""Per-station Bird performance score: is Bird doing a good job at this station?

An open, provisional composite (not a contractual KPI). Each part is 0–1 and comes from Bird's own
event log, 19 Aug–8 Sep 2026 (station stock from 25 Aug):

  availability   1 − empty service hours ÷ service hours (07–21 h), from the rebuilt station stock
  refill         Bird's share of the refills when the station went empty (vs riders); missing if never empty
  collection     share of the abandonments near the station (nearest station area within 300 m) that Bird
                 collected; missing below MIN_ABANDONMENTS so one or two events do not decide it

Score = 100 × mean of the parts that exist. A missing part is excluded, never counted as zero, and the
number of parts used is reported next to the score.
"""
from __future__ import annotations

MIN_ABANDONMENTS = 3
CATCHMENT_M = 300
GOOD, FAIR = 70.0, 40.0


def band(score: float | None) -> str | None:
    if score is None:
        return None
    return "good" if score >= GOOD else "fair" if score >= FAIR else "poor"


def parts(service_hours: float, empty_hours: float, refilled_by_bird: int, refilled_by_rider: int,
          abandonments_near: int, bird_collected_near: int) -> dict[str, float | None]:
    refills = refilled_by_bird + refilled_by_rider
    return {
        "availability": None if not service_hours else max(0.0, 1 - empty_hours / service_hours),
        "refill": None if not refills else refilled_by_bird / refills,
        "collection": None if abandonments_near < MIN_ABANDONMENTS else bird_collected_near / abandonments_near,
    }


def station_score(p: dict[str, float | None]) -> tuple[float | None, int, str | None]:
    """(score 0–100 or None, number of parts used, band)."""
    used = [v for v in p.values() if v is not None]
    if not used:
        return None, 0, None
    score = round(100 * sum(used) / len(used), 1)
    return score, len(used), band(score)
