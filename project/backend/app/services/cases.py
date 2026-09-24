"""Case lifecycle: turn detector verdicts into persisted cases + timeline entries.

Owner: workstream B (task T-B4). Contract:

    sync_vehicle(db, state: VehicleState, result: detector.Result, now) -> Case | None

- verdict none/gone  -> close open case as `resolved` (keep reason: new trip, provider pickup, ...)
- candidate/uncertain/supported/eligible -> create or update the open case for this device;
  append a CaseEvent only when status changes (event_time = now, recorded_at = wall clock)
- never downgrade assigned/picked_up from the detector; if an assigned bike goes `gone`,
  mark the stop removed and call missions.replan(reason="bike X started a trip")
- blocked_reason set  -> keep case, exclude from routing
"""
