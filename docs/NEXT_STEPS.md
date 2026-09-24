# Next Steps

**24 September 2026.** This page records what the prototype shows today, which results to leave out of the pitch, and what is still to build, in priority order. The details of the analysis are in [analytics_architecture.md](analytics_architecture.md), and the operations design is in [operations_architecture.md](operations_architecture.md).

## 1. Findings for the pitch

- **90.2 %** of the bikes the provider collected from outside a station had been parked there for more than 120 minutes. Our detector would have flagged them a **median 12.4 hours earlier**.
- **83.7 %** of trip ends are inside the permitted parking zone, but only **40.5 %** are inside the painted station area. The 30 m margin does most of the work.
- In one week, **47,928 cards** made **216 k journeys** to, from or within Cascais, and **24 %** included a transfer. The busiest link to another municipality is **Cascais↔Sintra**, with about 19 k journeys each way.
- The MobiCascais routes with the worst departure delay are **M30, M26 and M25**. Their median departure is about 2.3 minutes late, and the worst 10 % of departures are 13–17 minutes late.
- **65 candidate areas** for new stations are ranked. The score uses provisional weights, and missing inputs are shown as missing rather than counted as zero.

### Do not present

The bus/rail→bike transfer measure from the requirements shows **nothing**. It matches 75.8 % of bike trips, and moving every trip start 30 minutes later still matches 75.1 %. It only reflects how many buses run in Cascais. The `/insights` page states that it is not used.

## 2. Data analysis: not built yet

| # | Item | Purpose | Method | Effort |
|---|---|---|---|---|
| 1 | Three next-day experimental forecasts | Bike starts/ends by station, possible abandonment hotspots, bus-to-bike demand (requirements, "first-delivery choice") | Train on the first 2 weeks and test on the last week, a chronological holdout. Model: the average for the same weekday and hour. Compare it with the previous day's value, reporting MAE for counts and precision/recall for hotspots. The bus-to-bike layer stays descriptive until linked journey data exists. | 3 h |
| 2 | First-month demand ranges for candidates | Starts, ends and transit-connected trips after opening | Take the 5 existing stations most similar in trip density and transit service. Report the range of their daily starts and ends, minus the demand likely to move from nearby stations. Labelled as a range, not a calibrated forecast. | 2 h |
| 3 | Five-minute walking catchments along real paths | Replace the 333 m straight-line estimate in the transport-gap score and the stop panels | Build a separate OSRM `foot` graph from the cached OSM extract (the current graph uses `car.lua`), at 4 km/h. Check results against the municipal footpath layers. | 2 h |
| 4 | INE census population | The 5 % population/equity component (currently unavailable) | INE 2021 grid or subsection population, spread onto the 250 m cells | 1.5 h |
| 5 | CSV and PDF export | Planner deliverable (requirements, "common display rules") | CSV endpoint for each derived table (aggregates only); PDF from a print stylesheet | 1.5 h |
| 6 | Portuguese `/insights` | Required language of the deliverable | Add the page's text to `i18n.ts` | 1 h |
| 7 | Bus delay at individual stops | Candidate panels need delay at nearby stops | Match vehicle positions to the dated timetable by operator, service ID, date and stop order. Show a stop's delay only where at least 75 % of services match and at least 10 matched services fall on at least 3 days. | 4 h |
| 8 | October 2025 study | Separate punctuality and boardings study | APEX, rides and vehicle events joined to the 2025 plans; never mixed with 2026 data | 3 h |

## 3. Operations: after the navigation work

- **Several vans:** VROOM (open source, runs on OSRM) for routes with capacity limits across multiple vans.
- **Push updates:** server-sent events instead of polling every 5 seconds, so route changes arrive instantly.
- **Sign-in and roles:** operator, reviewer and administrator; approving a bike found in the field needs a named reviewer.
- **Real provider data:** the provider's authorised MDS/GBFS feed with fixed bike IDs, to replace the position-based tracking.

## 4. Sharing the data without `finalset`

The 15 GB `datasets/finalset` isn't in git. Instead, the Cascais-filtered analysis database is published as a **GitHub Release asset** of this private repository; see `make analytics-restore` in [project/README.md](../project/README.md). The dump contains transit card hashes, so it is **for the team only** and must not be made public.
