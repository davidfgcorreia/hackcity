# Handoff — decision map and operations MVP

**24 September 2026 · workspace `/home/david/Documents/hackcity`**

## Repository state

Branch is `main`; HEAD is `d93240f` (`Improve pickup navigation and document data analysis roadmap`). The feature work in this session is **uncommitted**. `git status --short` shows modified and new files across `docs/`, `project/analytics/`, `project/backend/`, and `project/frontend/`, including changes that were already present when this session began. Do not describe this work as a completed merge or discard the working tree. Review the diff before committing; the prior changes include replacing `ReviewPage` with `/data` and related field/case work.

The map's user and technical reference is [decision_map.md](decision_map.md). [NEXT_STEPS.md](NEXT_STEPS.md) is the product backlog; [analytics_architecture.md](analytics_architecture.md) explains the data lineage and measured findings.

## Delivered in the working tree

- `/data` is the combined Historical and Live decision map. It has 50–1,000 m squares, dated aggregates, dynamic candidate ranking, separate layers for trip ends, outside parking, provider pickups, boardings, bikes, cases, stations, bus/rail and places, plus clickable cells, stations, stops and vehicles. `/review` and `/insights` redirect to it.
- Station geometry includes a distinct 30 m buffer. Live `station_status` snapshots feed current rentable bikes, a 30-day observed peak, 40–60% balance indication and a saved operator target. No verified relocation-effectiveness measure exists yet.
- Transit draws historical service intensity and MobiCascais delay colour, dated GTFS stop times, live TML/Carris Metropolitana positions/ETAs when available, and separately labelled timetable vehicle estimates. The checked feed did not provide live CP train GPS.
- Analytics now has dynamic grid, candidate, boarding, journey, stop, route and scheduled vehicle endpoints. The scheduled segment SQL and GTFS indexes support the map after fresh ingest or older dump restore.
- Operations API exposes live bike tracks, station balance/history/target and transit positions/arrivals. Backend tests cover the new balance and transit handling.

## Start and verify

From `project/`: `make up`; for a fresh operations database run `make seed`. For a fresh analytics database run `docker compose exec analytics python -m analytics.ingest` then `docker compose exec analytics python -m analytics.derive`. With team access to the private release, `make analytics-restore` restores the filtered analytics database and prepares the new map indexes. If the analytics database was restored before this code, run `make analytics-map-prep`. Open `http://localhost:5173/data` and `http://localhost:8000/docs`.

Validation completed in this session:

| Check | Result |
|---|---|
| `docker compose exec -T api pytest -q` | 73 passed; one deprecation warning |
| `docker compose exec -T analytics pytest -q` | 6 passed |
| `npm run build -- --outDir /tmp/hackcity-frontend-build` from `project/frontend/` | TypeScript and Vite build passed |
| `git diff --check` | Passed |
| API smoke checks | Dynamic cells/candidates/people, station polygons/balance/history, transit routes/stops/schedules, live bikes and transit responded. A dated scheduled-vehicle request returned 120 features. |

At the last successful check, `analytics`, `analytics-db`, `api`, `db`, `osrm` and `web` were running. A later Docker status call was denied access to `/var/run/docker.sock` by the current execution sandbox; it did not establish that containers stopped. The ordinary frontend build could not delete the root-owned `project/frontend/dist/assets`; use the `/tmp` output directory above or correct ownership. Browser QA for `/data` is now scripted in `tools/verify-data.py` (see below).

## Decision map completion (24 Sep, evening)

- **Fixed:** grid, candidate and boarding squares never rendered, because React-Leaflet's `<GeoJSON>` ignores `data` changes after mount. The Live balance card said "0 of 140" because the 30-day peak came from one day of snapshots; a benchmark now requires 7 days or an operator target (`MIN_BENCHMARK_DAYS`). `analysis-candidates` went from about 5 s to 0.1–0.2 s (spatial join on indexed stops, materialised CTEs, JIT off for API connections) with identical results.
- **Periods:** bike data starts 19 Aug in Lisbon time, not 18 Aug (the UTC extract starts at 23:45 on 18 Aug). The data spans 22 distinct local dates, but the 22nd (9 Sep) holds only 19 trips just after midnight. The `/data` daily average therefore divides by 21 full days (was 22), and labels say 19 Aug–8 Sep. Laya uses the same 21 full days for its consistency measure; its active-day ratio still counts the 9 Sep stub and is capped at 1. `data_source_audit.md` and `initial.md` still describe the raw UTC file on purpose.
- **Added:** `DecisionMap.tsx` is split into `components/decision/`. The page has grouped layers, one grid measure at a time, URL-shareable state, a candidate ranking table synced with the map, comparison, square/station/stop drill-down (`/analytics/map/cell-profile`, `/stop-profile`), a sources drawer (`/analytics/map/catalogue`), CSV exports, print, a mobile bottom sheet and PT/EN for all of `/data`. The Station candidates tab now uses the dynamic ranking. The Laya section from the parallel session is unchanged.
- **Checks:** api 75 passed, analytics 26 passed, frontend build, and `tools/verify-data.py` passed with screenshots in `/tmp/hackcity-data-review`.

## Bird performance tab (24 Sep, late)

- The *Recovery* tab is now **Bird: pickups and balancing** (`BirdTab.tsx`; `#Recovery` redirects). New derive step `10_bird.sql`, added to `analytics.derive` and to `make analytics-map-prep`, so a restored dump gets it too. The endpoints are `/analytics/bird`, `/analytics/bird/map` and two CSVs. Shared tab helpers moved to `components/insights/shared.tsx`.
- Company balancing **is** measurable historically from Bird's pickup/drop-off events. The earlier "no relocation logs" note applied to live `station_status` only. Station stock is a reconstruction (lower bound, from 25 Aug), not provider capacity.
- Checks: analytics 28 passed (`response_bands` tests), frontend build, `verify-data.py` (now includes the Bird tab and the `#Recovery` redirect).

## Enforcement window (24 Sep, late)

- The abandonment clock counts only 08:00–20:00 Lisbon (`backend/app/core/enforcement.py`, mirrored in `analytics/enforcement.py` and `frontend/src/enforcement.ts`; DST-safe). It is on by default. Switch it with `make enforce-window-off` or `make enforce-window-on`; the target edits `.env`, restarts the API and analytics, and runs `python -m analytics.derive enforcement` (parking, recovery, candidates, Bird).
- Window on vs off: 754 vs 983 abandonments, and 334 vs 469 Bird recoveries after the threshold. The Laya top 10 and candidate `supported_120` values change with it. With the window off the rebuild reproduces the earlier figures exactly.
- `make analytics-map-prep` now also runs the enforcement steps, because older dumps lack `enforced_minutes`/`abandoned_at`.
- Checks: API 82 tests, analytics 36, frontend build, `verify-data.py`.

## Review fixes (24 Sep, night)

- **Bird map:** the relocation lines are gone from the map and from `/analytics/bird/map`. It now opens on an abandonment heat cloud (new dependency `leaflet.heat`; rebuild the web image with `docker compose up -d --build -V web`). Toggles add outcome points, live abandoned-now bikes and station empty hours.
- **Laya on the decision map:** at 250 m the candidate table and the card or comparison show Laya's rank, score, verdict, confidence, robustness and component points. The data comes from `/analytics/laya?limit=10&pool=true` (new opt-in `pool`).
- **Replay → live:** the Live bar shows the mode and has **Back to live**. `DecisionMap` now takes replay mode from `/api/live`, not from a leftover `sim_time`.
- **Field page:** a Home button sits at the top of the right-hand controls. `?sim` is read per mount, so leaving the simulation through Home does not keep simulating on `/field`.
- Checks: API 82 passed, analytics 36 passed, frontend build, `tools/verify-data.py` (extended for all of the above) and a one-off browser check of replay → back to live.

## One abandonment rule everywhere (25 Sep)

- The decision map compared the age slider with **clock** minutes; the detector, the Bird tab and cases use **counted** minutes (08:00–20:00). At midnight that showed 7 bikes against 2: five were parked at 19:44 and had only 16 counted minutes. `unmovedBikes`/`openCases` (`components/decision/MapLayers.tsx`) now take the rules and count minutes the same way. In replay they measure against the simulated time.
- **Missions were mixing modes:** `missions._plan` routed every eligible case. After a replay, op1's live mission held 6 replayed sample bikes (7–8 Sep positions). The planner now takes only the current mode's cases plus field reports (`cases.active_sources()`, from `clock.mode()`). Stops dropped that way release their case back to `eligible`. Switching live↔replay re-plans active missions, and op1's mission was re-planned onto the 2 live bikes.
- **The home page's "21 eligible"** was 2 live cases plus 19 left over from the replay. It now uses `GET /cases?current=true` and counts eligible + assigned (with "already on a route"). The field page uses the same filter. The unfiltered `/cases` still lists everything.
- Current live state, verified in the browser: home, the Bird tab and the decision map all show 2 abandoned bikes, and Bird and the decision map both show 5 open cases over 120 counted minutes.
- Checks: API 85 passed (3 new: planner mode scope, release on mode switch, `current` filter), frontend build, `verify-data.py`.

## Laya response cache (25 Sep)

- `/analytics/laya` and `/analytics/laya/{cell_id}` are cached per build of their input tables, keyed by table OIDs; any `analytics.derive` run or dump restore invalidates the cache. Timings: first request about 0.4 s, then 6–13 ms. A cached ranking was confirmed identical to a fresh computation. The GPU was considered and rejected: the model's arithmetic takes 27 ms and the rest is PostgreSQL.
- Checks: analytics 40 passed (4 new cache tests).

## Demo, station score, Laya per size, home (25 Sep)

- **Presentation demo** (`/field?sim`): `backend/app/services/demo.py` resets 5 fixed bikes (real abandonment spots 0.4–1.9 km from the depot) and operator `demo`'s mission from the depot. `missions._plan` routes only `demo` cases for that operator. The van drives at 70 m/s, stops at bike 1 and auto-plays photo → description → **Recolhida**, then ends about 7 s into the drive to bike 2 (whole run about 29 s). The evidence (photo file + notes) is stored like a real pickup.
- **Field fixes:** bikes keep one stable number on the pins, sidebar, stop list and banner (`bikeNumbers` in `components/field/ui.tsx`). Before, the next target was always "Bike 1" while the list shrank from the end. A zero-length route (depot to depot) no longer crashes NavMap with NaN.
- **Bird station score:** a new map view, KPI, histogram and best/worst tables. See `decision_map.md`.
- **Decision map:** candidates are magenta (was violet, too close to the blue squares). Laya is evaluated and cached at every square size.
- **Home + app bar:** one `AppBar` on `/` and `/data` (brand, Home/Pickup/Data, a live/replay pill, PT/EN) replaces the floating nav that overlapped the detail panel. The home page is a live dashboard (status tiles, mission card with Demo, service tiles) in the `/data` visual system.
- **Live pill:** the app bar and the home feed tile show the data age ("Tempo real · há 23 s"), ticking every second and re-read every 5 s, with the exact Lisbon poll time on hover. The backend polls GBFS every 60 s, so the age cycles 0–60 s. After 180 s without a poll it turns amber ("Feed atrasado"). It used to show the poll time as HH:MM in the browser's time zone, which looked frozen for a minute at a time.
- **Fixed:** `/analytics/map/scheduled-vehicles` failed between 00:00 and 09:06 (`int4range @> smallint`, since psycopg sends small ints as int2).
- Checks: API 89 passed (4 new demo tests), analytics 47 passed (bird score + Laya size tests), frontend build, `verify-data.py` (score view, app bar, home), and a browser run of the auto-played demo.

## Data limits and follow-up

- A missing GBFS bike is uncertain, including when it has no charge or has been collected. Do not infer collection from a missing point. The map's age slider counts enforcement-clock minutes but does not change the fixed strict `>120 min` operational rule.
- Live bike balance is prospective only. The 30-day observed peak is not verified physical capacity. An operator target can be saved through an unauthenticated endpoint, appropriate only to the current local prototype. Historical balancing is reconstructed in the Bird tab from provider events; live balancing effectiveness still needs a longer `station_status` series or authoritative relocation logs.
- Transit boardings measure validations, not people present. CP validations are absent; card journey destinations are partly inferred. Small card groups are suppressed. Pale bus/train movement follows dated timetables, not live GPS. The checked TML feed did not supply CP train positions.
- Candidate weights and the 333 m straight-line transport gap are provisional. Scores below five outside intervals are withheld. A station site still needs accessibility, safety and legal review.
- Review the full diff, run browser QA at desktop/mobile sizes, and capture screenshots before a commit or PR. Then follow the scoped backlog in [NEXT_STEPS.md](NEXT_STEPS.md), starting with operator/route filtering and synchronized drill-down if continuing the map.
