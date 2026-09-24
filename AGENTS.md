# Repository Guidelines

## Project Structure & Module Organization

This repository is a planning and data workspace for the Cascais micromobility challenge. `docs/initial.md` contains the detailed proposal; `chalange.md` contains the short challenge brief. Source material lives in `datasets/`: bicycle trips and events, station and GBFS JSON, Waze traffic data, vehicle CSVs, and dated transit operation plans. The operations MVP lives in `project/` (`backend/` FastAPI, `frontend/` React, `docker-compose.yml`); see `docs/operations_architecture.md` and the parallel task plan in `docs/TASKS.md`. Put new implementation code and its tests in clearly named subdirectories under `project/`; keep supplied data in `datasets/` and design notes in `docs/`.

## Build, Test, and Development Commands

From `project/`: `cp .env.example .env`, `make up` (Postgres :5432, API :8000, web :5173), `make seed` (loads stations and bicycle events from `datasets/`, which is mounted read-only), `make test` (backend pytest in the api container), and `make psql`. Use `VITE_USE_MOCKS=true docker compose up web` for frontend work without a backend. Data analysis: `docker compose exec analytics python -m analytics.ingest`, then `python -m analytics.derive`; tests with `docker compose exec analytics pytest -q` (see `docs/analytics_architecture.md`). Use `git diff --check` before committing and `rg --files docs project` to list working files.

## Coding Style & Naming Conventions

Follow the conventions of the language and formatter chosen for new code, and commit its configuration alongside the code. Use descriptive names that distinguish trip records, vehicle events, station geometry, and municipal collection cases. Keep source timestamps and time zones explicit. Preserve the names and schemas of supplied datasets; write derived outputs to separate, clearly named files instead of editing originals.

## Testing Guidelines

Backend tests use pytest (`make test`); pure logic in `backend/app/core` must stay unit-tested. Include tests for data parsing, missing or duplicate identifiers, time-zone handling, and the station-area-plus-30-metre / 120-minute detection rule. Name tests to describe the behavior they verify and document the command that runs them. Treat historical sample data and simulated operational events as distinct inputs.

## Commit & Pull Request Guidelines

The short Git history includes `Add datasets and initial documentation` and `first commit`, so it does not establish a firm convention. Use concise, imperative commit subjects that describe the change. In pull requests, summarize the purpose, list validation performed, identify any changed data files or assumptions, and link the relevant issue when one exists. Include screenshots for changes to visual reports or interfaces.
