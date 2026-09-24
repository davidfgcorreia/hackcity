"""Collect every analysis input into the analytics PostGIS database, filtered to Cascais.

    docker compose exec analytics python -m analytics.ingest            # all steps
    docker compose exec analytics python -m analytics.ingest bike gtfs  # selected steps
Steps are idempotent (drop + recreate) and logged in meta.ingest_log.
"""
import sys
import time

from analytics.db import duck, init, logged
from analytics.ingest import bike, bus26, gtfs, reference, transit25, transit26, weather

STEPS = {"reference": reference, "bike": bike, "gtfs": gtfs, "bus26": bus26,
         "transit26": transit26, "transit25": transit25, "weather": weather}


def main(names: list[str]) -> None:
    init()
    d = duck()
    for name in names or list(STEPS):
        t = time.time()
        print(f"[{name}]")
        STEPS[name].run(d)
        print(f"  done in {time.time() - t:.0f}s")
    if not names:
        with logged("excluded", "waze", "EXCLUDED: all 16,752 rows are Lisbon (zona/cidade LISBOA); no Cascais road data"):
            pass


if __name__ == "__main__":
    main(sys.argv[1:])
