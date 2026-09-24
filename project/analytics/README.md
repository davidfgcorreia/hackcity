# Analytics (workstream F)

Scope comes from [../../docs/analytics_prediction_requirements.md](../../docs/analytics_prediction_requirements.md).
This directory holds the derived analysis; the `/insights` page in the web app only renders
the JSON it produces and never computes a metric itself.

## Status

| Task | What | State |
|---|---|---|
| F1 | Recovery KPIs per station catchment and grid cell | **not started** — the page reads mock rows |
| F2 | Station opportunity candidates and score | **not started** — mock rows |
| F3 | Supply/demand by station and hour | **not started** — mock rows |
| F4 | `/insights` map + ranked table fed by the JSON | **done** |

`make_mock_insights.py` writes mock files in the exact contract below so F4 could be built and
reviewed before F1–F3 exist. **Every mock file carries `"status": "mock"`, and the page shows a
loud banner while that is set.** Replacing the mock generator with the real analysis is the whole
of F1–F3: write the same filenames with `"status": "observed"`.

```bash
python project/analytics/make_mock_insights.py     # rewrites the three JSON files
```

## Where the files live

The web app serves them as static assets (at `/analytics/<file>`, kept off the `/insights`
route so the SPA path and the data path cannot collide), so the analysis writes straight into
`project/frontend/public/analytics/`:

| File | Task | Layer |
|---|---|---|
| `recovery_kpis.json` | F1 | abandonments per 100 trip ends, idle hours, time to provider pickup |
| `station_opportunity.json` | F2 | candidate areas with a visible-weight score |
| `supply_demand.json` | F3 | departures, arrivals and net flow by station and hour |

## Rules the contract enforces

These come from the requirements doc's *Common display and data rules* and are not optional,
because the page renders them:

- **250-metre square grid in EPSG:3763** for screening (§ Common display and data rules). Cell
  geometry travels as WGS84 `bounds` for drawing only; all metric maths stays in EPSG:3763.
  (Note: `docs/TASKS.md` F1 says "H3 hex"; the requirements doc's recommended default is the
  250 m square grid, so the contract follows the requirements doc.)
- **Missing is never zero.** A metric that could not be measured is `null` with
  `"available": false`. The page prints "sem dados" and excludes it from ranking maths.
- **Fewer than five distinct parking intervals suppresses the score**, but the count and an
  "insufficient observations" note are still displayed: `"quality": "insufficient_observations"`.
- **Evidence class is per row**: `observed`, `inferred_proxy`, `experimental_forecast` or
  `scenario`. The page badges them differently and never mixes them in one ranking.
- **Provenance per layer**: each file repeats a `meta` block with source, observed date range,
  retrieval date, coverage and sample size.
- Local grouping is `Europe/Lisbon`; every timestamp in the files stays ISO-8601 UTC.

## Contract

### Shared `meta` block

```jsonc
{
  "status": "mock",                  // "mock" | "observed" — drives the page banner
  "generated_at": "2026-09-24T18:00:00Z",
  "observed_from": "2026-08-18",     // inclusive, local dates
  "observed_to": "2026-09-08",
  "timezone_display": "Europe/Lisbon",
  "coverage": "Cascais operating area",
  "grid": { "crs": "EPSG:3763", "cell_m": 250 },
  "sources": [{ "name": "viagens.xlsx", "retrieved": "2026-09-11", "rows": 53764 }],
  "notes": ["..."]
}
```

### `recovery_kpis.json` (F1)

```jsonc
{
  "meta": { },
  "rows": [{
    "id": "cell-0042",
    "unit": "cell",                  // "cell" | "station"
    "name": "Grid 0042",
    "lat": 38.7012, "lng": -9.4131,  // cell centre, for the marker
    "bounds": [[38.7001, -9.4145], [38.7023, -9.4117]],   // [[S,W],[N,E]] WGS84, drawing only
    "station_id": null,              // set when unit = "station"
    "trip_ends": 412,
    "abandonments": 7,
    "abandonments_per_100_trip_ends": 1.7,   // null when trip_ends = 0
    "idle_hours_median": 6.4,
    "hours_to_provider_pickup_median": 19.2, // null when no attributable provider pickup
    "distinct_intervals": 7,
    "quality": "ok",                 // "ok" | "insufficient_observations"
    "evidence": "observed"
  }]
}
```

### `station_opportunity.json` (F2)

`weights` must sum to 1 and is rendered as the score legend. Components carry the normalized
0–1 `value` **and** the `raw` measurement, per "show raw values and ranks".

```jsonc
{
  "meta": { },
  "weights": { "demand": 0.35, "parking_opportunity": 0.25, "journey_improvement": 0.20,
               "coverage_gap": 0.10, "equity": 0.05, "bus_delay": 0.05 },
  "rows": [{
    "id": "cand-01",
    "name": "Alcabideche norte",
    "lat": 38.7288, "lng": -9.4102,
    "bounds": [[38.7277, -9.4116], [38.7299, -9.4088]],
    "score": 0.78,                   // null when quality = insufficient_observations
    "rank": 1,
    "score_without_bus_delay": 0.77, // sensitivity view required when bus delay is missing
    "rank_without_bus_delay": 1,
    "components": {
      "demand":              { "value": 0.90, "raw": 812,  "unit": "trip endpoints", "available": true },
      "bus_delay":           { "value": 0.50, "raw": null, "unit": "median delay min", "available": false }
    },
    "distinct_intervals": 22,
    "nearest_station_m": 640,
    "quality": "ok",
    "evidence": "inferred_proxy",
    "blockers": ["site feasibility unchecked"]   // gate, never a weighted penalty
  }]
}
```

A component with `"available": false` uses the documented neutral 0.5 for `bus_delay` and is
labelled missing on screen; any other unavailable component suppresses the score rather than
substituting a value.

### `supply_demand.json` (F3)

```jsonc
{
  "meta": { },
  "rows": [{
    "station_id": "cascais-001",
    "name": "Estação de Cascais",
    "lat": 38.6979, "lng": -9.4215,
    "day_type": "weekday",           // "weekday" | "weekend" — one row per station per day type
    "departures": 210, "arrivals": 244, "net_flow": 34,
    "by_hour": [{ "hour": 0, "departures": 1, "arrivals": 2, "net": 1 }],  // 24 entries, local hour
    "evidence": "observed"
  }]
}
```

Net flow is `arrivals − departures` and is **not** station stock; the requirements doc forbids
inferring inventory from trip flow alone.
