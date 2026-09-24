.PHONY: up down logs seed test psql reset-db demo

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
demo:      ## reset cases/missions, jump replay to just before a live route change, create op1's route
	curl -s -XPOST localhost:8000/api/replay/reset >/dev/null
	curl -s -XPOST "localhost:8000/api/replay/start?from_time=2026-08-25T18:30:00Z" >/dev/null
	curl -s -XPOST localhost:8000/api/replay/pause >/dev/null
	curl -s -XPOST localhost:8000/api/missions/replan -H 'content-type: application/json' \
	  -d '{"operator_id":"op1","lat":38.736686,"lng":-9.386868}' | head -c 300; echo
	@echo "Now: POST /api/replay/start (runs at REPLAY_SPEED) or /api/replay/step?minutes=30"
