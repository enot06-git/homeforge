# HOMEFORGE_SKILL.md
## Project context for Claude — read this at the start of every chat

---

## Live URL
https://resplendent-salmiakki-a5cd49.netlify.app

## Google Sheets URL
https://script.google.com/macros/s/AKfycbwtUvzbIeE7REyYIrMMTw5Otn1Uvklfvz6VZOgm_z4-Mmkzu33KQE2yD8plbwDt8tE/exec

## Source files
- `homeforge.jsx` — full React/JSX source (~3200 lines), edit this
- `validate.js` — Node.js validator, run with `node validate.js homeforge.jsx`
- `HOMEFORGE_SKILL.md` — this file

## Deploy process
1. Make changes to `homeforge.jsx`
2. Run `node validate.js homeforge.jsx` — must pass 99, same 2 pre-existing errors only
3. Build standalone HTML (Python script below)
4. User downloads `homeforge.html`, renames to `index.html`, drags folder to app.netlify.com/drop

### Build script (always use this)
```python
app_src = open('/home/claude/homeforge_work.jsx').read()
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
with open('/mnt/user-data/outputs/homeforge.html', 'w') as f:
    f.write(html)
```

---

## Architecture

- Single-file React/JSX app (~3200 lines)
- localStorage key: `homeforge_data` — **NEVER change this**
- Google Sheets sync via Apps Script web app (GET requests, no CORS issues from Netlify)
- No build step — Babel compiles JSX in browser via CDN

## Equipment (Evgenii's gym)
- Olympic bar 14kg, EZ curl bar 8kg
- Plates (pairs): 20/15/10/5/2.5kg
- Adjustable dumbbells: 2.5–24kg (15 increments: 1,2,2.5,3.5,4.5,5,5.5,6.5,8,9,10,11.5,13.5,16,18,20.5,22.5,24)
- Fixed neoprene: 1kg, 2kg, 5kg pairs
- Power tower (pull-up/dip/push-up handles), flat bench, squat stands
- Resistance bands, yoga mat, ab wheel, balance disc, dip belt (max 20kg)

## Athlete profile
- Age 49, 83kg, 176cm, Intermediate, ~6 years, hypertrophy, 3 days/week
- Split: Push / Pull / Legs
- Baselines: Bench 60kg×8, Dumbbell Fly 12.5kg×15, Squat 70kg×10, Deadlift 80kg×8, Weighted Dip +20kg×12, EZ Skull Crusher 38kg×8, Single-Arm DB Row 24kg×12

---

## Completed features

### Step 1 — RIR-based next session planning ✅
- `getDayType()` + `calcNextSessionPlan()` functions
- After session save → stores `data.nextSession[dayType]` with per-exercise targets
- Priority 0 in `getSmartSuggestion` — RIR plan overrides log/baseline
- `📋 RIR-planned` badge + `planRIR` display in TODAY'S TARGET
- HomeScreen preview: "X exercises planned — weights adjusted from your last [Day] RIR"
- Rep threshold rule: weight increases only when avgReps ≥ 10 AND RIR ≤ 3

### Session Override ✅
- `data.sessionOverride = { day, removed: [], replaced: {} }`
- "⚙️ Adjust session" inline panel in HomeScreen session card
- WorkoutScreen applies override when generating exercise list
- Cleared to null on session save
- Alts sourced from DAY_TEMPLATES entry (equipment-filtered)

### Step 4 — Google Sheets sync ✅
- `sheetsPost()` uses GET with encoded payload (avoids CORS)
- Auto-sync after every session save (background, non-blocking)
- ☁️↑ bulk upload button — syncs all history + config
- ☁️↓ restore button with confirmation dialog
- Sync indicator in header: ☁️ spinning / ✅ ok / ❌ error
- Sessions tab: date|day|volume|rating|notes|log_json|next_session_json|body_weight_history_json
- Config tab: profile|equipment|baselines|favourites|split (key/value rows)
- Date normalisation: `normDate()` handles Sheets Date objects (timezone-safe, uses local date)

### Warmup improvements ✅
- Exercise-specific protocols: Bench/OHP/Squat (bar×10, 50%×8, 70%×5, 85%×3), Deadlift (40%×8, 60%×5, 75%×3, 85%×2), other barbell (3 sets), EZ bar (2 sets), dumbbells >16kg (2 sets)
- All barbell/EZ warmup weights plate-snapped via `calcPlates()`
- Try/catch safety around warmup generation
- Romanian Deadlift excluded from BIG4_DEAD (it's a dumbbell exercise)

### Thoracic Extension ✅
- `repsOnly: true` flag in EXERCISE_DB Core
- No weight field, no RIR field — reps only
- Log hint: "LOG SETS — reps only"

### Step 2 — Mesocycle tracking ✅
- `data.mesocycle = { phase, sessionCount, startDate, pendingTransition }`
- Phases: accumulation (12) → intensification (9) → deload (3) → accumulation
- Helper functions: `initMesocycle()`, `nextPhase()`, `phaseLabel()`, `phaseColor()`, `PHASE_LENGTHS`
- Phase badge in WorkoutScreen header: `ACCUMULATION · 5/12`
- Chip in HomeScreen session card
- Finished screen transition prompt: "Phase complete — ready to move to intensification?"
- User must confirm — no automatic switching
- Intensification: weights from `weightForReps(1RM, 6)` using best set from last 2 same-day sessions, plate-snapped, reps "6-8", amber note shown
- Deload: sets cut 4→2, banner "Same weights, 2 sets only, RIR 3-4"
- `getBestFromLastTwoSameDaySessions()` for 1RM source

### Step 3 — Trend detection ✅
- `detectTrends(day, history)` — analyses last 3-4 same-day sessions
- Flags: too easy (RIR ≥ 4), too hard (RIR ≤ 1), volume drop (3 consecutive), stall (same weight 3× at RIR 2-3)
- Purple `📈 TREND ALERT` card at top of WorkoutScreen
- Dismissable with one tap — resets each new session

---

## Key technical rules

1. **Discuss plan → wait for confirmation → then code** — no surprise changes
2. **Never change** `STORAGE_KEY = "homeforge_data"` — instant data loss
3. **One feature at a time** — screenshot to verify before moving on
4. **Always run validate.js** after touching data structures or weight logic
5. **str_replace for edits** — no full rewrites
6. **Build HTML** after every change — user deploys to Netlify

## Validator status (current build)
```
✅ PASSED: 99
⚠️  WARNINGS: 10  (pre-existing, non-critical)
❌ ERRORS: 2      (pre-existing: CORS/sandbox + Weighted Push-Up display)
```

---

## Pending / future ideas
- Overload display in ExerciseCard: within-cycle progress + cycle-to-cycle comparison (designed, not built)
- Mesocycle data synced to Sheets (currently only sessions + config)
- PWA manifest for better phone install experience

---

## How to start a new chat
Upload zip containing: `homeforge.jsx` + `validate.js` + `HOMEFORGE_SKILL.md`

First message: describe what you want to build or fix. Discuss before coding.
