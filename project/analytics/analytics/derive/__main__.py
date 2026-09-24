"""Build the analysis tables (schema `derived`) from the ingested inputs, in order.

    docker compose exec analytics python -m analytics.derive
"""
import time
from pathlib import Path

from analytics.db import duck, logged, pg
from analytics.derive import parking

SQL = Path(__file__).parent / "sql"
STEPS = [("01_base.sql", None), ("parking", parking.run), ("03_recovery.sql", None), ("04_transit.sql", None),
         ("05_journeys.sql", None), ("06_candidates.sql", None), ("07_weather.sql", None)]


def main() -> None:
    d = duck()
    for name, fn in STEPS:
        t = time.time()
        with logged("derive", name) as log:
            if fn:
                fn(d)
            else:
                with pg() as c:
                    c.execute((SQL / name).read_text())
        print(f"[{name}] {time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
