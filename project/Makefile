.PHONY: up down logs seed test psql reset-db demo osrm analytics-dump analytics-restore analytics-map-prep enforce-window-on enforce-window-off

up:        ## start db + api + web
	docker compose up -d --build
down:
	docker compose down
logs:
	docker compose logs -f api web
seed:      ## load stations + bicycle events from ../datasets
	docker compose exec api python -m scripts.load_data
test:      ## backend unit tests
	docker compose exec api pytest -q
psql:
	docker compose exec db psql -U hackcity
reset-db:  ## drop everything (dev only)
	docker compose down -v
demo:      ## reset cases/missions, jump replay to a busy morning, create op1's route
	curl -s -XPOST localhost:8000/api/replay/reset >/dev/null
	curl -s -XPOST "localhost:8000/api/replay/start?from_time=2026-08-25T06:00:00Z" >/dev/null
	curl -s -XPOST localhost:8000/api/replay/pause >/dev/null
	curl -s -XPOST localhost:8000/api/missions/replan -H 'content-type: application/json' \
	  -d '{"operator_id":"op1","lat":38.736686,"lng":-9.386868}' | head -c 300; echo
	@echo "Now: POST /api/replay/start (runs at REPLAY_SPEED) or /api/replay/step?minutes=30"

osrm:      ## build the OSM road graph (once, ~5 min) and start the routing engine
	docker compose build osrm-prep
	docker compose --profile tools run --rm osrm-prep
	docker compose run --rm --no-deps --entrypoint sh osrm -c \
	  "osrm-extract -p /opt/car.lua /data/cascais.osm.pbf && osrm-partition /data/cascais.osrm && osrm-customize /data/cascais.osrm"
	docker compose up -d --force-recreate osrm
analytics-dump:     ## dump the analytics DB (slim) for the GitHub Release
	sh tools/analytics-dump.sh .data
analytics-restore:  ## download the shared analytics DB from the GitHub Release and restore it
	sh tools/analytics-restore.sh
analytics-map-prep: ## build scheduled transit segments, then the abandonment-clock tables (parking, recovery, candidates, Bird)
	docker compose exec -T analytics python -c 'from pathlib import Path; from analytics.db import sql; sql(Path("/code/analytics/derive/sql/09_schedule.sql").read_text())'
	docker compose exec -T analytics python -m analytics.derive enforcement
enforce-window-on:  ## count the 120-min abandonment clock only 08:00–20:00 Lisbon (API + analysis)
	sh tools/set-enforcement.sh true
enforce-window-off: ## count the abandonment clock around the clock (24 h)
	sh tools/set-enforcement.sh false
