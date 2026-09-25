"""The presentation demo: five fixed bikes, a mission from the depot, isolated from real operations."""
import io

from fastapi import UploadFile
from sqlalchemy import func, select

from app.config import settings
from app.models import Case, Mission
from app.schemas import Outcome
from app.services import demo, missions


def pickups(m):
    return [s for s in m.stops if s.kind == "pickup" and s.status == "planned"]


def test_demo_mission_has_five_bikes_and_starts_at_the_depot(db):
    m = demo.reset_demo(db)
    assert m.operator_id == "demo" and (m.start_lat, m.start_lng) == (settings.depot_lat, settings.depot_lng)
    assert len(pickups(m)) == 5
    assert [s.kind for s in m.stops if s.status == "planned"][-1] == "depot"
    assert {c.device_id for c in db.scalars(select(Case))} == {b[0] for b in demo.DEMO_BIKES}


def test_restarting_the_demo_replaces_it_without_duplicates(db):
    demo.reset_demo(db)
    demo.reset_demo(db)
    assert db.scalar(select(func.count()).select_from(Case)) == 5
    assert db.scalar(select(func.count()).select_from(Mission)) == 1


def test_demo_and_real_operations_never_share_bikes(db):
    db.add(Case(device_id="real-bike", status="eligible", source="replay", lat=38.73, lng=-9.39, reason="t"))
    db.commit()
    m = demo.reset_demo(db)
    assert all(db.get(Case, s.case_id).source == "demo" for s in pickups(m))
    real = missions.replan(db, "op1", 38.73, -9.39, "t")
    assert [db.get(Case, s.case_id).device_id for s in pickups(real)] == ["real-bike"]


def test_pickup_with_photo_continues_from_that_bike(db, tmp_path, monkeypatch):
    monkeypatch.setattr(missions.settings, "uploads_dir", str(tmp_path))
    m = demo.reset_demo(db)
    first = pickups(m)[0]
    photo = UploadFile(io.BytesIO(b"jpeg"), filename="bike.jpg")
    m = missions.record_outcome(db, first.id, Outcome.picked_up, "demo", first.lat, first.lng,
                                db.get(Case, first.case_id).device_id, "Scratched mudguard", None, photo)
    assert len(pickups(m)) == 4
    assert (m.start_lat, m.start_lng) == (first.lat, first.lng)
    event = next(e for e in db.get(Case, first.case_id).timeline if e.kind == "field_outcome")
    assert event.detail["notes"] == "Scratched mudguard" and event.detail["photo"]
