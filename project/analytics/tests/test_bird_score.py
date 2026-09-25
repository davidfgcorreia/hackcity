"""The Bird station score: missing parts are excluded (never zero), bands, and the small-sample rule."""
from analytics.bird_score import band, parts, station_score


def test_missing_parts_are_excluded_not_counted_as_zero():
    p = parts(service_hours=210, empty_hours=21, refilled_by_bird=0, refilled_by_rider=0, abandonments_near=0, bird_collected_near=0)
    assert p["refill"] is None and p["collection"] is None
    assert station_score(p) == (90.0, 1, "good")  # availability alone, not (0.9 + 0 + 0) / 3


def test_all_three_parts_average():
    p = parts(service_hours=200, empty_hours=100, refilled_by_bird=1, refilled_by_rider=3, abandonments_near=4, bird_collected_near=1)
    assert station_score(p) == (round(100 * (0.5 + 0.25 + 0.25) / 3, 1), 3, "poor")


def test_fewer_than_three_nearby_abandonments_give_no_collection_ratio():
    assert parts(100, 0, 0, 0, abandonments_near=2, bird_collected_near=2)["collection"] is None
    assert parts(100, 0, 0, 0, abandonments_near=3, bird_collected_near=3)["collection"] == 1.0


def test_band_edges():
    assert band(70) == "good" and band(69.9) == "fair" and band(40) == "fair" and band(39.9) == "poor" and band(None) is None


def test_no_data_at_all_has_no_score():
    assert station_score(parts(0, 0, 0, 0, 0, 0)) == (None, 0, None)
