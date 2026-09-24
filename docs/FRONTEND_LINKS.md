# Frontend review links

The `web` container serves these pages on port 5173. Start the stack from `project/` with `DOCKER_CONTEXT=default make up` on this machine. Use your laptop's LAN address in place of `localhost` to view from another device on the same network.

The frontend is fixed to a light palette for the presentation, including when the device requests dark mode.

| Page | Link | What to check |
|---|---|---|
| Field navigation | [http://localhost:5173/field](http://localhost:5173/field) | Live position, road route, maneuver banner, and pickup flow. Browser location permission is required. |
| Field simulation | [http://localhost:5173/field?sim](http://localhost:5173/field?sim) | Route following without GPS; open the bottom sheet at peek, half, and full heights. Best for layout feedback. |
| Review | [http://localhost:5173/review](http://localhost:5173/review) | Case decisions, station map, and operational history. |
| Insights | [http://localhost:5173/insights](http://localhost:5173/insights) | Recovery, candidates, trips, transit, journeys, weather, and data quality. |
| API documentation | [http://localhost:8000/docs](http://localhost:8000/docs) | Operations endpoints. |

The field map tiles come from OpenFreeMap, so they need internet access. GPS in a phone browser generally requires HTTPS; the simulation link works without it. For feedback, note the page, device or viewport, and what you expected to happen.

For a repeatable mobile check, run `tools/verify-field.py` through the Playwright container as shown at the top of that script. It saves peek, half, full, pickup and off-route screenshots in `/tmp/hackcity-field-review`. The script intercepts its pickup and reroute requests, so it does not change live cases.
