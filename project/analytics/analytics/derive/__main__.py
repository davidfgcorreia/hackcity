"""Build the analysis tables (schema `derived`) from the ingested inputs, in order.

    docker compose exec analytics python -m analytics.derive
    docker compose exec analytics python -m analytics.derive enforcement   # only the steps using the 120-min clock
"""
import sys
import time
from pathlib import Path

from analytics.db import duck, logged, pg
from analytics.derive import parking

SQL = Path(__file__).parent / "sql"
STEPS = [("01_base.sql", None), ("parking", parking.run), ("03_recovery.sql", None), ("04_transit.sql", None),
         ("05_journeys.sql", None), ("06_candidates.sql", None), ("07_weather.sql", None), ("08_transfer_proxy.sql", None),
         ("09_schedule.sql", None), ("10_bird.sql", None)]


# Steps that depend on the abandonment clock (ENFORCE_WINDOW and its hours), in dependency order.
ENFORCEMENT_STEPS = {"parking", "03_recovery.sql", "06_candidates.sql", "10_bird.sql"}


def main(only: set[str] | None = None) -> None:
    d = duck()
    for name, fn in STEPS:
        if only is not None and name not in only:
            continue
        t = time.time()
        with logged("derive", name) as log:
            if fn:
                fn(d)
            else:
                with pg() as c:
                    c.execute((SQL / name).read_text())
        print(f"[{name}] {time.time() - t:.1f}s")


if __name__ == "__main__":
    main(ENFORCEMENT_STEPS if sys.argv[1:] == ["enforcement"] else None)
