# Hackcity — Cascais bicycle recovery (operations MVP)

Docker Compose stack: **Postgres 16 · FastAPI (Python 3.12) · React + Vite (Leaflet)**.
Design: [../docs/operations_architecture.md](../docs/operations_architecture.md) · Tasks: [../docs/TASKS.md](../docs/TASKS.md) · [Frontend review links](../docs/FRONTEND_LINKS.md)

## Run

```bash
cp .env.example .env     # thresholds, depot, replay speed
make up                  # db :5432, api :8000 (/docs), web :5173
make seed                # 157 stations + 53,764 bicycle events from ../datasets
make test                # backend unit tests (detector, geo, routing)
```

- Field app (mobile): http://localhost:5173/field. On a phone on the same LAN, use `http://<laptop-ip>:5173/field`.
- Review app: http://localhost:5173/review
- API docs: http://localhost:8000/docs
- Data analysis: http://localhost:5173/insights. The analytics DB and API are separate (`analytics-db`, `analytics`). Load the data with `docker compose exec analytics python -m analytics.ingest && docker compose exec analytics python -m analytics.derive`; see `../docs/analytics_architecture.md`.
- Live detection starts with the API: it polls the Bird GBFS feed every 60 s (`GET /api/live` shows its status). `make demo` switches to replay mode, and `POST /api/live/start` switches back.
- If `docker compose` can't find the containers, check `docker context ls`. Docker Desktop and the system engine are different contexts; use `DOCKER_CONTEXT=default`.
- Frontend without a backend: `VITE_USE_MOCKS=true docker compose up web`

## Road routing

Run `make osrm` once to download the Portugal OSM extract, clip it to the Cascais area, and build the driving graph. The graph stays in the `osrm_data` Docker volume. `make up` then starts OSRM on port 5000 along with the other services. The API uses road routes when OSRM is ready and labels its straight-line fallback if it cannot reach the routing service. The field page uses MapLibre vector tiles from OpenFreeMap; map tiles need an internet connection.

## Get the analytics data without `finalset`

The 15 GB `datasets/finalset` directory is not needed to browse `/insights`. A 122 MB Cascais-filtered PostGIS dump is attached to the private [data-2026-09-24 release](https://github.com/davidfgcorreia/hackcity/releases/tag/data-2026-09-24). It contains salted card hashes and is restricted to the hackathon team; keep the repository and release private.

With Docker running, `gh` logged into a teammate account that can access the private repository, and the system Docker context selected (`DOCKER_CONTEXT=default` on this machine), run from `project/`:

```bash
docker compose up -d analytics-db analytics web
make analytics-restore
```

This downloads the release asset and restores the `analytics` database. Open [the Insights page](http://localhost:5173/insights) immediately afterward. `python -m analytics.derive` can rebuild the derived tables from the included source tables without `finalset`. The restore replaces the contents of the current `analytics` database, so use a fresh analytics volume or back up existing data first. To create a new slim dump from a populated database, run `make analytics-dump`.

## Layout

```
backend/
  app/core/       pure logic, no I/O: geo, vehicle_state, detector, routing   (unit-tested)
  app/services/   DB + orchestration: replay clock, case lifecycle, missions
  app/api/        thin FastAPI routers
  app/config.py   ALL thresholds (120 min, 30 m, EPSG:3763, depot, capacity)
  scripts/        data loaders (datasets are mounted read-only at /data)
  tests/
frontend/src/
  pages/          FieldPage (mobile), ReviewPage (desktop)
  components/     BaseMap (stations), field/*, review/*
  api.ts types.ts mocks.ts i18n.ts
```

`core` never imports `services` or `api`. `schemas.py` and `types.ts` change in the same commit.
