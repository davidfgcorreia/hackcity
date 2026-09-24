"""Review-side API behaviour (workstream E): KPIs, corrections, and the evidence export.

Runs against an in-memory SQLite database; the routers only use portable SQLAlchemy.
"""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Case, CaseEvent, Mission, Stop

T0 = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)


@pytest.fixture()
def db():
    # One shared connection: TestClient serves requests on another thread, and an
    # in-memory SQLite database lives inside a single connection.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.create_all(engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)  # not a context manager: the lifespan would reach for Postgres
    app.dependency_overrides.clear()


def make_case(db, *, status="eligible", **kwargs) -> Case:
    case = Case(device_id=kwargs.pop("device_id", "bike-001"), status=status, source="detector",
                lat=38.70, lng=-9.42, rest_since=T0, distance_outside_m=85.0,
                reason="85 m outside for 190 min", **kwargs)
    db.add(case)
    db.commit()
    return case


def status_event(case: Case, status: str, minutes: int) -> CaseEvent:
    """Same shape services/cases.set_status writes: kind="status", detail carries from/to."""
    when = T0 + timedelta(minutes=minutes)
    return CaseEvent(case_id=case.id, kind="status", detail={"from": None, "to": status},
                     actor="detector", event_time=when, recorded_at=when)


# --------------------------------------------------------------------- T-E6 KPIs

def test_kpis_route_is_not_swallowed_by_the_case_id_route(client, db):
    make_case(db)
    body = client.get("/api/cases/kpis").json()
    assert body["by_status"]["eligible"] == 1


def test_kpis_count_every_status_even_when_empty(client, db):
    make_case(db, status="candidate")
    body = client.get("/api/cases/kpis").json()
    assert body["by_status"] == {"candidate": 1, "uncertain": 0, "supported": 0, "eligible": 0,
                                "assigned": 0, "picked_up": 0, "resolved": 0}
    assert body["open_cases"] == 1
    assert body["not_found_rate"] is None  # no visits yet


def test_not_found_rate_counts_completed_visits_only(client, db):
    case = make_case(db)
    db.add(Mission(id=1, operator_id="op1", capacity=6, start_lat=38.7, start_lng=-9.42))
    db.add_all([
        Stop(mission_id=1, case_id=case.id, seq=1, lat=38.7, lng=-9.42, outcome="not_found"),
        Stop(mission_id=1, case_id=case.id, seq=2, lat=38.7, lng=-9.42, outcome="picked_up"),
        Stop(mission_id=1, case_id=case.id, seq=3, lat=38.7, lng=-9.42, outcome=None),  # still planned
    ])
    db.commit()
    body = client.get("/api/cases/kpis").json()
    assert body["visits_completed"] == 2
    assert body["not_found_visits"] == 1
    assert body["not_found_rate"] == 0.5


def test_median_eligible_to_pickup_uses_event_time(client, db):
    slow, quick = make_case(db, device_id="bike-001"), make_case(db, device_id="bike-002")
    db.add_all([
        status_event(slow, "eligible", 0), status_event(slow, "picked_up", 60),
        status_event(quick, "eligible", 10), status_event(quick, "picked_up", 30),
    ])
    db.commit()
    assert client.get("/api/cases/kpis").json()["median_eligible_to_pickup_min"] == 40.0


def test_pickup_before_eligibility_is_not_counted(client, db):
    case = make_case(db)
    db.add_all([status_event(case, "picked_up", 0), status_event(case, "eligible", 30)])
    db.commit()
    assert client.get("/api/cases/kpis").json()["median_eligible_to_pickup_min"] is None


def test_field_outcome_entry_also_marks_a_pickup(client, db):
    case = make_case(db)
    db.add(status_event(case, "eligible", 0))
    db.add(CaseEvent(case_id=case.id, kind="field_outcome", detail={"outcome": "picked_up"},
                     actor="op1", event_time=T0 + timedelta(minutes=45)))
    db.commit()
    assert client.get("/api/cases/kpis").json()["median_eligible_to_pickup_min"] == 45.0


# -------------------------------------------------- T-E3 corrections and unblocking

def test_correction_records_actor_reason_and_previous_values(client, db):
    case = make_case(db)
    r = client.patch(f"/api/cases/{case.id}",
                     json={"actor": "rev1", "reason": "GPS drift", "lat": 38.71})
    assert r.status_code == 200 and r.json()["lat"] == 38.71

    entry = client.get(f"/api/cases/{case.id}").json()["timeline"][-1]
    assert entry["kind"] == "correction" and entry["actor"] == "rev1"
    assert entry["detail"] == {"reason": "GPS drift", "before": {"lat": 38.70}, "after": {"lat": 38.71}}


def test_explicit_null_unblocks_a_case(client, db):
    case = make_case(db, blocked_reason="unsafe: on the roundabout")
    r = client.patch(f"/api/cases/{case.id}",
                     json={"actor": "rev1", "reason": "kerb cleared", "blocked_reason": None})
    assert r.status_code == 200 and r.json()["blocked_reason"] is None


def test_omitted_field_is_left_alone(client, db):
    case = make_case(db, blocked_reason="unsafe")
    client.patch(f"/api/cases/{case.id}", json={"actor": "rev1", "reason": "moved pin", "lat": 38.71})
    assert client.get(f"/api/cases/{case.id}").json()["blocked_reason"] == "unsafe"


# --------------------------------------------------------------- T-E4 evidence export

def test_export_carries_the_rule_that_was_applied(client, db):
    case = make_case(db)
    db.add(status_event(case, "eligible", 200))
    db.commit()

    record = client.get(f"/api/cases/{case.id}/export").json()
    assert record["rule_applied"]["abandon_minutes"] == 120
    assert record["rule_applied"]["station_area_buffer_m"] == 30
    assert record["rule_applied"]["boundary_counts_as_inside"] is True
    assert record["inferred"]["minutes_at_rest"] == 200
    assert record["inferred"]["exceeds_threshold"] is True
    assert record["case"]["device_id"] == "bike-001"


def test_export_separates_observations_staff_actions_and_field_outcomes(client, db):
    case = make_case(db)
    db.add_all([
        status_event(case, "eligible", 200),
        CaseEvent(case_id=case.id, kind="field_outcome", detail={"outcome": "not_found"},
                  actor="op1", event_time=T0 + timedelta(minutes=260)),
    ])
    db.commit()
    client.patch(f"/api/cases/{case.id}", json={"actor": "rev1", "reason": "bad pin", "lat": 38.71})

    record = client.get(f"/api/cases/{case.id}/export").json()
    assert [e["kind"] for e in record["observations"]] == ["status"]
    assert [e["kind"] for e in record["staff_actions"]] == ["correction"]
    assert [e["kind"] for e in record["field_outcomes"]] == ["field_outcome"]
    assert len(record["timeline"]) == 3


def test_export_is_audited_only_when_an_actor_is_given(client, db):
    case = make_case(db)
    client.get(f"/api/cases/{case.id}/export")
    assert client.get(f"/api/cases/{case.id}").json()["timeline"] == []

    client.get(f"/api/cases/{case.id}/export?actor=rev1")
    entry = client.get(f"/api/cases/{case.id}").json()["timeline"][-1]
    assert entry["kind"] == "export" and entry["actor"] == "rev1"


def test_a_status_named_event_kind_is_also_understood(client, db):
    """Tolerated alternative shape: the kind itself names the new status."""
    case = make_case(db)
    db.add_all([
        CaseEvent(case_id=case.id, kind="eligible", detail={}, actor="detector", event_time=T0),
        CaseEvent(case_id=case.id, kind="picked_up", detail={}, actor="op1",
                  event_time=T0 + timedelta(minutes=20)),
    ])
    db.commit()
    assert client.get("/api/cases/kpis").json()["median_eligible_to_pickup_min"] == 20.0
