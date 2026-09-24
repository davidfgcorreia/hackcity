.PHONY: up down logs seed test psql fmt

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
