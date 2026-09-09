# HOMEFORGE_SKILL.md
## Project context for Claude — read this at the start of every chat

---

## Live URL
https://resplendent-salmiakki-a5cd49.netlify.app

## Google Sheets URL
https://script.google.com/macros/s/AKfycbwtUvzbIeE7REyYIrMMTw5Otn1Uvklfvz6VZOgm_z4-Mmkzu33KQE2yD8plbwDt8tE/exec

## Source files
- `homeforge.jsx` — full React/JSX source (~5700 lines), edit this
- `api/claude.js` — serverless proxy to the Anthropic API (AI coach, tips, swaps)
- `validate.js` — structural validator: `node validate.js homeforge.jsx`
- `validate-modes.mjs` — behavioural tests: progression, dedup, plan namespacing, TRX/BW isolation
- `validate-stretch.mjs` — stretch library and routine tests
- `PRODUCT.md` — product purpose, users, brand tone
- `HOMEFORGE_SKILL.md` — this file

## Deploy process
1. Make changes to `homeforge.jsx`
2. `npm run validate` — runs all three validators, see expected counts below
3. `npm run build` — Vite emits `dist/`
4. Drag `dist/` to app.netlify.com/drop

`npm run dev` serves on localhost for verification. Note that `/api/claude` is a
serverless function and does NOT run under `vite dev` — the AI panel will show
"Could not generate analysis" locally. That is expected, not a regression.

<details>
<summary>Legacy: standalone single-file HTML build</summary>

Predates the Vite setup. Inlines the JSX and compiles it in-browser with Babel
via CDN. Kept because it produces one file with no build step, but `npm run
build` is the normal path.

```python
app_src = open('homeforge.jsx').read()
app_src = app_src.replace('import { useState, useEffect, useRef } from "react";', 'const { useState, useEffect, useRef } = React;')
app_src = app_src.replace('export default function App() {', 'function App() {')
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#0f0f0f" />
  <title>HomeForge</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>* {{ box-sizing: border-box; margin: 0; padding: 0; }} body {{ background: #0f0f0f; }}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,env">
{app_src}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App));
  </script>
</body>
</html>"""
open('homeforge.html', 'w').write(html)
```
</details>

---

## Architecture

- Single-file React app, `homeforge.jsx` (~5700 lines), built with Vite
- localStorage key: `homeforge_data` — **NEVER change this**
- Google Sheets sync via Apps Script web app (GET requests, no CORS issues from Netlify)
- AI features call `/api/claude`, which proxies to the Anthropic API server-side
  so the key never reaches the client

## Equipment (Evgenii's gym)
- Olympic bar 14kg, EZ curl bar 8kg
- Plates (pairs): 20/15/10/5/2.5kg
- Adjustable dumbbells: 2.5–24kg (15 increments: 1,2,2.5,3.5,4.5,5,5.5,6.5,8,9,10,11.5,13.5,16,18,20.5,22.5,24)
- Fixed neoprene: 1kg, 2kg, 5kg pairs
- Power tower (pull-up/dip/push-up handles), flat bench, squat stands
- Resistance bands, yoga mat, ab wheel, balance disc, dip belt (max 20kg)

## Athlete profile
- Age 49, 83kg, 176cm, Intermediate, ~6 years, hypertrophy, 3 days/week
- **Managed conditions: upper-back kyphosis, lumbar disc.** These constrain
  exercise choice and scheduling, and several design decisions below exist
  only because of them. Do not "simplify" them away.
- Split: Full Body A / B / C rotation (see below)
- Baselines: Bench 60kg×8, Dumbbell Fly 12.5kg×15, Squat 70kg×10, Deadlift 80kg×8, Weighted Dip +20kg×12, EZ Skull Crusher 38kg×8, Single-Arm DB Row 24kg×12

---

## Training design — and the log evidence behind it

A five-month log review (43 unique sessions, Apr–Sep 2026) drove the current
design. The findings are recorded here because each one is the reason a piece
of logic looks the way it does.

| Finding | Consequence |
|---|---|
| 1.95 sessions/week against a 3/week plan; PPL is a 6-day split | Every muscle trained once per 10–12 days; every muscle group below MEV |
| Horizontal pull:push ran **0.30:1** | Actively feeding the kyphosis |
| Loaded hinge and loaded squat landed 2–3 days apart **9 times** | The main disc risk, and it came from the template, not from in-session choices |
| Deadlift held 74kg×8 for **8 sessions**, squat 84kg×8 for 6 | The progression gate never opened (see below) |
| Avg RIR drifted 2.0 → 1.45 across Jun–Jul; no voluntary deload in 22 weeks | Both training breaks were involuntary (10 days, then 18) |
| Stretch module: **0 sessions logged out of 43** | A separate mobility day competes with the decision to train at all |

### Split — Full Body A / B / C

`SPLITS[3]` is the A/B/C rotation; `SPLITS[2]` is A/B. PPL day templates still
exist and are reachable via `SPLITS[5]`, but are no longer the 3-day default.

|  | A — squat | B — hinge | C — unilateral |
|---|---|---|---|
| Lower | Barbell Squat | **Romanian Deadlift** | Bulgarian Split Squat |
| H push | Bench Press | DB Bench Press | Weighted Dip |
| H pull | Single-Arm DB Row | DB Row | Inverted Row |
| Other | DB Shoulder Press | Assisted Pull-Up | DB Shoulder Press |
| Rear delt | Face Pull | Face Pull | Face Pull |
| Core | Dead Bug | EZ Bar Curl | Ab Wheel Rollout |

**Three rules hold across all three templates. Preserve them when editing:**
1. **Horizontal pull ≥ horizontal push in every session.** One press, one row.
2. **Face Pull in every session.** Rear delt work was 1.1 sets/week.
3. **The loaded hinge appears in B only.** This is what removes the 2–3 day
   hinge/squat collision structurally rather than by remembering to avoid it.

Measured on the rotation: pull:push **2.00:1**, loaded hinge **1 of 3 sessions**.

It is a rotation, not a repeat — at 3 days/week every muscle is hit 3× but no
exercise recurs within the week. At the real ~2 days/week it simply cycles
A→B→C→A across weeks, so a missed day costs nothing structurally.

---

## Completed features

### RIR-based next session planning ✅
- `getDayType()` + `calcNextSessionPlan()`
- After session save → stores `data.nextSession[bucket]` with per-exercise targets
- Priority 0 in `getSmartSuggestion` — RIR plan overrides log/baseline
- `📋 RIR-planned` badge + `planRIR` display in TODAY'S TARGET

### Double progression ✅
Replaced a flat `repMidpoint = 10` gate that applied to every exercise. Because
10 is the midpoint of 8-12 and above the top of every 6-8 range in the DB, an
8-rep compound could never satisfy it — and the plan then returned
`targetReps: avgReps`, i.e. "do exactly what you just did". Neither half of
double progression could move. That is the deadlift and squat stall above.

- `repWindow(exName, goal)` / `repRangeTop()` / `repRangeBottom()` — the gate is
  now the top of **that exercise's own** range, honouring `repOverride`
- Weight moves → reps reset to the bottom of the range
- Weight held because reps were short → `targetReps = avgReps + 1`
- Backing off (RIR ≤ 1) → reps are not also pushed up
- `TARGET_RIR = 2` is the prescription; `lastRIR` carries the observed readback.
  `targetRIR` used to mean the observed value — do not conflate them.

### Effective load / volume ✅
Volume was `weight × reps`, which scored a +15kg dip at 120kg instead of the
784kg actually moved, read pull-up **assistance** as added load, and gave every
bodyweight session 0. The volume chart, the deload trigger and the volume-drop
trend flag all fed on that number.

- `BW_LOAD_FRACTION` — fraction of bodyweight a movement actually lifts
- `ASSISTED_EX` — exercises where the logged number is assistance, so it subtracts
- `effectiveSetLoad(exName, weight, bodyWeight)`
- `sessionVolume(h, bodyWeight)` — **recomputes from the stored log**, so old and
  new sessions share one formula. Falls back to `h.volume` only if `log` is missing.
- Consumers take a `bodyWeight` arg: `detectTrends`, `getWeeklyVolumes`,
  `shouldDeload`, the stats chart, session save

### Mesocycle tracking ✅
- `data.mesocycle = { phase, sessionCount, startDate, pendingTransition, lastBlock }`
- `PHASE_LENGTHS = { accumulation: 5, intensification: 5, deload: 1 }` — a deload
  lands every 6th session instead of every 21st
- Cycle: accumulation → deload → intensification → deload → accumulation.
  `nextPhase(phase, lastBlock)` needs `lastBlock` because which block follows a
  deload depends on the block it just followed.
- Deload prescription: two-thirds the working sets (4→3), stop at RIR 4
- Sessions persist `phase`, so "when was the last deload" is answerable from the log
- User must confirm every transition — no automatic switching
- Intensification: weights from `weightForReps(1RM, 6)` using the best set from
  the last 2 same-day sessions, plate-snapped, reps "6-8"

### AI coach — context-aware session analysis ✅
The analysis could previously only restate the numbers it was handed, which is
why it read as mechanical: it had no way to know a session followed an 18-day
layoff.

- `buildTrainingContext(history, data)` / `formatTrainingContext(ctx)` supply:
  adherence vs planned, gap before this session, longest recent gap, RIR
  trajectory, share of sets at RIR ≤ 1, deload recency, horizontal push:pull
  ratio, loaded-spine spacing, mobility recency, per-muscle sets vs MEV
- The system prompt ranks these **ahead of** load progression:
  adherence → fatigue → managed conditions → volume → load
- Hard rule in the prompt: never recommend a weight increase in the same breath
  as a fatigue or layoff warning
- `HORIZ_PUSH` / `HORIZ_PULL` / `LOADED_HINGE` name the movement patterns

### Mobility tail ✅
- Offered as a **6-minute tail on the finished screen**, not a separate day
- `data.stretchStartMinutes` seeds the duration; a standalone stretch clears it
- Routing: Full Body A → Upper Back, B → Lower Back, C → Hips & Legs
- Stretch library: 31 exercises, region-tagged, written for the kyphosis and the
  disc, with setup/movement/feel/mistake cues and an evidence base in-source

### Trend detection ✅
- `detectTrends(day, history, bodyWeight)` — last 3-4 same-day sessions
- Flags: too easy (RIR ≥ 4), too hard (RIR ≤ 1), volume drop, weight stall
- Purple `📈 TREND ALERT` at top of WorkoutScreen, dismissable, resets each session

### Session Override ✅
- `data.sessionOverride = { day, removed: [], replaced: {} }`
- "⚙️ Adjust session" inline panel in HomeScreen session card
- Cleared to null on session save; alts sourced from `DAY_TEMPLATES`

### Google Sheets sync ✅
- `sheetsPost()` uses GET with encoded payload (avoids CORS)
- Auto-sync after every session save (background, non-blocking)
- ☁️↑ bulk upload (clears then re-uploads), ☁️↓ restore with confirmation
- `dedupHistory()` collapses duplicates on read, keyed on `date|day|mode`
- `normDate()` handles Sheets Date objects (timezone-safe, uses local date)

### Warmup ✅
- Bench/OHP/Squat (bar×10, 50%×8, 70%×5, 85%×3), Deadlift (40/60/75/85%),
  other barbell 3 sets, EZ bar 2 sets, dumbbells >16kg 2 sets
- All barbell/EZ warmup weights plate-snapped via `calcPlates()`

---

## Key technical rules

1. **Discuss plan → wait for confirmation → then code** — no surprise changes
2. **Never change** `STORAGE_KEY = "homeforge_data"` — instant data loss
3. **Preserve the three template rules** (pull ≥ push, face pull every session,
   hinge in B only). They exist for the managed conditions, not for symmetry.
4. **`npm run validate` after touching data structures, weight logic or templates**
5. Prefer targeted edits over full rewrites
6. **Verify in the browser** before claiming a change works — and if you log a
   test session, remove it from localStorage afterwards

## Validator status (current build)
```
validate.js          ✅ 101   ⚠️ 9 warnings   ❌ 2 errors
validate-modes.mjs   ✅ 65    ❌ 0 failures
validate-stretch.mjs ✅ 37    ❌ 0 failures
```
The 2 errors and 9 warnings are pre-existing and non-critical: CORS/sandbox
note, Weighted Push-Up display, missing cues on a few unused exercises, and a
`Single-Arm Dumbbell Row` name-mismatch warning that now misfires (the DB entry
and the baseline agree — the check itself is wrong).

---

## Known issues / future ideas
- **Sheets duplicates**: the Apps Script appends rather than upserts, so the sheet
  accumulates duplicate rows (29 of 72 at last count). The client is unaffected —
  `dedupHistory()` collapses them on read — but the fix is an upsert on
  `date+day` in the Apps Script, which lives outside this repo.
- **`EXERCISE_TO_MUSCLE_GROUP` has gaps** — e.g. `Barbell Close-Grip Bench Press`
  falls through to "core", so the below-MEV list can understate triceps
- **AI model**: `api/claude.js` uses `claude-haiku-4-5-20251001`. The analysis is
  now reasoning-heavy (ranking competing constraints); Sonnet would do it better
  at higher cost.
- Overload display in ExerciseCard: within-cycle + cycle-to-cycle (designed, not built)
- Mesocycle data synced to Sheets (currently only sessions + config)
- PWA manifest for better phone install experience

---

## How to start a new chat
This is a git repo — point Claude Code at it and it will read this file.

First message: describe what you want to build or fix. Discuss before coding.
