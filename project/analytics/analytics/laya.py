"""Laya: the open recommendation model for new bike-station areas in Cascais.

Laya re-ranks the station candidate cells (`derived.station_candidates`, eligible = score not
withheld) with every weight, normalisation and threshold written in this file. It is pure Python
so the same inputs always give the same score, and anyone can read, test or change it.

Score (0–100) = 100 × Σ weight × component, components in 0–1:
  demand         30 %  percentile of observed trip starts + ends in the cell
  abandonment    20 %  percentile of outside-station parkings > 120 counted min (enforcement clock)
  consistency    15 %  distinct active days / observed days (steady use beats one busy day)
  coverage_gain  15 %  distance to the nearest station area, 150 m → 0, 1,000 m → 1
  footfall       10 %  percentile of MobiCascais boardings within 333 m (boardings, not people)
  transit_gap    10 %  1 − min(1, scheduled departures/h within 333 m ÷ 6)

Confidence (0–1) measures how much evidence stands behind the score, not how high it is.
Robustness is the share of randomly perturbed weightings (each weight × U(0.5, 1.5)) in which the
cell stays in the top N. Both are reported next to the score; none of this is an approved siting
decision, and legal/safety feasibility is not checked.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any

VERSION = "laya-1.0"
OBSERVED_DAYS = 21  # full Lisbon days 19 Aug–8 Sep 2026; 9 Sep holds only 19 trips after midnight (capped at 1)
PERTURBATIONS = 500
SEED = 7


@dataclass(frozen=True)
class Component:
    key: str
    weight: float
    input: str
    label: str
    method: str


COMPONENTS: tuple[Component, ...] = (
    Component("demand", 0.30, "trip_endpoints", "Observed demand", "percentile of trip starts + ends in the cell"),
    Component("abandonment", 0.20, "supported_120", "Abandonment pressure", "percentile of outside parkings > 120 counted min"),
    Component("consistency", 0.15, "active_days", "Consistency", f"active days ÷ {OBSERVED_DAYS} observed days"),
    Component("coverage_gain", 0.15, "nearest_station_m", "Coverage gain", "distance to nearest station, 150 m → 0, 1 km → 1"),
    Component("footfall", 0.10, "weekly_boardings_333m", "Transit footfall", "percentile of bus boardings within 333 m"),
    Component("transit_gap", 0.10, "departures_per_hour_333m", "Transit gap", "1 − departures/h within 333 m ÷ 6, floored at 0"),
)
WEIGHTS = {c.key: c.weight for c in COMPONENTS}


def model_card() -> dict[str, Any]:
    return {
        "name": "Laya", "version": VERSION, "openness": "open specification: weights, rules and code in analytics/laya.py; no licence file is committed yet",
        "components": [c.__dict__ for c in COMPONENTS],
        "confidence": "0.5 × trip volume (log scale, 60 = full) + 0.25 × outside parkings (20 = full) + 0.25 × active days (10 = full)",
        "robustness": f"share of {PERTURBATIONS} weightings (each weight × U(0.5, 1.5), seed {SEED}) keeping the cell in the top N",
        "eligibility": "candidate cells > 150 m from every station area with at least 5 outside-station parkings",
        "not_modelled": ["walk/cycle network journey improvement", "population / equity (census not ingested)",
                         "legal and safety feasibility", "bus delay at stop level"],
    }


def percentile_ranks(values: list[float]) -> list[float]:
    """Mid-rank percentile in 0–1; ties share a value and a single value maps to 0.5."""
    n = len(values)
    if n == 1:
        return [0.5]
    order = sorted(values)
    out = []
    for v in values:
        below = sum(1 for x in order if x < v)
        equal = sum(1 for x in order if x == v)
        out.append((below + (equal - 1) / 2) / (n - 1))
    return out


def _num(v: Any) -> float:
    return float(v) if v is not None else 0.0


def components(cells: list[dict[str, Any]]) -> list[dict[str, float]]:
    """Normalise every component for the pool; percentile components are relative to the pool."""
    pct = {key: percentile_ranks([_num(c[inp]) for c in cells])
           for key, inp in (("demand", "trip_endpoints"), ("abandonment", "supported_120"), ("footfall", "weekly_boardings_333m"))}
    out = []
    for i, c in enumerate(cells):
        out.append({
            "demand": pct["demand"][i],
            "abandonment": pct["abandonment"][i],
            "consistency": min(1.0, _num(c["active_days"]) / OBSERVED_DAYS),
            "coverage_gain": min(1.0, max(0.0, (_num(c["nearest_station_m"]) - 150) / 850)),
            "footfall": pct["footfall"][i],
            "transit_gap": 1 - min(1.0, _num(c["departures_per_hour_333m"]) / 6),
        })
    return out


def weighted(comp: dict[str, float], weights: dict[str, float]) -> float:
    return sum(weights[k] * comp[k] for k in weights) / sum(weights.values())


def confidence(cell: dict[str, Any]) -> float:
    volume = min(1.0, math.log1p(_num(cell["trip_endpoints"])) / math.log1p(60))
    parking = min(1.0, _num(cell["outside_intervals"]) / 20)
    days = min(1.0, _num(cell["active_days"]) / 10)
    return round(0.5 * volume + 0.25 * parking + 0.25 * days, 3)


def confidence_label(v: float) -> str:
    return "high" if v >= 0.7 else "medium" if v >= 0.45 else "low"


def robustness(comps: list[dict[str, float]], top_n: int) -> list[float]:
    rng = random.Random(SEED)
    hits = [0] * len(comps)
    for _ in range(PERTURBATIONS):
        w = {k: v * rng.uniform(0.5, 1.5) for k, v in WEIGHTS.items()}
        scores = [weighted(c, w) for c in comps]
        for i in sorted(range(len(comps)), key=lambda i: -scores[i])[:top_n]:
            hits[i] += 1
    return [round(h / PERTURBATIONS, 3) for h in hits]


def reasons(cell: dict[str, Any], contrib: dict[str, float]) -> tuple[list[str], list[str]]:
    why = []
    for key, _ in sorted(contrib.items(), key=lambda kv: -kv[1])[:3]:
        why.append({
            "demand": f"{int(_num(cell['trip_endpoints']))} trip starts + ends in this {int(_num(cell.get('size_m', 250)))} m cell",
            "abandonment": f"{int(_num(cell['supported_120']))} bikes left > 120 min outside a station",
            "consistency": f"used on {int(_num(cell['active_days']))} of {OBSERVED_DAYS} days",
            "coverage_gain": f"{int(_num(cell['nearest_station_m']))} m from the nearest station area",
            "footfall": f"{int(_num(cell['weekly_boardings_333m']))} bus boardings within 333 m in one week",
            "transit_gap": (f"only {_num(cell['departures_per_hour_333m']):.1f} scheduled departures/h within 333 m"
                            if _num(cell["departures_per_hour_333m"]) else "no scheduled bus/rail departures within 333 m"),
        }[key])
    caveats = []
    if _num(cell.get("weekend_share")) >= 0.6:
        caveats.append("mostly weekend use: likely leisure, check seasonality")
    if cell.get("median_hours_parked") is not None and _num(cell["median_hours_parked"]) < 1:
        caveats.append("outside parkings are usually short (median < 1 h)")
    if _num(cell["active_days"]) < 5:
        caveats.append("activity concentrated on few days")
    if _num(cell["nearest_station_m"]) > 1500:
        caveats.append("far from the network: rebalancing cost is higher")
    return why, caveats


def verdict(score: float, conf: float, robust: float) -> str:
    if score >= 60 and conf >= 0.45 and robust >= 0.6:
        return "strong candidate"
    if score >= 50 and robust >= 0.3:
        return "pilot first (virtual station)"
    return "monitor"


def rank(cells: list[dict[str, Any]], top_n: int = 10) -> list[dict[str, Any]]:
    """Score every eligible cell; return all of them sorted by Laya score with explanations."""
    if not cells:
        return []
    comps = components(cells)
    robust = robustness(comps, min(top_n, len(cells)))
    out = []
    for cell, comp, rob in zip(cells, comps, robust):
        contrib = {k: 100 * WEIGHTS[k] * comp[k] for k in WEIGHTS}
        score = round(sum(contrib.values()), 1)
        conf = confidence(cell)
        why, caveats = reasons(cell, contrib)
        out.append({**cell, "laya_score": score, "confidence": conf, "confidence_label": confidence_label(conf),
                    "robustness": rob, "verdict": verdict(score, conf, rob),
                    "components": {k: round(v, 3) for k, v in comp.items()},
                    "contributions": {k: round(v, 1) for k, v in contrib.items()},
                    "reasons": why, "caveats": caveats})
    out.sort(key=lambda r: (-r["laya_score"], -r["confidence"], r["cell_id"]))
    for i, r in enumerate(out, 1):
        r["laya_rank"] = i
    return out
