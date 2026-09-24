"""2026 sample week (31 Aug–6 Sep): card validations and vehicle positions.

Validations: keep **every** validation of each card that validated at least once in Cascais
(MobiCascais, or a Carris Metropolitana stop whose municipality is Cascais). That keeps the whole
week of journeys into, out of and across Cascais for aggregate path analysis. The card hash stays
in this restricted database; published outputs are aggregated with small groups suppressed.
Vehicles: positions inside the study-area box; the finalset copy supersedes datasets/vehicles.
"""
from analytics.config import FINAL, bbox_sql
from analytics.db import file_info, logged, point_geom, replace_table, sql

CM_AGENCY_CODES = "('41','42','43','44')"


def run(d) -> None:
    files = sorted((FINAL / "validations" / "validations").glob("validations_part_*.csv"))
    glob = str(FINAL / "validations" / "validations" / "validations_part_*.csv")
    stops = FINAL / "stops.csv"
    with logged("transit26", "transit26.validations",
                "all validations of cards with >=1 validation in Cascais (HF16N or CM stop in municipality Cascais)",
                file_info(*files, stops)) as log:
        d.execute(f"""CREATE OR REPLACE TEMP TABLE v AS
            SELECT * FROM read_csv('{glob}', all_varchar=true, header=true)""")
        log["rows_read"] = d.execute("SELECT count(*) FROM v").fetchone()[0]
        d.execute(f"""CREATE OR REPLACE TEMP TABLE cascais_cm_stops AS
            SELECT stop_id FROM read_csv('{stops}', all_varchar=true) WHERE municipality_name = 'Cascais'""")
        d.execute(f"""CREATE OR REPLACE TEMP TABLE cascais_cards AS
            SELECT DISTINCT card_serial_number_hash h FROM v
            WHERE agency_id = 'HF16N'
               OR (agency_code IN {CM_AGENCY_CODES} AND stop_id IN (SELECT stop_id FROM cascais_cm_stops))""")
        log["rows_kept"] = replace_table(d, "transit26.validations", f"""
            SELECT _id AS validation_id,
                   to_timestamp(CAST(created_at AS BIGINT) / 1000.0) AS event_time,
                   to_timestamp(CAST(received_at AS BIGINT) / 1000.0) AS received_at,
                   CAST(operational_date AS INTEGER) operational_date, agency_id, agency_code,
                   card_serial_number_hash AS card_hash, category, CAST(event_type AS INTEGER) event_type,
                   line_id, pattern_id, product_id, stop_id, trip_id, vehicle_id,
                   (agency_id = 'HF16N' OR (agency_code IN {CM_AGENCY_CODES}
                        AND stop_id IN (SELECT stop_id FROM cascais_cm_stops))) AS in_cascais
            FROM v WHERE card_serial_number_hash IN (SELECT h FROM cascais_cards)""")
        d.execute("DROP TABLE v")
        sql("""CREATE INDEX ON transit26.validations (card_hash, event_time);
               CREATE INDEX ON transit26.validations (agency_id, stop_id)""")

    vfiles = sorted((FINAL / "vehicles").rglob("*.csv"))
    vglob = [str(p) for p in vfiles]
    with logged("transit26", "transit26.vehicle_positions", "positions inside study-area box; dedup by _id",
                [{"files": len(vfiles), "bytes": sum(p.stat().st_size for p in vfiles), "dir": str(FINAL / "vehicles")}]) as log:
        d.execute(f"""CREATE OR REPLACE TEMP TABLE vp AS
            SELECT * FROM read_csv({vglob}, all_varchar=true, header=true, union_by_name=true)""")
        log["rows_read"] = d.execute("SELECT count(*) FROM vp").fetchone()[0]
        log["rows_kept"] = replace_table(d, "transit26.vehicle_positions", f"""
            SELECT DISTINCT ON (_id) _id AS position_id, agency_id,
                   to_timestamp(CAST(created_at AS BIGINT) / 1000.0) AS event_time,
                   CAST(latitude AS DOUBLE) lat, CAST(longitude AS DOUBLE) lon,
                   CAST(operational_date AS INTEGER) operational_date, stop_id, trip_id, vehicle_id
            FROM vp
            WHERE {bbox_sql('CAST(latitude AS DOUBLE)', 'CAST(longitude AS DOUBLE)')}""")
        d.execute("DROP TABLE vp")
        point_geom("transit26.vehicle_positions")
        sql("CREATE INDEX ON transit26.vehicle_positions (agency_id, trip_id, event_time)")
