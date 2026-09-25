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
    [again] = t.update([s(reported=at(1))], at(1))
    assert first.event_types == {"gbfs_appeared"} and again.event_types == {"located"}
    assert first.device_id == again.device_id and first.device_id.startswith("bicycle-")


def test_gps_jitter_within_tolerance_is_same_vehicle():
    t = Tracker(tolerance_m=10)
    [a] = t.update([s()], T0)
    [b] = t.update([s(lat=38.70004, reported=at(1))], at(1))  # ~4 m
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
    again = t.update([s(fuel=0.8, reported=at(1)), s(fuel=0.5, reported=at(1))], at(1))
    assert {e.device_id for e in first} == {e.device_id for e in again}


def test_missing_only_after_grace_period():
    t = Tracker(gone_grace_s=180)
    [a] = t.update([s()], T0)
    assert t.update([], at(2)) == []           # one missed poll: still tracked
    [b] = t.update([s(reported=at(2.5))], at(2.5))  # back at the same spot: same bike
    assert b.device_id == a.device_id
    [gone] = t.update([], at(6))
    assert gone.state == NOT_IN_FEED and gone.device_id == a.device_id


def test_repeated_source_timestamp_is_not_new_location_evidence():
    t = Tracker()
    t.update([s()], T0)
    assert t.update([s()], at(1)) == []
    [stale] = t.update([s()], at(31))
    assert stale.state == "non_contactable"
    assert stale.lat is None and stale.event_types == {"feed_state"}


def test_out_of_order_source_timestamps_never_rewind_freshness():
    t = Tracker()
    t.update([s(reported=at(5))], at(5))
    assert t.update([s(reported=at(3))], at(6)) == []
    assert t.update([s(reported=at(4))], at(7)) == []
    [fresh] = t.update([s(reported=at(8))], at(8))
    assert fresh.event_types == {"located"} and fresh.observed_at == at(8)


def test_disappearance_keeps_track_for_reappearance_without_claiming_pickup():
    t = Tracker(gone_grace_s=180)
    [first] = t.update([s()], T0)
    [missing] = t.update([], at(4))
    assert missing.state == "missing" and missing.lat is None
    assert t.update([], at(5)) == []
    [again] = t.update([s(reported=at(6))], at(6))
    assert again.device_id == first.device_id and again.state == "available"


def test_states_from_flags_and_report_age():
    t = Tracker(stale_report_min=30)
    assert t.state_of(s(disabled=True), T0) == "non_operational"
    assert t.state_of(s(reserved=True), T0) == "reserved"
    assert t.state_of(s(reported=at(-45)), T0) == "non_contactable"
    assert t.state_of(s(), T0) == "available"
