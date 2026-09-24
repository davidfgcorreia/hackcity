# Hackcity — Cascais bicycle recovery (operations MVP)

Docker Compose stack: **Postgres 16 · FastAPI (Python 3.12) · React + Vite (Leaflet)**.
Design: [../docs/operations_architecture.md](../docs/operations_architecture.md) · Tasks: [../docs/TASKS.md](../docs/TASKS.md)

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
- Live detection starts with the API: it polls the Bird GBFS feed every 60 s (`GET /api/live` shows its status). `make demo` switches to replay mode, and `POST /api/live/start` switches back.
- If `docker compose` can't find the containers, check `docker context ls` and use the context whose endpoint the daemon answers on (`DOCKER_CONTEXT=<name> docker info`). Docker Desktop and the system engine are separate contexts; on some machines both npipe endpoints reach the same engine and either works.
- Frontend without a backend: `VITE_USE_MOCKS=true docker compose up web`

### On Windows (checked 24 Sep on Windows 10 + Docker Desktop 28.0.4)

The three things that stop a fresh clone there, in the order you hit them:

1. **`git clone` fails with "Filename too long".** Some `datasets/` names exceed the 260-character
   limit once the destination path is added. Run `git config --global core.longpaths true` before
   cloning, or clone into a short path such as `C:\hackcity`.
2. **`make` is not installed** with Git Bash, so `make up` is `command not found`. Either install
   it (`winget install GnuWin32.Make`) or run the targets directly:
   ```bash
   docker compose up -d --build                       # make up
   docker compose exec api python -m scripts.load_data # make seed
   docker compose exec api pytest -q                   # make test
   ```
3. **Port 5432 is often taken** by a locally installed Postgres, and the db container then fails
   to start. Put `DB_PORT=5433` in `.env`; nothing else changes, because the api reaches the
   database as `db:5432` inside the compose network.

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
