# Cascais micromobility: municipal recovery and network oversight

**Product brief and working requirements · Updated 24 September 2026 · Operational decisions supplied by the project team; provider capabilities and municipal policy still require verification**

## 1. Theme, challenge and proposed solution

Shared bicycles and other micromobility vehicles can extend access to jobs, services, leisure and public transport. Their value depends on vehicles being available in useful places and parked where the network permits. A vehicle left beyond a permitted station area can obstruct public space, disappear from useful service and require a recovery trip. Repeated cases may reveal either operational shortcomings or a gap in the station network.

**Hack the City Challenge #9** asks for real-time detection of vehicles parked outside a station's coverage area plus a 30-metre buffer for **more than 120 minutes**, dynamic optimization of collection routes when vehicles appear or disappear, and supply/demand indicators by location. The challenge is framed for micromobility vehicles generally; this product's first release is limited to bicycles. The attached handbook defines the challenge, while the attached metadata says to use the actual `station_area` polygons with a 30-metre buffer rather than measuring from station centres. [S1, S2]

### What we want to build

A system for two connected municipal responsibilities:

1. **Operations: municipal recovery.** Identify potentially abandoned bicycles, automatically dispatch eligible cases, and guide municipal operators from their current positions through pickups to the **Complexo Multisserviços da Câmara de Cascais**. The operator collects bicycles the contracted company has failed to recover. The municipal route does **not** perform fleet balancing or deliver bicycles to stations.
2. **Analytics: oversight and planning.** Measure abandonment and company and municipal recovery separately; assess station balancing and service quality; export evidence to the municipality's existing penalty process; and examine where additional or changed stations might improve the network. A multimodal analysis will evaluate how walking, cycling, bus and rail work together for complete journeys. The current [analytics requirements](analytics_prediction_requirements.md) specify a bounded planning demo and record what still needs approval or data.

The contracted company remains responsible for its bicycles, their maintenance, ordinary recovery and distribution across stations. The municipality remains responsible for custody after its pickup, but custody tracking is outside this application's first release. **The exact contract, legal authority for collection, custody procedure and penalty schedule have not been supplied; none is assumed in this document.**

A successful first release supports real municipal collections; a separate demonstration mode may replay historical data. It must show an evidence-backed outside-station interval, automatic dispatch only when eligibility is supported, route updates when bicycles appear or disappear, pickup evidence, and a route ending at the Complexo Multisserviços. Company notices, penalty issuance, and depot check-in are outside this product's operational scope.

## 2. Data available now

The bicycle files are a historical sample and two GBFS snapshots. The repository also contains transit, road and calendar data. The later `datasets/finalset/` delivery adds 2026 transit validations and vehicle positions plus a separate October 2025 transit study; see the [finalset review](finalset_data_review.md) and [data-source audit](data_source_audit.md). Counts below are physical records inspected in the supplied bicycle copies, excluding the header row for spreadsheets. Some records have missing fields; a physical row count is not a validated trip count.

| File | Contents inspected | Time span / limitation | Primary uses |
|---|---|---|---|
| `cartoes.xlsx` | 16,887 nonempty trip rows after the header; fields include `device_id`, `trip_id`, start/end coordinates and times, duration, `cleaned_distance`, and fare fields. Two rows have no `trip_id`. | Recorded starts span 18 Aug–8 Sep 2026 in the supplied file. Metadata describes 19 Aug–9 Sep; reconcile dates and time zone before reporting. | Trip demand, origin/destination patterns, vehicle histories, candidate station areas. This is the **trip table despite its filename**. |
| `viagens.xlsx` | 53,765 nonempty vehicle-event rows after the header for 1,388 distinct `device_id` values; events include 17,457 `trip_start`, 15,654 `trip_end`, 5,229 `maintenance_pick_up` and 5,369 `provider_drop_off`. | Event timestamps span 19 Aug–8 Sep 2026 in the supplied file; metadata says daily updates, but this attachment is a fixed extract. | Reconstruct parking intervals, provider movements, state changes and retrospective recovery evidence. This is the **event table despite its filename**. |
| `station_information.json` | 157 stations with IDs, names, coordinates and `station_area` multipolygons. | Snapshot `last_updated`: 11 Sep 2026, 13:47:57 UTC. Station geometry may change after the snapshot. | Accurate permitted-area checks and station-level spatial analyses. |
| `gbfs.json` | A GBFS 2.3 feed directory listing nine endpoints, including `free_bike_status`, `station_status`, `geofencing_zones` and `vehicle_types`. | Directory snapshot `last_updated`: 11 Sep 2026, 13:48:33 UTC. It is **not** a downloaded vehicle-status history or proof that any listed feed is currently accessible. | Discover possible current-data feeds; check access, freshness, coverage and field semantics separately. |
| `Modelo Ficha Metadados Hack the City - 14 e 15.docx` | Provider descriptions of file fields, link keys, update cadence and limitations. | Definitions need confirmation where metadata labels and actual file contents diverge. | Data dictionary and interpretation. |
| `Hack_the_City_Participant_Handbook.pdf` | Challenge #9 objective and core deliverables. | Challenge specification, not the municipal service contract. | Scope and demonstration criteria. |

**Join keys and source limits.** `device_id` links the historical trip and event tables; `trip_id` links trip records to relevant trip events. Historical `device_id` is stable enough for retrospective reconstruction, subject to duplicate and missing-key checks. The metadata warns that more than 15% of apparent trips may be failed starts/unlocks; filter these with `trip_cancel`, implausible distance/duration, event state and other provider evidence before using demand or dwell estimates. No user identifier is supplied. The public `free_bike_status` `bike_id` is regenerated on each request and cannot be joined reliably to historical `device_id` or used to establish a continuous two-hour dwell on its own. [S2]

**What the supplied bicycle files do not contain:** the municipal depot's vehicle entrance, an operator roster and actual GPS tracks, collection-vehicle capacity, company notifications and acknowledgements, verified municipal pickups and custody transfers, the contract and penalty ledger, a reliable live per-bicycle event stream, road travel-time matrices, or station physical capacities. The new transit files **do** contain observed MobiCascais boardings for 31 Aug–6 Sep 2026 with repeatable card hashes, but no link from those cards to bicycle users and no MobiCascais exit validations. Their `stop_id` values require the applicable 2026 MobiCascais plan; the bundled complete operation plans and APEX/ride/vehicle-event study are for October **2025**. None supplies municipal pickup records. The bicycle history is roughly three weeks; it is too short by itself to characterize full seasonal demand. See the [finalset review](finalset_data_review.md) for counts, joins and usage limits.

### Additional datasets to request or connect

| Data source | Fields or format needed | Use and owner/access check |
|---|---|---|
| **Provider's authenticated operations feed** | Stable vehicle ID, timestamped positions or parking-state transitions, location accuracy, trip/collection events, responsible crew and event ingestion time. | Necessary for evidence-based live dwell and company recovery attribution. Ask the contracted provider for an authorized feed and retention rules. |
| **Current GBFS feeds** | `free_bike_status`, `station_status`, geofencing, vehicle types, feed timestamps and polling logs. | Current visibility and station supply proxies; test endpoints before promising live functionality. Volatile public IDs constrain longitudinal tracking. The provided directory is only a pointer. |
| **Municipal case and dispatch records** | Case ID, detection, eligibility decision, assignment, arrival, pickup evidence, route changes and outcomes. Depot custody and release records are separate. | Truth source for municipal recovery performance and audit trail; the operational app must create case and pickup records. |
| **Contract and finance records** | Service-level rules, notification method, allowed cure period, exclusions, penalty amounts, cost rates, issued notices, disputes and paid amounts. | Determine when intervention and a penalty are valid; separate estimated costs from actual charges and collections. Obtain from municipal contract management. |
| **Road network and restrictions** | Drivable links, turn rules, vehicle restrictions, current closures and legal stopping points. | Road travel times and safe pickup access. OpenStreetMap extracts are a useful starting point, subject to local verification; municipal closure notices can supplement them. [W1] |
| **Public-transport network** | Bus and rail stops, routes, scheduled times, calendars, transfers and ideally disruption/real-time records; GTFS Schedule/Realtime if published or shared. | Door-to-door comparisons and intermodal station planning. The new local operation plans are complete but date to October 2025. Obtain the plan valid for the 2026 Cascais sample and test its stop IDs against the new MobiCascais validations. [W2, W3, W4] |
| **Cycling and pedestrian access** | Cycleways, crossings, gradients, sidewalks, barriers, safe parking and accessible paths. | Real network catchments and feasible station siting. The municipal open-data portal publishes a cycleway layer; check coverage and update date. [W5] |
| **Population, destinations and land use** | Census small-area population, employment and education destinations, tourism/visitor proxies, parcel ownership, rights of way and protected zones. | Equity, latent demand and feasible locations. INE offers 2021 small-area geography and census tables; municipal land and planning layers require verification. [W6] |
| **Weather, events and disruptions** | Hourly rain, wind and temperature; event calendars; roadworks and closures. | Explain demand variation, validate forecasts and adjust routes. IPMA provides a data API; spatial and temporal resolution should be checked. [W7] |
| **Independent travel behavior** | New 2026 transit validations provide observed boardings and repeatable card hashes; seek additional aggregated counts or surveys for walking, rail, cycling transfers and access behavior. | Boardings improve transit demand context, but do not establish alighting, complete journeys or a bicycle transfer. Access, usage terms, privacy and representativeness need review. |

A dataset's listing establishes an opportunity to investigate it, not that its endpoint, license, historical depth or update cadence meets production needs. Record the source, owner, license, retrieval time, coverage, schema version and quality checks for every input.

## 3. Objective A — agreed municipal recovery requirements

These requirements record project-team decisions. The Cascais Próxima operations lead approves the first real-use requirements and pilot. Municipal bike-service administration owns the collection policy; the system executes the approved rules automatically, while staff handle exceptions. The initial scope is bicycles operating in Cascais. The contracted company remains responsible for ordinary recovery and redistribution.

### 3.1 Detection and eligibility

- **OP-01 — Permitted area.** Use the station_area polygon valid at the observation time, plus a 30-metre buffer. A bicycle on the boundary is inside. Other geofencing rules do not alter this test for the first release.
- **OP-02 — Location uncertainty.** Count a bicycle as outside only when its reported position is beyond the buffered area by more than the reported location error. Keep boundary cases with insufficient accuracy uncertain until better location or field evidence arrives.
- **OP-03 — Time threshold.** Start the parking interval at a credible trip end. The challenge condition is strictly more than 120 minutes outside. A cancelled trip resets the clock only if reliable evidence shows the bicycle moved. Keep one case for the bicycle if it moves between outside locations, while starting a new dwell interval after confirmed movement.
- **OP-04 — Evidence before dispatch.** A trip-end position without a later observation creates a candidate case, not an automatically dispatchable pickup. Require a fresh observation at the same location or field confirmation that the bicycle remains there. A field verification stop may be added to an existing mission, but do not create a mission solely for uncertain cases.
- **OP-05 — Live-data dependency.** Stable bicycle identity, timely status events, provider recovery proof, event meanings, and location accuracy require verification against the provider's authorized API. The supplied public GBFS bike_id changes between calls and cannot alone prove continuous dwell. Do not present historical replay as live detection.
- **OP-06 — Eligibility and overrides.** Automatically dispatch cases meeting the approved spatial, time, evidence, and company-recovery rules. Staff may correct or override faulty locations or other exceptions; retain the actor, time, original evidence, and reason. The exact provider recovery signals and any policy exceptions remain open.

### 3.2 Cases and company interaction

- **OP-07 — Case record.** Preserve bicycle ID, observation and pickup positions, timestamps, evidence, eligibility decision, route assignment, outcomes, edits, and cancellation reasons. Staff can inspect the observations supporting each decision and add field evidence.
- **OP-08 — No notice workflow.** The product does not send company warnings or notices. It records cases and exports evidence for the municipality's existing enforcement process; that process decides and issues penalties. A triggered case may remain in that process even if the company later recovers the bicycle.
- **OP-09 — Recovery during dispatch.** When a new trip or company pickup is reported, remove the stop and recalculate the route. Keep the case history and any separate penalty record.
- **OP-10 — Unassigned bicycles.** An operator may create a case for another bicycle found outside a permitted area, but needs approval before collecting it. If the assigned bicycle is found elsewhere, confirm its ID, record its actual location, and continue only if it is still eligible.

### 3.3 Missions and field app

- **OP-11 — Automatic missions.** Create and update missions automatically for eligible bicycles. A mission starts at the operator's current position and ends at the Complexo Multisserviços depot; an operator may make several depot trips in one shift. The operator may choose a manual stop order.
- **OP-12 — Route updates.** Suggest an efficient driving route by distance, subject to capacity and safe access. Recalculate when cases are added or removed and when a wrong turn or material traffic change affects the route. Tell the operator why it changed and show the new target. Exclude unsafe or inaccessible stops and show the reason for staff review. If capacity is exhausted, queue remaining cases by priority for another mission or shift; the priority rule is still open.
- **OP-13 — Capacity.** The first release uses one estimated bicycle capacity for every van. Validate that estimate against the vehicles used before real collections. Operator count, shifts, breaks, depot entrance, and service times remain to be confirmed.
- **OP-14 — Field view.** Target a municipality-issued smartphone with Portuguese and English interfaces. Show abandoned bicycles, the current route, stop details, bicycle ID, last known position, access notes, and company status. Route changes and new assignments need timely notifications.
- **OP-15 — Offline use.** Keep the current route visible when connectivity is lost. Save pickup records locally and synchronize them when connectivity returns; identify records still awaiting synchronization.
- **OP-16 — Stop outcomes.** Support at least picked up, not found, in use, company recovered, unsafe, inaccessible, and unable to load. Every successful pickup records bicycle ID, time, actual location, and a photo. The operator may add notes and other evidence.
- **OP-17 — Depot boundary.** The route ends at the depot. This product does not perform depot check-in, manifest reconciliation, company handover, or company messaging. Municipal custody remains the municipality's responsibility outside this application.

### 3.4 Access, pilot, and unresolved policy

The first operational app serves municipal staff; the company has no account. The project team expects a small group of municipal staff who can all view and update cases. Review queues, exception ownership, and the final permission policy still need operational sign-off. Case evidence retention was requested as indefinite; a formal retention rule must be confirmed before real use.

The first pilot measures detection accuracy, failed visits, and time to pickup. It must also demonstrate that an unsupported observation cannot trigger dispatch, recovered bicycles leave active routes, unsafe stops are excluded, successful pickups retain evidence, and offline records synchronize. Numerical targets are to be agreed with the Cascais Próxima operations lead.

## 4. Objective B — analytics and municipal oversight

Keep **observed data**, **inferred cases**, **forecasts** and **scenarios** visually and computationally separate. All rates need a defined case cohort, observation window and censoring policy: a case still open at the end of the extract must not be counted as a failed recovery without regard to its deadline.

### 4.1 Operational and contractual performance

| Measure | Definition and required evidence | Interpretation |
|---|---|---|
| Candidate / verified abandonments | Distinct vehicle-interval cases by evidence level, area and period. | Do not call every outside-station trip an abandonment. |
| Company recovery share | Cases recovered by the company before municipal intervention ÷ eligible cases in a defined cohort. | Requires actor-attributed company pickup events. |
| Company response time | Time from the applicable contractual trigger or notification to verified company recovery; report median and upper percentiles. | Trigger and deadline come from the contract, not the two-hour definition alone. |
| Municipal intervention rate | Municipally collected cases ÷ cases meeting the agreed municipal eligibility definition in the same cohort. | Separate company performance from municipal workload. |
| Municipal collection time | Eligibility/assignment to actual pickup, plus travel and on-site durations separately. | Requires timestamped case and operator records. |
| Municipal cost per bicycle | Direct labor, vehicle and handling costs ÷ verified municipal pickups. | Show full/variable-cost methods and assumptions. |
| Route productivity | Pickups per crew-hour, km per pickup, capacity use, return trips and plan-versus-actual travel. | Compare routes of similar geography, shift and case difficulty. |
| Failed visit / false dispatch | No-bike or wrong-bike visits ÷ attempted stops; reasons recorded. | Monitors detection and data-latency quality. |
| Custody and return | Depot and transfer records, if a separate municipal source becomes available. | Future analytics input; depot check-in is outside the operational app. |

**Penalties and recovery costs.** The operational product records and exports case evidence. The municipality's existing process decides whether a penalty is due and issues it; the product does not issue fines or send company notices. Future analytics may show penalty outcomes only if the municipality supplies authoritative records and definitions. Historical trip/event files do not contain a penalty ledger or user identifiers. A modelled collection cost is not an actual invoice, and an abandonment case does not automatically create a fine.

### 4.2 Company station balancing and service quality

Use valid trip starts/ends to summarize departures, arrivals, vehicle turnover and recurring shortages by station, weekday and hour. If accessible, combine station-status snapshots with provider inventory/redistribution logs to measure actual available stock, stock-out duration, station capacity and movements made by company crews. With only trip flows, estimate **net flow**, not actual stock: unknown starting inventory, vehicles moved without customer trips and unavailable vehicles can invalidate an inferred stock count.

For each station and planning horizon, an illustrative target is `expected departures − expected returns + safety stock`, capped by physical capacity and compared with available usable bicycles. The company may use these forecasts for balancing; the municipality uses them to audit service and discuss network design. Report uncertainty and account for weather, events, school calendar and the short sample period. Compare similar periods and do not label demand that was suppressed by an empty station as zero demand.

### 4.3 New station opportunities

Generate candidate areas from repeated valid trip endpoints, supported outside-station parking intervals, population/destinations and access to public transport. Then filter for safe access, public space, legal permission, existing coverage, capacity, cycling conditions, accessibility and cost. A recurrent abandonment hotspot is a clue, not automatic permission or proof of demand for a station.

For each feasible candidate, estimate incremental walking-network coverage, possible trip demand, access to bus/rail, displaced demand from nearby stations, predicted reduction in unresolved parking, installation/maintenance cost and uncertainty. Compare a no-build baseline with candidate scenarios under a budget and minimum-spacing constraints. Validate with longer historical data and field visits. If a station is installed, compare before/after outcomes against comparable unchanged areas and seasonality; observed changes alone do not prove the station caused them.

The **30-metre parking buffer is not a walking catchment**. Measure walking access on a pedestrian network; test and calibrate candidate catchments rather than applying an arbitrary straight-line radius.

### 4.4 Distance-based transport-mode hierarchy

Ask which complete journey is practical for a given origin, destination, departure time and user need. Candidate paths include walk only, shared bicycle only, walk + bus, walk + rail, bicycle + bus/rail and transfers. Total time includes access, unlock/parking, wait, ride, transfers and final walking. Also consider fares, slopes, safety, accessibility, reliability, bicycle/vehicle availability and service hours.

For an **illustrative mathematical starting point only**, set `T_m(d) = A_m + 60d/v_m`, where `d` is route distance in km, `A_m` fixed minutes and `v_m` effective km/h. If walking is `(0 min, 4.5 km/h)`, bicycle `(4 min, 13 km/h)`, bus `(7 min, 18 km/h)` and rail `(14 min, 35 km/h)`, the lower travel-time envelope switches near **0.46 km** (walk/bike), **2.34 km** (bike/bus) and **4.32 km** (bus/rail). These are consequences of hypothetical inputs, **not measured Cascais thresholds or universal recommended distances**. Bus and rail can only be chosen where a viable service and access path exist; the modes need not share the same route distance.

For a usable model, build a time-dependent multimodal graph from pedestrian/cycling streets and transport stops, schedules and transfers. For each origin–destination–time pair, compare generalized door-to-door costs and identify the distance or circumstances where the preferred option changes. Estimate uncertainty and different user/accessibility profiles. The new transit validations provide observed boardings, but neither they nor the shared-bicycle trips establish actual switching between modes; seek walking counts, transfer surveys or other cross-mode observations for calibration. Use the results to evaluate whether a proposed bicycle station improves access to public transport and underserved destinations.

## 5. Product views and delivery sequence

The first real-use product needs a **municipal case view** for evidence, uncertainty, exception handling and export; a **field smartphone view** for assigned route, stop details, outcomes, photo capture and offline work; and a **simple operational review view** for detection accuracy, failed visits and pickup time. Company staff do not access the app. The company-notice, penalty-issuance, depot check-in and custody workflows remain in existing municipal processes.

A separate **demonstration mode** may replay historical events using only information available at each simulated time. It must clearly label simulated events and must not imply that the public GBFS feed supports stable live bicycle tracking.

**Recommended product sequence:**

1. Validate the historical data fields, time zones, station geometry and event meanings; demonstrate candidate detection and evidence quality.
2. Confirm authorized live identity and status data with the provider, then define the approved eligibility and exception rules with Cascais Próxima.
3. Build automatic case and mission creation, safe route updates, manual route ordering, and the field smartphone workflow.
4. Verify the depot entrance, actual van capacity, operator schedule and road access. Run a supervised pilot with pickup evidence and offline synchronization.
5. Review measured pilot results with the Cascais Próxima operations lead and agree numerical acceptance targets. Revisit the [analytics requirements](analytics_prediction_requirements.md) as validated transit and operational evidence becomes available.

Infrastructure, service selection and technology stack are intentionally deferred to a later planning iteration.

## 6. Open decisions and external verification

The full interview and project-team answers are in [start_questions.md](start_questions.md) and [responses.md](responses.md). The following items must be resolved before claiming a production-ready live detector or finalizing operating rules:

1. **Provider API:** availability of a stable live bicycle ID; event and position endpoints; update delay; location accuracy; timestamp semantics; and which event proves company recovery. The supplied public GBFS ID is volatile.
2. **Eligibility policy:** contractual authority and exceptions; precise evidence criteria for movement and continued parking; and how company disputes are handled by existing municipal processes.
3. **Municipal operations:** actual operator and van counts, shifts, depot entrance, safe van capacity, pickup time, stopping restrictions, and staff response to unsafe or inaccessible locations.
4. **Product governance:** exception ownership, exact staff permissions, evidence-retention policy, and sign-off criteria. Requested indefinite evidence retention is not yet an approved policy.
5. **Real-use fallback:** if the provider cannot supply the required live feed, decide whether staff-confirmed cases can be used or real-use launch must wait. Historical replay alone does not meet the real-use objective.
6. **Analytics scope:** product users, required decisions, definitions and data access for contract oversight, station balancing, site planning and multimodal analysis remain for the next review.

## 7. Sources and provenance

**Attached materials**

- **[S1]** `Hack_the_City_Participant_Handbook.pdf`, Challenge #9, “Plan collection of abandoned micromobility vehicles (Cascais),” printed p. 23. Defines >120 minutes, 30-metre buffer, dynamic routing and supply/demand KPIs.
- **[S2]** `Modelo Ficha Metadados Hack the City - 14 e 15.docx`, entries for trips, vehicle events, stations and `Free_bike_status`. Describes station polygon buffering, daily historical updates, failed trips, no user IDs and volatile public `bike_id`. Dataset labels in the template appear swapped relative to the actual spreadsheet schemas; this brief follows inspected columns.
- **[S3]** Inspected supplied copies of `cartoes.xlsx`, `viagens.xlsx`, `station_information.json` and `gbfs.json`; counts and dates in §2 refer to these copies, not to a live service.

**Potential external sources, checked 23 September 2026**

- **[W1]** [OpenStreetMap data download guidance](https://wiki.openstreetmap.org/wiki/Downloading_data) for road, pedestrian and cycling network extracts. Verify local data quality and usage policy.
- **[W2]** [Cascais municipal bus-stop geodata](https://dadosabertos.cascais.pt/pt_PT/dataset/geocascais-paragemautocarro).
- **[W3]** [Cascais municipal rail-station geodata](https://dadosabertos.cascais.pt/pt_PT/dataset/geocascais-estacaocomboios).
- **[W4]** [GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/) for required schedule/stop/trip/calendar structure; it does not establish that a current Cascais GTFS feed is publicly available.
- **[W5]** [Cascais municipal cycleway geodata](https://dadosabertos.cascais.pt/pt_PT/dataset/geocascais-ciclovia).
- **[W6]** [INE 2021 census geographic and small-area downloads](https://mapas.ine.pt/download/index2021.phtml).
- **[W7]** [IPMA data API](https://api.ipma.pt/) for meteorological information.
