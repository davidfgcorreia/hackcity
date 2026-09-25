#!/bin/sh
# Switch the 08:00–20:00 enforcement window of the abandonment clock on or off.
#   sh tools/set-enforcement.sh true|false      (run from project/; `make enforce-window-on|off`)
# Updates ENFORCE_WINDOW in .env, restarts the API and analytics containers so they read it, and
# rebuilds the analysis tables that depend on the clock (parking intervals, recovery, candidates, Bird).
set -eu
case "${1:-}" in true|false) ;; *) echo "usage: $0 true|false" >&2; exit 2 ;; esac
[ -f .env ] || cp .env.example .env
if grep -q '^ENFORCE_WINDOW=' .env; then
  sed -i "s/^ENFORCE_WINDOW=.*/ENFORCE_WINDOW=$1/" .env
else
  printf '\nENFORCE_WINDOW=%s\n' "$1" >> .env
fi
docker compose up -d api analytics
until docker compose exec -T analytics python -c 'from analytics.config import ENFORCE_WINDOW' >/dev/null 2>&1; do sleep 1; done
docker compose exec -T analytics python -m analytics.derive enforcement
echo "enforcement window: $(grep '^ENFORCE_WINDOW=' .env)"
