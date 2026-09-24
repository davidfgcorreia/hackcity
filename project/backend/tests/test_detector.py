from datetime import datetime, timedelta, timezone

from app.core.detector import Rules, Verdict, evaluate
from app.core.vehicle_state import Event, apply_event

T0 = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
POS = (38.70, -9.42)
OUTSIDE = lambda lat, lng: 100.0  # noqa: E731
INSIDE = lambda lat, lng: 0.0  # noqa: E731
RULES = Rules(abandon_minutes=120, fresh_max_age_min=60, require_fresh_observation=True)


def ev(minutes, state="available", types=("trip_end",), pos=POS):
    return Event("bike", T0 + timedelta(minutes=minutes), state, frozenset(types), *pos)


def fold(*events):
    s = None
    for e in events:
        s = apply_event(s, e, move_tolerance_m=10)
    return s


def at(minutes):
    return T0 + timedelta(minutes=minutes)


def test_inside_permitted_area_is_no_case():
    assert evaluate(fold(ev(0)), INSIDE, at(500), RULES).verdict == Verdict.none


def test_exactly_120_minutes_is_still_candidate():
    assert evaluate(fold(ev(0)), OUTSIDE, at(120), RULES).verdict == Verdict.candidate


def test_trip_end_only_never_becomes_eligible():
    assert evaluate(fold(ev(0)), OUTSIDE, at(121), RULES).verdict == Verdict.supported


def test_fresh_observation_after_threshold_makes_eligible():
    s = fold(ev(0), ev(110, types=("located",)))
    assert evaluate(s, OUTSIDE, at(125), RULES).verdict == Verdict.eligible


def test_stale_observation_is_not_fresh():
    s = fold(ev(0), ev(30, types=("battery_low",)))
    assert evaluate(s, OUTSIDE, at(200), RULES).verdict == Verdict.supported


def test_field_confirmation_makes_eligible():
    assert evaluate(fold(ev(0)), OUTSIDE, at(121), RULES, field_confirmed=True).verdict == Verdict.eligible


def test_cancelled_trip_without_move_keeps_clock():
    s = fold(ev(0), ev(60, types=("trip_cancel",)))
    assert s.rest_since == T0


def test_cancelled_trip_with_real_move_resets_clock():
    s = fold(ev(0), ev(60, types=("trip_cancel",), pos=(38.701, -9.42)))
    assert s.rest_since == at(60)


def test_gps_jitter_is_not_a_move():
    s = fold(ev(0), ev(60, types=("located",), pos=(38.70003, -9.42)))  # ~3 m
    assert s.rest_since == T0 and (s.lat, s.lng) == POS


def test_trip_start_resolves():
    s = fold(ev(0), ev(200, state="on_trip", types=("trip_start",)))
    assert evaluate(s, OUTSIDE, at(201), RULES).verdict == Verdict.gone


def test_provider_pickup_resolves():
    s = fold(ev(0), ev(200, state="removed", types=("maintenance_pick_up",)))
    assert evaluate(s, OUTSIDE, at(201), RULES).verdict == Verdict.gone


def test_location_error_overlapping_buffer_is_uncertain():
    rules = Rules(location_error_m=150)
    assert evaluate(fold(ev(0)), OUTSIDE, at(300), rules).verdict == Verdict.uncertain


def test_non_contactable_is_uncertain():
    s = fold(ev(0), ev(10, state="non_contactable", types=("comms_lost",)))
    assert evaluate(s, OUTSIDE, at(300), RULES).verdict == Verdict.uncertain
