"""Single-van collection route: current position -> up to `capacity` stops -> depot.

Greedy nearest neighbour + 2-opt on haversine x detour factor. Tens of stops solve in ms.
Upgrade path: OR-Tools CVRP and OSRM road distances (see docs/operations_architecture.md).
"""
from dataclasses import dataclass

from app.core.geo import haversine_m


@dataclass(frozen=True)
class Node:
    id: int | None  # case id; None for start/depot
    lat: float
    lng: float
    priority: float = 0.0  # higher = collect first when capacity is short (e.g. age in minutes)


@dataclass(frozen=True)
class Plan:
    order: list[int]    # case ids in visiting order
    queued: list[int]   # eligible but over capacity -> next mission
    total_km: float


def plan_mission(start: Node, stops: list[Node], depot: Node, capacity: int, detour: float = 1.3) -> Plan:
    chosen = sorted(stops, key=lambda n: -n.priority)[:capacity]
    queued = [n.id for n in stops if n not in chosen]

    def dist(a: Node, b: Node) -> float:
        return haversine_m(a.lat, a.lng, b.lat, b.lng) * detour

    route, left = [], list(chosen)
    here = start
    while left:
        here = min(left, key=lambda n: dist(here, n))
        route.append(here)
        left.remove(here)

    path = [start, *route, depot]  # endpoints fixed
    improved = True
    while improved:
        improved = False
        for i in range(1, len(path) - 2):
            for j in range(i + 1, len(path) - 1):
                a, b, c, d = path[i - 1], path[i], path[j], path[j + 1]
                if dist(a, c) + dist(b, d) < dist(a, b) + dist(c, d) - 1e-6:
                    path[i : j + 1] = reversed(path[i : j + 1])
                    improved = True

    total = sum(dist(path[k], path[k + 1]) for k in range(len(path) - 1)) / 1000
    return Plan([n.id for n in path[1:-1]], queued, round(total, 2))
