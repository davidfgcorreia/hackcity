import io
from datetime import timedelta

import pytest
from fastapi import UploadFile
from sqlalchemy import func, select

from app.core.detector import Rules
from app.core.vehicle_state import Event, apply_event
from app.models import Case, Stop
from app.schemas import MissionOut
from app.schemas import Outcome
from app.services import cases, missions
from tests.conftest import T0

RULES = Rules(abandon_minutes=120, fresh_max_age_min=60, require_fresh_observation=True)
OUTSIDE = lambda lat, lng: 100.0  # noqa: E731


def at(m):
    return T0 + timedelta(minutes=m)


def state(*evs):
    s = None
    for minutes, st, types, pos in evs:
        s = apply_event(s, Event("bike-aaaaaaaa", at(minutes), st, frozenset(types), *pos), 10)
    return s


POS = (38.70, -9.42)
REST = (0, "available", ("trip_end",), POS)
SEEN = (110, "available", ("located",), POS)


def eligible_case(db, device, lat, lng, minutes_ago=200):
    c = Case(device_id=device, status="eligible", source="replay", lat=lat, lng=lng, rest_since=at(-minutes_ago), reason="test")
    db.add(c)
    db.commit()
    return c


def test_route_waypoints_persist_and_old_mission_is_viewable(db, monkeypatch):
    from app.services import road

    eligible_case(db, "bike-waypoint", 38.70, -9.42)
    original = road.straight_line

    def snapped(points):
        result = original(points)
        result["engine"] = "osrm"
        result["waypoints"] = [[lng + .0001, lat + .0001] for lat, lng in points]
        return result

    monkeypatch.setattr(road, "route", snapped)
    mission = missions.replan(db, "waypoint-op", 38.71, -9.41, "test")
    assert mission.route_waypoints[0] == pytest.approx([-9.4099, 38.7101])
    assert len(MissionOut.model_validate(mission).route_waypoints) == len(mission.stops) + 1
    mission.route_waypoints = None
    db.commit()
    assert MissionOut.model_validate(missions.current_mission(db, "waypoint-op")).route_waypoints is None


def test_case_lifecycle_candidate_to_resolved(db):
    s = state(REST)
    assert cases.sync_all(db, {"b": s}, OUTSIDE, at(30), RULES, source="replay") == []
    assert db.scalar(select(Case)).status == "candidate"
    cases.sync_all(db, {"b": s}, OUTSIDE, at(121), RULES, source="replay")
    assert db.scalar(select(Case)).status == "supported"
    s = state(REST, SEEN)
    assert cases.sync_all(db, {"b": s}, OUTSIDE, at(125), RULES, source="replay") == ["new eligible bike aaaaaaaa"]
    s = state(REST, SEEN, (130, "on_trip", ("trip_start",), POS))
    cases.sync_all(db, {"b": s}, OUTSIDE, at(131), RULES, source="replay")
    case = db.scalar(select(Case))
    assert case.status == "resolved" and "started a trip" in case.reason
    assert [e.detail["to"] for e in case.timeline] == ["candidate", "supported", "eligible", "resolved"]


def test_unchanged_verdict_adds_no_timeline_noise(db):
    s = state(REST)
    for m in (10, 20, 30):
        cases.sync_all(db, {"b": s}, OUTSIDE, at(m), RULES, source="replay")
    assert len(db.scalar(select(Case)).timeline) == 1


def test_inside_bike_creates_no_case(db):
    cases.sync_all(db, {"b": state(REST)}, lambda la, ln: 0.0, at(500), RULES, source="replay")
    assert db.scalar(select(Case)) is None


def test_replan_creates_mission_ending_at_depot(db):
    eligible_case(db, "near0000", 38.701, -9.42)
    eligible_case(db, "far00000", 38.710, -9.42)
    m = missions.replan(db, "op1", 38.700, -9.42, "test")
    planned = [s for s in m.stops if s.status == "planned"]
    assert [s.kind for s in planned] == ["pickup", "pickup", "depot"]
    assert m.version == 1 and "next: bike near0000" in m.last_change
    assert {c.status for c in db.scalars(select(Case))} == {"assigned"}


def test_new_road_route_notifies_operator_when_stops_stay_the_same(db):
    eligible_case(db, "bike0001", 38.701, -9.42)
    first = missions.replan(db, "op1", 38.700, -9.42, "initial route")
    old_version, old_geometry = first.version, first.route_geojson
    updated = missions.replan(db, "op1", 38.7005, -9.42, "Off route — new route calculated")
    assert updated.version == old_version + 1
    assert updated.route_geojson != old_geometry
    assert "Off route" in updated.last_change
    assert "next: bike bike0001" in updated.last_change


def test_unchanged_route_does_not_repeat_the_notice(db):
    eligible_case(db, "bike0001", 38.701, -9.42)
    first = missions.replan(db, "op1", 38.700, -9.42, "initial route")
    old_version, old_change = first.version, first.last_change
    updated = missions.replan(db, "op1", 38.700, -9.42, "routine refresh")
    assert updated.version == old_version
    assert updated.last_change == old_change


def test_capacity_queues_extra_cases(db, monkeypatch):
    monkeypatch.setattr(missions.settings, "van_capacity", 2)
    for i in range(5):
        eligible_case(db, f"bike{i:04d}", 38.70 + i / 1000, -9.42, minutes_ago=200 + i)
    m = missions.replan(db, "op1", 38.70, -9.42, "test")
    assert len([s for s in m.stops if s.kind == "pickup"]) == 2
    statuses = sorted(c.status for c in db.scalars(select(Case)))
    assert statuses == ["assigned"] * 2 + ["eligible"] * 3
    assert "3 queued" in m.last_change


def test_assigned_bike_starting_trip_is_removed_from_route(db):
    s = state(REST, SEEN)
    cases.sync_all(db, {"b": s}, OUTSIDE, at(125), RULES, source="replay")
    m = missions.replan(db, "op1", 38.70, -9.42, "start")
    moved = state(REST, SEEN, (130, "on_trip", ("trip_start",), POS))
    reasons = cases.sync_all(db, {"b": moved}, OUTSIDE, at(131), RULES, source="replay")
    db.commit()
    missions.replan_all(db, "; ".join(reasons))
    m = missions.current_mission(db, "op1")
    assert [s.kind for s in m.stops if s.status == "planned"] == ["depot"]
    assert m.version == 2 and "started a trip" in m.last_change


def _photo():
    return UploadFile(io.BytesIO(b"jpg"), filename="p.jpg")


def test_pickup_outcome_is_recorded_once(db, tmp_path, monkeypatch):
    monkeypatch.setattr(missions.settings, "uploads_dir", str(tmp_path))
    c = eligible_case(db, "bike0001", 38.701, -9.42)
    m = missions.replan(db, "op1", 38.70, -9.42, "t")
    stop = next(s for s in m.stops if s.kind == "pickup")
    args = (Outcome.picked_up, "op1", 38.7011, -9.42, "bike0001", None, "uuid-1")
    missions.record_outcome(db, stop.id, *args, _photo())
    m = missions.record_outcome(db, stop.id, *args, _photo())  # offline retry
    db.refresh(c)
    assert c.status == "picked_up"
    assert len(list(tmp_path.iterdir())) == 1
    assert missions.onboard(m) == 1
    assert [e.kind for e in c.timeline].count("field_outcome") == 1


def test_unsafe_stop_is_blocked_and_excluded(db):
    c = eligible_case(db, "bike0001", 38.701, -9.42)
    m = missions.replan(db, "op1", 38.70, -9.42, "t")
    stop = next(s for s in m.stops if s.kind == "pickup")
    m = missions.record_outcome(db, stop.id, Outcome.unsafe, "op1", 38.70, -9.42, None, "busy road", None, None)
    db.refresh(c)
    assert c.blocked_reason == "unsafe" and c.status == "eligible"
    assert [s.kind for s in m.stops if s.status == "planned"] == ["depot"]


def test_depot_visit_frees_capacity(db, monkeypatch):
    monkeypatch.setattr(missions.settings, "van_capacity", 1)
    eligible_case(db, "bike0001", 38.701, -9.42)
    eligible_case(db, "bike0002", 38.702, -9.42)
    m = missions.replan(db, "op1", 38.70, -9.42, "t")
    stop = next(s for s in m.stops if s.kind == "pickup" and s.status == "planned")
    m = missions.record_outcome(db, stop.id, Outcome.picked_up, "op1", 38.70, -9.42, "x", None, None, _photo())
    assert [s.kind for s in m.stops if s.status == "planned"] == ["depot"]  # van full
    m = missions.depot_arrived(db, m.id, 38.72, -9.42)
    assert [s.kind for s in m.stops if s.status == "planned"] == ["pickup", "depot"]


def test_blocked_or_unapproved_cases_never_routed(db):
    c1 = eligible_case(db, "blocked0", 38.701, -9.42)
    c1.blocked_reason = "inaccessible"
    c2 = eligible_case(db, "field000", 38.702, -9.42)
    c2.needs_approval = True
    db.commit()
    m = missions.replan(db, "op1", 38.70, -9.42, "t")
    assert all(s.kind == "depot" for s in m.stops)
    assert db.scalars(select(Stop).where(Stop.kind == "pickup")).first() is None


def test_picked_up_bike_is_not_recreated_while_feed_still_shows_it_parked(db):
    s = state(REST, SEEN)
    cases.sync_all(db, {"b": s}, OUTSIDE, at(125), RULES, source="replay")
    db.scalar(select(Case)).status = "picked_up"
    db.commit()
    cases.sync_all(db, {"b": s}, OUTSIDE, at(200), RULES, source="replay")
    assert db.scalar(select(func.count()).select_from(Case)) == 1
    moved = state(REST, SEEN, (300, "available", ("trip_end",), (38.71, -9.42)))
    cases.sync_all(db, {"b": moved}, OUTSIDE, at(310), RULES, source="replay")
    assert db.scalar(select(func.count()).select_from(Case)) == 2  # new parking interval = new case


def test_replan_stores_road_route_and_etas(db):
    eligible_case(db, "near0000", 38.701, -9.42)
    eligible_case(db, "far00000", 38.710, -9.42)
    m = missions.replan(db, "op1", 38.700, -9.42, "test")
    assert m.routing_engine == "straight-line"  # OSRM mocked away in tests
    assert m.route_geojson["type"] == "LineString" and len(m.route_legs) == 3  # 2 stops + depot
    etas = [s.eta_s for s in sorted(m.stops, key=lambda s: s.seq) if s.status == "planned"]
    assert etas == sorted(etas) and etas[0] > 0
