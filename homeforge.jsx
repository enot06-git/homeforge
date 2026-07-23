import { useState, useEffect, useRef, useMemo, Component } from "react";

// ── Global styles ─────────────────────────────────────────────────────────────
const GLOBAL_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&family=Barlow:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f0f0f;--bg2:#181818;--bg3:#222;--bg4:#2a2a2a;--border:#2e2e2e;
  --amber:#f59e0b;--red:#ef4444;--green:#22c55e;--blue:#3b82f6;--purple:#a855f7;
  --text:#e8e8e8;--muted:#888;--on-accent:#0a0a0a;
  --font-h:'Barlow Condensed',sans-serif;--font-b:'Barlow',sans-serif;--font-m:'IBM Plex Mono',monospace;
}
body{background:var(--bg);color:var(--text);font-family:var(--font-b);overflow-x:hidden;}
button{font-family:inherit;cursor:pointer;}
button:focus-visible{outline:2px solid var(--amber);outline-offset:2px;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:var(--bg2);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes barRise{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes shimmer{0%,100%{opacity:.4}50%{opacity:.9}}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important;}}
`;
const injectStyle = () => {
  if (document.getElementById("hf2")) return;
  const el = document.createElement("style"); el.id = "hf2"; el.textContent = GLOBAL_STYLE;
  document.head.appendChild(el);
};

// ── Pre-filled inventory from confirmed home gym scan ─────────────────────────
const PREFILLED_DATA = {
  equipment: ["bodyweight","dumbbells","barbell","ezbar","pullupbar","dipbelt","squatstands","bench","bands","mat","abwheel","balancedisc"],
  dumbbellWeights: "1, 2, 2.5, 3.5, 4.5, 5, 5.5, 6.5, 8, 9, 10, 11.5, 13.5, 16, 18, 20.5, 22.5, 24",
  dumbbellMax: "24",
  barType: "custom",
  barWeight: "14",
  barbellPlates: "2x20, 2x15, 2x10, 2x5, 2x2.5",
  barbellMax: "119",
  ezbarWeight: "8",
  ezbarPlates: "2x20, 2x15, 2x10, 2x5, 2x2.5",
  ezbarMax: "113",
  dipbeltMax: "20",
  // Pre-filled profile
  age: "49",
  weight: "83",
  height: "176",
  bodyWeight: "83",
  level: "Intermediate",
  goal: "hypertrophy",
  days: "3",
};

// ── Plate Calculator ──────────────────────────────────────────────────────────
// Parse plate string like "2x20, 2x15, 2x10, 2x5, 2x2.5" into sorted pairs
function parsePlates(plateStr) {
  if (!plateStr) return [];
  return plateStr.split(",").map(p => {
    const m = p.trim().match(/(\d+)x([\d.]+)/);
    return m ? { pairs: parseInt(m[1]), kg: parseFloat(m[2]) } : null;
  }).filter(Boolean).sort((a,b) => b.kg - a.kg);
}

// Find best achievable plate combination for target load (total - bar)
function calcPlates(targetTotal, barWeight, plateStr) {
  const bar = parseFloat(barWeight) || 14;
  const plates = parsePlates(plateStr);
  let remaining = (targetTotal - bar) / 2; // weight per side
  if (remaining <= 0) return { total: bar, plates: [], perSide: [], bar };
  const used = [];
  for (const p of plates) {
    if (remaining <= 0) break;
    const canUse = Math.min(p.pairs, Math.floor(remaining / p.kg));
    if (canUse > 0) { used.push({ kg: p.kg, count: canUse }); remaining -= canUse * p.kg; }
  }
  const totalAchieved = bar + used.reduce((a,p) => a + p.kg * p.count * 2, 0);
  return { total: totalAchieved, perSide: used, bar };
}

// Format weight display based on exercise type
function formatWeightDisplay(exName, weight, data) {
  if (!weight || parseFloat(weight) === 0) return null;
  const w = parseFloat(weight);
  const useBarbell = ["Barbell Bench Press","Barbell Squat","Barbell Deadlift","Barbell Row","Overhead Press","Romanian Deadlift"].includes(exName);
  const useEZ = ["EZ Bar Curl","EZ Bar Skull Crusher","EZ Bar Reverse Curl","EZ Bar Upright Row","Close-Grip Bench Press"].includes(exName);
  const useDipBelt = ["Weighted Pull-Up","Weighted Chin-Up","Weighted Dip","Weighted Push-Up","Neutral Grip Pull-Up"].includes(exName);

  if (useBarbell) {
    const { total, perSide, bar } = calcPlates(w, data.barWeight || "14", data.barbellPlates);
    const plateStr = perSide.map(p => `${p.count}×${p.kg}`).join(" + ");
    return { total: total.toFixed(1), detail: `${bar}kg bar + ${plateStr ? plateStr + " per side" : "no plates"}`, type: "barbell" };
  }
  if (useEZ) {
    const { total, perSide, bar } = calcPlates(w, data.ezbarWeight || "8", data.ezbarPlates);
    const plateStr = perSide.map(p => `${p.count}×${p.kg}`).join(" + ");
    return { total: total.toFixed(1), detail: `${bar}kg EZ bar + ${plateStr ? plateStr + " per side" : "no plates"}`, type: "ezbar" };
  }
  if (useDipBelt) {
    return { total: `+${w}`, detail: `BW + ${w}kg belt`, type: "dipbelt" };
  }
  // Dumbbells
  return { total: `2×${w}`, detail: `${w}kg per hand`, type: "dumbbell" };
}

// Check if this is the first session of the week (for body weight prompt)
function isFirstSessionThisWeek(history) {
  const today = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay()); weekStart.setHours(0,0,0,0);
  return !(history||[]).some(h => new Date(h.date) >= weekStart);
}
const EQUIPMENT_LIST = [
  { id: "bodyweight",  icon: "🤸", label: "Bodyweight" },
  { id: "bands",       icon: "🔁", label: "Bands" },
  { id: "dumbbells",   icon: "🏋️", label: "Dumbbells" },
  { id: "kettlebell",  icon: "⚫", label: "Kettlebell" },
  { id: "pullupbar",   icon: "🔝", label: "Pull-up Bar" },
  { id: "dipbelt",     icon: "🪝", label: "Dip Belt" },
  { id: "barbell",     icon: "🏗️", label: "Barbell" },
  { id: "ezbar",       icon: "〰️", label: "EZ Curl Bar" },
  { id: "squatstands", icon: "🔱", label: "Squat Stands" },
  { id: "bench",       icon: "🛋️", label: "Bench" },
  { id: "mat",         icon: "🟩", label: "Mat" },
  { id: "abwheel",     icon: "⭕", label: "Ab Wheel" },
  { id: "balancedisc", icon: "🩷", label: "Balance Disc" },
];

const GOALS = [
  { id: "strength",    label: "Strength",       icon: "💪", desc: "Max force, low reps" },
  { id: "hypertrophy", label: "Muscle Size",    icon: "📈", desc: "Moderate reps & volume" },
  { id: "stamina",     label: "Stamina",        icon: "🔥", desc: "High reps, circuits" },
  { id: "fat_loss",    label: "Fat Loss",       icon: "⚡", desc: "Density + cardio" },
  { id: "general",     label: "General Fitness",icon: "🎯", desc: "Balanced approach" },
];

const REP_RANGES = {
  strength:    { sets: 5, reps: "3-5",  restSec: 240, note: "Heavy load, full rest", rirMin: 1 },
  hypertrophy: { sets: 4, reps: "8-12", restSec: 90,  note: "Controlled tempo",      rirMin: 2 },
  stamina:     { sets: 3, reps: "15-25",restSec: 40,  note: "Short rest, burn",      rirMin: 1 },
  fat_loss:    { sets: 4, reps: "12-15",restSec: 30,  note: "Circuit style",         rirMin: 2 },
  general:     { sets: 3, reps: "10-15",restSec: 60,  note: "Balanced volume",       rirMin: 2 },
};

const SPLITS = {
  1: ["Full Body"],
  2: ["Full Body A","Full Body B"],
  3: ["Push","Pull","Legs"],
  4: ["Upper A","Lower A","Upper B","Lower B"],
  5: ["Push","Pull","Legs","Upper","Full Body"],
  6: ["Chest","Back","Legs","Shoulders","Arms","Full Body"],
  7: ["Chest","Back","Legs","Shoulders","Arms","Full Body","REST"],
};

const SPLIT_MAP = {
  "Push":["Push","Core"],"Pull":["Pull","Core"],"Legs":["Legs","Core"],
  "Full Body":["Push","Pull","Legs","Full Body","Core"],
  "Full Body A":["Push","Pull","Core"],"Full Body B":["Legs","Full Body","Core"],
  "Upper A":["Push","Pull","Core"],"Upper B":["Upper","Core"],
  "Lower A":["Legs","Core"],"Lower B":["Legs","Core"],
  "Chest":["Push","Core"],"Back":["Pull","Core"],
  "Shoulders":["Push","Core"],"Arms":["Pull","Push","Core"],
  "Upper":["Upper","Core"],"REST":[],
};

const MUSCLE_MAP = {
  "Push":["chest","shoulders","triceps"],"Pull":["back","biceps","hamstrings","glutes"],
  "Legs":["quads","hamstrings","glutes","calves"],
  "Full Body":["chest","back","quads","hamstrings"],
  "Full Body A":["chest","back","triceps","biceps"],"Full Body B":["quads","hamstrings","glutes"],
  "Upper A":["chest","back","shoulders","triceps","biceps"],
  "Upper B":["chest","back","shoulders"],"Lower A":["quads","hamstrings","glutes"],
  "Lower B":["quads","hamstrings","glutes"],"Chest":["chest","triceps"],
  "Back":["back","biceps"],"Shoulders":["shoulders","triceps"],
  "Arms":["biceps","triceps"],"Upper":["chest","back","shoulders"],"REST":[],
};

const EXERCISE_DB = {
  Push:[
    { name:"Push-Up",               eq:["bodyweight"],                  muscle:"Chest/Triceps",  unilateral:false },
    { name:"Diamond Push-Up",       eq:["bodyweight"],                  muscle:"Triceps",         unilateral:false },
    { name:"Pike Push-Up",          eq:["bodyweight"],                  muscle:"Shoulders",       unilateral:false },
    { name:"Weighted Push-Up",      eq:["bodyweight","dipbelt"],        muscle:"Chest/Triceps",  unilateral:false },
    { name:"Dumbbell Bench Press",  eq:["dumbbells","bench"],           muscle:"Chest",           unilateral:false },
    { name:"Dumbbell Shoulder Press",eq:["dumbbells"],                  muscle:"Shoulders",       unilateral:false },
    { name:"Single-Arm DB Press",   eq:["dumbbells"],                   muscle:"Chest/Shoulders", unilateral:true  },
    { name:"Tricep Dips",           eq:["pullupbar","bodyweight"],      muscle:"Triceps",         unilateral:false },
    { name:"Weighted Dip",          eq:["pullupbar","dipbelt"],         muscle:"Chest/Triceps",  unilateral:false },
    { name:"Resistance Band Press", eq:["bands"],                       muscle:"Chest",           unilateral:false },
    { name:"Dumbbell Fly",           eq:["dumbbells","bench"],           muscle:"Chest",           unilateral:false },
    { name:"Barbell Bench Press",   eq:["barbell","squatstands","bench"],muscle:"Chest",           unilateral:false },
    { name:"Overhead Press",        eq:["barbell","squatstands"],       muscle:"Shoulders",       unilateral:false },
    { name:"EZ Bar Skull Crusher",  eq:["ezbar","bench"],               muscle:"Triceps",         unilateral:false },
    { name:"Close-Grip Bench Press",eq:["ezbar","bench"],               muscle:"Chest/Triceps",  unilateral:false },
  ],
  Pull:[
    { name:"Assisted Pull-Up",       eq:["pullupbar","bands"],           muscle:"Back/Biceps",     unilateral:false },
    { name:"Pull-Up",                eq:["pullupbar"],                   muscle:"Back/Biceps",     unilateral:false },
    { name:"Chin-Up",               eq:["pullupbar"],                   muscle:"Biceps/Back",     unilateral:false },
    { name:"Neutral Grip Pull-Up",  eq:["pullupbar"],                   muscle:"Back/Biceps",     unilateral:false },
    { name:"Weighted Pull-Up",      eq:["pullupbar","dipbelt"],         muscle:"Back/Biceps",     unilateral:false },
    { name:"Weighted Chin-Up",      eq:["pullupbar","dipbelt"],         muscle:"Biceps/Back",     unilateral:false },
    { name:"Inverted Row",          eq:["pullupbar","bodyweight"],      muscle:"Upper Back",       unilateral:false },
    { name:"Dumbbell Row",          eq:["dumbbells"],                   muscle:"Back",            unilateral:true  },
    { name:"Dumbbell Curl",         eq:["dumbbells"],                   muscle:"Biceps",          unilateral:true  },
    { name:"Band Pull-Apart",       eq:["bands"],                       muscle:"Rear Delt",       unilateral:false },
    { name:"Barbell Row",           eq:["barbell"],                     muscle:"Back",            unilateral:false },
    { name:"EZ Bar Curl",           eq:["ezbar"],                       muscle:"Biceps",          unilateral:false },
    { name:"EZ Bar Reverse Curl",   eq:["ezbar"],                       muscle:"Biceps/Forearms", unilateral:false },
    { name:"EZ Bar Upright Row",    eq:["ezbar"],                       muscle:"Shoulders/Traps", unilateral:false },
  ],
  Legs:[
    { name:"Squat",                 eq:["bodyweight"],                  muscle:"Quads/Glutes",    unilateral:false },
    { name:"Bulgarian Split Squat", eq:["bodyweight","bench"],          muscle:"Quads",           unilateral:true  },
    { name:"Single-Leg Glute Bridge",eq:["bodyweight","mat"],           muscle:"Glutes",          unilateral:true  },
    { name:"Romanian Deadlift",     eq:["dumbbells"],                   muscle:"Hamstrings",      unilateral:false },
    { name:"Single-Leg RDL",        eq:["dumbbells"],                   muscle:"Hamstrings",      unilateral:true  },
    { name:"Goblet Squat",          eq:["dumbbells"],                   muscle:"Quads",           unilateral:false },
    { name:"Barbell Squat",         eq:["barbell","squatstands"],       muscle:"Quads/Glutes",    unilateral:false },
    { name:"Barbell Deadlift",      eq:["barbell"],                     muscle:"Full Posterior",  unilateral:false },
    { name:"Banded Squat",          eq:["bands"],                       muscle:"Quads/Glutes",    unilateral:false },
    { name:"Calf Raise",            eq:["bodyweight"],                  muscle:"Calves",          unilateral:false },
    { name:"Lunge",                 eq:["bodyweight"],                  muscle:"Quads/Glutes",    unilateral:true  },
    { name:"Balance Disc Squat",    eq:["balancedisc"],                 muscle:"Quads/Stability", unilateral:false },
    { name:"Single-Leg Balance Disc",eq:["balancedisc"],                muscle:"Glutes/Stability",unilateral:true  },
  ],
  "Full Body":[
    { name:"Burpee",                eq:["bodyweight"],                  muscle:"Full Body",        unilateral:false },
    { name:"Clean & Press",         eq:["dumbbells"],                   muscle:"Full Body",        unilateral:false },
    { name:"Thruster",              eq:["dumbbells","barbell"],         muscle:"Full Body",        unilateral:false },
    { name:"Mountain Climber",      eq:["bodyweight","mat"],            muscle:"Core/Cardio",      unilateral:false },
    { name:"EZ Bar Complex",        eq:["ezbar"],                       muscle:"Full Body",        unilateral:false },
  ],
  Upper:[
    { name:"Push-Up",               eq:["bodyweight"],                  muscle:"Chest",           unilateral:false },
    { name:"Dumbbell Row",          eq:["dumbbells"],                   muscle:"Back",            unilateral:true  },
    { name:"Overhead Press",        eq:["dumbbells","barbell"],         muscle:"Shoulders",       unilateral:false },
    { name:"Dumbbell Curl",         eq:["dumbbells"],                   muscle:"Biceps",          unilateral:true  },
    { name:"Tricep Overhead Ext",   eq:["dumbbells"],                   muscle:"Triceps",         unilateral:false },
    { name:"EZ Bar Curl",           eq:["ezbar"],                       muscle:"Biceps",          unilateral:false },
  ],
  Core:[
    { name:"Plank",              eq:["bodyweight","mat"],  muscle:"Core",              unilateral:false, timed:true,  timedSec:60  },
    { name:"Dead Bug",           eq:["bodyweight","mat"],  muscle:"Core",              unilateral:false, repOverride:"20-30" },
    { name:"Ab Wheel Rollout",   eq:["abwheel"],           muscle:"Core",              unilateral:false, repOverride:"8-15"  },
    { name:"Bicycle Crunch",     eq:["bodyweight","mat"],  muscle:"Core",              unilateral:false, repOverride:"20-30" },
    { name:"Balance Disc Plank", eq:["balancedisc"],       muscle:"Core/Stability",    unilateral:false, timed:true,  timedSec:45  },
    { name:"Mountain Climber",   eq:["bodyweight","mat"],  muscle:"Core/Cardio",       unilateral:false, timed:true,  timedSec:30  },
    { name:"Thoracic Extension", eq:["bench","bodyweight"],muscle:"Thoracic/Posture",  unilateral:false, repOverride:"10-12", repsOnly:true },
  ],
};

// ── Workout modes ─────────────────────────────────────────────────────────────
// Weights mode drives load progression. TRX and Bodyweight modes log reps + RIR
// only — their sessions are tagged with `mode` and are excluded from every
// weight-based calculation so they can never move a barbell/dumbbell target.
const WORKOUT_MODES = [
  { id:"weights", icon:"🏋️", label:"Weights", desc:"Load progression" },
  { id:"trx",     icon:"🪢", label:"TRX",     desc:"Reps + RIR" },
  { id:"bw",      icon:"🤸", label:"BW",      desc:"Reps + RIR" },
];

const DEFAULT_MODE = "weights";
const isWeightsMode = (mode) => !mode || mode === "weights";
const modeLabel = (mode) => (WORKOUT_MODES.find(m => m.id === (mode || DEFAULT_MODE)) || WORKOUT_MODES[0]).label;

// Sessions that are allowed to influence weight progression.
// Legacy sessions have no `mode` field and count as weights.
const weightsHistory = (history) => (history || []).filter(h => isWeightsMode(h.mode));
// Sessions belonging to one mode — used for "last session" and rep progression.
const historyForMode = (history, mode) =>
  (history || []).filter(h => (h.mode || DEFAULT_MODE) === (mode || DEFAULT_MODE));

// Where a next-session plan lives. Weights keeps the bare dayType key it always
// used (so existing stored plans keep working); other modes get their own
// namespace, which is what stops a TRX session from re-targeting a barbell.
const planKeyFor = (dayType, mode) => isWeightsMode(mode) ? dayType : `${mode}:${dayType}`;

// Alternative exercise lists per mode, keyed by the same categories as SPLIT_MAP
// so every split (Push/Pull/Legs, Upper/Lower, Full Body …) resolves for free.
// `repOverride` is what makes ExerciseCard drop the weight input and keep reps+RIR.
const MODE_EXERCISE_DB = {
  trx: {
    Push:[
      { name:"TRX Chest Press",      eq:["trx"], muscle:"Chest",           unilateral:false, repOverride:"8-15"  },
      { name:"TRX Chest Fly",        eq:["trx"], muscle:"Chest",           unilateral:false, repOverride:"10-15" },
      { name:"TRX Tricep Extension", eq:["trx"], muscle:"Triceps",         unilateral:false, repOverride:"10-15" },
      { name:"TRX Pike Push-Up",     eq:["trx"], muscle:"Shoulders",       unilateral:false, repOverride:"8-12"  },
    ],
    Pull:[
      { name:"TRX Low Row",          eq:["trx"], muscle:"Back",            unilateral:false, repOverride:"8-15"  },
      { name:"TRX High Row",         eq:["trx"], muscle:"Upper Back",      unilateral:false, repOverride:"10-15" },
      { name:"TRX Y-Fly",            eq:["trx"], muscle:"Rear Delt",       unilateral:false, repOverride:"12-15" },
      { name:"TRX Bicep Curl",       eq:["trx"], muscle:"Biceps",          unilateral:false, repOverride:"10-15" },
    ],
    Legs:[
      { name:"TRX Squat",            eq:["trx"], muscle:"Quads/Glutes",    unilateral:false, repOverride:"12-20" },
      { name:"TRX Bulgarian Split Squat", eq:["trx"], muscle:"Quads",      unilateral:true,  repOverride:"8-12"  },
      { name:"TRX Hamstring Curl",   eq:["trx"], muscle:"Hamstrings",      unilateral:false, repOverride:"10-15" },
      { name:"TRX Hip Hinge",        eq:["trx"], muscle:"Glutes",          unilateral:false, repOverride:"12-15" },
    ],
    Upper:[
      { name:"TRX Chest Press",      eq:["trx"], muscle:"Chest",           unilateral:false, repOverride:"8-15"  },
      { name:"TRX Low Row",          eq:["trx"], muscle:"Back",            unilateral:false, repOverride:"8-15"  },
      { name:"TRX Y-Fly",            eq:["trx"], muscle:"Rear Delt",       unilateral:false, repOverride:"12-15" },
      { name:"TRX Bicep Curl",       eq:["trx"], muscle:"Biceps",          unilateral:false, repOverride:"10-15" },
    ],
    "Full Body":[
      { name:"TRX Squat to Row",     eq:["trx"], muscle:"Full Body",       unilateral:false, repOverride:"10-15" },
      { name:"TRX Burpee",           eq:["trx"], muscle:"Full Body",       unilateral:false, repOverride:"8-12"  },
      { name:"TRX Mountain Climber", eq:["trx"], muscle:"Core/Cardio",     unilateral:false, timed:true, timedSec:30 },
    ],
    Core:[
      { name:"TRX Plank",            eq:["trx"], muscle:"Core",            unilateral:false, timed:true, timedSec:45 },
      { name:"TRX Pike",             eq:["trx"], muscle:"Core",            unilateral:false, repOverride:"8-15"  },
      { name:"TRX Body Saw",         eq:["trx"], muscle:"Core",            unilateral:false, repOverride:"8-12"  },
    ],
  },
  bw: {
    Push:[
      { name:"Push-Up",              eq:["bodyweight"],             muscle:"Chest/Triceps", unilateral:false, repOverride:"10-25" },
      { name:"Pike Push-Up",         eq:["bodyweight"],             muscle:"Shoulders",     unilateral:false, repOverride:"8-15"  },
      { name:"Diamond Push-Up",      eq:["bodyweight"],             muscle:"Triceps",       unilateral:false, repOverride:"8-20"  },
      { name:"Tricep Dips",          eq:["pullupbar","bodyweight"], muscle:"Triceps",       unilateral:false, repOverride:"8-20"  },
    ],
    Pull:[
      { name:"Pull-Up",              eq:["pullupbar"],              muscle:"Back/Biceps",   unilateral:false, repOverride:"4-12"  },
      { name:"Chin-Up",              eq:["pullupbar"],              muscle:"Biceps/Back",   unilateral:false, repOverride:"4-12"  },
      { name:"Inverted Row",         eq:["pullupbar","bodyweight"], muscle:"Upper Back",    unilateral:false, repOverride:"8-20"  },
      { name:"Superman Hold",        eq:["bodyweight","mat"],       muscle:"Back",          unilateral:false, timed:true, timedSec:45 },
    ],
    Legs:[
      { name:"Squat",                eq:["bodyweight"],             muscle:"Quads/Glutes",  unilateral:false, repOverride:"15-30" },
      { name:"Bulgarian Split Squat",eq:["bodyweight","bench"],     muscle:"Quads",         unilateral:true,  repOverride:"8-15"  },
      { name:"Lunge",                eq:["bodyweight"],             muscle:"Quads/Glutes",  unilateral:true,  repOverride:"10-20" },
      { name:"Single-Leg Glute Bridge", eq:["bodyweight","mat"],    muscle:"Glutes",        unilateral:true,  repOverride:"10-20" },
      { name:"Calf Raise",           eq:["bodyweight"],             muscle:"Calves",        unilateral:false, repOverride:"15-25" },
    ],
    Upper:[
      { name:"Push-Up",              eq:["bodyweight"],             muscle:"Chest/Triceps", unilateral:false, repOverride:"10-25" },
      { name:"Inverted Row",         eq:["pullupbar","bodyweight"], muscle:"Upper Back",    unilateral:false, repOverride:"8-20"  },
      { name:"Pike Push-Up",         eq:["bodyweight"],             muscle:"Shoulders",     unilateral:false, repOverride:"8-15"  },
      { name:"Chin-Up",              eq:["pullupbar"],              muscle:"Biceps/Back",   unilateral:false, repOverride:"4-12"  },
    ],
    "Full Body":[
      { name:"Burpee",               eq:["bodyweight"],             muscle:"Full Body",     unilateral:false, repOverride:"8-15"  },
      { name:"Mountain Climber",     eq:["bodyweight","mat"],       muscle:"Core/Cardio",   unilateral:false, timed:true, timedSec:30 },
    ],
    Core:[
      { name:"Plank",                eq:["bodyweight","mat"],       muscle:"Core",          unilateral:false, timed:true, timedSec:60 },
      { name:"Dead Bug",             eq:["bodyweight","mat"],       muscle:"Core",          unilateral:false, repOverride:"20-30" },
      { name:"Hollow Hold",          eq:["bodyweight","mat"],       muscle:"Core",          unilateral:false, timed:true, timedSec:40 },
      { name:"Bicycle Crunch",       eq:["bodyweight","mat"],       muscle:"Core",          unilateral:false, repOverride:"20-30" },
    ],
  },
};

const REFERENCE_EXERCISES = [
  { name:"Push-Up",             eq:"bodyweight",  type:"reps" },
  { name:"Pull-Up",             eq:"pullupbar",   type:"reps" },
  { name:"Weighted Pull-Up",    eq:"dipbelt",     type:"weight" },
  { name:"Weighted Dip",        eq:"dipbelt",     type:"weight" },
  { name:"Squat",               eq:"bodyweight",  type:"reps" },
  { name:"Dumbbell Press",      eq:"dumbbells",   type:"weight" },
  { name:"Dumbbell Row",        eq:"dumbbells",   type:"weight" },
  { name:"Barbell Squat",       eq:"barbell",     type:"weight" },
  { name:"Barbell Bench Press", eq:"barbell",     type:"weight" },
  { name:"Barbell Deadlift",    eq:"barbell",     type:"weight" },
  { name:"Overhead Press",      eq:"barbell",     type:"weight" },
  { name:"EZ Bar Curl",         eq:"ezbar",       type:"weight" },
  { name:"EZ Bar Skull Crusher",eq:"ezbar",       type:"weight" },
];

// ── Exercise → primary muscle group lookup ────────────────────────────────────
const EXERCISE_TO_MUSCLE_GROUP = (() => {
  const map = {};
  const all = [
    ...Object.values(EXERCISE_DB).flat(),
    ...Object.values(MODE_EXERCISE_DB).flatMap(db => Object.values(db).flat()),
  ];
  all.forEach(ex => {
    const m = ex.muscle.toLowerCase();
    let g = "core";
    if (m.includes("chest"))                        g = "chest";
    else if (m.includes("back") || m.includes("posterior") || m.includes("lat")) g = "back";
    else if (m.includes("shoulder") || m.includes("delt") || m.includes("trap")) g = "shoulders";
    else if (m.includes("bicep"))                   g = "biceps";
    else if (m.includes("tricep"))                  g = "triceps";
    else if (m.includes("quad"))                    g = "quads";
    else if (m.includes("hamstring"))               g = "hamstrings";
    else if (m.includes("glute"))                   g = "glutes";
    else if (m.includes("calf") || m.includes("calve")) g = "calves";
    map[ex.name] = g;
  });
  return map;
})();

// RP-derived MEV (min effective volume) and MRV (max recoverable volume) per week in sets
const MRV_TARGETS = {
  chest:      { mev: 8,  mrv: 22 },
  back:       { mev: 10, mrv: 25 },
  shoulders:  { mev: 8,  mrv: 22 },
  biceps:     { mev: 6,  mrv: 20 },
  triceps:    { mev: 6,  mrv: 18 },
  quads:      { mev: 8,  mrv: 20 },
  hamstrings: { mev: 6,  mrv: 16 },
  glutes:     { mev: 4,  mrv: 16 },
  calves:     { mev: 6,  mrv: 16 },
  core:       { mev: 6,  mrv: 16 },
};

// ── Ordered Day Templates — correct exercise sequence per coaching principles ──
// Each entry: exercise name + fallback alternatives if equipment missing
const DAY_TEMPLATES = {
  "Push": [
    { name:"Barbell Bench Press",    alts:["Dumbbell Bench Press","Push-Up"],           eq:["barbell","squatstands","bench"] },
    { name:"Dumbbell Shoulder Press",alts:["Overhead Press","Pike Push-Up"],            eq:["dumbbells"] },
    { name:"Weighted Dip",           alts:["Tricep Dips","Close-Grip Bench Press"],     eq:["pullupbar","dipbelt"] },
    { name:"Dumbbell Fly",           alts:["Resistance Band Press","Push-Up"],          eq:["dumbbells","bench"] },
    { name:"EZ Bar Skull Crusher",   alts:["Tricep Overhead Ext","Diamond Push-Up"],    eq:["ezbar","bench"] },
  ],
  "Pull": [
    { name:"Barbell Deadlift",       alts:["Romanian Deadlift","Single-Leg RDL"],        eq:["barbell"] },
    { name:"Assisted Pull-Up",       alts:["Pull-Up","Weighted Pull-Up","Inverted Row"],          eq:["pullupbar"] },
    { name:"Dumbbell Row",           alts:["Inverted Row"],                              eq:["dumbbells"] },
    { name:"Band Pull-Apart",        alts:["EZ Bar Upright Row","EZ Bar Reverse Curl"], eq:["bands"] },
    { name:"EZ Bar Curl",            alts:["Dumbbell Curl","Chin-Up"],                  eq:["ezbar"] },
  ],
  "Legs": [
    { name:"Barbell Squat",          alts:["Goblet Squat","Squat"],                     eq:["barbell","squatstands"] },
    { name:"Romanian Deadlift",      alts:["Barbell Deadlift","Single-Leg RDL"],        eq:["dumbbells"] },
    { name:"Bulgarian Split Squat",  alts:["Lunge","Single-Leg Glute Bridge"],          eq:["bodyweight","bench"] },
    { name:"Calf Raise",             alts:["Single-Leg Balance Disc"],                  eq:["bodyweight"] },
    { name:"Thoracic Extension",     alts:["Dead Bug"],                                 eq:["bench","bodyweight"] },
  ],
  "Full Body": [
    { name:"Barbell Squat",          alts:["Goblet Squat","Squat"],                     eq:["barbell","squatstands"] },
    { name:"Barbell Bench Press",    alts:["Dumbbell Bench Press","Push-Up"],           eq:["barbell","bench"] },
    { name:"Weighted Pull-Up",       alts:["Pull-Up","Inverted Row"],                   eq:["pullupbar"] },
    { name:"Romanian Deadlift",      alts:["Barbell Deadlift","Single-Leg RDL"],        eq:["dumbbells","barbell"] },
    { name:"Dumbbell Shoulder Press",alts:["Overhead Press","Pike Push-Up"],            eq:["dumbbells"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Full Body A": [
    { name:"Barbell Bench Press",    alts:["Dumbbell Bench Press","Push-Up"],           eq:["barbell","bench"] },
    { name:"Weighted Pull-Up",       alts:["Pull-Up","Inverted Row"],                   eq:["pullupbar"] },
    { name:"Dumbbell Shoulder Press",alts:["Overhead Press","Pike Push-Up"],            eq:["dumbbells"] },
    { name:"EZ Bar Skull Crusher",   alts:["Tricep Overhead Ext","Tricep Dips"],        eq:["ezbar"] },
    { name:"EZ Bar Curl",            alts:["Dumbbell Curl","Chin-Up"],                  eq:["ezbar"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Full Body B": [
    { name:"Barbell Squat",          alts:["Goblet Squat","Squat"],                     eq:["barbell","squatstands"] },
    { name:"Barbell Deadlift",       alts:["Romanian Deadlift","Single-Leg RDL"],       eq:["barbell"] },
    { name:"Bulgarian Split Squat",  alts:["Lunge","Single-Leg Glute Bridge"],          eq:["bodyweight","bench"] },
    { name:"Goblet Squat",           alts:["Banded Squat","Squat"],                     eq:["dumbbells"] },
    { name:"Calf Raise",             alts:["Calf Raise"],                               eq:["bodyweight"] },
    { name:"Dead Bug",               alts:["Plank"],                                    eq:["bodyweight","mat"] },
  ],
  "Upper A": [
    { name:"Barbell Bench Press",    alts:["Dumbbell Bench Press","Push-Up"],           eq:["barbell","bench"] },
    { name:"Weighted Pull-Up",       alts:["Pull-Up","Inverted Row"],                   eq:["pullupbar"] },
    { name:"Dumbbell Shoulder Press",alts:["Overhead Press"],                           eq:["dumbbells"] },
    { name:"Single-Arm Dumbbell Row",alts:["Dumbbell Row"],                             eq:["dumbbells"] },
    { name:"EZ Bar Skull Crusher",   alts:["Tricep Overhead Ext"],                      eq:["ezbar"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Upper B": [
    { name:"Dumbbell Bench Press",   alts:["Barbell Bench Press","Push-Up"],            eq:["dumbbells","bench"] },
    { name:"Barbell Row",            alts:["Dumbbell Row","Inverted Row"],               eq:["barbell"] },
    { name:"Overhead Press",         alts:["Dumbbell Shoulder Press","Pike Push-Up"],   eq:["barbell","squatstands"] },
    { name:"Dumbbell Curl",          alts:["EZ Bar Curl","Chin-Up"],                    eq:["dumbbells"] },
    { name:"Band Pull-Apart",        alts:["Inverted Row"],                             eq:["bands"] },
    { name:"Dead Bug",               alts:["Plank"],                                    eq:["bodyweight","mat"] },
  ],
  "Upper": [
    { name:"Dumbbell Bench Press",   alts:["Push-Up"],                                  eq:["dumbbells","bench"] },
    { name:"Dumbbell Row",           alts:["Inverted Row"],                             eq:["dumbbells"] },
    { name:"Dumbbell Shoulder Press",alts:["Pike Push-Up"],                             eq:["dumbbells"] },
    { name:"Dumbbell Curl",          alts:["Chin-Up"],                                  eq:["dumbbells"] },
    { name:"Tricep Overhead Ext",    alts:["Tricep Dips"],                              eq:["dumbbells"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Lower A": [
    { name:"Barbell Squat",          alts:["Goblet Squat","Squat"],                     eq:["barbell","squatstands"] },
    { name:"Romanian Deadlift",      alts:["Single-Leg RDL","Goblet Squat"],            eq:["dumbbells"] },
    { name:"Bulgarian Split Squat",  alts:["Lunge"],                                    eq:["bodyweight","bench"] },
    { name:"Goblet Squat",           alts:["Banded Squat","Squat"],                     eq:["dumbbells"] },
    { name:"Calf Raise",             alts:["Calf Raise"],                               eq:["bodyweight"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Lower B": [
    { name:"Barbell Deadlift",       alts:["Romanian Deadlift","Single-Leg RDL"],       eq:["barbell"] },
    { name:"Barbell Squat",          alts:["Goblet Squat","Squat"],                     eq:["barbell","squatstands"] },
    { name:"Lunge",                  alts:["Bulgarian Split Squat"],                    eq:["bodyweight"] },
    { name:"Single-Leg RDL",         alts:["Romanian Deadlift"],                        eq:["dumbbells"] },
    { name:"Calf Raise",             alts:["Calf Raise"],                               eq:["bodyweight"] },
    { name:"Dead Bug",               alts:["Plank"],                                    eq:["bodyweight","mat"] },
  ],
  "Chest": [
    { name:"Barbell Bench Press",    alts:["Dumbbell Bench Press","Push-Up"],           eq:["barbell","bench"] },
    { name:"Dumbbell Fly",           alts:["Resistance Band Press"],                    eq:["dumbbells","bench"] },
    { name:"EZ Bar Skull Crusher",   alts:["Tricep Overhead Ext","Tricep Dips"],        eq:["ezbar","bench"] },
    { name:"Single-Arm DB Press",    alts:["Dumbbell Bench Press"],                     eq:["dumbbells"] },
    { name:"Band Pull-Apart",        alts:["Resistance Band Press"],                    eq:["bands"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Back": [
    { name:"Weighted Pull-Up",       alts:["Pull-Up","Inverted Row"],                   eq:["pullupbar","dipbelt"] },
    { name:"Barbell Row",            alts:["Dumbbell Row","Inverted Row"],               eq:["barbell"] },
    { name:"Single-Arm Dumbbell Row",alts:["Dumbbell Row"],                             eq:["dumbbells"] },
    { name:"EZ Bar Curl",            alts:["Dumbbell Curl","Chin-Up"],                  eq:["ezbar"] },
    { name:"Band Pull-Apart",        alts:["Inverted Row"],                             eq:["bands"] },
    { name:"Dead Bug",               alts:["Plank"],                                    eq:["bodyweight","mat"] },
  ],
  "Shoulders": [
    { name:"Overhead Press",         alts:["Dumbbell Shoulder Press","Pike Push-Up"],   eq:["barbell","squatstands"] },
    { name:"Dumbbell Shoulder Press",alts:["Overhead Press","Pike Push-Up"],            eq:["dumbbells"] },
    { name:"EZ Bar Upright Row",     alts:["Band Pull-Apart"],                          eq:["ezbar"] },
    { name:"Band Pull-Apart",        alts:["EZ Bar Upright Row"],                       eq:["bands"] },
    { name:"Plank",                  alts:["Dead Bug"],                                 eq:["bodyweight","mat"] },
  ],
  "Arms": [
    { name:"EZ Bar Curl",            alts:["Dumbbell Curl","Chin-Up"],                  eq:["ezbar"] },
    { name:"EZ Bar Skull Crusher",   alts:["Tricep Overhead Ext","Tricep Dips"],        eq:["ezbar","bench"] },
    { name:"Weighted Dip",           alts:["Tricep Dips","Diamond Push-Up"],            eq:["pullupbar","dipbelt"] },
    { name:"Dumbbell Curl",          alts:["EZ Bar Curl","Chin-Up"],                    eq:["dumbbells"] },
    { name:"Tricep Overhead Ext",    alts:["EZ Bar Skull Crusher","Diamond Push-Up"],   eq:["dumbbells"] },
    { name:"Dead Bug",               alts:["Plank"],                                    eq:["bodyweight","mat"] },
  ],
  "REST": [],
};

// ── Stretch Routines — tailored for age 49, upper-back kyphosis, lumbar disc ──
// Evidence base:
//   Kyphosis: PMC12141983 (2025 systematic review), foam rolling meta-analysis
//   Disc/McKenzie: backintelligence.com, medrxiv McKenzie RCT
//   Hip flexor+APT: ScienceDirect doi 10.1016/j.jmpt.2020.06.006
//   Piriformis: spine-health.com, NIH StatPearls
//   Hold times: Feland 2001 — 60s holds superior for adults ≥60y; ACSM recommends 60s for older adults
// Central exercise definitions — deduped. Routines below reference these by name.
//   metricType drives how the card header reads:
//     "hold"     — static hold.        Fields: holdSeconds, perSide
//     "reps"     — repetitions.        Fields: sets, reps, perSide
//     "repsHold" — reps with a hold.   Fields: reps, holdSeconds, perSide
//   sets (optional) also renders as a "× N sets" suffix on hold/repsHold.
//   sec = estimated duration, used only for time-budget math in getStretchItems.
//   Description split into setup / movement / feel / mistake (feel is highlighted in the card).
const EXERCISES = {
  "Thoracic Foam Roller": {
    metricType:"hold", holdSeconds:90, perSide:false, sec:90,
    setup:    "Roller across your upper back at the shoulder-blade line, knees bent, hips down, hands cradling your head.",
    movement: "Work through the mid-back (T4–T8) in short segments, letting your upper back drape backward over the roller.",
    feel:     "A gentle extension and release in the muscles either side of the upper spine — never a pinch on the spine itself.",
    mistake:  "Rolling too low onto the lower back — stop at the bottom of the ribs; the lumbar spine should never bend over the roller.",
  },
  "Doorway Chest Stretch": {
    metricType:"hold", holdSeconds:60, perSide:true, sec:60,
    setup:    "Stand in a doorway, forearm on the frame, elbow bent to 90° at about shoulder height, one foot staggered forward.",
    movement: "Shift your weight gently through the front foot until the chest opens. Hold, then switch sides.",
    feel:     "A broad stretch across the front of the chest and shoulder — not in the neck or deep in the shoulder joint.",
    mistake:  "Placing the elbow too high or shrugging — this pinches the shoulder and sends tension to the neck instead of the pec.",
  },
  "Wall Angel": {
    metricType:"reps", sets:2, reps:8, perSide:false, sec:80,
    setup:    "Back against a wall, lower back flat, ribs down, arms bent in a 'goalpost' with the backs of the hands on the wall.",
    movement: "Slowly slide the arms up overhead and back down, keeping hands and wrists in contact with the wall the whole way.",
    feel:     "Work between the shoulder blades and in the lower traps — a controlled effort, not a stretch.",
    mistake:  "Letting the lower back arch off the wall or the hands peel away to reach higher — only go as far as contact holds.",
  },
  "Chin Tuck": {
    metricType:"repsHold", reps:10, holdSeconds:5, perSide:false, sec:60,
    setup:    "Sit or stand tall, shoulders relaxed, eyes level and facing straight ahead.",
    movement: "Draw the chin straight back (making a 'double chin'), hold briefly, then release. Repeat for the prescribed reps.",
    feel:     "A lengthening at the base of the skull and top of the neck, with a light effort at the front of the throat.",
    mistake:  "Tipping the chin down toward the chest instead of gliding it straight back — that flexes the neck rather than retracting it.",
  },
  "Thread the Needle": {
    metricType:"hold", holdSeconds:60, perSide:true, sec:60,
    setup:    "On all fours, wrists under shoulders, knees under hips, back flat.",
    movement: "Reach one arm underneath the body and across, lowering that shoulder toward the floor, then return. Rotate through the upper back only.",
    feel:     "A rotational stretch across the upper back and the rear of the shoulder of the threading arm.",
    mistake:  "Letting the hips twist to force more range — keep them square and level so the motion stays in the thoracic spine.",
  },
  "Lat Doorway Stretch": {
    metricType:"hold", holdSeconds:60, perSide:true, sec:60,
    setup:    "Grip a doorframe or upright at about head height, feet back so the arm is straight and taking some weight.",
    movement: "Sit the hips back and away from the anchor, adding a slight side-bend, until the side of the back lengthens.",
    feel:     "A long stretch down the side of the back and under the armpit — the lat, from armpit toward hip.",
    mistake:  "Shrugging the shoulder up to the ear instead of reaching long — let the shoulder blade glide and keep the arm relaxed.",
  },
  "Hip Flexor Lunge": {
    metricType:"hold", holdSeconds:90, perSide:true, sec:90,
    setup:    "Half-kneeling: back knee on the floor, front foot flat ahead, torso tall and stacked over the hips.",
    movement: "First tuck the pelvis under (squeeze the back-leg glute, flatten the low back), THEN shift gently forward. Hold, switch sides.",
    feel:     "A stretch across the front of the hip and top of the thigh of the back (kneeling) leg.",
    mistake:  "Leaning forward before tucking the pelvis — this arches the lower back and loads the disc instead of stretching the hip flexor.",
  },
  "Figure-4 Piriformis": {
    metricType:"hold", holdSeconds:60, perSide:true, sets:3, sec:60,
    setup:    "Lie on your back, both knees bent, and cross one ankle over the opposite thigh to make a 'figure 4'.",
    movement: "Reach through and gently draw the supporting thigh toward the chest until you feel the stretch. Hold, then switch sides.",
    feel:     "A deep stretch in the glute and outer hip of the crossed leg.",
    mistake:  "Yanking or bouncing the leg — pull slowly and keep the lower back flat on the floor rather than curling off it.",
  },
  "Cat-Cow Flow": {
    metricType:"hold", holdSeconds:90, perSide:false, sec:90,
    setup:    "On all fours, wrists under shoulders, knees under hips, spine in neutral.",
    movement: "Exhale and round the spine up toward the ceiling, then inhale and let it sink into a gentle arch. Move slowly and continuously.",
    feel:     "A gentle wave of mobility travelling along the whole spine, easing the mid and lower back.",
    mistake:  "Forcing the end range or moving fast — stay slow and stop the instant the lower back feels any pinch.",
  },
  "Prone Extension (McKenzie)": {
    metricType:"repsHold", reps:10, holdSeconds:2, sets:3, perSide:false, sec:30,
    setup:    "Lie face down, hands flat under the shoulders as if to push up, hips and legs relaxed.",
    movement: "Slowly press the upper body up, letting hips and belly stay heavy on the floor. Hold briefly at the top, then lower with control.",
    feel:     "A gentle extension through the lower back as it arches — mild, never sharp.",
    mistake:  "Tensing the glutes and hips while pressing up — keep the lower body soft. STOP if it sends tingling or pain below the knee.",
  },
  "Knee to Chest": {
    metricType:"hold", holdSeconds:60, perSide:true, sec:60,
    setup:    "Lie on your back, one leg straight along the floor, the other knee bent.",
    movement: "Gently draw the bent knee toward the chest with your hands until you feel a mild pull, hold, then switch sides.",
    feel:     "A gentle stretch and release across the lower back and into the glute of the bent leg.",
    mistake:  "Letting the straight leg bend up off the floor — keep it long so the lower back gets the gentle traction.",
  },
  "Supine Hamstring Stretch": {
    metricType:"hold", holdSeconds:60, perSide:true, sec:60,
    setup:    "Lie on your back, loop a towel or strap around the arch of one foot, other leg bent or straight on the floor.",
    movement: "Straighten the looped leg up toward the ceiling using the towel until the back of the thigh lengthens. Hold, switch sides.",
    feel:     "A stretch down the back of the thigh — from behind the knee up toward the sit bone.",
    mistake:  "Rounding the lower back off the floor to reach further — keep it flat; never substitute a seated toe-touch, which loads the disc.",
  },
  "Glute Bridge Hold": {
    metricType:"hold", holdSeconds:60, perSide:false, sec:60,
    setup:    "Lie on your back, knees bent, feet flat and hip-width, arms resting at your sides.",
    movement: "Press through the heels and lift the hips into a straight line from knees to shoulders. Squeeze the glutes and hold.",
    feel:     "A strong contraction in the glutes and hamstrings — this is activation work, not a stretch.",
    mistake:  "Arching the lower back to lift higher instead of driving with the glutes — ribs down, stop at a straight hip line.",
  },
  "Standing Quad Stretch": {
    metricType:"hold", holdSeconds:60, perSide:true, sec:60,
    setup:    "Stand tall near a wall for balance, weight on one leg.",
    movement: "Bend the other knee and hold the ankle, drawing the heel toward the glute while keeping the knees together. Hold, switch sides.",
    feel:     "A stretch along the front of the thigh — the quad of the bent leg.",
    mistake:  "Letting the knee drift forward or the low back arch to pull harder — keep the knees aligned and the pelvis tucked slightly.",
  },
};

const STRETCH_ROUTINES = {
  upper_back: {
    label: "Upper Back",
    desc:  "Thoracic extension · pec opener · chin tuck · postural reset",
    color: "var(--amber)",
    afterDay: ["Push","Full Body","Full Body A","Upper A","Upper B","Chest","Shoulders","Arms"],
    // Foam roller first (mobilises) → pec opener → active wall angel → chin tuck → rotation → lats last
    items: ["Thoracic Foam Roller","Doorway Chest Stretch","Wall Angel","Chin Tuck","Thread the Needle","Lat Doorway Stretch"],
  },
  lower_back: {
    label: "Lower Back",
    desc:  "Disc decompression · hip flexor · piriformis · McKenzie",
    color: "var(--blue)",
    afterDay: ["Legs","Pull","Full Body B","Lower A","Lower B","Back"],
    // Hip flexor first (APT is most critical for disc) → piriformis → cat-cow → McKenzie → knee-to-chest decompress
    items: ["Hip Flexor Lunge","Figure-4 Piriformis","Cat-Cow Flow","Prone Extension (McKenzie)","Knee to Chest"],
  },
  hips_legs: {
    label: "Hips & Legs",
    desc:  "Hip flexors · hamstrings (spine-safe) · glute activation",
    color: "var(--green)",
    afterDay: ["Legs","Full Body B","Lower A","Lower B"],
    items: ["Hip Flexor Lunge","Figure-4 Piriformis","Supine Hamstring Stretch","Glute Bridge Hold","Standing Quad Stretch"],
  },
  full_body: {
    label: "Full Body",
    desc:  "Complete postural + disc reset — upper & lower back",
    color: "var(--purple)",
    afterDay: [],
    items: ["Thoracic Foam Roller","Doorway Chest Stretch","Chin Tuck","Wall Angel","Thread the Needle","Hip Flexor Lunge","Figure-4 Piriformis","Cat-Cow Flow","Prone Extension (McKenzie)","Supine Hamstring Stretch","Lat Doorway Stretch"],
  },
};

function suggestStretchFocus(history) {
  const last = (history || []).find(h => h.day !== "Stretch");
  if (!last) return "full_body";
  for (const [key, r] of Object.entries(STRETCH_ROUTINES)) {
    if (r.afterDay.includes(last.day)) return key;
  }
  return "upper_back";
}

function getStretchItems(focus, totalMinutes) {
  const routine = STRETCH_ROUTINES[focus];
  if (!routine) return [];
  const resolved = routine.items.map(name => ({ name, ...EXERCISES[name] }));
  const budget = totalMinutes * 60;
  const baseTotal = resolved.reduce((a, it) =>
    a + it.sec * (it.perSide ? 2 : 1) * (it.sets || 1), 0);
  const scale = Math.min(1.5, Math.max(0.7, budget / baseTotal));
  return resolved.map(it => ({ ...it, effectiveSec: Math.max(30, Math.round(it.sec * scale / 30) * 30) }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── Trend detection ─────────────────────────────────────────────────────────
function detectTrends(day, history) {
  const flags = [];
  // Weights-mode only — trends here are about load stalls and volume drops.
  const sameDaySessions = weightsHistory(history)
    .filter(h => h.day === day)
    .slice(0, 4); // last 4 same-day sessions

  if (sameDaySessions.length < 3) return flags;

  // 1. Avg RIR trend — collect all RIR values per session
  const sessionAvgRIRs = sameDaySessions.map(h => {
    const rpes = Object.values(h.log || {}).flat()
      .map(s => parseInt(s.rpe))
      .filter(r => !isNaN(r) && r >= 0);
    return rpes.length ? rpes.reduce((a,b)=>a+b,0)/rpes.length : null;
  }).filter(r => r !== null);

  if (sessionAvgRIRs.length >= 3) {
    const last3Avg = sessionAvgRIRs.slice(0,3).reduce((a,b)=>a+b,0)/3;
    if (last3Avg >= 4)
      flags.push({ type:"easy",   msg:`Avg RIR ${last3Avg.toFixed(1)} over last 3 ${day} sessions — consider bigger weight jumps` });
    if (last3Avg <= 1)
      flags.push({ type:"hard",   msg:`Avg RIR ${last3Avg.toFixed(1)} over last 3 ${day} sessions — consider backing off or deloading` });
  }

  // 2. Volume trend — 3 consecutive drops
  const vols = sameDaySessions.map(h => h.volume || 0);
  if (vols.length >= 3 && vols[0] < vols[1] && vols[1] < vols[2])
    flags.push({ type:"volume", msg:`${day} volume has dropped 3 sessions in a row — check fatigue` });

  // 3. Stalled weight — same weight 3+ sessions on any key exercise
  const exNames = [...new Set(sameDaySessions.flatMap(h => Object.keys(h.log || {})))];
  exNames.forEach(exName => {
    const weights = sameDaySessions.slice(0,3).map(h => {
      const sets = (h.log?.[exName] || []).filter(s => s.weight && parseFloat(s.weight) > 0);
      return sets.length ? Math.max(...sets.map(s => parseFloat(s.weight))) : null;
    }).filter(w => w !== null);
    if (weights.length >= 3 && weights[0] === weights[1] && weights[1] === weights[2]) {
      // Only flag if RIR was good (2-3) — not stalled if it was hard
      const lastRIRs = Object.values(sameDaySessions[0].log?.[exName] || [])
        .map(s => parseInt(s.rpe)).filter(r => !isNaN(r));
      const lastAvgRIR = lastRIRs.length ? lastRIRs.reduce((a,b)=>a+b,0)/lastRIRs.length : 99;
      if (lastAvgRIR >= 2 && lastAvgRIR <= 3)
        flags.push({ type:"stall", msg:`${exName} weight unchanged for 3 ${day} sessions at RIR ${lastAvgRIR.toFixed(1)} — something may be off` });
    }
  });

  return flags;
}

// ── Weekly volume (last N weeks, oldest→newest) ───────────────────────────────
function getWeeklyVolumes(history, numWeeks = 6) {
  const now = new Date();
  const curWeekStart = new Date(now);
  curWeekStart.setDate(now.getDate() - now.getDay());
  curWeekStart.setHours(0, 0, 0, 0);
  return Array.from({ length: numWeeks }, (_, i) => {
    const wStart = new Date(curWeekStart);
    wStart.setDate(curWeekStart.getDate() - (numWeeks - 1 - i) * 7);
    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 7);
    const vol = (history || [])
      .filter(h => { const d = new Date(h.date); return d >= wStart && d < wEnd; })
      .reduce((a, h) => a + (parseFloat(h.volume) || 0), 0);
    return { vol, isCurrent: i === numWeeks - 1 };
  });
}

// ── PR detection — did last session beat any prior best? ─────────────────────
function detectRecentPR(history) {
  const loaded = weightsHistory(history);
  if (loaded.length < 2) return null;
  const last = loaded[0];
  const prior = loaded.slice(1);
  for (const [name, sets] of Object.entries(last.log || {})) {
    const bestWeight = Math.max(0, ...sets.map(s => parseFloat(s.weight) || 0));
    if (bestWeight <= 0) continue;
    let priorBest = 0;
    for (const s of prior) {
      const ex = s.log?.[name] || [];
      priorBest = Math.max(priorBest, ...ex.map(x => parseFloat(x.weight) || 0));
    }
    if (bestWeight > priorBest && priorBest > 0) {
      const prSet = sets.find(s => parseFloat(s.weight) === bestWeight);
      return { name, weight: bestWeight, reps: prSet?.reps };
    }
  }
  return null;
}

// ── Mesocycle helpers ────────────────────────────────────────────────────────
const PHASE_LENGTHS = { accumulation: 12, intensification: 9, deload: 3 };

function initMesocycle(existing) {
  if (existing && existing.phase) return existing;
  return { phase: "accumulation", sessionCount: 0, startDate: new Date().toISOString().slice(0,10), pendingTransition: false };
}

// If sessionCount is 0 but history exists, infer count from history so the
// mesocycle display is accurate after a restore or first load on existing data.
function reconcileMesocycle(mesocycle, history) {
  const m = initMesocycle(mesocycle);
  if (m.sessionCount > 0 || !history || history.length === 0) return m;
  const phaseLen = PHASE_LENGTHS[m.phase] || 12;
  // Mesocycle phases track the lifting block only.
  const trainingSessions = weightsHistory(history).filter(h => h.day !== "Stretch");
  const count = m.startDate
    ? trainingSessions.filter(h => String(h.date).slice(0, 10) >= m.startDate).length
    : Math.min(trainingSessions.length, phaseLen);
  const sessionCount = Math.min(count, phaseLen);
  return { ...m, sessionCount, pendingTransition: sessionCount >= phaseLen };
}

function nextPhase(phase) {
  if (phase === "accumulation")   return "intensification";
  if (phase === "intensification") return "deload";
  return "accumulation";
}

function phaseLabel(phase) {
  if (phase === "accumulation")    return "ACCUMULATION";
  if (phase === "intensification") return "INTENSIFICATION";
  if (phase === "deload")          return "DELOAD";
  return "";
}

function phaseColor(phase) {
  if (phase === "accumulation")    return "var(--blue)";
  if (phase === "intensification") return "var(--amber)";
  if (phase === "deload")          return "var(--green)";
  return "var(--muted)";
}

// Get best set from last 2 same-day sessions for intensification 1RM calc
function getBestFromLastTwoSameDaySessions(exName, day, history, profileBaseline) {
  const sameDaySessions = weightsHistory(history).filter(h => h.day === day && h.log?.[exName]);
  const last2 = sameDaySessions.slice(0, 2);
  let bestWeight = 0, bestReps = 0;
  last2.forEach(session => {
    (session.log[exName] || []).forEach(set => {
      const w = parseFloat(set.weight) || 0;
      const r = parseInt(set.reps) || 0;
      const vol = w * r;
      const bestVol = bestWeight * bestReps;
      if (vol > bestVol) { bestWeight = w; bestReps = r; }
    });
  });
  if (bestWeight === 0 && profileBaseline?.[exName]) {
    bestWeight = parseFloat(profileBaseline[exName].weight) || 0;
    bestReps   = parseInt(profileBaseline[exName].reps)   || 8;
  }
  return { weight: bestWeight, reps: bestReps };
}

// Build a TRX / bodyweight day from the SPLIT_MAP categories for that day, so
// every split name resolves without needing a per-day template.
function getExercisesForMode(day, mode, equipment) {
  const db = MODE_EXERCISE_DB[mode];
  if (!db) return [];
  const cats = SPLIT_MAP[day]?.length ? SPLIT_MAP[day] : ["Full Body","Core"];
  const eqList = equipment || [];
  const out = []; const seen = new Set();
  cats.forEach(cat => {
    const pool = db[cat] || [];
    // TRX is opt-in via the mode switch itself, so only bodyweight is equipment-gated.
    const usable = mode === "bw" ? pool.filter(ex => ex.eq.some(e => eqList.includes(e))) : pool;
    (usable.length ? usable : pool).slice(0, cat === "Core" ? 2 : 3).forEach(ex => {
      if (!seen.has(ex.name)) { seen.add(ex.name); out.push({ ...ex, isFav:false }); }
    });
  });
  return out;
}

function getExercisesForDay(day, equipment, goal, favourites, level, mode) {
  if (day === "REST" || day === "Stretch") return [];
  if (!isWeightsMode(mode)) return getExercisesForMode(day, mode, equipment);

  const template = DAY_TEMPLATES[day];
  const allFavs = Object.values(favourites||{}).flat();

  // If we have a template, use it with equipment filtering
  if (template) {
    const exercises = [];
    template.forEach(entry => {
      // Try main exercise first, then alts
      const candidates = [entry.name, ...(entry.alts||[])];
      for (const name of candidates) {
        // Find this exercise in the DB
        const dbEx = Object.values(EXERCISE_DB).flat().find(e => e.name === name);
        if (dbEx && dbEx.eq.some(e => equipment.includes(e))) {
          exercises.push({ ...dbEx, isFav: allFavs.includes(dbEx.name) });
          break;
        }
      }
    });
    return exercises;
  }

  // Fallback for any day without a template
  const cats = SPLIT_MAP[day] || [];
  const exercises = []; const seen = new Set();
  const isAdvanced = level === "Intermediate" || level === "Advanced";
  cats.forEach(cat => {
    const pool = (EXERCISE_DB[cat] || []).filter(ex => ex.eq.some(e => equipment.includes(e)));
    pool.sort((a,b) => {
      const aFav = allFavs.includes(a.name) ? 0 : 1;
      const bFav = allFavs.includes(b.name) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      if (isAdvanced && cat !== "Core") {
        const aW = a.eq.some(e => WEIGHTED_EQ.includes(e)) ? 0 : 1;
        const bW = b.eq.some(e => WEIGHTED_EQ.includes(e)) ? 0 : 1;
        if (aW !== bW) return aW - bW;
      }
      return 0;
    });
    pool.slice(0, cat === "Core" ? 2 : 3).forEach(ex => {
      if (!seen.has(ex.name)) { seen.add(ex.name); exercises.push({ ...ex, isFav: allFavs.includes(ex.name) }); }
    });
  });
  return exercises;
}

// Weight records come from weights-mode sessions only — a TRX or bodyweight
// session must never establish or raise a loaded best.
function getBestRecord(exName, history, profileBaseline) {
  let bestWeight = 0, bestReps = 0;
  weightsHistory(history).forEach(session => {
    (session.log?.[exName] || []).forEach(set => {
      const w = parseFloat(set.weight) || 0;
      const r = parseInt(set.reps) || 0;
      if (w > bestWeight) bestWeight = w;
      if (r > bestReps) bestReps = r;
    });
  });
  if (bestWeight === 0 && bestReps === 0 && profileBaseline?.[exName]) {
    const b = profileBaseline[exName];
    bestWeight = parseFloat(b.weight) || 0;
    bestReps = parseInt(b.reps) || 0;
  }
  return { weight: bestWeight, reps: bestReps };
}

function suggestWeight(best, goal) {
  if (!best.weight && !best.reps) return null;
  const rr = REP_RANGES[goal] || REP_RANGES.general;
  if (best.weight > 0) {
    const inc = goal === "strength" ? 2.5 : 1.25;
    return { weight: (best.weight + inc).toFixed(1), reps: rr.reps };
  }
  return { weight: null, reps: best.reps };
}

function getMuscleWarnings(day, history) {
  const muscles = MUSCLE_MAP[day] || [];
  if (!muscles.length) return [];
  const warnings = [];
  const now = new Date();
  muscles.forEach(muscle => {
    const recent = (history || [])
      .filter(h => (MUSCLE_MAP[h.day] || []).includes(muscle))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (recent.length > 0) {
      const daysDiff = (now - new Date(recent[0].date)) / 86400000;
      if (daysDiff < 1.5) warnings.push("Warning: " + muscle + " trained less than 48h ago");
    }
  });
  return warnings;
}

function shouldDeload(history) {
  // Volume-based, so only weights sessions count (TRX/BW log volume 0).
  const loaded = weightsHistory(history);
  if (loaded.length < 4) return false;
  const v = loaded.slice(0, 4).map(h => h.volume || 0);
  if (v[0] < v[1] && v[1] < v[2] && v[2] < v[3]) return true;
  const weeks = (new Date() - new Date(loaded[loaded.length - 1]?.date)) / (7 * 86400000);
  return weeks >= 4 && loaded.length >= 12;
}

// ── RP-style muscle volume & fatigue helpers ──────────────────────────────────

// Working sets per muscle group for a given list of sessions
function getMuscleWeeklySets(sessions) {
  const counts = {};
  (sessions || []).forEach(h => {
    Object.entries(h.log || {}).forEach(([exName, sets]) => {
      const muscle = EXERCISE_TO_MUSCLE_GROUP[exName] || "core";
      const working = sets.filter(s => s.reps && parseInt(s.reps) > 0).length;
      counts[muscle] = (counts[muscle] || 0) + working;
    });
  });
  return counts;
}

// Total volume (kg) per muscle group for a given list of sessions
function getMuscleVolumeByWeek(sessions) {
  const vol = {};
  (sessions || []).forEach(h => {
    Object.entries(h.log || {}).forEach(([exName, sets]) => {
      const muscle = EXERCISE_TO_MUSCLE_GROUP[exName] || "core";
      const exVol = sets.reduce((a, s) => a + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0);
      vol[muscle] = (vol[muscle] || 0) + exVol;
    });
  });
  return vol;
}

// Fatigue score 0 (fresh) → 1 (maxed out) derived from recent RIR for a muscle
function getMuscleRIRFatigue(muscle, history) {
  const relevant = (history || [])
    .filter(h => Object.keys(h.log || {}).some(ex => EXERCISE_TO_MUSCLE_GROUP[ex] === muscle))
    .slice(0, 4);
  if (!relevant.length) return null;
  const rirs = relevant.flatMap(h =>
    Object.entries(h.log || {})
      .filter(([ex]) => EXERCISE_TO_MUSCLE_GROUP[ex] === muscle)
      .flatMap(([, sets]) => sets.map(s => parseInt(s.rpe)).filter(r => !isNaN(r) && r >= 0))
  );
  if (!rirs.length) return null;
  const avg = rirs.reduce((a, b) => a + b, 0) / rirs.length;
  return parseFloat(Math.max(0, Math.min(1, (4 - avg) / 4)).toFixed(2));
}

// SFR: stimulus (sets × avg_reps) / fatigue load — higher = more efficient exercise
function getMuscleWeeklySFR(muscle, history, weeklySets) {
  const sets = weeklySets[muscle] || 0;
  if (!sets) return null;
  const recent = (history || [])
    .filter(h => Object.keys(h.log || {}).some(ex => EXERCISE_TO_MUSCLE_GROUP[ex] === muscle))
    .slice(0, 3);
  const allReps = recent.flatMap(h =>
    Object.entries(h.log || {})
      .filter(([ex]) => EXERCISE_TO_MUSCLE_GROUP[ex] === muscle)
      .flatMap(([, ss]) => ss.map(s => parseInt(s.reps)).filter(r => r > 0))
  );
  const avgReps = allReps.length ? allReps.reduce((a, b) => a + b, 0) / allReps.length : 10;
  const fatigue = getMuscleRIRFatigue(muscle, history) ?? 0.5;
  return parseFloat((sets * avgReps / (1 + fatigue * 3)).toFixed(1));
}

// ── Claude API ────────────────────────────────────────────────────────────────
// ── Dedup helper ─────────────────────────────────────────────────────────────
// Keep the first occurrence of each date+day+mode triple; later duplicates drop.
// Mode is part of the key so a Weights Push and a TRX Push on the same day both survive.
function dedupHistory(arr) {
  const seen = new Set();
  return (arr || []).filter(h => {
    const key = `${String(h.date).slice(0,10)}|${h.day}|${h.mode || DEFAULT_MODE}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Google Sheets sync ────────────────────────────────────────────────────────
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwtUvzbIeE7REyYIrMMTw5Otn1Uvklfvz6VZOgm_z4-Mmkzu33KQE2yD8plbwDt8tE/exec";

async function sheetsPost(payload) {
  // Use GET with encoded payload — avoids CORS preflight and redirect issues
  // that affect POST requests to Apps Script from browser iframes
  const url = SHEETS_URL + "?data=" + encodeURIComponent(JSON.stringify(payload));
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  const text = await res.text();
  // Apps Script sometimes returns HTML on auth errors — guard against that
  if (text.startsWith("<")) throw new Error("Apps Script auth error — check deployment settings");
  return JSON.parse(text);
}

// Send one session row (non-blocking — caller doesn't await)
async function syncSession(entry, nextSession, bodyWeightHistory) {
  try {
    await sheetsPost({
      action: "save_session",
      date:               entry.date,
      day:                entry.day,
      mode:               entry.mode || DEFAULT_MODE,
      volume:             entry.volume,
      rating:             entry.rating  || "",
      notes:              entry.notes   || "",
      log:                entry.log     || {},
      nextSession:        nextSession   || {},
      bodyWeightHistory:  bodyWeightHistory || [],
    });
  } catch(e) { /* silent — local save already succeeded */ }
}

// Send profile + equipment + baselines + favourites + split
async function syncConfig(data) {
  try {
    const configKeys = {
      profile: {
        age: data.age, weight: data.weight, height: data.height,
        bodyWeight: data.bodyWeight, level: data.level, goal: data.goal, days: data.days,
      },
      equipment: {
        equipment:      data.equipment,
        dumbbellWeights:data.dumbbellWeights, dumbbellMax: data.dumbbellMax,
        barType:        data.barType,         barWeight:   data.barWeight,
        barbellPlates:  data.barbellPlates,   barbellMax:  data.barbellMax,
        ezbarWeight:    data.ezbarWeight,     ezbarPlates: data.ezbarPlates,
        ezbarMax:       data.ezbarMax,        dipbeltMax:  data.dipbeltMax,
      },
      baselines:  data.profileBaseline || {},
      favourites: data.favourites      || {},
      split:      data.split           || [],
    };
    for (const [key, value] of Object.entries(configKeys)) {
      await sheetsPost({ action: "save_config", key, value });
    }
  } catch(e) { /* silent */ }
}

// Wipe Sheets sessions, then upload the clean deduplicated local set
async function dedupAndResync(data, setSyncStatus, setMsg) {
  setSyncStatus("syncing");
  setMsg("Clearing Sheets…");
  try {
    await sheetsPost({ action: "clear_sessions" });
    const clean = dedupHistory(data.history || []);
    for (let i = 0; i < clean.length; i++) {
      setMsg(`Uploading ${i + 1}/${clean.length}…`);
      await syncSession(clean[i], data.nextSession || {}, data.bodyWeightHistory || []);
    }
    await syncConfig(data);
    setSyncStatus("ok");
    setMsg(`✓ Deduped: ${clean.length} sessions in Sheets`);
    return clean;
  } catch(e) {
    setSyncStatus("error");
    setMsg(`✗ ${e.message}`);
    throw e;
  }
}

// Pull all sessions + config from Sheets and merge into localStorage data
async function restoreFromSheets(setData, setSyncStatus) {
  setSyncStatus("syncing");
  try {
    const [sessRes, cfgRes] = await Promise.all([
      sheetsPost({ action: "get_sessions" }),
      sheetsPost({ action: "get_config"  }),
    ]);
    if (!sessRes.ok) throw new Error(sessRes.error || "Failed");

    setData(d => {
      // Merge sessions — deduplicate by date+day, cloud wins on conflict
      // Normalise date to YYYY-MM-DD string (Sheets may return Date objects)
      const normDate = (d) => {
        if (!d) return "";
        const toISO = (dt) => {
          const y = dt.getFullYear();
          const mo = String(dt.getMonth()+1).padStart(2,"0");
          const day = String(dt.getDate()).padStart(2,"0");
          return `${y}-${mo}-${day}`;
        };
        if (d instanceof Date) return toISO(d);
        if (typeof d === "number") return toISO(new Date(d));
        const s = String(d);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        // Human-readable string (e.g. "Sun Apr 12") — try direct parse, then append year
        const direct = new Date(s);
        if (!isNaN(direct.getTime())) return toISO(direct);
        const withYear = new Date(`${s} ${new Date().getFullYear()}`);
        if (!isNaN(withYear.getTime())) return toISO(withYear);
        return s.slice(0, 10);
      };
      const existing = d.history || [];
      // Locally-known mode per date+day. The Sheets backend has no mode column
      // yet, so a restored session would come back untagged — and an untagged
      // session counts as weights. Re-apply the local tag to stop a restore
      // from silently promoting a TRX/BW session into weight progression.
      const localModes = {};
      existing.forEach(h => {
        if (!isWeightsMode(h.mode)) localModes[`${normDate(h.date)}|${h.day}`] = h.mode;
      });
      const cloud    = dedupHistory(
        (sessRes.sessions || [])
          .filter(s => s.date && s.day)
          .map(s => {
            const date = normDate(s.date);
            return { ...s, date, mode: s.mode || localModes[`${date}|${s.day}`] || DEFAULT_MODE };
          })
      );
      const merged   = [...cloud];
      existing.forEach(local => {
        const localDate = normDate(local.date);
        const localMode = local.mode || DEFAULT_MODE;
        if (!merged.find(c => c.date === localDate && c.day === local.day && (c.mode || DEFAULT_MODE) === localMode)) {
          merged.push({ ...local, date: localDate, mode: localMode });
        }
      });
      merged.sort((a,b) => new Date(b.date) - new Date(a.date));

      // Merge nextSession from most recent cloud session
      const latestNextSession = cloud.reduce((acc, s) => {
        if (s.nextSession && Object.keys(s.nextSession).length > 0) {
          return { ...acc, ...s.nextSession };
        }
        return acc;
      }, d.nextSession || {});

      // Merge bodyWeightHistory
      const bwCloud = cloud.flatMap(s => s.bodyWeightHistory || []);
      const bwLocal = d.bodyWeightHistory || [];
      const bwMerged = [...bwCloud, ...bwLocal]
        .filter((b, i, arr) => arr.findIndex(x => x.date === b.date) === i)
        .sort((a,b) => new Date(b.date) - new Date(a.date));

      // Restore config if available
      const cfg = cfgRes?.config || {};
      const profile   = cfg.profile   || {};
      const equipment = cfg.equipment || {};
      const baselines = cfg.baselines || d.profileBaseline || {};
      const favourites= cfg.favourites|| d.favourites      || {};
      const split     = cfg.split     || d.split           || [];

      return {
        ...d,
        ...profile,
        ...equipment,
        profileBaseline:    baselines,
        favourites:         favourites,
        split:              split,
        history:            merged,
        nextSession:        latestNextSession,
        bodyWeightHistory:  bwMerged,
        mesocycle:          reconcileMesocycle(d.mesocycle, merged),
      };
    });

    setSyncStatus("ok");
    return merged => merged; // resolved
  } catch(e) {
    setSyncStatus("error");
    throw e;
  }
}

async function callClaude(messages, system = "") {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${errText.slice(0,100)}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = data.content?.find(b => b.type === "text")?.text || "";
    if (!text) throw new Error("Empty response from API");
    return text;
  } catch(e) {
    throw new Error(e.message || "Network error");
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 },
  header: { background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "14px 20px", display: "flex", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  logo: { fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 22, color: "var(--amber)", letterSpacing: 2, textTransform: "uppercase" },
  section: { padding: "24px 20px 0", animation: "fadeUp .3s ease both" },
  h1: { fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 30, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  h2: { fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16, letterSpacing: 1, textTransform: "uppercase", color: "var(--amber)", marginBottom: 10, marginTop: 32 },
  sub: { color: "var(--muted)", fontSize: 11, marginBottom: 20, fontFamily: "var(--font-m)" },
  card: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 8 },
  cardRaised: { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 8 },
  divider: { height: 1, background: "var(--border)", margin: "16px 0" },
  btn: { background: "var(--amber)", color: "var(--on-accent)", border: "none", borderRadius: 6, padding: "11px 18px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 },
  btnOutline: { background: "transparent", color: "var(--amber)", border: "1px solid var(--amber)", borderRadius: 6, padding: "7px 13px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" },
  btnSm: { background: "var(--bg3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 14px", fontFamily: "var(--font-m)", fontSize: 11, cursor: "pointer", minHeight: 44, display: "inline-flex", alignItems: "center" },
  btnGreen: { background: "var(--green)", color: "var(--on-accent)", border: "none", borderRadius: 6, padding: "11px 18px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 },
  input: { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 11px", color: "var(--text)", fontFamily: "var(--font-m)", fontSize: 13, width: "100%", outline: "none", minHeight: 44 },
  label: { fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-m)", marginBottom: 4, display: "block" },
  chip: (a) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid " + (a ? "var(--amber)" : "var(--border)"), background: a ? "rgba(245,158,11,0.1)" : "var(--bg3)", cursor: "pointer", color: a ? "var(--amber)" : "var(--text)", fontFamily: "var(--font-b)", fontSize: 13, transition: "all .15s" }),
  navBar: { position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--bg2)", borderTop: "1px solid var(--border)", display: "flex", zIndex: 200 },
  navItem: (a) => ({ flex: 1, padding: "10px 0", textAlign: "center", cursor: "pointer", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: a ? "var(--amber)" : "var(--muted)", borderTop: a ? "2px solid var(--amber)" : "2px solid transparent", transition: "all .15s" }),
  spinner: { width: 16, height: 16, border: "2px solid var(--border)", borderTop: "2px solid var(--amber)", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" },
  aiBox: { background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: 12, marginTop: 10, fontFamily: "var(--font-b)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" },
  tag: (c) => ({ display: "inline-block", padding: "2px 6px", borderRadius: 4, background: c + "22", color: c, fontFamily: "var(--font-m)", fontSize: 10 }),
  warn: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontFamily: "var(--font-m)", fontSize: 12, color: "var(--red)" },
  info: { background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontFamily: "var(--font-m)", fontSize: 12, color: "var(--blue)" },
  success: { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontFamily: "var(--font-m)", fontSize: 12, color: "var(--green)" },
};

// ── Workout error boundary ────────────────────────────────────────────────────
class WorkoutErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 22, color: "var(--red)", marginBottom: 8 }}>WORKOUT ERROR</div>
        <div style={{ fontFamily: "var(--font-m)", fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
          {this.state.error.message || "Something went wrong."}<br />Your session data is preserved.
        </div>
        <button style={{ background: "var(--amber)", color: "var(--on-accent)", border: "none", borderRadius: 6, padding: "11px 20px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}
          onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    );
    return this.props.children;
  }
}

// ── BW Sparkline ─────────────────────────────────────────────────────────────
function BWSparkline({ data }) {
  if (!data || data.length < 2) return null;
  const weights = data.map(d => parseFloat(d.weight));
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 0.5;
  const W = 52, H = 22;
  const pts = weights.map((w, i) => [
    (i / (weights.length - 1)) * W,
    H - ((w - min) / range) * (H - 6) - 3,
  ]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ overflow: "visible", display: "block", flexShrink: 0 }}>
      <path d={path} fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill="var(--blue)" />
    </svg>
  );
}

// ── Rest Timer ────────────────────────────────────────────────────────────────
function RestTimer({ seconds }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining]);
  // Haptic on timer complete
  useEffect(() => {
    if (remaining === 0 && running) {
      if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    }
  }, [remaining, running]);
  const pct = ((seconds - remaining) / seconds) * 100;
  const fmt = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  const color = remaining < 10 ? "var(--red)" : "var(--amber)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg3)", borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
      <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
        <svg width="42" height="42" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="21" cy="21" r="17" fill="none" stroke="var(--border)" strokeWidth="3" />
          <circle cx="21" cy="21" r="17" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={String(2 * Math.PI * 17)} strokeDashoffset={String(2 * Math.PI * 17 * (1 - pct / 100))}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset .5s" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-m)", fontSize: 10, color }}>
          {fmt(remaining)}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>REST TIMER</div>
        {remaining === 0 && <div style={{ color: "var(--green)", fontSize: 12, fontFamily: "var(--font-h)", fontWeight: 700 }}>GO! Next set</div>}
      </div>
      <button style={S.btnSm} onClick={() => { if (running) { setRunning(false); setRemaining(seconds); } else { setRemaining(seconds); setRunning(true); if (navigator.vibrate) navigator.vibrate(50); } }}>
        {running ? "Stop" : "Start"}
      </button>
    </div>
  );
}

// ── Equipment Screen ──────────────────────────────────────────────────────────
function EquipmentScreen({ data, setData, onNext }) {
  const eq = data.equipment || [];
  const toggle = id => setData(d => ({ ...d, equipment: eq.includes(id) ? eq.filter(e => e !== id) : [...eq, id] }));
  const hasDumbbells = eq.includes("dumbbells");
  const hasBarbell = eq.includes("barbell");
  const hasEzBar = eq.includes("ezbar");

  const preFill = () => setData(d => ({ ...d, ...PREFILLED_DATA }));

  return (
    <div style={S.section}>
      <div style={S.h1}>Your <span style={{ color: "var(--amber)" }}>Arsenal</span></div>
      <div style={S.sub}>SELECT ALL EQUIPMENT AVAILABLE AT HOME</div>

      {/* Pre-fill banner */}
      <div style={{ ...S.card, border: "1px solid var(--green)", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, color: "var(--green)" }}>YOUR GYM DETECTED</div>
          <div style={{ fontFamily: "var(--font-m)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Pre-fill all equipment from photo scan</div>
        </div>
        <button style={{ ...S.btnGreen, padding: "8px 14px", fontSize: 13 }} onClick={preFill}>Auto-fill</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {EQUIPMENT_LIST.map(e => (
          <button key={e.id} type="button" style={{ ...S.chip(eq.includes(e.id)), flexDirection: "column", gap: 3, padding: "12px 8px", textAlign: "center", justifyContent: "center", minHeight: 64, width: "100%" }} onClick={() => toggle(e.id)}>
            <span style={{ fontSize: 22 }}>{e.icon}</span>
            <span style={{ fontSize: 12 }}>{e.label}</span>
          </button>
        ))}
      </div>

      {hasDumbbells && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>Dumbbell Details</div>
          <label htmlFor="dbWeights" style={S.label}>ALL WEIGHTS AVAILABLE (kg) — comma separated</label>
          <input id="dbWeights" style={{ ...S.input, marginBottom: 10 }} placeholder="e.g. 1, 2, 4.5, 8, 16, 24" value={data.dumbbellWeights || ""} onChange={e => setData(d => ({ ...d, dumbbellWeights: e.target.value }))} />
          <label htmlFor="dbMax" style={S.label}>MAX SINGLE DUMBBELL (kg)</label>
          <input id="dbMax" style={S.input} type="number" placeholder="e.g. 24" value={data.dumbbellMax || ""} onChange={e => setData(d => ({ ...d, dumbbellMax: e.target.value }))} />
        </div>
      )}

      {hasBarbell && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>Barbell Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label htmlFor="barType" style={S.label}>BAR TYPE</label>
              <select id="barType" style={S.input} value={data.barType || "standard"} onChange={e => setData(d => ({ ...d, barType: e.target.value, barWeight: e.target.value === "standard" ? "20" : e.target.value === "women" ? "15" : e.target.value === "ez" ? "10" : d.barWeight }))}>
                <option value="standard">Standard (20kg)</option>
                <option value="women">Women's (15kg)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label htmlFor="barWeight" style={S.label}>BAR WEIGHT (kg)</label>
              <input id="barWeight" style={S.input} type="number" placeholder="e.g. 14" value={data.barWeight || ""} onChange={e => setData(d => ({ ...d, barWeight: e.target.value }))} />
            </div>
          </div>
          <label htmlFor="barbellPlates" style={S.label}>PLATES (pairs available)</label>
          <input id="barbellPlates" style={{ ...S.input, marginBottom: 8 }} placeholder="e.g. 2x20, 2x10, 2x5, 2x2.5" value={data.barbellPlates || ""} onChange={e => setData(d => ({ ...d, barbellPlates: e.target.value }))} />
          <label htmlFor="barbellMax" style={S.label}>MAX TOTAL LOADED WEIGHT (kg)</label>
          <input id="barbellMax" style={S.input} type="number" placeholder="e.g. 119" value={data.barbellMax || ""} onChange={e => setData(d => ({ ...d, barbellMax: e.target.value }))} />
        </div>
      )}

      {eq.includes("dipbelt") && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>Dip Belt Setup</div>
          <div style={{ ...S.info, marginBottom: 8 }}>Hang Olympic plates from the chain. Add weight to pull-ups, chin-ups, dips and push-ups.</div>
          <label htmlFor="dipbeltMax" style={S.label}>MAX PLATE WEIGHT YOU CAN ATTACH (kg)</label>
          <input id="dipbeltMax" style={S.input} type="number" placeholder="e.g. 20" value={data.dipbeltMax || ""} onChange={e => setData(d => ({ ...d, dipbeltMax: e.target.value }))} />
        </div>
      )}
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>EZ Curl Bar Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label htmlFor="ezbarWeight" style={S.label}>BAR WEIGHT (kg)</label>
              <input id="ezbarWeight" style={S.input} type="number" placeholder="e.g. 8" value={data.ezbarWeight || ""} onChange={e => setData(d => ({ ...d, ezbarWeight: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="ezbarMax" style={S.label}>MAX LOADED (kg)</label>
              <input id="ezbarMax" style={S.input} type="number" placeholder="e.g. 113" value={data.ezbarMax || ""} onChange={e => setData(d => ({ ...d, ezbarMax: e.target.value }))} />
            </div>
          </div>
          <label htmlFor="ezbarPlates" style={S.label}>PLATES (same as barbell)</label>
          <input id="ezbarPlates" style={S.input} placeholder="e.g. 2x20, 2x10, 2x5, 2x2.5" value={data.ezbarPlates || ""} onChange={e => setData(d => ({ ...d, ezbarPlates: e.target.value }))} />
        </div>
      )}

      <button style={{ ...S.btn, width: "100%", justifyContent: "center", marginTop: 4, marginBottom: 20 }} disabled={eq.length === 0} onClick={onNext}>Continue</button>
    </div>
  );
}

// ── Profile Screen ────────────────────────────────────────────────────────────
function ProfileScreen({ data, setData, onNext, onBack }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const setBaseline = (name, field, val) => setData(d => ({ ...d, profileBaseline: { ...d.profileBaseline, [name]: { ...(d.profileBaseline?.[name] || {}), [field]: val } } }));
  const eq = data.equipment || [];
  const validRefs = REFERENCE_EXERCISES.filter(r => r.eq === "bodyweight" || eq.includes(r.eq));
  const bmi = data.weight && data.height ? (parseFloat(data.weight) / Math.pow(parseFloat(data.height) / 100, 2)).toFixed(1) : null;
  const bmiColor = !bmi ? "var(--muted)" : bmi < 18.5 ? "var(--blue)" : bmi < 25 ? "var(--green)" : bmi < 30 ? "var(--amber)" : "var(--red)";
  const bmiLabel = !bmi ? "" : bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";
  const isOld = parseInt(data.age) >= 40;
  const isBegin = data.level === "Beginner";
  const valid = data.age && data.weight && data.height && data.level && data.goal && data.days;

  return (
    <div style={S.section}>
      <div style={S.h1}>Athlete <span style={{ color: "var(--amber)" }}>Profile</span></div>
      <div style={S.sub}>YOUR DATA SHAPES EVERY RECOMMENDATION</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        {[["AGE","age","32"],["DAYS/WEEK","days","1-7"],["WEIGHT (kg)","weight","80"],["HEIGHT (cm)","height","178"]].map(([l,k,p]) => (
          <div key={k}>
            <label htmlFor={`profile-${k}`} style={S.label}>{l}</label>
            <input id={`profile-${k}`} style={S.input} type="number" placeholder={p} value={data[k] || ""} onChange={e => set(k, e.target.value)} />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label htmlFor="profile-bodyWeight" style={S.label}>BODY WEIGHT FOR LOG (kg) — tracked over time</label>
        <input id="profile-bodyWeight" style={S.input} type="number" placeholder="e.g. 82.5" value={data.bodyWeight || ""} onChange={e => set("bodyWeight", e.target.value)} />
      </div>

      {bmi && <div style={{ ...S.info, color: bmiColor, marginBottom: 10 }}>BMI {bmi} - {bmiLabel}</div>}
      {isOld && <div style={{ ...S.warn, marginBottom: 10 }}>40+ Protocol: longer warmup, extra rest, joint-friendly variants recommended</div>}

      <div style={S.h2}>Experience Level</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {["Beginner","Intermediate","Advanced"].map(l => (
          <button key={l} type="button" style={{ ...S.chip(data.level === l), flex: 1, justifyContent: "center", minHeight: 44 }} onClick={() => set("level", l)}>{l}</button>
        ))}
      </div>
      {isBegin && <div style={{ ...S.info, marginBottom: 4 }}>Beginner mode: keep RIR 3+, gradual progression</div>}

      <div style={S.h2}>Primary Goal</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
        {GOALS.map(g => (
          <button key={g.id} type="button" style={{ ...S.chip(data.goal === g.id), flexDirection: "column", gap: 2, padding: "10px 8px", textAlign: "center", minHeight: 72, width: "100%" }} onClick={() => set("goal", g.id)}>
            <span style={{ fontSize: 18 }}>{g.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>{g.label}</span>
            <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-m)" }}>{g.desc}</span>
          </button>
        ))}
      </div>

      {validRefs.length > 0 && (
        <>
          <div style={S.h2}>Current Performance Baseline</div>
          <div style={S.sub}>STARTING POINT FOR WEIGHT SUGGESTIONS — ACTUAL RECORDS OVERRIDE THIS</div>
          {validRefs.map(ref => (
            <div key={ref.name} style={{ ...S.card, marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{ref.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: ref.type === "weight" ? "1fr 1fr" : "1fr", gap: 8 }}>
                {ref.type === "weight" && (
                  <div>
                    <label htmlFor={`bl-${ref.name}-w`} style={S.label}>WEIGHT (kg)</label>
                    <input id={`bl-${ref.name}-w`} style={S.input} type="number" placeholder="e.g. 60" value={data.profileBaseline?.[ref.name]?.weight || ""} onChange={e => setBaseline(ref.name, "weight", e.target.value)} />
                  </div>
                )}
                <div>
                  <label htmlFor={`bl-${ref.name}-r`} style={S.label}>{ref.type === "reps" ? "MAX REPS" : "REPS AT THAT WEIGHT"}</label>
                  <input id={`bl-${ref.name}-r`} style={S.input} type="number" placeholder={ref.type === "reps" ? "e.g. 20" : "e.g. 8"} value={data.profileBaseline?.[ref.name]?.reps || ""} onChange={e => setBaseline(ref.name, "reps", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12, marginBottom: 20 }}>
        <button style={{ ...S.btnOutline, flex: "0 0 auto", padding: "11px 18px" }} onClick={onBack}>← Equipment</button>
        <button style={{ ...S.btn, flex: 1, justifyContent: "center" }} disabled={!valid} onClick={() => { syncConfig(data); onNext(); }}>Build My Schedule</button>
      </div>
    </div>
  );
}

// ── Schedule Screen ───────────────────────────────────────────────────────────
function ScheduleScreen({ data, setData, onNext }) {
  const days = Math.min(parseInt(data.days) || 3, 7);
  const split = SPLITS[days] || SPLITS[3];
  const rr = REP_RANGES[data.goal] || REP_RANGES.general;
  const goal = GOALS.find(g => g.id === data.goal);
  const deload = shouldDeload(data.history);
  useEffect(() => { setData(d => ({ ...d, split })); }, []);

  return (
    <div style={S.section}>
      <div style={S.h1}>Your <span style={{ color: "var(--amber)" }}>Schedule</span></div>
      <div style={S.sub}>RECOMMENDED FOR {days} DAYS/WEEK - {goal?.label?.toUpperCase()}</div>

      {deload && <div style={{ ...S.warn, marginBottom: 10 }}>DELOAD RECOMMENDED - Reduce weight 40% this week. Recovery is where gains happen.</div>}

      <div style={{ ...S.card, border: "1px solid var(--amber)", marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{goal?.icon} {goal?.label} Protocol</div>
        <div style={{ fontFamily: "var(--font-m)", fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          {rr.sets} sets x {rr.reps} reps - Rest {Math.floor(rr.restSec/60)}:{String(rr.restSec%60).padStart(2,"0")} - Target RIR {rr.rirMin}-{(rr.rirMin||2)+1}
        </div>
        <span style={S.tag("var(--amber)")}>{rr.note}</span>
      </div>

      <div style={S.h2}>Weekly Split</div>
      {split.map((day, i) => {
        const warnings = getMuscleWarnings(day, data.history);
        return (
          <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: day === "REST" ? "var(--bg3)" : "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 12, color: "var(--amber)", flexShrink: 0 }}>D{i+1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16 }}>{day}</div>
              <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>{(SPLIT_MAP[day]||[]).join(" - ") || "Recovery day"}</div>
              {warnings.map((w,wi) => <div key={wi} style={{ fontSize: 10, color: "var(--red)", fontFamily: "var(--font-m)", marginTop: 2 }}>{w}</div>)}
            </div>
            {day !== "REST" && <button style={S.btnSm} onClick={() => { setData(d => ({ ...d, activeDay: day, activeMode: DEFAULT_MODE })); onNext(); }}>Start</button>}
          </div>
        );
      })}
      <button style={{ ...S.btn, width: "100%", justifyContent: "center", marginTop: 8, marginBottom: 20 }} onClick={() => { setData(d => ({ ...d, activeDay: split[0], activeMode: DEFAULT_MODE })); onNext(); }}>
        Start Day 1: {split[0]}
      </button>
    </div>
  );
}

// ── Exercise Card ─────────────────────────────────────────────────────────────
function ExerciseCard({ ex, exNum, totalEx, goal, data, sessionLog, setSessionLog, history }) {
  const [expanded, setExpanded] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [tip, setTip] = useState("");
  const [loadingTip, setLoadingTip] = useState(false);
  const [alts, setAlts] = useState([]);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [swappedTo, setSwappedTo] = useState(null);

  const activeEx = swappedTo || ex;
  const isTimed = !!activeEx.timed;
  const timedSec = activeEx.timedSec || 60;
  const repOverride = activeEx.repOverride || null;
  const repsOnly    = activeEx.repsOnly    || false;

  const rr = REP_RANGES[goal] || REP_RANGES.general;
  const effectiveSets = 3; // core/timed always 3 sets
  const key = activeEx.name;

  // Exercise type flags — needed for weight display labels
  const isDipBelt = ["Weighted Dip","Weighted Pull-Up","Weighted Chin-Up","Weighted Push-Up"].includes(key);
  const isBarbell = ["Barbell Bench Press","Barbell Squat","Barbell Deadlift","Barbell Row","Overhead Press","Romanian Deadlift","Close-Grip Bench Press"].includes(key);
  const isEZ     = ["EZ Bar Curl","EZ Bar Skull Crusher","EZ Bar Reverse Curl","EZ Bar Upright Row"].includes(key);

  const _meso    = initMesocycle(data.mesocycle);
  const _isDeload   = _meso.phase === "deload";
  const _isIntense  = _meso.phase === "intensification";
  const numSets = (isTimed || repOverride) ? effectiveSets : _isDeload ? 2 : rr.sets;
  const suggestion = useMemo(
    () => getSmartSuggestion(key, goal, history, data.profileBaseline, data),
    [key, goal, history, data.profileBaseline, data.nextSession, data.activeMode, data.barWeight, data.barbellPlates, data.ezbarWeight, data.ezbarPlates, data.dumbbellMax]
  );
  // A rep-target plan (bodyweight / TRX / reps-only progression) beats the
  // static rep range — that is how those modes actually progress.
  const isPlanned     = suggestion?.source === "planned" || suggestion?.source === "ai_planned";
  const plannedReps   = isPlanned && !suggestion?.weight ? suggestion.reps : null;
  const effectiveReps = plannedReps || repOverride || rr.reps;
  // Bottom of the target range — what the set input hints at, so the box agrees
  // with TODAY'S TARGET rather than echoing last session's rep count.
  const repsHint      = String(effectiveReps).split("-")[0];
  const sets = sessionLog[key] || Array.from({ length: numSets }, () => isTimed ? { seconds: "", rpe: "" } : { weight: suggestion?.weight || "", reps: "", rpe: "" });
  const weightDisplay = suggestion?.weight ? formatWeightDisplay(key, suggestion.weight, data) : null;

  const prevSession = (history || []).find(h => h.log?.[key]);
  const prevSets = prevSession?.log?.[key] || [];
  // Best historical 1RM for live PR detection
  const bestHistorical1RM = useMemo(() => {
    const b = getBestRecord(key, history, data.profileBaseline);
    return b.weight ? calc1RM(b.weight, b.reps) : 0;
  }, [key, history, data.profileBaseline]);

  const updateSet = (i, field, val) => {
    const next = sets.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
    setSessionLog(l => ({ ...l, [key]: next }));
  };

  const workingWeight = parseFloat(sets.find(s => s.weight)?.weight) || parseFloat(suggestion?.weight) || 0;

  // Snap a target weight to nearest achievable barbell/EZ load
  const snapBar = (targetKg, barW, plateStr) => {
    if (!plateStr) return parseFloat(targetKg).toFixed(1);
    const result = calcPlates(targetKg, barW, plateStr);
    return result.total.toFixed(1);
  };

  const BIG4_BENCH    = ["Barbell Bench Press","Close-Grip Bench Press"];
  const BIG4_OHP      = ["Overhead Press"];
  const BIG4_SQUAT    = ["Barbell Squat"];
  const BIG4_DEAD     = ["Barbell Deadlift"];
  const barW  = data.barWeight   || "14";
  const bPlts = data.barbellPlates || "";
  const ezW   = data.ezbarWeight || "8";
  const ezPlt = data.ezbarPlates || "";

  const warmupSets = useMemo(() => {
  let sets = [];
  try { if (!isTimed && !repsOnly && workingWeight > 0) {
    if (BIG4_BENCH.includes(key) || BIG4_OHP.includes(key)) {
      sets = [
        { label:"W1", pct:"bar",  kg: snapBar(parseFloat(barW), barW, bPlts), reps:10 },
        { label:"W2", pct:"50%",  kg: snapBar(workingWeight*0.50, barW, bPlts), reps:8 },
        { label:"W3", pct:"70%",  kg: snapBar(workingWeight*0.70, barW, bPlts), reps:5 },
        { label:"W4", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:3 },
      ];
    } else if (BIG4_SQUAT.includes(key)) {
      sets = [
        { label:"W1", pct:"bar",  kg: snapBar(parseFloat(barW), barW, bPlts), reps:10 },
        { label:"W2", pct:"50%",  kg: snapBar(workingWeight*0.50, barW, bPlts), reps:8 },
        { label:"W3", pct:"70%",  kg: snapBar(workingWeight*0.70, barW, bPlts), reps:5 },
        { label:"W4", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:3 },
      ];
    } else if (BIG4_DEAD.includes(key)) {
      sets = [
        { label:"W1", pct:"40%",  kg: snapBar(workingWeight*0.40, barW, bPlts), reps:8 },
        { label:"W2", pct:"60%",  kg: snapBar(workingWeight*0.60, barW, bPlts), reps:5 },
        { label:"W3", pct:"75%",  kg: snapBar(workingWeight*0.75, barW, bPlts), reps:3 },
        { label:"W4", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:2 },
      ];
    } else if (isBarbell && workingWeight > 20) {
      sets = [
        { label:"W1", pct:"50%",  kg: snapBar(workingWeight*0.50, barW, bPlts), reps:8 },
        { label:"W2", pct:"70%",  kg: snapBar(workingWeight*0.70, barW, bPlts), reps:5 },
        { label:"W3", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:3 },
      ];
    } else if (isEZ && workingWeight > 14) {
      sets = [
        { label:"W1", pct:"50%",  kg: snapBar(workingWeight*0.50, ezW, ezPlt), reps:8 },
        { label:"W2", pct:"75%",  kg: snapBar(workingWeight*0.75, ezW, ezPlt), reps:5 },
      ];
    } else if (isDumbbell && workingWeight > 16) {
      sets = [
        { label:"W1", pct:"60%",  kg: (workingWeight*0.6).toFixed(1), reps:8 },
        { label:"W2", pct:"80%",  kg: (workingWeight*0.8).toFixed(1), reps:5 },
      ];
    }
    sets = sets.filter(ws => parseFloat(ws.kg) < workingWeight);
  } } catch(e) { sets = []; }
  return sets;
  }, [key, isTimed, repsOnly, workingWeight, barW, bPlts, ezW, ezPlt, isBarbell, isEZ]);

  const totalVol = sets.reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
  const prevVol = prevSets.reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
  const volDiff = prevVol > 0 && totalVol > 0 ? ((totalVol-prevVol)/prevVol*100).toFixed(0) : null;
  const tips = TECHNIQUE[key] || null;

  const getTip = async () => {
    setLoadingTip(true); setTip("");
    try {
      const system = "You are a direct personal trainer. Plain text only, no markdown headers, under 150 words.";
      const best = getBestRecord(key, history, data.profileBaseline);
      const prompt = `Exercise: ${key} (${activeEx.muscle}). Athlete: ${data.level}, goal: ${goal}, age: ${data.age}${parseInt(data.age)>=40?" (40+ protocol)":""}, bodyweight: ${data.weight}kg. Best record: ${best.weight?best.weight+"kg×"+best.reps+" reps":"no record yet"}. Today target: ${weightDisplay?.total||suggestion?.weight||"bodyweight"} × ${suggestion?.reps||rr.reps}. Give: 1) 2 form cues 2) 1 common mistake 3) 1 progression tip. Direct and concise.`;
      const result = await callClaude([{ role:"user", content:prompt }], system);
      setTip(result);
    } catch(e) {
      setTip("__ERROR__:" + (e.message || "Connection failed"));
    }
    setLoadingTip(false);
  };

  const getAlts = async () => {
    setLoadingAlts(true); setAlts([]);
    try {
      // Use plain text format — much more reliable than JSON parsing
      const system = "You are a personal trainer. Respond with EXACTLY 3 lines, each line formatted as: NAME|MUSCLE|REASON|EQUIPMENT. No other text, no numbering, no markdown.";
      const prompt = `Replace: "${key}" targeting ${activeEx.muscle}. Equipment available: ${(data.equipment||[]).join(", ")}. Max dumbbell: ${data.dumbbellMax||24}kg. Goal: ${goal}. List 3 alternatives for same muscle group.`;
      const raw = await callClaude([{ role:"user", content:prompt }], system);
      // Parse pipe-delimited lines
      const lines = raw.trim().split("\n").filter(l => l.includes("|")).slice(0,3);
      const parsed = lines.map(line => {
        const parts = line.split("|").map(s => s.trim());
        return { name: parts[0]||"", muscle: parts[1]||activeEx.muscle, reason: parts[2]||"", equipment_needed: parts[3]||"" };
      }).filter(a => a.name);
      if (parsed.length > 0) {
        setAlts(parsed);
      } else {
        // Last resort: try JSON if pipe format didn't work
        try {
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const jsonParsed = JSON.parse(jsonMatch[0]);
            setAlts(Array.isArray(jsonParsed) ? jsonParsed.slice(0,3) : []);
          } else {
            setAlts([{ name:"Retry", muscle:activeEx.muscle, reason:"Tap Swap again to load alternatives", equipment_needed:"" }]);
          }
        } catch { setAlts([{ name:"Retry", muscle:activeEx.muscle, reason:"Tap Swap again to load alternatives", equipment_needed:"" }]); }
      }
    } catch(e) {
      setAlts([{ name:"__ERROR__", muscle:"", reason: e.message || "Network error — tap Swap again", equipment_needed:"" }]);
    }
    setLoadingAlts(false);
  };

  const doSwap = (alt) => {
    // Carry the logging shape across the swap — in TRX/BW mode a replacement
    // must stay reps+RIR rather than sprouting a weight field.
    setSwappedTo({
      name: alt.name, muscle: alt.muscle, eq: ["bodyweight"], unilateral: false,
      cat: activeEx.cat, isFav: false,
      ...(repOverride ? { repOverride } : {}),
      ...(repsOnly    ? { repsOnly }    : {}),
    });
    setAlts([]); setTip(""); setExpanded(false);
  };

  const rirColor = rir => { const r=parseInt(rir); return !r?"var(--border)":r<=1?"var(--red)":r<=3?"var(--amber)":"var(--blue)"; };

  return (
    <div style={{ ...S.card, border: expanded ? "1px solid rgba(245,158,11,0.5)" : "1px solid var(--border)", transition:"border .2s" }}>

      {/* ── Header row ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, flex:1 }}>
          {/* Large exercise number */}
          <div style={{ flexShrink:0, textAlign:"center", minWidth:36 }}>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:32, color:"var(--amber)", lineHeight:1 }}>{exNum}</div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>/{totalEx}</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:17, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              {activeEx.isFav && <span>❤️</span>}
              {activeEx.name}
              {swappedTo && <span style={S.tag("var(--blue)")}>swapped</span>}
              {activeEx.unilateral && <span style={S.tag("var(--purple)")}>unilateral</span>}
            </div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginTop:2 }}>{activeEx.muscle}</div>
          </div>
        </div>
        <button style={S.btnSm} aria-label={expanded ? "Collapse exercise" : "Log sets"} onClick={() => setExpanded(e => !e)}>{expanded ? "▲" : "Log"}</button>
      </div>

      {/* ── TODAY'S TARGET — always visible ── */}
      <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
      <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--amber)", letterSpacing:1 }}>TODAY'S TARGET</div>
      {suggestion?.source === "planned" && (
        <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:4, background:"rgba(34,197,94,0.13)", color:"var(--green)", fontFamily:"var(--font-m)", fontSize:10 }}>📋 RIR-planned</span>
      )}
      {suggestion?.source === "ai_planned" && (
        <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:4, background:"rgba(168,85,247,0.13)", color:"var(--purple)", fontFamily:"var(--font-m)", fontSize:10 }}>🤖 AI-adjusted</span>
      )}
    </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
          {isTimed ? (
            <>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:26, color:"var(--amber)", lineHeight:1 }}>{timedSec}s</span>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18, color:"var(--text)" }}>hold</span>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:600, fontSize:14, color:"var(--muted)" }}>{effectiveSets} sets</span>
              <span style={S.tag("var(--blue)")}>timed</span>
            </>
          ) : (
            <>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:26, color:"var(--amber)", lineHeight:1 }}>
                {suggestion && weightDisplay?.total ? `${weightDisplay.total}kg`
                  : suggestion?.weight ? `${suggestion.weight}kg` : "BW"}
              </span>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18, color:"var(--text)" }}>
                × {effectiveReps}
              </span>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:600, fontSize:14, color:"var(--muted)" }}>
                {numSets} sets
              </span>
              {suggestion?.oneRM && (
                <span style={{ ...S.tag("var(--purple)"), fontSize:10 }}>
                  {isDipBelt || isBarbell || isEZ ? `1RM ~${suggestion.oneRM}kg` : `per-hand 1RM ~${suggestion.oneRM}kg`}
                </span>
              )}
              {repOverride && <span style={S.tag("var(--blue)")}>fixed range</span>}
            </>
          )}
        </div>
        {!isTimed && weightDisplay?.detail && (
          <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginTop:4 }}>{weightDisplay.detail}</div>
        )}
        {!isTimed && suggestion?.source === "intensification" && (
          <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--amber)", marginTop:2 }}>
            💪 Intensification — {suggestion.intensificationNote}
          </div>
        )}
        {!isTimed && suggestion?.source === "estimated" && (
          <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--blue)", marginTop:2 }}>estimated from {CROSS_RATIOS[key]?.from}</div>
        )}
        {!isTimed && suggestion?.planRIR !== undefined && (
          <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--green)", marginTop:2 }}>last session avg RIR {suggestion.planRIR} → adjusted</div>
        )}
        {!isTimed && !suggestion && !repOverride && (
          <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginTop:2 }}>Log first session to get weight suggestions</div>
        )}
      </div>

      {/* ── Last session ── */}
      {prevSets.filter(s=>s.reps||s.seconds).length > 0 && (
        <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginBottom:6, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span>Last:</span>
          {prevSets.filter(s=>s.reps||s.seconds).map((s,i) => (
            <span key={i} style={{ background:"var(--bg3)", borderRadius:4, padding:"2px 6px" }}>
              {s.seconds ? `${s.seconds}s` : `${s.weight||"BW"}kg×${s.reps}`}
              {s.rpe?<span style={{ color:rirColor(s.rpe) }}>RIR{s.rpe}</span>:""}
            </span>
          ))}
          {volDiff !== null && totalVol > 0 && (
            <span style={{ color:parseInt(volDiff)>=0?"var(--green)":"var(--red)" }}>{parseInt(volDiff)>=0?"+":""}{volDiff}%</span>
          )}
        </div>
      )}

      {/* ── Description dropdown ── */}
      <div style={{ marginBottom:6 }}>
        <button style={{ ...S.btnSm, width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", marginBottom: showDesc ? 6 : 0 }}
          aria-label={showDesc ? "Hide technique cues" : "Show technique cues"}
          onClick={() => setShowDesc(d => !d)}>
          <span>📖 Technique cues</span>
          <span aria-hidden="true">{showDesc ? "▲" : "▼"}</span>
        </button>
        {showDesc && tips && (
          <div style={{ background:"var(--bg3)", borderRadius:6, padding:"10px 12px", animation:"fadeUp .15s ease both", display:"grid", gap:6 }}>
            {[
              { label:"Setup",    text:tips.setup },
              { label:"Movement", text:tips.movement },
              { label:"Feel",     text:tips.feel, accent:true },
              { label:"Mistake",  text:tips.mistake },
            ].map(row => (
              <div key={row.label} style={{ lineHeight:1.5 }}>
                <span style={{ fontFamily:"var(--font-m)", fontSize:9, letterSpacing:1, textTransform:"uppercase", color: row.accent ? "var(--green)" : "var(--muted)", marginRight:6 }}>{row.label}</span>
                <span style={{ fontFamily:"var(--font-b)", fontSize:13, color: row.accent ? "var(--green)" : "var(--text)", fontWeight: row.accent ? 600 : 400 }}>{row.text}</span>
              </div>
            ))}
          </div>
        )}
        {showDesc && !tips && (
          <div style={{ background:"var(--bg3)", borderRadius:6, padding:"10px 12px", fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>
            No technique notes for this exercise yet.
          </div>
        )}
      </div>

      {/* ── AI Tips — always visible ── */}
      <div style={{ marginBottom:6 }}>
        <button style={{ ...S.btnSm, width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", marginBottom: tip ? 6 : 0, opacity: loadingTip ? 0.6 : 1 }}
          onClick={loadingTip ? undefined : (tip ? () => setTip("") : getTip)}>
          <span>⚡ AI Coach tip</span>
          <span style={{ color:"var(--amber)" }}>{loadingTip ? "Loading..." : tip ? "▲ Hide" : "Get tip →"}</span>
        </button>
        {loadingTip && (
          <div style={{ display:"flex", gap:8, alignItems:"center", padding:"8px 12px", background:"var(--bg3)", borderRadius:6 }}>
            <div style={S.spinner} /><span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Coach is thinking...</span>
          </div>
        )}
        {tip && !loadingTip && tip.startsWith("__ERROR__:") && (
          <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--red)" }}>
              {tip.replace("__ERROR__:","").trim()}
            </span>
            <button style={{ ...S.btnSm, flexShrink:0 }} onClick={getTip}>Retry</button>
          </div>
        )}
        {tip && !loadingTip && !tip.startsWith("__ERROR__:") && (
          <div style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:6, padding:"10px 12px", fontFamily:"var(--font-b)", fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap", color:"var(--text)", animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
            {tip}
          </div>
        )}
      </div>

      {/* ── Swap button ── */}
      <div style={{ marginBottom: expanded ? 10 : 0 }}>
        <button style={{ ...S.btnSm, width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", opacity: loadingAlts ? 0.6 : 1 }}
          onClick={loadingAlts ? undefined : getAlts}>
          <span>🔄 {swappedTo ? "Swap again" : "Swap exercise"}</span>
          <span style={{ color:"var(--amber)" }}>{loadingAlts ? "Loading..." : "AI →"}</span>
        </button>
        {alts.length > 0 && (
          <div style={{ marginTop:8, animation:"fadeUp .15s ease both" }}>
            {alts[0]?.name === "__ERROR__" ? (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--red)" }}>{alts[0].reason}</span>
                <button style={{ ...S.btnSm, flexShrink:0 }} onClick={() => { setAlts([]); getAlts(); }}>Retry</button>
              </div>
            ) : (
              <>
                {alts.map((a,i) => (
                  <div key={i} style={{ ...S.card, padding:"10px 12px", marginBottom:6, display:"flex", alignItems:"center", gap:10, cursor:"pointer", border:"1px solid var(--border)" }}
                    onClick={() => doSwap(a)}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14 }}>{a.name}</div>
                      <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>{a.muscle} · {a.reason}</div>
                      {a.equipment_needed && <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--blue)", marginTop:2 }}>{a.equipment_needed}</div>}
                    </div>
                    <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:13, color:"var(--green)", flexShrink:0 }}>Use →</span>
                  </div>
                ))}
                <button style={S.btnSm} onClick={() => setAlts([])}>✕ Close</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Expanded log section ── */}
      {expanded && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both", borderTop:"1px solid var(--border)", paddingTop:14, marginTop:8 }}>
          {!isTimed && warmupSets.length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--blue)", marginBottom:6, letterSpacing:1 }}>WARM-UP SETS</div>
              {warmupSets.map((ws,i) => {
                const wuDisplay = formatWeightDisplay(key, ws.kg, data);
                return (
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:4, alignItems:"center" }}>
                    <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--blue)", width:20 }}>{ws.label}</span>
                    <span style={{ fontFamily:"var(--font-m)", fontSize:12, color:"var(--muted)", flex:1 }}>
                      {wuDisplay?.total ?? ws.kg}kg × {ws.reps}
                    </span>
                    {wuDisplay?.detail && <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>{wuDisplay.detail}</span>}
                    <span style={S.tag("var(--blue)")}>{ws.pct}</span>
                  </div>
                );
              })}
              <div style={{ height:1, background:"var(--border)", margin:"8px 0" }} />
            </div>
          )}

          <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", marginBottom:8, letterSpacing:1 }}>
            {isTimed ? "LOG SETS — seconds held / RIR (0=max effort, 2-3=target)" : repsOnly ? "LOG SETS — reps only" : "LOG SETS — weight kg / reps / RIR (0=failure, 2-3=target)"}
          </div>

          {sets.map((set,i) => {
            if (isTimed) {
              // Timed exercise — log seconds + RPE
              const secs = parseInt(set.seconds) || 0;
              return (
                <div key={i} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", width:20 }}>S{i+1}</span>
                    <input style={{ ...S.input, flex:2 }} type="number"
                      placeholder={String(timedSec)} value={set.seconds||""}
                      onChange={e => updateSet(i,"seconds",e.target.value)} />
                    <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>sec</span>
                    <input style={{ ...S.input, flex:1, borderColor:rirColor(set.rpe) }} type="number"
                      min="1" max="10" placeholder="RIR" value={set.rpe||""}
                      onChange={e => updateSet(i,"rpe",e.target.value)} />
                    {secs > 0 && (
                      <span style={{ ...S.tag(secs >= timedSec ? "var(--green)" : "var(--amber)"), whiteSpace:"nowrap", fontSize:10 }}>
                        {secs >= timedSec ? "✓" : secs + "s"}
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            // Standard weighted or rep-based exercise
            const setDisplay = set.weight ? formatWeightDisplay(key, set.weight, data) : null;
            return (
              <div key={i} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                  <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", width:20 }}>S{i+1}</span>
                  {!repOverride && (
                    <>
                      <input style={{ ...S.input, flex:2 }} type="number"
                        placeholder={suggestion?.weight || prevSets[i]?.weight || "kg"} value={set.weight||""}
                        onChange={e => updateSet(i,"weight",e.target.value)} />
                      <span style={{ color:"var(--muted)", fontSize:11 }}>×</span>
                    </>
                  )}
                  <input style={{ ...S.input, flex:1.5 }} type="number"
                    placeholder={repsHint} value={set.reps||""}
                    onChange={e => updateSet(i,"reps",e.target.value)} />
                  {!repsOnly && (
                    <input style={{ ...S.input, flex:1, borderColor:rirColor(set.rpe) }} type="number"
                    min="1" max="10" placeholder="RIR" value={set.rpe||""}
                    onChange={e => updateSet(i,"rpe",e.target.value)} />
                  )}
                  {!repOverride && set.weight && set.reps && (
                    <span style={{ ...S.tag("var(--green)"), whiteSpace:"nowrap", fontSize:10 }}>
                      {(parseFloat(set.weight)*parseInt(set.reps)).toFixed(0)}kg
                    </span>
                  )}
                  {!repOverride && set.weight && set.reps && bestHistorical1RM > 0 &&
                    calc1RM(parseFloat(set.weight), parseInt(set.reps)) > bestHistorical1RM && (
                    <span style={{ ...S.tag("var(--amber)"), whiteSpace:"nowrap", fontSize:10 }}>🏆 PR</span>
                  )}
                  {repOverride && !repsOnly && set.reps && (
                    <span style={{ ...S.tag("var(--green)"), whiteSpace:"nowrap", fontSize:10 }}>
                      {set.reps} reps
                    </span>
                  )}
                </div>
                {setDisplay?.detail && set.weight && (
                  <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginTop:2, marginLeft:25 }}>
                    {setDisplay.detail}
                  </div>
                )}
                {set.rpe && parseInt(set.rpe) <= 1 && data.level === "Beginner" && (
                  <div style={{ fontSize:10, color:"var(--red)", fontFamily:"var(--font-m)", marginTop:2, marginLeft:25 }}>RIR too low — reduce weight (keep RIR 3+ as beginner)</div>
                )}
              </div>
            );
          })}

          {totalVol > 0 && (
            <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--amber)", marginBottom:10 }}>
              Session volume: {totalVol.toFixed(0)}kg{volDiff !== null ? ` (${parseInt(volDiff)>=0?"+":""}${volDiff}% vs last)` : ""}
            </div>
          )}

          <RestTimer seconds={isTimed ? timedSec : rr.restSec} />
        </div>
      )}
    </div>
  );
}

// ── AI Session Summary ─────────────────────────────────────────────────────────
function buildSessionSummaryPrompt(entry, prevHistory, data) {
  const { day, volume, log, rating, notes } = entry;

  let totalRIR = 0, rirCount = 0;
  const exerciseLines = Object.entries(log).map(([exName, sets]) => {
    const setStrs = sets.map(s => {
      const rpe = parseFloat(s.rpe);
      if (!isNaN(rpe)) { totalRIR += rpe; rirCount++; }
      if (s.seconds) return `${s.seconds}s RIR${s.rpe ?? "?"}`;
      return `${s.weight || "BW"}kg×${s.reps} RIR${s.rpe ?? "?"}`;
    }).join(", ");

    // Per-exercise comparison vs last same-day session
    const prev2 = (prevHistory || []).filter(h => h.day === day && h.log?.[exName]).slice(0, 2);
    const prevStr = prev2.map(h => {
      const ps = (h.log[exName] || []);
      const maxW = Math.max(0, ...ps.map(s => parseFloat(s.weight) || 0));
      return `${h.date}:${maxW > 0 ? maxW + "kg" : "BW"}`;
    }).join(", ");
    return `  ${exName}: ${setStrs}${prevStr ? ` [prev: ${prevStr}]` : ""}`;
  }).join("\n");

  const avgRIR = rirCount > 0 ? (totalRIR / rirCount).toFixed(1) : "?";

  // Same-day session history with per-session RIR
  const sameDayHistory = (prevHistory || []).filter(h => h.day === day).slice(0, 4);
  const trendLines = sameDayHistory.length > 0
    ? sameDayHistory.map(h => {
        let tRIR = 0, tCount = 0;
        Object.values(h.log || {}).flat().forEach(s => {
          const r = parseFloat(s.rpe);
          if (!isNaN(r)) { tRIR += r; tCount++; }
        });
        const hAvgRIR = tCount > 0 ? (tRIR / tCount).toFixed(1) : "?";
        const stars = h.rating ? "★".repeat(parseInt(h.rating)) : "unrated";
        return `  ${h.date}: ${(h.volume || 0).toFixed(0)}kg | avg RIR ${hAvgRIR} | ${stars}`;
      }).join("\n")
    : "  No previous same-day sessions";

  const prev = sameDayHistory[0];
  const volDelta = prev
    ? ` (${volume >= (prev.volume || 0) ? "+" : ""}${(((volume - (prev.volume || 0)) / Math.max(prev.volume || 1, 1)) * 100).toFixed(0)}% vs last ${day})`
    : "";

  // Weekly volume trend (last 6 weeks)
  const weekVols = getWeeklyVolumes(prevHistory, 6);
  const weekVolStr = weekVols.map((w, i) => `W${i + 1}:${Math.round(w.vol)}kg`).join(" ");

  // Overall RIR trajectory across all sessions (last 6)
  const rirTrajectory = (prevHistory || []).slice(0, 6).map(h => {
    let r = 0, c = 0;
    Object.values(h.log || {}).flat().forEach(s => { const v = parseFloat(s.rpe); if (!isNaN(v)) { r += v; c++; } });
    return c > 0 ? (r / c).toFixed(1) : null;
  }).filter(Boolean).reverse().join(" → ");

  const meso = initMesocycle(data.mesocycle);
  const phaseLen = PHASE_LENGTHS[meso.phase] || 12;
  const deloadNote = shouldDeload(prevHistory) ? "\nNote: deload indicators present — athlete may need a lighter week." : "";

  return `ATHLETE PROFILE
Level: ${data.level || "Intermediate"} | Age: ${data.age || "?"}y | BW: ${data.weight || "?"}kg | Goal: ${data.goal || "hypertrophy"}
Mesocycle: ${meso.phase} session ${meso.sessionCount}/${phaseLen}${meso.pendingTransition ? " (PHASE COMPLETE — transition pending)" : ""}${deloadNote}

TODAY — ${day} (${entry.date})
Total volume: ${volume.toFixed(0)} kg${volDelta}
${exerciseLines}
Avg RIR today: ${avgRIR}${rating ? ` | Session rating: ${rating}/5` : ""}${notes ? ` | Athlete note: "${notes}"` : ""}

RECENT ${day.toUpperCase()} SESSIONS (oldest → newest):
${trendLines}

WEEKLY TOTAL VOLUME TREND (6 weeks):
${weekVolStr}

OVERALL RIR TRAJECTORY (6 sessions, oldest → newest):
${rirTrajectory || "insufficient data"}

TOTAL SESSIONS IN LOG: ${(prevHistory || []).length}`;
}

// ── AI Analysis Panel ─────────────────────────────────────────────────────────
function parseAiSections(raw) {
  if (!raw) return { session: "", trends: "", proposals: "" };
  const get = (tag, next) => {
    const start = raw.indexOf(`[${tag}]`);
    if (start === -1) return "";
    const contentStart = start + tag.length + 2;
    const end = next ? raw.indexOf(`[${next}]`) : raw.length;
    return raw.slice(contentStart, end === -1 ? raw.length : end).trim();
  };
  return {
    session:   get("SESSION",   "TRENDS"),
    trends:    get("TRENDS",    "PROPOSALS"),
    proposals: get("PROPOSALS", null),
  };
}

// Parse the [PROPOSALS] block as structured action items.
// Returns an array of { exercise, field, value, reason } or null if the
// AI didn't return valid JSON (caller falls back to showing raw text).
function parseAiProposals(proposalsText) {
  if (!proposalsText) return null;
  const cleaned = proposalsText.replace(/```json|```/g, "").trim();
  if (!cleaned.startsWith("[")) return null;
  try {
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return null;
    return arr.filter(p =>
      p && typeof p.exercise === "string" &&
      (p.field === "weight" || p.field === "reps") &&
      typeof p.value === "number" && isFinite(p.value) &&
      typeof p.reason === "string"
    );
  } catch (e) {
    return null;
  }
}

function AiSection({ label, icon, color, borderColor, bgColor, text, delay }) {
  if (!text || text === "—") return null;
  return (
    <div style={{
      background: bgColor, border: `1px solid ${borderColor}`, borderRadius:8,
      padding:"12px 14px", marginTop:10,
      animation:`fadeUp .3s ${delay}s cubic-bezier(0.16,1,0.3,1) both`
    }}>
      <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:11, color, letterSpacing:1, marginBottom:8 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily:"var(--font-b)", fontSize:13, color:"var(--text)", lineHeight:1.75, whiteSpace:"pre-wrap" }}>
        {text}
      </div>
    </div>
  );
}

function AiProposalCard({ proposal, applied, onApply, onDismiss }) {
  const valueLabel = proposal.field === "weight" ? `${proposal.value}kg` : `${proposal.value} reps`;
  return (
    <div style={{ background:"rgba(59,130,246,0.05)", border:"1px solid rgba(59,130,246,0.3)", borderRadius:8, padding:"10px 12px", marginTop:8 }}>
      <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:13, color:"var(--text)" }}>
        {proposal.exercise} <span style={{ color:"var(--blue)" }}>→ {valueLabel}</span>
      </div>
      <div style={{ fontFamily:"var(--font-b)", fontSize:12, color:"var(--muted)", marginTop:4, lineHeight:1.5 }}>
        {proposal.reason}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:10 }}>
        {applied ? (
          <span style={{ ...S.tag("var(--green)"), padding:"6px 10px" }}>✓ Set as next session's target</span>
        ) : (
          <>
            <button style={{ ...S.btnSm, color:"var(--blue)", borderColor:"rgba(59,130,246,0.4)" }} onClick={onApply}>Apply</button>
            <button style={S.btnSm} onClick={onDismiss}>Dismiss</button>
          </>
        )}
      </div>
    </div>
  );
}

function AiAnalysisPanel({ loading, raw, onGoToChat, day, proposalState }) {
  const sections = parseAiSections(raw);
  const structuredProposals = parseAiProposals(sections.proposals);
  return (
    <div style={{ marginTop:14 }}>
      <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:11, color:"var(--purple)", letterSpacing:2, marginBottom:6 }}>
        🤖 AI COACH ANALYSIS
      </div>
      {loading ? (
        <div style={{ ...S.card, border:"1px solid rgba(168,85,247,0.35)" }}>
          <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:10 }}>Analyzing session…</div>
          {[100, 88, 95, 72, 60, 83, 90, 65].map((w, i) => (
            <div key={i} style={{
              height:9, background:"rgba(168,85,247,0.12)", borderRadius:4,
              marginBottom:7, width:`${w}%`,
              animation:`shimmer 1.6s ${i * 0.1}s ease-in-out infinite`
            }} />
          ))}
        </div>
      ) : raw ? (
        <>
          <AiSection
            label="SESSION BREAKDOWN"
            icon="📊"
            color="var(--amber)"
            borderColor="rgba(245,158,11,0.35)"
            bgColor="rgba(245,158,11,0.05)"
            text={sections.session}
            delay={0}
          />
          <AiSection
            label="TREND ANALYSIS"
            icon="📈"
            color="var(--purple)"
            borderColor="rgba(168,85,247,0.35)"
            bgColor="rgba(168,85,247,0.05)"
            text={sections.trends}
            delay={0.08}
          />
          {structuredProposals ? (
            structuredProposals.length > 0 && (
              <div style={{
                background:"rgba(59,130,246,0.05)", border:"1px solid rgba(59,130,246,0.35)", borderRadius:8,
                padding:"12px 14px", marginTop:10,
                animation:"fadeUp .3s 0.16s cubic-bezier(0.16,1,0.3,1) both"
              }}>
                <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:11, color:"var(--blue)", letterSpacing:1, marginBottom:4 }}>
                  🎯 PROPOSALS — NEXT {(day || "").toUpperCase()}
                </div>
                {structuredProposals.map((p, i) => proposalState?.dismissed?.has(i) ? null : (
                  <AiProposalCard
                    key={i}
                    proposal={p}
                    applied={proposalState?.applied?.has(i)}
                    onApply={() => proposalState?.onApply?.(p, i)}
                    onDismiss={() => proposalState?.onDismiss?.(i)}
                  />
                ))}
              </div>
            )
          ) : (
            <AiSection
              label={`PROPOSALS — NEXT ${(day || "").toUpperCase()}`}
              icon="🎯"
              color="var(--blue)"
              borderColor="rgba(59,130,246,0.35)"
              bgColor="rgba(59,130,246,0.05)"
              text={sections.proposals}
              delay={0.16}
            />
          )}
          {onGoToChat && (
            <button
              style={{ ...S.btnSm, marginTop:10, fontSize:11, color:"var(--purple)", borderColor:"rgba(168,85,247,0.4)" }}
              onClick={onGoToChat}
            >
              Ask follow-up in chat →
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Stretch helpers ───────────────────────────────────────────────────────────
function getStretchAlternatives(itemName, focus) {
  const seen = new Set([itemName]);
  const result = [];
  const primary = STRETCH_ROUTINES[focus];
  if (primary) {
    for (const name of primary.items) {
      if (!seen.has(name)) { seen.add(name); result.push({ name, ...EXERCISES[name], fromRoutine: primary.label }); }
    }
  }
  for (const [key, r] of Object.entries(STRETCH_ROUTINES)) {
    if (key === focus) continue;
    for (const name of r.items) {
      if (!seen.has(name)) { seen.add(name); result.push({ name, ...EXERCISES[name], fromRoutine: r.label }); }
    }
  }
  return result.slice(0, 6);
}

// Header label + primary value derived from an exercise's metricType.
function metricHeader(ex) {
  if (ex.metricType === "reps")
    return { label:"SETS × REPS", value:`${ex.sets} × ${ex.reps}` };
  if (ex.metricType === "repsHold")
    return { label:"REPS × HOLD", value:`${ex.reps} × ${ex.holdSeconds}s` };
  return { label:"HOLD TIME", value:`${ex.holdSeconds}s` }; // "hold"
}

function StretchCard({ item, exNum, totalEx, focus }) {
  const [showAlts, setShowAlts] = useState(false);
  const [swappedTo, setSwappedTo] = useState(null);
  const active = swappedTo || item;

  const metric = metricHeader(active);

  const alts = getStretchAlternatives(active.name, focus);

  const doSwap = alt => {
    setSwappedTo({ ...alt });
    setShowAlts(false);
  };

  return (
    <div style={{ ...S.card, border: showAlts ? "1px solid rgba(34,197,94,0.4)" : "1px solid var(--border)", transition:"border .2s" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
        <div style={{ flexShrink:0, textAlign:"center", minWidth:36 }}>
          <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:32, color:"var(--green)", lineHeight:1 }}>{exNum}</div>
          <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>/{totalEx}</div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:17, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            {active.name}
            {swappedTo && <span style={S.tag("var(--blue)")}>swapped</span>}
          </div>
          <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
            {active.perSide && <span style={S.tag("var(--purple)")}>each side</span>}
            {active.metricType !== "reps" && (active.sets || 1) > 1 && <span style={S.tag("var(--blue)")}>×{active.sets} sets</span>}
          </div>
        </div>
      </div>

      <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--green)", letterSpacing:1, marginBottom:4 }}>{metric.label}</div>
        <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:26, color:"var(--green)", lineHeight:1 }}>{metric.value}</span>
          {active.perSide && <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:16, color:"var(--text)" }}>each side</span>}
          {active.metricType !== "reps" && (active.sets || 1) > 1 && <span style={{ fontFamily:"var(--font-h)", fontWeight:600, fontSize:14, color:"var(--muted)" }}>× {active.sets} sets</span>}
        </div>
      </div>

      <div style={{ display:"grid", gap:6, marginBottom:10 }}>
        {[
          { label:"Setup",    text:active.setup },
          { label:"Movement", text:active.movement },
          { label:"Feel",     text:active.feel, accent:true },
          { label:"Mistake",  text:active.mistake },
        ].map(row => (
          <div key={row.label} style={{ lineHeight:1.5 }}>
            <span style={{ fontFamily:"var(--font-m)", fontSize:9, letterSpacing:1, textTransform:"uppercase", color: row.accent ? "var(--green)" : "var(--muted)", marginRight:6 }}>{row.label}</span>
            <span style={{ fontFamily:"var(--font-b)", fontSize:12, color: row.accent ? "var(--green)" : "var(--muted)", fontWeight: row.accent ? 600 : 400 }}>{row.text}</span>
          </div>
        ))}
      </div>

      <button
        style={{ ...S.btnSm, width:"100%", justifyContent:"center", marginBottom:8 }}
        onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(active.name + " exercise form")}`, "_blank", "noopener")}>
        ▶ Show video
      </button>

      <div>
        <button
          style={{ ...S.btnSm, width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between" }}
          onClick={() => setShowAlts(a => !a)}>
          <span>🔄 {swappedTo ? "Swap again" : "Swap exercise"}</span>
          <span style={{ color:"var(--green)" }}>{showAlts ? "▲" : "▼"}</span>
        </button>
        {showAlts && (
          <div style={{ marginTop:8, animation:"fadeUp .15s ease both" }}>
            {alts.map((a, i) => (
              <div key={i}
                style={{ ...S.card, padding:"10px 12px", marginBottom:6, display:"flex", alignItems:"center", gap:10, cursor:"pointer", border:"1px solid var(--border)" }}
                onClick={() => doSwap(a)}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14 }}>{a.name}</div>
                  <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>
                    {a.fromRoutine}{a.perSide ? " · each side" : ""}{a.metricType !== "reps" && (a.sets||1)>1 ? ` · ×${a.sets} sets` : ""}
                  </div>
                </div>
                <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:13, color:"var(--green)", flexShrink:0 }}>Use →</span>
              </div>
            ))}
            <button style={S.btnSm} onClick={() => setShowAlts(false)}>✕ Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stretch Session ───────────────────────────────────────────────────────────
function StretchSession({ data, setData, onBack }) {
  const suggested = suggestStretchFocus(data.history || []);
  const [minutes, setMinutes] = useState(15);
  const [focus, setFocus] = useState(suggested);
  const [finished, setFinished] = useState(false);

  const routine = STRETCH_ROUTINES[focus];
  const items = getStretchItems(focus, minutes);

  const logSession = () => {
    const entry = { date:new Date().toISOString().slice(0,10), day:"Stretch", volume:0, focus, duration:minutes, log:{} };
    setData(d => ({ ...d, history:[entry,...(d.history||[])] }));
    setFinished(true);
  };

  if (finished) return (
    <div style={S.section}>
      <div style={S.h1}>Stretch <span style={{ color:"var(--green)" }}>Done!</span></div>
      <div style={{ ...S.card, textAlign:"center", padding:28, border:"1px solid var(--green)" }}>
        <div style={{ fontSize:44, marginBottom:8 }}>🧘</div>
        <div style={{ fontFamily:"var(--font-h)", fontSize:22, color:"var(--green)" }}>{minutes} min · {routine.label}</div>
        <div style={{ color:"var(--muted)", fontSize:12, marginTop:6 }}>{routine.desc}</div>
      </div>
      <button style={{ ...S.btn, width:"100%", marginTop:14 }} onClick={onBack}>← Home</button>
    </div>
  );

  return (
    <div style={{ ...S.section, paddingBottom:80 }}>
      <button style={{ ...S.btnSm, marginBottom:14 }} onClick={onBack}>← Back</button>
      <div style={S.h1}>Stretch <span style={{ color:"var(--green)" }}>Session</span></div>

      <div style={{ marginBottom:18 }}>
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", letterSpacing:1, marginBottom:8 }}>AVAILABLE TIME</div>
        <div style={{ display:"flex", gap:8 }}>
          {[10, 15, 20].map(m => (
            <button key={m} type="button"
              style={{ ...S.chip(minutes === m), padding:"10px 18px", fontSize:14, fontFamily:"var(--font-h)", fontWeight:700, minHeight:44 }}
              onClick={() => setMinutes(m)}>{m} min</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:18 }}>
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", letterSpacing:1, marginBottom:8 }}>
          FOCUS {suggested === focus && <span style={{ color:"var(--green)" }}>· suggested for today</span>}
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
          {Object.entries(STRETCH_ROUTINES).map(([key, r]) => (
            <button key={key} type="button"
              style={{ ...S.chip(focus === key), padding:"8px 12px", fontSize:12, minHeight:40,
                ...(focus === key ? { borderColor:r.color, color:r.color } : {}) }}
              onClick={() => setFocus(key)}>{r.label}</button>
          ))}
        </div>
        <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>{routine.desc}</div>
      </div>

      <div style={S.h2}>Routine · ~{minutes} min</div>
      {items.map((item, i) => (
        <StretchCard
          key={`${focus}_${item.name}_${i}`}
          item={item}
          exNum={i + 1}
          totalEx={items.length}
          focus={focus}
        />
      ))}

      <button style={{ ...S.btnGreen, width:"100%", justifyContent:"center", marginTop:14 }} onClick={logSession}>
        ✓ Log Stretch Session
      </button>
      <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", textAlign:"center", marginTop:6 }}>
        Saved to history · not synced to Sheets
      </div>
    </div>
  );
}

// ── Workout Screen ────────────────────────────────────────────────────────────
function WorkoutScreen({ data, setData, onBack, onGoToChat, setSyncStatus = () => {} }) {
  const day = data.activeDay || (data.split||[])[0] || "Full Body";
  const meso      = initMesocycle(data.mesocycle);
  const isDeload   = meso.phase === "deload";
  const isIntense  = meso.phase === "intensification";
  const phaseLen   = PHASE_LENGTHS[meso.phase] || 12;

  const mode      = data.activeMode || DEFAULT_MODE;
  const isWeights = isWeightsMode(mode);

  const exercises = useMemo(() => {
    const raw = getExercisesForDay(day, data.equipment||[], data.goal, data.favourites, data.level, mode);
    const ov = (data.sessionOverride?.day === day) ? data.sessionOverride : { removed: [], replaced: {} };
    const pool = isWeights
      ? Object.values(EXERCISE_DB).flat()
      : Object.values(MODE_EXERCISE_DB[mode] || {}).flat();
    return raw
      .filter(ex => !ov.removed.includes(ex.name))
      .map(ex => {
        const rep = ov.replaced[ex.name];
        if (!rep) return ex;
        const dbEx = pool.find(e => e.name === rep);
        return dbEx ? { ...dbEx, isFav: false } : ex;
      });
  }, [day, mode, isWeights, data.equipment, data.goal, data.favourites, data.level, data.sessionOverride]);

  // Cards read history for their own mode: "last session" comparisons and rep
  // progression stay inside the mode, and loaded bests stay out of TRX/BW.
  const modeHistory = useMemo(() => historyForMode(data.history, mode), [data.history, mode]);

  const [sessionLog, setSessionLog] = useState({});
  const [finished, setFinished] = useState(false);
  const [trendDismissed, setTrendDismissed] = useState(false);
  const trends = useMemo(
    () => (trendDismissed || !isWeights) ? [] : detectTrends(day, data.history || []),
    [trendDismissed, isWeights, day, data.history]
  );
  const [sessionRating, setSessionRating] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [planSaved, setPlanSaved] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [appliedProposals, setAppliedProposals] = useState(() => new Set());
  const [dismissedProposals, setDismissedProposals] = useState(() => new Set());

  // Apply an AI proposal directly to next session's plan and sync to Sheets
  const applyAiProposal = (p, idx) => {
    setData(d => {
      const bucket  = planKeyFor(getDayType(day), mode);
      const current = (d.nextSession?.[bucket] || {})[p.exercise] || {};
      // TRX/BW modes have no weight field, so any proposal there is a rep target.
      const field   = isWeights ? p.field : "reps";
      // Drop targetRIR: it described the RIR-derived target this proposal is
      // replacing, and carrying it over made an AI-chosen load look like your
      // own RIR produced it.
      const { targetRIR: _staleRIR, ...carried } = current;
      const updatedExercise = field === "reps"
        ? { ...carried, targetReps: p.value, type: "reps", source: "ai_proposal" }
        : { ...carried, targetWeight: p.value, type: "weight", source: "ai_proposal", targetReps: carried.targetReps || 8 };
      const newNextSession = { ...(d.nextSession || {}), [bucket]: { ...(d.nextSession?.[bucket] || {}), [p.exercise]: updatedExercise } };
      const lastEntry = (d.history || [])[0];
      if (lastEntry) {
        setSyncStatus("syncing");
        syncSession(lastEntry, newNextSession, d.bodyWeightHistory || [])
          .then(() => setSyncStatus("ok"))
          .catch(() => setSyncStatus("error"));
      }
      return { ...d, nextSession: newNextSession };
    });
    setAppliedProposals(prev => new Set(prev).add(idx));
  };
  const dismissAiProposal = (idx) => setDismissedProposals(prev => new Set(prev).add(idx));
  const age = parseInt(data.age) || 0;
  const deload = shouldDeload(data.history);
  const warnings = getMuscleWarnings(day, data.history);
  const totalVolume = Object.values(sessionLog).flat().reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
  // TRX/BW sessions carry no load, so reps are the headline number instead.
  const totalReps   = Object.values(sessionLog).flat().reduce((a,s) => a+(parseInt(s.reps)||0), 0);

  const warmupProtocol = age >= 40
    ? ["5 min light cardio","Hip circles 10 each side","Arm circles 10 each","Leg swings 10 each leg","Band pull-aparts 15 reps","2-3 warm-up sets per exercise"]
    : ["3 min light movement","Joint mobility 5 min","1-2 warm-up sets per exercise"];

  const saveSession = () => {
    // `mode` is the marker that keeps TRX/BW sessions out of weight progression.
    const entry = { date: new Date().toISOString().slice(0,10), day, mode, volume: totalVolume, log: sessionLog, rating: sessionRating, notes: sessionNotes };
    const { dayType, plan } = calcNextSessionPlan(day, sessionLog, data.goal, data);
    // Non-weights plans go to their own namespace, so they only ever feed back
    // into the same mode. In TRX/BW every entry comes out as a rep target.
    const updatedNextSession = { ...(data.nextSession || {}), [planKeyFor(dayType, mode)]: plan };
    // Update mesocycle — the lifting block only advances on weights sessions.
    const currentMeso  = initMesocycle(data.mesocycle);
    const newCount     = isWeights ? currentMeso.sessionCount + 1 : currentMeso.sessionCount;
    const phaseLen     = PHASE_LENGTHS[currentMeso.phase] || 12;
    const updatedMeso  = {
      ...currentMeso,
      sessionCount:      newCount,
      pendingTransition: newCount >= phaseLen,
    };
    setData(d => ({ ...d, history: [entry, ...(d.history||[])], nextSession: updatedNextSession, sessionOverride: null, mesocycle: updatedMeso }));
    setSyncStatus("syncing");
    syncSession(entry, updatedNextSession, data.bodyWeightHistory || [])
      .then(() => setSyncStatus("ok"))
      .catch(() => setSyncStatus("error"));
    setPlanSaved(true);
    setFinished(true);

    // AI session analysis — fires async, does not block the success screen
    setAiSummaryLoading(true);
    setAiSummary(null);
    const aiSystem = `You are HomeForge AI Coach — an expert strength coach. Analyze the completed session and respond in EXACTLY this format with these three section markers on their own lines. Do not add any text before [SESSION] or after the last proposal.

[SESSION]
One verdict sentence with a specific volume or intensity number. Then 2-3 sentences citing actual weights, RIR values, or set data from today's log. Be direct.

[TRENDS]
2-3 sentences on multi-session patterns. Reference exercise names, volume numbers, and RIR trajectory from the history provided. Note progressions, stalls, or warning signs.

[PROPOSALS]
A JSON array — and nothing else, no prose, no markdown code fences — of 1-3 concrete target changes for the next ${day} session. Each item: {"exercise": "<name>", "field": "weight"|"reps", "value": <number>, "reason": "<reason, under 15 words>"}. "exercise" must exactly match one of: ${Object.keys(sessionLog).join(", ")}. ${isWeights
  ? `Use "field":"weight" for barbell/dumbbell/EZ-bar/dip-belt exercises and "field":"reps" for bodyweight/timed/reps-only exercises.`
  : `This was a ${modeLabel(mode)} session with no external load — every proposal must use "field":"reps". Never propose a weight.`} Base values on the rep/RIR data above — call out stalls, overreach, or easy sessions. If no concrete change is warranted, return [].`;
    callClaude([{ role: "user", content: buildSessionSummaryPrompt(entry, data.history || [], data) }], aiSystem)
      .then(text => setAiSummary(text))
      .catch(() => setAiSummary("[SESSION]\nCould not generate analysis — check your connection.\n[TRENDS]\n—\n[PROPOSALS]\n—"))
      .finally(() => setAiSummaryLoading(false));
  };

  if (day === "REST") return (
    <div style={S.section}>
      <div style={S.h1}>Rest <span style={{ color:"var(--amber)" }}>Day</span></div>
      <div style={{ ...S.card, textAlign:"center", padding:40 }}>
        <div style={{ fontSize:50, marginBottom:10 }}>😴</div>
        <div style={{ fontFamily:"var(--font-h)", fontSize:20 }}>Recover. Grow. Come back stronger.</div>
        <div style={{ color:"var(--muted)", fontSize:13, marginTop:8 }}>Stretch · Hydrate · Sleep 8h</div>
      </div>
    </div>
  );

  if (day === "Stretch") return <StretchSession data={data} setData={setData} onBack={onBack} />;

  if (finished) return (
    <div style={S.section}>
      <div style={S.h1}>Session <span style={{ color:"var(--green)" }}>Done!</span></div>
      <div style={{ ...S.card, textAlign:"center", padding:28, border:"1px solid var(--green)" }}>
        <div style={{ fontSize:44, marginBottom:8 }}>🏆</div>
        {isWeights ? (
          <>
            <div style={{ fontFamily:"var(--font-h)", fontSize:26, color:"var(--green)" }}>{totalVolume.toFixed(0)} kg</div>
            <div style={{ color:"var(--muted)", fontSize:11, fontFamily:"var(--font-m)" }}>TOTAL VOLUME · {exercises.length} exercises</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily:"var(--font-h)", fontSize:26, color:"var(--green)" }}>{totalReps} reps</div>
            <div style={{ color:"var(--muted)", fontSize:11, fontFamily:"var(--font-m)" }}>{modeLabel(mode).toUpperCase()} · {exercises.length} exercises</div>
          </>
        )}
        {sessionRating && <div style={{ marginTop:10, fontSize:14 }}>{"⭐".repeat(parseInt(sessionRating))}</div>}
        {sessionNotes && <div style={{ marginTop:6, fontFamily:"var(--font-b)", fontSize:13, color:"var(--muted)", fontStyle:"italic" }}>"{sessionNotes}"</div>}
        {planSaved && (
          <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:6, padding:"8px 12px", marginTop:14, fontFamily:"var(--font-m)", fontSize:12, color:"var(--green)", textAlign:"left" }}>
            📋 Next {day} {isWeights ? "" : modeLabel(mode) + " "}session planned — {isWeights ? "weights" : "rep targets"} adjusted from your RIR
          </div>
        )}
      </div>
      {isWeights && meso.pendingTransition && (
        <div style={{ ...S.card, border:"1px solid var(--amber)", marginTop:14, animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18, color:"var(--amber)", marginBottom:6 }}>
            Phase complete — {meso.sessionCount} {phaseLabel(meso.phase).toLowerCase()} sessions done
          </div>
          <div style={{ fontFamily:"var(--font-m)", fontSize:12, color:"var(--muted)", marginBottom:14 }}>
            Ready to move to {phaseLabel(nextPhase(meso.phase)).toLowerCase()}?
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button style={{ ...S.btnOutline, flex:1 }}
              onClick={() => setData(d => ({ ...d, mesocycle: { ...initMesocycle(d.mesocycle), pendingTransition: false } }))}>
              Not yet
            </button>
            <button style={{ ...S.btn, flex:1, justifyContent:"center" }}
              onClick={() => setData(d => ({
                ...d,
                mesocycle: {
                  phase: nextPhase(d.mesocycle?.phase || "accumulation"),
                  sessionCount: 0,
                  startDate: new Date().toISOString().slice(0,10),
                  pendingTransition: false,
                }
              }))}>
              Start {phaseLabel(nextPhase(meso.phase)).toLowerCase()} →
            </button>
          </div>
        </div>
      )}
      {/* AI Coach Full Analysis */}
      <AiAnalysisPanel loading={aiSummaryLoading} raw={aiSummary} onGoToChat={onGoToChat} day={day}
        proposalState={{ applied: appliedProposals, dismissed: dismissedProposals, onApply: applyAiProposal, onDismiss: dismissAiProposal }} />

      <button style={{ ...S.btn, width:"100%", justifyContent:"center", marginTop:12 }} onClick={() => setFinished(false)}>Back to Workout</button>
    </div>
  );

  return (
    <div style={S.section}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:2 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button style={{ ...S.btnSm, fontSize:12 }} onClick={onBack}>← Home</button>
          <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
            <div style={S.h1}>{day}</div>
            {!isWeights && <span style={S.tag("var(--purple)")}>{modeLabel(mode)}</span>}
            {isWeights && (
              <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:phaseColor(meso.phase), letterSpacing:1 }}>
                {phaseLabel(meso.phase)} · {meso.sessionCount}/{phaseLen}
              </span>
            )}
          </div>
        </div>
        {isWeights && totalVolume > 0 && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>VOL</div>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:20, color:"var(--amber)" }}>{totalVolume.toFixed(0)}kg</div>
          </div>
        )}
      </div>
      <div style={S.sub}>
        {exercises.length} EXERCISES · {(data.level||"").toUpperCase()} · {isWeights ? "HYPERTROPHY" : `${modeLabel(mode).toUpperCase()} · REPS + RIR`}
      </div>

      {!isWeights && (
        <div style={{ ...S.info, marginBottom:8 }}>
          {modeLabel(mode)} session — log reps and RIR. Not counted toward weights progression or the mesocycle.
        </div>
      )}

      {isWeights && isDeload && <div style={{ ...S.warn, marginBottom:8 }}>DELOAD WEEK — Same weights, 2 sets only, RIR 3-4. Recovery first.</div>}
      {warnings.map((w,i) => <div key={i} style={{ ...S.warn, marginBottom:6 }}>{w}</div>)}

      {trends.length > 0 && (
        <div style={{ background:"rgba(168,85,247,0.08)", border:"1px solid rgba(168,85,247,0.35)",
          borderRadius:8, padding:"10px 14px", marginBottom:10, animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:13,
              color:"var(--purple)", letterSpacing:1 }}>📈 TREND ALERT</span>
            <button style={{ ...S.btnSm, fontSize:10, color:"var(--muted)" }} aria-label="Dismiss trend alert"
              onClick={() => setTrendDismissed(true)}>Dismiss ✕</button>
          </div>
          {trends.map((t,i) => (
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start",
              marginBottom: i < trends.length-1 ? 6 : 0 }}>
              <span style={{ fontSize:13, flexShrink:0 }}>
                {t.type==="easy"?"🟢":t.type==="hard"?"🔴":t.type==="volume"?"📉":"⏸️"}
              </span>
              <span style={{ fontFamily:"var(--font-m)", fontSize:12,
                color:"var(--text)", lineHeight:1.5 }}>{t.msg}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...S.card, marginBottom:20, border:"1px solid rgba(59,130,246,0.3)" }}>
        <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:13, color:"var(--blue)", marginBottom:8 }}>
          WARM-UP {age>=40?"(40+ Extended)":""}
        </div>
        {warmupProtocol.map((w,i) => (
          <div key={i} style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:2 }}>· {w}</div>
        ))}
      </div>

      {exercises.length === 0 ? (
        <div style={{ ...S.card, textAlign:"center", padding:28, color:"var(--muted)" }}>No exercises match your equipment.</div>
      ) : exercises.map((ex,i) => (
        <ExerciseCard key={`${mode}-${ex.name}-${i}`} ex={ex} exNum={i+1} totalEx={exercises.length} goal={data.goal} data={data} sessionLog={sessionLog} setSessionLog={setSessionLog} history={modeHistory} />
      ))}

      <div style={{ ...S.card, marginTop:16 }}>
        <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14, marginBottom:10 }}>SESSION DEBRIEF</div>
        <label style={S.label}>RATING (1-5)</label>
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {["1","2","3","4","5"].map(r => (
            <button key={r} type="button" style={{ ...S.chip(sessionRating===r), flex:1, justifyContent:"center", padding:"10px 4px", fontSize:12, minHeight: 44 }} onClick={() => setSessionRating(r)}>{"⭐".repeat(parseInt(r))}</button>
          ))}
        </div>
        <label style={S.label}>NOTES</label>
        <textarea style={{ ...S.input, height:56, resize:"none" }} placeholder="Energy, form issues, how you felt..." value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} />
      </div>

      <button style={{ ...S.btnGreen, width:"100%", justifyContent:"center", marginTop:10, marginBottom:20 }} onClick={saveSession}>
        ✓ Finish Session
      </button>
    </div>
  );
}

// ── Chat Screen ───────────────────────────────────────────────────────────────
function ChatScreen({ data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const QUICK = ["Am I ready to train today?","How do I progress faster?","What to eat pre-workout?","How to fix sore muscles?","Should I deload?","Best exercises for my goal?"];

  const bmi = data.weight && data.height ? (parseFloat(data.weight)/Math.pow(parseFloat(data.height)/100,2)).toFixed(1) : "?";
  const systemPrompt = `You are HomeForge AI Coach — direct, knowledgeable, motivating personal trainer.
Athlete: Age ${data.age}, ${data.weight}kg, ${data.height}cm, BMI ${bmi}, ${data.level} level.
Goal: ${data.goal}. Equipment: ${(data.equipment||[]).join(", ")||"bodyweight"}.
Barbell: ${data.barWeight||"?"}kg bar (${data.barType||"custom"}), plates: ${data.barbellPlates||"none"}, max: ${data.barbellMax||"?"}kg.
EZ Curl Bar: ${data.ezbarWeight||"?"}kg bar, plates: ${data.ezbarPlates||"none"}, max: ${data.ezbarMax||"?"}kg.
Dip Belt: max plate load ${data.dipbeltMax||"?"}kg — enables weighted pull-ups, dips, push-ups.
Dumbbells: ${data.dumbbellWeights||"?"}, max: ${data.dumbbellMax||"?"}kg.
${parseInt(data.age)>=40?"IMPORTANT: 40+ athlete - recommend joint-friendly, longer warmup, conservative loading.":""}
${data.level==="Beginner"?"IMPORTANT: Beginner - keep RIR 3+ (never go to failure), prioritize form.":""}
Training ${data.days} days/week. Split: ${(data.split||[]).join("/")}.
Recent sessions: ${(data.history||[]).slice(0,4).map(h=>`${h.date} ${h.day} ${(h.volume||0).toFixed(0)}kg rating:${h.rating||"?"}`).join("; ")||"none yet"}.
Body weight: ${(data.bodyWeightHistory||[]).slice(0,3).map(b=>`${b.date}:${b.weight}kg`).join(", ")||"not tracked"}.
Deload needed: ${shouldDeload(data.history)?"YES":"no"}.
Be concise (under 200 words), practical, personalized.`;

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next); setInput(""); setLoading(true);
    const reply = await callClaude(next, systemPrompt);
    setMessages(m => [...m, { role: "assistant", content: reply }]);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)" }}>
      <div style={{ padding: "13px 20px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16, letterSpacing: 1, textTransform: "uppercase", color: "var(--amber)" }}>AI Coach</div>
        <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>KNOWS YOUR PROFILE, EQUIPMENT, HISTORY AND BODY WEIGHT</div>
      </div>

      {messages.length === 0 && (
        <div style={{ padding: "12px 20px" }}>
          <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>QUICK QUESTIONS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK.map(q => <button key={q} style={{ ...S.btnSm, fontSize: 11 }} onClick={() => send(q)}>{q}</button>)}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10, display: "flex", justifyContent: m.role==="user"?"flex-end":"flex-start", animation: "fadeUp .2s ease both" }}>
            <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: 10, background: m.role==="user"?"var(--amber)":"var(--bg3)", color: m.role==="user"?"var(--on-accent)":"var(--text)", fontFamily: "var(--font-b)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", borderBottomRightRadius: m.role==="user"?2:10, borderBottomLeftRadius: m.role==="user"?10:2 }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={S.spinner} />
            <span style={{ fontFamily: "var(--font-m)", fontSize: 11, color: "var(--muted)" }}>Coach is thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "10px 20px", background: "var(--bg2)", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <input style={{ ...S.input, flex: 1 }} placeholder="Ask your coach anything..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && send(input)} />
        <button style={{ ...S.btn, padding: "8px 14px", flexShrink: 0 }} onClick={() => send(input)}>Send</button>
      </div>
    </div>
  );
}

// ── History Screen ────────────────────────────────────────────────────────────
function HistoryScreen({ data }) {
  const history = data.history || [];
  const bwHistory = data.bodyWeightHistory || [];
  const last8 = [...history].reverse().slice(-8);
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (i) => setExpanded(e => ({ ...e, [i]: !e[i] }));

  return (
    <div style={S.section}>
      <div style={S.h1}>Training <span style={{ color: "var(--amber)" }}>Log</span></div>
      <div style={S.sub}>{history.length} SESSIONS RECORDED</div>

      {bwHistory.length > 1 && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, marginBottom: 8, color: "var(--blue)" }}>BODY WEIGHT TREND</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {bwHistory.slice(0,5).map((b,i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16 }}>{b.weight}kg</div>
                <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>{b.date}</div>
              </div>
            ))}
          </div>
          {bwHistory.length >= 2 && (
            <div style={{ marginTop: 8, fontFamily: "var(--font-m)", fontSize: 11 }}>
              Total change: {(parseFloat(bwHistory[0].weight)-parseFloat(bwHistory[bwHistory.length-1].weight)).toFixed(1)}kg
            </div>
          )}
        </div>
      )}

      {last8.length > 1 && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--amber)" }}>VOLUME TREND</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44 }}>
            {last8.map((h,i) => {
              const max = Math.max(...last8.map(s => s.volume||0));
              const pct = max > 0 ? ((h.volume||0)/max*100) : 10;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", background: "var(--amber)", borderRadius: "2px 2px 0 0", height: pct+"%", minHeight: 4, opacity: i===last8.length-1?1:0.5 }} />
                  <div style={{ fontFamily: "var(--font-m)", fontSize: 9, color: "var(--muted)" }}>{h.day?.slice(0,3)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {shouldDeload(history) && <div style={{ ...S.warn, marginBottom: 10 }}>DELOAD DUE - Plan a lighter week</div>}

      {history.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 36, color: "var(--muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>No sessions yet. Complete your first workout!
        </div>
      ) : history.map((h,i) => {
        const logEntries = Object.entries(h.log||{});
        const isExpanded = !!expanded[i];
        const visibleEntries = isExpanded ? logEntries : logEntries.slice(0,3);
        return (
          <div key={i} style={S.card}>
            {/* Session header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {h.day}
                  {!isWeightsMode(h.mode) && <span style={S.tag("var(--purple)")}>{modeLabel(h.mode)}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                  <span style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>{h.date}</span>
                  {h.rating && <span style={{ fontSize: 11 }}>{"⭐".repeat(parseInt(h.rating))}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {isWeightsMode(h.mode) ? (
                  <>
                    <div style={{ fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 20, color: "var(--amber)" }}>{(h.volume||0).toFixed(0)}</div>
                    <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>kg volume</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 20, color: "var(--purple)" }}>
                      {Object.values(h.log||{}).flat().reduce((a,s) => a+(parseInt(s.reps)||0), 0)}
                    </div>
                    <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>total reps</div>
                  </>
                )}
              </div>
            </div>

            {/* Exercise list */}
            {visibleEntries.map(([name, sets]) => {
              const hasSeconds = sets.some(s => s.seconds);
              const setsDisplay = hasSeconds
                ? sets.filter(s=>s.seconds).map(s=>`${s.seconds}s${s.rpe?"RIR"+s.rpe:""}`).join(" / ")
                : sets.filter(s=>s.reps).map(s=>`${s.weight||"BW"}×${s.reps}${s.rpe?"RIR"+s.rpe:""}`).join(" / ");
              return (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, gap: 8 }}>
                  <span style={{ color: "var(--muted)", fontSize: 12, flexShrink: 0 }}>{name}</span>
                  <span style={{ fontFamily: "var(--font-m)", fontSize: 11, textAlign: "right", color: "var(--text)" }}>{setsDisplay}</span>
                </div>
              );
            })}

            {/* Expand / collapse */}
            {logEntries.length > 3 && (
              <button style={{ ...S.btnSm, marginTop: 6, width: "100%", textAlign: "center" }}
                onClick={() => toggleExpand(i)}>
                {isExpanded
                  ? "▲ Show less"
                  : `▼ Show all ${logEntries.length} exercises (+${logEntries.length - 3} more)`}
              </button>
            )}

            {h.notes && (
              <div style={{ marginTop: 8, fontFamily: "var(--font-b)", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                "{h.notes}"
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </div>
  );
}

// ── Technique Library (static, instant) ──────────────────────────────────────
const TECHNIQUE = {
  "Push-Up": {
    setup:    "Hands under the shoulders, body in a straight line from head to heels, core braced.",
    movement: "Lower the chest to about 1cm from the floor with elbows at 45°, then exhale and press back up.",
    feel:     "Work across the chest and triceps, with the core holding the plank line steady.",
    mistake:  "Letting the hips sag or pike — squeeze the glutes and abs so the body stays one rigid line.",
  },
  "Diamond Push-Up": {
    setup:    "Hands together forming a diamond shape directly under the chest.",
    movement: "Lower under control keeping the elbows tracking back, then press to full lockout and squeeze the triceps.",
    feel:     "A strong emphasis on the triceps and the inner chest.",
    mistake:  "Letting the elbows flare out wide — keep them tucked toward the ribs to keep the load on the triceps.",
  },
  "Pike Push-Up": {
    setup:    "Hips high in an inverted V, hands shoulder-width, head between the arms.",
    movement: "Lower the crown of the head toward the floor, then press back up explosively.",
    feel:     "The shoulders (front delts) do the work, with the triceps assisting.",
    mistake:  "Dropping the hips into a flat push-up — keep them piked high so the load stays on the shoulders.",
  },
  "Dumbbell Bench Press": {
    setup:    "Retract the shoulder blades and plant them into the bench, feet flat, dumbbells at chest level.",
    movement: "Lower to chest level with the elbows at about 75°, then press up in a slight arc.",
    feel:     "A stretch and contraction across the chest, with the triceps finishing the press.",
    mistake:  "Flaring the elbows to 90° — keep them tucked to protect the shoulder and load the chest.",
  },
  "Barbell Bench Press": {
    setup:    "Arch the lower back, five points of contact, bar over the eyes, grip just outside the shoulders.",
    movement: "Lower to the chest and press back in a slight arc toward over the shoulders, driving through the legs.",
    feel:     "Power through the chest, shoulders and triceps, with leg drive feeding the whole chain.",
    mistake:  "Bouncing the bar off the chest or losing the arch — control the descent and keep the upper back tight.",
  },
  "Dumbbell Fly": {
    setup:    "Lie back with the dumbbells pressed up and a slight, fixed bend in the elbows.",
    movement: "Open the arms wide into a deep chest stretch, then squeeze back together over the chest.",
    feel:     "A deep stretch across the outer chest at the bottom, hard contraction at the top.",
    mistake:  "Bending and straightening the elbows like a press — keep the elbow angle fixed; think hugging a barrel.",
  },
  "Weighted Dip": {
    setup:    "Support on parallel bars, weight belt hanging freely, arms locked out.",
    movement: "Lower until the upper arms are parallel to the floor, then press to full lockout — lean forward for chest, upright for triceps.",
    feel:     "Chest or triceps depending on lean — forward loads the chest, upright the triceps.",
    mistake:  "Dropping too deep or shrugging into the shoulders — stop at parallel and keep the shoulders down.",
  },
  "Tricep Dips": {
    setup:    "Hands on a bench or bars behind you, elbows pointing straight back.",
    movement: "Lower under control for about 2 seconds, then press up through the heel of the hand.",
    feel:     "Concentrated work in the triceps behind the upper arm.",
    mistake:  "Letting the elbows flare wide or pressing through the fingers — keep the elbows back and drive through the palm heel.",
  },
  "Overhead Press": {
    setup:    "Bar at the collarbone, grip just outside the shoulders, glutes and abs braced.",
    movement: "Press overhead, moving the head slightly back then through, to full lockout with the ears past the arms.",
    feel:     "Shoulders drive the press, triceps lock it out, core stays tight to protect the back.",
    mistake:  "Arching the lower back to press — squeeze the glutes and abs so the ribs stay down.",
  },
  "Assisted Pull-Up": {
    setup:    "Loop a band around the bar and place a knee or foot in it, starting from a dead hang.",
    movement: "Pull the chest toward the bar keeping the shoulders depressed, then lower fully.",
    feel:     "The lats and upper back working, with the band sharing the load at the bottom.",
    mistake:  "Relying on the band to bounce you up — use a thinner band as you get stronger (green → purple → none).",
  },
  "Pull-Up": {
    setup:    "Dead hang, overhand grip, shoulder blades depressed and set.",
    movement: "Lead with the chest to the bar, then lower all the way to a full hang each rep.",
    feel:     "A strong pull through the lats and mid-back, biceps assisting.",
    mistake:  "Cutting the range short at the bottom — a full dead hang each rep builds more.",
  },
  "Chin-Up": {
    setup:    "Supinated (palms-toward-you) grip, shoulder-width, dead hang.",
    movement: "Drive the elbows toward the hips to rise, pause 1 second at the top, then lower under control.",
    feel:     "More bicep involvement alongside the lats than a pull-up.",
    mistake:  "Thinking 'chin up' and craning the neck — think elbows to hips and let the back do the work.",
  },
  "Neutral Grip Pull-Up": {
    setup:    "Wrists neutral (palms facing each other), hands shoulder-width apart.",
    movement: "Depress the shoulders to engage the lats first, then drive the elbows down and back.",
    feel:     "Lats and mid-back with a shoulder-friendly wrist position; biceps assist.",
    mistake:  "Yanking with the arms before the lats engage — set the shoulders down first.",
  },
  "Weighted Pull-Up": {
    setup:    "Add weight via belt or dumbbell, dead hang, grip set.",
    movement: "Pull with the same strict form as bodyweight — no kipping — and lower to a full hang.",
    feel:     "Intense lat and upper-back load; even 2.5kg noticeably raises the stimulus.",
    mistake:  "Kipping or swinging to move the weight — keep it strict and full range.",
  },
  "Weighted Chin-Up": {
    setup:    "Belt weight hanging freely so it won't bump the knees, supinated grip, dead hang.",
    movement: "Rise with strict form, then lower with a slow 2–3 second negative.",
    feel:     "Heavy work through the biceps and lats.",
    mistake:  "Letting the weight swing or shortening the range — full ROM with a controlled negative.",
  },
  "Inverted Row": {
    setup:    "Under a fixed bar, body rigid like a plank, heels planted.",
    movement: "Pull the chest to the bar, then lower slowly over about 3 seconds.",
    feel:     "Mid-back and lats squeezing, with the core holding the plank.",
    mistake:  "Letting the hips sag or yanking with the hands — pull the chest, not just the hands, and stay rigid.",
  },
  "Dumbbell Row": {
    setup:    "Knee and same-side hand on a bench, back flat, dumbbell hanging.",
    movement: "Pull the elbow up toward the hip, hold 1 second squeezing the lat, then lower.",
    feel:     "A strong squeeze through the lat on the working side.",
    mistake:  "Pulling straight up or rotating the torso — drive the elbow to the hip and keep the hips square.",
  },
  "Single-Arm Dumbbell Row": {
    setup:    "Hinge with a neutral spine, back roughly parallel to the floor.",
    movement: "Drive the elbow back past the torso for a full contraction, then lower under control.",
    feel:     "Lat and mid-back of the working side, deep in the contraction.",
    mistake:  "Rotating the torso to lift more — keep the hips square and let the back do the pulling.",
  },
  "Barbell Row": {
    setup:    "Hinge at the hips, back at about 45°, bar just below the knees.",
    movement: "Pull the bar to the lower sternum with the elbows close, then lower with control.",
    feel:     "Thickness work across the whole mid-back; the eccentric loads it hardest.",
    mistake:  "Standing up too tall or jerking the bar — keep the torso angle and control the lowering.",
  },
  "EZ Bar Curl": {
    setup:    "Grip the EZ bar at the angled position, elbows pinned to the sides.",
    movement: "Curl to chin level, squeeze the biceps, then lower over about 3 seconds.",
    feel:     "Biceps under long tension, especially on the slow lowering.",
    mistake:  "Swinging the body or letting the elbows drift forward — keep them pinned and let the arms do the work.",
  },
  "EZ Bar Reverse Curl": {
    setup:    "Overhand grip on the EZ bar, wrists neutral (not bent), elbows at the sides.",
    movement: "Curl up keeping the elbows stationary, then lower under control.",
    feel:     "The brachialis and forearms working to build arm thickness.",
    mistake:  "Breaking the wrists back — keep them neutral so the load stays on the forearm and brachialis.",
  },
  "EZ Bar Skull Crusher": {
    setup:    "Lie back, EZ bar over the chest, upper arms vertical.",
    movement: "Lower the bar to the forehead or just behind it, then press up and squeeze the triceps at lockout.",
    feel:     "A stretch and contraction through the triceps.",
    mistake:  "Letting the upper arms drift — keep them vertical so only the forearms move.",
  },
  "EZ Bar Upright Row": {
    setup:    "Grip shoulder-width, bar resting against the thighs, close to the body.",
    movement: "Lead with the elbows upward to chin level, then lower under control.",
    feel:     "Side delts and upper traps taking the load.",
    mistake:  "Shrugging or letting the bar drift away — lead with the elbows and keep the bar close.",
  },
  "Close-Grip Bench Press": {
    setup:    "Hands 25–30cm apart, elbows tucked, bar over the chest.",
    movement: "Lower with the elbows at about 45° to the body, then press to full lockout.",
    feel:     "Triceps doing most of the work, inner chest assisting.",
    mistake:  "Gripping too narrow — that strains the wrists; keep the hands about 25–30cm apart.",
  },
  "Barbell Squat": {
    setup:    "Bar on the traps (create a shelf, not on the neck), feet shoulder-width, chest tall.",
    movement: "Break at the hips and knees together, descend, then drive up with the knees tracking over the toes.",
    feel:     "Quads and glutes driving, with the whole trunk braced.",
    mistake:  "Letting the knees cave or the chest drop — drive the knees out and keep the chest tall.",
  },
  "Barbell Deadlift": {
    setup:    "Bar over mid-foot, hip-width stance, hinge to grip with a flat back.",
    movement: "Hinge at the hips first then bend the knees to reach the bar; stand by pushing the floor away.",
    feel:     "Powerful drive through the glutes, hamstrings and the whole posterior chain.",
    mistake:  "Rounding the back or yanking the bar up — push the floor away and keep the spine neutral.",
  },
  "Romanian Deadlift": {
    setup:    "Slight, fixed knee bend, bar against the thighs, shoulders back.",
    movement: "Hinge at the hips, pushing them back and feeling the hamstrings stretch; stop before the back rounds.",
    feel:     "A deep stretch along the hamstrings and glutes.",
    mistake:  "Chasing depth until the back rounds — it's about the hip hinge, not how low the bar goes.",
  },
  "Goblet Squat": {
    setup:    "Hold a dumbbell at the chest, elbows inside the knees, feet shoulder-width.",
    movement: "Squat deep using the weight as a counterbalance, then drive back up tall.",
    feel:     "Quads and glutes, with the upright torso opening the hips.",
    mistake:  "Letting the chest collapse forward — keep it tall and use the weight to stay upright.",
  },
  "Bulgarian Split Squat": {
    setup:    "Rear foot on a bench, front foot 60–70cm ahead, torso tall.",
    movement: "Lower the rear knee toward the floor keeping the front shin vertical, then drive up through the front heel.",
    feel:     "Front-leg quad and glute working hard, with a stretch in the rear hip flexor.",
    mistake:  "Placing the front foot too close so the knee shoots past the toes — set it far enough forward.",
  },
  "Lunge": {
    setup:    "Step out so the front shin will stay vertical at the bottom.",
    movement: "Lower the back knee close to the floor without touching, then push off the front heel to return.",
    feel:     "Front-leg quad and glute, with balance demand through the whole leg.",
    mistake:  "Taking too short a step so the knee overshoots the toes — lengthen the stride.",
  },
  "Single-Leg RDL": {
    setup:    "Stand on one leg with a slight bend in the working knee.",
    movement: "Hinge forward as the non-working leg extends straight back, then return under control.",
    feel:     "A stretch and load through the hamstring and glute of the standing leg, plus balance work.",
    mistake:  "Rushing and losing balance — control the hinge; hip height sets the stretch, not speed.",
  },
  "Calf Raise": {
    setup:    "Balls of the feet on a step, heels free to drop below the platform.",
    movement: "Lower the heels for a full stretch, then rise and pause 1 second squeezing hard.",
    feel:     "A stretch at the bottom and a hard squeeze through the calves at the top.",
    mistake:  "Bouncing through partial reps — use full range and a slow tempo; calves respond to time under tension.",
  },
  "Squat": {
    setup:    "Feet shoulder-width, toes slightly out, chest proud.",
    movement: "Break parallel (hip crease below the top of the knee), then drive up through the full foot.",
    feel:     "Quads and glutes, with weight balanced through the whole foot.",
    mistake:  "Letting the knees cave in or coming onto the toes — drive the knees out and keep the weight mid-foot.",
  },
  "Plank": {
    setup:    "Forearms under the shoulders, body in a straight line from head to heels.",
    movement: "Hold the position, squeezing the glutes and abs simultaneously.",
    feel:     "Deep bracing across the abs and the whole trunk.",
    mistake:  "Letting the hips sag or holding the breath — keep the line and breathe normally.",
  },
  "Dead Bug": {
    setup:    "On your back, lower back pressed flat into the floor, arms and knees up.",
    movement: "Slowly extend the opposite arm and leg, then return before switching sides.",
    feel:     "The deep core working to keep the lower back pinned.",
    mistake:  "Letting the lower back arch off the floor — if it lifts, use a smaller range.",
  },
  "Ab Wheel Rollout": {
    setup:    "On the knees, abs braced hard before moving.",
    movement: "Roll out until the hips are about to drop, then pull back using the abs.",
    feel:     "Intense tension through the entire front core.",
    mistake:  "Pulling back with the hip flexors or letting the lower back sag — drive the movement from the abs.",
  },
  "Bicycle Crunch": {
    setup:    "On your back, hands lightly behind the ears, legs up.",
    movement: "Rotate a shoulder toward the opposite knee, slow and controlled, alternating sides.",
    feel:     "The obliques and abs working through the rotation.",
    mistake:  "Pulling on the neck or moving fast — rotate the shoulder, not the elbow, and slow down.",
  },
  "Balance Disc Squat": {
    setup:    "Stand centered on the balance disc, feet hip-width.",
    movement: "Squat slowly — the disc forces you to stabilize throughout.",
    feel:     "Quads and glutes plus the small stabilizers a normal squat misses.",
    mistake:  "Moving too fast and losing the center — slow down and stay balanced over the disc.",
  },
  "Kettlebell Swing": {
    setup:    "Hip-width stance, kettlebell a little ahead, shoulders back — it's a hinge, not a squat.",
    movement: "Hike the bell back between the legs, then snap the hips forward to float it up; the arms just guide.",
    feel:     "Explosive drive through the glutes and hamstrings, powered by the hips.",
    mistake:  "Squatting and lifting with the arms — hinge at the hips and let the snap do the work.",
  },
  "Burpee": {
    setup:    "Stand tall, ready to drop into a plank.",
    movement: "Squat down, kick to a plank, return, then jump with full extension and arms overhead.",
    feel:     "Full-body conditioning — legs, chest and core all working.",
    mistake:  "Landing stiff-legged or letting the hips sag in the plank — land soft and keep the plank tight.",
  },
  "Mountain Climber": {
    setup:    "Push-up position, wrists under the shoulders, hips level.",
    movement: "Drive one knee to the chest at a time without letting the hips rise.",
    feel:     "Core and hip flexors working, with cardio demand building.",
    mistake:  "Letting the hips bounce up — keep the back flat even as the pace increases.",
  },
  "Clean & Press": {
    setup:    "Kettlebell between the feet, hips loaded, back flat.",
    movement: "Explosively extend the hips to launch the bell, catch it in the rack, then press overhead.",
    feel:     "A full-body power chain from the hips into an overhead press.",
    mistake:  "Letting the bell crash onto the forearm — guide it into a soft rack, and press strict.",
  },
  "Band Pull-Apart": {
    setup:    "Arms straight out in front, hands shoulder-width, band taut.",
    movement: "Pull the band apart to the chest, hold 1 second, then return slowly.",
    feel:     "Rear delts and mid-back squeezing as the shoulder blades retract.",
    mistake:  "Bending the elbows or shrugging — keep the arms straight and retract the shoulder blades fully.",
  },
  "Dumbbell Shoulder Press": {
    setup:    "Dumbbells at ear level, elbows at about 90°, core braced.",
    movement: "Press straight up without flaring the elbows forward, then lower slowly over about 3 seconds.",
    feel:     "Shoulders pressing, triceps locking out.",
    mistake:  "Flaring the elbows forward or arching the back — press straight up and keep the ribs down.",
  },
  "Dumbbell Curl": {
    setup:    "Dumbbells at the sides, elbows pinned, shoulders relaxed.",
    movement: "Curl up supinating the wrist for a full contraction, then lower to full extension.",
    feel:     "Biceps peak contraction at the top, stretch at the bottom.",
    mistake:  "Swinging the body or cutting the range short — keep the elbows pinned and fully extend at the bottom.",
  },
  "Kettlebell Row": {
    setup:    "Knee and hand on a bench, back flat, kettlebell hanging.",
    movement: "Drive the elbow back past the torso, pause at the top, then lower.",
    feel:     "A strong lat squeeze on the working side.",
    mistake:  "Using momentum — pause at the top so the back, not the swing, does the work.",
  },
  "Single-Leg Balance Disc": {
    setup:    "Stand on one leg centered on the disc, arms out for balance.",
    movement: "Hold, gradually reducing arm assistance as balance improves.",
    feel:     "Constant micro-work through the ankle and hip stabilizers.",
    mistake:  "Fighting to stay dead still — small adjustments are the point; don't rush to remove the arms.",
  },
  "Tricep Overhead Ext": {
    setup:    "Weight overhead, elbows pointing forward, core braced.",
    movement: "Lower behind the head until the forearms touch the biceps, then press straight up.",
    feel:     "A deep stretch through the long head of the triceps.",
    mistake:  "Letting the elbows flare out — keep them pointing forward and fixed in place.",
  },
  "Thoracic Extension": {
    setup:    "Sit on the floor with the upper back (just below the shoulder blades, not the lower back) on a bench edge, hands behind the head.",
    movement: "Slowly extend back over the bench edge, hold 2–3 seconds, breathing out as you extend.",
    feel:     "A gentle opening through the mid-back (thoracic spine).",
    mistake:  "Placing the bench under the lower back or forcing it — support the mid-back and let gravity do the work.",
  },
  "Single-Arm DB Press": {
    setup:    "Lie on a bench with one dumbbell, core braced hard to resist rotation.",
    movement: "Press at a slight inward angle, pausing at the chest to kill momentum.",
    feel:     "Chest and shoulder pressing, with the core fighting the twist — that anti-rotation is the point.",
    mistake:  "Letting the torso rotate toward the weight — brace the core so the trunk stays square.",
  },
  "Single-Leg Glute Bridge": {
    setup:    "On your back, one foot planted, the other leg extended or bent.",
    movement: "Drive through the planted heel to lift the hips, squeeze the glute, hold 2 seconds.",
    feel:     "A hard contraction in the glute of the working leg.",
    mistake:  "Pushing through the toes or arching the back — drive through the heel and lift with the glute.",
  },
  "Balance Disc Plank": {
    setup:    "Forearms on a balance disc, body in a straight line, feet planted.",
    movement: "Hold while the disc wobbles, making constant micro-adjustments to stay level.",
    feel:     "The whole core and shoulders working overtime to stay stable.",
    mistake:  "Trying to add movement — progress by adding time; the instability is already the stimulus.",
  },
  "Banded Squat": {
    setup:    "Loop a band around the knees, feet shoulder-width.",
    movement: "Squat while driving the knees out against the band throughout.",
    feel:     "Quads and glutes plus extra work in the hip abductors.",
    mistake:  "Letting the band pull the knees in — actively press them out the whole rep.",
  },
  "EZ Bar Complex": {
    setup:    "Load a light EZ bar — fatigue accumulates fast across the sequence.",
    movement: "Flow row → curl → overhead press without setting the bar down.",
    feel:     "A building burn across the back, biceps and shoulders as the sequence continues.",
    mistake:  "Going too heavy — the weight must serve the weakest movement in the chain.",
  },
  "Thruster": {
    setup:    "Bar in a front-rack position, elbows high, resting on the shoulders.",
    movement: "Squat, then use the drive out of the bottom to press the bar overhead in one fluid motion.",
    feel:     "A full-body effort linking the legs into an overhead press.",
    mistake:  "Squatting and pressing as two separate moves — let the leg drive flow into the press.",
  },
  "Resistance Band Press": {
    setup:    "Anchor the band behind you at chest height, split stance, handles at the chest.",
    movement: "Press forward to full extension, then control the return without letting the band snap back.",
    feel:     "Chest and triceps working against constant band tension.",
    mistake:  "Letting the band recoil fast — control the return; step forward for more tension, back for less.",
  },

  // ── TRX / suspension ──
  // Load is set by body angle, not plates: walk the feet forward to make a
  // press harder or a row easier, and back to reverse it.
  "TRX Chest Press": {
    setup:    "Straps mid-length, hands under the shoulders, body a rigid plank.",
    movement: "Lower until the hands are level with the chest, elbows at 45°, then press back to a plank.",
    feel:     "Chest and triceps working while the core holds the plank line.",
    mistake:  "Flaring the elbows or letting the hips sag — keep elbows at 45° and the body rigid. Walk the feet forward for harder, back for easier.",
  },
  "TRX Chest Fly": {
    setup:    "Straps set, arms wide with a soft, fixed elbow bend, body leaning in.",
    movement: "Open only to a comfortable chest stretch (never past the shoulder line), then squeeze back together.",
    feel:     "A stretch across the chest — kept short because the shoulder joint is exposed here.",
    mistake:  "Letting the elbow bend change or going too wide — keep the elbow angle fixed and the range modest.",
  },
  "TRX Tricep Extension": {
    setup:    "Face away from the anchor, hands overhead, elbows pointing forward, body leaning in.",
    movement: "Bend only at the elbows to lower behind the head, then extend; the upper arms stay locked.",
    feel:     "Concentrated triceps work along the back of the upper arm.",
    mistake:  "Letting the lower back arch — keep the ribs down; stand more upright if it's too hard.",
  },
  "TRX Pike Push-Up": {
    setup:    "Feet in the foot cradles, body in a push-up plank.",
    movement: "Pike the hips high first, then lower the crown of the head down and press back up.",
    feel:     "Shoulders leading, with the core fighting the strap wobble.",
    mistake:  "Rushing while the straps swing — brace hard and slow the tempo.",
  },
  "TRX Low Row": {
    setup:    "Palms facing each other, body straight, heels planted, leaning back.",
    movement: "Pull the elbows past the ribs, squeezing the shoulder blades together, then lower.",
    feel:     "Mid-back and lats squeezing through the pull.",
    mistake:  "Hinging at the hips to help — stay straight; walk the feet forward (more horizontal) to increase load.",
  },
  "TRX High Row": {
    setup:    "Anchor high, elbows flared wide at shoulder height, leaning back.",
    movement: "Pull the hands toward the forehead, then lower slowly.",
    feel:     "Rear delts and mid-traps working — a lighter, slower movement than a low row.",
    mistake:  "Going too heavy or fast and pulling to the chest — pull to the forehead and keep it controlled.",
  },
  "TRX Y-Fly": {
    setup:    "Arms overhead in a Y, thumbs up, body leaning back.",
    movement: "Sweep the arms into the Y leading with the outside of the hands, elbows nearly straight, then return.",
    feel:     "Lower traps and rear delts working through a small, precise range.",
    mistake:  "Shrugging or bending the elbows — small range done well beats a big range with shrugging.",
  },
  "TRX Bicep Curl": {
    setup:    "Palms up, elbows locked high at shoulder height, body a rigid plank leaning back.",
    movement: "Curl the hands toward the forehead without letting the elbows drop, then lower.",
    feel:     "Biceps under tension set by the body angle.",
    mistake:  "Hinging at the hips or dropping the elbows — keep the plank and the elbows high.",
  },
  "TRX Squat": {
    setup:    "Hold the straps at the chest, arms light — they guide, not pull.",
    movement: "Sit back and down with the chest tall and knees over the toes, then stand.",
    feel:     "Quads and glutes doing the work, the straps only aiding balance.",
    mistake:  "Pulling on the straps to stand — use them for balance and let the legs drive.",
  },
  "TRX Bulgarian Split Squat": {
    setup:    "Rear foot in the cradle, front foot far enough forward, torso tall.",
    movement: "Drop straight down with the front shin near vertical, then drive back up.",
    feel:     "Front-leg quad and glute, with balance demand from the suspended rear foot.",
    mistake:  "Letting the front knee cave inward — keep it tracking over the mid-foot.",
  },
  "TRX Hamstring Curl": {
    setup:    "Lie on your back, heels in the cradles, arms flat on the floor.",
    movement: "Bridge the hips up first, then curl the heels toward the glutes; reverse under control.",
    feel:     "Hamstrings and glutes working hard to keep the hips high.",
    mistake:  "Letting the hips drop during the set — keep them high the whole time or the tension is lost.",
  },
  "TRX Hip Hinge": {
    setup:    "Straps at mid-length, hold and hinge back at the hips, back flat.",
    movement: "Push the hips back feeling the hamstring stretch, then stand and squeeze the glutes.",
    feel:     "A stretch through the hamstrings, glutes finishing the movement.",
    mistake:  "Rounding the spine or overextending at the top — hinge at the hips and stand tall without leaning back.",
  },
  "TRX Squat to Row": {
    setup:    "Hold the straps, arms extended, in a squat-ready stance.",
    movement: "Squat down first, then row as you stand — one smooth movement, legs driving and arms finishing.",
    feel:     "A full-body conditioning blend of legs and back.",
    mistake:  "Turning it into two separate moves — keep it smooth and the rhythm steady with short rest.",
  },
  "TRX Burpee": {
    setup:    "Feet in the cradles, starting in a plank.",
    movement: "Tuck the knees to the chest, push the hips up into a pike, then extend back to the plank.",
    feel:     "Core and shoulders working through the tuck, with cardio demand.",
    mistake:  "Letting the return get sloppy — control it; the straps punish loose reps.",
  },
  "TRX Mountain Climber": {
    setup:    "Feet in the cradles, hands under the shoulders, hips level.",
    movement: "Drive one knee to the chest at a time, keeping the hips from bouncing up.",
    feel:     "Core and hip flexors working on an unstable base.",
    mistake:  "Letting the hips bounce — the straps make this less stable, so go slower and stay controlled.",
  },
  "TRX Plank": {
    setup:    "Forearms on the floor, feet in the cradles, body one straight line.",
    movement: "Hold, squeezing the glutes and bracing the abs to stop the straps swinging.",
    feel:     "The whole core working to resist the strap movement.",
    mistake:  "Letting the hips sag — end the set on quality, not the clock.",
  },
  "TRX Pike": {
    setup:    "Start in a plank with the feet in the cradles.",
    movement: "Lift the hips toward the ceiling with straight legs, head between the arms, then return slowly.",
    feel:     "Deep lower-ab and hip-flexor work through the pike.",
    mistake:  "Collapsing back down fast — lower slowly with control.",
  },
  "TRX Body Saw": {
    setup:    "Forearm plank with the feet in the cradles, body rigid.",
    movement: "Push the floor away to slide back, then pull forward — moving only a few inches.",
    feel:     "An intense anti-extension brace across the core.",
    mistake:  "Making the saw too big — the smaller the range, the harder the brace works.",
  },

  // ── Bodyweight additions ──
  "Superman Hold": {
    setup:    "Face down, arms extended forward, legs straight.",
    movement: "Lift the arms, chest and thighs off the floor together and hold.",
    feel:     "The lower back, glutes and mid-back contracting.",
    mistake:  "Craning the neck up — look at the floor to keep it neutral.",
  },
  "Hollow Hold": {
    setup:    "On your back, lower back pressed flat into the floor — that flat contact is the whole exercise.",
    movement: "Arms overhead and legs straight, lift both just off the ground and hold.",
    feel:     "Deep tension through the entire front core.",
    mistake:  "Letting the lower back lift off the floor — bend the knees or raise the legs higher until it stays flat.",
  },
};

// ── 1RM & cross-exercise estimation ──────────────────────────────────────────
function calc1RM(weight, reps) {
  const w = parseFloat(weight), r = parseInt(reps);
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30));
}
function weightForReps(oneRM, targetReps) {
  if (!oneRM || !targetReps) return 0;
  return Math.round((oneRM / (1 + targetReps / 30)) * 2) / 2;
}
const CROSS_RATIOS = {
  "Overhead Press":           { from: "Barbell Bench Press", pct: 0.62 },
  "Dumbbell Bench Press":     { from: "Barbell Bench Press", pct: 0.40 }, // per hand, so lower
  "Dumbbell Shoulder Press":  { from: "Barbell Bench Press", pct: 0.28 }, // per hand ~17kg for 60kg bench
  "Barbell Row":              { from: "Barbell Deadlift",    pct: 0.65 },
  "Dumbbell Row":             { from: "Barbell Deadlift",    pct: 0.20 }, // per hand
  "Single-Arm Dumbbell Row":  { from: "Barbell Deadlift",    pct: 0.20 }, // per hand
  "Romanian Deadlift":        { from: "Barbell Deadlift",    pct: 0.72, isBarbell: true },
  "Goblet Squat":             { from: "Barbell Squat",       pct: 0.25 }, // single dumbbell
  "Bulgarian Split Squat":    { from: "Barbell Squat",       pct: 0.25 }, // per hand db
  "Lunge":                    { from: "Barbell Squat",       pct: 0.22 }, // per hand db
  "EZ Bar Curl":              { from: "Barbell Bench Press", pct: 0.30 },
  "Dumbbell Curl":            { from: "Barbell Bench Press", pct: 0.13 }, // per hand
  "Weighted Pull-Up":         { from: "Weighted Dip",        pct: 0.85 },
  "Weighted Chin-Up":         { from: "Weighted Dip",        pct: 0.90 },
  "Close-Grip Bench Press":   { from: "Barbell Bench Press", pct: 0.88 },
  "Tricep Overhead Ext":      { from: "EZ Bar Skull Crusher",pct: 0.55 }, // per hand if db
  "EZ Bar Skull Crusher":     { from: "Barbell Bench Press", pct: 0.50 },
  "Dumbbell Fly":             { from: "Barbell Bench Press", pct: 0.20 }, // per hand — already set by baseline
  "Single-Arm DB Press":      { from: "Barbell Bench Press", pct: 0.30 }, // per hand
};

const USER_BASELINE = {
  "Barbell Bench Press":     { weight: "60",  reps: "8"  },
  "Dumbbell Fly":            { weight: "12.5",reps: "15" },
  "Barbell Squat":           { weight: "70",  reps: "10" },
  "Barbell Deadlift":        { weight: "80",  reps: "8"  },
  "Weighted Dip":            { weight: "20",  reps: "12" },
  "EZ Bar Skull Crusher":    { weight: "38",  reps: "8"  },
  "Single-Arm Dumbbell Row": { weight: "24",  reps: "12" },
};


// ── DAY TYPE MAPPING for next session planning ────────────────────────────────
function getDayType(day) {
  if (day === "Push")  return "push";
  if (day === "Pull")  return "pull";
  if (day === "Legs")  return "legs";
  if (day === "Full Body" || day === "Full Body A" || day === "Full Body B") return "fullbody";
  if (day === "Upper A" || day === "Upper B" || day === "Upper") return "upper";
  if (day === "Lower A" || day === "Lower B") return "lower";
  if (day === "Chest") return "chest";
  if (day === "Back")  return "back";
  if (day === "Shoulders") return "shoulders";
  if (day === "Arms")  return "arms";
  return "other";
}

// ── STEP 1: Calculate next session plan from completed session RIR ─────────────
function calcNextSessionPlan(day, sessionLog, goal, data) {
  const dayType = getDayType(day);
  const plan = {};
  // TRX and bodyweight sessions have no weight field at all — their progression
  // is always a rep target, never a load change.
  const repsOnlyMode = !isWeightsMode(data?.activeMode);

  const isDumbbellEx = (name) => ["Dumbbell Bench Press","Dumbbell Shoulder Press","Dumbbell Row",
    "Dumbbell Curl","Single-Arm Dumbbell Row","Dumbbell Fly","Goblet Squat","Single-Leg RDL",
    "Tricep Overhead Ext","Clean & Press","Single-Arm DB Press",
    "Bulgarian Split Squat","Lunge"].includes(name);
  const isBarbellEx = (name) => ["Barbell Bench Press","Barbell Squat","Barbell Deadlift",
    "Barbell Row","Overhead Press","Close-Grip Bench Press","Romanian Deadlift"].includes(name);
  const isEZEx = (name) => ["EZ Bar Curl","EZ Bar Skull Crusher","EZ Bar Reverse Curl",
    "EZ Bar Upright Row"].includes(name);
  const isDipBeltEx = (name) => ["Weighted Dip","Weighted Pull-Up","Weighted Chin-Up","Weighted Push-Up"].includes(name);
  const isBodyweightEx = (name) => !isDumbbellEx(name) && !isBarbellEx(name) && !isEZEx(name) && !isDipBeltEx(name);

  const dbSteps = (data.dumbbellWeights || "")
    .split(",").map(v => parseFloat(v.trim())).filter(Boolean).sort((a, b) => a - b);

  const snapToDB = (w) => {
    if (!dbSteps.length) return w;
    return dbSteps.reduce((prev, curr) => Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev);
  };

  const stepDB = (currentWeight, steps) => {
    const snapped = snapToDB(currentWeight);
    const idx = dbSteps.indexOf(snapped);
    if (idx === -1) return currentWeight;
    const newIdx = Math.max(0, Math.min(dbSteps.length - 1, idx + steps));
    return dbSteps[newIdx];
  };

  const barbellSmallInc = 5;
  const barbellBigInc = 10;
  const dipSmallInc = 2.5;
  const dipBigInc = 5;

  const dbMax = parseFloat(data.dumbbellMax) || 24;
  const barbellMax = parseFloat(data.barbellMax) || 119;
  const ezMax = parseFloat(data.ezbarMax) || 113;
  const dipMax = parseFloat(data.dipbeltMax) || 20;

  Object.entries(sessionLog).forEach(([exName, sets]) => {
    const hasTimed = sets.some(s => s.seconds !== undefined);
    const hasWeight = sets.some(s => s.weight && parseFloat(s.weight) > 0);
    const hasReps = sets.some(s => s.reps && parseInt(s.reps) > 0);

    const rirValues = sets
      .filter(s => s.rpe !== "" && s.rpe !== undefined && s.rpe !== null && (s.reps || s.seconds))
      .map(s => parseInt(s.rpe))
      .filter(r => !isNaN(r));
    if (!rirValues.length) return;

    const avgRIR = rirValues.reduce((a, b) => a + b, 0) / rirValues.length;

    if (repsOnlyMode || hasTimed || (!hasWeight && hasReps) || isBodyweightEx(exName)) {
      const lastReps = sets.filter(s => s.reps).map(s => parseInt(s.reps));
      if (!lastReps.length) return;
      const avgReps = Math.round(lastReps.reduce((a, b) => a + b, 0) / lastReps.length);
      let targetReps;
      if (avgRIR <= 1) targetReps = Math.max(1, avgReps - 2);
      else if (avgRIR <= 3) targetReps = avgReps + 1;
      else targetReps = avgReps + 3;
      plan[exName] = { targetReps, targetRIR: parseFloat(avgRIR.toFixed(1)), source: "rir", type: "reps" };
      return;
    }

    const lastWeights = sets.filter(s => s.weight && parseFloat(s.weight) > 0).map(s => parseFloat(s.weight));
    if (!lastWeights.length) return;
    const currentWeight = Math.max(...lastWeights);
    const lastReps = sets.filter(s => s.reps).map(s => parseInt(s.reps));
    const avgReps = lastReps.length ? Math.round(lastReps.reduce((a, b) => a + b, 0) / lastReps.length) : 8;

    let targetWeight = currentWeight;

    // Rep threshold: only increase weight when avgReps >= midpoint of range (10 for 8-12)
    // This lets reps climb first before adding load — prevents premature weight jumps
    const repMidpoint = 10; // midpoint of 8-12 hypertrophy range
    const repsReadyForIncrease = avgReps >= repMidpoint;

    if (isDumbbellEx(exName)) {
      if (avgRIR <= 1) targetWeight = stepDB(currentWeight, -1);
      else if (avgRIR <= 3 && repsReadyForIncrease) targetWeight = stepDB(currentWeight, 1);
      else if (avgRIR > 3) targetWeight = stepDB(currentWeight, 2);
      // else: avgRIR 2-3 but reps < 10 → keep same weight, let reps climb
      targetWeight = Math.min(targetWeight, dbMax);
    } else if (isBarbellEx(exName)) {
      if (avgRIR <= 1) targetWeight = Math.max(0, currentWeight - barbellSmallInc);
      else if (avgRIR <= 3 && repsReadyForIncrease) targetWeight = currentWeight + barbellSmallInc;
      else if (avgRIR > 3) targetWeight = currentWeight + barbellBigInc;
      // else: avgRIR 2-3 but reps < 10 → keep same weight
      targetWeight = Math.min(targetWeight, barbellMax);
    } else if (isEZEx(exName)) {
      if (avgRIR <= 1) targetWeight = Math.max(0, currentWeight - barbellSmallInc);
      else if (avgRIR <= 3 && repsReadyForIncrease) targetWeight = currentWeight + barbellSmallInc;
      else if (avgRIR > 3) targetWeight = currentWeight + barbellBigInc;
      targetWeight = Math.min(targetWeight, ezMax);
    } else if (isDipBeltEx(exName)) {
      if (avgRIR <= 1) targetWeight = Math.max(0, currentWeight - dipSmallInc);
      else if (avgRIR <= 3 && repsReadyForIncrease) targetWeight = currentWeight + dipSmallInc;
      else if (avgRIR > 3) targetWeight = currentWeight + dipBigInc;
      targetWeight = Math.min(targetWeight, dipMax);
    }

    plan[exName] = {
      targetWeight: parseFloat(targetWeight.toFixed(1)),
      targetReps: avgReps,
      targetRIR: parseFloat(avgRIR.toFixed(1)),
      source: "rir",
      type: "weight",
    };
  });

  return { dayType, plan };
}
// Public entry point. Every suggestion is rounded to a load the plates on hand
// can actually build, so TODAY'S TARGET, the pre-filled set input and the plate
// breakdown underneath it always quote the same number. Without this the card
// showed the achievable 84.0kg while the input pre-filled the raw target 86.0kg.
function getSmartSuggestion(exName, goal, history, profileBaseline, data) {
  const s = getSmartSuggestionRaw(exName, goal, history, profileBaseline, data);
  if (!s || !s.weight) return s;
  const raw  = parseFloat(s.weight);
  const disp = formatWeightDisplay(exName, s.weight, data);
  // Only bar-loaded lifts are plate-constrained; dumbbells are snapped upstream.
  if (!raw || !disp || (disp.type !== "barbell" && disp.type !== "ezbar")) return s;
  const snapped = parseFloat(disp.total);
  if (!snapped || Math.abs(snapped - raw) < 0.05) return s;
  // 1RM is linear in load under Epley, so scale rather than recompute.
  return { ...s, weight: snapped.toFixed(1), snappedFrom: raw.toFixed(1),
           oneRM: s.oneRM ? Math.round(s.oneRM * snapped / raw) : s.oneRM };
}

function getSmartSuggestionRaw(exName, goal, history, profileBaseline, data) {
  const rr = REP_RANGES[goal] || REP_RANGES.general;
  const targetReps = parseInt(rr.reps.split("-")[0]);
  const dbMax = parseFloat(data?.dumbbellMax) || 24;
  const barbellMax = parseFloat(data?.barbellMax) || 119;
  const ezMax = parseFloat(data?.ezbarMax) || 113;
  const dipMax = parseFloat(data?.dipbeltMax) || 30;

  // Determine weight cap for this exercise
  const isDumbbell = ["Dumbbell Bench Press","Dumbbell Shoulder Press","Dumbbell Row","Dumbbell Curl",
    "Single-Arm Dumbbell Row","Dumbbell Fly","Goblet Squat","Single-Leg RDL",
    "Tricep Overhead Ext","Clean & Press","Single-Arm DB Press"].includes(exName);
  const isBarbell = ["Barbell Bench Press","Barbell Squat","Barbell Deadlift","Barbell Row",
    "Overhead Press","Romanian Deadlift","Close-Grip Bench Press"].includes(exName);
  const isEZ = ["EZ Bar Curl","EZ Bar Skull Crusher","EZ Bar Reverse Curl","EZ Bar Upright Row","Close-Grip Bench Press"].includes(exName);
  const isDipBelt = ["Weighted Dip","Weighted Pull-Up","Weighted Chin-Up","Weighted Push-Up"].includes(exName);
  const isBW = !isDumbbell && !isBarbell && !isEZ && !isDipBelt;

  const capWeight = (w) => {
    if (isDumbbell) return Math.min(w, dbMax);
    if (isBarbell) return Math.min(w, barbellMax);
    if (isEZ) return Math.min(w, ezMax);
    if (isDipBelt) return Math.min(w, dipMax);
    return w;
  };

  // Round to nearest available dumbbell if dumbbell exercise
  const snapToDB = (w) => {
    if (!isDumbbell || !data?.dumbbellWeights) return w;
    const available = data.dumbbellWeights.split(",").map(v => parseFloat(v.trim())).filter(Boolean).sort((a,b)=>a-b);
    if (!available.length) return w;
    return available.reduce((prev, curr) => Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev);
  };

  
  // ── PRIORITY 0: Next session plan from RIR ─────────────────────────────────
  // Only read plan buckets belonging to the active mode. Bodyweight and TRX
  // plans live under a "<mode>:<dayType>" key, so a TRX session can never
  // re-target the same-named exercise in weights mode.
  const activeMode = data?.activeMode || DEFAULT_MODE;
  if (data && data.nextSession) {
    for (const [bucketKey, dayPlan] of Object.entries(data.nextSession)) {
      const bucketMode = bucketKey.includes(":") ? bucketKey.split(":")[0] : DEFAULT_MODE;
      if (bucketMode !== activeMode) continue;
      if (dayPlan && dayPlan[exName]) {
        const p = dayPlan[exName];
        // A load target is only ever honoured in weights mode, even if a stale
        // one somehow sits in a TRX/BW bucket.
        if (p.type === "weight" && p.targetWeight && isWeightsMode(activeMode))
          // Report where the target actually came from. planRIR is only set for
          // RIR-derived plans, so an AI-adjusted load never claims to be one.
          return { weight: p.targetWeight.toFixed(1), reps: rr.reps,
            source: p.source === "ai_proposal" ? "ai_planned" : "planned",
            oneRM: calc1RM(p.targetWeight, p.targetReps),
            planRIR: p.source === "ai_proposal" ? undefined : p.targetRIR };
        if (p.type === "reps")
          return { weight: null, reps: String(p.targetReps), oneRM: null,
            source: p.source === "ai_proposal" ? "ai_planned" : "planned" };
      }
    }
  }

  // Non-weights modes stop here: no loaded record, baseline, or cross-exercise
  // estimate applies. Progression for these comes purely from the rep plan above.
  if (!isWeightsMode(activeMode)) return { weight: null, reps: rr.reps, source: "bw", oneRM: null };

  // Intensification phase — formula-based weight calc
  if (data?.mesocycle?.phase === "intensification") {
    const isDumbbellEx2 = ["Dumbbell Bench Press","Dumbbell Shoulder Press","Dumbbell Row",
      "Dumbbell Curl","Single-Arm Dumbbell Row","Dumbbell Fly","Goblet Squat","Single-Leg RDL",
      "Tricep Overhead Ext","Clean & Press","Single-Arm DB Press",
      "Bulgarian Split Squat","Lunge"].includes(exName);
    const isBarbellEx2 = ["Barbell Bench Press","Barbell Squat","Barbell Deadlift",
      "Barbell Row","Overhead Press","Close-Grip Bench Press","Romanian Deadlift"].includes(exName);
    const isEZEx2      = ["EZ Bar Curl","EZ Bar Skull Crusher","EZ Bar Reverse Curl",
      "EZ Bar Upright Row"].includes(exName);
    const isDipBeltEx2 = ["Weighted Dip","Weighted Pull-Up","Weighted Chin-Up","Weighted Push-Up"].includes(exName);
    const activeDay2   = data.activeDay || "";
    const { weight: bestW, reps: bestR } = getBestFromLastTwoSameDaySessions(
      exName, activeDay2, history, profileBaseline
    );
    if (bestW > 0) {
      const oneRM  = calc1RM(bestW, bestR);
      const rawSug = weightForReps(oneRM, 6);
      const snapToDB2 = (w) => {
        if (!data?.dumbbellWeights) return w;
        const av = data.dumbbellWeights.split(",").map(v => parseFloat(v.trim())).filter(Boolean).sort((a,b)=>a-b);
        return av.length ? av.reduce((p,c) => Math.abs(c-w)<Math.abs(p-w)?c:p) : w;
      };
      const snapToBar2 = (w, barW, plts) => {
        if (!plts) return Math.round(w/2.5)*2.5;
        return calcPlates(w, barW, plts).total;
      };
      let finalW = rawSug;
      if (isDumbbellEx2)     finalW = Math.min(snapToDB2(rawSug), parseFloat(data?.dumbbellMax)||24);
      else if (isBarbellEx2) finalW = Math.min(snapToBar2(rawSug, data?.barWeight||"14", data?.barbellPlates), parseFloat(data?.barbellMax)||119);
      else if (isEZEx2)      finalW = Math.min(snapToBar2(rawSug, data?.ezbarWeight||"8", data?.ezbarPlates), parseFloat(data?.ezbarMax)||113);
      else if (isDipBeltEx2) finalW = Math.min(Math.round(rawSug/2.5)*2.5, parseFloat(data?.dipbeltMax)||20);
      return {
        weight: finalW.toFixed(1), reps: "6-8", source: "intensification", oneRM,
        intensificationNote: `from ${bestW}kg x ${bestR} (1RM ~${oneRM}kg)`,
      };
    }
  }

// 1. Actual log — always priority
  const best = getBestRecord(exName, history, profileBaseline);
  if (best.weight > 0) {
    const oneRM = calc1RM(best.weight, best.reps);
    const suggested = weightForReps(oneRM, targetReps);
    const inc = goal === "strength" ? 2.5 : 1.25;
    const bump = best.reps >= targetReps ? inc : 0;
    const raw = capWeight(suggested + bump);
    const final = isDumbbell ? snapToDB(raw) : raw;
    return { weight: final.toFixed(1), reps: rr.reps, source: "log", oneRM };
  }
  // 2. Profile baseline
  const base = profileBaseline?.[exName];
  if (base?.weight) {
    const oneRM = calc1RM(base.weight, base.reps);
    const suggested = capWeight(weightForReps(oneRM, targetReps));
    const final = isDumbbell ? snapToDB(suggested) : suggested;
    return { weight: final.toFixed(1), reps: rr.reps, source: "baseline", oneRM };
  }
  // 3. Cross-exercise estimate
  const ratio = CROSS_RATIOS[exName];
  if (ratio) {
    const refBest = getBestRecord(ratio.from, history, profileBaseline);
    const refBase = profileBaseline?.[ratio.from];
    const refW = refBest.weight || parseFloat(refBase?.weight) || 0;
    const refR = refBest.reps || parseInt(refBase?.reps) || 8;
    if (refW > 0) {
      const ref1RM = calc1RM(refW, refR);
      const est1RM = Math.round(ref1RM * ratio.pct);
      const raw = capWeight(weightForReps(est1RM, targetReps));
      const final = isDumbbell ? snapToDB(raw) : raw;
      return { weight: final.toFixed(1), reps: rr.reps, source: "estimated", oneRM: est1RM };
    }
  }
  // 4. BW exercises — return null weight but show reps
  if (isBW) return { weight: null, reps: rr.reps, source: "bw", oneRM: null };
  return null;
}

// ── Favourites by muscle group ────────────────────────────────────────────────
const ALL_EXERCISES_BY_MUSCLE = {
  Chest:     ["Push-Up","Diamond Push-Up","Dumbbell Bench Press","Barbell Bench Press","Close-Grip Bench Press","Dumbbell Fly","Resistance Band Press","Weighted Push-Up","Single-Arm DB Press"],
  Back:      ["Pull-Up","Chin-Up","Neutral Grip Pull-Up","Weighted Pull-Up","Weighted Chin-Up","Inverted Row","Dumbbell Row","Single-Arm Dumbbell Row","Barbell Row","EZ Bar Upright Row","Band Pull-Apart"],
  Shoulders: ["Pike Push-Up","Dumbbell Shoulder Press","Overhead Press","EZ Bar Upright Row"],
  Arms:      ["Dumbbell Curl","EZ Bar Curl","EZ Bar Reverse Curl","Tricep Dips","Weighted Dip","EZ Bar Skull Crusher","Tricep Overhead Ext","Close-Grip Bench Press"],
  Legs:      ["Squat","Barbell Squat","Bulgarian Split Squat","Lunge","Romanian Deadlift","Single-Leg RDL","Goblet Squat","Barbell Deadlift","Banded Squat","Calf Raise","Single-Leg Glute Bridge","Balance Disc Squat"],
  Core:      ["Plank","Dead Bug","Ab Wheel Rollout","Bicycle Crunch","Balance Disc Plank"],
};

// ── Favourites Screen ─────────────────────────────────────────────────────────
function FavouritesScreen({ data, setData, onBack }) {
  const [activeGroup, setActiveGroup] = useState("Chest");
  const favs = data.favourites || {};
  const toggle = (ex) => {
    const groupFavs = favs[activeGroup] || [];
    const next = groupFavs.includes(ex) ? groupFavs.filter(e => e !== ex) : [...groupFavs, ex];
    setData(d => ({ ...d, favourites: { ...favs, [activeGroup]: next } }));
  };
  return (
    <div style={S.section}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <button style={S.btnSm} onClick={onBack}>← Back</button>
        <div style={S.h1}>Favourites</div>
      </div>
      <div style={S.sub}>THESE EXERCISES GET PRIORITY IN YOUR WORKOUT</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {Object.keys(ALL_EXERCISES_BY_MUSCLE).map(g => (
          <button key={g} style={{ ...S.chip(activeGroup === g), padding: "6px 12px" }} onClick={() => setActiveGroup(g)}>{g}</button>
        ))}
      </div>
      {(ALL_EXERCISES_BY_MUSCLE[activeGroup] || []).map(ex => {
        const isFav = (favs[activeGroup] || []).includes(ex);
        return (
          <div key={ex} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }} onClick={() => toggle(ex)}>
            <span style={{ fontSize: 20 }}>{isFav ? "❤️" : "🤍"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15 }}>{ex}</div>
              {TECHNIQUE[ex] && <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{TECHNIQUE[ex].movement}</div>}
            </div>
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </div>
  );
}

// ── Calendar Screen ───────────────────────────────────────────────────────────
function CalendarScreen({ data, setData }) {
  const [expandedSession, setExpandedSession] = useState(null); // "date" key
  const history = data.history || [];
  const split = data.split || [];
  const lastTraining = history.find(h => h.day !== "Stretch");
  const lastIdx = lastTraining ? split.indexOf(lastTraining.day) : -1;
  const nextDay = split[(lastIdx + 1) % split.length];

  // Rolling 28-day window, grouped into Mon-starting weeks
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - 28); cutoff.setHours(0,0,0,0);
  const recent = history.filter(h => new Date(h.date) >= cutoff);

  // Group into Mon-starting week buckets
  const weekMap = {};
  recent.forEach(h => {
    const d = new Date(h.date);
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); mon.setHours(0,0,0,0);
    const key = mon.toISOString().slice(0,10);
    if (!weekMap[key]) weekMap[key] = { mon, sessions: [] };
    weekMap[key].sessions.push(h);
  });
  const weeks = Object.values(weekMap)
    .sort((a,b) => b.mon - a.mon)
    .map(w => ({ ...w, sessions: w.sessions.sort((a,b) => new Date(b.date)-new Date(a.date)) }));

  const dayTypeColor = day => {
    const d = day.toLowerCase();
    if (d === "stretch") return "var(--green)";
    if (d.includes("push") || d.includes("chest") || d.includes("shoulder") || d.includes("arm")) return "var(--amber)";
    if (d.includes("pull") || d.includes("back")) return "var(--blue)";
    if (d.includes("leg") || d.includes("lower")) return "var(--green)";
    return "var(--purple)";
  };

  const ABBREV = {
    "Barbell Bench Press":"Bench","Barbell Squat":"Squat","Barbell Deadlift":"DL",
    "Barbell Row":"Row","Overhead Press":"OHP","Romanian Deadlift":"RDL",
    "EZ Bar Curl":"EZ Curl","EZ Bar Skull Crusher":"Skull Crusher",
    "Dumbbell Shoulder Press":"DB Press","Dumbbell Bench Press":"DB Bench",
    "Dumbbell Row":"DB Row","Dumbbell Fly":"Fly","Weighted Pull-Up":"Pull-Up+",
    "Weighted Dip":"Dip+","Assisted Pull-Up":"Asst Pull-Up","Single-Arm Dumbbell Row":"DB Row",
    "Single-Arm DB Press":"DB Press","Close-Grip Bench Press":"CG Bench",
    "EZ Bar Skull Crusher":"Skull","Bulgarian Split Squat":"Split Squat",
  };
  const abbrev = name => ABBREV[name] || name.split(" ").slice(0,2).join(" ");

  const highlights = log => Object.entries(log||{})
    .map(([name, sets]) => ({
      name,
      maxW: Math.max(0, ...sets.map(s => parseFloat(s.weight)||0)),
      vol:  sets.reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0),
    }))
    .filter(e => e.maxW > 0)
    .sort((a,b) => b.vol - a.vol)
    .slice(0, 2);

  const weekLabel = mon => {
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toLocaleString("default",{month:"short",day:"numeric"}).toUpperCase();
    return `${fmt(mon)} – ${fmt(sun)}`;
  };
  const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

  return (
    <div style={S.section}>
      <div style={S.h1}>Training <span style={{ color:"var(--amber)" }}>Log</span></div>
      <div style={S.sub}>LAST 4 WEEKS · {recent.length} SESSIONS</div>

      {nextDay && nextDay !== "REST" && (
        <div style={{ ...S.card, border:"1px solid var(--green)", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--green)" }}>NEXT SESSION</div>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18 }}>{nextDay}</div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>{(SPLIT_MAP[nextDay]||[]).join(" · ")}</div>
          </div>
          <button style={{ ...S.btnGreen, padding:"8px 14px", fontSize:13 }}
            onClick={() => setData(d => ({ ...d, activeDay: nextDay }))}>Start →</button>
        </div>
      )}

      {weeks.length === 0 && (
        <div style={{ ...S.card, textAlign:"center", padding:36, color:"var(--muted)" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📋</div>No sessions in the last 4 weeks.
        </div>
      )}

      {weeks.map(({ mon, sessions }) => (
        <div key={mon.toISOString()} style={{ marginBottom:24 }}>
          {/* Week header */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", letterSpacing:1, flexShrink:0 }}>{weekLabel(mon)}</span>
            <div style={{ flex:1, height:1, background:"var(--border)" }} />
          </div>

          {sessions.map(session => {
            const key = session.date + session.day;
            const isOpen = expandedSession === key;
            const h = highlights(session.log);
            const typeColor = dayTypeColor(session.day);
            const allSets = Object.entries(session.log||{});

            return (
              <div key={key}>
                {/* Session row */}
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0",
                  borderBottom: isOpen ? "none" : "1px solid var(--border)", cursor:"pointer" }}
                  onClick={() => setExpandedSession(isOpen ? null : key)}>

                  {/* Day number */}
                  <div style={{ width:40, flexShrink:0 }}>
                    <div style={{ fontFamily:"var(--font-m)", fontSize:8, color:"var(--muted)", letterSpacing:0.5 }}>{DOW[new Date(session.date).getDay()]}</div>
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--text)", lineHeight:1 }}>{parseInt(session.date.slice(8))}</div>
                  </div>

                  {/* Type chip */}
                  <div style={{ flexShrink:0, padding:"3px 7px", borderRadius:4,
                    background:typeColor+"1a", border:`1px solid ${typeColor}44` }}>
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:10,
                      color:typeColor, letterSpacing:0.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>
                      {session.day}
                    </div>
                  </div>

                  {/* Highlights */}
                  <div style={{ flex:1, minWidth:0 }}>
                    {session.day === "Stretch" ? (
                      <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--green)" }}>
                        {session.duration ? `${session.duration} min` : "Stretch"}
                        {session.focus && STRETCH_ROUTINES[session.focus] ? ` · ${STRETCH_ROUTINES[session.focus].label}` : ""}
                      </div>
                    ) : h.length > 0 ? (
                      <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--text)",
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {h.map((e,i) => (
                          <span key={i}>
                            {i > 0 && <span style={{ color:"var(--border)", margin:"0 5px" }}>·</span>}
                            {abbrev(e.name)}&nbsp;<span style={{ color:"var(--amber)" }}>{e.maxW}kg</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Bodyweight</div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", flexShrink:0 }}>
                    {isOpen ? "▲" : "▼"}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ padding:"10px 0 14px 52px", borderBottom:"1px solid var(--border)",
                    animation:"fadeUp .2s cubic-bezier(0.16,1,0.3,1) both" }}>
                    {session.day === "Stretch" ? (
                      <div style={{ fontFamily:"var(--font-m)", fontSize:12, color:"var(--muted)" }}>
                        {session.focus && STRETCH_ROUTINES[session.focus]
                          ? `${STRETCH_ROUTINES[session.focus].label} — ${STRETCH_ROUTINES[session.focus].desc}`
                          : "Mobility session"}
                      </div>
                    ) : (
                      <>
                        {allSets.map(([name, sets]) => {
                          const hasSecs = sets.some(s => s.seconds);
                          const display = hasSecs
                            ? sets.filter(s=>s.seconds).map(s=>`${s.seconds}s`).join(" / ")
                            : sets.filter(s=>s.reps).map(s=>`${s.weight||"BW"}×${s.reps}`).join(" / ");
                          return (
                            <div key={name} style={{ display:"flex", justifyContent:"space-between",
                              alignItems:"baseline", marginBottom:5, gap:8 }}>
                              <span style={{ fontFamily:"var(--font-b)", fontSize:12, color:"var(--muted)",
                                flexShrink:0, maxWidth:"45%" }}>{name}</span>
                              <span style={{ fontFamily:"var(--font-m)", fontSize:11,
                                color:"var(--text)", textAlign:"right" }}>{display}</span>
                            </div>
                          );
                        })}
                        {session.notes && (
                          <div style={{ fontFamily:"var(--font-b)", fontSize:12, color:"var(--muted)",
                            fontStyle:"italic", marginTop:8 }}>"{session.notes}"</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ height:20 }} />
    </div>
  );
}

// ── Stats Screen ──────────────────────────────────────────────────────────────
function StatsScreen({ data }) {
  const history = data.history || [];
  const bwHistory = data.bodyWeightHistory || [];
  const [selectedEx, setSelectedEx] = useState("Barbell Bench Press");
  const [activePanel, setActivePanel] = useState("strength");

  // All exercise names that appear in history
  const allExNames = [...new Set(history.flatMap(h => Object.keys(h.log||{})))];

  // Build per-exercise history: [{date, weight, reps, 1rm}]
  const exHistory = (exName) => history.map(h => {
    const sets = (h.log?.[exName] || []).filter(s => s.weight && s.reps);
    if (!sets.length) return null;
    const best = sets.reduce((a, s) => {
      const w = parseFloat(s.weight), r = parseInt(s.reps);
      return w > a.w ? { w, r } : a;
    }, { w: 0, r: 0 });
    return { date: h.date, weight: best.w, reps: best.r, orm: calc1RM(best.w, best.r) };
  }).filter(Boolean).reverse();

  // Weekly volume per muscle
  const weeklyVolume = () => {
    const weeks = {};
    history.forEach(h => {
      const d = new Date(h.date);
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
      const wk = weekStart.toISOString().slice(0,10);
      if (!weeks[wk]) weeks[wk] = { week: wk, volume: 0, sessions: 0 };
      weeks[wk].volume += h.volume || 0;
      weeks[wk].sessions++;
    });
    return Object.values(weeks).sort((a,b) => a.week.localeCompare(b.week)).slice(-8);
  };

  // Average RPE per session
  const rirHistory = history.map(h => {
    const rpes = Object.values(h.log||{}).flat().map(s => parseInt(s.rpe)).filter(Boolean);
    return rpes.length ? { date: h.date, rpe: (rpes.reduce((a,b)=>a+b,0)/rpes.length).toFixed(1) } : null;
  }).filter(Boolean).reverse().slice(-10);

  // Consistency: sessions per week target
  const targetPerWeek = parseInt(data.days) || 3;
  const weeks = weeklyVolume();
  const avgSessions = weeks.length ? (weeks.reduce((a,w)=>a+w.sessions,0)/weeks.length).toFixed(1) : 0;
  const streak = (() => {
    let s = 0;
    const today = new Date();
    for (let i = 0; i < history.length; i++) {
      const d = new Date(history[i].date);
      const diff = Math.round((today - d) / 86400000);
      if (diff <= (i + 1) * 3) s++; else break;
    }
    return s;
  })();

  // PR detection
  const PRs = allExNames.map(ex => {
    const exH = exHistory(ex);
    if (!exH.length) return null;
    const best = exH.reduce((a,e) => e.orm > a.orm ? e : a, exH[0]);
    return { ex, weight: best.weight, reps: best.reps, orm: best.orm, date: best.date };
  }).filter(Boolean).sort((a,b) => b.orm - a.orm).slice(0, 6);

  // Current-week data for MRV panel
  const thisWeekStart = (() => { const d = new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d; })();
  const thisWeekHistory = history.filter(h => new Date(h.date) >= thisWeekStart);
  const weeklySets = getMuscleWeeklySets(thisWeekHistory);
  const muscleVolThisWeek = getMuscleVolumeByWeek(thisWeekHistory);

  // Count-up number animation for key stats
  const CountUp = ({ value, suffix="" }) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
      if (!value) return;
      const duration = 550;
      const start = Date.now();
      const tick = () => {
        const t = Math.min((Date.now()-start)/duration, 1);
        const eased = 1 - Math.pow(2, -10*t);
        setDisplay(Math.round(value * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, [value]);
    return <>{display}{suffix}</>;
  };

  const MiniBar = ({ values, colors, labels, unit="" }) => {
    const max = Math.max(...values.map(v => parseFloat(v)||0), 1);
    return (
      <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:60 }}>
        {values.map((v,i) => {
          const pct = (parseFloat(v)||0)/max*100;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>{v}{unit}</div>
              <div style={{
                width:"100%", background: colors?.[i] || "var(--amber)", borderRadius:"2px 2px 0 0",
                height:pct+"%", minHeight:4, opacity:0.8,
                animation:"barRise 420ms cubic-bezier(0.16,1,0.3,1) both",
                animationDelay:`${i*35}ms`, transformOrigin:"bottom center"
              }} />
              {labels?.[i] && <div style={{ fontFamily:"var(--font-m)", fontSize:8, color:"var(--muted)", textAlign:"center" }}>{labels[i]}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const LineChart = ({ points, color="var(--amber)", unit="" }) => {
    const pathRef = useRef(null);
    const vals = points.map(p => p.y);
    const min = points.length >= 2 ? Math.min(...vals) : 0;
    const max = points.length >= 2 ? Math.max(...vals) : 1;
    const range = max - min || 1;
    const W = 300, H = 80;
    const pts = points.length >= 2
      ? points.map((p,i) => ({ x:(i/(points.length-1))*W, y:H-((p.y-min)/range)*(H-10)-5 }))
      : [];
    const path = pts.map((p,i) => `${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    useEffect(() => {
      const el = pathRef.current;
      if (!el) return;
      try {
        const len = el.getTotalLength();
        el.style.strokeDasharray = `${len} ${len}`;
        el.style.strokeDashoffset = `${len}`;
        el.style.transition = "none";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.transition = "stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)";
          el.style.strokeDashoffset = "0";
        }));
      } catch(e) {}
    }, [path]);

    if (points.length < 2) return <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", padding:"20px 0" }}>Log more sessions to see trend</div>;
    return (
      <div style={{ overflowX:"auto" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
          <path ref={pathRef} d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p,i) => (
            <g key={i} style={{ animation:"fadeUp .3s cubic-bezier(0.16,1,0.3,1) both", animationDelay:`${600+i*30}ms` }}>
              <circle cx={p.x} cy={p.y} r="3" fill={color} />
              <text x={p.x} y={H} textAnchor="middle" fontSize="7" fill="var(--muted)">{points[i].label||""}</text>
              <text x={p.x} y={p.y-6} textAnchor="middle" fontSize="8" fill={color}>{points[i].y}{unit}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  const panels = [
    { id:"strength", icon:"💪", label:"Strength" },
    { id:"volume",   icon:"📦", label:"Volume"   },
    { id:"mrv",      icon:"📈", label:"MRV"      },
    { id:"body",     icon:"⚖️",  label:"Body"     },
    { id:"rir",      icon:"🌡️",  label:"RIR"      },
    { id:"prs",      icon:"🏆",  label:"PRs"      },
    { id:"consist",  icon:"🔥",  label:"Streak"   },
  ];

  const exH = exHistory(selectedEx);

  return (
    <div style={S.section}>
      <div style={S.h1}>Stats <span style={{ color:"var(--amber)" }}>&amp; Progress</span></div>
      <div style={S.sub}>{history.length} SESSIONS · {allExNames.length} EXERCISES TRACKED</div>

      {/* Panel selector */}
      <div style={{ display:"flex", gap:4, overflowX:"auto", marginBottom:16, paddingBottom:4 }}>
        {panels.map(p => (
          <div key={p.id} style={{ ...S.chip(activePanel===p.id), flexDirection:"column", gap:1, padding:"8px 10px", textAlign:"center", flexShrink:0 }} onClick={() => setActivePanel(p.id)}>
            <span style={{ fontSize:16 }}>{p.icon}</span>
            <span style={{ fontSize:10 }}>{p.label}</span>
          </div>
        ))}
      </div>

      {/* Strength panel */}
      {activePanel === "strength" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Strength Curve</div>
          <label style={S.label}>SELECT EXERCISE</label>
          <select style={{ ...S.input, marginBottom:14 }} value={selectedEx} onChange={e => setSelectedEx(e.target.value)}>
            {allExNames.length ? allExNames.map(ex => <option key={ex} value={ex}>{ex}</option>)
              : Object.keys(USER_BASELINE).map(ex => <option key={ex} value={ex}>{ex}</option>)}
          </select>
          {exH.length > 0 ? (
            <>
              <div style={S.h2}>Weight Over Time</div>
              <LineChart points={exH.map(e => ({ y: e.weight, label: e.date.slice(5) }))} unit="kg" />
              <div style={{ ...S.h2, marginTop:16 }}>Estimated 1RM Trend</div>
              <LineChart points={exH.map(e => ({ y: e.orm, label: e.date.slice(5) }))} color="var(--green)" unit="kg" />
              <div style={{ ...S.card, marginTop:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>CURRENT BEST</div>
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--amber)" }}>
                      <CountUp value={exH[exH.length-1]?.weight} suffix="kg" /> × {exH[exH.length-1]?.reps}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>EST. 1RM</div>
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--green)" }}>
                      <CountUp value={exH[exH.length-1]?.orm} suffix="kg" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...S.card, textAlign:"center", padding:24, color:"var(--muted)" }}>
              No log data yet for {selectedEx}. Complete a session to see your strength curve.
            </div>
          )}
        </div>
      )}

      {/* Volume panel */}
      {activePanel === "volume" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Weekly Volume (kg)</div>
          {weeks.length > 1 ? (
            <MiniBar values={weeks.map(w => Math.round(w.volume))} labels={weeks.map(w => w.week.slice(5))} />
          ) : <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Log more sessions to see weekly volume trend.</div>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:16 }}>
            <div style={S.card}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>AVG WEEKLY VOL</div>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:20, color:"var(--amber)" }}>
                {weeks.length ? Math.round(weeks.reduce((a,w)=>a+w.volume,0)/weeks.length).toLocaleString() : "–"}kg
              </div>
            </div>
            <div style={S.card}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>TOTAL VOLUME</div>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:20, color:"var(--amber)" }}>
                {Math.round(history.reduce((a,h)=>a+(h.volume||0),0)).toLocaleString()}kg
              </div>
            </div>
          </div>
          {Object.keys(muscleVolThisWeek).length > 0 && (
            <>
              <div style={S.h2}>This Week by Muscle Group</div>
              {Object.entries(muscleVolThisWeek)
                .sort((a,b) => b[1]-a[1])
                .map(([muscle, vol]) => {
                  const maxVol = Math.max(...Object.values(muscleVolThisWeek));
                  const pct = maxVol > 0 ? (vol/maxVol*100) : 0;
                  return (
                    <div key={muscle} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", textTransform:"uppercase" }}>{muscle}</span>
                        <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--text)" }}>{Math.round(vol).toLocaleString()}kg</span>
                      </div>
                      <div style={{ height:5, background:"var(--bg3)", borderRadius:3 }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:"var(--amber)", borderRadius:3, opacity:0.8,
                          animation:"barGrow 450ms cubic-bezier(0.16,1,0.3,1) both",
                          transformOrigin:"left center"
                        }} />
                      </div>
                    </div>
                  );
              })}
            </>
          )}
        </div>
      )}

      {/* MRV / RP panel */}
      {activePanel === "mrv" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Weekly Sets vs MRV</div>
          <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginBottom:12 }}>
            MEV = min effective · MRV = max recoverable · Fatigue from RIR trend · SFR = stimulus/fatigue
          </div>
          {Object.entries(MRV_TARGETS).map(([muscle, { mev, mrv }]) => {
            const sets = weeklySets[muscle] || 0;
            const fatigue = getMuscleRIRFatigue(muscle, history);
            const sfr = getMuscleWeeklySFR(muscle, history, weeklySets);
            const mevPct = (mev/mrv)*100;
            const setPct = Math.min((sets/mrv)*100, 100);
            const barColor = sets >= mrv ? "var(--red)" : sets >= mev ? "var(--green)" : sets > 0 ? "var(--amber)" : "var(--bg4)";
            const fatigueColor = fatigue === null ? "var(--muted)" : fatigue >= 0.75 ? "var(--red)" : fatigue >= 0.45 ? "var(--amber)" : "var(--green)";
            const fatigueLabel = fatigue === null ? "–" : fatigue >= 0.75 ? "HIGH" : fatigue >= 0.45 ? "MOD" : "LOW";
            return (
              <div key={muscle} style={{ ...S.card, marginBottom:8, padding:"12px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
                  <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14, textTransform:"uppercase" }}>{muscle}</span>
                  <div style={{ display:"flex", gap:10, alignItems:"baseline" }}>
                    {sfr !== null && (
                      <span style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>SFR {sfr}</span>
                    )}
                    <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:fatigueColor }}>
                      {fatigueLabel} fatigue
                    </span>
                    <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14, color: barColor }}>{sets}</span>
                    <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>/{mrv}</span>
                  </div>
                </div>
                {/* Bar */}
                <div style={{ position:"relative", height:8, background:"var(--bg3)", borderRadius:4 }}>
                  {/* Fill */}
                  <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${setPct}%`, background:barColor, borderRadius:4,
                    animation:"barGrow 500ms cubic-bezier(0.16,1,0.3,1) both",
                    animationDelay:`${Object.keys(MRV_TARGETS).indexOf(muscle)*40}ms`,
                    transformOrigin:"left center"
                  }} />
                  {/* MEV marker */}
                  <div style={{ position:"absolute", top:"-3px", bottom:"-3px", left:`${mevPct}%`, width:1, background:"var(--muted)", opacity:0.6 }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                  <span style={{ fontFamily:"var(--font-m)", fontSize:8, color:"var(--muted)" }}>0</span>
                  <span style={{ fontFamily:"var(--font-m)", fontSize:8, color:"var(--muted)", marginLeft:`${mevPct}%`, transform:"translateX(-50%)" }}>MEV{mev}</span>
                  <span style={{ fontFamily:"var(--font-m)", fontSize:8, color:"var(--red)" }}>MRV{mrv}</span>
                </div>
                {sets >= mrv && (
                  <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--red)", marginTop:4 }}>
                    At or above MRV — risk of junk volume. Consider deload.
                  </div>
                )}
                {fatigue !== null && fatigue >= 0.75 && (
                  <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--red)", marginTop:2 }}>
                    RIR trend shows high fatigue for {muscle}
                  </div>
                )}
              </div>
            );
          })}
          {!Object.values(weeklySets).some(v => v > 0) && (
            <div style={{ ...S.card, textAlign:"center", padding:24, color:"var(--muted)" }}>
              No sessions this week yet. Log a session to see MRV tracking.
            </div>
          )}
        </div>
      )}

      {/* Body weight panel */}
      {activePanel === "body" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Body Weight Trend</div>
          {bwHistory.length > 1 ? (
            <>
              <LineChart points={[...bwHistory].reverse().map(b => ({ y: parseFloat(b.weight), label: b.date.slice(5) }))} color="var(--blue)" unit="kg" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginTop:12 }}>
                <div style={S.card}>
                  <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>START</div>
                  <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18 }}>{bwHistory[bwHistory.length-1]?.weight}kg</div>
                </div>
                <div style={S.card}>
                  <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>CURRENT</div>
                  <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18 }}>{bwHistory[0]?.weight}kg</div>
                </div>
                <div style={S.card}>
                  <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>CHANGE</div>
                  <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18, color: parseFloat(bwHistory[0]?.weight) < parseFloat(bwHistory[bwHistory.length-1]?.weight) ? "var(--green)" : "var(--red)" }}>
                    {(parseFloat(bwHistory[0]?.weight)-parseFloat(bwHistory[bwHistory.length-1]?.weight)).toFixed(1)}kg
                  </div>
                </div>
              </div>
            </>
          ) : <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Log body weight during sessions to track trend here.</div>}
        </div>
      )}

      {/* RIR panel */}
      {activePanel === "rir" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Average RIR per Session</div>
          {rirHistory.length > 1 ? (
            <>
              <LineChart points={rirHistory.map(r => ({ y: parseFloat(r.rpe), label: r.date.slice(5) }))} color="var(--red)" unit="" />
              {rirHistory.slice(-3).every(r => parseFloat(r.rpe) <= 1.5) && (
                <div style={{ ...S.warn, marginTop:10 }}>⚠️ RIR below 1.5 avg for 3+ sessions — you may be overtraining, consider deload</div>
              )}
              <div style={{ ...S.card, marginTop:12 }}>
                <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>LAST SESSION AVG RIR</div>
                <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:24, color: parseFloat(rirHistory[rirHistory.length-1]?.rpe) <= 1 ? "var(--red)" : parseFloat(rirHistory[rirHistory.length-1]?.rpe) <= 3 ? "var(--amber)" : "var(--blue)" }}>
                  {rirHistory[rirHistory.length-1]?.rpe} RIR
                </div>
              </div>
            </>
          ) : <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Log RIR during sets to track effort trend here.</div>}
        </div>
      )}

      {/* PRs panel */}
      {activePanel === "prs" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Personal Records</div>
          {PRs.length > 0 ? PRs.map((pr,i) => (
            <div key={i} style={{ ...S.card, display:"flex", alignItems:"center", gap:12, marginBottom:8, animation:"fadeUp .28s cubic-bezier(0.16,1,0.3,1) both", animationDelay:`${i*55}ms` }}>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:20, color:"var(--amber)", width:28 }}>#{i+1}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:15 }}>{pr.ex}</div>
                <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>{pr.date}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:18 }}>{pr.weight}kg×{pr.reps}</div>
                <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--green)" }}>1RM ~{pr.orm}kg</div>
              </div>
            </div>
          )) : <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Complete sessions to see your personal records here.</div>}
        </div>
      )}

      {/* Consistency panel */}
      {activePanel === "consist" && (
        <div style={{ animation:"fadeUp .25s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={S.h2}>Consistency</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
            <div style={{ ...S.card, textAlign:"center", border:"1px solid var(--amber)" }}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>SESSION STREAK</div>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:36, color:"var(--amber)" }}>{streak}</div>
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>sessions</div>
            </div>
            <div style={{ ...S.card, textAlign:"center" }}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>AVG / WEEK</div>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:36, color: parseFloat(avgSessions) >= targetPerWeek ? "var(--green)" : "var(--red)" }}>{avgSessions}</div>
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>target: {targetPerWeek}</div>
            </div>
          </div>
          <div style={S.h2}>Sessions per Week</div>
          {weeks.length > 1 ? (
            <MiniBar
              values={weeks.map(w => w.sessions)}
              colors={weeks.map(w => w.sessions >= targetPerWeek ? "var(--green)" : "var(--amber)")}
              labels={weeks.map(w => w.week.slice(5))}
            />
          ) : <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>Log more sessions to see weekly consistency.</div>}
          <div style={{ ...S.card, marginTop:14 }}>
            <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>TOTAL SESSIONS</div>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:28, color:"var(--amber)" }}>{history.length}</div>
          </div>
        </div>
      )}
      <div style={{ height:20 }} />
    </div>
  );
}

// ── Storage — fixed key, never changes between updates ────────────────────────
const STORAGE_KEY = "homeforge_data";

// Migrate from any previous key versions
function migrateStorage() {
  const oldKeys = ["homeforge_v1","homeforge_v2","homeforge_v3"];
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return JSON.parse(current); // already migrated
  for (const key of oldKeys) {
    const old = localStorage.getItem(key);
    if (old) {
      try {
        const parsed = JSON.parse(old);
        localStorage.setItem(STORAGE_KEY, old);
        return parsed;
      } catch {}
    }
  }
  return null;
}

// ── Main App ──────────────────────────────────────────────────────────────────

// ── Recovered sessions ────────────────────────────────────────────────────────
const RECOVERED_SESSIONS = [
  {
    date: "2026-04-22", day: "Push", volume: 3421, rating: "4", notes: "",
    log: {
      "Barbell Bench Press":     [{ weight:"62",reps:"8",rpe:"2" },{ weight:"62",reps:"8",rpe:"2" },{ weight:"62",reps:"7",rpe:"2" },{ weight:"60",reps:"8",rpe:"1" }],
      "Dumbbell Shoulder Press": [{ weight:"16",reps:"10",rpe:"2" },{ weight:"16",reps:"10",rpe:"2" },{ weight:"16",reps:"9",rpe:"2" },{ weight:"16",reps:"8",rpe:"1" }],
      "EZ Bar Skull Crusher":    [{ weight:"38",reps:"10",rpe:"2" },{ weight:"38",reps:"10",rpe:"2" },{ weight:"38",reps:"9",rpe:"1" }],
      "Dumbbell Fly":            [{ weight:"12.5",reps:"15",rpe:"3" },{ weight:"12.5",reps:"14",rpe:"2" },{ weight:"12.5",reps:"13",rpe:"2" }],
      "Thoracic Extension":      [{ reps:"10",rpe:"4" },{ reps:"10",rpe:"4" },{ reps:"10",rpe:"4" }],
    },
  },
  {
    date: "2026-04-16", day: "Legs", volume: 3582, rating: "", notes: "",
    log: {
      "Barbell Squat":       [{ weight:"74",reps:"12",rpe:"2" },{ weight:"74",reps:"11",rpe:"2" },{ weight:"74",reps:"10",rpe:"2" },{ weight:"74",reps:"10",rpe:"2" }],
      "Romanian Deadlift":   [{ weight:"40",reps:"12",rpe:"2" },{ weight:"40",reps:"12",rpe:"2" },{ weight:"40",reps:"10",rpe:"1" }],
      "Single-Arm DB Press": [{ weight:"18",reps:"10",rpe:"2" },{ weight:"18",reps:"10",rpe:"2" },{ weight:"18",reps:"9",rpe:"2" }],
      "Thoracic Extension":  [{ reps:"10",rpe:"4" },{ reps:"10",rpe:"4" },{ reps:"10",rpe:"4" }],
    },
  },
  {
    date: "2026-04-12", day: "Pull", volume: 2849, rating: "5", notes: "",
    log: {
      "Assisted Pull-Up":    [{ weight:"0",reps:"5",rpe:"1" },{ weight:"0",reps:"3",rpe:"1" },{ weight:"0",reps:"3",rpe:"0" }],
      "Barbell Deadlift":    [{ weight:"80",reps:"6",rpe:"2" },{ weight:"80",reps:"6",rpe:"2" },{ weight:"80",reps:"5",rpe:"1" }],
      "Barbell Row":         [{ weight:"48",reps:"10",rpe:"2" },{ weight:"48",reps:"10",rpe:"2" },{ weight:"48",reps:"10",rpe:"1" }],
      "EZ Bar Curl":         [{ weight:"28",reps:"10",rpe:"2" },{ weight:"28",reps:"10",rpe:"2" },{ weight:"28",reps:"9",rpe:"1" },{ weight:"28",reps:"8",rpe:"1" }],
      "Thoracic Extension":  [{ reps:"10",rpe:"4" },{ reps:"10",rpe:"4" },{ reps:"10",rpe:"4" }],
    },
  },
  {
    date: "2026-04-09", day: "Push", volume: 3232, rating: "3", notes: "",
    log: {
      "Barbell Bench Press":     [{ weight:"60",reps:"8",rpe:"2" },{ weight:"60",reps:"8",rpe:"2" },{ weight:"60",reps:"7",rpe:"1" },{ weight:"60",reps:"7",rpe:"1" }],
      "Dumbbell Shoulder Press": [{ weight:"16",reps:"8",rpe:"3" },{ weight:"16",reps:"8",rpe:"3" },{ weight:"16",reps:"12",rpe:"2" },{ weight:"16",reps:"11",rpe:"2" }],
      "EZ Bar Skull Crusher":    [{ weight:"38",reps:"8",rpe:"2" },{ weight:"38",reps:"8",rpe:"2" },{ weight:"38",reps:"8",rpe:"1" }],
      "Dumbbell Fly":            [{ weight:"12.5",reps:"15",rpe:"3" },{ weight:"12.5",reps:"13",rpe:"2" },{ weight:"12.5",reps:"12",rpe:"2" }],
      "Thoracic Extension":      [{ reps:"10",rpe:"" },{ reps:"10",rpe:"" },{ reps:"10",rpe:"" }],
    },
  },
];

// Keep single reference for backwards compatibility
const RECOVERED_SESSION = RECOVERED_SESSIONS[2];

// ── Home Screen ───────────────────────────────────────────────────────────────
function HomeScreen({ data, setData, onStartSession, onGoToTab }) {
  const history = data.history || [];
  const split = data.split || [];
  const bwHistory = data.bodyWeightHistory || [];
  const [bwInput, setBwInput] = useState(data.bodyWeight || "");
  const [bwSaved, setBwSaved] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [mode, setMode] = useState(data.activeMode || DEFAULT_MODE);
  const isWeights = isWeightsMode(mode);

  // Smart next day suggestion (skip stretch sessions for split logic)
  const lastTrainingSession = history.find(h => h.day !== "Stretch");
  const lastSession = history[0];
  const lastIdx = lastTrainingSession ? split.indexOf(lastTrainingSession.day) : -1;
  const suggestedDay = split[(lastIdx + 1) % split.length] || split[0];
  const activeDay = selectedDay || suggestedDay;

  // Days trained this week (stretch sessions don't count toward weekly target)
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0,0,0,0);
  const thisWeekSessions = history.filter(h => new Date(h.date) >= weekStart && h.day !== "Stretch");
  const targetDays = parseInt(data.days) || 3;

  // Body weight check — prompt if >7 days since last log
  const lastBW = bwHistory[0];
  const daysSinceBW = lastBW ? Math.floor((new Date() - new Date(lastBW.date)) / 86400000) : 999;
  const needsBWPrompt = daysSinceBW >= 7;

  // ── Stats computations ─────────────────────────────────────────────────────
  const meso = initMesocycle(data.mesocycle);
  const phaseLen = PHASE_LENGTHS[meso.phase] || 12;
  const weeklyVols = useMemo(() => getWeeklyVolumes(history), [history]);
  const thisWeekVol = weeklyVols[weeklyVols.length - 1]?.vol || 0;
  const lastWeekVol = weeklyVols[weeklyVols.length - 2]?.vol || 0;
  const volDelta = lastWeekVol > 100 ? Math.round((thisWeekVol - lastWeekVol) / lastWeekVol * 100) : null;
  const recentPR = useMemo(() => detectRecentPR(history), [history]);
  const bwRecent = useMemo(() => bwHistory.slice(0, 5).reverse(), [bwHistory]);
  const bwDelta = bwRecent.length >= 2
    ? +(parseFloat(bwRecent[bwRecent.length - 1].weight) - parseFloat(bwRecent[0].weight)).toFixed(1)
    : 0;

  // Recovery status per muscle
  const today = new Date();
  const musclesForDay = MUSCLE_MAP[activeDay] || [];
  const muscleRecovery = musclesForDay.map(m => {
    const lastTrained = history.find(h => (MUSCLE_MAP[h.day]||[]).includes(m));
    const days = lastTrained ? Math.floor((today - new Date(lastTrained.date)) / 86400000) : 99;
    return { muscle: m, days, ok: days >= 2 };
  });

  const saveBW = () => {
    if (!bwInput) return;
    const entry = { date: new Date().toISOString().slice(0,10), weight: bwInput };
    setData(d => {
      const next = { ...d, bodyWeight: bwInput, bodyWeightHistory: [entry,...(d.bodyWeightHistory||[])] };
      syncConfig(next);
      return next;
    });
    setBwSaved(true);
  };

  const startSession = () => {
    setData(d => ({ ...d, activeDay, activeMode: mode }));
    onStartSession();
  };

  // ── Session Override ──────────────────────────────────────────────────────
  const override = (data.sessionOverride?.day === activeDay)
    ? data.sessionOverride
    : { day: activeDay, removed: [], replaced: {} };

  const setOverride = (changes) => setData(d => ({
    ...d,
    sessionOverride: { ...override, day: activeDay, ...changes },
  }));

  const [showAdjust, setShowAdjust] = useState(false);
  const [showAltsFor, setShowAltsFor] = useState(null); // exercise name

  // Preview list with overrides applied (for the adjust panel)
  const todayExercises = getExercisesForDay(activeDay, data.equipment||[], data.goal, data.favourites, data.level, mode);

  const toggleRemove = (name) => {
    if (override.removed.includes(name)) {
      setOverride({ removed: override.removed.filter(n => n !== name) });
    } else {
      // Also clear any replacement for this exercise
      const newReplaced = { ...override.replaced };
      delete newReplaced[name];
      setOverride({ removed: [...override.removed, name], replaced: newReplaced });
    }
    setShowAltsFor(null);
  };

  const applyReplace = (fromName, toName) => {
    setOverride({ replaced: { ...override.replaced, [fromName]: toName } });
    setShowAltsFor(null);
  };

  const clearReplace = (name) => {
    const newReplaced = { ...override.replaced };
    delete newReplaced[name];
    setOverride({ replaced: newReplaced });
    setShowAltsFor(null);
  };

  // Get equipment-filtered alts for an exercise from DAY_TEMPLATES
  const getAltsFor = (exName) => {
    const template = DAY_TEMPLATES[activeDay] || [];
    const entry = template.find(e => e.name === exName);
    const alts = entry?.alts || [];
    return alts.filter(altName => {
      const dbEx = Object.values(EXERCISE_DB).flat().find(e => e.name === altName);
      return dbEx && dbEx.eq.some(eq => (data.equipment||[]).includes(eq));
    });
  };

  const hasOverride = override.removed.length > 0 || Object.keys(override.replaced).length > 0;

  // Last session summary
  const lastLog = lastSession ? Object.entries(lastSession.log||{}).slice(0,3) : [];
  const _activeDayType = getDayType(activeDay);
  const _nextPlan = data.nextSession && data.nextSession[planKeyFor(_activeDayType, mode)];
  const _plannedCount = _nextPlan ? Object.keys(_nextPlan).length : 0;

  const today2 = new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" });

  return (
    <div style={{ ...S.section, paddingBottom: 80 }}>
      {/* ── Stats block ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:6 }}>{today2.toUpperCase()}</div>

        {/* Primary stat + mesocycle dots */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={S.h1}>Ready to <span style={{ color:"var(--amber)" }}>Train?</span></div>
            <div style={{ display:"flex", alignItems:"baseline", gap:5, marginTop:10 }}>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:52, lineHeight:1, color: thisWeekSessions.length >= targetDays ? "var(--green)" : "var(--amber)" }}>{thisWeekSessions.length}</span>
              <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:22, color:"var(--muted)" }}>/{targetDays}</span>
            </div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", marginTop:3 }}>
              SESSIONS{thisWeekVol > 0 ? ` · ${Math.round(thisWeekVol).toLocaleString()}KG VOL` : ""}
            </div>
          </div>

          {/* Mesocycle dot progress */}
          <div style={{ textAlign:"right", paddingTop:2 }}>
            <div style={{ fontFamily:"var(--font-m)", fontSize:8, color:phaseColor(meso.phase), letterSpacing:1, marginBottom:5 }}>{phaseLabel(meso.phase)}</div>
            <div style={{ display:"flex", gap:3, flexWrap:"wrap", maxWidth:88, justifyContent:"flex-end" }}>
              {Array.from({ length: phaseLen }).map((_, i) => (
                <div key={i} style={{ width:7, height:7, borderRadius:"50%", background: i < meso.sessionCount ? phaseColor(meso.phase) : "transparent", border: i < meso.sessionCount ? "none" : "1px solid var(--muted)" }} />
              ))}
            </div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", marginTop:4 }}>{meso.sessionCount}/{phaseLen}</div>
          </div>
        </div>

        {/* Volume bar chart — 6 weeks */}
        {history.length > 0 && (() => {
          const maxVol = Math.max(...weeklyVols.map(w => w.vol), 1);
          return (
            <div style={{ marginTop:18 }}>
              <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:40 }}>
                {weeklyVols.map((w, i) => {
                  const pct = w.vol > 0 ? Math.max((w.vol / maxVol) * 100, 10) : 0;
                  return (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", height:"100%" }}>
                      <div style={{ width:"100%", borderRadius:"2px 2px 0 0",
                        height: pct > 0 ? `${pct}%` : 2,
                        background: w.isCurrent
                          ? (thisWeekSessions.length >= targetDays ? "var(--green)" : "var(--amber)")
                          : "var(--bg4)",
                        opacity: w.isCurrent ? 1 : 0.8 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ height:1, background:"var(--border)" }} />
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:5 }}>
                <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>6 WEEKS</div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  {volDelta !== null && (
                    <span style={{ fontFamily:"var(--font-m)", fontSize:9, color: volDelta >= 0 ? "var(--green)" : "var(--red)" }}>
                      {volDelta >= 0 ? "↑" : "↓"}{Math.abs(volDelta)}% vs last week
                    </span>
                  )}
                  {recentPR && (
                    <span style={{ ...S.tag("var(--amber)"), fontSize:9, padding:"3px 7px" }}>
                      🏆 {recentPR.name.split(" ").pop()} {recentPR.weight}kg{recentPR.reps ? `×${recentPR.reps}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* BW sparkline */}
        {bwRecent.length >= 2 && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:12 }}>
            <BWSparkline data={bwRecent} />
            <div>
              <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--text)" }}>{lastBW?.weight}kg</span>
                {bwDelta !== 0 && (() => {
                  const gainIsGood = ["hypertrophy","strength"].includes(data.goal);
                  const col = bwDelta > 0
                    ? (gainIsGood ? "var(--green)" : "var(--amber)")
                    : (gainIsGood ? "var(--amber)" : "var(--green)");
                  return (
                    <span style={{ fontFamily:"var(--font-m)", fontSize:9, color: col }}>
                      {bwDelta > 0 ? "+" : ""}{bwDelta}kg
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>BODY WEIGHT</div>
            </div>
          </div>
        )}
      </div>

      {/* Weekly body weight prompt */}
      {needsBWPrompt && !bwSaved && (
        <div style={{ ...S.card, border:"1px solid var(--blue)", marginBottom:14 }}>
          <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:15, color:"var(--blue)", marginBottom:4 }}>⚖️ Weekly Weigh-In</div>
          <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:10 }}>
            {daysSinceBW === 999 ? "Log your starting weight" : `Last logged ${daysSinceBW} days ago`}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <input style={{ ...S.input, flex:1 }} type="number" placeholder="e.g. 83.0 kg"
              value={bwInput} onChange={e => setBwInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveBW()} />
            <button style={{ ...S.btn, padding:"8px 14px", fontSize:13 }} onClick={saveBW}>Save</button>
          </div>
        </div>
      )}
      {bwSaved && (
        <div style={{ ...S.success, marginBottom:14 }}>✓ Weight logged: {bwInput}kg</div>
      )}

      {/* Today's session card */}
      <div style={S.h2}>Today's Session</div>
      <div style={{ ...S.cardRaised, border:"1px solid var(--amber)", marginBottom:14 }}>
        {/* Mode selector — TRX/BW swap the exercise list and log reps+RIR only */}
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--amber)", letterSpacing:1, marginBottom:8 }}>SELECT MODE</div>
        <div style={{ display:"flex", gap:5, marginBottom:4 }} role="group" aria-label="Workout mode">
          {WORKOUT_MODES.map(m => (
            <button key={m.id} type="button" aria-pressed={mode === m.id}
              style={{ ...S.chip(mode === m.id), flex:1, justifyContent:"center", padding:"10px 8px", fontSize:12, minHeight:44 }}
              onClick={() => setMode(m.id)}>
              <span aria-hidden="true">{m.icon}</span>{m.label}
            </button>
          ))}
        </div>
        <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginBottom:14 }}>
          {isWeights
            ? "Load progression from your RIR"
            : `${modeLabel(mode)} — reps + RIR only, kept out of weights progression`}
        </div>

        {/* Day selector */}
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--amber)", letterSpacing:1, marginBottom:8 }}>SELECT DAY</div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
          {split.filter(d => d !== "REST").map(d => (
            <button key={d} type="button" style={{ ...S.chip(activeDay === d), padding:"10px 12px", fontSize:12, minHeight: 44 }}
              onClick={() => setSelectedDay(d)}>{d}</button>
          ))}
        </div>

        {/* Active day info */}
        <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:28, marginBottom:4 }}>{activeDay}</div>
        <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:10 }}>
          {(SPLIT_MAP[activeDay]||[]).join(" · ")}
        </div>

        {/* Recovery status */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {muscleRecovery.map(m => (
            <span key={m.muscle} style={S.tag(m.ok ? "var(--green)" : "var(--red)")}>
              {m.muscle} {m.days === 99 ? "fresh" : m.days + "d ago"}
            </span>
          ))}
        </div>

        {/* Last time this day was done */}
        {(() => {
          const lastSame = historyForMode(history, mode).find(h => h.day === activeDay);
          const label = isWeights ? activeDay : `${modeLabel(mode)} ${activeDay}`;
          return lastSame ? (
            <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:14 }}>
              Last {label}: {lastSame.date}
              {isWeights ? ` · ${(lastSame.volume||0).toFixed(0)}kg volume` : ` · ${Object.keys(lastSame.log||{}).length} exercises`}
            </div>
          ) : (
            <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:14 }}>
              First time doing {label} — baseline session!
            </div>
          );
        })()}

        {/* Mesocycle chip */}
        {(() => {
          const _hsMeso   = initMesocycle(data.mesocycle);
          const _hsPhaseLen = PHASE_LENGTHS[_hsMeso.phase] || 12;
          return (
            <div style={{ display:"inline-flex", alignItems:"center", gap:6, marginBottom:10,
              padding:"4px 10px", borderRadius:20, background:"rgba(0,0,0,0.3)",
              border:`1px solid ${phaseColor(_hsMeso.phase)}` }}>
              <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:phaseColor(_hsMeso.phase), letterSpacing:1 }}>
                {phaseLabel(_hsMeso.phase)} {_hsMeso.sessionCount}/{_hsPhaseLen}
              </span>
            </div>
          );
        })()}
        {_plannedCount > 0 && (
      <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:6, padding:"8px 12px", marginBottom:14, fontFamily:"var(--font-m)", fontSize:12, color:"var(--green)" }}>
        📋 {_plannedCount} exercises planned — {isWeights ? "weights" : "rep targets"} adjusted from your last {isWeights ? "" : modeLabel(mode) + " "}{activeDay} RIR
      </div>
    )}

    <button style={{ ...S.btnSm, width:"100%", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}
      onClick={() => { setShowAdjust(a => !a); setShowAltsFor(null); }}>
      <span>⚙️ Adjust session{hasOverride ? ` (${override.removed.length + Object.keys(override.replaced).length} change${override.removed.length + Object.keys(override.replaced).length > 1 ? "s" : ""})` : ""}</span>
      <span style={{ color:"var(--amber)" }}>{showAdjust ? "▲ Done" : "▼"}</span>
    </button>

    {showAdjust && (
      <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 12px", marginBottom:14, animation:"fadeUp .15s ease both" }}>
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)", letterSpacing:1, marginBottom:10 }}>TODAY ONLY — TEMPLATE UNCHANGED</div>
        {todayExercises.map(ex => {
          const isRemoved = override.removed.includes(ex.name);
          const replacedWith = override.replaced[ex.name];
          const showingAlts = showAltsFor === ex.name;
          const alts = getAltsFor(ex.name);
          return (
            <div key={ex.name} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1 }}>
                  <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14,
                    textDecoration: isRemoved ? "line-through" : "none",
                    color: isRemoved ? "var(--muted)" : replacedWith ? "var(--muted)" : "var(--text)" }}>
                    {ex.name}
                  </span>
                  {replacedWith && !isRemoved && (
                    <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--amber)", marginLeft:8 }}>→ {replacedWith}</span>
                  )}
                  <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>{ex.muscle}</div>
                </div>
                {!isRemoved && alts.length > 0 && (
                  <button style={{ ...S.btnSm, fontSize:10, color: replacedWith ? "var(--amber)" : "var(--text)" }}
                    onClick={() => { if (replacedWith) { clearReplace(ex.name); } else { setShowAltsFor(showingAlts ? null : ex.name); } }}>
                    {replacedWith ? "↩ Undo" : "⇄"}
                  </button>
                )}
                <button style={{ ...S.btnSm, fontSize:10, color: isRemoved ? "var(--green)" : "var(--red)" }}
                  onClick={() => toggleRemove(ex.name)}>
                  {isRemoved ? "↩" : "✕"}
                </button>
              </div>
              {showingAlts && !isRemoved && (
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6, paddingLeft:4, animation:"fadeUp .1s ease both" }}>
                  {alts.map(alt => (
                    <button key={alt} style={{ ...S.btnSm, fontSize:11, background:"var(--bg2)",
                      border: override.replaced[ex.name] === alt ? "1px solid var(--amber)" : "1px solid var(--border)",
                      color: override.replaced[ex.name] === alt ? "var(--amber)" : "var(--text)" }}
                      onClick={() => applyReplace(ex.name, alt)}>
                      {alt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {hasOverride && (
          <button style={{ ...S.btnSm, fontSize:10, marginTop:4, color:"var(--muted)" }}
            onClick={() => { setOverride({ removed: [], replaced: {} }); setShowAltsFor(null); }}>
            Reset all changes
          </button>
        )}
      </div>
    )}

    <button style={{ ...S.btn, width:"100%", justifyContent:"center", fontSize:16 }} onClick={startSession}>
          Start {activeDay} Session →
        </button>
        <button
          style={{ ...S.btnSm, width:"100%", justifyContent:"center", marginTop:8,
            color:"var(--green)", border:"1px solid rgba(34,197,94,0.35)", background:"rgba(34,197,94,0.06)" }}
          onClick={() => { setData(d => ({ ...d, activeDay:"Stretch" })); onStartSession(); }}>
          🧘 Quick Stretch (10–20 min)
        </button>
      </div>

      {/* Last session recap */}
      {lastSession && (
        <>
          <div style={S.h2}>Last Session</div>
          <div style={{ ...S.card, cursor:"pointer" }} onClick={() => onGoToTab("history")}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div>
                <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:18 }}>{lastSession.day}</div>
                <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>{lastSession.date}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--amber)" }}>{(lastSession.volume||0).toFixed(0)}kg</div>
                {lastSession.rating && <div style={{ fontSize:12 }}>{"⭐".repeat(parseInt(lastSession.rating))}</div>}
              </div>
            </div>
            {lastLog.map(([name, sets]) => {
              const hasSeconds = sets.some(s => s.seconds);
              const display = hasSeconds
                ? sets.filter(s=>s.seconds).map(s=>`${s.seconds}s`).join("/")
                : sets.filter(s=>s.reps).map(s=>`${s.weight||"BW"}×${s.reps}`).join(" / ");
              return (
                <div key={name} style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:12 }}>
                  <span style={{ color:"var(--muted)" }}>{name}</span>
                  <span style={{ fontFamily:"var(--font-m)", fontSize:11 }}>{display}</span>
                </div>
              );
            })}
            {Object.keys(lastSession.log||{}).length > 3 && (
              <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)", marginTop:4 }}>
                +{Object.keys(lastSession.log).length - 3} more · tap Log to see all
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  injectStyle();
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState("home");
  const [showFavs, setShowFavs] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "ok" | "error"
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDedupConfirm, setShowDedupConfirm] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  const [syncing, setSyncing] = useState(false);

  const handleSyncAll = async () => {
    setSyncing(true);
    setRestoreMsg("Syncing all sessions...");
    try {
      const history = data.history || [];
      for (let i = 0; i < history.length; i++) {
        const h = history[i];
        await syncSession(h, data.nextSession || {}, data.bodyWeightHistory || []);
        setRestoreMsg(`Syncing ${i + 1}/${history.length}...`);
      }
      await syncConfig(data);
      setSyncStatus("ok");
      setRestoreMsg(`✓ Synced ${history.length} sessions`);
    } catch(e) {
      setSyncStatus("error");
      setRestoreMsg("✗ Failed — check connection");
    }
    setSyncing(false);
    setTimeout(() => setRestoreMsg(""), 4000);
  };

  const handleRestore = async () => {
    setShowRestoreConfirm(false);
    setRestoreMsg("Restoring...");
    try {
      await restoreFromSheets(setData, setSyncStatus);
      setRestoreMsg("✓ Restored");
    } catch(e) {
      setRestoreMsg("✗ Failed — check connection");
    }
    setTimeout(() => setRestoreMsg(""), 4000);
  };

  const handleDedupResync = async () => {
    setShowDedupConfirm(false);
    setSyncing(true);
    try {
      const clean = await dedupAndResync(data, setSyncStatus, setRestoreMsg);
      // Persist deduped history locally
      if (clean) setData(d => ({ ...d, history: clean }));
    } catch {}
    setSyncing(false);
    setTimeout(() => setRestoreMsg(""), 5000);
  };
  const [data, setData] = useState(() => {
    try {
      const migrated = migrateStorage();
      const base = migrated || { ...PREFILLED_DATA, profileBaseline: { ...USER_BASELINE } };
      if (!base.history) base.history = [];
      // Inject any missing recovered sessions by date
      RECOVERED_SESSIONS.forEach(s => {
        if (!base.history.find(h => h.date === s.date)) {
          base.history.push(s);
        }
      });
      // Remove incomplete Playwright test session accidentally logged 2026-05-23
      base.history = base.history.filter(h => !(h.date === "2026-05-23" && h.day === "Push" && (h.volume || 0) < 3000));
      // Dedup and sort history newest first
      base.history = dedupHistory(base.history).sort((a,b) => new Date(b.date) - new Date(a.date));
      // Reconcile mesocycle count from history if it was lost or never set
      base.mesocycle = reconcileMesocycle(base.mesocycle, base.history);
      // One-time: advance to deload now that accumulation cycle is complete (2026-05-24)
      if (!base._mesocycleDeloadV1) {
        base.mesocycle = { phase: "deload", sessionCount: 0, startDate: "2026-05-24", pendingTransition: false };
        base._mesocycleDeloadV1 = true;
      }
      return base;
    } catch {
      return { ...PREFILLED_DATA, profileBaseline: { ...USER_BASELINE }, history: [...RECOVERED_SESSIONS] };
    }
  });

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {} }, [data]);
  useEffect(() => {
    if (data.split && data.goal) setStep(3);
    else if (data.goal && data.days) setStep(2);
    else if (data.equipment?.length > 0) setStep(1);
  }, []);

  const NAV = [
    { id: "home",     icon: "🏠", label: "Home"     },
    { id: "workout",  icon: "💪", label: "Workout"  },
    { id: "calendar", icon: "📅", label: "Calendar" },
    { id: "stats",    icon: "📊", label: "Stats"    },
    { id: "chat",     icon: "🤖", label: "Coach"    },
    { id: "history",  icon: "📋", label: "Log"      },
  ];

  if (showFavs) return (
    <div style={S.page}>
      <div style={S.header}><div style={S.logo}>HomeForge</div></div>
      <FavouritesScreen data={data} setData={setData} onBack={() => setShowFavs(false)} />
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logo}>HomeForge</div>
        {step === 3 && (
          <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
            {syncStatus === "syncing" && <span style={{ fontSize:14, animation:"spin 1s linear infinite", display:"inline-block" }}>☁️</span>}
            {syncStatus === "ok"      && <span style={{ fontSize:13, color:"var(--green)" }} title="Saved to Sheets">✅</span>}
            {syncStatus === "error"   && <span style={{ fontSize:13, color:"var(--red)" }}   title="Sheets sync failed">❌</span>}
            {!syncing && (
              <button style={S.btnSm} onClick={handleSyncAll} title="Upload all sessions to Google Sheets">☁️↑</button>
            )}
            {!showRestoreConfirm ? (
              <button style={S.btnSm} onClick={() => setShowRestoreConfirm(true)} title="Restore from Google Sheets">☁️↓</button>
            ) : (
              <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>Restore?</span>
                <button style={{ ...S.btnSm, color:"var(--green)" }} onClick={handleRestore}>Yes</button>
                <button style={S.btnSm} onClick={() => setShowRestoreConfirm(false)}>No</button>
              </div>
            )}
            {!showDedupConfirm ? (
              <button style={S.btnSm} onClick={() => setShowDedupConfirm(true)} title="Remove duplicate sessions from Sheets and local cache">🔁 Dedup</button>
            ) : (
              <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--amber)" }}>Wipe Sheets & resync?</span>
                <button style={{ ...S.btnSm, color:"var(--red)" }} onClick={handleDedupResync}>Yes</button>
                <button style={S.btnSm} onClick={() => setShowDedupConfirm(false)}>No</button>
              </div>
            )}
            {restoreMsg && <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--amber)" }}>{restoreMsg}</span>}
            {tab === "workout" && (
              <button style={S.btnSm} onClick={() => setTab("home")}>← Home</button>
            )}
            <button style={S.btnSm} onClick={() => setShowFavs(true)}>❤️ Favs</button>
            <button style={S.btnSm} onClick={() => { setData({ ...PREFILLED_DATA, profileBaseline: { ...USER_BASELINE } }); setStep(0); }}>Reset</button>
          </div>
        )}
      </div>

      {step === 0 && <EquipmentScreen data={data} setData={setData} onNext={() => setStep(1)} />}
      {step === 1 && <ProfileScreen   data={data} setData={setData} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <ScheduleScreen  data={data} setData={setData} onNext={() => setStep(3)} />}

      {step === 3 && (
        <>
          {tab === "home"     && <HomeScreen    data={data} setData={setData} onStartSession={() => setTab("workout")} onGoToTab={setTab} />}
          {tab === "workout"  && <WorkoutErrorBoundary><WorkoutScreen data={data} setData={setData} onBack={() => setTab("home")} onGoToChat={() => setTab("chat")} setSyncStatus={setSyncStatus} /></WorkoutErrorBoundary>}
          {tab === "calendar" && <CalendarScreen data={data} setData={setData} />}
          {tab === "stats"    && <StatsScreen    data={data} />}
          {tab === "chat"     && <ChatScreen     data={data} />}
          {tab === "history"  && <HistoryScreen  data={data} />}
          <div style={S.navBar}>
            {NAV.map(n => (
              <div key={n.id} style={S.navItem(tab===n.id)} onClick={() => setTab(n.id)}>
                <div style={{ fontSize:14, marginBottom:1 }}>{n.icon}</div>
                <div>{n.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

