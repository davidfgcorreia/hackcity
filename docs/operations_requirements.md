# Municipal Bicycle Recovery: Operational Product Description

**Working product requirements · 24 September 2026**

This document describes the operational part of the Cascais bicycle recovery project: what staff need to accomplish, how a bicycle becomes a collection task, what the field app must support, and where the product's responsibility ends. It records decisions made in the project interview and later clarifications. Items marked **To confirm** are necessary decisions or facts that are still missing. Infrastructure, service choices, implementation design, and code are outside this document.

## 1. Purpose and intended outcome

Cascais Próxima and the municipality need to identify bicycles that remain outside permitted station areas, avoid sending a municipal operator to bicycles that have already moved or been recovered, and collect eligible bicycles efficiently. The first deliverable is intended for **real municipal collection work**. A separate demonstration mode may use historical data to show the same workflow.

The operational product should reduce the time from a supported abandonment finding to municipal pickup, reduce visits where no bicycle is found, and make the reason for each collection decision visible. It should guide the operator through eligible stops and finish each collection trip at the Complexo Multisserviços da Câmara de Cascais. The municipality collects bicycles that the contracted provider has failed to recover. The provider remains responsible for ordinary recovery, maintenance, and station balancing.

The first release covers **bicycles in the Cascais operating area**. It does not route municipal staff to redistribute bicycles among stations. Its users are municipal or Cascais Próxima staff; the provider does not use the app.

## 2. Product boundaries

| Included in the operational product | Outside the operational product |
|---|---|
| Detect and review possible abandonment; record evidence and uncertainty. | Send warnings or notices to the provider. |
| Create eligible collection tasks and update municipal routes. | Decide, calculate, issue, or collect contractual penalties. |
| Give field operators a route, stop details, outcome recording, and pickup evidence capture. | Perform the provider's ordinary recovery or station balancing. |
| Preserve case history and export evidence to an existing municipal process. | Run depot check-in, inventory, company handover, or custody administration. |
| Show simple operational results such as detection accuracy, failed visits, and time to pickup. | Deliver the broader oversight, station planning, and multimodal analytics product. |

The route ends at the depot, but arrival there does not trigger an in-app check-in or manifest reconciliation. Municipal custody after pickup remains a municipal responsibility handled outside this product. A case may be exported for review by the existing penalty process even if the provider recovers the bicycle before municipal pickup; this product does not decide whether a fine is owed.

## 3. People and responsibilities

**Field operator.** Uses a municipality-issued smartphone to view the current route, identify each bicycle, record what happened at a stop, capture pickup evidence, and report access or safety problems. The operator can report an additional bicycle found in the field, but cannot collect that unassigned bicycle until the new case is approved.

**Case reviewer.** Handles exceptions and uncertain or disputed facts, including faulty locations and field reports that disagree with provider data. A reviewer approves collection of a newly found, unassigned bicycle. The exact review queue and response time are **to confirm**.

**Municipal bike-service administration.** Owns the operating rules and the authority under which municipal collection happens. The product applies approved rules automatically; staff handle exceptions. The exact contractual and legal basis still needs confirmation from this administration.

**Cascais Próxima operations lead.** Accountable for approving the first real-use operational requirements and pilot, including the final operating rules and measurable acceptance targets.

The expected staff group is small. The project team has asked for municipal staff to be able to see and update cases. The final permission policy, including who can override decisions and approve unassigned pickups, remains **to confirm**.

## 4. What counts as a possible abandoned bicycle

### Permitted parking area

Use the station-area shape that applied when the bicycle was observed, extended by 30 metres. This is a buffer around the actual station area, not a circle drawn from a station centre. A bicycle exactly on the outer boundary counts as inside. For this release, the project team has said that other geofencing rules do not change this parking test.

A reported position is not automatically reliable. If its location error could place the bicycle inside the permitted area, keep the case **uncertain**. To count as outside, the reported position must be beyond the buffered area by more than that error. Staff must be able to see the position, time, station boundary used, and the reason for an uncertain result.

### Parking interval and 120-minute rule

A credible trip end outside the permitted area starts a possible parking interval. The challenge threshold is **strictly more than 120 minutes**; exactly 120 minutes does not qualify. A failed unlock does not by itself show that the bicycle moved. A cancelled trip resets the interval only when reliable evidence shows actual movement. If the same bicycle moves between outside locations, its case can remain the same, but a confirmed move starts a new dwell interval.

One old trip-end position is insufficient to send a municipal operator. It creates a **candidate**. A fresh observation at the same location, or field confirmation, is required before dispatch. Lack of a new event must not be presented as proof that the bicycle stayed still. An uncertain bicycle may be added as a verification stop to an existing mission, but a separate collection mission is not created solely to verify it.

The precise observation pattern needed to establish continuous parking, the meaning of provider movement events, and the maximum age of a “fresh” observation are **to confirm**. Until those rules are approved, the product must label the evidence accurately and must not silently promote a candidate into an eligible pickup.

### Provider status and municipal eligibility

The municipality collects bicycles the provider has not recovered. A supported parking interval is therefore only part of the eligibility decision. Before a task enters a route, the product must account for available evidence of a new trip or provider recovery and apply the municipality's approved collection rule. The product does not start a provider notice or cure-period workflow. The exact provider events that establish recovery and any contractual exceptions are **to confirm**.

The project team's intended behavior is automatic dispatch once all approved spatial, time, evidence, and provider-status conditions are met. Staff may intervene when a location is wrong or another exception makes the automated result unreliable. Every correction or override should preserve the earlier evidence, the person who acted, when they acted, and why.

## 5. Case journey

The following stages describe what staff need to understand; their final labels in the app are **to confirm**.

| Stage | Meaning | Expected next action |
|---|---|---|
| Candidate | A bicycle was observed outside after a credible trip end, but continued parking is not established. | Await fresh evidence or add a field verification stop to an existing mission. |
| Uncertain | Location accuracy, identity, timing, or event meaning prevents a reliable decision. | Show the uncertainty to a reviewer; do not automatically dispatch. |
| Supported abandonment | Evidence supports the location and duration rule. | Check provider status and municipal eligibility. |
| Eligible | Approved collection rules are met and no reliable event shows that the bicycle is gone. | Create or update a municipal mission automatically. |
| Assigned / on route | The bicycle is a stop on an operator's current route. | Show stop details and monitor new events. |
| Picked up | The municipal operator confirmed the bicycle and captured required evidence. | Remove the stop from the active route and retain its case history. |
| Resolved without pickup | A new trip, provider recovery, field “not found,” or another outcome changes the need for municipal collection. | Remove or review the stop as appropriate; retain the reason and evidence. |

A case keeps its history even when its current route task disappears. “Not found” is a field outcome, not proof of who moved the bicycle. A new bicycle found by an operator starts a new case and requires approval before pickup. The exact rules for reopening, merging duplicates, and closing disputed cases are **to confirm**.

## 6. Mission and route behavior

An eligible bicycle becomes a collection stop without requiring staff to create a mission manually. A mission starts from the operator's **current position**, not necessarily from the depot, and must finish at the Complexo Multisserviços depot. An operator may make more than one depot trip during a shift. The app suggests an efficient driving order based primarily on distance while respecting bicycle capacity and safe access. Staff may choose a manual stop order.

The first release uses one estimated bicycle capacity for every van. This is a planning input; its safe value must be validated for the vans used in real collection. If available vans cannot collect all eligible bicycles within a shift, remaining cases stay in a priority queue for the next mission or shift. The exact priority order is **to confirm**. Distance is useful for route efficiency, but an unsafe or inaccessible stop must be excluded and shown to staff with its reason.

The route must update when a new eligible case appears, a bicycle starts a new trip, the provider reports recovery, or an operator completes a stop. It should also update when a wrong turn or material traffic change affects the route. A route change should tell the operator **what changed, why, and the new target**. If a new trip or provider pickup concerns a bicycle already on the route, remove that stop and recalculate. Keep the case and any exported penalty evidence separate from the active route.

The number of operators and vans, actual shifts and breaks, pickup service times, depot vehicle entrance, and detailed stopping restrictions are **to confirm**. The product should not promise a feasible route until these operating facts are supplied.

## 7. Field operator experience

The first field app targets a **municipality-issued smartphone** and supports **Portuguese and English**. Its main view is a map with the current route, pickup stops, the next destination, and a way to inspect a stop as a list. Before travelling, the operator should be able to see the bicycles classed as abandoned and the suggested collection order. The app does not require a separate mission acceptance or departure confirmation.

At a stop, the operator needs the case reference, bicycle identifier, last known position and time, available photo or observations, access notes, and current provider status. The app should make uncertainty and recent changes prominent. The operator identifies the bicycle before recording a pickup. If it is at a different position, the operator confirms the ID, records the actual location, and may continue only if the bicycle is still eligible.

The app must support these stop outcomes: **picked up, not found, in use, provider already recovered, unsafe, inaccessible, and unable to load**. For every successful pickup it must capture the bicycle ID, pickup time, actual position, and a photo. Notes or further evidence may be added. For other outcomes, the exact mandatory evidence and whether a supervisor must approve a follow-up action are **to confirm**.

If the operator finds another bicycle outside a permitted area, they may create a case and supply its location and evidence. Collection waits for approval. If several bicycles are found together, each needs its own identity and case decision. The operator must be able to report an incorrect location, unsafe stopping place, inaccessible land, or a bicycle that cannot be carried. Safety and access exceptions must remain visible to staff rather than disappearing from the work list.

Route changes and new assignments are time sensitive. The operator should receive a clear notification when the next stop changes and should not have to infer the reason from the map. When connectivity is lost, the app keeps the current route visible and lets the operator save pickup records for later synchronization. Records awaiting synchronization must be clearly distinguishable from records already received by the municipality.

## 8. Municipal review view and operational records

Municipal staff need a simple view of candidate, uncertain, eligible, active, and completed cases. For each case, they should be able to inspect the evidence timeline, the station boundary used, the 120-minute calculation, the latest provider status, field outcomes, route changes, and staff corrections. The map should show the current position and uncertainty; a list should support searching and review without relying on map interaction.

Staff need to correct faulty positions, review exceptions, approve a field-found bicycle, and export a case record for the existing municipal enforcement process. The exported record should preserve what was observed and when, what was inferred, which rule was applied, what staff changed, and what the field operator actually found. The export is evidence, not a penalty decision. The exact export format and receiving team are **to confirm**.

Operational records should distinguish event time from the time information reached staff, and planned route details from actual field outcomes. This supports review of late provider events and route changes. The project team requested indefinite evidence retention, but the formal retention and access policy is **to confirm before real use**.

## 9. Demonstration mode

A separate demonstration mode may replay the supplied historical trips and vehicle events. At each simulated moment it should use only observations already available by that moment, then show how a candidate becomes supported, eligible, assigned, or resolved. A demonstration may simulate provider status or field actions where real records do not exist, but it must label them as simulated. It should be possible to show a new trip or provider recovery removing a planned stop.

Demonstration mode does not establish that the public bicycle feed can track one bicycle continuously. The supplied public bicycle identifier changes between requests. Real use depends on confirming an authorized source of stable bicycle identity and sufficiently timely observations or defining a staff-confirmed operating fallback.

## 10. Success and acceptance

The first pilot should measure **detection accuracy**, **visits where the bicycle is not found**, and **time from eligibility to pickup**. Targets need a baseline and approval from the Cascais Próxima operations lead. Staff should also assess whether route changes arrive in time to prevent wasted travel and whether field recording is practical during a normal shift.

At minimum, the pilot should demonstrate these observable behaviors:

1. A position on the permitted-area boundary is not treated as outside; a position with overlapping location uncertainty remains uncertain.
2. A trip-end position alone produces a candidate, never an automatic pickup task. Strictly more than 120 minutes and supporting evidence are required.
3. A cancelled trip without reliable movement does not reset the parking clock.
4. An eligible bicycle enters an operator route; a provider pickup or new trip removes it while preserving its case history.
5. An unsafe or inaccessible stop is excluded and its reason is visible for staff review.
6. Capacity limits leave extra cases queued; the chosen mission ends at the depot.
7. A successful pickup records ID, time, actual position, and photo. An unassigned bicycle waits for approval.
8. A loss of connectivity does not hide the current route or discard recorded pickup evidence.

These checks describe product behavior, not a technology choice. Final numerical targets, operating hours, and formal sign-off evidence remain **to confirm**.

## 11. Decisions and information still needed

Before the product can be specified for real municipal use, confirm:

- The municipality's authority and full operating rule for collection, including any exclusions or special cases.
- Whether the provider can supply stable live bicycle identity, timely positions and movement events, location accuracy, and reliable recovery status; what each relevant event means.
- The observation freshness and evidence standard for automatic dispatch, especially when data arrive late or positions change.
- The response to provider disputes, duplicate cases, “not found” outcomes, unsafe sites, damaged bicycles, and incidents in the field.
- The actual number of operators and vans, safe van capacity, shift rules, service times, depot entrance, and priority rule for queued cases.
- Who may approve field-found bicycles, override decisions, and view or change case evidence; the formal evidence-retention rule.
- Whether real work may use staff-confirmed cases if the provider cannot supply the required live data. This fallback was explicitly left open pending provider API confirmation.

Broader contract oversight, station planning, and multimodal travel analysis will be defined in a later requirements document. The source discussion and decisions are recorded in [initial.md](initial.md), [planning/start_questions.md](planning/start_questions.md), and [planning/responses.md](planning/responses.md).
