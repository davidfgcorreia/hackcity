from datetime import timedelta

from sqlalchemy import select

from app.models import Case, VehicleEvent
from app.services.live import LiveEngine
from tests.conftest import T0

AREA = {"type": "MultiPolygon", "coordinates": [[[[-9.42017, 38.69987], [-9.41983, 38.69987],
                                                   [-9.41983, 38.70013], [-9.42017, 38.70013], [-9.42017, 38.69987]]]]}
FAR = (38.7050, -9.4200)
BIKE, SCOOTER = "vt-bike", "vt-scooter"


class FakeFeed:
    def __init__(self):
        self.bikes = []
        self.n = 0

    def __call__(self, url):
        if url.endswith("station_information.json"):
            return {"data": {"stations": [{"station_id": "s1", "name": "s1", "lat": 38.7, "lon": -9.42, "station_area": AREA}]}}
        if url.endswith("vehicle_types.json"):
            return {"data": {"vehicle_types": [{"vehicle_type_id": BIKE, "form_factor": "bicycle"},
                                               {"vehicle_type_id": SCOOTER, "form_factor": "scooter"}]}}
        self.n += 1  # rotate ids like the real feed
        return {"data": {"bikes": [dict(b, bike_id=f"id-{self.n}-{i}") for i, b in enumerate(self.bikes)]}}


def bike(pos, type_id=BIKE, reported=None):
    return {"lat": pos[0], "lon": pos[1], "vehicle_type_id": type_id, "is_disabled": False, "is_reserved": False,
            "current_fuel_percent": 0.5, "last_reported": int((reported or T0).timestamp())}


def status(sf):
    with sf() as db:
        return db.scalar(select(Case.status))


def test_live_feed_drives_detection_with_strict_rule(session_factory):
    feed = FakeFeed()
    live = LiveEngine(session_factory, fetch=feed)
    feed.bikes = [bike(FAR), bike(FAR, SCOOTER)]
    live.poll_once(T0)
    assert status(session_factory) == "candidate"
    for m in range(1, 122):  # re-found every minute = fresh same-position observations
        feed.bikes = [bike(FAR, reported=T0 + timedelta(minutes=m))]
        live.poll_once(T0 + timedelta(minutes=m))
    assert status(session_factory) == "eligible"  # > 120 min + fresh observation
    feed.bikes = []
    live.poll_once(T0 + timedelta(minutes=123))
    assert status(session_factory) == "eligible"  # missing 2 min < 3 min grace
    live.poll_once(T0 + timedelta(minutes=125))
    with session_factory() as db:
        case = db.scalar(select(Case))
        assert case.status == "resolved" and "disappeared from the live feed" in case.reason
        assert case.source == "live"
        # only transitions are stored, not every poll
        assert db.scalar(select(VehicleEvent.event_types).where(VehicleEvent.source == "gbfs")) == ["gbfs_appeared"]


def test_scooters_filtered_and_station_parking_ignored(session_factory):
    feed = FakeFeed()
    live = LiveEngine(session_factory, fetch=feed)
    feed.bikes = [bike((38.7001, -9.42)), bike(FAR, SCOOTER)]
    live.poll_once(T0)
    assert live.in_feed == 1
    live.poll_once(T0 + timedelta(minutes=300))
    assert status(session_factory) is None


def test_parking_clock_survives_restart(session_factory):
    feed = FakeFeed()
    feed.bikes = [bike(FAR)]
    LiveEngine(session_factory, fetch=feed).poll_once(T0)
    restarted = LiveEngine(session_factory, fetch=feed)
    restarted.poll_once(T0 + timedelta(minutes=200))
    [state] = restarted.states.values()
    assert state.rest_since == T0
