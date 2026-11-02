// HomeForge Workout-Mode Validator
// Run: node validate-modes.mjs
//
// Guards the core invariant of the Weights / TRX / Bodyweight mode switch:
// a TRX or bodyweight session must never influence weight progression.
//
// Unlike validate.js (which hardcodes its own copy of the data), this suite
// imports the real functions out of homeforge.jsx, so it cannot drift.

import * as esbuild from "esbuild";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── Build homeforge.jsx into something importable ─────────────────────────────
// The module's helpers are file-local, so we append an export of the ones under
// test. React is stubbed because none of these functions render anything.
const REACT_STUB = `
const noop = () => {};
export const useState = (v) => [typeof v === "function" ? v() : v, noop];
export const useEffect = noop;
export const useRef = () => ({ current: null });
export const useMemo = (f) => f();
export class Component {}
export default { useState, useEffect, useRef, useMemo, Component };
`;

const EPILOGUE = `
export const __t = {
  weightsHistory, historyForMode, isWeightsMode, planKeyFor, modeLabel, DEFAULT_MODE,
  WORKOUT_MODES, MODE_EXERCISE_DB, EXERCISE_TO_MUSCLE_GROUP,
  getExercisesForDay, getExercisesForMode, getBestRecord,
  getBestFromLastTwoSameDaySessions, getSmartSuggestion, calcNextSessionPlan,
  dedupHistory, detectRecentPR, shouldDeload, reconcileMesocycle, getDayType,
  formatWeightDisplay, calcPlates, TECHNIQUE, EXERCISE_DB,
  DAY_TEMPLATES, DUMBBELL_EX, loadTypeOf, fitToInventory, preFatigue,
  pickNextDay, spineSwapsFor, getMuscleWeeklySets, isLoadedSpine, MRV_TARGETS,
  SPINE_TARGET_RIR, HORIZ_PUSH, HORIZ_PULL,
  mergeSessionPlan, rebuildPlans, swapOptions, ALT_GROUPS, BAND_EX, stepBand,
  holdSpineLoad, setsFor, fitSets, trimForTime, estimateMinutes, suggestTier, minutesUntilFinish,
  sessionPace, nextTier, draftIsOpen, detectTrends, LATEST_FINISH, REP_RANGES,
};
`;

const outdir = join(ROOT, "node_modules", ".cache", "homeforge");
mkdirSync(outdir, { recursive: true });
const outfile = join(outdir, "modes-bundle.mjs");

await esbuild.build({
  stdin: {
    contents: readFileSync(join(ROOT, "homeforge.jsx"), "utf8") + EPILOGUE,
    resolveDir: ROOT,
    loader: "jsx",
    sourcefile: "homeforge.jsx",
  },
  bundle: true, format: "esm", outfile, logLevel: "error",
  plugins: [{
    name: "react-stub",
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: REACT_STUB, loader: "js" }));
    },
  }],
});

const T = (await import(pathToFileURL(outfile).href)).__t;

// ── Tiny assertion harness ────────────────────────────────────────────────────
let pass = 0; const failures = [];
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ✅ " + name); }
  else { failures.push(name); console.log(`  ❌ ${name}\n       got  ${g}\n       want ${w}`); }
};
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { failures.push(name); console.log(`  ❌ ${name}   ${info || ""}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
const DATA = {
  dumbbellWeights: "1,2,2.5,3.5,4.5,5,5.5,6.5,8,9,10,11.5,13.5,16,18,20.5,22.5,24",
  dumbbellMax: "24", barbellMax: "119", ezbarMax: "113", dipbeltMax: "20",
  barWeight: "14", barbellPlates: "2x20, 2x15, 2x10, 2x5, 2x2.5",
  equipment: ["bodyweight","dumbbells","barbell","ezbar","pullupbar","dipbelt","squatstands","bench","bands","mat"],
};

const weightsSess = { date:"2026-07-01", day:"Push", mode:"weights", volume:1920,
  log:{ "Barbell Bench Press":[{weight:"60",reps:"10",rpe:"2"},{weight:"60",reps:"10",rpe:"2"}] } };
// Deliberately hostile: same date + same day as the weights session, and it
// reuses a barbell exercise name with a wildly different rep count.
const bwSess = { date:"2026-07-01", day:"Push", mode:"bw", volume:0,
  log:{ "Push-Up":[{reps:"30",rpe:"2"},{reps:"28",rpe:"2"}],
        "Barbell Bench Press":[{reps:"40",rpe:"4"}] } };
const trxSess = { date:"2026-07-02", day:"Push", mode:"trx", volume:0,
  log:{ "TRX Chest Press":[{reps:"15",rpe:"2"},{reps:"14",rpe:"2"}] } };
const hist = [bwSess, trxSess, weightsSess];

// ── Test 1: mode tagging and filters ──────────────────────────────────────────
console.log("\n📋 TEST 1: Mode Markers & History Filters");
eq("weightsHistory drops trx + bw", T.weightsHistory([weightsSess,bwSess,trxSess]).length, 1);
eq("legacy untagged session counts as weights", T.weightsHistory([{date:"x",day:"Push"}]).length, 1);
eq("historyForMode('bw') isolates bw", T.historyForMode([weightsSess,bwSess,trxSess],"bw").length, 1);
eq("historyForMode('weights') includes legacy", T.historyForMode([{date:"x",day:"Push"},trxSess],"weights").length, 1);

// ── Test 2: dedup ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 2: Dedup Keeps One Session Per Mode Per Day");
eq("same date+day in 3 modes all survive", T.dedupHistory([weightsSess,bwSess,trxSess]).length, 3);
eq("a genuine duplicate is still dropped", T.dedupHistory([weightsSess,{...weightsSess}]).length, 1);

// ── Test 3: loaded bests ──────────────────────────────────────────────────────
console.log("\n📋 TEST 3: Non-Weights Sessions Cannot Move A Loaded Best");
eq("getBestRecord ignores BW reps on a barbell lift", T.getBestRecord("Barbell Bench Press", hist, null), {weight:60,reps:10});
eq("a TRX exercise has no loaded record", T.getBestRecord("TRX Chest Press", hist, null), {weight:0,reps:0});
eq("intensification best ignores BW", T.getBestFromLastTwoSameDaySessions("Barbell Bench Press","Push",hist,null), {weight:60,reps:10});

// ── Test 4: plan namespacing ──────────────────────────────────────────────────
console.log("\n📋 TEST 4: Next-Session Plan Namespacing");
eq("weights keeps the bare dayType key", T.planKeyFor("push","weights"), "push");
eq("undefined mode keeps the bare key (back-compat)", T.planKeyFor("push",undefined), "push");
eq("trx gets its own bucket", T.planKeyFor("push","trx"), "trx:push");
eq("bw gets its own bucket", T.planKeyFor("push","bw"), "bw:push");

// ── Test 5: non-weights plans are rep targets only ────────────────────────────
console.log("\n📋 TEST 5: TRX/BW Plans Are Rep Targets, Never Loads");
const bwPlan = T.calcNextSessionPlan("Push", bwSess.log, "hypertrophy", {...DATA, activeMode:"bw"});
eq("bw plan entries are all type 'reps'", [...new Set(Object.values(bwPlan.plan).map(p=>p.type))], ["reps"]);
eq("bw plan carries no targetWeight", Object.values(bwPlan.plan).some(p=>"targetWeight" in p), false);
const trxPlan = T.calcNextSessionPlan("Push", trxSess.log, "hypertrophy", {...DATA, activeMode:"trx"});
eq("trx plan entries are all type 'reps'", [...new Set(Object.values(trxPlan.plan).map(p=>p.type))], ["reps"]);

// ── Test 6: double progression, both halves ───────────────────────────────────
// The gate used to be a flat avgReps >= 10 for every exercise, and the plan
// handed back targetReps: avgReps — so an 8-rep lift at RIR 2 got the same
// weight AND the same reps forever. Both halves are asserted here now.
console.log("\n📋 TEST 6: Double Progression (reps to the top of the range, then load)");
const plan6 = (log) => T.calcNextSessionPlan("Push", log, "hypertrophy", {...DATA, activeMode:"weights"}).plan["Barbell Bench Press"];
const w  = (log) => plan6(log).targetWeight;
const rp = (log) => plan6(log).targetReps;
const at = (reps, rir) => ({"Barbell Bench Press":[{weight:"60",reps:String(reps),rpe:String(rir)},{weight:"60",reps:String(reps),rpe:String(rir)}]});

// Bench sits in the 8-12 hypertrophy range, so the load moves at 12, not at 10.
eq("60kg, avgReps 8, RIR 2 → held at 60", w(at(8,2)), 60);
eq("...and asks for one more rep", rp(at(8,2)), 9);
eq("60kg, avgReps 10, RIR 2 → still held (below top of range)", w(at(10,2)), 60);
eq("...and asks for one more rep", rp(at(10,2)), 11);
eq("60kg, avgReps 12, RIR 2 → top of range reached, +5kg", w(at(12,2)), 65);
eq("...and reps reset to the bottom of the range", rp(at(12,2)), 8);
eq("60kg, RIR 5 → +10kg regardless of reps", w(at(8,5)), 70);
eq("60kg, RIR 0 → -5kg", w(at(12,0)), 55);
eq("...and reps are not also pushed up when backing off", rp(at(12,0)), 12);
eq("target RIR is the prescription, not last session's", plan6(at(10,2)).targetRIR, 2);
eq("last session's RIR is kept separately", plan6(at(10,2)).lastRIR, 2);

// ── Test 7: the invariant ─────────────────────────────────────────────────────
console.log("\n📋 TEST 7: A TRX/BW Plan Cannot Re-Target A Weights Exercise");
const poisoned = { ...DATA, activeMode:"weights", nextSession: {
  "bw:push": { "Barbell Bench Press": { targetReps:45, type:"reps", source:"rir" } },
  "push":    { "Barbell Bench Press": { targetWeight:65, targetReps:10, targetRIR:2, type:"weight", source:"rir" } },
}};
const sug = T.getSmartSuggestion("Barbell Bench Press","hypertrophy",hist,null,poisoned);
// 65kg is not buildable with these plates, so it snaps down to 64.0 (see TEST 13).
eq("weights mode reads only the weights bucket", {w:sug.weight, src:sug.source}, {w:"64.0", src:"planned"});
eq("...and it is the weights plan being read, not the bw one", sug.snappedFrom, "65.0");
const bwView = T.getSmartSuggestion("Barbell Bench Press","hypertrophy",hist,null,{...poisoned, activeMode:"bw"});
eq("bw mode reads only the bw bucket", {w:bwView.weight, r:bwView.reps, src:bwView.source}, {w:null,r:"45",src:"planned"});
const onlyBw = { ...DATA, activeMode:"weights", nextSession:{ "bw:push": { "Barbell Bench Press": {targetReps:45,type:"reps"} } } };
const fallback = T.getSmartSuggestion("Barbell Bench Press","hypertrophy",hist,null,onlyBw);
ok("weights ignores a stray bw bucket and uses its log", fallback.source === "log", "source=" + fallback.source);
// Belt and braces: even a corrupt load target sitting in a TRX bucket is ignored.
const stale = { ...DATA, activeMode:"trx",
  nextSession:{ "trx:push": { "TRX Chest Press": { targetWeight:80, targetReps:8, type:"weight" } } } };
eq("a stale load target in a trx bucket is not honoured",
   T.getSmartSuggestion("TRX Chest Press","hypertrophy",[],null,stale).weight, null);

// ── Test 8: no weight leaks into TRX/BW targets ───────────────────────────────
console.log("\n📋 TEST 8: No Load Leaks Into TRX/BW Targets");
const baseline = { "Barbell Squat":{weight:70,reps:10} };
eq("bw mode: cross-ratio estimate suppressed", T.getSmartSuggestion("Bulgarian Split Squat","hypertrophy",[],baseline,{...DATA,activeMode:"bw"}).weight, null);
ok("weights mode: cross-ratio still produces a load",
   T.getSmartSuggestion("Bulgarian Split Squat","hypertrophy",[],baseline,{...DATA,activeMode:"weights"}).weight !== null);
eq("trx mode: profile baseline suppressed",
   T.getSmartSuggestion("Barbell Bench Press","hypertrophy",[],{"Barbell Bench Press":{weight:60,reps:8}},{...DATA,activeMode:"trx"}).weight, null);

// ── Test 9: analysis helpers ──────────────────────────────────────────────────
console.log("\n📋 TEST 9: Analysis Helpers Exclude Non-Weights Sessions");
eq("detectRecentPR ignores a weight logged in bw mode",
   T.detectRecentPR([{date:"2026-07-03",day:"Push",mode:"bw",log:{"Barbell Bench Press":[{weight:"999",reps:"1"}]}}, weightsSess]), null);
const volDrop = [0,1,2,3].map(i => ({ date:"2026-06-0"+(i+1), day:"Push", mode:"weights", volume:[1000,2000,3000,4000][i], log:{} }));
eq("shouldDeload still fires on 4 falling weights sessions", T.shouldDeload(volDrop), true);
eq("shouldDeload not skewed by a 0-volume bw session", T.shouldDeload([{date:"2026-06-05",day:"Push",mode:"bw",volume:0,log:{}}, ...volDrop]), true);
eq("mesocycle count excludes bw/trx",
   T.reconcileMesocycle({phase:"accumulation",sessionCount:0,startDate:"2026-01-01"}, [weightsSess,bwSess,trxSess]).sessionCount, 1);

// ── Test 10: mode exercise lists ──────────────────────────────────────────────
console.log("\n📋 TEST 10: Mode Exercise Lists Resolve For Every Split");
const DAYS = ["Push","Pull","Legs","Full Body","Full Body A","Full Body B","Upper A","Upper B",
              "Upper","Lower A","Lower B","Chest","Back","Shoulders","Arms"];
for (const mode of ["trx","bw"]) {
  let empty = [], weighted = [];
  for (const day of DAYS) {
    const list = T.getExercisesForDay(day, DATA.equipment, "hypertrophy", {}, "Intermediate", mode);
    if (!list.length) empty.push(day);
    weighted.push(...list.filter(e => !e.repOverride && !e.timed).map(e => `${day}/${e.name}`));
  }
  eq(`${mode}: every split day yields exercises`, empty, []);
  eq(`${mode}: no exercise would render a weight input`, weighted, []);
}
eq("REST is empty in trx mode", T.getExercisesForDay("REST",DATA.equipment,"hypertrophy",{},"x","trx").length, 0);

// ── Test 11: weights mode is untouched ────────────────────────────────────────
console.log("\n📋 TEST 11: Weights Mode Unchanged");
const wl = T.getExercisesForDay("Push", DATA.equipment, "hypertrophy", {}, "Intermediate", "weights");
eq("weights Push still has 5 exercises", wl.length, 5);
eq("weights Push still opens with Barbell Bench Press", wl[0].name, "Barbell Bench Press");
eq("omitting the mode arg behaves as weights", T.getExercisesForDay("Push",DATA.equipment,"hypertrophy",{},"Intermediate").length, 5);

// ── Test 12: muscle mapping ───────────────────────────────────────────────────
console.log("\n📋 TEST 12: Mode Exercises Map To Muscle Groups");
eq("TRX Low Row → back", T.EXERCISE_TO_MUSCLE_GROUP["TRX Low Row"], "back");
eq("TRX Hamstring Curl → hamstrings", T.EXERCISE_TO_MUSCLE_GROUP["TRX Hamstring Curl"], "hamstrings");
eq("Barbell Bench Press → chest (unchanged)", T.EXERCISE_TO_MUSCLE_GROUP["Barbell Bench Press"], "chest");
const unmapped = Object.values(T.MODE_EXERCISE_DB)
  .flatMap(db => Object.values(db).flat())
  .filter(ex => !T.EXERCISE_TO_MUSCLE_GROUP[ex.name])
  .map(ex => ex.name);
eq("every mode exercise has a muscle group", unmapped, []);

// ── Test 13: target / pre-fill / plate breakdown all agree ────────────────────
// Regression: TODAY'S TARGET showed the achievable 84.0kg while the set input
// pre-filled the raw target 86.0kg, and the plate line under the input still
// described 84.0kg worth of plates.
console.log("\n📋 TEST 13: Suggested Load Matches What The Plates Can Build");
const PLATE_DATA = { ...DATA, activeMode:"weights",
  nextSession:{ push:{ "Barbell Squat":{ targetWeight:86, targetReps:7, targetRIR:3, type:"weight", source:"rir" } } } };
const sq = T.getSmartSuggestion("Barbell Squat","hypertrophy",[],null,PLATE_DATA);
eq("86kg target snaps to the achievable 84.0kg", sq.weight, "84.0");
eq("the raw target is retained for reference", sq.snappedFrom, "86.0");
const sqDisp = T.formatWeightDisplay("Barbell Squat", sq.weight, PLATE_DATA);
eq("plate breakdown totals the same number", sqDisp.total, sq.weight);
eq("1RM tag is scaled to the snapped load", sq.oneRM, Math.round(106 * 84 / 86));

// Every plate-loaded suggestion must be self-consistent, across many targets.
const barLifts = ["Barbell Squat","Barbell Bench Press","Barbell Deadlift","Overhead Press","EZ Bar Curl"];
const incoherent = [];
for (const ex of barLifts) {
  for (const target of [22,37.5,48,61,73.7,86,99,118]) {
    const key = T.getDayType("Push");
    const d = { ...DATA, activeMode:"weights", nextSession:{ [key]:{ [ex]:{ targetWeight:target, targetReps:8, type:"weight" } } } };
    const s = T.getSmartSuggestion(ex,"hypertrophy",[],null,d);
    const disp = T.formatWeightDisplay(ex, s.weight, d);
    if (disp.total !== s.weight) incoherent.push(`${ex}@${target}: suggested ${s.weight}, plates build ${disp.total}`);
  }
}
eq("suggested load == plate breakdown for every bar lift/target", incoherent, []);
ok("dumbbell suggestions are left alone (snapped upstream)",
   T.getSmartSuggestion("Dumbbell Curl","hypertrophy",[],{"Dumbbell Curl":{weight:10,reps:10}},{...DATA,activeMode:"weights"}).snappedFrom === undefined);

// ── Test 14: an AI-adjusted target must not masquerade as RIR-planned ─────────
// Applying an AI proposal overwrites the RIR-derived target but used to keep its
// targetRIR, so the card showed "RIR-planned / last session avg RIR 3 → adjusted"
// for a number your RIR never produced.
console.log("\n📋 TEST 14: AI-Adjusted Targets Label Themselves Honestly");
const aiPlan = { ...DATA, activeMode:"weights",
  nextSession:{ push:{ "Barbell Squat":{ targetWeight:89, targetReps:7, type:"weight", source:"ai_proposal" } } } };
const aiSug = T.getSmartSuggestion("Barbell Squat","hypertrophy",[],null,aiPlan);
eq("source is ai_planned, not planned", aiSug.source, "ai_planned");
eq("no planRIR is claimed for an AI target", aiSug.planRIR, undefined);
const rirPlan = { ...DATA, activeMode:"weights",
  nextSession:{ push:{ "Barbell Squat":{ targetWeight:89, targetReps:7, targetRIR:3, type:"weight", source:"rir" } } } };
const rirSug = T.getSmartSuggestion("Barbell Squat","hypertrophy",[],null,rirPlan);
eq("a genuine RIR plan still reports planned", rirSug.source, "planned");
eq("...and still surfaces its RIR", rirSug.planRIR, 3);
eq("89kg is buildable, so it is not snapped", rirSug.weight, "89.0");
const aiReps = { ...DATA, activeMode:"bw",
  nextSession:{ "bw:push":{ "Push-Up":{ targetReps:32, type:"reps", source:"ai_proposal" } } } };
eq("rep-target AI proposals label themselves too",
   T.getSmartSuggestion("Push-Up","hypertrophy",[],null,aiReps).source, "ai_planned");

// ── Test 15: technique cue coverage ───────────────────────────────────────────
console.log("\n📋 TEST 15: Technique Cues Cover Every Exercise");
const modeExercises = [...new Set(Object.values(T.MODE_EXERCISE_DB).flatMap(db => Object.values(db).flat()).map(e => e.name))];
eq("every TRX/BW mode exercise has technique cues", modeExercises.filter(n => !T.TECHNIQUE[n]), []);
const CUE_FIELDS = ["setup", "movement", "feel", "mistake"];
const badCues = modeExercises.filter(n => {
  const t = T.TECHNIQUE[n];
  return !t || CUE_FIELDS.some(f => typeof t[f] !== "string" || !t[f].trim());
});
eq("each has setup/movement/feel/mistake", badCues, []);

// ── Test 16: Full Body A/B/C — base lifts first ──────────────────────────────
console.log("\n📋 TEST 16: Full Body A/B/C Put Base Lifts First");
// Accessories: single-joint, rear-delt band work, core. Nothing loaded and
// multi-joint may follow one of these. A `primer` (light trunk bracing before
// the main lift) is the one thing allowed ahead of the base lifts.
const ACCESSORY = new Set(["Face Pull","Band Pull-Apart","EZ Bar Curl","Dumbbell Curl","EZ Bar Reverse Curl",
  "Dumbbell Fly","EZ Bar Skull Crusher","Tricep Overhead Ext","Calf Raise","Single-Leg Calf Raise",
  "Lateral Raise","Band Lateral Raise","Prone Y-Raise","Sliding Leg Curl",
  "Dead Bug","Plank","Side Plank","Pallof Press","Ab Wheel Rollout","Bicycle Crunch","Thoracic Extension","EZ Bar 21s"]);
const fb = (day) => T.getExercisesForDay(day, DATA.equipment, "hypertrophy", {}, "Intermediate", "weights");
for (const day of ["Full Body A","Full Body B","Full Body C"]) {
  const names = fb(day).filter(e => !e.primer).map(e => e.name);
  const firstAcc = names.findIndex(n => ACCESSORY.has(n));
  const lateBase = names.slice(firstAcc).filter(n => !ACCESSORY.has(n));
  ok(`${day}: no base lift after an accessory`, firstAcc > 0 && !lateBase.length, names.join(" → "));
  const primers = fb(day).map((e, i) => e.primer ? i : -1).filter(i => i >= 0);
  ok(`${day}: primers only ever open the session`, primers.every((p, i) => p === i), primers.join(","));
}

// ── Test 17: dumbbell targets stay on the rack ────────────────────────────────
console.log("\n📋 TEST 17: Suggestions Only Use Weights That Exist");
const RACK = DATA.dumbbellWeights.split(",").map(Number);
const heavy = (ex, w, r) => [{ date:"2026-09-01", day:"Full Body B", mode:"weights",
  log:{ [ex]:[{ weight:String(w), reps:String(r), rpe:"2" }] } }];
const offRack = T.DUMBBELL_EX.map(ex => [ex, T.getSmartSuggestion(ex,"hypertrophy",heavy(ex,24,15),null,DATA)?.weight])
  .filter(([, w]) => !RACK.includes(parseFloat(w)));
eq("24kg x 15 never suggests a dumbbell that is not on the rack", offRack, []);
eq("Bulgarian Split Squat is a dumbbell lift everywhere", T.loadTypeOf("Bulgarian Split Squat"), "dumbbell");
const aiHeavy = T.getSmartSuggestion("Dumbbell Row","hypertrophy",[],null,
  { ...DATA, activeMode:"weights", nextSession:{ fullbody:{ "Dumbbell Row":{ type:"weight", targetWeight:27, source:"ai_proposal" } } } });
eq("an AI proposal above the rack is capped", aiHeavy.weight, "24.0");
eq("...and flags reps as the way forward", aiHeavy.cappedFrom, "27.0");
eq("an off-rack dumbbell snaps to the nearest real one", T.fitToInventory("Dumbbell Curl", 12.4, DATA), 11.5);
eq("a dumbbell list longer than dumbbellMax is still capped",
   T.fitToInventory("Dumbbell Curl", 30, { ...DATA, dumbbellWeights: DATA.dumbbellWeights + ",26,28" }), 24);
eq("dip belt respects its max", T.fitToInventory("Weighted Dip", 31, DATA), 20);

// ── Test 18: pre-fatigue correction ───────────────────────────────────────────
console.log("\n📋 TEST 18: Same Muscle Already Worked → Lighter Target");
eq("DB press after bench: prime mover shared → 10%", T.preFatigue("Dumbbell Shoulder Press",["Barbell Squat","Barbell Bench Press","Single-Arm Dumbbell Row"]).pct, 0.10);
eq("DB press after dips: delts only a synergist → 5%", T.preFatigue("Dumbbell Shoulder Press",["Bulgarian Split Squat","Weighted Dip","Inverted Row"]).pct, 0.05);
eq("row after pull-up: lats → 10%", T.preFatigue("Dumbbell Row",["Romanian Deadlift","Assisted Pull-Up","Dumbbell Bench Press"]).pct, 0.10);
eq("curl after pull-up and row → 10%", T.preFatigue("EZ Bar Curl",["Romanian Deadlift","Assisted Pull-Up","Dumbbell Bench Press","Dumbbell Row","Face Pull"]).pct, 0.10);
eq("bench after a squat is fresh", T.preFatigue("Barbell Bench Press",["Barbell Squat"]).pct, 0);
eq("the discount is capped", T.preFatigue("EZ Bar Skull Crusher",["Close-Grip Bench Press","Weighted Dip","Tricep Dips"]).pct, 0.20);

const A_BEFORE_PRESS = ["Barbell Squat","Barbell Bench Press","Single-Arm Dumbbell Row"];
const fresh = [{ date:"2026-09-01", day:"Upper", mode:"weights",
  log:{ "Dumbbell Shoulder Press":[{ weight:"20.5", reps:"10", rpe:"2" }] } }];
const freshSug  = T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",fresh,null,DATA);
const placedSug = T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",fresh,null,DATA,A_BEFORE_PRESS);
ok("press logged fresh, now after the bench → lighter", parseFloat(placedSug.weight) < parseFloat(freshSug.weight),
   `${placedSug.weight} vs ${freshSug.weight}`);
ok("...still a dumbbell on the rack", RACK.includes(parseFloat(placedSug.weight)));
eq("...and the card can say why", placedSug.fatigue?.by, ["Barbell Bench Press"]);

const sameSlot = [{ date:"2026-09-01", day:"Full Body A", mode:"weights",
  log:{ "Barbell Squat":[{ weight:"80", reps:"8", rpe:"2" }], "Barbell Bench Press":[{ weight:"60", reps:"8", rpe:"2" }],
        "Single-Arm Dumbbell Row":[{ weight:"24", reps:"10", rpe:"2" }],
        "Dumbbell Shoulder Press":[{ weight:"16", reps:"10", rpe:"2" }] } }];
eq("press logged after the bench, placed after the bench → no double discount",
   T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",sameSlot,null,DATA,A_BEFORE_PRESS).weight,
   T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",sameSlot,null,DATA).weight);

const planned = (fatigue) => ({ ...DATA, activeMode:"weights", nextSession:{ fullbody:{
  "Dumbbell Shoulder Press":{ type:"weight", targetWeight:18, targetReps:9, lastRIR:2, targetRIR:2, source:"rir", ...(fatigue !== undefined ? { fatigue } : {}) } } } });
eq("RIR plan earned in the same slot is honoured as-is",
   T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",[],null,planned(0.10),A_BEFORE_PRESS).weight, "18.0");
eq("legacy plan with no fatigue context is left alone",
   T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",[],null,planned(undefined),A_BEFORE_PRESS).weight, "18.0");
eq("plan earned fresh, now after the bench → next dumbbell down",
   T.getSmartSuggestion("Dumbbell Shoulder Press","hypertrophy",[],null,planned(0),A_BEFORE_PRESS).weight, "16.0");
const planOut = T.calcNextSessionPlan("Full Body A", sameSlot[0].log, "hypertrophy", DATA).plan;
eq("new plans record the fatigue they were earned under", planOut["Dumbbell Shoulder Press"].fatigue, 0.10);
eq("Full Body C shares the full-body plan bucket", T.getDayType("Full Body C"), "fullbody");

// ── Test 19: the template rules, re-checked on the Oct 2026 templates ────────
console.log("\n📋 TEST 19: Full Body Template Rules");
const SPINE_DAYS = { "Full Body A":["Barbell Squat"], "Full Body B":[], "Full Body C":["Romanian Deadlift"] };
for (const day of ["Full Body A","Full Body B","Full Body C"]) {
  const ex = fb(day), names = ex.map(e => e.name);
  const push = names.filter(n => T.HORIZ_PUSH.includes(n)).length;
  const pull = names.filter(n => T.HORIZ_PULL.includes(n)).length;
  ok(`${day}: horizontal pull >= push`, pull >= push, `${pull} vs ${push}`);
  ok(`${day}: Face Pull every session`, names.includes("Face Pull"));
  eq(`${day}: loaded-spine lifts`, names.filter(T.isLoadedSpine), SPINE_DAYS[day]);
  ok(`${day}: no overhead press`, !names.some(n => ["Dumbbell Shoulder Press","Overhead Press"].includes(n)), names.join(", "));
  ok(`${day}: side delts trained`, names.includes("Lateral Raise"));
  const pairs = {};
  ex.forEach((e, i) => { if (e.pair) (pairs[e.pair] ??= []).push([i, e.name]); });
  for (const [id, members] of Object.entries(pairs)) {
    eq(`${day} pair ${id}: exactly two, adjacent`, members.length === 2 && members[1][0] - members[0][0] === 1, true);
    const pushIdx = members.findIndex(([, n]) => T.HORIZ_PUSH.includes(n));
    if (pushIdx >= 0) eq(`${day} pair ${id}: pull before press`, pushIdx, 1);
  }
}
eq("B has no barbell row fallback", T.DAY_TEMPLATES["Full Body B"].some(e => (e.alts || []).includes("Barbell Row")), false);

// ── Test 20: loaded-spine lifts stay at RIR 3 ────────────────────────────────
console.log("\n📋 TEST 20: Loaded-Spine Lifts Stay Clear Of Failure");
const squat = (sets) => ({ "Barbell Squat": sets.map(([w, r, rir]) => ({ weight:String(w), reps:String(r), rpe:String(rir) })) });
const sqPlan = (sets) => T.calcNextSessionPlan("Full Body A", squat(sets), "hypertrophy", DATA).plan["Barbell Squat"];
const hidden = sqPlan([[84,8,3],[84,8,2],[84,8,2],[84,8,1]]);
eq("3,2,2,1 (avg 2): the RIR-1 set backs the load off", hidden.targetWeight, 79);
eq("...and reports the hardest set, not the average", hidden.lastRIR, 1);
const atTwo = sqPlan([[84,8,2],[84,8,2],[84,8,2]]);
eq("all sets RIR 2: hold the weight", atTwo.targetWeight, 84);
eq("...and do not ask for another rep", atTwo.targetReps, 8);
const easy = sqPlan([[84,8,3],[84,8,3],[84,8,4]]);
eq("all sets RIR 3+, reps short of the top: hold, one more rep", [easy.targetWeight, easy.targetReps], [84, 9]);
const ready = sqPlan([[84,10,3],[84,10,3],[84,10,3]]);
eq("all sets RIR 3 at the top of 6-10: small step up, back to 6", [ready.targetWeight, ready.targetReps], [89, 6]);
eq("never the big jump, however easy", sqPlan([[84,10,5],[84,10,5],[84,10,5]]).targetWeight, 89);
eq("prescribed reserve is RIR 3", ready.targetRIR, T.SPINE_TARGET_RIR);
const benchPlan = T.calcNextSessionPlan("Full Body A", { "Barbell Bench Press":[{weight:"64",reps:"8",rpe:"2"},{weight:"64",reps:"8",rpe:"2"}] }, "hypertrophy", DATA).plan["Barbell Bench Press"];
eq("bench is unaffected: RIR 2, one more rep", [benchPlan.targetWeight, benchPlan.targetReps, benchPlan.targetRIR], [64, 9, 2]);
const oldPlan = { ...DATA, activeMode:"weights", nextSession:{ fullbody:{ "Barbell Squat":{ type:"weight", targetWeight:84, targetReps:9, lastRIR:2, targetRIR:2, source:"rir", fatigue:0 } } } };
eq("a plan stored before the rule still shows RIR 3", T.getSmartSuggestion("Barbell Squat","hypertrophy",[],null,oldPlan,["Dead Bug"]).planTargetRIR, 3);
eq("...and the 6-10 window", T.getSmartSuggestion("Barbell Squat","hypertrophy",[],null,oldPlan).reps, "6-10");
const fromLog = T.getSmartSuggestion("Barbell Squat","hypertrophy",
  [{ date:"2026-09-01", day:"Full Body A", mode:"weights", log: squat([[84,8,2]]) }],null,DATA);
ok("an unplanned squat is sized below its logged 8-rep load (reserve built in)", parseFloat(fromLog.weight) < 84, fromLog.weight);

// ── Test 21: which session is next ───────────────────────────────────────────
console.log("\n📋 TEST 21: Next Session — Oldest First, Spine Spacing");
const SPLIT3 = ["Full Body A","Full Body B","Full Body C"];
const sess = (date, day, ex) => ({ date, day, mode:"weights",
  log: ex ? { [ex]:[{ weight:"80", reps:"8", rpe:"3" }] } : { "Face Pull":[{ reps:"12", rpe:"2" }] } });
const octHist = [sess("2026-10-03","Full Body B"), sess("2026-09-30","Full Body A","Barbell Squat"), sess("2026-09-27","Full Body C","Romanian Deadlift")];
eq("Oct 5: C was due, not a second A", T.pickNextDay(SPLIT3, octHist, "2026-10-05").day, "Full Body C");
const septHist = [sess("2026-09-12","Full Body C","Romanian Deadlift"), sess("2026-09-10","Full Body B"), sess("2026-09-08","Full Body A","Barbell Squat")];
const sep13 = T.pickNextDay(SPLIT3, septHist, "2026-09-13");
eq("Sep 13 (RDL yesterday): A moves back, B goes first", sep13.day, "Full Body B");
ok("...and says why", /1 day ago/.test(sep13.reason || ""), sep13.reason);
eq("Sep 15 (3 days on): A is fine again", T.pickNextDay(SPLIT3, septHist, "2026-09-15").day, "Full Body A");
eq("empty history starts at the top of the split", T.pickNextDay(SPLIT3, [], "2026-09-15").day, "Full Body A");
eq("stretch sessions do not count",
   T.pickNextDay(SPLIT3, [{ date:"2026-10-04", day:"Stretch", log:{} }, ...octHist], "2026-10-05").day, "Full Body C");
eq("A's no-axial-load swap", T.spineSwapsFor("Full Body A"), { "Barbell Squat":"Goblet Squat" });
eq("C's no-axial-load swap", T.spineSwapsFor("Full Body C"), { "Romanian Deadlift":"Single-Leg RDL" });
eq("B needs none", T.spineSwapsFor("Full Body B"), {});

// ── Test 22: muscle accounting ───────────────────────────────────────────────
console.log("\n📋 TEST 22: Muscle Groups — Delts Split, Synergists Counted");
const three = (ex) => ({ [ex]: [1,2,3].map(() => ({ weight:"10", reps:"10", rpe:"2" })) });
const benchSets = T.getMuscleWeeklySets([{ log: three("Barbell Bench Press") }]);
// Pressing is a full front-delt set (that is why front-delt MEV is 0); triceps a synergist.
eq("3 bench sets: chest 3, front delts 3, triceps 1.5", [benchSets.chest, benchSets.frontDelt, benchSets.triceps], [3, 3, 1.5]);
eq("lateral raise → side delts", T.getMuscleWeeklySets([{ log: three("Lateral Raise") }]).sideDelt, 3);
eq("row counts back once, not twice (lats + upper back)", T.getMuscleWeeklySets([{ log: three("Dumbbell Row") }]).back, 3);
eq("side plank seconds count as sets",
   T.getMuscleWeeklySets([{ log: { "Side Plank":[{ seconds:"30", rpe:"3" },{ seconds:"30", rpe:"3" }] } }]).obliques, 2);
eq("Face Pull → rear delts", T.EXERCISE_TO_MUSCLE_GROUP["Face Pull"], "rearDelt");
eq("Lateral Raise → side delts", T.EXERCISE_TO_MUSCLE_GROUP["Lateral Raise"], "sideDelt");
eq("Dumbbell Shoulder Press → front delts", T.EXERCISE_TO_MUSCLE_GROUP["Dumbbell Shoulder Press"], "frontDelt");
eq("Prone Y-Raise → lower traps", T.EXERCISE_TO_MUSCLE_GROUP["Prone Y-Raise"], "lowerTraps");
eq("every mapped group has a volume target",
   [...new Set(Object.values(T.EXERCISE_TO_MUSCLE_GROUP))].filter(g => !T.MRV_TARGETS[g]), []);
const NEW_EX = ["Lateral Raise","Band Lateral Raise","Prone Y-Raise","Sliding Leg Curl","Single-Leg Calf Raise","Side Plank","Pallof Press"];
eq("new exercises have full technique cues",
   NEW_EX.filter(n => ["setup","movement","feel","mistake"].some(f => !T.TECHNIQUE[n]?.[f])), []);
eq("loaded lateral raise, Y-raise and calf raise use the dumbbell rack",
   ["Lateral Raise","Prone Y-Raise","Single-Leg Calf Raise"].map(T.loadTypeOf), ["dumbbell","dumbbell","dumbbell"]);

// ── Test 23: live plans reach the card ───────────────────────────────────────
// Nov 2026 review: plans frozen since Sep 12 overrode the live ones, each session
// erased the others' plans, and the rep target was never shown.
console.log("\n📋 TEST 23: The Current Plan Is The One Read");
const planOf = (w, r) => ({ targetWeight:w, targetReps:r, targetRIR:2, lastRIR:2, source:"rir", type:"weight" });
const staleData = { ...DATA, activeMode:"weights", activeDay:"Full Body A", nextSession:{
  push:{ "Barbell Bench Press": planOf(75,12) }, fullbody:{ "Barbell Bench Press": planOf(64,9) } } };
const liveSug = T.getSmartSuggestion("Barbell Bench Press","hypertrophy",[],null,staleData);
eq("a frozen Push plan cannot override the Full Body plan", liveSug.weight, "64.0");
eq("...and the card gets the exact rep target", liveSug.targetReps, 9);
const noLive = { ...staleData, nextSession:{ push:{ "Barbell Bench Press": planOf(75,12) } } };
ok("with no live plan the stale one is still ignored",
   T.getSmartSuggestion("Barbell Bench Press","hypertrophy",[{date:"2026-10-01",day:"Full Body A",mode:"weights",log:{"Barbell Bench Press":[{weight:"64",reps:"8",rpe:"2"}]}}],null,noLive).source === "log");
const merged = T.mergeSessionPlan({ fullbody:{ "Barbell Squat": planOf(84,7) } }, "fullbody", { "Inverted Row":{ targetReps:9, type:"reps" } }, "accumulation");
ok("B's save keeps A's squat plan", !!merged.fullbody["Barbell Squat"] && !!merged.fullbody["Inverted Row"]);
const beforeDeload = { fullbody:{ "Barbell Squat": planOf(84,7) } };
eq("a deload changes no plan", T.mergeSessionPlan(beforeDeload, "fullbody", { "Barbell Squat": planOf(94,6) }, "deload"), beforeDeload);
const rebuilt = T.rebuildPlans({ fullbody:{ "Romanian Deadlift": { ...planOf(89,7), source:"ai_proposal" } } }, [
  { date:"2026-10-27", day:"Full Body A", mode:"weights", log:{ "Barbell Squat":[{weight:"84",reps:"6",rpe:"4"},{weight:"84",reps:"6",rpe:"4"},{weight:"84",reps:"6",rpe:"3"}] } },
  { date:"2026-10-20", day:"Full Body A", mode:"weights", phase:"deload", log:{ "Weighted Dip":[{weight:"20",reps:"8",rpe:"4"}] } },
  { date:"2026-10-19", day:"Full Body A", mode:"trx", log:{ "TRX Low Row":[{reps:"12",rpe:"2"}] } },
], DATA);
eq("rebuild restores the erased squat plan", [rebuilt.fullbody["Barbell Squat"].targetWeight, rebuilt.fullbody["Barbell Squat"].targetReps], [84, 7]);
eq("...what is already stored wins", rebuilt.fullbody["Romanian Deadlift"].source, "ai_proposal");
const replayed = T.rebuildPlans({}, [
  { date:"2026-10-27", day:"Full Body A", mode:"weights", log:{ "Single-Arm Dumbbell Row":[{weight:"24",reps:"10",rpe:"2"},{weight:"24",reps:"8",rpe:"3"}] } },
  { date:"2026-10-16", day:"Full Body A", mode:"weights", log:{ "Single-Arm Dumbbell Row":[{weight:"24",reps:"12",rpe:"2"},{weight:"24",reps:"12",rpe:"2"}] } },
], DATA);
eq("...old sessions do not switch tempo on", [!!replayed.fullbody["Single-Arm Dumbbell Row"].tempo, replayed.fullbody["Single-Arm Dumbbell Row"].targetReps], [false, 10]);
eq("...deloads and TRX are not replayed", [!!rebuilt.fullbody["Weighted Dip"], !!rebuilt.fullbody["TRX Low Row"]], [false, false]);

// ── Test 24: only lifted sets count ──────────────────────────────────────────
console.log("\n📋 TEST 24: Sets Never Lifted Do Not Count");
const ghost = { "Barbell Bench Press":[{weight:"54",reps:"12",rpe:"3"},{weight:"54",reps:"12",rpe:"3"},{weight:"54",reps:"12",rpe:"3"},{weight:"74.0",reps:"",rpe:""}] };
eq("Oct 16: 54kg x 12 plus an empty 74kg pre-fill plans from 54, not 79",
   T.calcNextSessionPlan("Full Body A", ghost, "hypertrophy", DATA).plan["Barbell Bench Press"].targetWeight, 59);
const mixed = [{ date:"2026-10-01", day:"Full Body C", mode:"weights", log:{ "EZ Bar Curl":[{weight:"33",reps:"8",rpe:"2"},{weight:"18",reps:"21",rpe:"2"},{weight:"90",reps:"",rpe:""}] } }];
eq("best record is one real set, not 33kg paired with 21 reps", T.getBestRecord("EZ Bar Curl", mixed, null), { weight:33, reps:8 });

// ── Test 25: the ceiling ladder ──────────────────────────────────────────────
console.log("\n📋 TEST 25: Heaviest Load Reached — Reps, Tempo, Then A Variation");
const dbb = (reps, rir, prev) => T.calcNextSessionPlan("Full Body C",
  { "Dumbbell Bench Press":[1,2,3].map(() => ({ weight:"24", reps:String(reps), rpe:String(rir) })) }, "hypertrophy",
  { ...DATA, nextSession:{ fullbody:{ "Dumbbell Bench Press": prev || {} } } }).plan["Dumbbell Bench Press"];
const easyLow = dbb(8, 4);
eq("24kg x 8 at RIR 4: reps climb by two", [easyLow.targetWeight, easyLow.targetReps, !!easyLow.tempo], [24, 10, false]);
const firstTop = dbb(12, 3);
eq("24kg x 12: tempo starts, back to the bottom of the range", [firstTop.targetWeight, firstTop.targetReps, firstTop.tempo], [24, 8, true]);
eq("reps under tempo keep the tempo on", dbb(9, 2, { tempo:true }).tempo, true);
const tempoTop = dbb(12, 2, { tempo:true });
eq("top of the range at tempo: the variation is suggested", [tempoTop.ceilingAlt, tempoTop.targetReps], ["Barbell Bench Press", 12]);
const failing = dbb(8, 1, { tempo:true });
eq("RIR 1 still backs the load off and clears the tempo", [failing.targetWeight, !!failing.tempo], [22.5, false]);
const dipTop = T.calcNextSessionPlan("Full Body B", { "Weighted Dip":[{weight:"20",reps:"12",rpe:"2"},{weight:"20",reps:"12",rpe:"2"}] }, "hypertrophy", DATA).plan["Weighted Dip"];
eq("the belt limit is a ceiling too", [dipTop.targetWeight, dipTop.targetReps, dipTop.tempo], [20, 8, true]);
const below = T.calcNextSessionPlan("Full Body C", { "Dumbbell Row":[{weight:"22.5",reps:"12",rpe:"2"},{weight:"22.5",reps:"12",rpe:"2"}] }, "hypertrophy", DATA).plan["Dumbbell Row"];
eq("below the rack limit, load still moves first", [below.targetWeight, !!below.tempo], [24, false]);
const tempoTarget = T.getSmartSuggestion("Dumbbell Bench Press","hypertrophy",[],null,{ ...DATA, activeMode:"weights", nextSession:{ fullbody:{ "Dumbbell Bench Press":firstTop } } });
eq("the card is told about the tempo", [tempoTarget.tempo, tempoTarget.targetReps], [true, 8]);

// ── Test 26: 21s ─────────────────────────────────────────────────────────────
console.log("\n📋 TEST 26: 21s Are Their Own Exercise");
const EZ_DATA = { ...DATA, ezbarWeight:"8", ezbarPlates:"2x20, 2x15, 2x10, 2x5, 2x2.5", ezbarMax:"113", activeMode:"weights" };
const curl21 = (w, reps, rirs) => T.calcNextSessionPlan("Full Body C",
  { "EZ Bar 21s": reps.map((r, i) => ({ weight:String(w), reps:String(r), rpe:String(rirs[i]) })) }, "hypertrophy", EZ_DATA).plan["EZ Bar 21s"];
eq("3 x 21 at RIR 2+: +5kg, back to 14", [curl21(18,[21,21,21],[2,2,3]).targetWeight, curl21(18,[21,21,21],[2,2,3]).targetReps], [23, 14]);
eq("one short set holds the load", curl21(23,[21,14,14],[2,2,2]).targetWeight, 23);
eq("a set at RIR 1 blocks the step", curl21(18,[21,21,21],[2,2,1]).targetWeight, 18);
eq("an easy session never takes the big jump", curl21(18,[14,14,14],[5,5,5]).targetWeight, 18);
eq("EZ Bar 21s opens at 18kg", T.getSmartSuggestion("EZ Bar 21s","hypertrophy",[],null,EZ_DATA).weight, "18.0");
eq("Barbell 21s opens at 19kg", T.getSmartSuggestion("Barbell 21s","hypertrophy",[],null,DATA).weight, "19.0");
eq("the opening load is not discounted for pre-fatigue", T.getSmartSuggestion("EZ Bar 21s","hypertrophy",[],null,EZ_DATA,["Assisted Pull-Up","Dumbbell Row"]).weight, "18.0");
eq("21s are not loaded-spine lifts", ["EZ Bar 21s","Barbell 21s"].some(T.isLoadedSpine), false);
eq("21s credit biceps", T.getMuscleWeeklySets([{ log: three("EZ Bar 21s") }]).biceps, 3);

// ── Test 27: band progression ────────────────────────────────────────────────
console.log("\n📋 TEST 27: Band Level Drives Band Progression");
const bandPlan = (ex, reps, rir, band) => T.calcNextSessionPlan("Full Body A",
  { [ex]:[1,2,3].map(() => ({ weight:"", reps:String(reps), rpe:String(rir), ...(band ? { band } : {}) })) }, "hypertrophy", DATA).plan[ex];
const fpUp = bandPlan("Face Pull", 20, 3, "Medium");
eq("Face Pull at the top of 12-20: next band, back to 12", [fpUp.targetBand, fpUp.targetReps, fpUp.bandMove], ["Heavy", 12, "harder"]);
eq("mid-range: one more rep on the same band", [bandPlan("Face Pull", 14, 3, "Medium").targetBand, bandPlan("Face Pull", 14, 3, "Medium").targetReps], ["Medium", 15]);
const noBand = bandPlan("Face Pull", 20, 3);
eq("no level on record: says which way, names no band", [!!noBand.targetBand, noBand.bandMove], [false, "harder"]);
const apHard = bandPlan("Assisted Pull-Up", 7, 1, "Medium");
eq("Assisted Pull-Up at RIR 1: heavier band helps more", [apHard.targetBand, apHard.bandMove], ["Heavy", "easier"]);
eq("Assisted Pull-Up at the top: lighter band is harder", bandPlan("Assisted Pull-Up", 12, 2, "Medium").targetBand, "Light");
const bandSug = T.getSmartSuggestion("Face Pull","hypertrophy",[],null,{ ...DATA, activeMode:"weights", nextSession:{ fullbody:{ "Face Pull":fpUp } } });
eq("the card gets the band and the rep target", [bandSug.band, bandSug.reps, bandSug.weight], ["Heavy", "12", null]);
eq("the level does not count as load", T.getMuscleWeeklySets([{ log:{ "Face Pull":[{ reps:"12", rpe:"3", band:"Heavy" }] } }]).rearDelt, 1);

// ── Test 28: posture in the templates ────────────────────────────────────────
console.log("\n📋 TEST 28: Posture Work Comes Early And Pulling Leads");
for (const day of ["Full Body A","Full Body B","Full Body C"]) {
  const ex = fb(day), names = ex.map(e => e.name);
  eq(`${day}: Thoracic Extension opens the session`, [names[0], ex[0].primer], ["Thoracic Extension", true]);
  ok(`${day}: Prone Y-Raise every session`, names.includes("Prone Y-Raise"));
  ok(`${day}: Face Pull and Y-Raise before the lateral raise`,
     names.indexOf("Face Pull") < names.indexOf("Lateral Raise") && names.indexOf("Prone Y-Raise") < names.indexOf("Lateral Raise"), names.join(" → "));
  const rowSets = ex.filter(e => T.HORIZ_PULL.includes(e.name) && e.name !== "Face Pull").map(e => e.sets);
  const pressSets = ex.filter(e => T.HORIZ_PUSH.includes(e.name)).map(e => e.sets);
  eq(`${day}: 4 row sets, 3 press sets`, [rowSets, pressSets], [[4], [3]]);
}
eq("thoracic work earns no working-set credit", T.getMuscleWeeklySets([{ log: three("Thoracic Extension") }]), {});
eq("...and does not pre-fatigue the row", T.preFatigue("Dumbbell Row",["Thoracic Extension"]).pct, 0);
eq("the C finisher is EZ Bar 21s", fb("Full Body C").at(-1).name, "EZ Bar 21s");

// ── Test 29: built-in swaps ──────────────────────────────────────────────────
console.log("\n📋 TEST 29: Built-In Swaps Respect The Managed Conditions");
const allDb = Object.values(T.EXERCISE_DB).flat();
const groupNames = [...new Set(Object.values(T.ALT_GROUPS).flat())];
eq("every swap exercise exists in the DB", groupNames.filter(n => !allDb.some(e => e.name === n)), []);
const NEW_SWAP_EX = ["EZ Bar 21s","Barbell 21s","Hammer Curl","Concentration Curl","Chest-Supported DB Row","Pause DB Row",
  "Resistance Band Row","Band Lat Pulldown","Negative Chin-Up","Prone Reverse Fly","Wall Slide","Tempo DB Bench","Deficit Push-Up",
  "Banded Tricep Pushdown","Lean-Away Lateral Raise","Step-Up","Hip Thrust","Band Leg Curl","Bird Dog","Suitcase Carry"];
eq("every new exercise has full technique cues", NEW_SWAP_EX.filter(n => ["setup","movement","feel","mistake"].some(f => !T.TECHNIQUE[n]?.[f])), []);
eq("every new exercise has a movers entry for volume credit", NEW_SWAP_EX.filter(n => !Object.keys(T.getMuscleWeeklySets([{ log: three(n) }])).length), []);
eq("no group holds a banned lift", groupNames.filter(n => ["Barbell Row","Barbell Bent-Over Row","Barbell Good Morning","Overhead Press","Dumbbell Shoulder Press","EZ Bar Upright Row","Ab Wheel Rollout","Barbell Deadlift"].includes(n)), []);
const FULL_EQ = [...DATA.equipment, "abwheel"];
const spineOffered = groupNames.flatMap(n => T.swapOptions(n, FULL_EQ, "Full Body B").map(e => e.name)).filter(T.isLoadedSpine);
eq("no group swap offers a loaded-spine lift", [...new Set(spineOffered)], []);
const everySlot = ["Full Body A","Full Body B","Full Body C"].flatMap(d => fb(d).map(e => [d, e.name, T.swapOptions(e.name, FULL_EQ, d).length]));
eq("every slot in A/B/C has at least one swap", everySlot.filter(([, , n]) => !n), []);
ok("swaps are limited to the equipment on hand", T.swapOptions("Face Pull", ["bodyweight"], "Full Body A").every(e => e.eq.includes("bodyweight")));
eq("the day's template alternatives come first", T.swapOptions("Romanian Deadlift", FULL_EQ, "Full Body C").slice(0,2).map(e => e.name), ["Single-Leg RDL","Barbell Deadlift"]);
eq("every band lift logs without a load type", T.BAND_EX.filter(n => T.loadTypeOf(n) !== "bw"), []);
eq("new exercises map to their muscle", [T.EXERCISE_TO_MUSCLE_GROUP["Chest-Supported DB Row"], T.EXERCISE_TO_MUSCLE_GROUP["Hip Thrust"], T.EXERCISE_TO_MUSCLE_GROUP["Wall Slide"]], ["back","glutes","lowerTraps"]);

// ── Finish by 21:30 ───────────────────────────────────────────────────────────
console.log("\nTest 30: Short versions keep the posture and disc rules");
const RR = T.REP_RANGES.hypertrophy;
const tierDay = (d, tier) => T.trimForTime(T.getExercisesForDay(d, FULL_EQ, "hypertrophy", {}, "Intermediate", "weights"), tier);
const setCount = (list, names) => list.filter(e => names.includes(e.name)).reduce((a, e) => a + T.setsFor(e, RR, false), 0);
for (const d of ["Full Body A","Full Body B","Full Body C"]) for (const tier of ["short","min"]) {
  const list = tierDay(d, tier), names = list.map(e => e.name), label = d.slice(-1) + " " + tier;
  ok(label + " keeps Thoracic Extension, Face Pull and Y-Raise", ["Thoracic Extension","Face Pull","Prone Y-Raise"].every(n => names.includes(n)));
  ok(label + " drops the lateral raise", !names.includes("Lateral Raise"));
  ok(label + " pulls at least as much as it presses", setCount(list, T.HORIZ_PULL) >= setCount(list, T.HORIZ_PUSH));
  eq(label + " has no half-empty pair beyond one straight set", list.filter(e => e.pair && !list.some(o => o !== e && o.pair === e.pair)).length <= 1, true);
  ok(label + " loaded-spine lift stays within its cap", list.filter(e => T.isLoadedSpine(e.name)).every(e => T.setsFor(e, RR, false) <= 3));
  ok(label + " keeps its main lift", list.some(e => ["Barbell Squat","Bulgarian Split Squat","Romanian Deadlift"].includes(e.name)));
}
eq("the minimum squat is 2 sets", T.setsFor(tierDay("Full Body A","min").find(e => e.name === "Barbell Squat"), RR, false), 2);
eq("a deload never goes below 2 sets", T.setsFor(tierDay("Full Body A","min").find(e => e.name === "Barbell Squat"), RR, true), 2);
const fullA = T.getExercisesForDay("Full Body A", FULL_EQ, "hypertrophy", {}, "Intermediate", "weights");
eq("a lift already started is not dropped", T.trimForTime(fullA, "short", ["Lateral Raise"]).some(e => e.name === "Lateral Raise"), true);
ok("the full day is the same list with no tier", T.trimForTime(fullA, null) === fullA);

console.log("\nTest 31: Time estimates");
for (const d of ["Full Body A","Full Body B","Full Body C"]) {
  const m = [null,"short","min"].map(t => T.estimateMinutes(tierDay(d, t), "hypertrophy", false));
  console.log("   " + d + " full/short/min: " + m.join(" / ") + " min");
  ok(d + " full > short > minimum", m[0] > m[1] && m[1] > m[2]);
  ok(d + " full takes 50-80 min", m[0] >= 50 && m[0] <= 80);
}
const noLog = T.estimateMinutes(fullA, "hypertrophy", false);
const someLog = T.estimateMinutes(fullA, "hypertrophy", false, { "Barbell Squat":[{weight:"84",reps:"7"},{weight:"84",reps:"7"},{weight:"84",reps:"7"}] });
ok("logged sets reduce the time left", someLog < noLog - 8);
eq("a swapped lift counts as done under its new name", T.estimateMinutes(fullA, "hypertrophy", false, { "Goblet Squat":[{reps:"8"},{reps:"8"},{reps:"8"}] }, { "Barbell Squat":{ name:"Goblet Squat" } }) < noLog, true);
const timed = (duration, sets) => ({ date:"2026-11-01", day:"Full Body A", mode:"weights", duration, log:{ "Barbell Squat":Array(sets).fill({reps:"7"}) } });
eq("2 timed sessions are not enough for a pace", T.sessionPace([timed(60,20),timed(60,20)]), null);
eq("the pace is the median minutes per set", T.sessionPace([timed(60,20),timed(40,20),timed(80,20)]), 3);
eq("the real pace replaces the model", T.estimateMinutes(fullA.slice(0,1), "hypertrophy", false, {}, {}, 3), 9);
eq("20:00 leaves 90 minutes", T.minutesUntilFinish(new Date(2026,10,2,20,0)), 90);
eq("22:00 is past it", T.minutesUntilFinish(new Date(2026,10,2,22,0)), -30);
eq("tier advice at each time", [T.suggestTier(70,65,45,35), T.suggestTier(50,65,45,35), T.suggestTier(40,65,45,35), T.suggestTier(20,65,45,35), T.suggestTier(-5,65,45,35)], [null,"short","min","stretch","stretch"]);
eq("the deadline is 21:30", T.LATEST_FINISH, "21:30");

console.log("\nTest 32: Saved sets and cut sessions");
const blank = () => ({ reps:"" });
eq("empty sets go when the target drops", T.fitSets([{reps:"8"},{reps:""},{reps:""},{reps:""}], 3, blank).length, 3);
eq("lifted sets are never removed", T.fitSets([{reps:"8"},{reps:"8"},{reps:"8"},{reps:"8"}], 2, blank).length, 4);
eq("undoing a cut brings the sets back", T.fitSets([{reps:"8"}], 3, blank).length, 3);
eq("no entries yet gives blank sets", T.fitSets([], 3, blank).length, 3);
ok("a draft with a lifted set is open", T.draftIsOpen({ log:{ Squat:[{weight:"84",reps:"7"}] } }));
ok("a pre-filled weight alone is not", !T.draftIsOpen({ log:{ Squat:[{weight:"84",reps:""}] } }));
ok("no draft is not open", !T.draftIsOpen(null));
const vol = (v, trim) => ({ date:"2026-10-01", day:"Full Body A", mode:"weights", volume:v, ...(trim ? { trim } : {}), log:{ "Barbell Bench Press":[{weight:String(v),reps:"10",rpe:"2"}] } });
eq("a cut session does not count as a falling trend", T.detectTrends("Full Body A", [vol(30,"short"),vol(50),vol(70),vol(60)], 83).some(t => t.type === "volume"), false);
eq("real falling volume still counts", T.detectTrends("Full Body A", [vol(40),vol(50),vol(60),vol(70)], 83).some(t => t.type === "volume"), true);
eq("a cut session does not trigger a deload", T.shouldDeload([vol(30,"short"),vol(50),vol(60),vol(70)]), false);

const twoSets = { "Barbell Squat":[{weight:"84",reps:"10",rpe:"3"},{weight:"84",reps:"10",rpe:"3"}] };
const risen = { "Barbell Squat":{ targetWeight:89, targetReps:6, targetRIR:3 } };
eq("a cut session holds the load on a spine lift", [T.holdSpineLoad(risen, twoSets)["Barbell Squat"].targetWeight, T.holdSpineLoad(risen, twoSets)["Barbell Squat"].targetReps], [84, 10]);
eq("all 3 sets still earn the increase", T.holdSpineLoad(risen, { "Barbell Squat":[...twoSets["Barbell Squat"], {weight:"84",reps:"10",rpe:"3"}] })["Barbell Squat"].targetWeight, 89);
eq("other lifts are not held", T.holdSpineLoad({ "Dumbbell Row":{ targetWeight:24 } }, { "Dumbbell Row":[{weight:"22",reps:"12"}] })["Dumbbell Row"].targetWeight, 24);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`✅ PASSED: ${pass}     ❌ FAILED: ${failures.length}`);
if (failures.length) {
  console.log("\n--- FAILURES ---");
  failures.forEach(f => console.log("❌ " + f));
}
console.log("═".repeat(60));
process.exit(failures.length ? 1 : 0);
