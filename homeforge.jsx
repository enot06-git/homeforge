import { useState, useEffect, useRef } from "react";

// ── Global styles ─────────────────────────────────────────────────────────────
const GLOBAL_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&family=Barlow:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f0f0f;--bg2:#181818;--bg3:#222;--border:#2e2e2e;
  --amber:#f59e0b;--red:#ef4444;--green:#22c55e;--blue:#3b82f6;--purple:#a855f7;
  --text:#e8e8e8;--muted:#888;
  --font-h:'Barlow Condensed',sans-serif;--font-b:'Barlow',sans-serif;--font-m:'IBM Plex Mono',monospace;
}
body{background:var(--bg);color:var(--text);font-family:var(--font-b);overflow-x:hidden;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:var(--bg2);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
@keyframes spin{to{transform:rotate(360deg);}}
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
  if (remaining <= 0) return { total: bar, plates: [], perSide: [] };
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

// ── Ordered Day Templates — correct exercise sequence per coaching principles ──
// Each entry: exercise name + fallback alternatives if equipment missing
const DAY_TEMPLATES = {
  "Push": [
    { name:"Barbell Bench Press",    alts:["Dumbbell Bench Press","Push-Up"],           eq:["barbell","squatstands","bench"] },
    { name:"Dumbbell Shoulder Press",alts:["Overhead Press","Pike Push-Up"],            eq:["dumbbells"] },
    { name:"EZ Bar Skull Crusher",   alts:["Tricep Overhead Ext","Tricep Dips"],        eq:["ezbar","bench"] },
    { name:"Dumbbell Fly",           alts:["Resistance Band Press","Push-Up"],          eq:["dumbbells","bench"] },
    { name:"Thoracic Extension",     alts:["Dead Bug"],                                 eq:["bench","bodyweight"] },
  ],
  "Pull": [
    { name:"Assisted Pull-Up",       alts:["Pull-Up","Inverted Row"],                   eq:["pullupbar","bands"] },
    { name:"Barbell Deadlift",       alts:["Romanian Deadlift","Single-Leg RDL"],       eq:["barbell"] },
    { name:"Barbell Row",            alts:["Dumbbell Row","Inverted Row"],               eq:["barbell"] },
    { name:"EZ Bar Curl",            alts:["Dumbbell Curl","Chin-Up"],                  eq:["ezbar"] },
    { name:"Thoracic Extension",     alts:["Dead Bug"],                                 eq:["bench","bodyweight"] },
  ],
  "Legs": [
    { name:"Barbell Squat",          alts:["Goblet Squat","Squat"],                     eq:["barbell","squatstands"] },
    { name:"Romanian Deadlift",      alts:["Single-Leg RDL","Goblet Squat"],            eq:["dumbbells"] },
    { name:"Single-Arm DB Press",    alts:["Dumbbell Shoulder Press","Pike Push-Up"],   eq:["dumbbells"] },
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

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── Trend detection ─────────────────────────────────────────────────────────
function detectTrends(day, history) {
  const flags = [];
  const sameDaySessions = (history || [])
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

// ── Mesocycle helpers ────────────────────────────────────────────────────────
const PHASE_LENGTHS = { accumulation: 12, intensification: 9, deload: 3 };

function initMesocycle(existing) {
  if (existing && existing.phase) return existing;
  return { phase: "accumulation", sessionCount: 0, startDate: new Date().toISOString().slice(0,10), pendingTransition: false };
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
  const sameDaySessions = (history || []).filter(h => h.day === day && h.log?.[exName]);
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

function getExercisesForDay(day, equipment, goal, favourites, level) {
  if (day === "REST") return [];

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

function getBestRecord(exName, history, profileBaseline) {
  let bestWeight = 0, bestReps = 0;
  (history || []).forEach(session => {
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
  if (!history || history.length < 4) return false;
  const v = history.slice(0, 4).map(h => h.volume || 0);
  if (v[0] < v[1] && v[1] < v[2] && v[2] < v[3]) return true;
  const weeks = (new Date() - new Date(history[history.length - 1]?.date)) / (7 * 86400000);
  return weeks >= 4 && history.length >= 12;
}

// ── Claude API ────────────────────────────────────────────────────────────────
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
        if (d instanceof Date) {
          // Use local date to avoid UTC offset shifting the date
          const y = d.getFullYear();
          const m = String(d.getMonth()+1).padStart(2,"0");
          const day = String(d.getDate()).padStart(2,"0");
          return `${y}-${m}-${day}`;
        }
        if (typeof d === "number") {
          const dt = new Date(d);
          const y = dt.getFullYear();
          const m = String(dt.getMonth()+1).padStart(2,"0");
          const day = String(dt.getDate()).padStart(2,"0");
          return `${y}-${m}-${day}`;
        }
        // Already a string — take first 10 chars (YYYY-MM-DD)
        return String(d).slice(0, 10);
      };
      const existing = d.history || [];
      const cloud    = (sessRes.sessions || [])
        .filter(s => s.date && s.day)
        .map(s => ({ ...s, date: normDate(s.date) }));
      const merged   = [...cloud];
      existing.forEach(local => {
        const localDate = normDate(local.date);
        if (!merged.find(c => c.date === localDate && c.day === local.day)) {
          merged.push({ ...local, date: localDate });
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system,
        messages,
      }),
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
    // Re-throw with clean message
    throw new Error(e.message || "Network error");
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 },
  header: { background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "14px 20px", display: "flex", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  logo: { fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 22, color: "var(--amber)", letterSpacing: 2, textTransform: "uppercase" },
  section: { padding: "20px 20px 0", animation: "fadeUp .3s ease both" },
  h1: { fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 30, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  h2: { fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16, letterSpacing: 1, textTransform: "uppercase", color: "var(--amber)", marginBottom: 10, marginTop: 18 },
  sub: { color: "var(--muted)", fontSize: 11, marginBottom: 16, fontFamily: "var(--font-m)" },
  card: { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 10 },
  btn: { background: "var(--amber)", color: "#000", border: "none", borderRadius: 6, padding: "11px 18px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 },
  btnOutline: { background: "transparent", color: "var(--amber)", border: "1px solid var(--amber)", borderRadius: 6, padding: "7px 13px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" },
  btnSm: { background: "var(--bg3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "5px 10px", fontFamily: "var(--font-m)", fontSize: 11, cursor: "pointer" },
  btnGreen: { background: "var(--green)", color: "#000", border: "none", borderRadius: 6, padding: "11px 18px", fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 },
  input: { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontFamily: "var(--font-m)", fontSize: 13, width: "100%", outline: "none" },
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

// ── Rest Timer ────────────────────────────────────────────────────────────────
function RestTimer({ seconds }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining]);
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
      <button style={S.btnSm} onClick={() => { if (running) { setRunning(false); setRemaining(seconds); } else { setRemaining(seconds); setRunning(true); } }}>
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
          <div key={e.id} style={{ ...S.chip(eq.includes(e.id)), flexDirection: "column", gap: 3, padding: "12px 8px", textAlign: "center", justifyContent: "center" }} onClick={() => toggle(e.id)}>
            <span style={{ fontSize: 22 }}>{e.icon}</span>
            <span style={{ fontSize: 12 }}>{e.label}</span>
          </div>
        ))}
      </div>

      {hasDumbbells && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>Dumbbell Details</div>
          <label style={S.label}>ALL WEIGHTS AVAILABLE (kg) — comma separated</label>
          <input style={{ ...S.input, marginBottom: 10 }} placeholder="e.g. 1, 2, 4.5, 8, 16, 24" value={data.dumbbellWeights || ""} onChange={e => setData(d => ({ ...d, dumbbellWeights: e.target.value }))} />
          <label style={S.label}>MAX SINGLE DUMBBELL (kg)</label>
          <input style={S.input} type="number" placeholder="e.g. 24" value={data.dumbbellMax || ""} onChange={e => setData(d => ({ ...d, dumbbellMax: e.target.value }))} />
        </div>
      )}

      {hasBarbell && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>Barbell Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={S.label}>BAR TYPE</label>
              <select style={S.input} value={data.barType || "standard"} onChange={e => setData(d => ({ ...d, barType: e.target.value, barWeight: e.target.value === "standard" ? "20" : e.target.value === "women" ? "15" : e.target.value === "ez" ? "10" : d.barWeight }))}>
                <option value="standard">Standard (20kg)</option>
                <option value="women">Women's (15kg)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label style={S.label}>BAR WEIGHT (kg)</label>
              <input style={S.input} type="number" placeholder="e.g. 14" value={data.barWeight || ""} onChange={e => setData(d => ({ ...d, barWeight: e.target.value }))} />
            </div>
          </div>
          <label style={S.label}>PLATES (pairs available)</label>
          <input style={{ ...S.input, marginBottom: 8 }} placeholder="e.g. 2x20, 2x10, 2x5, 2x2.5" value={data.barbellPlates || ""} onChange={e => setData(d => ({ ...d, barbellPlates: e.target.value }))} />
          <label style={S.label}>MAX TOTAL LOADED WEIGHT (kg)</label>
          <input style={S.input} type="number" placeholder="e.g. 119" value={data.barbellMax || ""} onChange={e => setData(d => ({ ...d, barbellMax: e.target.value }))} />
        </div>
      )}

      {eq.includes("dipbelt") && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>Dip Belt Setup</div>
          <div style={{ ...S.info, marginBottom: 8 }}>Hang Olympic plates from the chain. Add weight to pull-ups, chin-ups, dips and push-ups.</div>
          <label style={S.label}>MAX PLATE WEIGHT YOU CAN ATTACH (kg)</label>
          <input style={S.input} type="number" placeholder="e.g. 20" value={data.dipbeltMax || ""} onChange={e => setData(d => ({ ...d, dipbeltMax: e.target.value }))} />
        </div>
      )}
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15, color: "var(--amber)", marginBottom: 10 }}>EZ Curl Bar Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={S.label}>BAR WEIGHT (kg)</label>
              <input style={S.input} type="number" placeholder="e.g. 8" value={data.ezbarWeight || ""} onChange={e => setData(d => ({ ...d, ezbarWeight: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>MAX LOADED (kg)</label>
              <input style={S.input} type="number" placeholder="e.g. 113" value={data.ezbarMax || ""} onChange={e => setData(d => ({ ...d, ezbarMax: e.target.value }))} />
            </div>
          </div>
          <label style={S.label}>PLATES (same as barbell)</label>
          <input style={S.input} placeholder="e.g. 2x20, 2x10, 2x5, 2x2.5" value={data.ezbarPlates || ""} onChange={e => setData(d => ({ ...d, ezbarPlates: e.target.value }))} />
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
            <label style={S.label}>{l}</label>
            <input style={S.input} type="number" placeholder={p} value={data[k] || ""} onChange={e => set(k, e.target.value)} />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>BODY WEIGHT FOR LOG (kg) — tracked over time</label>
        <input style={S.input} type="number" placeholder="e.g. 82.5" value={data.bodyWeight || ""} onChange={e => set("bodyWeight", e.target.value)} />
      </div>

      {bmi && <div style={{ ...S.info, color: bmiColor, marginBottom: 10 }}>BMI {bmi} - {bmiLabel}</div>}
      {isOld && <div style={{ ...S.warn, marginBottom: 10 }}>40+ Protocol: longer warmup, extra rest, joint-friendly variants recommended</div>}

      <div style={S.h2}>Experience Level</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {["Beginner","Intermediate","Advanced"].map(l => (
          <div key={l} style={{ ...S.chip(data.level === l), flex: 1, justifyContent: "center" }} onClick={() => set("level", l)}>{l}</div>
        ))}
      </div>
      {isBegin && <div style={{ ...S.info, marginBottom: 4 }}>Beginner mode: keep RIR 3+, gradual progression</div>}

      <div style={S.h2}>Primary Goal</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
        {GOALS.map(g => (
          <div key={g.id} style={{ ...S.chip(data.goal === g.id), flexDirection: "column", gap: 2, padding: "10px 8px", textAlign: "center" }} onClick={() => set("goal", g.id)}>
            <span style={{ fontSize: 18 }}>{g.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>{g.label}</span>
            <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-m)" }}>{g.desc}</span>
          </div>
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
                    <label style={S.label}>WEIGHT (kg)</label>
                    <input style={S.input} type="number" placeholder="e.g. 60" value={data.profileBaseline?.[ref.name]?.weight || ""} onChange={e => setBaseline(ref.name, "weight", e.target.value)} />
                  </div>
                )}
                <div>
                  <label style={S.label}>{ref.type === "reps" ? "MAX REPS" : "REPS AT THAT WEIGHT"}</label>
                  <input style={S.input} type="number" placeholder={ref.type === "reps" ? "e.g. 20" : "e.g. 8"} value={data.profileBaseline?.[ref.name]?.reps || ""} onChange={e => setBaseline(ref.name, "reps", e.target.value)} />
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
          <div key={i} style={{ ...S.card, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: day === "REST" ? "var(--bg3)" : "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 12, color: "var(--amber)", flexShrink: 0, marginTop: 2 }}>D{i+1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16 }}>{day}</div>
              <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>{(SPLIT_MAP[day]||[]).join(" - ") || "Recovery day"}</div>
              {warnings.map((w,wi) => <div key={wi} style={{ fontSize: 10, color: "var(--red)", fontFamily: "var(--font-m)", marginTop: 2 }}>{w}</div>)}
            </div>
            {day !== "REST" && <button style={S.btnSm} onClick={() => { setData(d => ({ ...d, activeDay: day })); onNext(); }}>Start</button>}
          </div>
        );
      })}
      <button style={{ ...S.btn, width: "100%", justifyContent: "center", marginTop: 8, marginBottom: 20 }} onClick={() => { setData(d => ({ ...d, activeDay: split[0] })); onNext(); }}>
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
  // Override reps for exercises that have their own rep ranges
  const effectiveReps = repOverride || rr.reps;
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
  const sets = sessionLog[key] || Array.from({ length: numSets }, () => isTimed ? { seconds: "", rpe: "" } : { weight: "", reps: "", rpe: "" });
  const suggestion = getSmartSuggestion(key, goal, history, data.profileBaseline, data);
  const weightDisplay = suggestion?.weight ? formatWeightDisplay(key, suggestion.weight, data) : null;

  const prevSession = (history || []).find(h => h.log?.[key]);
  const prevSets = prevSession?.log?.[key] || [];

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

  let warmupSets = [];
  try { if (!isTimed && !repsOnly && workingWeight > 0) {
    if (BIG4_BENCH.includes(key) || BIG4_OHP.includes(key)) {
      // Bar + 3 loaded sets
      warmupSets = [
        { label:"W1", pct:"bar",  kg: snapBar(parseFloat(barW), barW, bPlts), reps:10 },
        { label:"W2", pct:"50%",  kg: snapBar(workingWeight*0.50, barW, bPlts), reps:8 },
        { label:"W3", pct:"70%",  kg: snapBar(workingWeight*0.70, barW, bPlts), reps:5 },
        { label:"W4", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:3 },
      ];
    } else if (BIG4_SQUAT.includes(key)) {
      warmupSets = [
        { label:"W1", pct:"bar",  kg: snapBar(parseFloat(barW), barW, bPlts), reps:10 },
        { label:"W2", pct:"50%",  kg: snapBar(workingWeight*0.50, barW, bPlts), reps:8 },
        { label:"W3", pct:"70%",  kg: snapBar(workingWeight*0.70, barW, bPlts), reps:5 },
        { label:"W4", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:3 },
      ];
    } else if (BIG4_DEAD.includes(key)) {
      // No empty bar — start at 40% for deadlift pattern
      warmupSets = [
        { label:"W1", pct:"40%",  kg: snapBar(workingWeight*0.40, barW, bPlts), reps:8 },
        { label:"W2", pct:"60%",  kg: snapBar(workingWeight*0.60, barW, bPlts), reps:5 },
        { label:"W3", pct:"75%",  kg: snapBar(workingWeight*0.75, barW, bPlts), reps:3 },
        { label:"W4", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:2 },
      ];
    } else if (isBarbell && workingWeight > 20) {
      warmupSets = [
        { label:"W1", pct:"50%",  kg: snapBar(workingWeight*0.50, barW, bPlts), reps:8 },
        { label:"W2", pct:"70%",  kg: snapBar(workingWeight*0.70, barW, bPlts), reps:5 },
        { label:"W3", pct:"85%",  kg: snapBar(workingWeight*0.85, barW, bPlts), reps:3 },
      ];
    } else if (isEZ && workingWeight > 14) {
      warmupSets = [
        { label:"W1", pct:"50%",  kg: snapBar(workingWeight*0.50, ezW, ezPlt), reps:8 },
        { label:"W2", pct:"75%",  kg: snapBar(workingWeight*0.75, ezW, ezPlt), reps:5 },
      ];
    } else if (isDumbbell && workingWeight > 16) {
      warmupSets = [
        { label:"W1", pct:"60%",  kg: (workingWeight*0.6).toFixed(1), reps:8 },
        { label:"W2", pct:"80%",  kg: (workingWeight*0.8).toFixed(1), reps:5 },
      ];
    }
    // Filter out warmup sets where kg equals or exceeds working weight
    warmupSets = warmupSets.filter(ws => parseFloat(ws.kg) < workingWeight);
  } } catch(e) { warmupSets = []; }

  const totalVol = sets.reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
  const prevVol = prevSets.reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);
  const volDiff = prevVol > 0 && totalVol > 0 ? ((totalVol-prevVol)/prevVol*100).toFixed(0) : null;
  const tips = TECHNIQUE[key] || [];

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
    setSwappedTo({ name: alt.name, muscle: alt.muscle, eq: ["bodyweight"], unilateral: false, cat: activeEx.cat, isFav: false });
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
        <button style={S.btnSm} onClick={() => setExpanded(e => !e)}>{expanded ? "▲" : "Log"}</button>
      </div>

      {/* ── TODAY'S TARGET — always visible ── */}
      <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
      <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--amber)", letterSpacing:1 }}>TODAY'S TARGET</div>
      {suggestion?.source === "planned" && (
        <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:4, background:"rgba(34,197,94,0.13)", color:"var(--green)", fontFamily:"var(--font-m)", fontSize:10 }}>📋 RIR-planned</span>
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
          onClick={() => setShowDesc(d => !d)}>
          <span>📖 Technique cues</span>
          <span>{showDesc ? "▲" : "▼"}</span>
        </button>
        {showDesc && tips.length > 0 && (
          <div style={{ background:"var(--bg3)", borderRadius:6, padding:"10px 12px", animation:"fadeUp .15s ease both" }}>
            {tips.map((t,i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom: i<tips.length-1?6:0 }}>
                <span style={{ color:"var(--amber)", fontFamily:"var(--font-m)", fontSize:11, flexShrink:0 }}>{i+1}.</span>
                <span style={{ fontFamily:"var(--font-b)", fontSize:13, lineHeight:1.5, color:"var(--text)" }}>{t}</span>
              </div>
            ))}
          </div>
        )}
        {showDesc && tips.length === 0 && (
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
          <div style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:6, padding:"10px 12px", fontFamily:"var(--font-b)", fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap", color:"var(--text)", animation:"fadeUp .2s ease both" }}>
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
        <div style={{ animation:"fadeUp .2s ease both", borderTop:"1px solid var(--border)", paddingTop:12, marginTop:4 }}>
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
                    {wuDisplay?.detail && <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--border)" }}>{wuDisplay.detail}</span>}
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
                    <input style={{ ...S.input, flex:2, padding:"7px 8px" }} type="number"
                      placeholder={String(timedSec)} value={set.seconds||""}
                      onChange={e => updateSet(i,"seconds",e.target.value)} />
                    <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>sec</span>
                    <input style={{ ...S.input, flex:1, padding:"7px 8px", borderColor:rirColor(set.rpe) }} type="number"
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
                      <input style={{ ...S.input, flex:2, padding:"7px 8px" }} type="number"
                        placeholder={suggestion?.weight || "kg"} value={set.weight||""}
                        onChange={e => updateSet(i,"weight",e.target.value)} />
                      <span style={{ color:"var(--muted)", fontSize:11 }}>×</span>
                    </>
                  )}
                  <input style={{ ...S.input, flex:1.5, padding:"7px 8px" }} type="number"
                    placeholder={effectiveReps} value={set.reps||""}
                    onChange={e => updateSet(i,"reps",e.target.value)} />
                  {!repsOnly && (
                    <input style={{ ...S.input, flex:1, padding:"7px 8px", borderColor:rirColor(set.rpe) }} type="number"
                    min="1" max="10" placeholder="RIR" value={set.rpe||""}
                    onChange={e => updateSet(i,"rpe",e.target.value)} />
                  )}
                  {!repOverride && set.weight && set.reps && (
                    <span style={{ ...S.tag("var(--green)"), whiteSpace:"nowrap", fontSize:10 }}>
                      {(parseFloat(set.weight)*parseInt(set.reps)).toFixed(0)}kg
                    </span>
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

// ── Workout Screen ────────────────────────────────────────────────────────────
function WorkoutScreen({ data, setData, onBack, setSyncStatus = () => {} }) {
  const day = data.activeDay || (data.split||[])[0] || "Full Body";
  const meso      = initMesocycle(data.mesocycle);
  const isDeload   = meso.phase === "deload";
  const isIntense  = meso.phase === "intensification";
  const phaseLen   = PHASE_LENGTHS[meso.phase] || 12;

  const _rawExercises = getExercisesForDay(day, data.equipment||[], data.goal, data.favourites, data.level);
  const _ov = (data.sessionOverride?.day === day) ? data.sessionOverride : { removed: [], replaced: {} };
  const exercises = _rawExercises
    .filter(ex => !_ov.removed.includes(ex.name))
    .map(ex => {
      const rep = _ov.replaced[ex.name];
      if (!rep) return ex;
      const dbEx = Object.values(EXERCISE_DB).flat().find(e => e.name === rep);
      return dbEx ? { ...dbEx, isFav: false } : ex;
    });
  const [sessionLog, setSessionLog] = useState({});
  const [finished, setFinished] = useState(false);
  const [trendDismissed, setTrendDismissed] = useState(false);
  const trends = trendDismissed ? [] : detectTrends(day, data.history || []);
  const [sessionRating, setSessionRating] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [planSaved, setPlanSaved] = useState(false);
  const age = parseInt(data.age) || 0;
  const deload = shouldDeload(data.history);
  const warnings = getMuscleWarnings(day, data.history);
  const totalVolume = Object.values(sessionLog).flat().reduce((a,s) => a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0), 0);

  const warmupProtocol = age >= 40
    ? ["5 min light cardio","Hip circles 10 each side","Arm circles 10 each","Leg swings 10 each leg","Band pull-aparts 15 reps","2-3 warm-up sets per exercise"]
    : ["3 min light movement","Joint mobility 5 min","1-2 warm-up sets per exercise"];

  const saveSession = () => {
    const entry = { date: new Date().toISOString().slice(0,10), day, volume: totalVolume, log: sessionLog, rating: sessionRating, notes: sessionNotes };
    const { dayType, plan } = calcNextSessionPlan(day, sessionLog, data.goal, data);
    const updatedNextSession = { ...(data.nextSession || {}), [dayType]: plan };
    // Update mesocycle
    const currentMeso  = initMesocycle(data.mesocycle);
    const newCount     = currentMeso.sessionCount + 1;
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

  if (finished) return (
    <div style={S.section}>
      <div style={S.h1}>Session <span style={{ color:"var(--green)" }}>Done!</span></div>
      <div style={{ ...S.card, textAlign:"center", padding:28, border:"1px solid var(--green)" }}>
        <div style={{ fontSize:44, marginBottom:8 }}>🏆</div>
        <div style={{ fontFamily:"var(--font-h)", fontSize:26, color:"var(--green)" }}>{totalVolume.toFixed(0)} kg</div>
        <div style={{ color:"var(--muted)", fontSize:11, fontFamily:"var(--font-m)" }}>TOTAL VOLUME · {exercises.length} exercises</div>
        {sessionRating && <div style={{ marginTop:10, fontSize:14 }}>{"⭐".repeat(parseInt(sessionRating))}</div>}
        {sessionNotes && <div style={{ marginTop:6, fontFamily:"var(--font-b)", fontSize:13, color:"var(--muted)", fontStyle:"italic" }}>"{sessionNotes}"</div>}
        {planSaved && (
          <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:6, padding:"8px 12px", marginTop:14, fontFamily:"var(--font-m)", fontSize:12, color:"var(--green)", textAlign:"left" }}>
            📋 Next {day} session planned — weights adjusted from your RIR
          </div>
        )}
      </div>
      {meso.pendingTransition && (
        <div style={{ ...S.card, border:"1px solid var(--amber)", marginTop:14, animation:"fadeUp .2s ease both" }}>
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
            <span style={{ fontFamily:"var(--font-m)", fontSize:10, color:phaseColor(meso.phase), letterSpacing:1 }}>
              {phaseLabel(meso.phase)} · {meso.sessionCount}/{phaseLen}
            </span>
          </div>
        </div>
        {totalVolume > 0 && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>VOL</div>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:20, color:"var(--amber)" }}>{totalVolume.toFixed(0)}kg</div>
          </div>
        )}
      </div>
      <div style={S.sub}>{exercises.length} EXERCISES · {(data.level||"").toUpperCase()} · HYPERTROPHY</div>

      {isDeload && <div style={{ ...S.warn, marginBottom:8 }}>DELOAD WEEK — Same weights, 2 sets only, RIR 3-4. Recovery first.</div>}
      {warnings.map((w,i) => <div key={i} style={{ ...S.warn, marginBottom:6 }}>{w}</div>)}

      {trends.length > 0 && (
        <div style={{ background:"rgba(168,85,247,0.08)", border:"1px solid rgba(168,85,247,0.35)",
          borderRadius:8, padding:"10px 14px", marginBottom:10, animation:"fadeUp .2s ease both" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:13,
              color:"var(--purple)", letterSpacing:1 }}>📈 TREND ALERT</span>
            <button style={{ ...S.btnSm, fontSize:10, color:"var(--muted)" }}
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

      <div style={{ ...S.card, marginBottom:12, border:"1px solid rgba(59,130,246,0.3)" }}>
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
        <ExerciseCard key={`${ex.name}-${i}`} ex={ex} exNum={i+1} totalEx={exercises.length} goal={data.goal} data={data} sessionLog={sessionLog} setSessionLog={setSessionLog} history={data.history} />
      ))}

      <div style={{ ...S.card, marginTop:8 }}>
        <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:14, marginBottom:10 }}>SESSION DEBRIEF</div>
        <label style={S.label}>RATING (1-5)</label>
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {["1","2","3","4","5"].map(r => (
            <div key={r} style={{ ...S.chip(sessionRating===r), flex:1, justifyContent:"center", padding:"7px 4px", fontSize:12 }} onClick={() => setSessionRating(r)}>{"⭐".repeat(parseInt(r))}</div>
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
            <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: 10, background: m.role==="user"?"var(--amber)":"var(--bg3)", color: m.role==="user"?"#000":"var(--text)", fontFamily: "var(--font-b)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", borderBottomRightRadius: m.role==="user"?2:10, borderBottomLeftRadius: m.role==="user"?10:2 }}>
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
        <div style={{ ...S.card, marginBottom: 10 }}>
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
                <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16 }}>{h.day}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                  <span style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>{h.date}</span>
                  {h.rating && <span style={{ fontSize: 11 }}>{"⭐".repeat(parseInt(h.rating))}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-h)", fontWeight: 900, fontSize: 20, color: "var(--amber)" }}>{(h.volume||0).toFixed(0)}</div>
                <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>kg volume</div>
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
  "Push-Up":               ["Keep body in straight line from head to heels","Lower chest to 1cm from floor, elbows at 45°","Exhale on push, engage core throughout"],
  "Diamond Push-Up":       ["Hands form a diamond shape directly under chest","Keep elbows tracking back not flared out","Full lockout at top, squeeze triceps"],
  "Pike Push-Up":          ["Hips high in inverted-V, hands shoulder width","Lower crown of head toward floor","Press back up explosively, shoulders do the work"],
  "Dumbbell Bench Press":  ["Retract scapula and plant them into bench","Lower to chest level, elbows at 75° angle","Drive through heels, press in arc not straight up"],
  "Barbell Bench Press":   ["Arch lower back, 5 points of contact with bench","Bar path slight arc from chest to over shoulders","Leg drive transfers power through the whole chain"],
  "Dumbbell Fly":          ["Slight bend in elbows maintained throughout","Stretch deep at bottom, squeeze hard at top","Think hugging a barrel, not flapping wings"],
  "Weighted Dip":          ["Lean slightly forward for chest, stay upright for triceps","Lower until upper arms parallel to floor","Full lockout at top between every rep"],
  "Tricep Dips":           ["Keep elbows tracking back not flared wide","Control the descent, 2 seconds down","Press through heel of hand not fingers"],
  "Overhead Press":        ["Bar starts at collarbone, grip just outside shoulders","Squeeze glutes and abs to protect lower back","Lock out fully overhead, ears through arms at top"],
  "Assisted Pull-Up":      ["Loop band around bar, place knee or foot in band for support","Same form as regular pull-up — dead hang start, chest to bar","Use thinner band as you get stronger — green → purple → no band"],
  "Pull-Up":               ["Dead hang to start, scapula depressed","Lead with chest to bar, not chin","Lower fully on each rep — full range builds more"],
  "Chin-Up":               ["Supinated grip activates biceps more","Think elbows to hips rather than chin up","Pause 1 second at top, controlled descent"],
  "Neutral Grip Pull-Up":  ["Wrists neutral, shoulder width apart","Engage lats before you pull by depressing shoulders","Drive elbows down and back to finish"],
  "Weighted Pull-Up":      ["Add weight gradually — even 2.5kg changes the stimulus","Maintain same form as bodyweight — no kipping","Full dead hang between reps for max range"],
  "Weighted Chin-Up":      ["Belt weight should hang freely, not bump knees","Same technique as bodyweight — full ROM","2-3 second negative builds serious strength"],
  "Inverted Row":          ["Body rigid like a plank throughout","Pull chest to bar, not just hands","Slow 3-second lowering for maximum tension"],
  "Dumbbell Row":          ["Knee and same-side hand on bench for support","Pull elbow to hip, not straight up","At top: hold 1 second squeezing lat fully"],
  "Single-Arm Dumbbell Row":["Neutral spine — back parallel to floor","Elbow drives back past torso for full contraction","Don't rotate torso — keep hips square"],
  "Barbell Row":           ["Hinge at hips, back at 45°, bar just below knees","Pull bar to lower sternum, elbows close to body","Lower with control — the eccentric builds thickness"],
  "EZ Bar Curl":           ["Elbows pinned to sides throughout the movement","Curl to chin level, squeeze at top","3-second lowering maximizes bicep time under tension"],
  "EZ Bar Reverse Curl":   ["Overhand grip, wrists neutral not broken","Keep elbows stationary at sides","Develops brachialis and forearm thickness"],
  "EZ Bar Skull Crusher":  ["Lower bar to forehead or slightly behind","Keep upper arms vertical — only forearms move","Squeeze triceps hard at lockout"],
  "EZ Bar Upright Row":    ["Grip shoulder width, bar stays close to body","Elbows lead upward to chin level","Avoid shrugging — control the movement"],
  "Close-Grip Bench Press":["Hands 25-30cm apart — not too narrow or wrists strain","Tuck elbows to 45° angle to body","Full lockout, feel triceps working"],
  "Barbell Squat":         ["Bar on traps, not neck — create a shelf","Break at hips and knees simultaneously","Drive knees out over toes, chest stays tall"],
  "Barbell Deadlift":      ["Bar over mid-foot, hip width stance","Hinge at hips first, then bend knees to grip","Push floor away rather than pulling bar up"],
  "Romanian Deadlift":     ["Slight bend in knees, maintained throughout","Hinge at hips pushing them back — feel hamstring stretch","Stop when back starts to round — not about how low you go"],
  "Goblet Squat":          ["Hold dumbbell at chest, elbows inside knees","Deep squat — use weight as counterbalance","Great for quad development and mobility"],
  "Bulgarian Split Squat": ["Front foot 60-70cm from bench","Lower rear knee toward floor — vertical front shin","Most of the weight through front heel"],
  "Lunge":                 ["Step length so front shin stays vertical","Lower back knee close to floor without touching","Push off front heel to return to start"],
  "Single-Leg RDL":        ["Stand on slight bend in working leg","Hinge forward while non-working leg extends back","Hip height determines stretch depth — stay controlled"],
  "Calf Raise":            ["Full range — heel below platform level at bottom","Pause 1 second at top, squeeze hard","Slow tempo — calves respond to time under tension"],
  "Squat":                 ["Feet shoulder width, toes slightly out","Break parallel — crease of hip below top of knee","Drive knees out, chest proud, weight through full foot"],
  "Plank":                 ["Forearms under shoulders, body in straight line","Squeeze glutes and abs simultaneously","Breathe normally — don't hold your breath"],
  "Dead Bug":              ["Lower back pressed into floor throughout","Extend opposite arm and leg slowly","Return to start before switching sides"],
  "Ab Wheel Rollout":      ["Start on knees, abs braced before moving","Roll out until hips want to drop — that's your limit","Pull back using abs not hip flexors"],
  "Bicycle Crunch":        ["Don't pull neck — hand lightly behind ear","Rotate shoulder to knee, not elbow","Slow and controlled — speed kills effectiveness"],
  "Balance Disc Squat":    ["Stand centered on disc, feet hip width","Slower movement needed — disc forces stability","Engages stabilizers traditional squat misses"],
  "Kettlebell Swing":      ["It's a hip hinge, not a squat","Hike bell back like hiking a football","Snap hips explosively — arms just guide the bell"],
  "Burpee":                ["Land softly from jump — knees slightly bent","Keep hips low in plank position","Jump with full extension — arms overhead"],
  "Mountain Climber":      ["Wrists under shoulders, hips level","Drive knee to chest without letting hip rise","Speed is fine but maintain flat back"],
  "Clean & Press":         ["Explosive hip extension launches the bell","Catch in rack position — bell resting on forearm","Press strict — no leg drive unless push press"],
  "Band Pull-Apart":       ["Arms straight in front, hands shoulder width","Pull apart to chest, hold 1 second","Retract scapula fully — works rear delts hard"],
  "Dumbbell Shoulder Press":["Dumbbells at ear level, elbows at 90° before pressing","Press straight up, don't flare elbows forward","Lower slowly — 3 seconds down for more stimulus"],
  "Dumbbell Curl":         ["Elbows pinned to sides — don't swing the body","Supinate wrist as you curl up for full bicep contraction","Full extension at bottom — don't cheat the range"],
  "Kettlebell Row":        ["Same as dumbbell row — knee and hand on bench","Drive elbow back past torso at the top","Pause at top to eliminate momentum"],
  "Single-Leg Balance Disc":["Stand on one leg centered on disc","Arms out for balance initially, then reduce","Builds proprioception and ankle stability"],
  "Tricep Overhead Ext":   ["Keep elbows pointing forward, not flaring","Lower weight behind head until forearms touch biceps","Press straight up — elbows stay fixed"],
  "Thoracic Extension":    ["Sit on floor, upper back (not lower!) on bench edge — just below shoulder blades","Hands behind head, slowly extend back over bench edge — hold 2-3 seconds","Never force — let gravity do the work, breathe out as you extend"],
  "Single-Arm DB Press":   ["Brace core hard to resist rotation — that's the point","Press at slight angle inward, not straight up","Pause at chest to eliminate momentum"],
  "Single-Leg Glute Bridge":["Drive through heel of working leg only","Squeeze glute hard at top — hold 2 seconds","Non-working leg extended or bent — either works"],
  "Balance Disc Plank":    ["Forearms on disc creates instability — engage everything","Micro-adjustments constantly — that's the stimulus","Progress by adding time, not movement"],
  "Banded Squat":          ["Band around knees creates abductor demand","Drive knees out against band throughout","Adds hip stability work to the squat pattern"],
  "EZ Bar Complex":        ["Move between exercises without putting bar down","Row → curl → overhead press in sequence","Light weight — fatigue accumulates fast"],
  "Thruster":              ["Front rack position: elbows high, bar on shoulders","Squat, then use momentum to press at top","One fluid movement — not squat then press"],
  "Resistance Band Press": ["Anchor band behind you at chest height","Step forward for more tension, back for less","Control the return — don't let band snap back"],
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

  const isDumbbellEx = (name) => ["Dumbbell Bench Press","Dumbbell Shoulder Press","Dumbbell Row",
    "Dumbbell Curl","Single-Arm Dumbbell Row","Dumbbell Fly","Goblet Squat","Single-Leg RDL",
    "Tricep Overhead Ext","Clean & Press","Single-Arm DB Press","Romanian Deadlift",
    "Bulgarian Split Squat","Lunge"].includes(name);
  const isBarbellEx = (name) => ["Barbell Bench Press","Barbell Squat","Barbell Deadlift",
    "Barbell Row","Overhead Press","Close-Grip Bench Press"].includes(name);
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

    if (hasTimed || (!hasWeight && hasReps) || isBodyweightEx(exName)) {
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
function getSmartSuggestion(exName, goal, history, profileBaseline, data) {
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
  if (data && data.nextSession) {
    for (const dayPlan of Object.values(data.nextSession)) {
      if (dayPlan && dayPlan[exName]) {
        const p = dayPlan[exName];
        if (p.type === "weight" && p.targetWeight)
          return { weight: p.targetWeight.toFixed(1), reps: rr.reps, source:"planned",
            oneRM: calc1RM(p.targetWeight, p.targetReps), planRIR: p.targetRIR };
        if (p.type === "reps")
          return { weight: null, reps: String(p.targetReps), source:"planned", oneRM: null };
      }
    }
  }

  // Intensification phase — formula-based weight calc
  if (data?.mesocycle?.phase === "intensification") {
    const isDumbbellEx2 = ["Dumbbell Bench Press","Dumbbell Shoulder Press","Dumbbell Row",
      "Dumbbell Curl","Single-Arm Dumbbell Row","Dumbbell Fly","Goblet Squat","Single-Leg RDL",
      "Tricep Overhead Ext","Clean & Press","Single-Arm DB Press","Romanian Deadlift",
      "Bulgarian Split Squat","Lunge"].includes(exName);
    const isBarbellEx2 = ["Barbell Bench Press","Barbell Squat","Barbell Deadlift",
      "Barbell Row","Overhead Press","Close-Grip Bench Press"].includes(exName);
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
              {TECHNIQUE[ex] && <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{TECHNIQUE[ex][0]}</div>}
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
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [expandedEx, setExpandedEx] = useState(null);
  const history = data.history || [];
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });
  const today = new Date().toISOString().slice(0, 10);
  const sessionByDate = {};
  history.forEach(h => { sessionByDate[h.date] = h; });
  const getVolColor = vol => !vol ? null : vol < 2000 ? "var(--blue)" : vol < 5000 ? "var(--amber)" : "var(--red)";
  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => { const n = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); if (n <= new Date()) setViewDate(n); };
  const selectedSession = selectedDay ? sessionByDate[selectedDay] : null;
  const split = data.split || [];
  const lastIdx = history[0] ? split.indexOf(history[0].day) : -1;
  const nextDay = split[(lastIdx + 1) % split.length];

  return (
    <div style={S.section}>
      <div style={S.h1}>Schedule <span style={{ color: "var(--amber)" }}>&amp; Log</span></div>
      {nextDay && nextDay !== "REST" && (
        <div style={{ ...S.card, border: "1px solid var(--green)", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--green)" }}>NEXT SESSION</div>
            <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 18 }}>{nextDay}</div>
            <div style={{ fontFamily: "var(--font-m)", fontSize: 10, color: "var(--muted)" }}>{(SPLIT_MAP[nextDay]||[]).join(" · ")}</div>
          </div>
          <button style={{ ...S.btnGreen, padding: "8px 14px", fontSize: 13 }} onClick={() => setData(d => ({ ...d, activeDay: nextDay }))}>Start →</button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button style={S.btnSm} onClick={prevMonth}>← Prev</button>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 16, color: "var(--amber)" }}>{monthName}</div>
        <button style={{ ...S.btnSm, opacity: month === new Date().getMonth() && year === new Date().getFullYear() ? 0.3 : 1 }} onClick={nextMonth}>Next →</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ fontFamily: "var(--font-m)", fontSize: 9, color: "var(--muted)", textAlign: "center" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 12 }}>
        {Array.from({ length: firstDay }).map((_,i) => <div key={"e"+i} />)}
        {Array.from({ length: daysInMonth }).map((_,i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const session = sessionByDate[dateStr];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDay;
          return (
            <div key={day} onClick={() => { setSelectedDay(isSelected ? null : dateStr); setExpandedEx(null); }}
              style={{ aspectRatio:"1", borderRadius:6, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor: session ? "pointer" : "default", background: isSelected ? "rgba(245,158,11,0.2)" : isToday ? "var(--bg3)" : "transparent", border: isToday ? "1px solid var(--amber)" : "1px solid transparent" }}>
              <span style={{ fontFamily:"var(--font-m)", fontSize:12, color: isToday ? "var(--amber)" : session ? "var(--text)" : "var(--muted)" }}>{day}</span>
              {session && <div style={{ width:6, height:6, borderRadius:"50%", background: getVolColor(session.volume), marginTop:2 }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:14, fontFamily:"var(--font-m)", fontSize:10 }}>
        <span style={{ color:"var(--blue)" }}>● Light</span>
        <span style={{ color:"var(--amber)" }}>● Medium</span>
        <span style={{ color:"var(--red)" }}>● Heavy</span>
      </div>

      {selectedSession && (
        <div style={{ ...S.card, border:"1px solid var(--amber)", animation:"fadeUp .2s ease both" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:20 }}>{selectedSession.day}</div>
              <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>{selectedDay} {selectedSession.rating && "· "+"⭐".repeat(parseInt(selectedSession.rating))}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--amber)" }}>{(selectedSession.volume||0).toFixed(0)}kg</div>
              <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>total volume</div>
            </div>
          </div>

          {Object.entries(selectedSession.log||{}).map(([name, sets]) => {
            const isOpen = expandedEx === name;
            const tips = TECHNIQUE[name] || [];
            const best = sets.filter(s=>s.reps).reduce((a,s) => {
              const vol = (parseFloat(s.weight)||0)*(parseInt(s.reps)||0);
              return vol > a.vol ? { vol, weight: s.weight, reps: s.reps } : a;
            }, { vol:0, weight:0, reps:0 });
            return (
              <div key={name} style={{ marginBottom:8, border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", cursor:"pointer", background: isOpen ? "rgba(245,158,11,0.06)" : "transparent" }}
                  onClick={() => setExpandedEx(isOpen ? null : name)}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:15 }}>{name}</div>
                    <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)" }}>
                      {sets.filter(s=>s.reps).map(s=>`${s.weight||"BW"}×${s.reps}${s.rpe?"RIR"+s.rpe:""}`).join("  |  ")}
                    </div>
                  </div>
                  <span style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--amber)" }}>{isOpen ? "▲" : "▼ Tips"}</span>
                </div>
                {isOpen && (
                  <div style={{ padding:"10px 12px", background:"rgba(245,158,11,0.04)", borderTop:"1px solid var(--border)", animation:"fadeUp .15s ease both" }}>
                    {best.weight > 0 && (
                      <div style={{ ...S.success, marginBottom:10 }}>
                        Best set this session: {best.weight}kg × {best.reps} reps · Volume: {best.vol.toFixed(0)}kg
                      </div>
                    )}
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:700, fontSize:12, color:"var(--amber)", marginBottom:8 }}>TECHNIQUE CUES</div>
                    {tips.length > 0 ? tips.map((tip,i) => (
                      <div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}>
                        <span style={{ color:"var(--amber)", fontFamily:"var(--font-m)", fontSize:12, flexShrink:0 }}>{i+1}.</span>
                        <span style={{ fontFamily:"var(--font-b)", fontSize:13, lineHeight:1.5, color:"var(--text)" }}>{tip}</span>
                      </div>
                    )) : <div style={{ fontFamily:"var(--font-m)", fontSize:12, color:"var(--muted)" }}>No technique notes for this exercise yet.</div>}
                  </div>
                )}
              </div>
            );
          })}
          {selectedSession.notes && <div style={{ marginTop:8, fontFamily:"var(--font-b)", fontSize:12, color:"var(--muted)", fontStyle:"italic" }}>"{selectedSession.notes}"</div>}
        </div>
      )}
      {history.length === 0 && (
        <div style={{ ...S.card, textAlign:"center", padding:32, color:"var(--muted)" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📅</div>No sessions logged yet.
        </div>
      )}
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

  const MiniBar = ({ values, colors, labels, unit="" }) => {
    const max = Math.max(...values.map(v => parseFloat(v)||0), 1);
    return (
      <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:60 }}>
        {values.map((v,i) => {
          const pct = (parseFloat(v)||0)/max*100;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>{v}{unit}</div>
              <div style={{ width:"100%", background: colors?.[i] || "var(--amber)", borderRadius:"2px 2px 0 0", height:pct+"%", minHeight:4, opacity:0.8 }} />
              {labels?.[i] && <div style={{ fontFamily:"var(--font-m)", fontSize:8, color:"var(--muted)", textAlign:"center" }}>{labels[i]}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const LineChart = ({ points, color="var(--amber)", unit="" }) => {
    if (points.length < 2) return <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", padding:"20px 0" }}>Log more sessions to see trend</div>;
    const vals = points.map(p => p.y);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const W = 300, H = 80;
    const pts = points.map((p,i) => ({ x: (i/(points.length-1))*W, y: H - ((p.y-min)/range)*(H-10)-5 }));
    const path = pts.map((p,i) => `${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return (
      <div style={{ overflowX:"auto" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
          <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p,i) => (
            <g key={i}>
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
        <div style={{ animation:"fadeUp .2s ease both" }}>
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
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--amber)" }}>{exH[exH.length-1]?.weight}kg × {exH[exH.length-1]?.reps}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"var(--font-m)", fontSize:10, color:"var(--muted)" }}>EST. 1RM</div>
                    <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:22, color:"var(--green)" }}>{exH[exH.length-1]?.orm}kg</div>
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
        <div style={{ animation:"fadeUp .2s ease both" }}>
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
        </div>
      )}

      {/* Body weight panel */}
      {activePanel === "body" && (
        <div style={{ animation:"fadeUp .2s ease both" }}>
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
        <div style={{ animation:"fadeUp .2s ease both" }}>
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
        <div style={{ animation:"fadeUp .2s ease both" }}>
          <div style={S.h2}>Personal Records</div>
          {PRs.length > 0 ? PRs.map((pr,i) => (
            <div key={i} style={{ ...S.card, display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
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
        <div style={{ animation:"fadeUp .2s ease both" }}>
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

  // Smart next day suggestion
  const lastSession = history[0];
  const lastIdx = lastSession ? split.indexOf(lastSession.day) : -1;
  const suggestedDay = split[(lastIdx + 1) % split.length] || split[0];
  const activeDay = selectedDay || suggestedDay;

  // Days trained this week
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0,0,0,0);
  const thisWeekSessions = history.filter(h => new Date(h.date) >= weekStart);
  const targetDays = parseInt(data.days) || 3;

  // Body weight check — prompt if >7 days since last log
  const lastBW = bwHistory[0];
  const daysSinceBW = lastBW ? Math.floor((new Date() - new Date(lastBW.date)) / 86400000) : 999;
  const needsBWPrompt = daysSinceBW >= 7;

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
    setData(d => ({ ...d, activeDay }));
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
  const todayExercises = getExercisesForDay(activeDay, data.equipment||[], data.goal, data.favourites, data.level);

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
  const _nextPlan = data.nextSession && data.nextSession[_activeDayType];
  const _plannedCount = _nextPlan ? Object.keys(_nextPlan).length : 0;

  const today2 = new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" });

  return (
    <div style={{ ...S.section, paddingBottom: 80 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:4 }}>{today2.toUpperCase()}</div>
        <div style={S.h1}>Ready to <span style={{ color:"var(--amber)" }}>Train?</span></div>
        <div style={{ display:"flex", gap:16, marginTop:10 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:24, color:"var(--amber)" }}>{thisWeekSessions.length}</div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>THIS WEEK</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:24, color: thisWeekSessions.length >= targetDays ? "var(--green)" : "var(--text)" }}>{targetDays}</div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>TARGET</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:24, color:"var(--blue)" }}>{history.length}</div>
            <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>TOTAL</div>
          </div>
          {lastBW && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"var(--font-h)", fontWeight:900, fontSize:24, color:"var(--muted)" }}>{lastBW.weight}</div>
              <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--muted)" }}>KG BW</div>
            </div>
          )}
        </div>
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
      <div style={{ ...S.card, border:"1px solid var(--amber)", marginBottom:14 }}>
        {/* Day selector */}
        <div style={{ fontFamily:"var(--font-m)", fontSize:9, color:"var(--amber)", letterSpacing:1, marginBottom:8 }}>SELECT DAY</div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
          {split.filter(d => d !== "REST").map(d => (
            <div key={d} style={{ ...S.chip(activeDay === d), padding:"6px 10px", fontSize:12 }}
              onClick={() => setSelectedDay(d)}>{d}</div>
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
          const lastSame = history.find(h => h.day === activeDay);
          return lastSame ? (
            <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:14 }}>
              Last {activeDay}: {lastSame.date} · {(lastSame.volume||0).toFixed(0)}kg volume
            </div>
          ) : (
            <div style={{ fontFamily:"var(--font-m)", fontSize:11, color:"var(--muted)", marginBottom:14 }}>
              First time doing {activeDay} — baseline session!
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
        📋 {_plannedCount} exercises planned — weights adjusted from your last {activeDay} RIR
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
      </div>

      {/* Last session recap */}
      {lastSession && (
        <>
          <div style={S.h2}>Last Session</div>
          <div style={S.card} onClick={() => onGoToTab("history")} >
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
      // Sort history newest first
      base.history.sort((a,b) => new Date(b.date) - new Date(a.date));
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
          {tab === "workout"  && <WorkoutScreen data={data} setData={setData} onBack={() => setTab("home")} setSyncStatus={setSyncStatus} />}
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

