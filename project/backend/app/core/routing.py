"""Single-van collection route: current position -> up to `capacity` stops -> depot.

Greedy nearest neighbour + 2-opt. The cost between two nodes is a callable: real driving
seconds from the OSRM table in production (services/road.py), haversine x detour factor by
default. Tens of stops solve in ms. Upgrade path for several vans: VROOM on the same OSRM.
"""
from collections.abc import Callable
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
    total_km: float     # straight-line estimate x detour; the road route replaces it when available
    total_cost: float = 0.0  # in the units of `cost` (seconds with OSRM, metres by default)


def plan_mission(start: Node, stops: list[Node], depot: Node, capacity: int, detour: float = 1.3,
                 cost: Callable[[Node, Node], float] | None = None) -> Plan:
    chosen = sorted(stops, key=lambda n: -n.priority)[:capacity]
    queued = [n.id for n in stops if n not in chosen]

    def crow(a: Node, b: Node) -> float:
        return haversine_m(a.lat, a.lng, b.lat, b.lng) * detour

    dist = cost or crow

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

    km = sum(crow(path[k], path[k + 1]) for k in range(len(path) - 1)) / 1000
    total = sum(dist(path[k], path[k + 1]) for k in range(len(path) - 1))
    return Plan([n.id for n in path[1:-1]], queued, round(km, 2), round(total, 1))
