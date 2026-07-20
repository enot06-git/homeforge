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

// ── Test 6: the weights progression rule is unchanged ─────────────────────────
console.log("\n📋 TEST 6: Weights Progression Rule (avgReps >= 10 AND RIR <= 3)");
const w = (log) => T.calcNextSessionPlan("Push", log, "hypertrophy", {...DATA, activeMode:"weights"}).plan["Barbell Bench Press"].targetWeight;
eq("60kg, avgReps 10, RIR 2 → +5kg", w(weightsSess.log), 65);
eq("60kg, avgReps 8, RIR 2 → held (reps climb first)", w({"Barbell Bench Press":[{weight:"60",reps:"8",rpe:"2"},{weight:"60",reps:"8",rpe:"2"}]}), 60);
eq("60kg, RIR 5 → +10kg regardless of reps", w({"Barbell Bench Press":[{weight:"60",reps:"8",rpe:"5"}]}), 70);
eq("60kg, RIR 0 → -5kg", w({"Barbell Bench Press":[{weight:"60",reps:"12",rpe:"0"}]}), 55);

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
const badCues = modeExercises.filter(n => !Array.isArray(T.TECHNIQUE[n]) || T.TECHNIQUE[n].length < 3);
eq("each has at least 3 cues", badCues, []);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`✅ PASSED: ${pass}     ❌ FAILED: ${failures.length}`);
if (failures.length) {
  console.log("\n--- FAILURES ---");
  failures.forEach(f => console.log("❌ " + f));
}
console.log("═".repeat(60));
process.exit(failures.length ? 1 : 0);
