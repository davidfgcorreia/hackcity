# Next Steps

**24 September 2026.** This page records what the prototype shows today and the work to do next. The details of the analysis are in [analytics_architecture.md](analytics_architecture.md), and the operations design is in [operations_architecture.md](operations_architecture.md).

## Current product, reviewed

- `/` is the operations home: eligible-bike alert, live mission start or continuation from a fresh GPS fix, links to Pickup and Data Analysis, and a separate presentation simulation link.
- `/field` shows the road route, the operator's GPS position and accuracy, fixed geographic bike pins, approximate access segments, follow and overview controls, an expandable stop list with per-leg time and distance, and the return to Complexo Multisserviços. Overview shrinks pins so nearby bikes remain selectable. Direct entry does not start a live mission.
- `/data` combines the multi-layer planning map with a live operations case view; `/review` and `/insights` redirect there. Case decisions still use the operational API, while historical analytics is read-only.
- OSRM's snapped road points are stored with each mission. An unavailable route or a road snap too far from the operator is labelled as an approximate straight-line fallback; an old mission without waypoint data remains viewable.

### Review limits to carry forward

- Road directions cover driving only. The dashed access line to a bicycle is an estimate; there is no verified walking path or access time. Per-stop sidebar values are driving estimates, not an arrival-time promise.
- The live mission start is GPS-gated. Simulation and locally cached missions are presentation/offline aids, not a substitute for a fresh live position.
- The planning layers in `/data` are aggregated historical analysis. They cannot yet justify automatic dispatch or a final station installation decision. Candidate weights are provisional, and legal/safety feasibility has not been checked.

## 1. Findings for the pitch

Figures below use the 08:00–20:00 enforcement window (24 h clock in brackets; `make enforce-window-off` switches).

- **64 %** of the bikes the provider collected from outside a station had already passed 120 counted minutes (24 h clock: 90 %). Our detector would have flagged them a **median 12.3 hours earlier**.
- **83.7 %** of trip ends are inside the permitted parking zone, but only **40.5 %** are inside the painted station area. The 30 m margin does most of the work.
- In one week, **47,928 cards** made **216 k journeys** to, from or within Cascais, and **24 %** included a transfer. The busiest link to another municipality is **Cascais↔Sintra**, with about 19 k journeys each way.
- The MobiCascais routes with the worst departure delay are **M30, M26 and M25**. Their median departure is about 2.3 minutes late, and the worst 10 % of departures are 13–17 minutes late.
- **65 candidate areas** for new stations are ranked. The score uses provisional weights, and missing inputs are shown as missing rather than counted as zero.

- **Bird misses more than it collects:** of 754 abandonments (fineable, > 120 counted minutes outside the zone; 24 h clock 983), Bird collected 334, a **median 12.3 h** after the threshold; **56 %** were never collected by Bird. It collected 19.8 % of outside parkings before the threshold, and **43** abandonments began with its own drop-off outside the zone. Riders, not Bird, refilled most empty stations (120 against 28 spells).

### Do not present

The bus/rail→bike transfer measure from the requirements shows **nothing**. It matches 75.8 % of bike trips, and moving every trip start 30 minutes later still matches 75.1 %. It only reflects how many buses run in Cascais. The `/data` page states that it is not used.

## 2. Data Analysis decision workspace — next product phase

The `/data` map now has 50–1,000 m squares, dated day/hour filters, dynamic candidate rankings, a single Historical view with total/average metrics, aggregate people hotspots, station polygons and 30 m buffers, live GBFS station and bike status, and live TML/Carris Metropolitana vehicles and arrivals where feeds provide them. Scheduled vehicle estimates are labelled separately. The following tasks extend it into the full decision workspace:

Build the workspace in this order:

1. **Unified data catalogue and filters.** *Done in part (24 Sep):* the map's **Sources & definitions** drawer lists each source with its local-date period, rows, meaning, layers and live-feed update time, with 2025 and 2026 transit separate. Still to do: filters by operator, route and case status. Show every available source with its date range, update time, geographic coverage, row counts, missingness and meaning. Include bicycle trips/events and stations, parking and recovery, operational cases/missions, bus and rail stops and schedules, observed bus delays, card journey aggregates, weather and candidate areas. Keep 2025 and 2026 transit samples separate. Filter by date/time, operator, route, case status and geography where the underlying data permits; label unavailable combinations rather than implying a join.
2. **Extend the multi-layer map.** *Done (24 Sep):* grouped layers, one grid measure at a time, capped colour ramps, empty-state notes, shareable URL state, Portuguese labels. The implemented map covers 50–1,000 m squares, independent bike/transit/case layers, source and time labels, candidate rescoring, stop and vehicle details, and suppressed card groups. Next add operator/route search, parish and station-catchment grouping, and saved map presets. Keep card journeys aggregated and distinguish live observations from dated schedules.
3. **Drill-down and grouping.** *Done in part (24 Sep):* square, station and stop time profiles, a ranked candidate table synchronised with the map, two-candidate comparison, CSV export of squares/candidates/stations with filters in the header, and a print stylesheet. Still to do: route drill-down, related cases per area, and grouping by parish, catchment or operator. Clicking a cell, station, stop or route opens its measures, time profile, source quality and related cases. Compare selected areas side by side; group by grid, parish/municipality, station catchment, operator/route and hour/day where supported. Keep map, table and chart selections synchronized. Export the selected aggregate view as CSV and a printable report with filters and definitions attached.
4. **Decision workflow.** Record a proposed action against its supporting evidence: inspect or correct a case, request a pickup, investigate a parking hotspot, rebalance a station, or shortlist a station site. Separate proposals from approvals and executed actions. Show expected impact, constraints, owner, date and outcome so analysts can evaluate whether the decision helped.
5. **Algorithm settings and safe dispatch.** Expose versioned settings for the 120-minute detector, station-area plus 30 m rule, freshness and confidence gates, candidate weights, vehicle capacity, routing limits and dispatch policy. Validate ranges and preview a replay/dry run against historical data before activation; compare changed and unchanged cases, routes and workload. Require an authorised approver and an audit event for activation. Automatic mission assignment should use current eligible/approved cases, fresh operator location, capacity and road-route availability; show the proposed route before sending, deduplicate dispatches, and allow pause and rollback. Do not auto-send based on a historical heatmap alone.

### Delivery gates

| Gate | Acceptance check |
|---|---|
| Data contracts | Every displayed measure has a source, period, unit, aggregation method and missing-data rule; no raw card hashes or individual journeys reach the browser. |
| Spatial map | Layer combinations, dynamic resolution, drill-down and group-by totals agree with database aggregates; sparse groups stay suppressed. |
| Case move | Existing `/review` links reach Operations cases; approvals/corrections still record actor, reason and evidence, and update the field mission as today. |
| Decision settings | A saved version can be reproduced in replay; previews show workload and false-positive changes; approval and rollback are audited. |
| Dispatch | No mission is sent from stale GPS, unapproved/blocked cases, an unreachable road start or an unavailable operator. Duplicate sends are prevented and operators see route changes. |

## 3. Data analysis: additional research

| # | Item | Purpose | Method | Effort |
|---|---|---|---|---|
| 1 | Three next-day experimental forecasts | Bike starts/ends by station, possible abandonment hotspots, bus-to-bike demand (requirements, "first-delivery choice") | Train on the first 2 weeks and test on the last week, a chronological holdout. Model: the average for the same weekday and hour. Compare it with the previous day's value, reporting MAE for counts and precision/recall for hotspots. The bus-to-bike layer stays descriptive until linked journey data exists. | 3 h |
| 2 | First-month demand ranges for candidates | Starts, ends and transit-connected trips after opening | Take the 5 existing stations most similar in trip density and transit service. Report the range of their daily starts and ends, minus the demand likely to move from nearby stations. Labelled as a range, not a calibrated forecast. | 2 h |
| 3 | Five-minute walking catchments along real paths | Replace the 333 m straight-line estimate in the transport-gap score and the stop panels | Build a separate OSRM `foot` graph from the cached OSM extract (the current graph uses `car.lua`), at 4 km/h. Check results against the municipal footpath layers. | 2 h |
| 4 | INE census population | The 5 % population/equity component (currently unavailable) | INE 2021 grid or subsection population, spread onto the 250 m cells | 1.5 h |
| 5 | CSV and PDF export (**done 24 Sep** for map squares, candidates and stations; print stylesheet) | Planner deliverable (requirements, "common display rules") | CSV endpoint for each derived table (aggregates only); PDF from a print stylesheet | 1.5 h |
| 6 | Portuguese `/insights` (**done 24 Sep**, `src/i18n-data.ts`; backend method notes and the Laya section remain English) | Required language of the deliverable | Add the page's text to `i18n.ts` | 1 h |
| 7 | Bus delay at individual stops | Candidate panels need delay at nearby stops | Match vehicle positions to the dated timetable by operator, service ID, date and stop order. Show a stop's delay only where at least 75 % of services match and at least 10 matched services fall on at least 3 days. | 4 h |
| 8 | October 2025 study | Separate punctuality and boardings study | APEX, rides and vehicle events joined to the 2025 plans; never mixed with 2026 data | 3 h |

## 4. Operations: after the navigation work

- **Several vans:** VROOM (open source, runs on OSRM) for routes with capacity limits across multiple vans.
- **Push updates:** server-sent events instead of polling every 5 seconds, so route changes arrive instantly.
- **Sign-in and roles:** operator, reviewer and administrator; approving a bike found in the field needs a named reviewer.
- **Real provider data:** the provider's authorised MDS/GBFS feed with fixed bike IDs, to replace the position-based tracking.

## 5. Sharing the data without `finalset`

The 15 GB `datasets/finalset` isn't in git. Instead, the Cascais-filtered analysis database is published as a **GitHub Release asset** of this private repository; see `make analytics-restore` in [project/README.md](../project/README.md). The dump contains transit card hashes, so it is **for the team only** and must not be made public.
