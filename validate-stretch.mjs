// HomeForge Stretch Validator
// Run: node validate-stretch.mjs
//
// Guards the stretch section's structural invariants. The library and the four
// routines are hand-maintained data, so the failure modes are data failures:
// a routine naming an exercise that no longer exists, an exercise missing the
// fields its metricType needs, a routine quietly growing past the longest time
// the UI offers, a focus that can never be suggested, or the three focused
// routines drifting back into overlapping with each other.
//
// Like validate-modes.mjs, this imports the real data out of homeforge.jsx
// rather than keeping a copy, so it cannot drift.

import * as esbuild from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

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
export const __s = {
  EXERCISES, STRETCH_ROUTINES, REGION_LABEL, SPLITS,
  getStretchItems, getStretchAlternatives, suggestStretchFocus, metricHeader,
};
`;

const outdir = join(ROOT, "node_modules", ".cache", "homeforge");
mkdirSync(outdir, { recursive: true });
const outfile = join(outdir, "stretch-bundle.mjs");

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

const T = (await import(pathToFileURL(outfile).href)).__s;

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

const { EXERCISES, STRETCH_ROUTINES } = T;
const exNames = Object.keys(EXERCISES);
const focusKeys = Object.keys(STRETCH_ROUTINES);
const FOCUSED = focusKeys.filter(k => k !== "full_body");

// Longest option offered by the time selector in StretchSession.
const MAX_MINUTES = 20;

// Duration of one exercise as the budget maths counts it.
const durationOf = ex => ex.sec * (ex.perSide ? 2 : 1) * (ex.sets || 1);
const routineSeconds = key =>
  STRETCH_ROUTINES[key].items.reduce((a, n) => a + durationOf(EXERCISES[n]), 0);

// ── Test 1: every routine item resolves ───────────────────────────────────────
console.log("\n📋 TEST 1: Routine Items Resolve To Real Exercises");
for (const key of focusKeys) {
  eq(`${key}: every item exists in EXERCISES`,
     STRETCH_ROUTINES[key].items.filter(n => !EXERCISES[n]), []);
}
eq("no routine lists the same exercise twice",
   focusKeys.filter(k => new Set(STRETCH_ROUTINES[k].items).size !== STRETCH_ROUTINES[k].items.length), []);

// ── Test 2: schema completeness ───────────────────────────────────────────────
console.log("\n📋 TEST 2: Every Exercise Has The Fields Its metricType Needs");
const CUE_FIELDS = ["setup", "movement", "feel", "mistake"];
const REQUIRED = {
  hold:     ["holdSeconds"],
  flow:     ["holdSeconds"],
  reps:     ["sets", "reps"],
  repsHold: ["reps", "holdSeconds"],
};
eq("every metricType is one the card can render",
   exNames.filter(n => !REQUIRED[EXERCISES[n].metricType]), []);
eq("every exercise has its metricType's numeric fields",
   exNames.filter(n => {
     const ex = EXERCISES[n];
     return (REQUIRED[ex.metricType] || []).some(f => typeof ex[f] !== "number");
   }), []);
eq("every exercise has setup/movement/feel/mistake",
   exNames.filter(n => CUE_FIELDS.some(f => typeof EXERCISES[n][f] !== "string" || !EXERCISES[n][f].trim())), []);
eq("every exercise declares region, sec, perSide and eq",
   exNames.filter(n => {
     const ex = EXERCISES[n];
     return !["upper","lower","hips"].includes(ex.region)
         || typeof ex.sec !== "number" || ex.sec <= 0
         || typeof ex.perSide !== "boolean"
         || !Array.isArray(ex.eq) || ex.eq.length === 0;
   }), []);
eq("metricHeader never renders 'undefined'",
   exNames.filter(n => /undefined|NaN/.test(T.metricHeader(EXERCISES[n]).value)), []);

// ── Test 3: routines fit the time the UI offers ───────────────────────────────
console.log("\n📋 TEST 3: No Routine Exceeds The Longest Time Option");
for (const key of focusKeys) {
  const secs = routineSeconds(key);
  ok(`${key} fits in ${MAX_MINUTES} min (${(secs/60).toFixed(1)} min)`,
     secs <= MAX_MINUTES * 60, `${secs}s > ${MAX_MINUTES*60}s`);
}

// ── Test 4: the focused routines never overlap ────────────────────────────────
console.log("\n📋 TEST 4: The Three Focused Routines Are Disjoint");
for (let i = 0; i < FOCUSED.length; i++) {
  for (let j = i + 1; j < FOCUSED.length; j++) {
    const a = STRETCH_ROUTINES[FOCUSED[i]].items, b = STRETCH_ROUTINES[FOCUSED[j]].items;
    eq(`${FOCUSED[i]} ∩ ${FOCUSED[j]} is empty`, a.filter(n => b.includes(n)), []);
  }
}
ok("full_body draws from all three regions",
   new Set(STRETCH_ROUTINES.full_body.items.map(n => EXERCISES[n].region)).size === 3);

// ── Test 5: every focus is reachable ──────────────────────────────────────────
console.log("\n📋 TEST 5: Suggestion Can Reach Every Focused Routine");
// afterDay lists must not overlap — suggestStretchFocus returns the FIRST match,
// so a routine whose days are all claimed earlier can never be suggested.
const dayOwner = {};
const contested = [];
for (const key of focusKeys) {
  for (const d of STRETCH_ROUTINES[key].afterDay) {
    if (dayOwner[d]) contested.push(`${d} (${dayOwner[d]} + ${key})`);
    else dayOwner[d] = key;
  }
}
eq("no training day is claimed by two routines", contested, []);
for (const key of FOCUSED) {
  const days = STRETCH_ROUTINES[key].afterDay;
  ok(`${key} is suggested after ${days[0]}`,
     days.length > 0 && T.suggestStretchFocus([{ day: days[0] }]) === key,
     `got ${T.suggestStretchFocus([{ day: days[0] || "?" }])}`);
}
eq("empty history falls back to full_body", T.suggestStretchFocus([]), "full_body");
eq("a Stretch session is skipped when reading the last day",
   T.suggestStretchFocus([{ day:"Stretch" }, { day:"Legs" }]), "hips_legs");

// ── Test 6: every split day maps somewhere, and spares exist for swapping ─────
console.log("\n📋 TEST 6: Split Coverage And Swap Depth");
const allSplitDays = [...new Set(Object.values(T.SPLITS).flat())].filter(d => d !== "REST");
eq("every split day maps to a routine", allSplitDays.filter(d => !dayOwner[d]), []);
for (const region of ["upper","lower","hips"]) {
  const inRegion = exNames.filter(n => EXERCISES[n].region === region);
  const focused = FOCUSED.find(k => STRETCH_ROUTINES[k].items.every(n => EXERCISES[n].region === region));
  const spares = focused ? inRegion.filter(n => !STRETCH_ROUTINES[focused].items.includes(n)) : [];
  ok(`${region}: ${inRegion.length} exercises, ${spares.length} spare for swaps`,
     spares.length >= 2, `only ${spares.length} spare — swapping will repeat the session`);
}

// ── Test 7: swap suggestions avoid what is already scheduled ──────────────────
console.log("\n📋 TEST 7: Swap Suggestions Prefer Work Not Already In The Session");
for (const key of FOCUSED) {
  const items = STRETCH_ROUTINES[key].items;
  const alts = T.getStretchAlternatives(items[0], key, items);
  ok(`${key}: first suggestion is not already in the session`,
     alts.length > 0 && !alts[0].alreadyInSession,
     JSON.stringify(alts.map(a => a.name)));
  ok(`${key}: first suggestion is from the same region`,
     alts.length > 0 && alts[0].region === EXERCISES[items[0]].region,
     `${alts[0] && alts[0].region} vs ${EXERCISES[items[0]].region}`);
  eq(`${key}: never suggests the exercise being replaced`,
     alts.filter(a => a.name === items[0]), []);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`✅ PASSED: ${pass}     ❌ FAILED: ${failures.length}`);
if (failures.length) {
  console.log("\n--- FAILURES ---");
  failures.forEach(f => console.log("❌ " + f));
}
console.log("═".repeat(60));
process.exit(failures.length ? 1 : 0);
