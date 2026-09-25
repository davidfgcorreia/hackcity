# `/data` decision map

**24 September 2026.** The map combines historical planning evidence with current observations. [Architecture and source inventory](analytics_architecture.md) gives the wider analysis context; [handoff](HANDOFF.md) records the current implementation state.

## Use the page

Open `http://localhost:5173/data`. The page is in Portuguese by default; the **PT/EN** button in the top navigation switches every label, number format and chart on `/data`.

**Live and Replay.** The bar under the toolbar in Live shows which clock operations use. **Live** means the GBFS feed is polling; **Open replay** reveals the replay controls. Starting or stepping the replay pauses live polling and shows the replay's cases. **Back to live** (`POST /api/live/start`) resumes the feed and pauses the replay; the replay clock keeps its position.

**Historical** shows the dated bike, transit and candidate layers. Choose a date, a local hour, and either the sample total or the daily average. **Live** adds current GBFS bikes and station balance, operations cases, and transit vehicles and arrivals when feeds respond. Historical planning layers stay visible in Live and keep their sample dates. The `/review` and `/insights` routes redirect to `/data`.

- **Square size** changes the metric grid from 50 to 1,000 m in 50 m steps. Squares, candidate scores and boarding hotspots are recalculated from source points in EPSG:3763 metres and drawn in WGS84. Zoom changes which stops and markers are visible; it never changes the square size.
- **Layers** are grouped: *Bikes (historical)*, *Station candidates*, *Transit and people*, *Live operations* (Live only) and *Context*. The bike squares show one measure at a time: trip ends, trip starts, parking outside the zone, parked outside for more than 120 min, provider pickups, or outside parking per 100 trip ends.
- **Colours** use one-hue ramps capped at the 95th percentile, so one busy square does not wash out the rest. Blue is bike activity, orange is card boardings and magenta is the candidate score (magenta replaced violet, which was too close to blue; the three hues pass the colour-blindness validator). The legend lists only enabled layers and states the capped maximum.
- **The outside and unmoved slider** (Live, 15–720 minutes) filters map markers and cases by **counted** minutes: only 08:00–20:00 Lisbon when the enforcement window is on, the same clock as the detector. At 120 it shows exactly the abandoned bikes, the same set as the Bird tab's *Abandoned now* layer, the home-page count and the pickup mission. Other values only filter the display; they change neither operational eligibility nor the candidate score's fixed **strictly over 120 minutes** input. Bike tooltips show counted and clock minutes.
- **Empty results** are stated on the map, for example when a date or hour has no observations. Choosing a date outside 31 Aug–6 Sep with boardings on shows a card-data range note.

### Drill-down

| Click | Detail panel |
|---|---|
| A square (bike or boarding) | Counts; trip ends by hour (weekday and weekend, average per day); duration bands and end reasons of outside parking; boardings by hour where at least five cards support the hour. With boardings on, it also lists nearby aggregate journey flows. |
| A candidate square or table row | Score, component percentiles, underlying counts, sensitivity without each component, and operators within 333 m. Two selections are compared side by side, one row per measure. |
| A station | Historical departures and arrivals by hour, current rentable bikes, benchmark, balance, last five days of snapshots, and an editable operator target. |
| A stop | Boardings by hour, dated timetable departures and live arrival estimates (Live). |
| A vehicle, bike or case | Live position details, the tracked bike's evidence, or the existing case evidence and action drawer. |

The **candidate ranking** table below the map lists the top 15 scored candidates, or all of them. A row click selects the candidate and pans to it; a click on the map highlights the row.

**Laya evaluation.** At every square size the table adds Laya's rank, score and verdict, and the candidate card shows Laya's score, confidence, robustness, points per component, reasons and caveats. A comparison adds Laya rows. Laya re-scores the eligible pool at the chosen size over all dates (`/analytics/laya?limit=10&pool=true&size=…`, verdicts against a top 10). At 250 m it uses the canonical pool, so it matches the Station candidates tab exactly. The API caches every size and pre-warms all 20 at startup, so a size change is instant (about 10 ms). Laya's values do not follow the day or hour filter, and cells outside its pool show a note.

### Share, export and sources

- The view is kept in the query string (`view`, `size`, `day`, `hour`, `avg`, `metric`, `layers`, `age`, `cand`, `cell`, `station`), with the tab in the hash. Copying the address shares the exact view, for example `/data?size=500&hour=8&metric=supported_120&cand=-450_-432#Decision%20map`.
- **CSV squares**, **CSV candidates** and **CSV stations** download the current aggregate view. Comment lines at the top state the filters, source and definitions. No card hashes or individual journeys are exported.
- **Print report** prints the toolbar filters, map, candidate table and open detail cards; controls are hidden.
- **Sources & definitions** lists every source with its local-date period, row count, meaning and the layers that use it, plus the last update of each live feed.
- The other analysis tabs have **Open on map** links that open the decision map with the matching layers or selection. The Station candidates tab uses the same dynamic ranking as the map at 250 m and all dates.

## Bird tab (operator performance)

`/data#Bird` (formerly *Recovery*; old `#Recovery` links still open it) measures Bird from its own event log, 19 Aug–8 Sep 2026, Lisbon time:

- **Abandonments** are bikes outside the station polygon + 30 m for more than 120 counted minutes (08:00–20:00 when the window is on). The status is fineable whoever collects the bike. KPIs: the total and per day, those not collected by Bird (riders, still open, moved), Bird's response after the threshold (median, p90, bands), the share collected before 120 min, and abandonments that started with Bird's own drop-off outside the zone.
- **Operations**: each pickup and the same bike's next drop-off form a leg. Under 50 m is an in-place check (median 1 min, battery rarely changes), 50 m–2 km a local relocation, and over 2 km a long relocation or workshop trip.
- **Station balancing**: station stock is rebuilt hourly from rest intervals in each parking zone, from 25 Aug; earlier days are a warm-up while silent bikes appear. The measures are relocations into stations below their own median stock, removals from stations above it, empty station-hours (07–21) and who refilled each empty spell (Bird or a rider). No capacity is published, so "typical" is the station's own median, and stock counts low-battery bikes too.
- **Performance by station** (second map view): a provisional 0–100 score per station. It is the mean of availability (07–21 h with at least one bike), Bird's share of refills after the station went empty, and Bird's collection rate for abandonments whose nearest station area is within 300 m (at least 3 needed). Missing parts are excluded, not counted as zero ([bird_score.py](../project/analytics/analytics/bird_score.py)). The bands are poor (< 40, red), fair (40–69, amber) and good (≥ 70, aqua-green); the palette passes the dataviz colour-blindness validator. Marker size is the number of parts (1–3). A station with only availability is hollow and dashed (insufficient data). The view adds a KPI tile, a 10-point histogram, the best and worst five stations with ≥ 2 parts, and a score column with a sort switch in the station table. The data is in `/analytics/bird` (`station_score`), `/analytics/bird/map` (`score`, `band`, `part_*`) and the stations CSV.
- The map opens on an **abandonment hotspot** heat cloud (all 754 abandonments, `leaflet.heat`). Toggles add the points coloured by outcome, **bikes abandoned now** (live GBFS: outside the zone, fresh report, over 120 counted minutes, the same rule as the *Now* card). Stations sized by empty service hours are in the **Performance by station** view, as an alternative to the score (**Score** / **Stations: empty hours**). Relocation legs are no longer drawn: as lines they were unreadable. Relocations remain in the operations table, the daily and hourly charts and the station table. Daily and hourly charts, a station table (a row opens the station on the decision map in Live), CSV exports (`/analytics/bird/abandonments.csv`, `/analytics/bird/stations.csv`) and a live card with current abandonments complete the tab. Data: `/analytics/bird` and `/analytics/bird/map`, built by [10_bird.sql](../project/analytics/analytics/derive/sql/10_bird.sql) (run by `analytics.derive` and `make analytics-map-prep`).

## Layers and their meaning

| Layer | Measure, source and period | Interpretation |
|---|---|---|
| Bike squares | Bicycle trips/events, 19 Aug–8 Sep 2026 (Lisbon time) | Counts within the chosen square and local date/hour. Outside parking uses parking intervals beyond each station area plus 30 m. A pickup is an observed provider recovery ending such an interval. The per-100 rate is pale below five outside intervals. |
| Candidate areas | Bicycle activity and dated GTFS, recalculated at the chosen size/date/hour | Screening rank only. A candidate square's centre is more than 150 m from every station area. Scores are withheld below five outside intervals (dashed grey outline). |
| Boardings (cards) | 2026 transit validations, 31 Aug–6 Sep 2026 | Squares count observed boardings, **not unique people present**. A card is not a person. Squares with fewer than five distinct cards are suppressed. Journey flows use 1 km zones and inferred destinations. CP rail validations are absent. |
| Stations + 30 m | GBFS station polygons and status | Green is the supplied station geometry; orange is the geometry plus a 30 m metric buffer (shown from zoom 13). A trip belongs to a station only inside the green area; parking beyond orange is outside. In Live, station markers are coloured by balance: green within 40–60%, red below, yellow above, grey without a benchmark. |
| GBFS bikes, unmoved bikes and cases | Live GBFS bike positions and the operational case store | Outside and unmoved markers need a recent provider report (30 minutes) and a known rest time. Missing bikes remain uncertain; the absence of a new point does not prove pickup, depletion or charging. Operational cases can also be replay/simulated. |
| Bus/train routes, stops and vehicles | Dated MobiCascais, Carris Metropolitana and CP GTFS; TML GO and Carris Metropolitana live feeds where available | Route width reflects scheduled service intensity. MobiCascais route colour reflects **historical median departure delay** (green to red); grey means no measured delay. The overview shows main stops; zoom in for all. Live GPS vehicles and ETAs appear only when a fresh feed supplies them. Pale moving symbols are timetable estimates, never observed GPS. |
| Reference places | Bundled OpenStreetMap context file | Reference locations only; not a demand or service measure. |

**Sample periods are Lisbon local dates.** Bike trips run 19 Aug–8 Sep 2026 (21 full days); the UTC extract begins at 23:45 on 18 Aug. The data has 22 distinct local dates because 19 trips fall just after midnight on 9 Sep; they count in totals but not as a day, and the date picker allows 9 Sep. Card validations run 31 Aug–6 Sep (7 days), plus 126 validations after midnight on 7 Sep. The daily average divides bike counts by 21 and card counts by 7, or by 1 when a date is chosen. It describes the sample, not a predicted day.

## Calculations and freshness

- **Enforcement window.** The 120-minute abandonment clock counts only minutes between 08:00 and 20:00 Europe/Lisbon and pauses outside (parked 19:30 → abandoned 09:30 next day). It applies to live detection, cases, the case drawer and every historical "> 120 min" measure. Switch it with `make enforce-window-off` or `make enforce-window-on` (from `project/`). The target sets `ENFORCE_WINDOW` in `.env`, restarts the API and analytics, and rebuilds the affected tables in about 15 s. Hours and time zone are `ENFORCE_FROM_HOUR`, `ENFORCE_UNTIL_HOUR` and `ENFORCE_TZ`. `/api/rules` gives the live rule and `/analytics/enforcement` the rule the analysis was built with; the page warns if they differ.
- The station parking boundary is `ST_Buffer(station polygon in EPSG:3763, 30 metres)`. The operations detector's 120-minute threshold is independent of the map filter. See [operations architecture](operations_architecture.md) for case state and evidence rules.
- Dynamic candidate score is `(0.35 × demand percentile + 0.25 × >120-minute parking percentile + 0.10 × transport-gap proxy + 0.05 × neutral bus-delay placeholder) / 0.75`. The sensitivity scores drop one component and renormalise. Population and journey improvement remain unavailable; the weights are provisional. The gap proxy uses scheduled departures within 333 m in a straight line. It is not a walking catchment.
- Station balance is `current rentable bikes / benchmark`. The benchmark is the saved operator target if present. Otherwise it is the highest valid `station_status` count in the previous 30 days, **but only once snapshots cover at least 7 local days**. Before that, no ratio is reported and the Live card counts stations awaiting history. The interface treats **40–60%** as the desired band. Freshness requires both a recent collection and a provider report within ten minutes. The observed peak is a proxy, not physical dock capacity. Historical balancing by Bird is measured separately in the **Bird** tab (below), from Bird's own pickup and drop-off events.
- Live transit vehicles use fresh TML GO positions with a Carris Metropolitana v2 fallback, restricted to Cascais. Positions older than 120 seconds are rejected. Animation extrapolates along the reported heading for at most eight seconds, with a five-second refresh. Scheduled symbols interpolate between dated GTFS stop times along shapes, hold during planned dwell, and are capped to 120 per response. The checked feed supplied no live CP train GPS.
- Only aggregated card results leave the analytics database. Groups, squares and hours under five distinct cards are suppressed.

## Services and implementation

The page shell is [DecisionMap.tsx](../project/frontend/src/pages/DecisionMap.tsx); its parts are in [components/decision/](../project/frontend/src/components/decision/). `useMapState.ts` holds the URL state and `useDecisionData.ts` the fetching and polling. `MapLayers.tsx` draws the layers, `ControlsPanel.tsx`, `DetailPanel.tsx`, `CandidateTable.tsx` and `SourcesDrawer.tsx` hold the panels, and `definitions.ts` holds the periods, rules and ramps. Strings for `/data` are in [i18n-data.ts](../project/frontend/src/i18n-data.ts). Polygon layers remount only when a fetch returns new data, because React-Leaflet's `<GeoJSON>` ignores `data` changes after mount; selection restyles in place.

The analytics service on port 8100 serves these endpoints under `/analytics/map/`: `analysis-cells`, `analysis-candidates`, `people`, `journey-context`, `cell-profile`, `stop-profile`, `catalogue`, `station-areas`, `station-flows`, `routes`, `stops`, `stop-departures` and `scheduled-vehicles`. CSV exports are `analysis-cells.csv`, `analysis-candidates.csv` and `station-flows.csv`. The last scheduled endpoint uses `derived.scheduled_segments` and `derived.schedule_shapes`, built by [09_schedule.sql](../project/analytics/analytics/derive/sql/09_schedule.sql). API connections disable PostgreSQL JIT; `analysis-candidates` returns in about 0.1–0.2 s at 50–1,000 m.

The operations API on port 8000 serves `/api/live/bikes`, `/api/stations/balance`, `/api/stations/{id}/balance-history`, `PUT /api/stations/{id}/target`, `/api/transit/vehicles`, and `/api/transit/arrivals/{stop_id}`. The target write currently has no authentication; add roles before exposing the app to untrusted users. Bike tracking uses position-based identifiers because the public GBFS feed rotates bike IDs.

From `project/`, run `make up` and `make seed` for a fresh operations database. Fill analytics with `docker compose exec analytics python -m analytics.ingest` followed by `docker compose exec analytics python -m analytics.derive`, or restore the team database with `make analytics-restore`. For an analytics database restored before the scheduled-segment code, run `make analytics-map-prep` once. See [project README](../project/README.md) for restore access and prerequisites.

Validation commands, from `project/`:

- `docker compose exec -T api pytest -q` and `docker compose exec -T analytics pytest -q` (`tests/test_map_api.py` covers map parameter guards and CSV framing).
- `npm run build -- --outDir /tmp/hackcity-frontend-build` from `project/frontend/`.
- The browser check: `docker run --rm --network host -v "$PWD/tools:/tools:ro" -v /tmp/hackcity-data-review:/out hackcity-shots python /tools/verify-data.py`. It checks that squares render, the square and candidate drill-downs, a shared URL, the PT/EN switch, the Live balance card and a tab deep link. Screenshots go to `/tmp/hackcity-data-review`. It intercepts the target write.
- `git diff --check`.

## Next work

The prioritized research and product work is in [NEXT_STEPS.md](NEXT_STEPS.md): operator and route search, parish and catchment grouping, saved presets, walking catchments, revised candidate evidence and an audited action workflow. Before a public or production rollout, add roles around target edits and case decisions, obtain authoritative station capacities and relocation events, and verify transit feed coverage.
