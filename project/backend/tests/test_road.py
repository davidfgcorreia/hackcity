import httpx
import pytest

from app.core.routing import Node, plan_mission
from app.services import road

OSRM_ROUTE = {
    "code": "Ok",
    "routes": [{"distance": 1500.0, "duration": 240.0,
                "geometry": {"type": "LineString", "coordinates": [[-9.42, 38.70], [-9.41, 38.705], [-9.40, 38.71]]},
                "legs": [{"distance": 900.0, "duration": 150.0, "steps": [
                    {"maneuver": {"type": "depart", "location": [-9.42, 38.70], "bearing_after": 90},
                     "name": "Avenida Marginal", "mode": "driving", "distance": 600.0, "duration": 100.0,
                     "geometry": "ignored", "intersections": []},
                    {"maneuver": {"type": "turn", "modifier": "left", "location": [-9.41, 38.705]},
                     "name": "Rua X", "mode": "driving", "distance": 300.0, "duration": 50.0}]},
                         {"distance": 600.0, "duration": 90.0, "steps": []}]}],
}
OSRM_TABLE = {"code": "Ok", "durations": [[0, 100, 900], [100, 0, 50], [900, 50, 0]]}


@pytest.fixture
def osrm(monkeypatch):
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.url.path)
        return httpx.Response(200, json=OSRM_TABLE if "/table/" in request.url.path else OSRM_ROUTE)

    monkeypatch.setattr(road.settings, "routing_engine", "osrm")
    monkeypatch.setattr(road, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    return calls


def test_route_keeps_steps_without_heavy_fields(osrm):
    r = road.route([(38.70, -9.42), (38.705, -9.41), (38.71, -9.40)])
    assert r["engine"] == "osrm" and r["duration_s"] == 240
    step = r["legs"][0]["steps"][1]
    assert step["maneuver"] == {"type": "turn", "modifier": "left", "location": [-9.41, 38.705]}
    assert "geometry" not in r["legs"][0]["steps"][0] and "intersections" not in r["legs"][0]["steps"][0]
    assert osrm[0].startswith("/route/v1/driving/-9.420000,38.700000;")  # lng,lat order


def test_matrix_returns_driving_seconds(osrm):
    assert road.matrix([(38.70, -9.42), (38.71, -9.40), (38.72, -9.39)])[0][2] == 900


def test_unreachable_osrm_falls_back_to_straight_line(monkeypatch):
    def down(request):
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(road.settings, "routing_engine", "osrm")
    monkeypatch.setattr(road, "_client", httpx.Client(transport=httpx.MockTransport(down)))
    assert road.matrix([(38.7, -9.42), (38.71, -9.4)]) is None
    r = road.route([(38.70, -9.42), (38.71, -9.40)])
    assert r["engine"] == "straight-line" and len(r["legs"]) == 1 and r["legs"][0]["steps"] == []


def test_plan_uses_driving_time_not_distance():
    start, depot = Node(None, 38.700, -9.42), Node(None, 38.720, -9.42)
    near, far = Node(1, 38.701, -9.42), Node(2, 38.710, -9.42)
    # the geographically near stop is 20 min away by road (one-way street), the far one 2 min
    secs = {(start, near): 1200, (start, far): 120, (far, near): 120, (near, far): 1200,
            (near, depot): 300, (far, depot): 300}
    plan = plan_mission(start, [near, far], depot, capacity=5, cost=lambda a, b: secs.get((a, b), secs.get((b, a), 0)))
    assert plan.order == [2, 1]
