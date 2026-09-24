from datetime import timedelta

from sqlalchemy import select

from app.models import Case, Station, VehicleEvent
from app.services.replay import ReplayEngine
from tests.conftest import T0

# ~15 m square station area around (38.7000, -9.4200)
AREA = {"type": "MultiPolygon", "coordinates": [[[[-9.42017, 38.69987], [-9.41983, 38.69987],
                                                   [-9.41983, 38.70013], [-9.42017, 38.70013], [-9.42017, 38.69987]]]]}
FAR = (38.7050, -9.4200)  # ~550 m north


def ev(i, minutes, state, etype, pos):
    return VehicleEvent(id=f"e{i}", device_id="bike-1", state=state, event_types=[etype],
                        lat=pos[0], lng=pos[1], event_time=T0 + timedelta(minutes=minutes))


def test_replay_never_sees_future_events_and_flags_bike_without_new_event(session_factory):
    with session_factory() as db:
        db.add(Station(id="s1", name="s1", lat=38.7, lng=-9.42, area=AREA))
        db.add_all([
            ev(1, 0, "available", "trip_end", FAR),
            ev(2, 110, "available", "located", FAR),
            ev(3, 300, "on_trip", "trip_start", FAR),
        ])
        db.commit()
    engine = ReplayEngine(session_factory)
    engine.tick(T0 + timedelta(minutes=60))
    with session_factory() as db:
        assert db.scalar(select(Case.status)) == "candidate"
    engine.tick(T0 + timedelta(minutes=125))  # no new event at 125: clock alone makes it eligible
    with session_factory() as db:
        assert db.scalar(select(Case.status)) == "eligible"
    engine.tick(T0 + timedelta(minutes=301))
    with session_factory() as db:
        assert db.scalar(select(Case.status)) == "resolved"


def test_bike_parked_at_station_is_ignored(session_factory):
    with session_factory() as db:
        db.add(Station(id="s1", name="s1", lat=38.7, lng=-9.42, area=AREA))
        db.add(ev(1, 0, "available", "trip_end", (38.7001, -9.4200)))
        db.commit()
    ReplayEngine(session_factory).tick(T0 + timedelta(minutes=500))
    with session_factory() as db:
        assert db.scalar(select(Case)) is None
