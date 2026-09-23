# Cascais micromobility: municipal recovery and network oversight

**Project brief · 23 September 2026 · Draft for discussion with the Câmara Municipal de Cascais, Cascais Próxima and the contracted provider**

## 1. Theme, challenge and proposed solution

Shared bicycles and other micromobility vehicles can extend access to jobs, services, leisure and public transport. Their value depends on vehicles being available in useful places and parked where the network permits. A vehicle left beyond a permitted station area can obstruct public space, disappear from useful service and require a recovery trip. Repeated cases may reveal either operational shortcomings or a gap in the station network.

**Hack the City Challenge #9** asks for real-time detection of vehicles parked outside a station's coverage area plus a 30-metre buffer for **more than 120 minutes**, dynamic optimization of collection routes when vehicles appear or disappear, and supply/demand indicators by location. The challenge is framed for micromobility vehicles generally; this proposal initially focuses on bicycles. The attached handbook defines the challenge, while the attached metadata says to use the actual `station_area` polygons with a 30-metre buffer rather than measuring from station centres. [S1, S2]

### What we want to build

A system for two connected municipal responsibilities:

1. **Operations: municipal recovery.** Identify potentially abandoned bicycles, establish whether a case is eligible for municipal action under the applicable process, and guide a Câmara Municipal de Cascais operator from the **Complexo Multisserviços da Câmara de Cascais** to the bicycles and back to that same depot. The operator collects abandoned bicycles the contracted company has not recovered. The municipal route does **not** perform fleet balancing or deliver bicycles to stations.
2. **Analytics: oversight and planning.** Measure abandonment and the outcomes of company and municipal recovery separately; assess the contracted company's station balancing and service quality; calculate penalties only under documented contractual rules; and examine where additional or changed stations might improve the network. A multimodal analysis will evaluate how walking, cycling, bus and rail work together for complete journeys.

The contracted company remains responsible for its bicycles, their maintenance, ordinary recovery and distribution across stations. Municipal custody after pickup must be recorded separately from ownership and from any subsequent transfer back to the company. **The exact contract, response deadline, legal authority for collection, custody procedure and penalty schedule have not been supplied; none is assumed in this document.**

A successful pilot would demonstrate a full case: an evidence-backed outside-station interval, a company notification or status check, a municipal pickup when eligible, a route from and back to the Complexo Multisserviços, a recorded handover, and dashboards that distinguish observed outcomes from estimates.

## 2. Data available now

The attached files are a historical sample and two GBFS snapshots. Counts below are physical records inspected in the supplied copies, excluding the header row for spreadsheets. Some records have missing fields; a physical row count is not a validated trip count.

| File | Contents inspected | Time span / limitation | Primary uses |
|---|---|---|---|
| `cartoes.xlsx` | 16,888 trip rows; fields include `device_id`, `trip_id`, start/end coordinates and times, duration, `cleaned_distance`, and fare fields. Two rows have no `trip_id`. | Recorded starts span 18 Aug–8 Sep 2026 in the supplied file. Metadata describes 19 Aug–9 Sep; reconcile dates and time zone before reporting. | Trip demand, origin/destination patterns, vehicle histories, candidate station areas. This is the **trip table despite its filename**. |
| `viagens.xlsx` | 53,766 vehicle-event rows for 1,388 distinct `device_id` values; events include 17,457 `trip_start`, 15,654 `trip_end`, 5,229 `maintenance_pick_up` and 5,369 `provider_drop_off`. | Event timestamps span 19 Aug–8 Sep 2026 in the supplied file; metadata says daily updates, but this attachment is a fixed extract. | Reconstruct parking intervals, provider movements, state changes and retrospective recovery evidence. This is the **event table despite its filename**. |
| `station_information.json` | 157 stations with IDs, names, coordinates and `station_area` multipolygons. | Snapshot `last_updated`: 11 Sep 2026, 13:47:57 UTC. Station geometry may change after the snapshot. | Accurate permitted-area checks and station-level spatial analyses. |
| `gbfs.json` | A GBFS 2.3 feed directory listing nine endpoints, including `free_bike_status`, `station_status`, `geofencing_zones` and `vehicle_types`. | Directory snapshot `last_updated`: 11 Sep 2026, 13:48:33 UTC. It is **not** a downloaded vehicle-status history or proof that any listed feed is currently accessible. | Discover possible current-data feeds; check access, freshness, coverage and field semantics separately. |
| `Modelo Ficha Metadados Hack the City - 14 e 15.docx` | Provider descriptions of file fields, link keys, update cadence and limitations. | Definitions need confirmation where metadata labels and actual file contents diverge. | Data dictionary and interpretation. |
| `Hack_the_City_Participant_Handbook.pdf` | Challenge #9 objective and core deliverables. | Challenge specification, not the municipal service contract. | Scope and demonstration criteria. |

**Join keys and source limits.** `device_id` links the historical trip and event tables; `trip_id` links trip records to relevant trip events. Historical `device_id` is stable enough for retrospective reconstruction, subject to duplicate and missing-key checks. The metadata warns that more than 15% of apparent trips may be failed starts/unlocks; filter these with `trip_cancel`, implausible distance/duration, event state and other provider evidence before using demand or dwell estimates. No user identifier is supplied. The public `free_bike_status` `bike_id` is regenerated on each request and cannot be joined reliably to historical `device_id` or used to establish a continuous two-hour dwell on its own. [S2]

**What these files do not contain:** the municipal depot's vehicle entrance, an operator roster and actual GPS tracks, collection-vehicle capacity, company notifications and acknowledgements, verified municipal pickups and custody transfers, the contract and penalty ledger, a reliable live per-vehicle event stream, bus or rail schedules, road travel-time matrices, or station physical capacities. The historical sample is roughly three weeks; it is too short by itself to characterize full seasonal demand.

### Additional datasets to request or connect

| Data source | Fields or format needed | Use and owner/access check |
|---|---|---|
| **Provider's authenticated operations feed** | Stable vehicle ID, timestamped positions or parking-state transitions, location accuracy, trip/collection events, responsible crew and event ingestion time. | Necessary for evidence-based live dwell and company recovery attribution. Ask the contracted provider for an authorized feed and retention rules. |
| **Current GBFS feeds** | `free_bike_status`, `station_status`, geofencing, vehicle types, feed timestamps and polling logs. | Current visibility and station supply proxies; test endpoints before promising live functionality. Volatile public IDs constrain longitudinal tracking. The provided directory is only a pointer. |
| **Municipal case, dispatch and depot records** | Case ID, detection, notification, deadline, eligibility decision, assignment, arrival, pickup, condition, return, custody and release timestamps; crew and route odometer. | Truth source for municipal performance, cost and audit trail. These records may need to be created by the application. |
| **Contract and finance records** | Service-level rules, notification method, allowed cure period, exclusions, penalty amounts, cost rates, issued notices, disputes and paid amounts. | Determine when intervention and a penalty are valid; separate estimated costs from actual charges and collections. Obtain from municipal contract management. |
| **Road network and restrictions** | Drivable links, turn rules, vehicle restrictions, current closures and legal stopping points. | Road travel times and safe pickup access. OpenStreetMap extracts are a useful starting point, subject to local verification; municipal closure notices can supplement them. [W1] |
| **Public-transport network** | Bus and rail stops, routes, scheduled times, calendars, transfers and ideally disruption/real-time records; GTFS Schedule/Realtime if published or shared. | Door-to-door comparisons and intermodal station planning. The Cascais portal publishes bus-stop and rail-station geography; geography alone does not supply timetables. Confirm usable schedules with the transport authority/operators. [W2, W3, W4] |
| **Cycling and pedestrian access** | Cycleways, crossings, gradients, sidewalks, barriers, safe parking and accessible paths. | Real network catchments and feasible station siting. The municipal open-data portal publishes a cycleway layer; check coverage and update date. [W5] |
| **Population, destinations and land use** | Census small-area population, employment and education destinations, tourism/visitor proxies, parcel ownership, rights of way and protected zones. | Equity, latent demand and feasible locations. INE offers 2021 small-area geography and census tables; municipal land and planning layers require verification. [W6] |
| **Weather, events and disruptions** | Hourly rain, wind and temperature; event calendars; roadworks and closures. | Explain demand variation, validate forecasts and adjust routes. IPMA provides a data API; spatial and temporal resolution should be checked. [W7] |
| **Independent travel behavior** | Aggregated counts or surveys for walking, bus, rail and cycle journeys, plus transfer and access behavior. | Calibrate mode choice. Bicycle trips alone cannot reveal when residents choose another mode. Access, privacy and representativeness need review. |

A dataset's listing establishes an opportunity to investigate it, not that its endpoint, license, historical depth or update cadence meets production needs. Record the source, owner, license, retrieval time, coverage, schema version and quality checks for every input.

## 3. Objective A — municipal recovery operations

### 3.1 Roles and boundaries

| Actor | Decision or action | Record needed |
|---|---|---|
| Contracted company | Operates, maintains, balances and ordinarily recovers its bicycles. Responds to municipal notice and identifies its own recoveries. | Timestamped actions, vehicle ID, acknowledgement and recovery proof. |
| Municipality, dispatch/oversight | Reviews evidence, checks contract conditions, authorizes municipal intervention and assigns work. | Eligibility decision, notices, reasons and audit history. |
| Municipal collection operator | Starts at the Complexo Multisserviços; picks up eligible unresolved bicycles; returns all collected bicycles there. | Actual departure, stops, photos/condition as required, load, arrival and exceptions. |
| Depot/custody team | Checks bicycles in, stores them and documents transfer or collection by the company. | Inventory, chain of custody and release receipt. |

The challenge's phrase “removals by the operator's maintenance team” describes a disappearance that should trigger route recalculation. For this municipal operating model, a **company recovery before the municipal pickup cancels or closes the municipal task** once verified. Municipal operators do not rebalance station stock.

### 3.2 Case lifecycle and detection rules

**Proposed states:** `observed` → `outside_area_unverified` → `abandonment_supported` → `company_notified` → `municipal_eligible` → `assigned` → `on_route` → `picked_up` → `at_depot` → `released_to_company` → `closed`. Branches include `company_recovered`, `new_trip`, `inside_station`, `location_uncertain`, `duplicate`, `cancelled` and `disputed`. Record every transition with actor, source event, event time and system time; do not silently overwrite earlier decisions.

1. **Normalize observations.** Parse latitude/longitude in WGS84, event and ingestion timestamps, provider and vehicle type; de-duplicate event IDs and validate coordinates, chronology and clock/time-zone conventions. Maintain both the provider event time and time received by the system.
2. **Check legal parking geometry.** For the station geometry valid at the observation time, project polygons to an appropriate metric CRS, buffer each `station_area` by 30 metres and test whether the point lies within the union of permitted areas. Handle multipolygons, boundaries and location uncertainty. Resolve whether separate geofencing restrictions alter the rule with the municipality.
3. **Open a candidate interval.** After a credible `trip_end` or provider drop-off outside the permitted area, store the vehicle's stable historical ID, coordinates, first outside timestamp and evidence. A failed unlock/zero-distance trip must not create a false travel sequence. A single point is a location observation, not proof of continued parking.
4. **Advance or invalidate the interval.** Later trusted observations of the same vehicle at the same place may support continued parking. A `trip_start`, verified company pickup, municipal pickup, move inside a station or credible relocation ends or changes the interval. Reservations, lost communications and apparent GPS jumps require explicit treatment. Avoid treating silence as continuous location proof.
5. **Evaluate the challenge threshold.** A case satisfies the spatial and temporal definition only with evidence supporting continuous outside-area parking for **strictly more than 120 minutes**. Retrospective event reconstruction can identify candidates and bounded intervals; confirmation quality depends on observation frequency and event completeness. Label evidence `verified`, `supported` or `needs field check`, with explicit criteria agreed by the municipality. Do not equate a long gap between events with certain continuous dwell.
6. **Check responsibility and escalation.** Query the company's recovery status and any notification/cure period. Compute `municipal_eligible_at` only after the contractual and operational prerequisites are satisfied. The two-hour challenge definition is distinct from any additional company response deadline or penalty trigger. A dispatcher approves or rejects a case if the evidence is incomplete.
7. **Dispatch and resolve.** Reconfirm the bike is still present shortly before dispatch and again before arrival where possible. Record actual municipal collection, depot check-in, company handover and final disposition. Preserve cancellations and false positives for quality analysis.

**Live-data constraint:** the supplied GBFS public IDs rotate. A reliable live detector needs an authorized stable ID/event feed, or a documented alternative such as verified field observations. Matching anonymous successive points by proximity may suggest a candidate but can conflate adjacent bicycles; it must not be the sole basis for formal action or a penalty. A historical replay can demonstrate the logic while this dependency is unresolved.

### 3.3 Municipal operator workflow and interface

- **Dispatch view:** map and queue with case ID, last known position, evidence timeline, eligible time, last update, company status, photo if available, safety/access notes and estimated service time. Filter out uncertain and resolved cases from automatic dispatch.
- **Mission creation:** depot = verified vehicle entrance at the Complexo Multisserviços; choose shift, operator, vehicle and bike-carrying capacity. Assign only eligible cases. Make late or high-impact cases more urgent without inventing a statutory priority rule.
- **Departure and stop execution:** operator checks in, follows a road-legal route, confirms a vehicle identifier at each stop, records `found/picked up`, `not found`, `company already recovered`, `in use`, `unsafe access` or `unable to load`, and adds timestamp/location/photo as appropriate. “Not found” closes no abandonment finding automatically; it opens a reconciliation task.
- **On-route changes:** remove a case verified recovered by the company or started on a new trip; add newly eligible cases if capacity and shift permit. Keep the stop the operator is already approaching fixed unless safety or dispatcher intervention requires a change. Show the reason and ETA changes to the operator.
- **Return and custody:** finish at the Complexo Multisserviços, register each bicycle and condition, reconcile manifest against pickups, log storage location and later transfer to the company. If capacity fills or the shift ends, return to depot and create another mission for remaining cases.
- **Exceptions:** lost signal, no safe stopping, inaccessible private land, incorrect coordinate, duplicate case, damaged battery, accident and operator safety. Specify escalation and whether a second person or specialist is required before operational use.

**Minimal case fields:** `case_id`, `provider_id`, stable `device_id` where authorized, vehicle type, observed coordinates and accuracy, `station_area_version`, first/last observed timestamps, evidence references, detector status, company notice/acknowledgement/recovery timestamps, response-rule version, municipal eligibility/approval, assignment, stop attempts, collection and depot timestamps, custody status, actor IDs, photos/notes and cancellation reason. Limit personal information and role-based access. Keep route history and source payload references for audit.

### 3.4 Routing and optimization

The municipality solves a **capacity-constrained pickup route**: one or more municipal vehicles depart from the Complexo Multisserviços, collect eligible bicycles, and return to the same depot. There are no station deliveries. Inputs include a road-network time/distance matrix, safe roadside access points, service minutes per pickup, carrying capacity, current load, shift window, case urgency and any route/vehicle restrictions. Distance between GPS points is not road travel time.

An initial objective can minimize `travel_minutes + pickup_minutes + weighted_overdue_minutes + missed_case_penalty`, subject to depot start/end, capacity and shift constraints. Weights and missed-case policy require municipal approval. If several operators are available, solve a multi-vehicle pickup VRP; with one operator, solve a depot-return tour with capacity and possible multiple depot trips. Use a simple nearest-feasible baseline and an optimizer under **identical** travel-time and service assumptions. Report both estimated and actual routes separately.

Recalculate at case creation, company recovery, new trip, municipal completion and material road disruption; avoid continuously redirecting a driver for negligible gains. Store route version, trigger, planned stops, rejected cases and reason. Verify no route exceeds load or shift constraints, and manually review unsafe or implausible access points. OR-Tools or another VRP solver can implement the planner; a routing engine using a validated drivable road network supplies the travel matrix.

### 3.5 What to validate before deployment

- Replay several days without using future events at decision time; later events can validate whether a predicted case persisted or was recovered. Prevent hindsight leakage.
- Compare candidate and confirmed cases with a manually checked sample and provider logs. Measure false alerts, missed cases and detection delay by vehicle type and geography.
- Check 30-metre boundaries, midnight/time-zone transitions, duplicate events, late arrivals, missing IDs, adjacent vehicles, failed trips and lost communications.
- Test route capacity, depot return, cancellation immediately before arrival, safety exceptions and condition/custody reconciliation in a supervised field trial.
- Agree evidence retention, operator safety, notification and dispute handling with municipal staff before formal enforcement.

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
| Custody and return | Bikes checked into depot, bikes awaiting company collection, time in custody and reconciled releases. | Prevents loss and clarifies responsibility after pickup. |

**Penalties and recovery costs.** Build a rule table for the actual contract: triggering event, eligible vehicle, grace/response period, notice requirements, exclusions, evidence standard, calculation, cap, dispute window and effective dates. Only then classify `potentially qualifying`, `notified`, `issued`, `contested`, `upheld`, `paid` or `waived`. Show counts and euro values at each stage. Historical trip/event files do not identify users or contain a penalty ledger. A modelled municipal collection cost is not an actual invoice, and an abandonment case does not automatically create a fine. No individual-user attribution is possible from these attachments.

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

For a usable model, build a time-dependent multimodal graph from pedestrian/cycling streets and transport stops, schedules and transfers. For each origin–destination–time pair, compare generalized door-to-door costs and identify the distance or circumstances where the preferred option changes. Estimate uncertainty and different user/accessibility profiles. Trip data from shared bicycles alone cannot estimate actual switching to walking, bus or rail; seek transport counts, survey or aggregated multimodal observations for calibration. Use the results to evaluate whether a proposed bicycle station improves access to public transport and underserved destinations.

## 5. Proposed system and delivery sequence

**Shared data layer:** versioned source ingests → validated vehicle events and station geometries → case/evidence store → company/municipal action log → route plans and depot custody → analytics marts. A single case ID and event timeline link the operational action to the oversight calculation. Distinct identifiers mark operator versus municipal action; retain both event time and ingestion time. Show provenance and the last successful refresh on every dashboard.

**Demonstration sequence:** (1) select a historical day and replay only observations known up to a simulated clock; (2) display a bicycle outside the buffered station area and evidence of its dwell; (3) show company status and an explicit, simulated municipal eligibility rule if the real contract is unavailable; (4) route a municipal vehicle from the Complexo Multisserviços through eligible pickups and back; (5) simulate a company recovery/new trip and replan; (6) record depot intake; (7) inspect separate company/municipal KPIs and a geographically supported station candidate. Mark every simulated event and contractual assumption.

**Suggested implementation order:**

1. Reconcile schema, time zones, failed trips and station geometry; build a historical case detector with evidence levels.
2. Obtain or simulate the company status and municipal eligibility rule; build the case review and audit trail.
3. Verify the depot entrance, road matrix, safe access and capacity; build and compare a depot-return route planner.
4. Add a simple operator stop workflow and depot manifest; calculate observed versus modelled operational metrics.
5. Add station demand and candidate-area views; extend to multimodal routing when transport schedules and behavior data are available.
6. Replace simulated links with authorized live feeds and contract rules only after field verification.

**Pilot acceptance criteria to agree:** spatial classification accuracy on manually reviewed locations; detection precision/recall and delay; percentage of company recoveries that cancel dispatch before a wasted visit; capacity and depot-return compliance; manifest reconciliation; route time against the agreed baseline; measured municipal cost and staff feedback. Set numeric targets only after establishing baseline data.

## 6. Questions for the project team and municipal partners

The following questions determine the operating rules and implementation. **Questions 1–12 are the highest-priority decisions for a trustworthy municipal prototype.**

### Authority, ownership and escalation

1. Does Challenge #9 cover bicycles only in this project, or scooters and other vehicle types too? Do types have different parking or collection rules?
2. What exact contract clause permits municipal collection, and what events trigger it? Is abandonment at >120 minutes itself sufficient, or is there a separate provider response period?
3. Who sends the company a notice, through what channel, and at what timestamp does its response clock start? What counts as proof of receipt?
4. Which recovery or service-level exclusions apply (in-use, maintenance, communications outage, unsafe/inaccessible location, emergency, weather, weekends)?
5. Who has authority to approve collection and resolve disputed or ambiguous cases? Is a human review always required?
6. Does the company regain physical custody at the depot, and what receipt, storage deadline and transport arrangements apply? Who is liable for damage while in municipal custody?

### Identity, observations and location evidence

7. Can the company provide a stable authorized vehicle ID and timestamped position/status history in near real time, with documented location accuracy and retention?
8. Can the municipality receive real-time `trip_start`, `trip_end`, provider pickup and drop-off events? What is their worst-case delivery delay and expected completeness?
9. Is the authoritative permitted area precisely each `station_area` polygon plus 30 metres? How are geofencing exclusions, overlapping stations and revisions dated?
10. What observation sequence and location tolerance are sufficient to assert that **the same bicycle** stayed outside for more than 120 minutes? How should GPS drift and adjacent bicycles be handled?
11. What do `maintenance_pick_up`, `provider_drop_off`, `removed`, `missing` and `non_contactable` mean operationally? Which events prove actual company recovery?
12. How are failed unlocks/trips identified conclusively? Are the supplied historical timestamps UTC or local time, and what is the exact extract period?

### Municipal route, safety and depot

13. What are the coordinates of the Complexo Multisserviços **collection-vehicle entrance**, operating hours, loading point and vehicle restrictions?
14. How many municipal operators and vehicles are available, and what is each vehicle's safe capacity by bicycle/vehicle type?
15. What are the shift lengths, breaks, pickup service times and any priority or maximum-wait rules?
16. May an operator take multiple depot trips in one shift? Can a mission cross municipal boundaries?
17. Which locations prohibit stopping or require special access, a second person or a specialist for a damaged battery/vehicle?
18. Which operator device, navigation app, offline mode and evidence capture are acceptable? What is the escalation path for an inaccurate location or unsafe pickup?
19. How are bicycle ID, condition, photos, seals, storage position and company collection receipt recorded at the depot?

### Company oversight, costs and analytics

20. Which company redistribution and recovery logs can be shared, with actor, times, station, vehicle count and reason?
21. Are station capacity, historical stock, current availability and out-of-service counts available? How are virtual stations and full/empty conditions represented?
22. What contractual penalty schedule applies, from which date, and where are notices, disputes, waivers, invoices and payments recorded?
23. What labor, vehicle, fuel/energy, storage and administration cost rates should be included in municipal recovery costs?
24. Which comparison periods and service targets does the municipality already use to evaluate the contracted company?
25. Can the municipality obtain more than three weeks of trips and events, including school terms, holidays, summer peaks and exceptional events?

### Station planning and multimodal journeys

26. Which parcels/public-space sites may host stations, and what accessibility, safety, heritage and environmental restrictions apply?
27. Is there a budget, preferred station size, minimum spacing and required service-equity objective?
28. Can bus and rail operators provide current timetables/GTFS, service changes, validations or aggregate origin–destination and transfer information?
29. Which traveler groups and journey purposes should the mode hierarchy represent? Should monetary cost, hills, personal safety and mobility impairments affect the generalized cost?
30. What decision will the first demonstration support: dispatch today, contract compliance, annual station planning, or all three in separate views?

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
