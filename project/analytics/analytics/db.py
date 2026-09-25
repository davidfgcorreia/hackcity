"""Connections: DuckDB streams/filters the large files and writes straight into PostGIS."""
import json
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import psycopg

from analytics.config import PG_URL

SCHEMAS = ["meta", "ref", "bike", "gtfs", "transit26", "bus26", "transit25", "weather", "derived"]


def pg(interactive: bool = False) -> psycopg.Connection:
    """`interactive` disables JIT: map queries have large cost estimates but finish in well under a
    second, so JIT compilation (~0.5 s) would dominate their latency."""
    return psycopg.connect(PG_URL, autocommit=True, **({"options": "-c jit=off"} if interactive else {}))


def duck() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect()
    c.execute("SET threads=8; SET preserve_insertion_order=false; SET memory_limit='6GB'")
    c.execute("LOAD postgres; LOAD spatial")
    c.execute(f"ATTACH '{PG_URL}' AS pg (TYPE postgres)")
    return c


def release(d: duckdb.DuckDBPyConnection) -> None:
    """DuckDB keeps a Postgres transaction open after reading; re-attach so DDL is never blocked."""
    d.execute("DETACH pg")
    d.execute(f"ATTACH '{PG_URL}' AS pg (TYPE postgres)")


def init() -> None:
    with pg() as c:
        c.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        for s in SCHEMAS:
            c.execute(f"CREATE SCHEMA IF NOT EXISTS {s}")
        c.execute("""CREATE TABLE IF NOT EXISTS meta.ingest_log (
            id serial PRIMARY KEY, step text, target text, rows_kept bigint, rows_read bigint,
            filter text, sources jsonb, started_at timestamptz, finished_at timestamptz)""")


def replace_table(d: duckdb.DuckDBPyConnection, target: str, select_sql: str) -> int:
    """Drop and recreate a Postgres table from a DuckDB SELECT; returns its row count."""
    with pg() as c:
        c.execute(f"DROP TABLE IF EXISTS {target} CASCADE")
    release(d)
    d.execute(f"CREATE TABLE pg.{target} AS {select_sql}")
    release(d)
    with pg() as c:
        return c.execute(f"SELECT count(*) FROM {target}").fetchone()[0]


def sql(statements: str) -> None:
    with pg() as c:
        c.execute(statements)


def point_geom(table: str, lat: str = "lat", lon: str = "lon") -> None:
    """Add an indexed WGS84 point column (compute metres in EPSG:3763 downstream)."""
    sql(f"""ALTER TABLE {table} ADD COLUMN geom geometry(Point, 4326)
              GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326)) STORED;
            CREATE INDEX ON {table} USING gist (geom)""")


def file_info(*paths: Path) -> list[dict]:
    out = []
    for p in paths:
        st = p.stat()
        out.append({"path": str(p), "bytes": st.st_size,
                    "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()})
    return out


@contextmanager
def logged(step: str, target: str, filter: str = "", sources: list | None = None):
    """Record every ingest step: what was read, how it was filtered and what was kept."""
    info = {"rows_kept": None, "rows_read": None, "sources": sources or []}
    started = datetime.now(timezone.utc)
    t = time.time()
    yield info
    with pg() as c:
        c.execute("INSERT INTO meta.ingest_log (step, target, rows_kept, rows_read, filter, sources, started_at, finished_at)"
                  " VALUES (%s,%s,%s,%s,%s,%s,%s,now())",
                  (step, target, info["rows_kept"], info["rows_read"], filter, json.dumps(info["sources"]), started))
    print(f"  {target:<32} kept {info['rows_kept']!s:>10}  read {info['rows_read']!s:>10}  {time.time() - t:6.1f}s")
