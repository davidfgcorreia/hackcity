#!/bin/sh
# Dump the Cascais-filtered analytics DB for teammates who don't have datasets/finalset.
# Raw vehicle positions (unused by any analysis, rebuildable from finalset) keep their schema
# but no rows. RESTRICTED: contains transit card hashes — team only, never public.
#   sh tools/analytics-dump.sh [out_dir]      (run from project/)
set -eu
OUT_DIR=${1:-.}
NAME="analytics-cascais-$(date +%Y%m%d).dump"
mkdir -p "$OUT_DIR"
docker compose exec -T analytics-db pg_dump -U analytics -d analytics -Fc -Z9 \
  --exclude-table-data=transit26.vehicle_positions \
  --exclude-table-data=transit25.vehicle_events \
  -f "/tmp/$NAME"
docker compose cp "analytics-db:/tmp/$NAME" "$OUT_DIR/$NAME"
docker compose exec -T analytics-db rm -f "/tmp/$NAME"
ls -lh "$OUT_DIR/$NAME"
sha256sum "$OUT_DIR/$NAME"
