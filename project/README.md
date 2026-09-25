# Hackcity — developer runbook

Docker Compose stack: **Postgres 16 · FastAPI (Python 3.12) · React + Vite (Leaflet)**.
Features, screenshots and the quick start are in the [project README](../README.md). This page is for development. Design: [operations architecture](../docs/operations_architecture.md) · [decision map guide](../docs/decision_map.md) · [handoff](../docs/HANDOFF.md) · [documentation index](../docs/README.md)

## Run

```bash
cp .env.example .env     # thresholds, depot, replay speed
make up                  # db :5432, api :8000 (/docs), web :5173
make seed                # 157 stations + 53,764 bicycle events from ../datasets
make test                # backend unit tests (detector, geo, routing)
```

- Field app (mobile): http://localhost:5173/field. On a phone on the same LAN, use `http://<laptop-ip>:5173/field`.
- Presentation demo: http://localhost:5173/field?sim (or **Demonstração** on the home page). It resets 5 fixed demo bikes (real abandonment spots near the depot, `POST /api/demo/mission`), drives fast from the Complexo Multisserviços to bike 1, then auto-plays one full pickup: sample photo, typed description, **Recolhida**. It ends on the way to bike 2; **Reiniciar demonstração** replays it. Demo cases (`source=demo`, operator `demo`) never mix with live or replay cases, routes or counts.
- Live case review: http://localhost:5173/data?view=live
- API docs: http://localhost:8000/docs
- Data analysis: http://localhost:5173/data. The analytics DB and API are separate (`analytics-db`, `analytics`). Load the data with `docker compose exec analytics python -m analytics.ingest && docker compose exec analytics python -m analytics.derive`; see `../docs/analytics_architecture.md`.
- The map supports 50–1,000 m squares, dated bike and transit aggregates, recalculated candidate rankings, bike station polygons with their 30 m parking boundary, and live GBFS/TML transit layers. A missing bike remains uncertain; the adjustable unmoved-time control counts minutes on the enforcement clock (08:00–20:00 when on), filters only the map, and does not change the 120-minute pickup rule. Station balance uses fresh `station_status` snapshots and a provisional 30-day observed peak until an operator target is entered. Company relocation effectiveness requires verified relocation events.
- Live detection starts with the API: it polls the Bird GBFS feed every 60 s (`GET /api/live` shows its status). `make demo` switches to replay mode, and `POST /api/live/start` switches back.
- If `docker compose` can't find the containers, check `docker context ls`. Docker Desktop and the system engine are different contexts; use `DOCKER_CONTEXT=default`.
- Frontend without a backend: `VITE_USE_MOCKS=true docker compose up web`

## Road routing

Run `make osrm` once to download the Portugal OSM extract, clip it from Cascais through central Lisbon, and build the driving graph. Run it again after changing the graph extent. The graph stays in the `osrm_data` Docker volume. `make up` then starts OSRM on port 5000 along with the other services. The API uses road routes when OSRM is ready and labels its straight-line fallback if it cannot reach the routing service or a GPS start lies outside the graph. The field page uses MapLibre vector tiles from OpenFreeMap; map tiles need an internet connection.

## Get the analytics data without `finalset`

The 15 GB `datasets/finalset` directory is not needed to browse `/data`. A 122 MB Cascais-filtered PostGIS dump is attached to the private [data-2026-09-24 release](https://github.com/davidfgcorreia/hackcity/releases/tag/data-2026-09-24). It contains salted card hashes and is restricted to the hackathon team; keep the repository and release private.

With Docker running, `gh` logged into a teammate account that can access the private repository, and the system Docker context selected (`DOCKER_CONTEXT=default` on this machine), run from `project/`:

```bash
docker compose up -d analytics-db analytics web
make analytics-restore
```

This downloads the release asset, restores the `analytics` database, and builds indexed scheduled-vehicle segments for the map. Open [Data analysis](http://localhost:5173/data) afterward. `python -m analytics.derive` can rebuild the derived tables from the included source tables without `finalset`. The restore replaces the contents of the current `analytics` database, so use a fresh analytics volume or back up existing data first. To create a new slim dump from a populated database, run `make analytics-dump`.

## Layout

```
backend/
  app/core/       pure logic, no I/O: geo, vehicle_state, detector, enforcement, routing   (unit-tested)
  app/services/   DB + orchestration: live feed, replay clock, case lifecycle, missions, demo, transit
  app/api/        thin FastAPI routers
  app/config.py   ALL thresholds (120 min, 30 m, EPSG:3763, depot, capacity)
  scripts/        data loaders (datasets are mounted read-only at /data)
  tests/
frontend/src/
  pages/          HomePage (/), FieldPage (/field, mobile), InsightsPage + DecisionMap (/data)
  components/     AppBar, field/*, decision/*, insights/* (Bird tab, heat layer, charts), review/*
  api.ts types.ts mocks.ts i18n.ts i18n-data.ts enforcement.ts
analytics/
  analytics/      api.py (map, Laya, Bird), laya.py, bird_score.py, enforcement.py, ingest/, derive/ (SQL steps)
  tests/
tools/            OSRM build, analytics dump/restore, verify-data.py / verify-field.py browser checks
```

`core` never imports `services` or `api`. `schemas.py` and `types.ts` change in the same commit.
