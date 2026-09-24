"""Reference tables: metropolitan stops, calendar, day periods, products, operators."""
import httpx
import pandas as pd

from analytics.config import DATA, FINAL, TML_PLANS_URL
from analytics.db import file_info, logged, point_geom, replace_table


def run(d) -> None:
    src = FINAL / "stops.csv"
    with logged("reference", "ref.cm_stops", "all metropolitan stops (Carris Metropolitana ids)", file_info(src)) as log:
        log["rows_kept"] = log["rows_read"] = replace_table(d, "ref.cm_stops", f"""
            SELECT stop_id, stop_name, CAST(stop_lat AS DOUBLE) lat, CAST(stop_lon AS DOUBLE) lon,
                   municipality_name, parish_name, locality, areas, operational_status
            FROM read_csv('{src}', all_varchar=true)""")
        point_geom("ref.cm_stops")

    src = DATA / "calendario.xlsx"
    with logged("reference", "ref.calendar", "all", file_info(src)) as log:
        cal = pd.read_excel(src, sheet_name="calendário")
        per = pd.read_excel(src, sheet_name="periodos_dia")
        per.columns = ["hours", "code", "name"]
        d.register("cal_df", cal)
        d.register("per_df", per)
        log["rows_kept"] = log["rows_read"] = replace_table(
            d, "ref.calendar", "SELECT CAST(date AS INTEGER) date, day_type, dia_tipo FROM cal_df")
        replace_table(d, "ref.day_periods", "SELECT * FROM per_df")

    src = FINAL / "Products" / "products_classification.csv"
    with logged("reference", "ref.products", "all", file_info(src)) as log:
        log["rows_kept"] = log["rows_read"] = replace_table(d, "ref.products", f"""
            SELECT trim(Product_id) product_id, trim("Name") AS product_name, is_person_transport_title, is_junior, is_senior
            FROM read_csv('{src}', delim=';', all_varchar=true)""")

    with logged("reference", "ref.agencies", "TML plan index", [{"url": TML_PLANS_URL}]) as log:
        plans = httpx.get(TML_PLANS_URL, timeout=60).json()["data"]
        ag = pd.DataFrame({(p["agency_id"], p["agency_code"], p["agency_name"]) for p in plans},
                          columns=["agency_id", "agency_code", "agency_name"])
        d.register("ag_df", ag)
        log["rows_kept"] = log["rows_read"] = replace_table(d, "ref.agencies", "SELECT * FROM ag_df")
