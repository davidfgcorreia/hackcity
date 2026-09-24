# 0001. Operations MVP stack

- Status: accepted
- Date: 2026-09-24

## Context
The team has about 21 hours to the Devpost deadline. Several people and agents need to work in parallel. The field app must run on a municipal smartphone inside a webview. The team chose Docker, Postgres, a Python backend and React.

## Options
| Option | Pros | Cons |
|---|---|---|
| Streamlit only | Fastest to demo | Poor mobile field UX; no offline support; hard to split the work |
| **FastAPI + Postgres + React/Vite (Docker Compose)** | Clean API contract lets frontend and backend work in parallel; mobile webview/PWA; good scalability story | Two codebases to integrate |
| Django + templates | Admin for free | Slower mobile UX; the team prefers React |

## Decision
Use FastAPI (Python 3.12) with SQLAlchemy 2 on Postgres 16, and a React 19 + Vite + Leaflet frontend, all run with Docker Compose. Geometry uses Shapely and pyproj in EPSG:3763; PostGIS is not needed yet. Clients poll every 5 s instead of using WebSockets. The schema is created with `create_all` instead of migrations. Frontend mocks remove the frontend's dependency on the backend.

## Consequences
The detection and routing logic is pure Python and unit-tested, so it can move behind any transport. To revisit after the hackathon: Alembic migrations, SSE/WebSocket push, authentication and roles, OR-Tools/OSRM routing, and a live provider adapter.
