"""Mission building on top of app.core.routing.

A mission belongs to one operator and lives for the shift. Every replan starts from the van's
last known position, fills the remaining van capacity with the oldest eligible cases and ends at
the depot. `version` changes when the stop order or road route changes, so field clients see
new directions even when the same bikes remain on the mission.
"""
import threading
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.core.routing import Node, plan_mission
from app.models import Case, CaseEvent, Mission, Stop
from app.schemas import Outcome
from app.services import clock, road
from app.services.cases import set_status, short

_lock = threading.RLock()  # replay thread and HTTP handlers both replan

CASE_AFTER_OUTCOME = {
    Outcome.picked_up: "picked_up",
    Outcome.not_found: "resolved",
    Outcome.in_use: "resolved",
    Outcome.provider_recovered: "resolved",
}
BLOCKING = {Outcome.unsafe, Outcome.inaccessible, Outcome.unable_to_load}


def depot() -> Node:
    return Node(None, settings.depot_lat, settings.depot_lng)


def current_mission(db: Session, operator_id: str) -> Mission | None:
    return db.scalar(
        select(Mission)
        .where(Mission.operator_id == operator_id, Mission.status == "active")
        .options(selectinload(Mission.stops))
    )


def replan(db: Session, operator_id: str, lat: float, lng: float, reason: str) -> Mission:
    with _lock:
        m = current_mission(db, operator_id)
        if m is None:
            m = Mission(operator_id=operator_id, capacity=settings.van_capacity,
                        start_lat=lat, start_lng=lng, version=0, stops=[])
            db.add(m)
            db.flush()
        m.start_lat, m.start_lng = lat, lng
        _plan(db, m, reason)
        db.commit()
        db.expire(m, ["stops"])  # reload in seq order
        return current_mission(db, operator_id)


def replan_all(db: Session, reason: str) -> None:
    for m in db.scalars(select(Mission).where(Mission.status == "active")).all():
        replan(db, m.operator_id, m.start_lat, m.start_lng, reason)


def onboard(m: Mission) -> int:
    """Bikes in the van: pickups completed since the last depot visit."""
    done = [s for s in m.stops if s.status == "done"]
    last_depot = max((s.completed_at for s in done if s.kind == "depot"), default=None)
    return sum(1 for s in done if s.outcome == Outcome.picked_up and (last_depot is None or s.completed_at > last_depot))


def _plan(db: Session, m: Mission, reason: str) -> None:
    now = clock.now()
    planned = [s for s in m.stops if s.status == "planned"]
    stop_by_case = {s.case_id: s for s in planned if s.kind != "depot"}
    old_order = [s.case_id for s in sorted(planned, key=lambda s: s.seq) if s.kind != "depot"]
    old_geometry, old_engine = m.route_geojson, m.routing_engine

    cases = db.scalars(select(Case).where(
        Case.blocked_reason.is_(None), Case.needs_approval.is_(False),
        or_(Case.status == "eligible", (Case.status == "assigned") & Case.id.in_(list(stop_by_case) or [-1])),
    )).all()
    by_id = {c.id: c for c in cases}
    nodes = [Node(c.id, c.lat, c.lng, priority=-(c.rest_since or c.created_at).timestamp()) for c in cases]
    start = Node(None, m.start_lat, m.start_lng)
    plan = plan_mission(start, nodes, depot(), max(m.capacity - onboard(m), 0), settings.detour_factor,
                        cost=_driving_time([start, *nodes, depot()]))

    for s in planned:
        if s.kind != "depot" and s.case_id not in plan.order:
            s.status = "removed"
    base = max((s.seq for s in m.stops if s.status == "done"), default=0)
    ordered: list[Stop] = []
    for i, cid in enumerate(plan.order, 1):
        c = by_id[cid]
        s = stop_by_case.get(cid)
        if s is None:
            s = Stop(case_id=cid, kind="pickup", lat=c.lat, lng=c.lng, seq=0)
            m.stops.append(s)
        s.seq, s.lat, s.lng = base + i, c.lat, c.lng
        ordered.append(s)
        if c.status != "assigned":
            set_status(db, c, "assigned", f"stop {i} of mission {m.id}", now, actor="router")
    for cid in plan.queued:
        if by_id[cid].status == "assigned":
            set_status(db, by_id[cid], "eligible", "queued: van capacity reached", now, actor="router")

    dep = next((s for s in planned if s.kind == "depot"), None)
    if dep is None:
        d = depot()
        dep = Stop(case_id=None, kind="depot", lat=d.lat, lng=d.lng, seq=0)
        m.stops.append(dep)
    dep.seq = base + len(plan.order) + 1
    _store_route(m, start, ordered + [dep])

    route_changed = m.route_geojson != old_geometry or m.routing_engine != old_engine
    if plan.order != old_order or route_changed or m.version == 0 or reason.startswith("Off route"):
        added = len(set(plan.order) - set(old_order))
        removed = len(set(old_order) - set(plan.order))
        target = f"bike {short(by_id[plan.order[0]].device_id)}" if plan.order else "depot"
        queued = f", {len(plan.queued)} queued" if plan.queued else ""
        m.version += 1
        m.last_change = f"{reason} (+{added}/−{removed} stops{queued}) — next: {target}"


def _driving_time(nodes: list[Node]):
    """OSRM driving seconds between nodes, or None (plan_mission then uses crow-flies metres)."""
    points = [(n.lat, n.lng) for n in nodes]
    durations = road.matrix(points)
    if durations is None:
        return None
    index = {(n.lat, n.lng): i for i, n in enumerate(nodes)}
    return lambda a, b: durations[index[(a.lat, a.lng)]][index[(b.lat, b.lng)]] or 0.0


def _store_route(m: Mission, start: Node, ordered_stops: list[Stop]) -> None:
    """Road route van -> stops -> depot, with per-stop ETAs (straight line if OSRM is down)."""
    r = road.route([(start.lat, start.lng)] + [(s.lat, s.lng) for s in ordered_stops])
    m.route_geojson, m.route_legs, m.route_waypoints = r["geometry"], r["legs"], r["waypoints"]
    m.duration_s, m.distance_m, m.routing_engine = r["duration_s"], r["distance_m"], r["engine"]
    m.total_km = round(r["distance_m"] / 1000, 2)
    elapsed = 0.0
    for stop, leg in zip(ordered_stops, r["legs"]):
        elapsed += leg["duration_s"]
        stop.eta_s = round(elapsed)


def record_outcome(db: Session, stop_id: int, outcome: Outcome, actor: str, lat: float, lng: float,
                   device_id: str | None, notes: str | None, client_uuid: str | None,
                   photo: UploadFile | None) -> Mission:
    if client_uuid and (dup := db.scalar(select(Stop).where(Stop.client_uuid == client_uuid))):
        return current_mission(db, dup.mission.operator_id)  # offline retry: already recorded
    stop = db.get(Stop, stop_id) or _404()
    if stop.kind == "depot":
        raise HTTPException(409, "use POST /missions/{id}/depot for depot arrival")
    if stop.status != "planned":
        raise HTTPException(409, f"stop is {stop.status}")

    stop.status, stop.outcome, stop.notes = "done", outcome, notes
    stop.actual_lat, stop.actual_lng, stop.confirmed_device_id = lat, lng, device_id
    stop.client_uuid, stop.completed_at = client_uuid, clock.now()
    if photo is not None:
        folder = Path(settings.uploads_dir)
        folder.mkdir(parents=True, exist_ok=True)
        name = f"stop{stop.id}_{uuid4().hex[:8]}{Path(photo.filename or '').suffix or '.jpg'}"
        (folder / name).write_bytes(photo.file.read())
        stop.photo_path = name

    case = stop.case
    detail = {"outcome": outcome, "stop_id": stop.id, "mission_id": stop.mission_id, "position": [lat, lng],
              "device_id": device_id, "photo": stop.photo_path, "notes": notes}
    if device_id and device_id != case.device_id:
        detail["device_id_mismatch"] = case.device_id
    db.add(CaseEvent(case=case, kind="field_outcome", actor=actor, event_time=stop.completed_at, detail=detail))
    if outcome in BLOCKING:
        case.blocked_reason = outcome.value
        set_status(db, case, "eligible", f"blocked in field: {outcome.value}", stop.completed_at, actor=actor)
    else:
        set_status(db, case, CASE_AFTER_OUTCOME[outcome], f"field outcome: {outcome.value}", stop.completed_at, actor=actor)

    m = stop.mission
    return replan(db, m.operator_id, lat, lng, f"bike {short(case.device_id)} {outcome.value.replace('_', ' ')}")


def depot_arrived(db: Session, mission_id: int, lat: float, lng: float) -> Mission:
    m = db.get(Mission, mission_id) or _404()
    for s in m.stops:
        if s.kind == "depot" and s.status == "planned":
            s.status, s.completed_at, s.actual_lat, s.actual_lng = "done", clock.now(), lat, lng
    return replan(db, m.operator_id, lat, lng, "unloaded at depot")


def _404():
    raise HTTPException(404)
