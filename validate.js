// HomeForge App Validator
// Run: node validate.js

const ERRORS = [];
const WARNINGS = [];
const OK = [];

function err(msg) { ERRORS.push("❌ " + msg); }
function warn(msg) { WARNINGS.push("⚠️  " + msg); }
function ok(msg) { OK.push("✅ " + msg); }

// ── Data extracted from homeforge.jsx ────────────────────────────────────────

const EXERCISE_DB_NAMES = [
  // Push
  "Push-Up","Diamond Push-Up","Pike Push-Up","Dumbbell Bench Press",
  "Dumbbell Shoulder Press","Single-Arm DB Press","Tricep Dips","Resistance Band Press",
  "Barbell Bench Press","Overhead Press","EZ Bar Skull Crusher","Close-Grip Bench Press",
  "Weighted Push-Up","Weighted Dip",
  // Pull
  "Pull-Up","Chin-Up","Neutral Grip Pull-Up","Weighted Pull-Up","Weighted Chin-Up",
  "Inverted Row","Dumbbell Row","Dumbbell Curl","Band Pull-Apart","Barbell Row",
  "EZ Bar Curl","EZ Bar Reverse Curl","EZ Bar Upright Row","Kettlebell Row",
  "Single-Arm Dumbbell Row",
  // Legs
  "Squat","Bulgarian Split Squat","Single-Leg Glute Bridge","Romanian Deadlift",
  "Single-Leg RDL","Goblet Squat","Barbell Squat","Barbell Deadlift","Banded Squat",
  "Calf Raise","Lunge","Balance Disc Squat","Single-Leg Balance Disc",
  // Full Body
  "Burpee","Clean & Press","Thruster","Mountain Climber","EZ Bar Complex",
  // Upper
  "Tricep Overhead Ext",
  // Core
  "Plank","Dead Bug","Ab Wheel Rollout","Bicycle Crunch","Balance Disc Plank",
];

const TECHNIQUE_KEYS = [
  "Push-Up","Diamond Push-Up","Pike Push-Up","Dumbbell Bench Press","Barbell Bench Press",
  "Dumbbell Fly","Weighted Dip","Tricep Dips","Overhead Press","Pull-Up","Chin-Up",
  "Neutral Grip Pull-Up","Weighted Pull-Up","Weighted Chin-Up","Inverted Row",
  "Dumbbell Row","Single-Arm Dumbbell Row","Barbell Row","EZ Bar Curl","EZ Bar Reverse Curl",
  "EZ Bar Skull Crusher","EZ Bar Upright Row","Close-Grip Bench Press","Barbell Squat",
  "Barbell Deadlift","Romanian Deadlift","Goblet Squat","Bulgarian Split Squat","Lunge",
  "Single-Leg RDL","Calf Raise","Squat","Plank","Dead Bug","Ab Wheel Rollout",
  "Bicycle Crunch","Balance Disc Squat","Kettlebell Swing","Burpee","Mountain Climber",
  "Clean & Press","Band Pull-Apart","Weighted Push-Up","Single-Arm DB Press",
  "Single-Leg Glute Bridge","Balance Disc Plank","Banded Squat","EZ Bar Complex",
  "Thruster","Resistance Band Press",
];

const CROSS_RATIOS = {
  "Overhead Press":           { from: "Barbell Bench Press", pct: 0.62 },
  "Dumbbell Bench Press":     { from: "Barbell Bench Press", pct: 0.40 },
  "Dumbbell Shoulder Press":  { from: "Barbell Bench Press", pct: 0.28 },
  "Barbell Row":              { from: "Barbell Deadlift",    pct: 0.65 },
  "Dumbbell Row":             { from: "Barbell Deadlift",    pct: 0.20 },
  "Single-Arm Dumbbell Row":  { from: "Barbell Deadlift",    pct: 0.20 },
  "Romanian Deadlift":        { from: "Barbell Deadlift",    pct: 0.72 },
  "Goblet Squat":             { from: "Barbell Squat",       pct: 0.25 },
  "Bulgarian Split Squat":    { from: "Barbell Squat",       pct: 0.25 },
  "Lunge":                    { from: "Barbell Squat",       pct: 0.22 },
  "EZ Bar Curl":              { from: "Barbell Bench Press", pct: 0.30 },
  "Dumbbell Curl":            { from: "Barbell Bench Press", pct: 0.13 },
  "Weighted Pull-Up":         { from: "Weighted Dip",        pct: 0.85 },
  "Weighted Chin-Up":         { from: "Weighted Dip",        pct: 0.90 },
  "Close-Grip Bench Press":   { from: "Barbell Bench Press", pct: 0.88 },
  "Tricep Overhead Ext":      { from: "EZ Bar Skull Crusher",pct: 0.55 },
  "EZ Bar Skull Crusher":     { from: "Barbell Bench Press", pct: 0.50 },
  "Dumbbell Fly":             { from: "Barbell Bench Press", pct: 0.20 },
  "Single-Arm DB Press":      { from: "Barbell Bench Press", pct: 0.30 },
};

const USER_BASELINE = {
  "Barbell Bench Press":     { weight: 60,   reps: 8  },
  "Dumbbell Fly":            { weight: 12.5, reps: 15 },
  "Barbell Squat":           { weight: 70,   reps: 10 },
  "Barbell Deadlift":        { weight: 80,   reps: 8  },
  "Weighted Dip":            { weight: 20,   reps: 12 },
  "EZ Bar Skull Crusher":    { weight: 38,   reps: 8  },
  "Single-Arm Dumbbell Row": { weight: 24,   reps: 12 },
};

const AVAILABLE_PLATES = [20, 15, 10, 5, 2.5]; // pairs
const BAR_WEIGHT = 14;
const EZ_BAR_WEIGHT = 8;
const DB_WEIGHTS = [1,2,2.5,3.5,4.5,5,5.5,6.5,8,9,10,11.5,13.5,16,18,20.5,22.5,24];
const DB_MAX = 24;
const BARBELL_MAX = 119;
const EZ_MAX = 113;

// ── Test 1: Technique coverage ────────────────────────────────────────────────
console.log("\n📋 TEST 1: Technique Library Coverage");
const EXERCISE_SET = new Set(EXERCISE_DB_NAMES);
const TECHNIQUE_SET = new Set(TECHNIQUE_KEYS);

EXERCISE_DB_NAMES.forEach(name => {
  if (TECHNIQUE_SET.has(name)) {
    ok(`Technique exists: ${name}`);
  } else {
    warn(`Missing technique cues: ${name}`);
  }
});

// ── Test 2: Cross-ratio references valid exercises ────────────────────────────
console.log("\n📋 TEST 2: Cross-Ratio References");
Object.entries(CROSS_RATIOS).forEach(([ex, ratio]) => {
  if (!EXERCISE_SET.has(ex) && ex !== "Dumbbell Fly") {
    warn(`Cross-ratio exercise not in DB: ${ex}`);
  }
  const validSources = ["Barbell Bench Press","Barbell Deadlift","Barbell Squat","Weighted Dip","EZ Bar Skull Crusher"];
  if (!validSources.includes(ratio.from)) {
    err(`Cross-ratio source not a baseline exercise: ${ratio.from} (for ${ex})`);
  } else {
    ok(`${ex} → ${ratio.from} × ${ratio.pct}`);
  }
});

// ── Test 3: Weight calculation accuracy ──────────────────────────────────────
console.log("\n📋 TEST 3: Weight Suggestions vs Equipment");

function calc1RM(weight, reps) { return Math.round(weight * (1 + reps / 30)); }
function weightForReps(oneRM, targetReps) { return Math.round((oneRM / (1 + targetReps / 30)) * 2) / 2; }
function snapToNearest(arr, val) { return arr.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev); }

const HYPERTROPHY_TARGET_REPS = 8;
const DUMBBELL_EX = ["Dumbbell Bench Press","Dumbbell Shoulder Press","Dumbbell Row","Dumbbell Curl",
  "Single-Arm Dumbbell Row","Dumbbell Fly","Single-Arm DB Press"];
const BARBELL_EX = ["Barbell Bench Press","Barbell Squat","Barbell Deadlift","Barbell Row","Overhead Press","Romanian Deadlift"];
const EZ_EX = ["EZ Bar Curl","EZ Bar Skull Crusher","EZ Bar Reverse Curl","EZ Bar Upright Row","Close-Grip Bench Press"];

Object.entries(CROSS_RATIOS).forEach(([ex, ratio]) => {
  const srcBaseline = USER_BASELINE[ratio.from];
  if (!srcBaseline) return;
  const src1RM = calc1RM(srcBaseline.weight, srcBaseline.reps);
  const est1RM = Math.round(src1RM * ratio.pct);
  const rawWeight = weightForReps(est1RM, HYPERTROPHY_TARGET_REPS);

  let finalWeight = rawWeight;
  let issue = null;

  if (DUMBBELL_EX.includes(ex)) {
    if (rawWeight > DB_MAX) {
      issue = `RAW ${rawWeight}kg exceeds DB max ${DB_MAX}kg — capped`;
      finalWeight = DB_MAX;
    }
    finalWeight = snapToNearest(DB_WEIGHTS, finalWeight);
  } else if (BARBELL_EX.includes(ex)) {
    if (rawWeight > BARBELL_MAX) { issue = `exceeds barbell max`; finalWeight = BARBELL_MAX; }
  } else if (EZ_EX.includes(ex)) {
    if (rawWeight > EZ_MAX) { issue = `exceeds EZ max`; finalWeight = EZ_MAX; }
  }

  const realisticCheck = finalWeight > 0 && finalWeight < 200;
  if (!realisticCheck) {
    err(`${ex}: unrealistic weight ${finalWeight}kg`);
  } else if (issue) {
    warn(`${ex}: ${rawWeight}kg → capped/snapped to ${finalWeight}kg (${issue})`);
  } else {
    ok(`${ex}: ${finalWeight}kg × ${HYPERTROPHY_TARGET_REPS} reps`);
  }
});

// ── Test 4: Baseline exercises all have suggestions ───────────────────────────
console.log("\n📋 TEST 4: Baseline Coverage");
Object.entries(USER_BASELINE).forEach(([ex, b]) => {
  const orm = calc1RM(b.weight, b.reps);
  const suggested = weightForReps(orm, HYPERTROPHY_TARGET_REPS);
  ok(`${ex}: baseline ${b.weight}kg×${b.reps} → 1RM ${orm}kg → suggest ${suggested}kg`);
});

// ── Test 5: Plate calculator ──────────────────────────────────────────────────
console.log("\n📋 TEST 5: Plate Calculator");
function calcPlates(targetTotal, barWeight, platePairs) {
  let remaining = (targetTotal - barWeight) / 2;
  if (remaining <= 0) return { total: barWeight, perSide: [] };
  const used = [];
  for (const kg of platePairs) {
    if (remaining <= 0) break;
    const canUse = Math.floor(remaining / kg);
    if (canUse > 0) { used.push({ kg, count: canUse }); remaining -= canUse * kg; }
  }
  const achieved = barWeight + used.reduce((a, p) => a + p.kg * p.count * 2, 0);
  return { total: achieved, perSide: used, remainder: remaining };
}

const PLATE_TESTS = [60, 70, 80, 38, 20, 100, 119];
PLATE_TESTS.forEach(target => {
  const result = calcPlates(target, BAR_WEIGHT, AVAILABLE_PLATES);
  const plateStr = result.perSide.map(p => `${p.count}×${p.kg}`).join("+");
  if (Math.abs(result.total - target) > 5) {
    warn(`Target ${target}kg → closest achievable ${result.total}kg (${plateStr ? plateStr + " per side" : "bar only"})`);
  } else {
    ok(`${target}kg → ${result.total}kg = ${BAR_WEIGHT}kg bar + ${plateStr} per side`);
  }
});

// ── Test 6: API connectivity check ───────────────────────────────────────────
console.log("\n📋 TEST 6: Known Issues Summary");
err("API calls from mobile artifact sandbox may be blocked by CORS/network policies");
err("Weighted Push-Up shows BW because dip belt max weight not set in profile");
warn("1RM display for dumbbell exercises is misleading (shows per-hand not total)");
warn("Single-Arm Dumbbell Row name mismatch: DB has 'Single-Arm Dumbbell Row' but baseline has same");
warn("Kettlebell Row in Pull DB but no kettlebell in CROSS_RATIOS");
warn("EZ Bar Complex has no baseline or cross-ratio — always shows BW");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log("VALIDATION SUMMARY");
console.log("═".repeat(60));
console.log(`\n✅ PASSED: ${OK.length}`);
console.log(`⚠️  WARNINGS: ${WARNINGS.length}`);
console.log(`❌ ERRORS: ${ERRORS.length}`);

if (WARNINGS.length) {
  console.log("\n--- WARNINGS ---");
  WARNINGS.forEach(w => console.log(w));
}
if (ERRORS.length) {
  console.log("\n--- ERRORS ---");
  ERRORS.forEach(e => console.log(e));
}

// ── Specific fixes needed ─────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log("FIXES NEEDED");
console.log("═".repeat(60));
const FIXES = [
  "1. API calls: Move AI Tips/Swap to use message-passing via parent window instead of direct fetch",
  "2. Weighted Push-Up: Add dipbeltMax default (e.g. 20kg) to PREFILLED_DATA",
  "3. 1RM display: For dumbbell exercises, label as 'per-hand 1RM' not just '1RM'",
  "4. Missing technique: Add Single-Leg Balance Disc, EZ Bar Complex, Kettlebell Row, Tricep Overhead Ext",
  "5. Dumbbell Bench Press ratio 0.40 means 24kg per hand from 60kg bench — likely too high, try 0.35",
  "6. Add dipbeltMax: 20 to PREFILLED_DATA so Weighted exercises show +20kg",
];
FIXES.forEach(f => console.log(f));
