# Frontend links

The `web` container serves these pages on port 5173. Start the stack from `project/` with `DOCKER_CONTEXT=default make up` on this machine. Use your laptop's LAN address in place of `localhost` to view from another device on the same network.

The frontend is fixed to a light palette for the presentation, including when the device requests dark mode.

| Page | Link | What to check |
|---|---|---|
| Field navigation | [http://localhost:5173/field](http://localhost:5173/field) | Live position, road route, maneuver banner, and pickup flow. Browser location permission is required. |
| Field simulation | [http://localhost:5173/field?sim](http://localhost:5173/field?sim) | Route following without GPS; open the bottom sheet at peek, half, and full heights. Best for layout feedback. |
| Data analysis | [http://localhost:5173/data](http://localhost:5173/data) | Historical decision map in Portuguese (PT/EN switch in the top bar): 50–1,000 m squares with one chosen measure, date/hour and total/average controls, candidate ranking table and side-by-side comparison, square/station/stop drill-down, sources and definitions, CSV and print. [Map guide](../decision_map.md). |
| Shared map view | [http://localhost:5173/data?size=500&metric=supported_120&cand=-450_-432#Decision%20map](http://localhost:5173/data?size=500&metric=supported_120&cand=-450_-432#Decision%20map) | The address keeps the view and selection, so a link reproduces what the sender saw. |
| Bird performance | [http://localhost:5173/data#Bird](http://localhost:5173/data#Bird) | Abandonments Bird missed, its pickup response and station balancing, with KPIs, a map, daily/hourly charts, a station table and CSV. |
| Analysis tabs | [http://localhost:5173/data#Station%20candidates](http://localhost:5173/data#Station%20candidates) | Findings tabs with **Open on map** links; the candidates tab shares the map's ranking and includes the Laya analysis. |
| Live operations | [http://localhost:5173/data?view=live](http://localhost:5173/data?view=live) | GBFS bikes and station balance (no benchmark until 7 days of snapshots), fresh transit vehicles where available, case evidence and replay controls alongside dated planning layers. |
| API documentation | [http://localhost:8000/docs](http://localhost:8000/docs) | Operations endpoints. |

The field map tiles come from OpenFreeMap, so they need internet access. GPS in a phone browser generally requires HTTPS; the simulation link works without it. For feedback, note the page, device or viewport, and what you expected to happen.

For a repeatable mobile check, run `tools/verify-field.py` through the Playwright container as shown at the top of that script. It saves peek, half, full, pickup and off-route screenshots in `/tmp/hackcity-field-review`. The script intercepts its pickup and reroute requests, so it does not change live cases.

For the data pages, `tools/verify-data.py` runs the same way and saves desktop and mobile screenshots of the map, comparison, Live view, sources and candidates tab in `/tmp/hackcity-data-review`. It intercepts the station-target write.
