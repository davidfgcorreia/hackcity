#!/bin/sh
# Restore the shared analytics DB from the GitHub Release (no finalset needed).
#   sh tools/analytics-restore.sh [release_tag]   (run from project/ with analytics-db running)
set -eu
TAG=${1:-data-2026-09-24}
mkdir -p .data
gh release download "$TAG" --repo davidfgcorreia/hackcity --pattern 'analytics-cascais-*.dump' --dir .data --clobber
FILE=$(ls -t .data/analytics-cascais-*.dump | head -1)
docker compose cp "$FILE" analytics-db:/tmp/restore.dump
trap 'docker compose exec -T analytics-db rm -f /tmp/restore.dump' EXIT
docker compose exec -T analytics-db pg_restore -U analytics -d analytics --clean --if-exists --no-owner --exit-on-error /tmp/restore.dump
docker compose exec -T analytics-db rm -f /tmp/restore.dump
trap - EXIT
docker compose exec -T analytics-db psql -U analytics -d analytics -Atc \
  "select 'restored: ' || count(*) || ' derived tables' from information_schema.tables where table_schema = 'derived'"
make analytics-map-prep
