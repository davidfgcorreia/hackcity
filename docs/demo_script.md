# Demo script — 2 minutes (task A3)

**Every timing below was measured against the running stack on 24 Sep**, not estimated. The
replay window in `make demo` was chosen so the live route change lands three steps in; see
[TASKS.md](TASKS.md) A2.

> **Backup video: not recorded.** I have no screen recorder or camera in this environment, so the
> recording half of A3 is still open and needs a person. The shot list at the end is written so
> someone can record it in one take.

## Before you start (5 minutes, not on camera)

```bash
cd project
cp .env.example .env          # on Windows also set DB_PORT=5433 if Postgres is installed locally
make up && make seed          # ~2 min build, then 157 stations + 53,764 events
make demo                     # reset, jump the clock to 25 Aug 18:30 UTC, build op1's route
```

Open three tabs and leave them on these pages:

| Tab | URL | Why |
|---|---|---|
| 1 | `http://localhost:5173/review` | the story is told from here |
| 2 | `http://localhost:5173/field` (phone, or a narrow window) | the operator's side |
| 3 | `http://localhost:8000/docs` | only if someone asks "is this real?" |

Check before going live: the review page shows ~54 cases, and `/field` shows **6 stops + depot**.
If the field map is empty, `make demo` did not run.

## The two minutes

### 0:00–0:20 · The problem, on the live feed

> "Cascais bikes get left outside station areas. The provider is supposed to collect them, and
> when it doesn't, the municipality has to — but today nobody knows which bikes those are."

Open **tab 1**. Point at the map, already full of coloured cases.

> "This is running against the provider's live GBFS feed right now. Every dot is a bike we
> detected outside a permitted area. Colour is how strong the evidence is."

Click the **Eligible** filter chip.

> "These are the ones that meet the rule: outside the station area plus 30 metres, parked
> **strictly more than 120 minutes**, with a fresh observation. Not one old trip-end guess."

### 0:20–0:45 · Why we can defend each one

Click any eligible case to open the drawer. Point at the three blocks in order.

> "Every case shows its own evidence: the distance outside the boundary, the 120-minute
> calculation against the clock we're looking at, and the full timeline — what was observed,
> when it arrived, and every change a person made. That exports as a JSON evidence record for the
> enforcement process. It's evidence, not a fine."

Click **Exportar**. Let the download appear. Don't open it.

### 0:45–1:15 · The operator (tab 2, hold the phone up)

> "The operator gets the route, ordered, ending at the depot. Van capacity is six, so the rest
> stay queued."

Tap the first stop.

> "Bike ID, where it was last seen, why it's a case. Seven outcomes — and a pickup is refused
> without the bike ID **and** a photo."

Tap **Recolhida** with no photo → the button stays disabled and the rule is on screen. Then add
the photo, tap again.

> "Recorded. The stop drops off the route."

### 1:15–1:45 · The route changes by itself (back to tab 1)

Press **+30 min** on the replay bar three times, narrating as you go.

> "This is the same engine on historical data, so I can fast-forward. 19:00… 19:30… 20:00 —"

At **20:00** the clock chips under the bar change and the field route re-versions.

> "There. That bike moved back inside a station area on its own, so the stop was removed and the
> route recalculated. The operator's phone says *what* changed and *why* — they don't drive to a
> bike that isn't there. That's the whole point: fewer wasted trips."

Hold up **tab 2** so the yellow banner is visible.

### 1:45–2:00 · Close

> "Detection with evidence, a route that maintains itself, and a case record the municipality can
> act on. It runs on the live feed today, and everything you saw is in one `docker compose up`."

If there is time, open **tab 3** `/insights` — one line only:

> "And the same data feeds a planning view for where new stations should go — that part is still
> mock numbers, and it says so on screen."

## If something breaks

| Symptom | Do this, keep talking |
|---|---|
| Field map empty | `make demo` again in a spare terminal; meanwhile talk over tab 1 |
| Route does not change at 20:00 | press **+30 min** twice more; removals also occur later in the evening |
| Live feed shows an error | say "we're on replay for the demo" and carry on — replay is the scripted path |
| Anything else | switch to the recorded video |

## Shot list for the backup video (still to record)

One take, 1080p, no cuts, same order as above. Record the phone as a screen capture, not a camera
pointed at a handset.

1. Terminal: `make up && make seed && make demo` — speed this up ×8 in the edit.
2. Review map with the eligible chip selected (8 s).
3. Case drawer: boundary distance → 120-minute block → timeline → export click (15 s).
4. Field: route, stop sheet, blocked pickup, then pickup with photo (25 s).
5. Review: three **+30 min** presses ending at 20:00, then cut to the field banner (20 s).
6. `/insights` with its mock banner visible (5 s).

Total ≈ 80 s of footage; the narration above fits over it.
