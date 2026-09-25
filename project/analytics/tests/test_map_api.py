"""Map API guards that run without a database: parameter validation and CSV export framing."""
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from analytics.api import app, area_indices, centre_of, csv_response, filter_lines, map_filters

client = TestClient(app)


@pytest.mark.parametrize("size", [0, 25, 75, 1050])
def test_square_size_outside_50_to_1000_in_50_m_steps_is_rejected(size):
    with pytest.raises(HTTPException) as err:
        map_filters(size, None, None)
    assert err.value.status_code == 400


def test_hour_outside_day_is_rejected_before_querying():
    response = client.get("/analytics/map/analysis-cells", params={"size": 250, "hour": 24})
    assert response.status_code == 400


def test_area_id_parses_grid_indices_and_rejects_malformed_ids():
    assert area_indices("-437_-427") == (-437, -427)
    for bad in ["", "12", "a_b", "1_2_3"]:
        with pytest.raises(HTTPException):
            area_indices(bad)


def test_cell_profile_rejects_malformed_area_before_querying():
    response = client.get("/analytics/map/cell-profile", params={"size": 250, "area_id": "x"})
    assert response.status_code == 400


def test_csv_export_carries_filters_and_definitions_as_comment_lines():
    lines = filter_lines(map_filters(500, date(2026, 9, 2), 8))
    body = csv_response("x.csv", lines, [{"cell_id": "1_2", "trip_ends": 7}]).body.decode()
    comments = [line for line in body.splitlines() if line.startswith("# ")]
    assert any("square 500 m" in line and "2026-09-02" in line and "08:00 Europe/Lisbon" in line for line in comments)
    assert any("station polygon + 30 m" in line for line in comments)
    assert body.splitlines()[len(comments)] == "cell_id,trip_ends"


def test_csv_export_without_rows_still_states_filters():
    body = csv_response("x.csv", filter_lines(map_filters(250, None, None)), []).body.decode()
    assert "hour all" in body and "cell_id" not in body


def test_square_centre_is_mean_of_ring_without_closing_point():
    ring = [[-9.0, 38.0], [-9.0, 38.2], [-8.8, 38.2], [-8.8, 38.0], [-9.0, 38.0]]
    assert centre_of({"type": "Polygon", "coordinates": [ring]}) == (38.1, -8.9)


def test_bird_response_bands_put_each_pickup_in_exactly_one_band_with_inclusive_upper_limits():
    from analytics.api import response_bands
    bands = response_bands([0, 120, 121, 360, 361, 720, 1440, 1441, 5000])
    assert [b["bikes"] for b in bands] == [2, 2, 2, 1, 2]
    assert sum(b["bikes"] for b in bands) == 9
    assert [b["band_index"] for b in bands] == [0, 1, 2, 3, 4]


def test_bird_response_bands_report_every_band_even_when_empty():
    from analytics.api import response_bands
    assert [b["bikes"] for b in response_bands([])] == [0, 0, 0, 0, 0]
