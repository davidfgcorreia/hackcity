import pytest

from analytics import laya


def cell(cell_id, trips=10, parked=3, days=5, dist=300, boardings=0, deps=0.0, outside=8, **extra):
    return {"cell_id": cell_id, "trip_endpoints": trips, "supported_120": parked, "active_days": days,
            "nearest_station_m": dist, "weekly_boardings_333m": boardings, "departures_per_hour_333m": deps,
            "outside_intervals": outside, **extra}


def test_weights_sum_to_one():
    assert sum(laya.WEIGHTS.values()) == pytest.approx(1.0)


def test_percentile_ranks_share_ties_and_span_zero_to_one():
    assert laya.percentile_ranks([1, 2, 2, 5]) == [0.0, 0.5, 0.5, 1.0]
    assert laya.percentile_ranks([7]) == [0.5]


def test_stronger_evidence_on_every_component_ranks_first():
    weak = cell("weak", trips=5, parked=1, days=2, dist=160, boardings=0, deps=12)
    strong = cell("strong", trips=80, parked=9, days=20, dist=900, boardings=500, deps=0)
    ranked = laya.rank([weak, strong], top_n=1)
    assert [r["cell_id"] for r in ranked] == ["strong", "weak"]
    assert ranked[0]["laya_rank"] == 1 and ranked[0]["laya_score"] > ranked[1]["laya_score"]


def test_score_equals_sum_of_contributions():
    ranked = laya.rank([cell("a"), cell("b", trips=30), cell("c", dist=1200)], top_n=2)
    for r in ranked:
        assert r["laya_score"] == pytest.approx(sum(r["contributions"].values()), abs=0.2)
        assert 0 <= r["laya_score"] <= 100


def test_absolute_components_are_clamped():
    [c] = laya.components([cell("x", days=40, dist=50, deps=30)])
    assert c["consistency"] == 1.0 and c["coverage_gain"] == 0.0 and c["transit_gap"] == 0.0


def test_missing_values_count_as_zero_not_errors():
    [r] = laya.rank([cell("x", boardings=None, days=None)], top_n=1)
    assert r["components"]["consistency"] == 0.0


def test_confidence_grows_with_evidence():
    assert laya.confidence(cell("a", trips=3, outside=5, days=2)) < laya.confidence(cell("b", trips=60, outside=20, days=10)) == 1.0


def test_robustness_is_deterministic_and_bounded():
    pool = [cell(str(i), trips=i * 3, parked=i % 4, days=1 + i % 9, dist=150 + 40 * i) for i in range(15)]
    a, b = laya.rank(pool, top_n=5), laya.rank(pool, top_n=5)
    assert [r["robustness"] for r in a] == [r["robustness"] for r in b]
    assert all(0 <= r["robustness"] <= 1 for r in a)


def test_caveats_flag_weekend_and_short_parking():
    [r] = laya.rank([cell("x", weekend_share=0.8, median_hours_parked=0.4, days=3)], top_n=1)
    assert any("weekend" in c for c in r["caveats"]) and any("short" in c for c in r["caveats"])
    assert any("few days" in c for c in r["caveats"])


def test_empty_pool_returns_nothing():
    assert laya.rank([], top_n=10) == []
