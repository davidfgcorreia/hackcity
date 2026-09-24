"""October 2025 bundle (operators 41–44): a separate dated study, never joined to 2026.

APEX validations: every validation of cards that validated at a Cascais stop; the linkable
card number is replaced by a salted SHA-256. Rides: services whose trip is in a kept 2025 plan
trip. Vehicle events: positions inside the study-area box.
"""
from analytics.config import CARD_SALT, FINAL, bbox_sql
from analytics.db import file_info, logged, point_geom, replace_table, sql


def run(d) -> None:
    stops = FINAL / "stops.csv"
    src = FINAL / "apex-validations" / "apex-validations.csv"
    with logged("transit25", "transit25.apex_validations",
                "all validations of cards with >=1 validation at a Cascais stop; card number salted-hashed",
                file_info(src, stops)) as log:
        d.execute(f"CREATE OR REPLACE TEMP TABLE a AS SELECT * FROM read_csv('{src}', all_varchar=true, header=true)")
        log["rows_read"] = d.execute("SELECT count(*) FROM a").fetchone()[0]
        d.execute(f"""CREATE OR REPLACE TEMP TABLE cards25 AS SELECT DISTINCT card_serial_number c FROM a
            WHERE stop_id IN (SELECT stop_id FROM read_csv('{stops}', all_varchar=true) WHERE municipality_name='Cascais')""")
        log["rows_kept"] = replace_table(d, "transit25.apex_validations", f"""
            SELECT _id AS validation_id, agency_id, sha256('{CARD_SALT}' || card_serial_number) AS card_hash,
                   category, to_timestamp(CAST(created_at AS BIGINT)/1000.0) AS event_time,
                   CAST(event_type AS INTEGER) event_type, is_passenger, line_id, pattern_id, product_id,
                   stop_id, trip_id, units_qty, validation_status, vehicle_id
            FROM a WHERE card_serial_number IN (SELECT c FROM cards25)""")
        d.execute("DROP TABLE a")
        sql("CREATE INDEX ON transit25.apex_validations (card_hash, event_time)")

    src = FINAL / "rides" / "rides.csv"
    with logged("transit25", "transit25.rides", "rides whose trip is in a 2025 plan trip touching the study area", file_info(src)) as log:
        d.execute(f"CREATE OR REPLACE TEMP TABLE r AS SELECT * FROM read_csv('{src}', all_varchar=true, header=true)")
        log["rows_read"] = d.execute("SELECT count(*) FROM r").fetchone()[0]
        log["rows_kept"] = replace_table(d, "transit25.rides", """
            SELECT * FROM r WHERE trip_id IN (SELECT trip_id FROM pg.gtfs.trips WHERE plan_year = 2025)""")
        d.execute("DROP TABLE r")

    src = FINAL / "vehicle-events-001.csv"
    with logged("transit25", "transit25.vehicle_events", "inside study-area box; driver_id dropped", file_info(src)) as log:
        log["rows_kept"] = replace_table(d, "transit25.vehicle_events", f"""
            SELECT _id AS event_id, agency_id, to_timestamp(CAST(created_at AS BIGINT)/1000.0) AS event_time,
                   CAST(latitude AS DOUBLE) lat, CAST(longitude AS DOUBLE) lon, CAST(odometer AS BIGINT) odometer,
                   pattern_id, stop_id, trigger_door, trip_id, vehicle_id
            FROM read_csv('{src}', all_varchar=true, header=true)
            WHERE {bbox_sql('TRY_CAST(latitude AS DOUBLE)', 'TRY_CAST(longitude AS DOUBLE)')}""")
        log["rows_read"] = None  # streamed; not counted to avoid a second 4 GB pass
        point_geom("transit25.vehicle_events")
