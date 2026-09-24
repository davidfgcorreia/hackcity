from app.core.routing import Node, plan_mission

START = Node(None, 38.700, -9.420)
DEPOT = Node(None, 38.720, -9.420)


def test_route_visits_nearest_first_and_counts_depot_leg():
    stops = [Node(1, 38.715, -9.420), Node(2, 38.705, -9.420)]
    plan = plan_mission(START, stops, DEPOT, capacity=5)
    assert plan.order == [2, 1]
    assert 2.5 < plan.total_km < 3.0  # 2.2 km straight line x 1.3


def test_capacity_leaves_lowest_priority_queued():
    stops = [Node(i, 38.70 + i / 1000, -9.42, priority=i) for i in range(1, 6)]
    plan = plan_mission(START, stops, DEPOT, capacity=3)
    assert sorted(plan.order) == [3, 4, 5]
    assert sorted(plan.queued) == [1, 2]


def test_empty_pool_goes_straight_to_depot():
    plan = plan_mission(START, [], DEPOT, capacity=3)
    assert plan.order == [] and plan.total_km > 0
