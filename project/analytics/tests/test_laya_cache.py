"""Laya's ranking is cached per input build: recomputed only when analytics.derive recreates an input table."""
import pytest

from analytics import api


@pytest.fixture
def fake_build(monkeypatch):
    """Stub the database: `state["version"]` stands for the input tables' OIDs, `calls` counts full recomputes."""
    state = {"version": (1, 2, 3), "calls": 0}

    def compute(top_n, size=250):
        state["calls"] += 1
        return [{"cell_id": "a", "top_n": top_n, "size": size, "build": state["version"], "verdict": "monitor",
                 "screening_rank": 1, "trip_endpoints": 10, "supported_120": 5}]

    monkeypatch.setattr(api, "laya_inputs_version", lambda: state["version"])
    monkeypatch.setattr(api, "_laya_compute", compute)
    monkeypatch.setattr(api, "_laya_cache", {})
    return state


def test_repeated_requests_reuse_the_ranking(fake_build):
    first = api.laya_ranked(10)
    assert api.laya_ranked(10) is first
    assert fake_build["calls"] == 1


def test_each_top_n_is_cached_separately_because_robustness_depends_on_it(fake_build):
    assert api.laya_ranked(10)[0]["top_n"] == 10
    assert api.laya_ranked(5)[0]["top_n"] == 5
    assert fake_build["calls"] == 2


def test_rebuilt_inputs_are_recomputed_and_old_builds_dropped(fake_build):
    api.laya_ranked(10)
    fake_build["version"] = (1, 2, 4)  # derive recreated a table: new OID
    assert api.laya_ranked(10)[0]["build"] == (1, 2, 4)
    assert fake_build["calls"] == 2
    assert all(key[0] == (1, 2, 4) for key in api._laya_cache)


def test_whole_response_is_cached_with_its_labels(fake_build, monkeypatch):
    labels = {"calls": 0}

    def clock_text():
        labels["calls"] += 1
        return "only 08:00–20:00"

    monkeypatch.setattr(api, "clock_text", clock_text)
    monkeypatch.setattr(api, "enforcement", lambda: {"enabled": True})
    first = api.laya_recommendations(10, pool=True)
    assert api.laya_recommendations(10, pool=True) is first
    assert labels["calls"] == 2 and fake_build["calls"] == 1  # one build: clock_text() directly and via laya_meta()


def test_each_square_size_is_ranked_and_cached_separately(fake_build):
    assert api.laya_ranked(10, size=500)[0]["size"] == 500
    assert api.laya_ranked(10, size=500) is api.laya_ranked(10, size=500)
    assert api.laya_ranked(10)[0]["size"] == 250
    assert fake_build["calls"] == 2


def test_size_outside_the_map_grid_is_rejected(fake_build):
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        api.laya_recommendations(10, pool=True, size=75)
