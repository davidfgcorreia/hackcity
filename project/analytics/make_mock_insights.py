"""Write mock /insights JSON in the contract documented in README.md (task F4).

The point is that the page can be built, reviewed and demonstrated before F1-F3 exist, without
anyone mistaking the numbers for measurements: every file carries "status": "mock" and the page
shows a banner while it does. Replacing this script with the real analysis is F1-F3; it must
write the same filenames with "status": "observed".

    python project/analytics/make_mock_insights.py
"""
from __future__ import annotations

import json
import math
import random
from datetime import UTC, datetime
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "analytics"

# Cascais operating area, roughly. Screening grid is 250 m in EPSG:3763 (requirements doc,
# "Common display and data rules"); degrees here are only for drawing the mock cells.
SOUTH, WEST, NORTH, EAST = 38.686, -9.480, 38.746, -9.360
CELL_M = 250
LAT_PER_M = 1 / 111_320
LNG_PER_M = 1 / (111_320 * math.cos(math.radians(38.71)))

WEIGHTS = {
    "demand": 0.35,
    "parking_opportunity": 0.25,
    "journey_improvement": 0.20,
    "coverage_gap": 0.10,
    "equity": 0.05,
    "bus_delay": 0.05,
}
COMPONENT_UNITS = {
    "demand": "trip endpoints",
    "parking_opportunity": "supported intervals",
    "journey_improvement": "minutes saved (modelled)",
    "coverage_gap": "m to nearest station",
    "equity": "residents within 300 m",
    "bus_delay": "pooled median delay, min",
}
STATIONS = [
    ("cascais-001", "Estação de Cascais", 38.6979, -9.4215),
    ("cascais-002", "Mercado da Vila", 38.6996, -9.4188),
    ("cascais-003", "Parede", 38.6905, -9.3560),
    ("cascais-004", "Carcavelos praia", 38.6807, -9.3372),
    ("cascais-005", "Alcabideche", 38.7288, -9.4102),
    ("cascais-006", "São Domingos de Rana", 38.7010, -9.3390),
    ("cascais-007", "Guia", 38.7020, -9.4520),
    ("cascais-008", "Birre", 38.7215, -9.4405),
]


def meta(note: str) -> dict:
    return {
        "status": "mock",
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "observed_from": "2026-08-18",
        "observed_to": "2026-09-08",
        "timezone_display": "Europe/Lisbon",
        "coverage": "Cascais operating area",
        "grid": {"crs": "EPSG:3763", "cell_m": CELL_M},
        "sources": [
            {"name": "viagens.xlsx", "retrieved": "2026-09-11", "rows": 53764},
            {"name": "station_information.json", "retrieved": "2026-09-11", "rows": 157},
        ],
        "notes": [note, "Mock values. No measurement has been performed yet (F1-F3 open)."],
    }


def cell_bounds(lat: float, lng: float) -> list[list[float]]:
    dlat, dlng = CELL_M * LAT_PER_M / 2, CELL_M * LNG_PER_M / 2
    return [[round(lat - dlat, 6), round(lng - dlng, 6)], [round(lat + dlat, 6), round(lng + dlng, 6)]]


def grid_centres() -> list[tuple[float, float]]:
    step_lat, step_lng = CELL_M * LAT_PER_M, CELL_M * LNG_PER_M
    out, lat = [], SOUTH
    while lat < NORTH:
        lng = WEST
        while lng < EAST:
            out.append((round(lat, 6), round(lng, 6)))
            lng += step_lng
        lat += step_lat
    return out


def recovery_kpis(rng: random.Random) -> dict:
    rows = []
    for i, (lat, lng) in enumerate(grid_centres()):
        # Demand thins out away from the coastal strip, so most cells carry nothing worth showing.
        pull = max(0.0, 1 - abs(lat - 38.699) / 0.045) * max(0.0, 1 - abs(lng + 9.41) / 0.075)
        trip_ends = int(rng.gammavariate(1.6, 90) * pull)
        if trip_ends < 12:
            continue
        intervals = rng.binomialvariate(n=trip_ends, p=0.02) if hasattr(rng, "binomialvariate") else \
            sum(rng.random() < 0.02 for _ in range(trip_ends))
        thin = intervals < 5  # requirements doc: suppress the score, keep the count visible
        provider = None if rng.random() < 0.25 else round(rng.uniform(4, 40), 1)
        rows.append({
            "id": f"cell-{i:04d}",
            "unit": "cell",
            "name": f"Grid {i:04d}",
            "lat": lat,
            "lng": lng,
            "bounds": cell_bounds(lat, lng),
            "station_id": None,
            "trip_ends": trip_ends,
            "abandonments": intervals,
            "abandonments_per_100_trip_ends": None if thin else round(100 * intervals / trip_ends, 2),
            "idle_hours_median": None if thin else round(rng.uniform(2.5, 30), 1),
            "hours_to_provider_pickup_median": None if thin else provider,
            "distinct_intervals": intervals,
            "quality": "insufficient_observations" if thin else "ok",
            "evidence": "observed",
        })
    rows.sort(key=lambda r: -(r["abandonments_per_100_trip_ends"] or -1))
    return {"meta": meta("Recovery KPIs per 250 m screening cell (F1)."), "rows": rows}


def station_opportunity(rng: random.Random) -> dict:
    """Candidate areas, not sites. Score weights are visible and the bus component is often
    missing, which must show a neutral 0.5 plus a rank without it."""
    candidates = [
        ("Alcabideche norte", 38.7331, -9.4090), ("Manique de Baixo", 38.7286, -9.3830),
        ("Tires / aeródromo", 38.7168, -9.3600), ("Abóboda centro", 38.7092, -9.3532),
        ("Parede interior", 38.6939, -9.3585), ("Birre / Quinta da Marinha", 38.7180, -9.4412),
        ("Cobre / Trajouce", 38.7239, -9.3466), ("Caparide", 38.7101, -9.3710),
        ("Murtal", 38.6870, -9.3496), ("Livramento", 38.7150, -9.3958),
    ]
    rows = []
    for i, (name, lat, lng) in enumerate(candidates, start=1):
        intervals = rng.choice([22, 18, 31, 14, 9, 3, 27, 11, 4, 16])
        thin = intervals < 5
        has_bus = rng.random() > 0.35
        delay_raw = round(rng.uniform(0.5, 12), 1) if has_bus else None
        components = {}
        for key in WEIGHTS:
            if key == "bus_delay":
                components[key] = {
                    "value": round(min(1, max(0, delay_raw / 10)), 3) if has_bus else 0.5,
                    "raw": delay_raw,
                    "unit": COMPONENT_UNITS[key],
                    "available": has_bus,
                }
                continue
            value = round(rng.uniform(0.25, 0.97), 3)
            raw = {
                "demand": int(value * 900),
                "parking_opportunity": intervals,
                "journey_improvement": round(value * 7, 1),
                "coverage_gap": int(1500 - value * 1100),
                "equity": int(value * 2600),
            }[key]
            components[key] = {"value": value, "raw": raw, "unit": COMPONENT_UNITS[key], "available": True}

        score = None if thin else round(sum(WEIGHTS[k] * c["value"] for k, c in components.items()), 3)
        without = None
        if score is not None:
            rescaled = sum(WEIGHTS[k] * c["value"] for k, c in components.items() if k != "bus_delay")
            without = round(rescaled / (1 - WEIGHTS["bus_delay"]), 3)
        rows.append({
            "id": f"cand-{i:02d}",
            "name": name,
            "lat": lat,
            "lng": lng,
            "bounds": cell_bounds(lat, lng),
            "score": score,
            "rank": None,
            "score_without_bus_delay": without,
            "rank_without_bus_delay": None,
            "components": components,
            "distinct_intervals": intervals,
            "nearest_station_m": int(rng.uniform(380, 2400)),
            "quality": "insufficient_observations" if thin else "ok",
            "evidence": "inferred_proxy",
            "blockers": ["site feasibility unchecked"] + ([] if has_bus else ["no reliable nearby bus delay"]),
        })

    _rank(rows, "score", "rank")
    _rank(rows, "score_without_bus_delay", "rank_without_bus_delay")
    rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0))
    return {
        "meta": meta("Candidate areas for screening (F2). Weights are provisional and unapproved."),
        "weights": WEIGHTS,
        "rows": rows,
    }


def _rank(rows: list[dict], score_key: str, rank_key: str) -> None:
    ordered = sorted([r for r in rows if r[score_key] is not None], key=lambda r: -r[score_key])
    for position, row in enumerate(ordered, start=1):
        row[rank_key] = position


def supply_demand(rng: random.Random) -> dict:
    """Departures, arrivals and net flow by station and local hour. Net flow is not stock."""
    rows = []
    for station_id, name, lat, lng in STATIONS:
        for day_type, scale in (("weekday", 1.0), ("weekend", 0.62)):
            by_hour, departures, arrivals = [], 0, 0
            for hour in range(24):
                # Two commuting humps on weekdays, one flat midday bulge at the weekend.
                shape = (math.exp(-((hour - 8.5) ** 2) / 4) + math.exp(-((hour - 18) ** 2) / 5)
                         if day_type == "weekday" else math.exp(-((hour - 14) ** 2) / 14))
                base = shape * scale * rng.uniform(16, 34)
                dep = int(max(0, rng.gauss(base, base * 0.25)))
                arr = int(max(0, rng.gauss(base * rng.uniform(0.85, 1.2), base * 0.25)))
                by_hour.append({"hour": hour, "departures": dep, "arrivals": arr, "net": arr - dep})
                departures += dep
                arrivals += arr
            rows.append({
                "station_id": station_id,
                "name": name,
                "lat": lat,
                "lng": lng,
                "day_type": day_type,
                "departures": departures,
                "arrivals": arrivals,
                "net_flow": arrivals - departures,
                "by_hour": by_hour,
                "evidence": "observed",
            })
    return {"meta": meta("Trip flow by station and local hour (F3). Net flow is not station stock."), "rows": rows}


def main() -> None:
    rng = random.Random(20260924)  # fixed seed: regenerating must not reshuffle the demo
    OUT.mkdir(parents=True, exist_ok=True)
    for name, payload in (
        ("recovery_kpis.json", recovery_kpis(rng)),
        ("station_opportunity.json", station_opportunity(rng)),
        ("supply_demand.json", supply_demand(rng)),
    ):
        path = OUT / name
        path.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"{path.relative_to(OUT.parents[3])}: {len(payload['rows'])} rows")


if __name__ == "__main__":
    main()
