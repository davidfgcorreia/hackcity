# Demo script — 3 minutes (task A3)

Rewritten 24 Sep (evening) for the current build: live GBFS detection, automatic missions, road
navigation, and the analytics page. Timings were measured against the running stack.

> **Backup video: still not recorded.** No screen recorder here. Shot list at the end.

## Prep — do this before you present, not on camera

```bash
cd project
cp .env.example .env         # Windows: DB_PORT=5434 (5433 belongs to analytics-db)
make up && make seed         # ~2 min
make osrm                    # ONCE, and it is slow — see the warning below
docker compose exec analytics python -m analytics.ingest
docker compose exec analytics python -m analytics.derive
make demo                    # clock to 25 Aug 18:30 UTC, builds op1's route
```

**Two things will silently spoil the demo if you skip them:**

| Check | Command | Must say |
|---|---|---|
| Road routing is live | `curl -s localhost:8000/api/missions/current?operator_id=op1 \| grep -o '"routing_engine":"[a-z-]*"'` | `"osrm"` — **not** `"straight-line"` |
| Analytics has data | open `/insights` | charts, not an empty page |

Right now this machine reports **`straight-line`**, which means OSRM is not built. The turn-by-turn
navigation is the newest and best-looking part of the field app — do not present without it.

Tabs to open: **1** `/` (home) · **2** `/review` · **3** `/field` on the phone · **4** `/insights`.

## The three minutes

### 0:00–0:25 · The problem, on live data

Tab 1, then tab 2.

> "Cascais has shared bikes left outside station areas. The operator is contracted to recover
> them; when it doesn't, the municipality has to — and today nobody knows which bikes those are."

Point at the map.

> "This is not a recording. We are polling the provider's live feed right now — **253 bikes
> tracked at this moment**. Every dot is one we detected parked outside a permitted area."

Click the **Eligible** chip.

> "These meet the municipal rule: outside the station area plus 30 metres, parked **strictly more
> than 120 minutes**, confirmed by a fresh observation — not one stale trip-end guess."

### 0:25–0:50 · Why every case is defensible

Open any eligible case.

> "Each case carries its own evidence: distance outside the boundary, the 120-minute calculation
> against the clock we're looking at, and a full timeline — what was observed, when it reached
> us, and every change a person made."

Click **Exportar**.

> "That's the evidence record for the enforcement process. Evidence, not a fine — we don't decide
> penalties."

### 0:50–1:20 · The mission builds itself ← *the part to be proud of*

Stay on the laptop. Show the terminal for four seconds:

```bash
curl -s "localhost:8000/api/missions/current?operator_id=op2"
# null
```

> "There is no route for operator 2. Nobody creates missions by hand."

Now hand the phone over (or pick **op2** in the operator selector) and let it load.

> "The operator just opens the app. It sends their GPS position, and the route is built around
> them — from where they actually are, not from the depot, ending at the depot, respecting the
> van's capacity of six. The rest stay queued."

Back to op1 and point at the version number.

> "This route is at **version 62**. That is 62 automatic recalculations since this afternoon —
> every one triggered by the live feed, an approval, or a recorded outcome. Nobody pressed a
> button."

### 1:20–1:55 · At the stop (phone)

Tap the first stop.

> "Bike ID, where it was last seen, why it's a case, and how certain we are."

Try **Recolhida** with nothing filled in — the button stays disabled.

> "A pickup is refused without the bike ID **and** a photo."

Add both, submit.

> "Recorded — and the stop leaves the route immediately."

### 1:55–2:25 · The route repairs itself

Laptop, `/review`. Press **+30 min** three times, narrating: 19:00… 19:30… 20:00.

> "Same engine, historical data, so I can fast-forward. There — that bike moved back inside a
> station area on its own. The stop was removed and the route recalculated, and the operator's
> phone says *what* changed and *why*."

Hold up the phone with the banner.

> "They don't drive to a bike that isn't there. That is the whole point: fewer wasted trips."

### 2:25–2:50 · Where the next station should go

Tab 4, `/insights`.

> "The same data answers the planning question. Abandonment per area, and candidate sites scored
> on demand, unresolved parking, transport gaps and bus delay — with the weights on screen,
> because the municipality has to approve them, and with missing inputs shown as missing rather
> than as zero."

### 2:50–3:00 · Close

> "Detection with evidence, routes that maintain themselves, and a planning view — all on the
> live feed, all from one `docker compose up`."

## If something breaks

| Symptom | Say this, keep moving |
|---|---|
| Field map empty | `make demo` again in a spare terminal; talk over `/review` |
| No route change at 20:00 | press **+30 min** twice more; removals also happen later that evening |
| Navigation says straight-line | skip the turn-by-turn beat, show the stop list instead |
| `/insights` empty | the derive step didn't run — skip tab 4, it isn't load-bearing |
| Live feed errors | "we're on replay for the demo" and carry on |
| Anything else | cut to the video |

## Shot list for the backup video

One take, 1080p, phone as a screen recording (not a camera pointed at a handset).

1. Terminal: `make up && make seed && make demo` — speed ×8 in the edit (10 s)
2. `/review`, eligible chip selected (8 s)
3. Case drawer: boundary → 120-minute block → timeline → export (15 s)
4. `curl` showing `null` for op2, then the phone building its own route (15 s)
5. Stop sheet: blocked pickup, then pickup with photo, stop disappears (20 s)
6. `+30 min` ×3 to 20:00, cut to the phone banner (20 s)
7. `/insights` (7 s)

≈95 s of footage; the narration above fits over it.
