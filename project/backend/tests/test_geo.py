from shapely.geometry import Point

from app.core.geo import ZoneIndex

# ~15 m circle around a Cascais point, like the supplied station areas
CENTER = (38.6979, -9.4215)


def _zone(buffer_m=30.0):
    from pyproj import Transformer
    to_m = Transformer.from_crs("EPSG:4326", "EPSG:3763", always_xy=True)
    x, y = to_m.transform(CENTER[1], CENTER[0])
    circle = Point(x, y).buffer(15)
    back = Transformer.from_crs("EPSG:3763", "EPSG:4326", always_xy=True)
    ring = [list(back.transform(px, py)) for px, py in circle.exterior.coords]
    return ZoneIndex([{"coordinates": [[ring]]}], buffer_m), (x, y)


def test_inside_buffer_is_not_outside():
    z, (x, y) = _zone()
    assert z.distance_outside_metric(x + 40, y) == 0  # 15 m area + 30 m buffer = 45 m


def test_beyond_buffer_is_outside():
    z, (x, y) = _zone()
    assert 4 < z.distance_outside_metric(x + 50, y) < 6


def test_exact_boundary_counts_as_inside():
    z, _ = _zone()
    bx, by = z.permitted.exterior.coords[0]
    assert z.distance_outside_metric(bx, by) == 0


def test_latlng_entry_point_uses_metres():
    z, _ = _zone()
    assert z.distance_outside_m(*CENTER) == 0
    assert z.distance_outside_m(CENTER[0] + 0.001, CENTER[1]) > 50  # ~111 m north
