"""Permitted parking area = union(station areas) buffered by BUFFER_M, computed in a metric CRS.

Stored coordinates are WGS84; GeoJSON is [lon, lat]. Degrees are never used as metres.
"""
import math

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform, unary_union
from shapely.prepared import prep

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


class ZoneIndex:
    def __init__(self, station_areas: list[dict], buffer_m: float, metric_crs: str = "EPSG:3763"):
        self._to_metric = Transformer.from_crs("EPSG:4326", metric_crs, always_xy=True).transform
        polygons = [transform(self._to_metric, shape({"type": "MultiPolygon", **a})) for a in station_areas]
        self.permitted = unary_union(polygons).buffer(buffer_m)
        self._covers = prep(self.permitted).covers

    def to_metric(self, lat: float, lng: float) -> tuple[float, float]:
        return self._to_metric(lng, lat)

    def distance_outside_metric(self, x: float, y: float) -> float:
        """0 when inside or exactly on the boundary (boundary counts as inside)."""
        p = Point(x, y)
        return 0.0 if self._covers(p) else self.permitted.distance(p)

    def distance_outside_m(self, lat: float, lng: float) -> float:
        return self.distance_outside_metric(*self.to_metric(lat, lng))
