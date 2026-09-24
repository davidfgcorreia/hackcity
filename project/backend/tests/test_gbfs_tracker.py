from datetime import datetime, timedelta, timezone

from app.core.gbfs_tracker import NOT_IN_FEED, Sighting, Tracker

T0 = datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc)
BIKE = "type-bicycle"


def s(lat=38.70, lng=-9.42, fuel=0.5, disabled=False, reserved=False, reported=T0, type_id=BIKE):
    return Sighting(type_id, "bicycle", lat, lng, disabled, reserved, fuel, reported)


def at(minutes):
    return T0 + timedelta(minutes=minutes)


def test_same_position_keeps_identity_although_feed_id_rotates():
    t = Tracker()
    [first] = t.update([s()], T0)
    [again] = t.update([s()], at(1))
    assert first.event_types == {"gbfs_appeared"} and again.event_types == {"located"}
    assert first.device_id == again.device_id and first.device_id.startswith("bicycle-")


def test_gps_jitter_within_tolerance_is_same_vehicle():
    t = Tracker(tolerance_m=10)
    [a] = t.update([s()], T0)
    [b] = t.update([s(lat=38.70004)], at(1))  # ~4 m
    assert a.device_id == b.device_id


def test_real_move_or_other_type_or_battery_jump_is_a_new_vehicle():
    for other in (s(lat=38.701), s(type_id="type-scooter"), s(fuel=0.9)):
        t = Tracker()
        [a] = t.update([s()], T0)
        evs = t.update([other], at(1))
        assert any(e.event_types == {"gbfs_appeared"} and e.device_id != a.device_id for e in evs)


def test_two_bikes_at_one_spot_are_both_kept():
    t = Tracker()
    first = t.update([s(fuel=0.5), s(fuel=0.8)], T0)
    again = t.update([s(fuel=0.8), s(fuel=0.5)], at(1))
    assert {e.device_id for e in first} == {e.device_id for e in again}


def test_missing_only_after_grace_period():
    t = Tracker(gone_grace_s=180)
    [a] = t.update([s()], T0)
    assert t.update([], at(2)) == []           # one missed poll: still tracked
    [b] = t.update([s()], at(2.5))              # back at the same spot: same bike
    assert b.device_id == a.device_id
    [gone] = t.update([], at(6))
    assert gone.state == NOT_IN_FEED and gone.device_id == a.device_id


def test_states_from_flags_and_report_age():
    t = Tracker(stale_report_min=30)
    assert t.state_of(s(disabled=True), T0) == "non_operational"
    assert t.state_of(s(reserved=True), T0) == "reserved"
    assert t.state_of(s(reported=at(-45)), T0) == "non_contactable"
    assert t.state_of(s(), T0) == "available"
