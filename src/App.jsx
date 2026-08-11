import { useState, useEffect, useRef, Fragment } from "react";
import {
  DndContext, DragOverlay, closestCorners,
  MouseSensor, TouchSensor, useSensor, useSensors, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  useAuth, useWorkouts, useDietLog, useActivityLog,
  useFocusSessions, useBoards, useCustomExercises, useRooneyMemories,
  useZone2Log, useSettings, useRooneyConversation, useGoalLogs, useGoalSnapshots, useBodyweight, migrateLocalStorage,
} from "./lib/supabaseHooks";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:      "#080808",
  surface: "#101010",
  card:    "#141414",
  border:  "#1e1e1e",
  border2: "#2a2a2a",
  accent:  "#FF6B35",  // warm orange brand color
  dim:     "#333",
  muted:   "#555",
  sub:     "#888",
  text:    "#e8e8e8",
  red:     "#dc2626",  // darker red = "bad"
  neutral: "#94a3b8",  // slate gray = middle/"neither good nor bad"
  yellow:  "#fbbf24",  // decorative only (PR sparkles, board colors)
  green:   "#4ade80",
  blue:    "#38bdf8",
  purple:  "#a78bfa",
};
const MONO = "'DM Mono','Courier New',monospace";

// Orange barbell logo mark (matches the app icon)
function BarbellMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id="bbMark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF8A4C"/>
          <stop offset="100%" stopColor="#F5571E"/>
        </linearGradient>
      </defs>
      <g fill="url(#bbMark)">
        <rect x="138" y="236" width="236" height="40" rx="14"/>
        <rect x="100" y="146" width="50" height="220" rx="18"/>
        <rect x="58"  y="186" width="38" height="140" rx="14"/>
        <rect x="38"  y="224" width="18" height="64"  rx="8"/>
        <rect x="362" y="146" width="50" height="220" rx="18"/>
        <rect x="416" y="186" width="38" height="140" rx="14"/>
        <rect x="456" y="224" width="18" height="64"  rx="8"/>
      </g>
    </svg>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────
const DIET_CONFIG   = { green: { emoji:"🟢", label:"Clean",    color: C.green,  desc:"On plan"        }, yellow: { emoji:"⚪", label:"Decent",   color: C.neutral, desc:"Minor slips"    }, red:    { emoji:"🔴", label:"Off",      color: C.red,    desc:"Off plan"       } };
const ACTIVE_CONFIG = { green: { emoji:"🟢", label:"Active",   color: C.green,  desc:"Crushed it"     }, yellow: { emoji:"⚪", label:"Moving",   color: C.neutral, desc:"Light movement" }, red:    { emoji:"🔴", label:"Rest",     color: C.red,    desc:"Rest day"       } };

// Legacy simple targets — still read by IronTab's stat strip.
const WEEKLY_GOALS = { workouts: 4, dietGreen: 4, dietRed: 1, activeGreen: 4 };

// Muscle groups map Andrew's mental categories to the EX_META muscle values.
const MUSCLE_GROUPS = {
  Chest:       ["Chest"],
  Back:        ["Back"],
  Shoulders:   ["Shoulders"],
  Arms:        ["Biceps", "Triceps"],
  Legs:        ["Quads", "Hamstrings", "Glutes", "Calves"],
  Abs:         ["Core"],
  PT:          ["PT"],
  "Full Body": ["Full Body"],
};

// Goal "kinds". Each maps to a data SOURCE and a comparison direction (type:
//   "min" = hit when got>=target, "max" = hit when got<=target).
//   muscle/workouts -> read workout history;  zone2 -> read zone2_log;
//   diet_*/active_* -> read diet/activity logs;  habit/timed -> read goal_logs.
const GOAL_KINDS = {
  perfect_days: { defaultTarget: 3,  unit: "d",   type: "min" },
  muscle:       { defaultTarget: 1,  unit: "x",   type: "min" },
  zone2:        { defaultTarget: 60, unit: "min", type: "min" },
  diet_green:   { defaultTarget: 4,  unit: "d",   type: "min" },
  active_green: { defaultTarget: 4,  unit: "d",   type: "min" },
  diet_red:     { defaultTarget: 1,  unit: "d",   type: "max" },
  workouts:     { defaultTarget: 4,  unit: "x",   type: "min" },
  habit:        { defaultTarget: 7,  unit: "d",   type: "min" },  // generic checkbox habit -> goal_logs
  timed:        { defaultTarget: 60, unit: "min", type: "min" },  // generic minutes goal -> goal_logs
};

// Which broad CATEGORY each kind belongs to. Drives how a goal is logged & shown:
//   workout -> completed by logging a gym session
//   habit   -> a daily yes/no checkbox
//   timed   -> minutes per day, summed across the week
const GOAL_TYPE_BY_KIND = {
  muscle: "workout", workouts: "workout",
  zone2: "timed", timed: "timed",
  diet_green: "habit", active_green: "habit", diet_red: "habit", habit: "habit",
  perfect_days: "habit",
};

// Default emoji + color per kind (used when a goal hasn't picked its own).
const GOAL_EMOJI_BY_KIND = {
  perfect_days:"⭐", muscle:"💪", workouts:"🏋", zone2:"🫀", timed:"⏱",
  diet_green:"🥗", active_green:"👟", diet_red:"🔴", habit:"✅",
};
// Per-muscle-group default emoji, so a Chest goal, a Back goal, a Legs goal
// don't all read as "💪 (biceps)". Used when the goal hasn't set its own.
const MUSCLE_GROUP_EMOJI = {
  Chest:       "🫁",  // chest cavity
  Back:        "🦴",  // spine
  Shoulders:   "🏔",  // wide ridge / shoulder line
  Arms:        "💪",  // biceps flex
  Legs:        "🦵",  // leg
  Abs:         "🔥",  // core fire / six-pack
  PT:          "🩹",  // recovery / rehab
  "Full Body": "🤸",  // gymnast / whole-body movement
};
function defaultGoalColor(kind) {
  if (kind === "zone2" || kind === "timed") return "#38bdf8";   // blue
  if (kind === "diet_red") return "#dc2626";                    // red (a "max" cap)
  if (kind === "muscle" || kind === "workouts") return "#FF6B35"; // orange
  return "#4ade80";                                             // green (habits)
}

// 8 swatches for the goal color picker.
const GOAL_COLORS = ["#FF6B35","#4ade80","#38bdf8","#a78bfa","#fbbf24","#f472b6","#dc2626","#94a3b8"];

// Fill in type/color/emoji/active for any goal (derive-on-read so existing
// stored goals keep working without a destructive migration).
function normalizeGoal(g) {
  // Muscle goals look up emoji by group (Chest → 🫁, Back → 🦴, etc.) so
  // each goal reads distinctly instead of all being 💪.
  let defaultEmoji = GOAL_EMOJI_BY_KIND[g.kind] || "•";
  if (g.kind === "muscle" && g.group && MUSCLE_GROUP_EMOJI[g.group]) {
    defaultEmoji = MUSCLE_GROUP_EMOJI[g.group];
  }
  // Treat the legacy auto-default 💪 on non-Arms muscle goals as "no custom
  // emoji set" so existing users get the new per-group emojis without losing
  // any genuinely customized choice. Arms legitimately uses 💪.
  let storedEmoji = g.emoji;
  if (g.kind === "muscle" && storedEmoji === "💪" && g.group && g.group !== "Arms") {
    storedEmoji = undefined;
  }
  return {
    ...g,
    type:   g.type      || GOAL_TYPE_BY_KIND[g.kind] || "habit",
    color:  g.color     || defaultGoalColor(g.kind),
    emoji:  storedEmoji || defaultEmoji,
    active: g.active === false ? false : true,
  };
}

// Andrew's starting goals (editable).
const DEFAULT_GOAL_LIST = [
  { id: "g_chest",  kind: "muscle", group: "Chest",     target: 1, label: "Chest" },
  { id: "g_back",   kind: "muscle", group: "Back",      target: 1, label: "Back" },
  { id: "g_legs",   kind: "muscle", group: "Legs",      target: 1, label: "Legs" },
  { id: "g_abs",    kind: "muscle", group: "Abs",       target: 2, label: "Abs" },
  { id: "g_sh",     kind: "muscle", group: "Shoulders", target: 1, label: "Shoulders" },
  { id: "g_pt",     kind: "muscle", group: "PT",        target: 1, label: "PT" },
  { id: "g_z2",     kind: "zone2",  target: 60, label: "Zone 2" },
  { id: "g_diet",   kind: "diet_green",   target: 4, label: "Clean diet days" },
  { id: "g_active", kind: "active_green", target: 4, label: "Active days" },
];

function muscleOfEx(exId, customExercises) {
  return EX_META[exId]?.muscle || customExercises?.[exId]?.muscle || null;
}
function catOfEx(exId, customExercises) {
  return EX_META[exId]?.cat || customExercises?.[exId]?.cat || null;
}

// Returns { got, target, hit, unit, type, label } for a goal this week.
function computeGoalProgress(goal, ctx) {
  const { history, dietLog, activeLog, zone2Log, goalLogs = [], weekDays, customExercises } = ctx;
  const weekSet = new Set(weekDays);
  const meta = GOAL_KINDS[goal.kind] || { unit: "", type: "min" };
  const target = goal.target ?? meta.defaultTarget ?? 1;
  let got = 0;

  if (goal.kind === "muscle") {
    const muscles = MUSCLE_GROUPS[goal.group] || [];
    const days = new Set();
    for (const w of history) {
      const d = isoDate(new Date(w.date));
      if (!weekSet.has(d)) continue;
      for (const ex of (w.exercises || [])) {
        const m = muscleOfEx(ex.exId, customExercises);
        const cat = catOfEx(ex.exId, customExercises);
        // Count if the exercise's muscle is in the group, OR its category matches
        // the group name (so PT / Legs / Arms / Full Body count by either label).
        if ((m && muscles.includes(m)) || cat === goal.group) { days.add(d); break; }
      }
    }
    got = days.size;
  } else if (goal.kind === "zone2") {
    got = (zone2Log || []).filter(z => weekSet.has(z.date)).reduce((a, z) => a + (z.minutes || 0), 0);
  } else if (goal.kind === "diet_green") {
    got = weekDays.filter(d => dietLog[d] === "green").length;
  } else if (goal.kind === "active_green") {
    got = weekDays.filter(d => activeLog[d] === "green").length;
  } else if (goal.kind === "diet_red") {
    got = weekDays.filter(d => dietLog[d] === "red").length;
  } else if (goal.kind === "workouts") {
    const days = new Set();
    for (const w of history) { const d = isoDate(new Date(w.date)); if (weekSet.has(d)) days.add(d); }
    got = days.size;
  } else if (goal.kind === "habit") {
    // Generic daily checkbox habit — count logged completions this week.
    got = goalLogs.filter(l => l.goal_id === goal.id && weekSet.has(l.date) && l.completed).length;
  } else if (goal.kind === "timed") {
    // Generic minutes goal — sum logged minutes this week.
    got = goalLogs.filter(l => l.goal_id === goal.id && weekSet.has(l.date)).reduce((a, l) => a + (l.value || 0), 0);
  } else if (goal.kind === "perfect_days") {
    const wkoutDays = new Set(history.map(w => isoDate(new Date(w.date))));
    got = weekDays.filter(d => dietLog[d] === "green" && activeLog[d] === "green" && wkoutDays.has(d)).length;
  }

  const hit = meta.type === "max" ? got <= target : got >= target;
  const label = goal.label || goal.group || goal.kind;
  return { got, target, hit, unit: meta.unit, type: meta.type, label };
}

const EXERCISES = {
  // Push
  bench:"Bench Press", incline:"Incline Bench", db_bench:"DB Bench Press", incline_db:"Incline DB Press",
  db_fly:"DB Fly", cable_fly:"Cable Fly", dip:"Weighted Dip", pushup:"Push-Up",
  ohp:"Overhead Press", db_ohp:"DB Shoulder Press", arnold:"Arnold Press", push_press:"Push Press",
  lateral:"Lateral Raise", front_raise:"Front Raise", rear_delt:"Rear Delt Fly",
  close_grip_bench:"Close Grip Bench",
  // Pull
  deadlift:"Deadlift", sumo_dl:"Sumo Deadlift", trap_bar_dl:"Trap Bar Deadlift",
  row:"Barbell Row", pendlay_row:"Pendlay Row", t_bar_row:"T-Bar Row",
  pullup:"Pull-Up", chinup:"Chin-Up", lat:"Lat Pulldown", cable_row:"Cable Row", db_row:"DB Row",
  face_pull:"Face Pull", shrug:"Shrugs",
  // Legs
  squat:"Back Squat", front_squat:"Front Squat", goblet_squat:"Goblet Squat",
  leg_press:"Leg Press", hack_squat:"Hack Squat", bulgarian:"Bulgarian Split Squat",
  lunge:"Walking Lunge", reverse_lunge:"Reverse Lunge", step_up:"Step-Up",
  rdl:"Romanian Deadlift", good_morning:"Good Morning",
  leg_curl:"Leg Curl", leg_ext:"Leg Extension", nordic:"Nordic Curl",
  hip_thrust:"Hip Thrust", glute_bridge:"Glute Bridge",
  calf_raise:"Calf Raise",
  // Arms
  curl:"Barbell Curl", hammer:"Hammer Curl", preacher_curl:"Preacher Curl",
  cable_curl:"Cable Curl", concentration_curl:"Concentration Curl",
  tricep_push:"Tricep Pushdown", skull:"Skull Crusher", overhead_tri:"Overhead Tricep Extension",
  rope_pushdown:"Rope Pushdown",
  // Full Body
  burpee:"Burpees", kb_swing:"KB Swing", clean_press:"Clean & Press", thruster:"Thruster",
  farmers:"Farmer's Carry", med_ball:"Med Ball Slam", turkish:"Turkish Get-Up", box_jump:"Box Jump",
  // Abs / Core
  plank:"Plank", side_plank:"Side Plank", russian_twist:"Russian Twist", hanging_leg:"Hanging Leg Raise",
  crunch:"Crunch", bicycle_crunch:"Bicycle Crunch", sit_up:"Sit-Up", leg_raise:"Lying Leg Raise",
  ab_wheel:"Ab Wheel Rollout", dead_bug:"Dead Bug", mountain_climber:"Mountain Climbers", cable_crunch:"Cable Crunch",
  // Cardio
  zone2:"Zone 2 Cardio", stairmaster:"Stairmaster", rowing:"Rowing Machine",
  bike:"Stationary Bike", treadmill:"Treadmill Run", jump_rope:"Jump Rope",
};
const EX_META = {
  // Push
  bench:{muscle:"Chest",cat:"Push"}, incline:{muscle:"Chest",cat:"Push"}, db_bench:{muscle:"Chest",cat:"Push"}, incline_db:{muscle:"Chest",cat:"Push"},
  db_fly:{muscle:"Chest",cat:"Push"}, cable_fly:{muscle:"Chest",cat:"Push"}, dip:{muscle:"Chest",cat:"Push"}, pushup:{muscle:"Chest",cat:"Push"},
  ohp:{muscle:"Shoulders",cat:"Push"}, db_ohp:{muscle:"Shoulders",cat:"Push"}, arnold:{muscle:"Shoulders",cat:"Push"}, push_press:{muscle:"Shoulders",cat:"Push"},
  lateral:{muscle:"Shoulders",cat:"Push"}, front_raise:{muscle:"Shoulders",cat:"Push"}, rear_delt:{muscle:"Shoulders",cat:"Push"},
  close_grip_bench:{muscle:"Triceps",cat:"Push"},
  // Pull
  deadlift:{muscle:"Back",cat:"Pull"}, sumo_dl:{muscle:"Back",cat:"Pull"}, trap_bar_dl:{muscle:"Back",cat:"Pull"},
  row:{muscle:"Back",cat:"Pull"}, pendlay_row:{muscle:"Back",cat:"Pull"}, t_bar_row:{muscle:"Back",cat:"Pull"},
  pullup:{muscle:"Back",cat:"Pull"}, chinup:{muscle:"Back",cat:"Pull"}, lat:{muscle:"Back",cat:"Pull"}, cable_row:{muscle:"Back",cat:"Pull"}, db_row:{muscle:"Back",cat:"Pull"},
  face_pull:{muscle:"Shoulders",cat:"Pull"}, shrug:{muscle:"Traps",cat:"Pull"},
  // Legs
  squat:{muscle:"Quads",cat:"Legs"}, front_squat:{muscle:"Quads",cat:"Legs"}, goblet_squat:{muscle:"Quads",cat:"Legs"},
  leg_press:{muscle:"Quads",cat:"Legs"}, hack_squat:{muscle:"Quads",cat:"Legs"}, bulgarian:{muscle:"Quads",cat:"Legs"},
  lunge:{muscle:"Quads",cat:"Legs"}, reverse_lunge:{muscle:"Quads",cat:"Legs"}, step_up:{muscle:"Quads",cat:"Legs"},
  rdl:{muscle:"Hamstrings",cat:"Legs"}, good_morning:{muscle:"Hamstrings",cat:"Legs"},
  leg_curl:{muscle:"Hamstrings",cat:"Legs"}, leg_ext:{muscle:"Quads",cat:"Legs"}, nordic:{muscle:"Hamstrings",cat:"Legs"},
  hip_thrust:{muscle:"Glutes",cat:"Legs"}, glute_bridge:{muscle:"Glutes",cat:"Legs"},
  calf_raise:{muscle:"Calves",cat:"Legs"},
  // Arms
  curl:{muscle:"Biceps",cat:"Arms"}, hammer:{muscle:"Biceps",cat:"Arms"}, preacher_curl:{muscle:"Biceps",cat:"Arms"},
  cable_curl:{muscle:"Biceps",cat:"Arms"}, concentration_curl:{muscle:"Biceps",cat:"Arms"},
  tricep_push:{muscle:"Triceps",cat:"Arms"}, skull:{muscle:"Triceps",cat:"Arms"}, overhead_tri:{muscle:"Triceps",cat:"Arms"},
  rope_pushdown:{muscle:"Triceps",cat:"Arms"},
  // Full Body
  burpee:{muscle:"Full Body",cat:"Full Body"}, kb_swing:{muscle:"Full Body",cat:"Full Body"}, clean_press:{muscle:"Full Body",cat:"Full Body"}, thruster:{muscle:"Full Body",cat:"Full Body"},
  farmers:{muscle:"Full Body",cat:"Full Body"}, med_ball:{muscle:"Full Body",cat:"Full Body"}, turkish:{muscle:"Full Body",cat:"Full Body"}, box_jump:{muscle:"Full Body",cat:"Full Body"},
  // Abs / Core — all bodyweight by default (enter reps, leave weight blank or 0)
  plank:{muscle:"Core",cat:"Abs"}, side_plank:{muscle:"Core",cat:"Abs"},
  russian_twist:{muscle:"Core",cat:"Abs"}, hanging_leg:{muscle:"Core",cat:"Abs"},
  crunch:{muscle:"Core",cat:"Abs"}, bicycle_crunch:{muscle:"Core",cat:"Abs"},
  sit_up:{muscle:"Core",cat:"Abs"}, leg_raise:{muscle:"Core",cat:"Abs"},
  ab_wheel:{muscle:"Core",cat:"Abs"}, dead_bug:{muscle:"Core",cat:"Abs"},
  mountain_climber:{muscle:"Core",cat:"Abs"}, cable_crunch:{muscle:"Core",cat:"Abs"},
  // Cardio
  zone2:{muscle:"Cardio",cat:"Cardio"}, stairmaster:{muscle:"Cardio",cat:"Cardio"}, rowing:{muscle:"Cardio",cat:"Cardio"},
  bike:{muscle:"Cardio",cat:"Cardio"}, treadmill:{muscle:"Cardio",cat:"Cardio"}, jump_rope:{muscle:"Cardio",cat:"Cardio"},
};

const DEFAULT_BOARDS = [
  { id:"b1", name:"Job Search", color: C.purple, cols:[
    { id:"c1", name:"Backlog",     cards:[{ id:"k1", text:"Research Tulip Interfaces role", tags:["research"] },{ id:"k2", text:"Update resume for RevOps roles", tags:["resume"] }] },
    { id:"c2", name:"In Progress", cards:[{ id:"k3", text:"Prep for Tulip CEO office interview", tags:["interview","priority"] }] },
    { id:"c3", name:"Done",        cards:[{ id:"k4", text:"Send thank you to Carla", tags:[] }] },
  ]},
  { id:"b2", name:"Glossa App", color: C.blue, cols:[
    { id:"c4", name:"Todo",        cards:[{ id:"k5", text:"Wire up SM-2 spaced repetition", tags:["dev"] },{ id:"k6", text:"Batch generate A2 sentences", tags:["dev"] }] },
    { id:"c5", name:"In Progress", cards:[{ id:"k7", text:"Build grammar panel double-click save", tags:["dev","active"] }] },
    { id:"c6", name:"Done",        cards:[{ id:"k8", text:"UX prototype complete", tags:[] }] },
  ]},
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2,9); }
function isoDate(d=new Date()) {
  // LOCAL calendar date (YYYY-MM-DD), not UTC. Using UTC made "today" roll over
  // in the evening for non-UTC time zones, so workouts/diet logged this evening
  // got bucketed under tomorrow. Shift by the timezone offset before slicing.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function formatDuration(sec) { if (!sec || sec < 60) return `${sec||0}s`; return `${Math.round(sec/60)} min`; }
// Exercises that are bodyweight by default — new blocks start in BW mode
// (reps only, no weight field) so you never have to think about it.
const DEFAULT_BW_EXERCISES = new Set([
  "pullup","chinup","pushup","dip","burpee","box_jump","jump_rope","nordic","glute_bridge",
  "plank","side_plank","russian_twist","hanging_leg","crunch","bicycle_crunch","sit_up",
  "leg_raise","ab_wheel","dead_bug","mountain_climber",
]);
// A "bodyweight" set carries reps but no meaningful weight.
function isBwSet(s) {
  const r = parseInt(s?.reps);
  if (!r) return false;
  const w = parseFloat(s?.weight);
  return s?.weight === "" || s?.weight == null || isNaN(w) || w === 0;
}
// Returns { kind: "weight"|"bw"|null, value } so PR comparisons stay in the
// right "space". PR metric is deliberately simple and legible:
//   weighted  → heaviest WEIGHT in lbs
//   bodyweight → most REPS in a single set
// (Previously this used an estimated-1RM formula, which read as arbitrary.)
function setMetric(s, bwMode = false) {
  const r = parseInt(s?.reps);
  if (!r) return { kind: null, value: 0 };
  if (bwMode || isBwSet(s)) return { kind: "bw", value: r };
  return { kind: "weight", value: parseFloat(s.weight) };
}
// Per-exercise best across history: { exId: { maxWeight, bwReps } }.
function bestByExercise(history, excludeId=null) {
  const out = {};
  for (const wk of history) {
    if (excludeId && wk.id === excludeId) continue;
    for (const ex of (wk.exercises || [])) {
      const rec = out[ex.exId] || { maxWeight: 0, bwReps: 0 };
      for (const s of (ex.sets || [])) {
        if (!s.done) continue;
        const m = setMetric(s);
        if (m.kind === "weight" && m.value > rec.maxWeight) rec.maxWeight = m.value;
        if (m.kind === "bw"     && m.value > rec.bwReps)    rec.bwReps    = m.value;
      }
      out[ex.exId] = rec;
    }
  }
  return out;
}
function formatTime(s) { const m=Math.floor(s/60).toString().padStart(2,"0"); return `${m}:${(s%60).toString().padStart(2,"0")}`; }
function getWeekDays(offset=0) {
  const now=new Date(); const day=now.getDay();
  const mon=new Date(now); mon.setDate(now.getDate()-((day+6)%7)+offset*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return isoDate(d); });
}
// Rolling 7-day window — today and the 6 prior days. Used by Home so goal
// progress is "the past week of your life" instead of "since Monday."
function getRolling7Days() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(isoDate(d));
  }
  return out;
}
// Encouraging-by-default color ramp for a completion percentage (0–100).
// Andrew's spec: <30 aggressive red, 30–50 soft red, 50–70 orange,
// 70–80 lime/light-green, 80–90 medium green, 90–99 good green, 100 vivid.
function progressColor(pct) {
  if (pct >= 100) return "#22ee66"; // amazing green (gets a glow at the call site)
  if (pct >= 90)  return "#4ade80"; // good green (matches C.green)
  if (pct >= 80)  return "#86efac"; // medium light green
  if (pct >= 70)  return "#bef264"; // lime
  if (pct >= 50)  return "#FF6B35"; // orange (C.accent)
  if (pct >= 30)  return "#f87171"; // soft red
  return "#dc2626";                 // aggressive red (C.red)
}
function thisWeekCount(history) {
  const days=getWeekDays(0); const set=new Set(days);
  return history.filter(w=>set.has(isoDate(new Date(w.date)))).length;
}
function workoutDateSet(history) {
  const s = new Set();
  for (const w of history) s.add(isoDate(new Date(w.date)));
  return s;
}
function isPerfectDay(date, dietLog, activeLog, workoutSet) {
  return dietLog[date] === "green" && activeLog[date] === "green" && workoutSet.has(date);
}
function getMonthCells(offset=0) {
  const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() + offset);
  const year = t.getFullYear(); const month = t.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month+1, 0);
  const firstWeekday = (first.getDay() + 6) % 7; // 0=Mon
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(isoDate(new Date(year, month, d)));
  return { cells, label: first.toLocaleDateString("en-US",{month:"long",year:"numeric"}) };
}

// ─── Persistence ──────────────────────────────────────────────────────────────
const STORAGE_PREFIX = "iron_";
// Note: "workLog" kept here so legacy data from earlier versions still clears on "Clear all data"
const STORAGE_KEYS = ["history","dietLog","activeLog","workLog","focusSessions","boards"];
function usePersistedState(key, defaultValue) {
  const storageKey = STORAGE_PREFIX + key;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
  }, [storageKey, value]);
  return [value, setValue];
}
function clearAllIronStorage() {
  for (const k of STORAGE_KEYS) {
    try { localStorage.removeItem(STORAGE_PREFIX + k); } catch {}
  }
}

// ─── Micro components ─────────────────────────────────────────────────────────
function TrafficLight({ config, value, onChange, size="md" }) {
  const p = size==="sm" ? "6px 0" : "10px 0";
  const fs = size==="sm" ? 14 : 18;
  return (
    <div style={{display:"flex",gap:6}}>
      {Object.entries(config).map(([key,cfg])=>(
        <button key={key} onClick={()=>onChange(value===key?null:key)} style={{
          flex:1, padding:p, borderRadius:8, border:"none", cursor:"pointer", fontSize:fs,
          background: value===key ? cfg.color+"22" : "#161616",
          outline: value===key ? `2px solid ${cfg.color}` : `2px solid transparent`,
          transition:"all 0.15s",
        }}>{cfg.emoji}</button>
      ))}
    </div>
  );
}

function WeekStrip({ days, dietLog, activeLog, history }) {
  const labels="MTWTFSS";
  const workoutDays = new Set(history.map(w=>isoDate(new Date(w.date))));
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
      {days.map((d,i)=>{
        const diet=dietLog[d]; const active=activeLog[d]; const didWk=workoutDays.has(d);
        const dcfg=diet?DIET_CONFIG[diet]:null;
        return (
          <div key={d} style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:d===isoDate()?C.accent:C.dim,fontFamily:MONO,marginBottom:3,fontWeight:d===isoDate()?700:400}}>{labels[i]}</div>
            <div style={{background:dcfg?dcfg.color+"18":"#111",border:`1px solid ${dcfg?dcfg.color:C.border}`,borderRadius:8,padding:"5px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minHeight:38}}>
              {dcfg ? <span style={{fontSize:12}}>{dcfg.emoji}</span> : <span style={{fontSize:10,color:C.dim}}>·</span>}
              {active && <span style={{fontSize:9}}>{ACTIVE_CONFIG[active].emoji}</span>}
              {didWk && <span style={{fontSize:9,color:C.accent,fontFamily:MONO,lineHeight:1}}>▶</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoalBar({ label, got, target, color, invert=false }) {
  const hit = invert ? got<=target : got>=target;
  const pct = Math.min(got/target,1)*100;
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:11,color:C.sub,fontFamily:MONO}}>{label}</span>
        <span style={{fontSize:11,fontFamily:MONO,color:hit?color:C.muted}}>{got}{invert?`/≤${target}`:`/${target}`}{hit?" ✓":""}</span>
      </div>
      <div style={{height:3,background:C.border,borderRadius:2}}>
        <div style={{height:3,borderRadius:2,width:`${pct}%`,background:hit?color:C.border2,transition:"width 0.5s"}}/>
      </div>
    </div>
  );
}

function MiniChart({ data, max, color, height=60, goalLine=null }) {
  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height}}>
        {data.map((v,i)=>{
          const h=Math.max((v/Math.max(max,1))*height*0.85,v>0?4:2);
          const hit = goalLine ? v>=goalLine : v>0;
          return <div key={i} style={{flex:1,height:h,background:hit?color:v>0?C.border2:C.border,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}}/>;
        })}
      </div>
      {goalLine != null && max > 0 && (
        <div style={{position:"absolute",left:0,right:0,top:`${height - (goalLine/Math.max(max,1))*height*0.85}px`,borderTop:`1px dashed ${color}55`,pointerEvents:"none"}}/>
      )}
    </div>
  );
}

function ScoreCard({ label, value, sub, color=C.text, big=false }) {
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
      <div style={{fontSize:big?28:22,fontWeight:700,color,fontFamily:MONO,lineHeight:1}}>{value}</div>
      <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:4,letterSpacing:"0.08em"}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:C.dim,fontFamily:MONO,marginTop:2}}>{sub}</div>}
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ history, dietLog, activeLog, focusSessions, zone2Log = [], goalLogs = [], customExercises = {}, todayTasks = [], onToggleTask, onAddTask, onUpdateTask, onUpdateDiet, onUpdateActive, onToggleGoal, onSetGoalMinutes, onGoTo, onOpenEdit, onClearAll, onSignOut, userEmail, onUpdatePassword, goals = DEFAULT_GOAL_LIST, onEditGoals }) {
  const goalList = (Array.isArray(goals) ? goals : DEFAULT_GOAL_LIST).map(normalizeGoal).filter(g => g.active !== false);
  const [minsEditGoal, setMinsEditGoal] = useState(null); // goalId currently entering minutes
  const [minsInput, setMinsInput] = useState("");
  const [addingToday, setAddingToday] = useState(false);
  const [newTodayText, setNewTodayText] = useState("");
  // Simple reference targets derived from the goal list (for trend goal-lines + perfect-day hero)
  const G = {
    perfectDays: 3,
    workouts:    goalList.find(g=>g.kind==="workouts")?.target ?? 4,
    dietGreen:   goalList.find(g=>g.kind==="diet_green")?.target ?? 4,
    activeGreen: goalList.find(g=>g.kind==="active_green")?.target ?? 4,
    dietRed:     goalList.find(g=>g.kind==="diet_red")?.target ?? 1,
  };
  const today = isoDate();
  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [monthOffset, setMonthOffset] = useState(0);

  // Workout index
  const wkSet = workoutDateSet(history);
  const wkIdxByDate = {};
  history.forEach((w, idx) => {
    const d = isoDate(new Date(w.date));
    (wkIdxByDate[d] ||= []).push(idx);
  });

  // Today
  const todayDiet = dietLog[today];
  const todayActive = activeLog[today];
  const todayWorkouts = (wkIdxByDate[today] || []).length;
  const todayDietGreen = todayDiet === "green";
  const todayActiveGreen = todayActive === "green";
  const todayHasWorkout = todayWorkouts > 0;
  // "Perfect day" criteria: green diet + green active + ≥1 workout
  const todayPerfectCount = [todayDietGreen, todayActiveGreen, todayHasWorkout].filter(Boolean).length;
  const todayScore = Math.round((todayPerfectCount/3)*100);
  const todayLabel = todayPerfectCount===3 ? "Perfect day"
                  : todayPerfectCount===2 ? "Almost there"
                  : todayPerfectCount===1 ? "Getting started"
                  : "Log your day";

  // This week
  const thisWeekDays = getWeekDays(0);
  const wkPerfect = thisWeekDays.filter(d=>isPerfectDay(d, dietLog, activeLog, wkSet)).length;
  const wkWorkouts = thisWeekCount(history);
  const wkDietGreen = thisWeekDays.filter(d=>dietLog[d]==="green").length;
  const wkDietRed   = thisWeekDays.filter(d=>dietLog[d]==="red").length;
  const wkActive    = thisWeekDays.filter(d=>activeLog[d]==="green").length;
  const weekFocusMins = focusSessions.filter(s=>thisWeekDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);

  // Rolling 7-day window — goals evaluate "the past week of your life"
  // (today and the 6 prior days) instead of "since Monday."
  const rolling7 = getRolling7Days();
  // Each goal counts as ONE binary hit (a 60-min Zone 2 goal weighs the
  // same as "Chest 1x", not 60 points). Goals normalized so muscle ones get
  // their per-group emoji (Chest 🫁, Back 🦴, etc.).
  const goalProgresses = goalList.map(normalizeGoal).map(g => ({ goal: g, p: computeGoalProgress(g, { history, dietLog, activeLog, zone2Log, goalLogs, weekDays: rolling7, customExercises }) }));
  const goalsHit = goalProgresses.filter(x => x.p.hit).length;
  const goalsTotal = goalProgresses.length;
  const weekPct = goalsTotal ? Math.round((goalsHit/goalsTotal)*100) : 0;
  // Encouraging labels — partial progress reads as progress, not failure.
  const weekLabel = goalsTotal===0 ? "Set some goals"
                  : weekPct===100 ? "Past 7 days crushed"
                  : weekPct>=90  ? "Almost perfect"
                  : weekPct>=70  ? "On track"
                  : weekPct>=50  ? "Halfway there"
                  : weekPct>=30  ? "Getting started"
                  : "Let's get to work";
  const weekColor = goalsTotal === 0 ? C.muted : progressColor(weekPct);

  // 8-week trends
  const now = new Date();
  const weeks = Array.from({length:8},(_,i)=>{
    const ws=new Date(now); ws.setDate(now.getDate()-(7-i)*7);
    const we=new Date(ws); we.setDate(ws.getDate()+7);
    const wDays=Array.from({length:7},(_,j)=>{const d=new Date(ws);d.setDate(ws.getDate()+j);return isoDate(d);});
    return {
      label: ws.toLocaleDateString("en-US",{month:"short",day:"numeric"}),
      workouts: history.filter(w=>{const d=new Date(w.date);return d>=ws&&d<we;}).length,
      dg: wDays.filter(d=>dietLog[d]==="green").length,
      dr: wDays.filter(d=>dietLog[d]==="red").length,
      ag: wDays.filter(d=>activeLog[d]==="green").length,
      perfect: wDays.filter(d=>isPerfectDay(d, dietLog, activeLog, wkSet)).length,
      focusMins: focusSessions.filter(s=>wDays.includes(s.date)).reduce((a,s)=>a+s.mins,0),
    };
  });
  const maxWk = Math.max(...weeks.map(w=>w.workouts), 1);
  const maxF  = Math.max(...weeks.map(w=>w.focusMins), 1);

  // Month view data
  const monthData = (() => {
    const { cells, label } = getMonthCells(monthOffset);
    const monthDays = cells.filter(Boolean);
    const totals = {
      workouts: monthDays.reduce((a,d)=>a + (wkIdxByDate[d]?.length || 0), 0),
      dietGreen: monthDays.filter(d=>dietLog[d]==="green").length,
      dietRed: monthDays.filter(d=>dietLog[d]==="red").length,
      active: monthDays.filter(d=>activeLog[d]==="green").length,
      perfect: monthDays.filter(d=>isPerfectDay(d, dietLog, activeLog, wkSet)).length,
      focusMins: focusSessions.filter(s=>monthDays.includes(s.date)).reduce((a,s)=>a+s.mins,0),
      daysLogged: monthDays.filter(d=>d<=today).length,
    };
    return { cells, label, totals };
  })();

  return (
    <div style={{padding:"16px 16px 80px"}}>

      {/* Today header */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:6}}>
          {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}).toUpperCase()}
        </div>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:8}}>
          <div style={{fontSize:26,fontWeight:700,color:C.text,fontFamily:MONO,lineHeight:1.1}}>
            {weekLabel}
            {weekPct===100 && goalsTotal>0 && <span style={{marginLeft:8,fontSize:22}}>⭐</span>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:28,fontWeight:700,color:weekColor,fontFamily:MONO,lineHeight:1,textShadow:weekPct>=100?`0 0 18px ${weekColor}66`:"none"}}>{weekPct}%</div>
            <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.08em",marginTop:2}}>{goalsHit}/{goalsTotal} GOALS</div>
          </div>
        </div>
      </div>

      {/* TODAY — Focus board "Today" lane as a checklist (synced to the board) */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:todayTasks.length||addingToday?12:0}}>
          <div style={{fontSize:12,color:C.text,fontFamily:MONO,letterSpacing:"0.12em",fontWeight:700}}>TODAY</div>
          <button onClick={()=>{setAddingToday(true);}} style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:6,color:C.muted,fontSize:14,cursor:"pointer",padding:"1px 9px",lineHeight:1.2}}>+</button>
        </div>
        {groupTasksForRender(todayTasks).map(row => row.kind === "header" ? (
          <div key={row.key} style={{fontSize:9,color:TASK_CATEGORY_COLOR[row.category],fontFamily:MONO,letterSpacing:"0.14em",fontWeight:700,marginTop:12,marginBottom:4,paddingBottom:3,borderBottom:`1px solid ${TASK_CATEGORY_COLOR[row.category]}33`}}>
            {TASK_CATEGORY_LABEL[row.category]}
          </div>
        ) : (() => {
          const cat = taskCategoryOf(row.card);
          const catColor = TASK_CATEGORY_COLOR[cat];
          return (
            <div key={row.key} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0"}}>
              <button aria-label="Complete task" onClick={()=>{ if(!row.card.done){try{if(navigator.vibrate)navigator.vibrate(15);}catch{}} onToggleTask(row.card.id); }}
                style={{flexShrink:0,width:26,height:26,padding:0,background:"transparent",border:"none",cursor:"pointer",marginTop:1}}>
                <svg width="24" height="24" viewBox="0 0 24 24" style={{display:"block"}}>
                  <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill={row.card.done?C.accent:"transparent"} stroke={row.card.done?C.accent:C.muted} strokeWidth="2" style={{transition:row.card.done?"fill 0.15s ease-out, stroke 0.15s ease-out":"none"}}/>
                  {row.card.done && <path d="M7 12.5 l3.3 3.3 l6.7 -7" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{strokeDasharray:22,animation:"checkDraw 0.16s ease-out forwards"}}/>}
                </svg>
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:row.card.done?C.muted:C.text,fontFamily:MONO,lineHeight:1.5,paddingTop:3,textDecoration:row.card.done?"line-through":"none"}}>{row.card.text}</div>
                {row.card.dueDate && row.card.dueDate < isoDate() && !row.card.done && (
                  <div style={{fontSize:10,color:C.red,fontFamily:MONO,marginTop:3,letterSpacing:"0.03em"}}>📅 overdue from {row.card.dueDate}</div>
                )}
              </div>
              {/* Tappable category chip — one tap flips work↔personal for this task. */}
              {onUpdateTask ? (
                <button
                  onClick={()=>onUpdateTask(row.card.id, { category: cat === "work" ? "personal" : "work" })}
                  title={`${TASK_CATEGORY_LABEL[cat]} — tap to change`}
                  style={{flexShrink:0,alignSelf:"flex-start",background:catColor+"1a",border:`1px solid ${catColor}66`,borderRadius:6,color:catColor,padding:"3px 8px",fontSize:9,fontFamily:MONO,cursor:"pointer",letterSpacing:"0.06em",fontWeight:700,marginTop:5,lineHeight:1.4}}>
                  {cat === "work" ? "WORK" : "PERS"}
                </button>
              ) : (
                <span style={{flexShrink:0,alignSelf:"flex-start",background:catColor+"1a",border:`1px solid ${catColor}66`,borderRadius:6,color:catColor,padding:"3px 8px",fontSize:9,fontFamily:MONO,letterSpacing:"0.06em",fontWeight:700,marginTop:5,lineHeight:1.4}}>
                  {cat === "work" ? "WORK" : "PERS"}
                </span>
              )}
            </div>
          );
        })())}
        {addingToday && (
          <div style={{marginTop:8}}>
            <input autoFocus value={newTodayText} onChange={e=>setNewTodayText(e.target.value)}
              onKeyDown={e=>{
                if(e.key==="Enter"&&newTodayText.trim()){ onAddTask("Today", newTodayText); setNewTodayText(""); setAddingToday(false); }
                if(e.key==="Escape"){ setAddingToday(false); setNewTodayText(""); }
              }}
              placeholder="Add a task for today…"
              style={{width:"100%",background:"#161616",border:`1px solid ${C.accent}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box"}}/>
            <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:5,letterSpacing:"0.03em"}}>To schedule for a future day, add it on the Focus tab.</div>
          </div>
        )}
        {todayTasks.length===0 && !addingToday && (
          <div style={{fontSize:11,color:C.muted,fontFamily:MONO,lineHeight:1.5,paddingTop:4}}>Nothing for today. Tap + to add, or set up your "Today" lane on the Focus tab.</div>
        )}
      </div>

      {/* Diet & Activity — today only */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
        <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:12}}>TODAY'S DIET & ACTIVITY</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div><div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:8}}>DIET</div><TrafficLight config={DIET_CONFIG} value={todayDiet} onChange={v=>onUpdateDiet(today,v)}/></div>
          <div><div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:8}}>ACTIVITY</div><TrafficLight config={ACTIVE_CONFIG} value={todayActive} onChange={v=>onUpdateActive(today,v)}/></div>
        </div>
      </div>

      {/* GOALS — core part of the homepage */}
      {(() => {
        const progresses = goalProgresses;
        const hitCount = goalsHit;
        const total = goalsTotal;
        return (
          <div style={{background:`linear-gradient(160deg, ${C.card}, ${C.surface})`,border:`1px solid ${C.accent}40`,borderRadius:16,padding:"16px 16px 8px",marginBottom:14,boxShadow:`0 0 30px ${C.accent}12`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:12,color:C.text,fontFamily:MONO,letterSpacing:"0.12em",fontWeight:700}}>PAST 7 DAYS</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontFamily:MONO,fontWeight:700,color:total>0 ? weekColor : C.sub}}>{hitCount}/{total} hit</span>
                {onEditGoals && <button onClick={onEditGoals} style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:6,color:C.muted,fontSize:10,cursor:"pointer",fontFamily:MONO,padding:"4px 9px"}}>Edit</button>}
              </div>
            </div>
            {total === 0 ? (
              <div style={{fontSize:11,color:C.muted,fontFamily:MONO,textAlign:"center",padding:"10px 0 16px",lineHeight:1.6}}>No goals yet. Tap Edit to add your first — a workout, a habit, a skill, anything you want to build consistently.</div>
            ) : progresses.map(({goal, p}) => {
              // Completed goals read green ("done"); in-progress shows the goal's own
              // color; a "max" cap turns red once it's exceeded.
              const over = p.type==="max" && p.got > p.target;
              const color = p.hit ? C.green : over ? C.red : goal.color;
              const pct = Math.min(p.got/Math.max(p.target,1),1)*100;
              const tgt = p.type==="max" ? `≤${p.target}${p.unit}` : `${p.target}${p.unit}`;
              // Generic habit / timed goals are logged right here from Home.
              const loggable = goal.kind === "habit" || goal.kind === "timed";
              const todayDone = goalLogs.some(l => l.goal_id===goal.id && l.date===today && l.completed);
              const todayMins = goalLogs.find(l => l.goal_id===goal.id && l.date===today)?.value || 0;
              const editing = minsEditGoal === goal.id;
              return (
                <div key={goal.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,gap:8}}>
                    <span style={{fontSize:12.5,color:C.text,fontFamily:MONO,display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                      <span style={{fontSize:14}}>{goal.emoji}</span>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.label}</span>
                    </span>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                      {loggable && goal.kind==="habit" && onToggleGoal && (
                        <button onClick={()=>onToggleGoal(goal.id)} title="Log today"
                          style={{background:todayDone?goal.color+"22":"transparent",border:`1px solid ${todayDone?goal.color:C.border2}`,borderRadius:7,color:todayDone?goal.color:C.muted,fontSize:10.5,fontFamily:MONO,padding:"4px 9px",cursor:"pointer"}}>
                          {todayDone ? "✓ today" : "+ today"}
                        </button>
                      )}
                      {loggable && goal.kind==="timed" && onSetGoalMinutes && (
                        editing ? (
                          <input autoFocus type="number" inputMode="numeric" value={minsInput} placeholder="min"
                            onChange={e=>setMinsInput(e.target.value)}
                            onBlur={()=>{onSetGoalMinutes(goal.id, parseInt(minsInput)||0); setMinsEditGoal(null);}}
                            onKeyDown={e=>{ if(e.key==="Enter"){onSetGoalMinutes(goal.id, parseInt(minsInput)||0); setMinsEditGoal(null);} if(e.key==="Escape"){setMinsEditGoal(null);} }}
                            style={{width:54,background:"#161616",border:`1px solid ${goal.color}`,borderRadius:7,color:C.text,padding:"4px 6px",fontSize:11,fontFamily:MONO,outline:"none",textAlign:"center"}}/>
                        ) : (
                          <button onClick={()=>{setMinsEditGoal(goal.id); setMinsInput(todayMins?String(todayMins):"");}} title="Log minutes today"
                            style={{background:todayMins?goal.color+"22":"transparent",border:`1px solid ${todayMins?goal.color:C.border2}`,borderRadius:7,color:todayMins?goal.color:C.muted,fontSize:10.5,fontFamily:MONO,padding:"4px 9px",cursor:"pointer"}}>
                            {todayMins ? `${todayMins}m today` : "+ min"}
                          </button>
                        )
                      )}
                      <span style={{fontSize:13,fontFamily:MONO,fontWeight:700,color:p.hit?color:over?C.red:C.sub}}>
                        {p.got}<span style={{color:C.dim,fontWeight:400}}>/{tgt}</span>{p.hit?" ✓":""}
                      </span>
                    </div>
                  </div>
                  <div style={{height:11,background:"#0d0d0d",borderRadius:6,overflow:"hidden",border:`1px solid ${C.border}`}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:5,background:`linear-gradient(90deg, ${color}bb, ${color})`,boxShadow:p.hit?`0 0 12px ${color}99`:"none",transition:"width 0.6s cubic-bezier(0.2,0.8,0.3,1)"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Workout — compact start link (below goals) */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
        <div>
          <div style={{fontSize:12,color:C.text,fontFamily:MONO,fontWeight:700}}>Workout</div>
          <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:2}}>{todayHasWorkout?`${todayWorkouts} logged today`:"Nothing logged yet"}</div>
        </div>
        <button onClick={()=>onGoTo("iron")} style={{background:"transparent",border:`1px solid ${C.accent}`,borderRadius:8,color:C.accent,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>Start a workout →</button>
      </div>

    </div>
  );
}

// ─── IRON TAB ─────────────────────────────────────────────────────────────────
function IronTab({ history, onStartWorkout, draft = null, onResumeDraft, onDiscardDraft }) {
  const wkWorkouts = thisWeekCount(history);
  const draftSets = draft ? (draft.exercises || []).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>parseInt(s.reps)>0).length,0) : 0;

  const PROGRAMS = [
    { id:"ppl", name:"Push Pull Legs", tag:"PPL · 3×/week", days:[
      {id:"push",name:"Push",icon:"⬆",exercises:["bench","incline","ohp","tricep_push","lateral"]},
      {id:"pull",name:"Pull",icon:"⬇",exercises:["deadlift","row","pullup","lat","curl"]},
      {id:"legs",name:"Legs",icon:"🦵",exercises:["squat","rdl","leg_press","calf_raise"]},
    ]},
    { id:"z2", name:"Zone 2 + Lift", tag:"Cardio focus", days:[
      {id:"z2c",name:"Zone 2 + Chest",icon:"❤️",exercises:["zone2","bench","incline","cable_fly"]},
      {id:"z2b",name:"Zone 2 + Back", icon:"❤️",exercises:["zone2","deadlift","row","lat"]},
      {id:"z2l",name:"Zone 2 + Legs", icon:"❤️",exercises:["zone2","squat","rdl","leg_press"]},
    ]},
  ];
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{padding:"16px 16px 80px"}}>

      {/* Header */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4}}>TRAIN</div>
        <div style={{fontSize:22,fontWeight:700,color:C.text,fontFamily:MONO,lineHeight:1.1}}>Workouts</div>
        <div style={{fontSize:11,color:C.dim,fontFamily:MONO,marginTop:6,lineHeight:1.5}}>Start a session, pick a program, or scroll down to backfill a past day.</div>
      </div>

      {/* Unfinished draft — nothing is in your history until it's locked in */}
      {draft && (
        <div style={{background:`linear-gradient(160deg, ${C.card}, ${C.surface})`,border:`1px solid ${C.blue}66`,borderRadius:14,padding:"14px 16px",marginBottom:16,boxShadow:`0 0 24px ${C.blue}12`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:8}}>
            <div style={{fontSize:10,color:C.blue,fontFamily:MONO,letterSpacing:"0.14em",fontWeight:700}}>IN PROGRESS</div>
            {onDiscardDraft && (
              <button onClick={()=>{ if(window.confirm("Discard this unfinished workout?")) onDiscardDraft(); }}
                style={{background:"transparent",border:"none",color:C.muted,fontSize:10,cursor:"pointer",fontFamily:MONO}}>Discard</button>
            )}
          </div>
          <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO,marginBottom:2}}>{draft.name || "Workout"}</div>
          <div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginBottom:12}}>
            {(draft.exercises||[]).length} exercise{(draft.exercises||[]).length===1?"":"s"} · {draftSets} set{draftSets===1?"":"s"} logged · not saved yet
          </div>
          <button onClick={onResumeDraft} style={{width:"100%",background:C.blue,color:"#000",border:"none",borderRadius:10,padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>Resume workout →</button>
        </div>
      )}

      {/* Stats strip — raw workout counts. The "is this enough?" judgement
          lives on the Home tab's weekly-goals card and the Trends tab. */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
        <ScoreCard label="THIS WEEK" value={wkWorkouts} sub={wkWorkouts===1?"workout":"workouts"} color={C.text}/>
        <ScoreCard label="ALL TIME"  value={history.length} sub={history.length===1?"workout":"workouts"} color={C.text}/>
      </div>

      {/* Start workout */}
      <button style={{width:"100%",background:draft?"transparent":C.accent,color:draft?C.accent:"#000",border:draft?`1px solid ${C.accent}`:"none",borderRadius:12,padding:"16px 18px",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:12,fontFamily:MONO,marginBottom:16,textAlign:"left"}}
        onClick={()=>onStartWorkout([])}>
        <span style={{fontSize:20}}>▶</span>
        <div><div>Start Empty Workout</div><div style={{fontSize:11,color:draft?C.muted:"rgba(0,0,0,0.5)",marginTop:2}}>Log any exercises</div></div>
      </button>

      {/* Programs */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>PROGRAMS</div>
      {PROGRAMS.map(prog=>(
        <div key={prog.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
          <button style={{width:"100%",background:"none",border:"none",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"}}
            onClick={()=>setExpanded(expanded===prog.id?null:prog.id)}>
            <div><div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:MONO,marginBottom:2}}>{prog.name}</div><div style={{fontSize:11,color:C.muted,fontFamily:MONO}}>{prog.tag}</div></div>
            <span style={{color:C.muted,fontSize:16,display:"inline-block",transform:expanded===prog.id?"rotate(90deg)":"none",transition:"transform 0.2s"}}>›</span>
          </button>
          {expanded===prog.id&&(
            <div style={{padding:"0 14px 14px"}}>
              {prog.days.map(day=>(
                <button key={day.id} style={{width:"100%",background:"#161616",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"}}
                  onClick={()=>onStartWorkout(day.exercises, `${prog.name} — ${day.name}`)}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:18}}>{day.icon}</span>
                    <div>
                      <div style={{fontSize:13,color:C.text,fontFamily:MONO}}>{day.name}</div>
                      <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:2}}>{day.exercises.slice(0,3).map(id=>EXERCISES[id]||id).join(" · ")}{day.exercises.length>3?` +${day.exercises.length-3}`:""}</div>
                    </div>
                  </div>
                  <span style={{color:C.accent,fontSize:12,fontFamily:MONO,fontWeight:700}}>Start →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

    </div>
  );
}

// ─── Coffee Mug Timer ─────────────────────────────────────────────────────────
function CoffeeMug({ fillPct, running, timeText }) {
  // SVG viewBox 0 0 120 120
  // Mug body: rounded rect spanning roughly y=30..96, x=22..86
  // Coffee fills the interior from bottom (y=92) up to topOfFill (y depends on fillPct)
  const innerTop = 36;    // y position where coffee can start (top of interior)
  const innerBottom = 92; // y position of coffee surface when empty
  const fillTop = innerBottom - (innerBottom - innerTop) * fillPct;
  const showSteam = running && fillPct > 0.05;
  const coffeeBase = "#6B3410";
  const coffeeTop = "#8B5A2B";

  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{display:"block"}}>
      <defs>
        <linearGradient id="coffeeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={coffeeTop}/>
          <stop offset="100%" stopColor={coffeeBase}/>
        </linearGradient>
        <clipPath id="mugInterior">
          <rect x={26} y={innerTop} width={56} height={innerBottom-innerTop} rx={5}/>
        </clipPath>
      </defs>

      {/* Handle (behind body so it tucks under) */}
      <path d="M 86 50 Q 104 50 104 68 Q 104 86 86 86"
        fill="none" stroke={C.text} strokeOpacity={0.4} strokeWidth={3.5} strokeLinecap="round"/>

      {/* Mug body */}
      <rect x={22} y={32} width={64} height={64} rx={7}
        fill={C.bg} stroke={C.text} strokeOpacity={0.55} strokeWidth={2.2}/>

      {/* Coffee fill (clipped to mug interior) */}
      <g clipPath="url(#mugInterior)">
        <rect x={26} y={fillTop} width={56} height={innerBottom-fillTop} fill="url(#coffeeFill)"
          style={{transition:"y 1s linear, height 1s linear"}}/>
        {/* Coffee surface highlight ellipse */}
        {fillPct > 0.02 && (
          <ellipse cx={54} cy={fillTop} rx={28} ry={2.5} fill={coffeeTop} opacity={0.85}
            style={{transition:"cy 1s linear"}}/>
        )}
      </g>

      {/* Rim highlight */}
      <line x1={26} y1={36} x2={82} y2={36} stroke={C.accent} strokeOpacity={running?0.7:0.25} strokeWidth={1.2}/>

      {/* Steam wisps */}
      {showSteam && (
        <g style={{transformOrigin:"center"}}>
          <path d="M 40 30 C 42 24, 38 20, 40 14 C 42 8, 38 4, 40 0"
            fill="none" stroke={C.accent} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round"
            style={{animation:"steamRise 2.4s ease-out infinite",transformOrigin:"40px 30px"}}/>
          <path d="M 54 30 C 56 22, 52 18, 54 10 C 56 4, 52 0, 54 -4"
            fill="none" stroke={C.accent} strokeOpacity={0.65} strokeWidth={1.8} strokeLinecap="round"
            style={{animation:"steamRise 2.4s ease-out 0.6s infinite",transformOrigin:"54px 30px"}}/>
          <path d="M 68 30 C 70 24, 66 20, 68 14 C 70 8, 66 4, 68 0"
            fill="none" stroke={C.accent} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round"
            style={{animation:"steamRise 2.4s ease-out 1.2s infinite",transformOrigin:"68px 30px"}}/>
        </g>
      )}

      {/* Time text — centered in mug */}
      <text x={54} y={68} textAnchor="middle" dominantBaseline="middle"
        fill={C.text} fontFamily={MONO} fontSize={15} fontWeight={700}
        style={{textShadow:"0 1px 4px rgba(0,0,0,0.8)"}}>
        {timeText}
      </text>
    </svg>
  );
}

// ─── Kanban drag-and-drop pieces (Trello-style, touch-friendly via @dnd-kit) ──
const TASK_LANES = ["Today", "In Progress", "Keep in Mind"];
const TASK_LANE_COLOR = { "Today": C.accent, "In Progress": C.blue, "Keep in Mind": C.muted };
// Categorize tasks so Work always renders above Personal. Legacy cards with no
// category default to "personal".
const TASK_CATEGORIES = ["work", "personal"];
const TASK_CATEGORY_LABEL = { work: "WORK", personal: "PERSONAL" };
const TASK_CATEGORY_COLOR = { work: C.accent, personal: C.blue };
function taskCategoryOf(card) {
  // Default any un-categorized card to WORK (higher-priority bucket by design).
  return card?.category === "personal" ? "personal" : "work";
}
// Display order: work section first, then personal. Within each category,
// active cards on top, done cards sink to the bottom. Stable — preserves manual
// order (from drag) within each [category, done] group.
function sortTasksForDisplay(cards) {
  return [...cards].sort((a, b) => {
    const ca = taskCategoryOf(a) === "work" ? 0 : 1;
    const cb = taskCategoryOf(b) === "work" ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return (a.done ? 1 : 0) - (b.done ? 1 : 0);
  });
}
// Walk a sorted card list and emit an inline "section header" whenever the
// category changes, so lane rendering can show WORK / PERSONAL dividers.
function groupTasksForRender(cards) {
  const sorted = sortTasksForDisplay(cards);
  const out = [];
  let lastCat = null;
  for (const c of sorted) {
    const cat = taskCategoryOf(c);
    if (cat !== lastCat) {
      out.push({ kind: "header", category: cat, key: "h-" + cat });
      lastCat = cat;
    }
    out.push({ kind: "card", card: c, key: "c-" + c.id });
  }
  return out;
}
// "Wed", "tmrw", "today", "May 30", or "overdue" — used on task date badges.
function taskDueLabel(iso) {
  if (!iso) return "";
  const today = isoDate();
  if (iso === today) return "today";
  const d = new Date(iso + "T12:00:00");
  const todayD = new Date(today + "T12:00:00");
  const diff = Math.round((d - todayD) / 86400000);
  if (diff === 1) return "tmrw";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  if (diff < 0) return "overdue";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The visual content of a task card (shared by the sortable card + drag overlay).
function TaskCardBody({ card, lane, onToggle, onChangeCategory, dragHandleProps, dragging }) {
  const cat = taskCategoryOf(card);
  const catColor = TASK_CATEGORY_COLOR[cat];
  return (
    <div style={{
      background: dragging ? "#222" : "#1a1a1a",
      border: `1px solid ${dragging ? TASK_LANE_COLOR[lane] : C.border2}`,
      borderRadius: 8, padding: "10px", marginBottom: 6,
      display: "flex", alignItems: "flex-start", gap: 8,
      boxShadow: dragging ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
    }}>
      {/* Grip icon — the whole card is draggable now, so this is just a visual affordance. */}
      <span aria-hidden="true" style={{ flexShrink: 0, width: 22, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 15, cursor: "grab", lineHeight: 1, marginTop: 0, pointerEvents: "none" }}>⠿</span>
      {/* Checkbox — Today lane only, and never on recurring templates (they aren't "done-able") */}
      {lane === "Today" && !card.recurrence && (
        <button aria-label="Complete task" onPointerDown={e=>e.stopPropagation()} onClick={e=>{ e.stopPropagation(); if(!card.done){try{if(navigator.vibrate)navigator.vibrate(15);}catch{}} onToggle && onToggle(card.id); }}
          style={{ flexShrink: 0, width: 22, height: 22, padding: 0, background: "transparent", border: "none", cursor: "pointer", marginTop: 1 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: "block" }}>
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill={card.done?C.accent:"transparent"} stroke={card.done?C.accent:C.muted} strokeWidth="2"/>
            {card.done && <path d="M7 12.5 l3.3 3.3 l6.7 -7" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>}
          </svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: card.done?C.muted:C.text, fontFamily: MONO, lineHeight: 1.5, textDecoration: card.done?"line-through":"none", wordBreak: "break-word" }}>{card.text}</div>
        {card.dueDate && (() => {
          const isOverdue = card.dueDate < isoDate();
          const isToday = card.dueDate === isoDate();
          const color = isOverdue ? C.red : isToday ? C.accent : C.muted;
          return <div style={{ fontSize: 10, color, fontFamily: MONO, marginTop: 3, letterSpacing: "0.03em" }}>📅 {taskDueLabel(card.dueDate)}</div>;
        })()}
        {card.recurrence?.kind === "weekly" && (
          <div style={{ fontSize: 10, color: C.blue, fontFamily: MONO, marginTop: 3, letterSpacing: "0.03em" }}>
            🔁 every {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][card.recurrence.weekday]}
          </div>
        )}
      </div>
      {/* Always-visible category chip — one tap to flip work↔personal. */}
      {onChangeCategory ? (
        <button
          onPointerDown={e=>e.stopPropagation()}
          onClick={e=>{ e.stopPropagation(); onChangeCategory(card.id, cat === "work" ? "personal" : "work"); }}
          title={`${TASK_CATEGORY_LABEL[cat]} — tap to change`}
          style={{ flexShrink: 0, alignSelf: "flex-start", background: catColor + "1a", border: `1px solid ${catColor}66`, borderRadius: 6, color: catColor, padding: "2px 6px", fontSize: 9, fontFamily: MONO, cursor: "pointer", letterSpacing: "0.06em", fontWeight: 700, marginTop: 1, lineHeight: 1.4 }}>
          {cat === "work" ? "WORK" : "PERS"}
        </button>
      ) : (
        <span style={{ flexShrink: 0, alignSelf: "flex-start", background: catColor + "1a", border: `1px solid ${catColor}66`, borderRadius: 6, color: catColor, padding: "2px 6px", fontSize: 9, fontFamily: MONO, letterSpacing: "0.06em", fontWeight: 700, marginTop: 1, lineHeight: 1.4 }}>
          {cat === "work" ? "WORK" : "PERS"}
        </span>
      )}
    </div>
  );
}

function SortableTaskCard({ card, lane, onToggle, onOpenMenu, onChangeCategory }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1, cursor: isDragging ? "grabbing" : "grab", touchAction: "manipulation" };
  // Drag listeners on the OUTER card so users can grab anywhere (not just ⠿).
  // Mouse: 5px movement threshold means short clicks still open the menu.
  // Touch: 180ms press-hold delay means scrolls & taps still work.
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={style} onClick={()=>onOpenMenu(card.id, lane)}>
      <TaskCardBody card={card} lane={lane} onToggle={onToggle} onChangeCategory={onChangeCategory} />
    </div>
  );
}

// A lane is a droppable so cards can be dropped into it even when empty.
// minHeight ensures dnd-kit's collision detection still has a real target
// when the lane is empty — otherwise "Keep in Mind" (which often has no cards)
// collapses to ~60px and becomes essentially undroppable.
function TaskLane({ lane, color, itemIds, count, children, footer }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  const isEmpty = (itemIds?.length || 0) === 0;
  return (
    <div ref={setNodeRef} style={{ flex: "1 1 280px", minWidth: 240, minHeight: 340, background: C.card, border: `1px solid ${isOver?color:C.border}`, borderRadius: 12, padding: 14, transition: "border-color 0.15s", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: MONO, letterSpacing: "0.06em" }}>{lane.toUpperCase()}</div>
        <span style={{ fontSize: 11, color: C.dim, fontFamily: MONO }}>{count}</span>
      </div>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {/* Empty-state hint that also visually communicates the drop zone */}
      {isEmpty && (
        <div style={{ flex: 1, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.dim, fontFamily: MONO, textAlign: "center", letterSpacing: "0.03em", padding: "8px 4px", opacity: isOver ? 1 : 0.55 }}>
          {isOver ? "Drop here" : "Drop cards here"}
        </div>
      )}
      {footer}
    </div>
  );
}

// ─── FOCUS TAB ────────────────────────────────────────────────────────────────
function FocusTab({ focusSessions, onAddSession, board, onAddTask, onToggleTask, onMoveTask, onRemoveTask, onReorder, onUpdateTask }) {
  const today = isoDate();
  const [timerMins, setTimerMins] = useState(90);
  const [timerInput, setTimerInput] = useState("90");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionLabel, setSessionLabel] = useState("");
  const [addingLane, setAddingLane] = useState(null); // lane name being added to
  const [newCardText, setNewCardText] = useState("");
  const [newCardDate, setNewCardDate] = useState(""); // optional due date for the new task
  const [newCardCat, setNewCardCat] = useState("personal"); // category picker: work vs personal
  const [timerBig, setTimerBig] = useState(false);   // click coffee cup → nearly full-screen focus mode
  const [menuCard, setMenuCard] = useState(null); // { id, lane } for the move/action sheet
  const [menuDateEdit, setMenuDateEdit] = useState(false); // schedule mode inside the menu
  const [activeId, setActiveId] = useState(null); // card id currently being dragged
  const timerRef = useRef(null);
  const totalSecs = timerMins * 60;
  const remaining = Math.max(totalSecs - elapsed, 0);
  const pct = elapsed / totalSecs;

  useEffect(()=>{
    if(running){ timerRef.current=setInterval(()=>setElapsed(e=>{ if(e>=totalSecs-1){clearInterval(timerRef.current);setRunning(false);return totalSecs;} return e+1; }),1000); }
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[running]);

  function startTimer(){ setElapsed(0); setRunning(true); }
  function stopTimer(){
    setRunning(false);
    const mins = Math.round(elapsed/60);
    if(mins>=5){ onAddSession({id:uid(),date:today,mins,label:sessionLabel||"Deep work"}); }
    setElapsed(0);
  }

  const todayMins = focusSessions.filter(s=>s.date===today).reduce((a,s)=>a+s.mins,0);
  const weekMins  = focusSessions.filter(s=>getWeekDays(0).includes(s.date)).reduce((a,s)=>a+s.mins,0);

  const LANES = TASK_LANES;
  const laneColor = TASK_LANE_COLOR;

  // Local lane→[cardId] ordering that drives the board; synced from the cloud
  // board whenever we're not mid-drag, committed back on drop.
  function laneItemsFromBoard(b) {
    const out = {};
    LANES.forEach(lane => { const col = b?.cols?.find(c=>c.name===lane); out[lane] = col ? col.cards.map(k=>k.id) : []; });
    return out;
  }
  const [laneItems, setLaneItems] = useState(()=>laneItemsFromBoard(board));
  useEffect(()=>{ if(!activeId) setLaneItems(laneItemsFromBoard(board)); }, [board, activeId]);

  const cardById = {};
  (board?.cols||[]).forEach(c=>c.cards.forEach(k=>{ cardById[k.id]=k; }));
  function laneCards(lane) { return (laneItems[lane]||[]).map(id=>cardById[id]).filter(Boolean); }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  function findLane(id) {
    if (LANES.includes(id)) return id;
    return LANES.find(lane => (laneItems[lane]||[]).includes(id));
  }
  function handleDragStart({ active }) { setActiveId(active.id); }
  function handleDragOver({ active, over }) {
    if (!over) return;
    const from = findLane(active.id);
    const to = findLane(over.id);
    if (!from || !to || from === to) return;
    setLaneItems(prev => {
      const fromIds = (prev[from] || []).filter(id => id !== active.id);
      const toIds = [...(prev[to] || [])];
      const overIdx = LANES.includes(over.id) ? toIds.length : toIds.indexOf(over.id);
      toIds.splice(overIdx < 0 ? toIds.length : overIdx, 0, active.id);
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  }
  function handleDragEnd({ active, over }) {
    if (!over) { setActiveId(null); return; }
    const from = findLane(active.id);
    const to = findLane(over.id);
    let next = laneItems;
    if (from && to && from === to) {
      const ids = laneItems[from] || [];
      const oldIndex = ids.indexOf(active.id);
      const newIndex = LANES.includes(over.id) ? ids.length - 1 : ids.indexOf(over.id);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) next = { ...laneItems, [from]: arrayMove(ids, oldIndex, newIndex) };
    }
    setLaneItems(next);
    if (onReorder) onReorder(next);
    setActiveId(null);
  }

  function submitCard(laneName) {
    if (!newCardText.trim()) return;
    onAddTask(laneName, newCardText, newCardDate || null, newCardCat);
    setNewCardText(""); setNewCardDate(""); setNewCardCat("personal"); setAddingLane(null);
  }

  // Coffee mug fill: 1 = full, 0 = empty
  const fillPct = totalSecs > 0 ? Math.max(0, 1 - pct) : 1;

  return (
    <div style={{padding:"16px 16px 80px"}}>

      {/* Timer — clickable coffee cup expands the card to fill most of the
          screen so it becomes the focal point. User can still scroll past to
          reach the task board below. */}
      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: timerBig ? 24 : 20,
        marginBottom: 16,
        position: "relative",
        minHeight: timerBig ? "85vh" : "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: timerBig ? "center" : "flex-start",
        transition: "min-height 0.25s ease, padding 0.25s ease",
      }}>
        {/* Expand / collapse toggle in the top-right */}
        <button onClick={()=>setTimerBig(b=>!b)} title={timerBig?"Shrink timer":"Fill screen"}
          style={{position:"absolute",top:12,right:12,background:"rgba(0,0,0,0.35)",border:`1px solid ${C.border2}`,borderRadius:8,color:C.muted,fontSize:11,cursor:"pointer",padding:"5px 10px",zIndex:2,fontFamily:MONO,lineHeight:1,letterSpacing:"0.05em"}}>
          {timerBig ? "⤡ Shrink" : "⤢ Focus"}
        </button>

        <div style={{display:"flex",flexDirection:timerBig?"column":"row",alignItems:"center",gap:timerBig?28:20}}>
          {/* Coffee mug — click to enter focus mode if compact */}
          <div
            onClick={()=>{ if (!timerBig) setTimerBig(true); }}
            title={timerBig ? "" : "Click to focus"}
            style={{
              position: "relative",
              flexShrink: 0,
              width:  timerBig ? "min(58vh, 480px)" : 120,
              height: timerBig ? "min(58vh, 480px)" : 120,
              cursor: timerBig ? "default" : "pointer",
              transition: "width 0.25s ease, height 0.25s ease",
            }}>
            <CoffeeMug fillPct={fillPct} running={running} timeText={formatTime(remaining)}/>
          </div>

          {/* Controls stack — reflows below the cup in focus mode */}
          <div style={{flex: timerBig?"none":1, width: timerBig?"100%":"auto", maxWidth: timerBig?400:"none"}}>
            <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:8}}>SESSION LENGTH</div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {[30,45,60,90,120].map(m=>(
                <button key={m} style={{background:timerMins===m?C.accent:"#1a1a1a",color:timerMins===m?"#000":C.muted,border:`1px solid ${timerMins===m?"transparent":C.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:MONO}}
                  onClick={()=>{if(!running){setTimerMins(m);setTimerInput(String(m));setElapsed(0);}}}>{m}m</button>
              ))}
            </div>
            <input style={{background:"#161616",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"6px 10px",fontSize:12,fontFamily:MONO,width:60,outline:"none",marginBottom:10}}
              type="number" value={timerInput} onChange={e=>{setTimerInput(e.target.value);if(!running&&parseInt(e.target.value)>0){setTimerMins(parseInt(e.target.value));setElapsed(0);}}}
              placeholder="min"/>
            <input style={{background:"#161616",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"6px 10px",fontSize:12,fontFamily:MONO,width:"100%",outline:"none",boxSizing:"border-box"}}
              placeholder="Session label (optional)" value={sessionLabel} onChange={e=>setSessionLabel(e.target.value)}/>
          </div>
        </div>

        <div style={{display:"flex",gap:8,marginTop:timerBig?24:14, ...(timerBig ? { maxWidth: 400, width: "100%", alignSelf: "center" } : {})}}>
          {!running
            ? <button style={{flex:1,background:C.accent,color:"#000",border:"none",borderRadius:10,padding: timerBig?"16px":"12px",fontSize: timerBig?15:13,fontWeight:700,cursor:"pointer",fontFamily:MONO}} onClick={startTimer}>▶ Start</button>
            : <button style={{flex:1,background:"#161616",border:`1px solid ${C.border}`,borderRadius:10,padding: timerBig?"16px":"12px",fontSize: timerBig?15:13,color:C.text,cursor:"pointer",fontFamily:MONO}} onClick={stopTimer}>◼ Stop + Save</button>
          }
        </div>

        {/* Stats — hidden in focus mode to keep the cup the only real thing on screen */}
        {!timerBig && (
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <div style={{flex:1,background:"#161616",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:700,color:C.blue,fontFamily:MONO}}>{todayMins>0?`${todayMins}m`:"—"}</div>
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:2}}>TODAY</div>
            </div>
            <div style={{flex:1,background:"#161616",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:700,color:C.blue,fontFamily:MONO}}>{weekMins>0?`${Math.round(weekMins/60*10)/10}h`:"—"}</div>
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:2}}>THIS WEEK</div>
            </div>
            <div style={{flex:1,background:"#161616",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:700,color:C.blue,fontFamily:MONO}}>{focusSessions.length}</div>
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:2}}>SESSIONS</div>
            </div>
          </div>
        )}
      </div>

      {/* Recent sessions */}
      {focusSessions.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>RECENT SESSIONS</div>
          {focusSessions.slice(0,4).map(s=>(
            <div key={s.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:13,color:C.text,fontFamily:MONO}}>{s.label}</div><div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:2}}>{s.date}</div></div>
              <div style={{fontSize:13,color:C.blue,fontFamily:MONO,fontWeight:700}}>{s.mins}m</div>
            </div>
          ))}
        </div>
      )}

      {/* Single board — 3 fixed lanes, Trello-style drag + reorder (touch-friendly) */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:10,fontWeight:700}}>TASKS</div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={()=>setActiveId(null)}>
        <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
          {LANES.map(lane=>{
            const lc = laneColor[lane];
            const cards = laneCards(lane);
            const rows = groupTasksForRender(cards);
            const sortedIds = rows.filter(r=>r.kind==="card").map(r=>r.card.id);
            return (
              <TaskLane key={lane} lane={lane} color={lc} itemIds={sortedIds} count={cards.length}
                footer={
                  addingLane===lane
                    ? <div>
                        {/* Category picker — sits above the text so it's the first choice. */}
                        <div style={{display:"flex",gap:4,marginBottom:6}}>
                          {TASK_CATEGORIES.map(cat => (
                            <button key={cat} onClick={()=>setNewCardCat(cat)}
                              style={{flex:1,background:newCardCat===cat?TASK_CATEGORY_COLOR[cat]+"22":"transparent",color:newCardCat===cat?TASK_CATEGORY_COLOR[cat]:C.muted,border:`1px solid ${newCardCat===cat?TASK_CATEGORY_COLOR[cat]:C.border2}`,borderRadius:6,padding:"5px",fontSize:10,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em",fontWeight:newCardCat===cat?700:400}}>
                              {TASK_CATEGORY_LABEL[cat]}
                            </button>
                          ))}
                        </div>
                        <textarea style={{width:"100%",background:"#1a1a1a",border:`1px solid ${lc}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:12,fontFamily:MONO,outline:"none",resize:"none",boxSizing:"border-box",minHeight:56}}
                          autoFocus value={newCardText} onChange={e=>setNewCardText(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submitCard(lane);}if(e.key==="Escape"){setAddingLane(null);setNewCardText("");setNewCardDate("");setNewCardCat("personal");}}}
                          placeholder={lane==="Today" && newCardDate ? `Task for ${taskDueLabel(newCardDate)}…` : "Task…"}/>
                        <input type="date" min={isoDate()} value={newCardDate} onChange={e=>setNewCardDate(e.target.value)}
                          title="Schedule for a future day (blank = no date)"
                          style={{width:"100%",marginTop:6,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:6,color:newCardDate?lc:C.muted,padding:"6px 8px",fontSize:11,fontFamily:MONO,outline:"none",colorScheme:"dark",boxSizing:"border-box"}}/>
                        <div style={{display:"flex",gap:6,marginTop:6}}>
                          <button style={{flex:1,background:lc,color:"#000",border:"none",borderRadius:6,padding:"6px",fontSize:11,cursor:"pointer",fontFamily:MONO,fontWeight:700}} onClick={()=>submitCard(lane)}>Add</button>
                          <button style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:11,color:C.muted,cursor:"pointer",fontFamily:MONO}} onClick={()=>{setAddingLane(null);setNewCardText("");setNewCardDate("");setNewCardCat("personal");}}>Cancel</button>
                        </div>
                      </div>
                    : <button style={{width:"100%",background:"transparent",border:`1px dashed ${C.border2}`,borderRadius:8,padding:"7px",fontSize:11,color:C.dim,cursor:"pointer",fontFamily:MONO,marginTop:2}}
                        onClick={()=>{setAddingLane(lane);setNewCardText("");setNewCardDate("");setNewCardCat("personal");}}>+ Add task</button>
                }>
                {rows.map(row => row.kind === "header" ? (
                  <div key={row.key} style={{fontSize:9,color:TASK_CATEGORY_COLOR[row.category],fontFamily:MONO,letterSpacing:"0.14em",fontWeight:700,margin:"10px 0 4px 4px",paddingBottom:3,borderBottom:`1px solid ${TASK_CATEGORY_COLOR[row.category]}33`}}>
                    {TASK_CATEGORY_LABEL[row.category]}
                  </div>
                ) : (
                  <SortableTaskCard key={row.key} card={row.card} lane={lane} onToggle={onToggleTask} onOpenMenu={(id,ln)=>setMenuCard({id,lane:ln})}
                    onChangeCategory={onUpdateTask ? (id, next) => onUpdateTask(id, { category: next }) : null} />
                ))}
              </TaskLane>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeId && cardById[activeId] ? <div style={{width:206}}><TaskCardBody card={cardById[activeId]} lane={findLane(activeId)} dragging /></div> : null}
        </DragOverlay>
      </DndContext>
      <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:8,lineHeight:1.5}}>Click-and-drag any card to reorder or move between lanes (press-and-hold on mobile). Tap a card for more options. Today tasks show on your Home checklist.</div>

      {/* Card action sheet (move / complete / delete) */}
      {menuCard && (() => {
        const card = board?.cols?.flatMap(c=>c.cards).find(k=>k.id===menuCard.id);
        if (!card) { return null; }
        return (
          <div onClick={()=>setMenuCard(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:160,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:"18px 18px 0 0",padding:"16px 16px calc(20px + env(safe-area-inset-bottom))"}}>
              {/* Editable card text — commit on blur or Enter (Shift+Enter for newline) */}
              <textarea defaultValue={card.text} rows={2} onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); e.target.blur(); } }}
                onBlur={e=>{ const next = e.target.value.trim(); if(onUpdateTask && next && next !== card.text) onUpdateTask(menuCard.id, { text: next }); }}
                style={{width:"100%",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:13,fontFamily:MONO,lineHeight:1.5,padding:"10px 12px",outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:8}}/>
              {card.dueDate && (
                <div style={{fontSize:11,color:card.dueDate<isoDate()?C.red:card.dueDate===isoDate()?C.accent:C.muted,fontFamily:MONO,marginBottom:8}}>📅 {taskDueLabel(card.dueDate)} <span style={{color:C.dim}}>· {card.dueDate}</span></div>
              )}
              <div style={{paddingBottom:12,marginBottom:14,borderBottom:`1px solid ${C.border}`}}/>

              {/* Category */}
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:8}}>CATEGORY</div>
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                {TASK_CATEGORIES.map(cat => {
                  const active = taskCategoryOf(card) === cat;
                  return (
                    <button key={cat} onClick={()=>{ if (onUpdateTask) onUpdateTask(menuCard.id, { category: cat }); }}
                      style={{flex:1,background:active?TASK_CATEGORY_COLOR[cat]+"22":"transparent",border:`1px solid ${active?TASK_CATEGORY_COLOR[cat]:C.border}`,borderRadius:8,color:active?TASK_CATEGORY_COLOR[cat]:C.text,padding:"11px",fontSize:12,fontFamily:MONO,cursor:"pointer",fontWeight:active?700:400,letterSpacing:"0.05em"}}>
                      {TASK_CATEGORY_LABEL[cat]}
                    </button>
                  );
                })}
              </div>

              {/* Schedule */}
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:8}}>SCHEDULE</div>
              <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
                <input type="date" min={isoDate()} value={card.dueDate || ""}
                  onChange={e=>{ if (onUpdateTask) onUpdateTask(menuCard.id, { dueDate: e.target.value || null }); }}
                  style={{flex:1,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:card.dueDate?C.accent:C.muted,padding:"10px 12px",fontSize:13,fontFamily:MONO,outline:"none",colorScheme:"dark"}}/>
                {card.dueDate && (
                  <button onClick={()=>{ if (onUpdateTask) onUpdateTask(menuCard.id, { dueDate: null }); }}
                    style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"10px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO}}>Clear</button>
                )}
              </div>

              {/* Recurring — turns this card into a weekly template that spawns
                  a fresh instance into Today whenever the chosen weekday hits. */}
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:8}}>REPEATS</div>
              <select value={card.recurrence?.weekday ?? ""}
                onChange={e=>{
                  if (!onUpdateTask) return;
                  const v = e.target.value;
                  if (v === "") onUpdateTask(menuCard.id, { recurrence: null });
                  else onUpdateTask(menuCard.id, { recurrence: { kind: "weekly", weekday: parseInt(v) } });
                }}
                style={{width:"100%",background:"#161616",border:`1px solid ${card.recurrence?C.blue:C.border2}`,borderRadius:8,color:card.recurrence?C.blue:C.text,padding:"10px 12px",fontSize:13,fontFamily:MONO,outline:"none",colorScheme:"dark",marginBottom:14}}>
                <option value="">Doesn't repeat</option>
                <option value="1">Every Monday</option>
                <option value="2">Every Tuesday</option>
                <option value="3">Every Wednesday</option>
                <option value="4">Every Thursday</option>
                <option value="5">Every Friday</option>
                <option value="6">Every Saturday</option>
                <option value="0">Every Sunday</option>
              </select>

              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:8}}>MOVE TO</div>
              {LANES.map(lane=>(
                <button key={lane} disabled={lane===menuCard.lane} onClick={()=>{onMoveTask(menuCard.id,lane);setMenuCard(null);}}
                  style={{width:"100%",textAlign:"left",background:lane===menuCard.lane?"#161616":"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:lane===menuCard.lane?C.dim:C.text,padding:"11px 14px",fontSize:13,fontFamily:MONO,cursor:lane===menuCard.lane?"default":"pointer",marginBottom:6}}>
                  {lane}{lane===menuCard.lane?"  (current)":""}
                </button>
              ))}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                {menuCard.lane==="Today" && (
                  <button onClick={()=>{onToggleTask(menuCard.id);setMenuCard(null);}} style={{flex:1,background:"transparent",border:`1px solid ${C.accent}55`,borderRadius:8,color:C.accent,padding:"11px",fontSize:12,cursor:"pointer",fontFamily:MONO}}>{card.done?"Mark not done":"Complete"}</button>
                )}
                <button onClick={()=>{onRemoveTask(menuCard.id);setMenuCard(null);}} style={{flex:1,background:"transparent",border:`1px solid ${C.red}55`,borderRadius:8,color:C.red,padding:"11px",fontSize:12,cursor:"pointer",fontFamily:MONO}}>Delete</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── TRENDS TAB ───────────────────────────────────────────────────────────────
function TrendsTab({ history, dietLog, activeLog, zone2Log = [], focusSessions = [], bodyweight = {}, goals = [], goalLogs = [], goalSnapshots = [], customExercises = {} }) {
  const today = isoDate();
  const WEEKS_BACK = 8;
  const HEATMAP_WEEKS = 12;

  const weeks = Array.from({length:WEEKS_BACK},(_,i)=>{
    const days = getWeekDays(-(WEEKS_BACK-1-i));
    const ws = new Date(days[0]+"T12:00:00");
    return { days, label: ws.toLocaleDateString("en-US",{month:"short",day:"numeric"}) };
  });
  const wkSet = workoutDateSet(history);

  // Per-week aggregate metrics
  const metrics = weeks.map(({days, label}) => {
    const wkDays = new Set(days);
    const workoutDays = new Set();
    for (const w of history) { const d = isoDate(new Date(w.date)); if (wkDays.has(d)) workoutDays.add(d); }
    return {
      label, days,
      workouts: workoutDays.size,
      dg: days.filter(d=>dietLog[d]==="green").length,
      ag: days.filter(d=>activeLog[d]==="green").length,
      z2: zone2Log.filter(z=>wkDays.has(z.date)).reduce((a,z)=>a+(z.minutes||0),0),
      fm: focusSessions.filter(s=>wkDays.has(s.date)).reduce((a,s)=>a+(s.mins||0),0),
    };
  });

  // Active normalized goals; weekly goal-hit % derived from computeGoalProgress
  const goalListNorm = (Array.isArray(goals)?goals:[]).map(normalizeGoal).filter(g=>g.active!==false);
  const weeklyGoalPct = weeks.map(({days})=>{
    if (goalListNorm.length === 0) return 0;
    const ctx = { history, dietLog, activeLog, zone2Log, goalLogs, weekDays: days, customExercises };
    const hit = goalListNorm.filter(g => computeGoalProgress(g, ctx).hit).length;
    return Math.round((hit / goalListNorm.length) * 100);
  });
  const targetByKind = {};
  goalListNorm.forEach(g => { if (targetByKind[g.kind] == null) targetByKind[g.kind] = g.target; });

  // Body weight series — last 90 days, indexed by day-offset
  const bwSeries = (() => {
    const out = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = isoDate(d);
      out.push({ date: iso, w: bodyweight[iso] != null ? Number(bodyweight[iso]) : null });
    }
    return out;
  })();
  const wtLogged = bwSeries.map((p,i)=>({...p,i})).filter(p=>p.w!=null);
  const wtCurrent = wtLogged.length ? wtLogged[wtLogged.length-1].w : null;
  const wt30Ref = (() => {
    for (let i = 60; i < bwSeries.length; i++) if (bwSeries[i].w != null) return bwSeries[i].w;
    return null;
  })();
  const wt90Ref = wtLogged.length ? wtLogged[0].w : null;
  const wt30Delta = wtCurrent != null && wt30Ref != null ? +(wtCurrent - wt30Ref).toFixed(1) : null;
  const wt90Delta = wtCurrent != null && wt90Ref != null ? +(wtCurrent - wt90Ref).toFixed(1) : null;

  // Body weight chart SVG (compact line chart)
  let wtSvg = null;
  if (wtLogged.length >= 1) {
    const pad = { l: 34, r: 10, t: 12, b: 22 };
    const W = 320, H = 140;
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const wMin = Math.min(...wtLogged.map(p=>p.w));
    const wMax = Math.max(...wtLogged.map(p=>p.w));
    const range = Math.max(wMax - wMin, 2);
    const yLo = wMin - range * 0.15;
    const yHi = wMax + range * 0.15;
    const xFor = (i) => pad.l + (i/89)*innerW;
    const yFor = (w) => pad.t + (1 - (w - yLo)/(yHi - yLo)) * innerH;
    const pointsStr = wtLogged.map(p=>`${xFor(p.i).toFixed(1)},${yFor(p.w).toFixed(1)}`).join(" ");
    const ticks = [yHi, (yHi+yLo)/2, yLo];
    wtSvg = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:"block"}}>
        {ticks.map((v,idx)=>{
          const y = yFor(v);
          return <Fragment key={idx}>
            <line x1={pad.l} x2={W-pad.r} y1={y} y2={y} stroke={C.border} strokeDasharray="2 3"/>
            <text x={pad.l-5} y={y+3} textAnchor="end" fontSize="9" fill={C.muted} fontFamily={MONO}>{v.toFixed(0)}</text>
          </Fragment>;
        })}
        <text x={pad.l} y={H-6} fontSize="9" fill={C.dim} fontFamily={MONO}>90d ago</text>
        <text x={W-pad.r} y={H-6} fontSize="9" fill={C.dim} fontFamily={MONO} textAnchor="end">Today</text>
        {wtLogged.length>=2 && <polyline points={pointsStr} fill="none" stroke={C.blue} strokeWidth="2" strokeLinejoin="round"/>}
        {wtLogged.map((p,idx)=><circle key={idx} cx={xFor(p.i)} cy={yFor(p.w)} r="2.4" fill={C.blue}/>)}
      </svg>
    );
  }

  // Earliest day with ANY logged data across all sources — heatmap starts here
  // so we don't fake red on pre-app-usage days.
  const firstDataDay = (() => {
    const dates = [];
    history.forEach(w => dates.push(isoDate(new Date(w.date))));
    Object.keys(dietLog || {}).forEach(d => dates.push(d));
    Object.keys(activeLog || {}).forEach(d => dates.push(d));
    zone2Log.forEach(z => dates.push(z.date));
    goalLogs.forEach(l => dates.push(l.date));
    Object.keys(bodyweight || {}).forEach(d => dates.push(d));
    if (dates.length === 0) return null;
    dates.sort();
    return dates[0];
  })();
  function mondayOf(iso) {
    const d = new Date(iso + "T12:00:00");
    const monOffset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - monOffset);
    return isoDate(d);
  }
  // Heatmap weeks: from the Monday containing your first-ever data day through
  // the current week. No fixed length — the chart grows with your history.
  const heatmapWeeks = (() => {
    if (!firstDataDay) return [getWeekDays(0)];
    const startMonday = mondayOf(firstDataDay);
    const endMonday = mondayOf(isoDate());
    const weeks = [];
    const cursor = new Date(startMonday + "T12:00:00");
    const stop = new Date(endMonday + "T12:00:00");
    while (cursor <= stop) {
      const wk = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + i);
        wk.push(isoDate(d));
      }
      weeks.push(wk);
      cursor.setDate(cursor.getDate() + 7);
    }
    return weeks;
  })();

  // Trailing 7 days ending on d (inclusive). Used for the "were the past 7
  // days on track" heatmap score.
  function trailing7(d) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(d + "T12:00:00");
      dt.setDate(dt.getDate() - i);
      out.push(isoDate(dt));
    }
    return out;
  }
  function anyDataInWindow(days) {
    return days.some(dw => {
      if (dietLog[dw] || activeLog[dw]) return true;
      if (wkSet.has(dw)) return true;
      if (zone2Log.some(z => z.date === dw)) return true;
      if (goalLogs.some(l => l.date === dw)) return true;
      return false;
    });
  }
  // Which goal list was ACTIVE on this day? Uses timestamped snapshots so
  // changing goals now doesn't rewrite past cells. Snapshots is [{snapshot_at, goals}]
  // ordered ascending. Fallback to current goals when no snapshot covers the day.
  function goalsAsOf(d) {
    const snaps = Array.isArray(goalSnapshots) ? goalSnapshots : [];
    if (snaps.length === 0) return goalListNorm;
    const endOfDay = new Date(d + "T23:59:59.999").toISOString();
    let picked = null;
    for (const s of snaps) if (s.snapshot_at <= endOfDay) picked = s;
    // Before the earliest snapshot, use the earliest one (best proxy — a day
    // before we tracked history probably had the same goals as when we started).
    if (!picked) picked = snaps[0];
    return (Array.isArray(picked.goals) ? picked.goals : []).map(normalizeGoal).filter(g => g.active !== false);
  }
  // Returns -1 future, -2 no goals, -3 no data in the trailing week, or 0–100.
  // The score is % of ACTIVE-AT-THAT-TIME weekly goals that were hit over
  // the 7 days ending on d.
  function dayPct(d) {
    if (d > today) return -1;
    const activeGoals = goalsAsOf(d);
    if (activeGoals.length === 0) return -2;
    const weekDays = trailing7(d);
    if (!anyDataInWindow(weekDays)) return -3;
    const ctx = { history, dietLog, activeLog, zone2Log, goalLogs, weekDays, customExercises };
    const hit = activeGoals.reduce((n, g) => n + (computeGoalProgress(g, ctx).hit ? 1 : 0), 0);
    return Math.round((hit / activeGoals.length) * 100);
  }
  // A day is "hidden" (blank, no border) if it's future, before your first
  // logged day, or fell in a trailing week with no data at all.
  function isDayHidden(d, v) {
    if (v === -1 || v === -3) return true;
    if (firstDataDay && d < firstDataDay) return true;
    return false;
  }
  // Andrew's spec: 0–30 red, gradient up, 80+ green, 90+ good green, 100 deep green.
  function cellColor(v) {
    if (v === -2) return C.border;    // no goals set
    if (v >= 100) return "#14a34a";   // perfect — deep saturated green
    if (v >= 90)  return "#22c55e";   // 90–99 — good green
    if (v >= 80)  return "#4ade80";   // 80–89 — green (still solid)
    if (v >= 70)  return "#86efac";   // 70–79 — light green
    if (v >= 50)  return "#fbbf24";   // 50–69 — amber
    if (v >= 30)  return "#f87171";   // 30–49 — soft red
    return "#dc2626";                 // 0–29 — aggressive red
  }
  function cellTitle(v, d) {
    if (firstDataDay && d < firstDataDay) return `${d} · before you started`;
    if (v === -1) return `${d} · future`;
    if (v === -2) return `${d} · no goals set`;
    if (v === -3) return `${d} · no data`;
    return `${d} · ${v}% of weekly goals hit`;
  }

  // Per-week bar chart card (reused for every metric)
  function MiniBars({ label, values, max, color, goalLine, format }) {
    const m = Math.max(max || 1, ...values, 1);
    const lastVal = values[values.length-1];
    const fmt = format || (v => v);
    const H = 48;
    return (
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",fontWeight:700}}>{label}</div>
          <div style={{fontSize:11,color:C.sub,fontFamily:MONO}}>{fmt(lastVal)} <span style={{color:C.dim}}>this wk</span></div>
        </div>
        <div style={{position:"relative",display:"flex",alignItems:"flex-end",gap:4,height:H}}>
          {values.map((v,i)=>{
            const h = Math.max((v/m)*(H-6), v>0?4:2);
            const hit = goalLine != null ? v >= goalLine : v > 0;
            return <div key={i} style={{flex:1,height:h,background:hit?color:v>0?C.border2:C.border,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}} title={`${weeks[i].label}: ${fmt(v)}`}/>;
          })}
          {goalLine != null && goalLine > 0 && goalLine <= m && (
            <div style={{position:"absolute",left:0,right:0,bottom:`${(goalLine/m)*(H-6)}px`,borderTop:`1px dashed ${color}66`,pointerEvents:"none"}}/>
          )}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>{weeks[0].label}</span>
          <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>Now</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{padding:"16px 16px 80px"}}>
      {/* Header */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4}}>OVER TIME</div>
        <div style={{fontSize:22,fontWeight:700,color:C.text,fontFamily:MONO,lineHeight:1.1}}>Trends</div>
        <div style={{fontSize:11,color:C.dim,fontFamily:MONO,marginTop:6,lineHeight:1.5}}>How you're trending across the last 8–12 weeks. Body weight comes from the Iron tab's Past days calendar.</div>
      </div>

      {/* Consistency heatmap — daily % of weekly goals hit, most-recent first,
          grouped by month. Grows from your first-ever logged day. */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>CONSISTENCY</div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:16}}>
        <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginBottom:12,lineHeight:1.5}}>Each square shows the % of your weekly goals hit over the 7 days ending on that day. Most recent week is at the top. Cells before you started using the app are hidden.</div>
        {/* Day-of-week header (always visible) */}
        <div style={{display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",gap:4,marginBottom:6}}>
          <div/>
          {["M","T","W","T","F","S","S"].map((l,i)=><div key={i} style={{textAlign:"center",fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.05em",fontWeight:700}}>{l}</div>)}
        </div>
        {/* Weeks — reversed so newest is on top, grouped by month with a header */}
        {(() => {
          const displayWeeks = [...heatmapWeeks].reverse();
          const rows = [];
          let prevMonthKey = null;
          const thisYear = new Date().getFullYear();
          displayWeeks.forEach((wk, wi) => {
            const mondayD = new Date(wk[0] + "T12:00:00");
            const monthKey = `${mondayD.getFullYear()}-${mondayD.getMonth()}`;
            if (monthKey !== prevMonthKey) {
              const label = mondayD.toLocaleDateString("en-US", mondayD.getFullYear() === thisYear ? { month: "long" } : { month: "long", year: "numeric" });
              rows.push({ kind: "monthHeader", label, key: monthKey });
              prevMonthKey = monthKey;
            }
            rows.push({ kind: "week", days: wk, wi });
          });
          return rows.map(row => {
            if (row.kind === "monthHeader") {
              return (
                <div key={"m-"+row.key} style={{fontSize:11,fontWeight:700,color:C.accent,fontFamily:MONO,letterSpacing:"0.08em",margin:"12px 0 6px 0",paddingBottom:4,borderBottom:`1px solid ${C.border}`}}>{row.label.toUpperCase()}</div>
              );
            }
            const wk = row.days;
            return (
              <div key={"w-"+row.wi} style={{display:"grid",gridTemplateColumns:"48px repeat(7, 1fr)",gap:4,marginBottom:4,alignItems:"center"}}>
                <div style={{fontSize:9,color:C.dim,fontFamily:MONO,textAlign:"right",paddingRight:6}}>{new Date(wk[0]+"T12:00:00").toLocaleDateString("en-US",{month:"numeric",day:"numeric"})}</div>
                {wk.map((d, di) => {
                  const v = dayPct(d);
                  const isToday = d === today;
                  const hidden = isDayHidden(d, v);
                  return (
                    <div key={d+di} title={cellTitle(v,d)}
                      style={{
                        aspectRatio:"1/1",
                        borderRadius:3,
                        background: hidden ? "transparent" : cellColor(v),
                        border: hidden ? "1px solid transparent" : (isToday ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`),
                        minHeight:14,
                      }}/>
                  );
                })}
              </div>
            );
          });
        })()}
        <div style={{display:"flex",gap:10,marginTop:12,fontSize:9,color:C.muted,fontFamily:MONO,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#14a34a",borderRadius:2,display:"inline-block"}}/>100%</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#22c55e",borderRadius:2,display:"inline-block"}}/>90+</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#4ade80",borderRadius:2,display:"inline-block"}}/>80+</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#86efac",borderRadius:2,display:"inline-block"}}/>70+</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#fbbf24",borderRadius:2,display:"inline-block"}}/>50+</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#f87171",borderRadius:2,display:"inline-block"}}/>30+</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:"#dc2626",borderRadius:2,display:"inline-block"}}/>&lt;30</span>
        </div>
      </div>

      {/* Body weight */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",fontWeight:700}}>BODY WEIGHT</div>
          <div style={{fontSize:10,color:C.muted,fontFamily:MONO}}>last 90 days</div>
        </div>
        {wtCurrent != null ? (
          <>
            <div style={{display:"flex",alignItems:"baseline",gap:14,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{fontSize:28,fontWeight:700,color:C.blue,fontFamily:MONO,lineHeight:1}}>{wtCurrent}<span style={{fontSize:13,color:C.muted,fontWeight:400}}> lbs</span></div>
              {wt30Delta != null && (
                <div style={{fontSize:11,color:wt30Delta>0?C.red:wt30Delta<0?C.green:C.muted,fontFamily:MONO}}>
                  {wt30Delta>0?"+":""}{wt30Delta} <span style={{color:C.dim}}>30d</span>
                </div>
              )}
              {wt90Delta != null && wt90Delta !== wt30Delta && (
                <div style={{fontSize:11,color:wt90Delta>0?C.red:wt90Delta<0?C.green:C.muted,fontFamily:MONO}}>
                  {wt90Delta>0?"+":""}{wt90Delta} <span style={{color:C.dim}}>90d</span>
                </div>
              )}
            </div>
            {wtSvg}
          </>
        ) : (
          <div style={{fontSize:11,color:C.muted,fontFamily:MONO,padding:"18px 0",textAlign:"center",lineHeight:1.5}}>
            Log your weight on the Iron tab's Past days calendar to see the curve.
          </div>
        )}
      </div>

      {/* 8-week trends */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>8-WEEK TRENDS</div>
      <MiniBars label="WORKOUT DAYS / WEEK" values={metrics.map(m=>m.workouts)} max={7}  color={C.accent} goalLine={targetByKind.workouts}/>
      <MiniBars label="CLEAN DIET DAYS"     values={metrics.map(m=>m.dg)}        max={7}  color={C.green}  goalLine={targetByKind.diet_green}/>
      <MiniBars label="ACTIVE DAYS"         values={metrics.map(m=>m.ag)}        max={7}  color={C.green}  goalLine={targetByKind.active_green}/>
      <MiniBars label="ZONE 2 / WEEK"       values={metrics.map(m=>m.z2)}        max={Math.max(60,  ...metrics.map(m=>m.z2))} color={C.blue} goalLine={targetByKind.zone2}  format={v=>v?`${v}m`:"—"}/>
      <MiniBars label="FOCUS HOURS / WEEK"  values={metrics.map(m=>m.fm)}        max={Math.max(120, ...metrics.map(m=>m.fm))} color={C.blue} format={v=>v?`${Math.round(v/60*10)/10}h`:"—"}/>
      <MiniBars label="GOAL HIT %"          values={weeklyGoalPct}                max={100} color={C.accent} format={v=>`${v}%`}/>

      {/* Per-goal weekly history */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginTop:18,marginBottom:8,fontWeight:700}}>PER-GOAL HISTORY</div>
      {goalListNorm.length === 0 ? (
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12}}>
          Set goals in Settings → Manage goals to see per-goal history.
        </div>
      ) : (
        goalListNorm.map(goal => {
          const series = weeks.map(({days})=>computeGoalProgress(goal, {history,dietLog,activeLog,zone2Log,goalLogs,weekDays:days,customExercises}));
          const m = Math.max(...series.map(p=>p.target||1), ...series.map(p=>p.got), 1);
          const weeksHit = series.filter(p=>p.hit).length;
          return (
            <div key={goal.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8,gap:8}}>
                <div style={{fontSize:12,color:C.text,fontFamily:MONO,display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                  <span style={{fontSize:14}}>{goal.emoji}</span>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{goal.label || goal.group || goal.kind}</span>
                </div>
                <span style={{fontSize:10,color:weeksHit===series.length?C.green:C.muted,fontFamily:MONO,flexShrink:0}}>
                  {weeksHit}/{series.length} wks hit
                </span>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:4,height:34}}>
                {series.map((p,i)=>{
                  const h = Math.max((p.got/m)*30, p.got>0?3:1.5);
                  const over = goal.kind==="diet_red" && p.got>p.target;
                  const color = p.hit ? goal.color : (over ? C.red : C.border2);
                  return <div key={i} style={{flex:1,height:h,background:p.got>0?color:C.border,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}} title={`${weeks[i].label}: ${p.got}/${p.target}${p.unit||""}`}/>;
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── LOG TAB ──────────────────────────────────────────────────────────────────
function LogTab({ history, dietLog, activeLog, zone2Log = [], goals = [], goalLogs = [], bodyweight = {}, onUpdateDiet, onUpdateActive, onAddZone2, onRemoveZone2, onToggleGoal, onSetGoalMinutes, onSetBodyweight, onStartBackfill, onOpenEdit }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = isoDate();
  // Order most-recent first: today on top, then yesterday, etc.
  // Future days (if any in the current week) drop to the bottom.
  const rawDays = getWeekDays(weekOffset);
  const days = [
    ...rawDays.filter(d => d <= today).sort((a, b) => b.localeCompare(a)),
    ...rawDays.filter(d => d >  today).sort((a, b) => a.localeCompare(b)),
  ];
  const labelOfDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
  const [z2Adding, setZ2Adding] = useState(null); // date being added to
  const [z2Mins, setZ2Mins] = useState("");
  const [z2Label, setZ2Label] = useState("");
  const [gEdit, setGEdit] = useState(null);  // "goalId|date" of the timed goal being edited
  const [gVal, setGVal] = useState("");
  const [bwEdit, setBwEdit] = useState(null); // date currently being edited
  const [bwVal, setBwVal] = useState("");
  function submitBw(d) { if (onSetBodyweight) onSetBodyweight(d, parseFloat(bwVal)); setBwEdit(null); setBwVal(""); }

  // Generic habit + timed goals (the goal_logs-backed ones) that can be backfilled here.
  const habitGoals = (Array.isArray(goals) ? goals : []).map(normalizeGoal)
    .filter(g => g.active !== false && (g.kind === "habit" || g.kind === "timed"));

  // Index workouts + zone2 by date
  const wkByDate = {};
  history.forEach((w, idx) => {
    const d = isoDate(new Date(w.date));
    if (!wkByDate[d]) wkByDate[d] = [];
    wkByDate[d].push({ w, idx });
  });
  const z2ByDate = {};
  zone2Log.forEach(z => { (z2ByDate[z.date] ||= []).push(z); });

  function totalVol(exs){return exs.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);}
  function submitZone2(d) {
    const m = parseInt(z2Mins);
    if (!m || m <= 0) return;
    onAddZone2(d, m, z2Label.trim() || "Zone 2");
    setZ2Mins(""); setZ2Label(""); setZ2Adding(null);
  }
  function goalMins(goalId, d) { return goalLogs.find(l => l.goal_id===goalId && l.date===d)?.value || 0; }
  function goalDone(goalId, d) { return goalLogs.some(l => l.goal_id===goalId && l.date===d && l.completed); }
  function submitGoalMins(goalId, d) { if (onSetGoalMinutes) onSetGoalMinutes(goalId, parseInt(gVal)||0, d); setGEdit(null); setGVal(""); }

  return (
    <div style={{padding:"16px 16px 80px"}}>
      {/* Header */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4}}>LOG / EDIT</div>
        <div style={{fontSize:22,fontWeight:700,color:C.text,fontFamily:MONO,lineHeight:1.1}}>Past days</div>
        <div style={{fontSize:11,color:C.dim,fontFamily:MONO,marginTop:6,lineHeight:1.5}}>
          Set or change diet, activity, body weight, workouts, and your habits for any day. Use the arrows to look at older weeks.
        </div>
      </div>

      {/* Week nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px"}}>
        <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO}}
          onClick={()=>setWeekOffset(o=>o-1)}>‹ Prev</button>
        <span style={{fontSize:12,color:C.sub,fontFamily:MONO}}>
          {weekOffset===0?"This week":weekOffset===-1?"Last week":`${Math.abs(weekOffset)} weeks ago`}
        </span>
        <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO,opacity:weekOffset>=0?0.3:1}}
          onClick={()=>weekOffset<0&&setWeekOffset(o=>o+1)}>Next ›</button>
      </div>

      {/* Day cards */}
      {days.map((d, i) => {
        const isFuture = d > today;
        const isToday = d === today;
        const diet = dietLog[d];
        const active = activeLog[d];
        const wks = wkByDate[d] || [];
        return (
          <div key={d} style={{
            background: isToday ? C.card : C.card,
            border: `1px solid ${isToday ? C.accent + "55" : C.border}`,
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
            opacity: isFuture ? 0.4 : 1,
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:isToday?C.accent:C.text,fontFamily:MONO,letterSpacing:"0.05em"}}>
                  {labelOfDate(d)}{isToday ? " · TODAY" : ""}
                </div>
                <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:2}}>
                  {new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                </div>
              </div>
              {!isFuture && (
                <div style={{display:"flex",gap:6}}>
                  {diet && <span style={{fontSize:14}}>{DIET_CONFIG[diet].emoji}</span>}
                  {active && <span style={{fontSize:14}}>{ACTIVE_CONFIG[active].emoji}</span>}
                  {wks.length > 0 && <span style={{fontSize:11,color:C.accent,fontFamily:MONO,fontWeight:700}}>{wks.length}▶</span>}
                </div>
              )}
            </div>

            {!isFuture && (
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:5,letterSpacing:"0.08em"}}>DIET</div>
                    <TrafficLight config={DIET_CONFIG} value={diet} onChange={v=>onUpdateDiet(d,v)} size="sm"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:5,letterSpacing:"0.08em"}}>ACTIVITY</div>
                    <TrafficLight config={ACTIVE_CONFIG} value={active} onChange={v=>onUpdateActive(d,v)} size="sm"/>
                  </div>
                </div>

                {/* Body weight (one entry per day, lbs) */}
                {(() => {
                  const bw = bodyweight[d];
                  const editing = bwEdit === d;
                  return (
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#161616",border:`1px solid ${bw?C.blue+"55":C.border2}`,borderRadius:8,padding:"8px 10px",marginBottom:12,gap:8}}>
                      <span style={{fontSize:12,color:C.text,fontFamily:MONO,display:"flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:14}}>⚖</span>
                        <span>Body weight</span>
                      </span>
                      {editing ? (
                        <span style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                          <input autoFocus type="number" inputMode="decimal" step="0.1" value={bwVal} placeholder="lbs"
                            onChange={e=>setBwVal(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter") submitBw(d); if(e.key==="Escape"){setBwEdit(null);setBwVal("");} }}
                            style={{width:70,background:"#1a1a1a",border:`1px solid ${C.blue}`,borderRadius:8,color:C.text,padding:"7px 6px",fontSize:13,fontFamily:MONO,textAlign:"center",outline:"none"}}/>
                          <button onClick={()=>submitBw(d)} style={{background:C.blue,color:"#000",border:"none",borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>Save</button>
                          <button onClick={()=>{setBwEdit(null);setBwVal("");}} style={{background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:MONO}}>✕</button>
                        </span>
                      ) : (
                        <button onClick={()=>{setBwEdit(d);setBwVal(bw?String(bw):"");}} style={{flexShrink:0,background:"transparent",border:`1px solid ${bw?C.blue:C.border2}`,borderRadius:8,color:bw?C.blue:C.sub,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
                          {bw ? `${bw} lbs` : "+ lbs"}
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:6,letterSpacing:"0.08em"}}>WORKOUTS</div>
                {wks.map(({w, idx})=>(
                  <button key={idx} onClick={()=>onOpenEdit(idx)} style={{
                    width:"100%", background:"#161616", border:`1px solid ${C.border2}`, borderRadius:8,
                    padding:"8px 10px", marginBottom:6, cursor:"pointer", textAlign:"left",
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    color:"inherit", font:"inherit",
                  }}>
                    <div>
                      <div style={{fontSize:12,color:C.text,fontFamily:MONO}}>{w.name}</div>
                      <div style={{fontSize:10,color:"#777",fontFamily:MONO,marginTop:2}}>
                        {w.exercises.length} ex · {formatDuration(w.elapsed)} · {totalVol(w.exercises).toLocaleString()} lbs
                      </div>
                    </div>
                    <span style={{fontSize:14,color:C.dim}}>›</span>
                  </button>
                ))}
                <button onClick={()=>onStartBackfill(d)} style={{
                  width:"100%", background:"transparent", border:`1px dashed ${C.border2}`,
                  borderRadius:8, color:C.dim, padding:"8px", fontSize:11, cursor:"pointer",
                  fontFamily:MONO,
                }}>+ Log workout on this day</button>

                {/* Zone 2 cardio log */}
                <div style={{fontSize:9,color:C.muted,fontFamily:MONO,margin:"12px 0 6px",letterSpacing:"0.08em"}}>ZONE 2 CARDIO</div>
                {(z2ByDate[d] || []).map(z => (
                  <div key={z.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,padding:"7px 10px",marginBottom:6}}>
                    <span style={{fontSize:12,color:C.text,fontFamily:MONO}}>🫀 {z.label}</span>
                    <span style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,color:C.blue,fontFamily:MONO,fontWeight:700}}>{z.minutes} min</span>
                      <button title="Remove" onClick={()=>onRemoveZone2(z.id)} style={{background:"transparent",border:"none",color:"#777",fontSize:12,cursor:"pointer"}}>✕</button>
                    </span>
                  </div>
                ))}
                {z2Adding === d ? (
                  <div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}>
                    <input type="number" inputMode="numeric" value={z2Mins} onChange={e=>setZ2Mins(e.target.value)} placeholder="min" autoFocus
                      style={{width:56,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 6px",fontSize:13,fontFamily:MONO,textAlign:"center",outline:"none"}}/>
                    <input value={z2Label} onChange={e=>setZ2Label(e.target.value)} placeholder="bike ride, jog, etc"
                      style={{flex:1,minWidth:0,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,fontFamily:MONO,outline:"none"}}/>
                    <button onClick={()=>submitZone2(d)} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>Add</button>
                    <button onClick={()=>{setZ2Adding(null);setZ2Mins("");setZ2Label("");}} style={{background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:MONO}}>✕</button>
                  </div>
                ) : (
                  <button onClick={()=>{setZ2Adding(d);setZ2Mins("");setZ2Label("");}} style={{
                    width:"100%", background:"transparent", border:`1px dashed ${C.border2}`,
                    borderRadius:8, color:C.dim, padding:"8px", fontSize:11, cursor:"pointer", fontFamily:MONO, marginTop:2,
                  }}>+ Log Zone 2 (e.g. 20 min bike)</button>
                )}

                {/* Habit + timed goals — backfill any past day */}
                {habitGoals.length > 0 && (
                  <>
                    <div style={{fontSize:9,color:C.muted,fontFamily:MONO,margin:"12px 0 6px",letterSpacing:"0.08em"}}>HABITS & SKILLS</div>
                    {habitGoals.map(goal => {
                      if (goal.kind === "habit") {
                        const done = goalDone(goal.id, d);
                        return (
                          <button key={goal.id} onClick={()=>{ if(!done){try{if(navigator.vibrate)navigator.vibrate(15);}catch{}} onToggleGoal && onToggleGoal(goal.id, d); }}
                            style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:done?goal.color+"1a":"#161616",border:`1px solid ${done?goal.color:C.border2}`,borderRadius:8,padding:"8px 10px",marginBottom:6,cursor:"pointer",fontFamily:MONO,gap:8}}>
                            <span style={{fontSize:12,color:C.text,display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                              <span style={{fontSize:14}}>{goal.emoji}</span>
                              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{goal.label}</span>
                            </span>
                            <svg width="20" height="20" viewBox="0 0 24 24" style={{display:"block",flexShrink:0}}>
                              <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill={done?goal.color:"transparent"} stroke={done?goal.color:C.muted} strokeWidth="2"/>
                              {done && <path d="M7 12.5 l3.3 3.3 l6.7 -7" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>}
                            </svg>
                          </button>
                        );
                      }
                      // timed goal — log minutes for this day
                      const key = goal.id + "|" + d;
                      const mins = goalMins(goal.id, d);
                      const editing = gEdit === key;
                      return (
                        <div key={goal.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:mins?goal.color+"1a":"#161616",border:`1px solid ${mins?goal.color:C.border2}`,borderRadius:8,padding:"7px 10px",marginBottom:6,gap:8}}>
                          <span style={{fontSize:12,color:C.text,fontFamily:MONO,display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                            <span style={{fontSize:14}}>{goal.emoji}</span>
                            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{goal.label}</span>
                          </span>
                          {editing ? (
                            <span style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                              <input autoFocus type="number" inputMode="numeric" value={gVal} placeholder="min"
                                onChange={e=>setGVal(e.target.value)}
                                onKeyDown={e=>{ if(e.key==="Enter") submitGoalMins(goal.id,d); if(e.key==="Escape"){setGEdit(null);setGVal("");} }}
                                style={{width:56,background:"#1a1a1a",border:`1px solid ${goal.color}`,borderRadius:8,color:C.text,padding:"7px 6px",fontSize:13,fontFamily:MONO,textAlign:"center",outline:"none"}}/>
                              <button onClick={()=>submitGoalMins(goal.id,d)} style={{background:goal.color,color:"#000",border:"none",borderRadius:8,padding:"7px 10px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>Save</button>
                              <button onClick={()=>{setGEdit(null);setGVal("");}} style={{background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:MONO}}>✕</button>
                            </span>
                          ) : (
                            <button onClick={()=>{setGEdit(key);setGVal(mins?String(mins):"");}} style={{flexShrink:0,background:"transparent",border:`1px solid ${mins?goal.color:C.border2}`,borderRadius:8,color:mins?goal.color:C.sub,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
                              {mins ? `${mins} min` : "+ min"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
            {isFuture && (
              <div style={{fontSize:10,color:C.dim,fontFamily:MONO,textAlign:"center",padding:"8px 0"}}>
                Future day — log when it arrives
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── WORKOUT SCREEN ───────────────────────────────────────────────────────────
function WorkoutScreen({
  initExercises = [],
  initialBlocks = null,
  workoutName: initWorkoutName,
  onFinish, onCancel, onDelete = null,
  mode = "live",
  initialDate = null,
  initialElapsedSec = 0,
  customExercises = {},
  onAddCustom = null,
  history = [],
  excludeWorkoutId = null,
  onSaveDraft = null,     // called continuously in live mode to persist a draft
  onDiscardDraft = null,  // called on explicit discard / successful publish
  draftStartedAt = null,  // preserves elapsed time across exit + resume
}) {
  // Merged catalogs that include user-created exercises
  const mergedNames = {...EXERCISES, ...Object.fromEntries(Object.entries(customExercises).map(([id,c])=>[id,c.name]))};
  const mergedMeta  = {...EX_META,    ...Object.fromEntries(Object.entries(customExercises).map(([id,c])=>[id,{muscle:c.muscle, cat:c.cat}]))};

  // Should a freshly-added exercise start in bodyweight (reps-only) mode?
  function defaultBwFor(exId) {
    if (DEFAULT_BW_EXERCISES.has(exId)) return true;
    const cat = mergedMeta[exId]?.cat;
    return cat === "Abs" || cat === "PT";
  }
  // For blocks loaded from history/drafts that predate the bw flag, infer it:
  // every set with reps has no real weight ⇒ it was a bodyweight exercise.
  function inferBw(block) {
    if (typeof block.bw === "boolean") return block.bw;
    const withReps = (block.sets || []).filter(s => parseInt(s.reps) > 0);
    if (withReps.length > 0 && withReps.every(isBwSet)) return true;
    if (withReps.length === 0) return defaultBwFor(block.exId);
    return false;
  }

  // PR detection — compute previous bests once on mount
  const prevBestsRef = useRef(null);
  const prTriggeredRef = useRef(new Set());
  const [activePR, setActivePR] = useState(null);
  // Brief "✓ SET" flash on every checkmark (always-on positive feedback,
  // independent of the lifetime-PR popup which still fires on top for real PRs).
  const [setFlash, setSetFlash] = useState(null);
  if (prevBestsRef.current === null) prevBestsRef.current = bestByExercise(history, excludeWorkoutId);
  const [exercises, setExercises] = useState(() =>
    initialBlocks
      ? initialBlocks.map(b => ({ ...b, bw: inferBw(b) }))
      : initExercises.map(id=>({id:uid(),exId:id,bw:defaultBwFor(id),sets:[{id:uid(),weight:"",reps:"",done:false}],notes:""}))
  );
  const [workoutName, setWorkoutName] = useState(initWorkoutName || "Workout");
  const [elapsed, setElapsed] = useState(initialElapsedSec);
  const [date, setDate] = useState(initialDate || isoDate());
  const [showPicker, setShowPicker] = useState(false);
  const isLive = mode === "live";
  const startTimeRef = useRef(draftStartedAt || Date.now()); // silently track live workout duration (no visible timer)
  // Volume + sets count only COMPLETED sets (M-5)
  function totalVol(exs){return exs.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);}
  function compSets(exs){return exs.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0);}
  const done=compSets(exercises); const vol=totalVol(exercises);
  // A set with reps filled counts as logged (weight is optional — bodyweight
  // exercises like plank, hanging leg raise, Russian twist have reps only).
  // This is what lets "Finish" become enabled for an abs-only workout.
  const hasData = exercises.some(ex => ex.sets.some(s => parseInt(s.reps) > 0));
  const canSave = isLive ? (done > 0 || hasData) : true;
  const [saving, setSaving] = useState(false);
  // Most recent completed set per exercise, for "last time" reference (M-2). history is date-desc.
  const lastByExercise = (() => {
    const map = {};
    for (const w of history) {
      for (const ex of (w.exercises||[])) {
        if (map[ex.exId]) continue;
        const doneSets = (ex.sets||[]).filter(s => s.done && parseInt(s.reps) > 0);
        if (doneSets.length) { const t = doneSets[doneSets.length-1]; map[ex.exId] = { weight: String(t.weight ?? ""), reps: String(t.reps) }; }
      }
    }
    return map;
  })();

  // Resolve what a set ACTUALLY means when logged. If the user leaves a field
  // blank, the greyed-out placeholder (last time's numbers) is what they saw —
  // so that's what gets recorded. Fixes "it said 135 but logged as bodyweight".
  function effectiveSet(s, block) {
    const ref = lastByExercise[block.exId];
    const reps = (s.reps !== "" && s.reps != null) ? s.reps : (ref?.reps ?? "");
    if (block.bw) return { ...s, weight: "0", reps };
    const weight = (s.weight !== "" && s.weight != null) ? s.weight : (ref?.weight ?? "");
    return { ...s, weight, reps };
  }

  // ── Draft autosave (live mode only) ───────────────────────────────────────
  // Every edit persists so you can leave the workout and come back to it.
  // Nothing is written to your history until you tap "Lock it in".
  useEffect(() => {
    if (!isLive || !onSaveDraft) return;
    if (exercises.length === 0) return;
    onSaveDraft({
      exercises, name: workoutName, startedAt: startTimeRef.current, savedAt: Date.now(),
    });
  }, [exercises, workoutName, isLive]);
  const ALL_EX=Object.entries(mergedNames);
  const [exSearch,setExSearch]=useState(""); const [exCat,setExCat]=useState("All");
  const [creatingCustom,setCreatingCustom]=useState(false);
  const [newExName,setNewExName]=useState(""); const [newExMuscle,setNewExMuscle]=useState("Quads"); const [newExCat,setNewExCat]=useState("Legs");
  const filteredEx=ALL_EX.filter(([id,name])=>{const m=mergedMeta[id];return name.toLowerCase().includes(exSearch.toLowerCase())&&(exCat==="All"||m?.cat===exCat);});

  // When a save-time PR is found, we hold the save pending until the user
  // dismisses the celebration. Otherwise the popup unmounts before they see it
  // (WorkoutScreen tears down on navigation).
  const [pendingSave, setPendingSave] = useState(null);

  function detectSaveTimePR(finalizedExs) {
    // Look across all auto-completed sets for the biggest PR per exercise that
    // wasn't already triggered by a mid-workout ✓ tap. Returns the first PR found,
    // or null. Mutates prevBestsRef so subsequent finish attempts don't re-fire.
    for (const ex of finalizedExs) {
      if (mergedMeta[ex.exId]?.cat === "Cardio") continue;
      const prev = prevBestsRef.current[ex.exId] || { maxWeight: 0, bwReps: 0 };
      let bestSet = null, bestM = null;
      for (const s of ex.sets) {
        if (!s.done || prTriggeredRef.current.has(s.id)) continue;
        const m = setMetric(s, ex.bw);
        if (m.kind === "weight" && m.value > prev.maxWeight && (!bestM || m.value > bestM.value)) { bestSet = s; bestM = m; }
        else if (m.kind === "bw" && m.value > prev.bwReps && (!bestM || m.value > bestM.value)) { bestSet = s; bestM = m; }
      }
      if (bestSet && bestM) {
        const prevVal = bestM.kind === "weight" ? prev.maxWeight : prev.bwReps;
        if (bestM.kind === "weight") prev.maxWeight = bestM.value; else prev.bwReps = bestM.value;
        prevBestsRef.current[ex.exId] = prev;
        prTriggeredRef.current.add(bestSet.id);
        return { exId: ex.exId, exName: mergedNames[ex.exId] || ex.exId, kind: bestM.kind, value: bestM.value, prev: prevVal, weight: bestSet.weight, reps: bestSet.reps };
      }
    }
    return null;
  }

  async function finalizeAndPersist(pkg) {
    if (onDiscardDraft) onDiscardDraft();   // published — draft no longer needed
    await onFinish(pkg);
  }

  // Called by the PR popup's onClose — either auto-close (6s) or tap-to-dismiss.
  // If we deferred a save behind it, complete that save now.
  function handlePRClose() {
    setActivePR(null);
    if (pendingSave) { const data = pendingSave; setPendingSave(null); finalizeAndPersist(data); }
  }

  async function handleSave() {
    if (saving || !canSave) return; // debounce double-tap (C-2)
    setSaving(true);
    const finalDate = isLive ? new Date().toISOString() : new Date(date + "T12:00:00").toISOString();
    const finalElapsed = isLive ? Math.round((Date.now() - startTimeRef.current)/1000) : elapsed;
    // Resolve placeholders into real values, then auto-complete any set that
    // has reps but wasn't explicitly ticked. Empty rows are dropped entirely.
    const finalized = exercises.map(ex => ({
      ...ex,
      sets: ex.sets.map(s => {
        const eff = effectiveSet(s, ex);
        if (!(parseInt(eff.reps) > 0)) return s;
        return { ...eff, done: true, weight: eff.weight === "" || eff.weight == null ? "0" : eff.weight };
      }).filter(s => parseInt(s.reps) > 0),
    })).filter(ex => ex.sets.length > 0);
    const pkg = {exercises: finalized, elapsed: finalElapsed, name: workoutName || "Workout", date: finalDate};
    // Detect any PR that mid-workout ✓ tapping didn't already fire (covers the
    // common case of typing weights and hitting Finish without checkboxes).
    if (mode !== "edit") {
      const saveTimePR = detectSaveTimePR(finalized);
      if (saveTimePR) {
        setPendingSave(pkg);
        setActivePR(saveTimePR);
        return; // save resumes from handlePRClose when the popup is dismissed
      }
    }
    await finalizeAndPersist(pkg);
    // onFinish navigates away; keep saving=true so the button stays locked
  }
  // Live workouts auto-save as a draft, so leaving is non-destructive.
  function handleExit() { onCancel(); }
  function handleDiscard() {
    if (isLive && (done > 0 || hasData)) {
      if (!window.confirm("Discard this workout? Everything you've logged will be deleted.")) return;
    }
    if (onDiscardDraft) onDiscardDraft();
    onCancel();
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 16px 12px",paddingTop:"calc(18px + env(safe-area-inset-top))",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bg,zIndex:10,gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          {/* Name editable in every mode (N-5) */}
          <input value={workoutName} onChange={e=>setWorkoutName(e.target.value)} placeholder="Workout name" aria-label="Workout name"
            style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO,background:"transparent",border:"none",outline:"none",padding:0,width:"100%"}}/>
          {isLive ? (
            <div style={{color:C.muted,fontFamily:MONO,fontSize:11,marginTop:2}}>
              Today · <span style={{color:C.blue}}>draft auto-saves</span>
            </div>
          ) : (
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
              <input type="date" value={date} max={isoDate()} onChange={e=>setDate(e.target.value)}
                style={{background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,padding:"4px 8px",fontSize:11,fontFamily:MONO,outline:"none",colorScheme:"dark"}}/>
              <input type="number" min="0" value={Math.round(elapsed/60)} onChange={e=>setElapsed(Math.max(0,parseInt(e.target.value)||0)*60)}
                style={{background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,padding:"4px 6px",fontSize:11,fontFamily:MONO,outline:"none",width:50,textAlign:"center"}}/>
              <span style={{fontSize:10,color:C.dim,fontFamily:MONO}}>min</span>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {mode==="edit" && onDelete && (
            <button style={{background:"transparent",color:C.red,border:`1px solid ${C.red}55`,borderRadius:8,padding:"8px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO}}
              onClick={()=>{ if(window.confirm("Delete this workout? Cannot be undone.")) onDelete(); }}>Delete</button>
          )}
          {isLive ? (
            <button title="Leave — your draft is saved" style={{background:"transparent",color:C.blue,border:`1px solid ${C.blue}55`,borderRadius:8,padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={handleExit}>Exit</button>
          ) : (
            <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={handleDiscard}>Cancel</button>
          )}
          <button style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"9px 18px",fontSize:12,fontWeight:700,cursor:(canSave&&!saving)?"pointer":"default",fontFamily:MONO,opacity:(canSave&&!saving)?1:0.4}}
            disabled={!canSave||saving} onClick={handleSave}>{saving?"Saving...":(isLive?"Lock it in":"Save")}</button>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-around",padding:"10px 0",borderBottom:`1px solid ${C.border}`,background:"#0d0d0d"}}>
        {[["Sets",done],["Volume",vol>0?`${(vol/1000).toFixed(1)}k lbs`:"—"],["Exercises",exercises.length]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center"}}><div style={{fontSize:17,fontWeight:700,color:C.text,fontFamily:MONO}}>{v}</div><div style={{fontSize:9,color:C.dim,letterSpacing:"0.1em",fontFamily:MONO,marginTop:2}}>{l}</div></div>
        ))}
      </div>
      <div style={{padding:"12px 12px 100px"}}>
        {exercises.length===0 && (
          <div style={{textAlign:"center",padding:"36px 20px 24px",color:C.muted,fontFamily:MONO}}>
            <div style={{fontSize:32,marginBottom:10}}>🏋</div>
            <div style={{fontSize:13,color:C.sub}}>No exercises yet</div>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>Tap "+ Add Exercise" below to start logging.</div>
          </div>
        )}
        {exercises.map((item,ei)=>{
          const exName=mergedNames[item.exId]||item.exId; const meta=mergedMeta[item.exId];
          const bwMode = !!item.bw;
          const exVol=item.sets.filter(s=>s.done).reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
          // Session bests — count ONLY done sets so the green-check feedback
          // (a PR was hit) aligns with when the popup is supposed to fire.
          const bestWeight=item.sets.filter(s=>s.done).reduce((b,s)=>{const m=setMetric(s,bwMode);return m.kind==="weight"?Math.max(b,m.value):b;},0);
          const bestBwReps=item.sets.filter(s=>s.done).reduce((b,s)=>{const m=setMetric(s,bwMode);return m.kind==="bw"?Math.max(b,m.value):b;},0);
          // Prior PR pulled from history (mutates as PRs land mid-session).
          const prior = prevBestsRef.current?.[item.exId] || { maxWeight: 0, bwReps: 0 };
          const priorWeight  = prior.maxWeight || 0;
          const priorBwReps  = prior.bwReps || 0;
          const beatWeight = priorWeight > 0 && bestWeight > priorWeight;
          const beatBw     = priorBwReps > 0 && bestBwReps > priorBwReps;
          const lastRef=lastByExercise[item.exId];
          // Which PR chip matters for how this exercise is currently being logged.
          const showPR = bwMode
            ? (priorBwReps > 0 ? { label: `PR ${priorBwReps} reps`, beat: beatBw } : null)
            : (priorWeight  > 0 ? { label: `PR ${priorWeight} lbs`, beat: beatWeight } : null);
          function toggleBw() {
            setExercises(exercises.map((ex,j)=> j!==ei ? ex : {
              ...ex, bw: !bwMode,
              // Switching to BW clears weights so nothing stale lingers.
              sets: !bwMode ? ex.sets.map(s=>({...s, weight:""})) : ex.sets,
            }));
          }
          return(
            <div key={item.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:MONO,marginBottom:2}}>{exName}</div>
                  <div style={{fontSize:11,color:"#7a7a7a",fontFamily:MONO}}>{meta?.muscle} · {meta?.cat}</div>
                  {lastRef && <div style={{fontSize:10,color:C.accent,fontFamily:MONO,marginTop:3,opacity:0.85}}>last: {isBwSet(lastRef) ? "BW" : `${lastRef.weight} lbs`} × {lastRef.reps}</div>}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {!bwMode && exVol>0 && <span style={{fontSize:10,color:C.accent,background:"rgba(255,107,53,0.1)",padding:"2px 7px",borderRadius:6,fontFamily:MONO}}>{(exVol/1000).toFixed(1)}k</span>}
                  {/* Prior PR to beat — the exact number the popup compares against. */}
                  {showPR && (
                    <span style={{fontSize:10,color:showPR.beat?"#22ee66":C.purple,background:showPR.beat?"rgba(34,238,102,0.15)":"rgba(167,139,250,0.1)",padding:"2px 7px",borderRadius:6,fontFamily:MONO,fontWeight:showPR.beat?700:400,whiteSpace:"nowrap"}}>{showPR.label}{showPR.beat?" ✓":""}</span>
                  )}
                  {/* Bodyweight toggle — hides the weight field entirely for reps-only work. */}
                  <button onClick={toggleBw} title={bwMode?"Switch to weighted (track lbs)":"Switch to bodyweight (reps only)"}
                    style={{background:bwMode?C.purple+"22":"transparent",border:`1px solid ${bwMode?C.purple:C.border2}`,borderRadius:6,color:bwMode?C.purple:C.muted,fontSize:9,fontFamily:MONO,padding:"3px 8px",cursor:"pointer",letterSpacing:"0.06em",fontWeight:700,whiteSpace:"nowrap"}}>
                    {bwMode ? "BODYWEIGHT" : "+ WEIGHT"}
                  </button>
                  <button title="Remove exercise" style={{background:"transparent",border:"none",color:"#7a7a7a",fontSize:14,cursor:"pointer",fontFamily:MONO,width:32,height:32,flexShrink:0}} onClick={()=>setExercises(exercises.filter((_,j)=>j!==ei))}>✕</button>
                </div>
              </div>
              {item.sets.map((s,si)=>{
                // What this row will actually log — blanks fall back to the
                // greyed placeholder (last session's numbers), which is what
                // the user sees, so ✓ records exactly that.
                const eff = effectiveSet(s, item);
                const effReps = parseInt(eff.reps) || 0;
                const effWeight = parseFloat(eff.weight);
                const hasEff = effReps > 0;
                const rowEmpty = !s.weight && !s.reps;
                // Most recent filled set above this one in the same exercise
                // (reps alone is enough — bodyweight rows have no weight).
                let lastAbove = null;
                for (let k = si-1; k >= 0; k--) {
                  const ks = item.sets[k];
                  if (parseInt(ks.reps) > 0) { lastAbove = ks; break; }
                }
                const showCopy = rowEmpty && !s.done && lastAbove;
                const dupLabel = bwMode ? `BW × ${eff.reps}` : `${effWeight||0} × ${eff.reps}`;
                return (
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <span style={{width:18,textAlign:"center",fontSize:12,color:"#777",fontFamily:MONO}}>{si+1}</span>
                  {bwMode ? (
                    <span style={{flex:1,minWidth:0,background:"#141414",border:`1px dashed ${C.purple}55`,borderRadius:8,color:C.purple,padding:"11px 8px",fontSize:12,fontFamily:MONO,textAlign:"center",letterSpacing:"0.08em",fontWeight:700}}>BW</span>
                  ) : (
                    <input style={{flex:1,minWidth:0,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"11px 8px",fontSize:15,fontFamily:MONO,textAlign:"center",outline:"none",WebkitAppearance:"none"}} type="number" inputMode="decimal" placeholder={lastRef?lastRef.weight:"lbs"} value={s.weight} onChange={e=>{const sets=[...item.sets];sets[si]={...s,weight:e.target.value};setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}/>
                  )}
                  <span style={{color:C.dim,fontSize:12}}>×</span>
                  <input style={{flex:1,minWidth:0,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"11px 8px",fontSize:15,fontFamily:MONO,textAlign:"center",outline:"none",WebkitAppearance:"none"}} type="number" inputMode="numeric" placeholder={lastRef?lastRef.reps:"reps"} value={s.reps} onChange={e=>{const sets=[...item.sets];sets[si]={...s,reps:e.target.value};setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}/>
                  {/* middle slot: copy-from-above (when row is empty) OR
                      duplicate-this-set-below (when the row will log something).
                      Works for reps-only bodyweight rows too. */}
                  {showCopy ? (
                    <button aria-label="Copy from the set above" title="Copy the set above"
                      onClick={()=>{const sets=[...item.sets];sets[si]={...s,weight:bwMode?"":lastAbove.weight,reps:lastAbove.reps};setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}
                      style={{width:40,height:36,flexShrink:0,background:"transparent",border:`1px solid ${C.border2}`,borderRadius:7,color:C.sub,fontSize:9,fontFamily:MONO,cursor:"pointer",letterSpacing:"0.02em",lineHeight:1.1}}>⧉ copy</button>
                  ) : hasEff ? (
                    <button aria-label="Duplicate this set below" title={`Duplicate · ${dupLabel}`}
                      onClick={()=>{
                        const newSet = { id: uid(), weight: bwMode ? "" : eff.weight, reps: eff.reps, done: false };
                        const sets = [...item.sets.slice(0, si+1), newSet, ...item.sets.slice(si+1)];
                        setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));
                      }}
                      style={{width:40,height:36,flexShrink:0,background:`${C.accent}15`,border:`1px solid ${C.accent}80`,borderRadius:7,color:C.accent,fontSize:14,fontFamily:MONO,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>⧉</button>
                  ) : (
                    <span style={{width:40,flexShrink:0}}/>
                  )}
                  {/* checkbox */}
                  <button aria-label="Mark set complete" style={{width:44,height:44,flexShrink:0,background:"transparent",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}} onClick={()=>{
                    const newDone = !s.done;
                    if (newDone) { try { if (navigator.vibrate) navigator.vibrate(15); } catch {} }
                    // Commit the effective values so a row logged straight from
                    // the placeholder records the real numbers, not a blank.
                    const committed = newDone ? { ...s, ...eff, done: true } : { ...s, done: false };
                    if (newDone && effReps > 0) {
                      setSetFlash({ ts: Date.now(), label: bwMode || isBwSet(committed) ? `BW × ${committed.reps}` : `${committed.weight} × ${committed.reps}` });
                    }
                    // PR fires the moment you tick the box. Weighted → heaviest
                    // lbs; bodyweight → most reps in a set.
                    if (newDone && mode !== "edit" && mergedMeta[item.exId]?.cat !== "Cardio" && !prTriggeredRef.current.has(s.id)) {
                      const m = setMetric(committed, bwMode);
                      if (m.kind) {
                        const prev = prevBestsRef.current[item.exId] || { maxWeight: 0, bwReps: 0 };
                        let isPR = false, prevVal = 0;
                        if (m.kind === "weight" && m.value > prev.maxWeight) { isPR = true; prevVal = prev.maxWeight; prev.maxWeight = m.value; }
                        if (m.kind === "bw"     && m.value > prev.bwReps)    { isPR = true; prevVal = prev.bwReps;    prev.bwReps    = m.value; }
                        if (isPR) {
                          prTriggeredRef.current.add(s.id);
                          prevBestsRef.current[item.exId] = prev;
                          setActivePR({ exId: item.exId, exName: mergedNames[item.exId] || item.exId, kind: m.kind, value: m.value, prev: prevVal, weight: committed.weight, reps: committed.reps });
                        }
                      }
                    }
                    const sets=[...item.sets];sets[si]=committed;
                    // Auto-fill ALL subsequent empty sets with this set's values
                    // so N identical sets = type once, then just tap ✓ down the list.
                    if (newDone && effReps > 0) {
                      for (let j = si+1; j < sets.length; j++) {
                        if (!sets[j].weight && !sets[j].reps && !sets[j].done) {
                          sets[j] = { ...sets[j], weight: bwMode ? "" : committed.weight, reps: committed.reps };
                        }
                      }
                    }
                    setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" style={{display:"block"}}>
                      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill={s.done?C.accent:"transparent"} stroke={s.done?C.accent:C.muted} strokeWidth="2" style={{transition:s.done?"fill 0.15s ease-out, stroke 0.15s ease-out":"none"}}/>
                      {s.done && <path d="M7 12.5 l3.3 3.3 l6.7 -7" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{strokeDasharray:22,animation:"checkDraw 0.16s ease-out forwards"}}/>}
                    </svg>
                  </button>
                  <button aria-label="Delete set" style={{width:34,height:44,background:"transparent",border:"none",color:"#666",fontSize:13,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>{const sets=item.sets.filter((_,j)=>j!==si);setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}>✕</button>
                </div>
                );
              })}
              {(() => {
                // "+ Add set" pre-fills from the most recent filled set (reps
                // alone is enough, so bodyweight works). "+5" stamps five at once.
                const lastDone = [...item.sets].reverse().find(x => x.done && parseInt(x.reps) > 0);
                const lastFilled = lastDone || [...item.sets].reverse().find(x => parseInt(x.reps) > 0);
                const tpl = lastFilled
                  ? { weight: bwMode ? "" : (lastFilled.weight ?? ""), reps: lastFilled.reps }
                  : { weight: "", reps: "" };
                const label = lastFilled
                  ? `+ Add set · ${bwMode || isBwSet(lastFilled) ? "BW" : `${lastFilled.weight} lbs`} × ${lastFilled.reps}`
                  : "+ Add set";
                function addSets(n) {
                  const extra = Array.from({length:n},()=>({id:uid(),...tpl,done:false}));
                  const sets=[...item.sets,...extra];
                  setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));
                }
                return (
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    <button style={{flex:1,background:"transparent",border:`1px dashed ${lastFilled?C.accent+"55":C.border}`,borderRadius:8,color:lastFilled?C.accent:C.dim,padding:"8px",fontSize:11,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.02em"}}
                      onClick={()=>addSets(1)}>{label}</button>
                    {lastFilled && (
                      <button title="Add five identical sets" style={{flexShrink:0,background:"transparent",border:`1px dashed ${C.accent}55`,borderRadius:8,color:C.accent,padding:"8px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO,fontWeight:700}}
                        onClick={()=>addSets(5)}>+5</button>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
        <button style={{width:"100%",background:"transparent",border:`1px solid ${C.border}`,borderRadius:12,color:C.muted,padding:14,fontSize:13,cursor:"pointer",marginTop:4,fontFamily:MONO}} onClick={()=>setShowPicker(true)}>+ Add Exercise</button>
        {isLive && (
          <button style={{width:"100%",background:"transparent",border:"none",color:C.red,padding:"16px 14px 4px",fontSize:11,cursor:"pointer",fontFamily:MONO,opacity:0.75}}
            onClick={handleDiscard}>Discard this workout</button>
        )}
      </div>
      {showPicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"78vh",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"16px 18px",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>Add Exercise</span><button style={{background:"transparent",border:"none",color:C.muted,fontSize:16,cursor:"pointer"}} onClick={()=>setShowPicker(false)}>✕</button></div>
            <input style={{background:"#161616",border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,padding:"10px 14px",fontSize:13,margin:"12px 16px 0",outline:"none",fontFamily:MONO}} placeholder="Search…" value={exSearch} onChange={e=>setExSearch(e.target.value)} autoFocus/>
            <div style={{display:"flex",gap:6,padding:"10px 16px",overflowX:"auto",flexShrink:0}}>
              {["All","Push","Pull","Legs","Arms","Abs","PT","Full Body","Cardio"].map(c=><button key={c} style={{borderRadius:20,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO,whiteSpace:"nowrap",flexShrink:0,background:exCat===c?C.accent:"#1a1a1a",color:exCat===c?"#000":C.muted,border:exCat===c?"none":`1px solid ${C.border}`}} onClick={()=>setExCat(c)}>{c}</button>)}
            </div>
            <div style={{overflowY:"auto",padding:"0 12px 24px"}}>
              {creatingCustom ? (
                <div style={{background:"#161616",border:`1px solid ${C.accent}`,borderRadius:10,padding:14,marginBottom:8}}>
                  <div style={{fontSize:11,color:C.accent,fontFamily:MONO,marginBottom:10,letterSpacing:"0.1em",fontWeight:700}}>NEW CUSTOM EXERCISE</div>
                  <input autoFocus value={newExName} onChange={e=>setNewExName(e.target.value)} placeholder="Name (e.g. Bulgarian Split Squat)"
                    style={{width:"100%",background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:10}}/>
                  <div style={{display:"flex",gap:8,marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:8,color:C.accent,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4,fontWeight:700}}>COUNTS AS (drives goals)</div>
                      <select value={newExMuscle} onChange={e=>setNewExMuscle(e.target.value)}
                        style={{width:"100%",background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"7px 8px",fontSize:12,fontFamily:MONO,outline:"none"}}>
                        {["Chest","Back","Shoulders","Biceps","Triceps","Traps","Quads","Hamstrings","Glutes","Calves","Core","PT","Cardio","Full Body","Other"].map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:8,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4,fontWeight:700}}>PICKER TAB</div>
                      <select value={newExCat} onChange={e=>setNewExCat(e.target.value)}
                        style={{width:"100%",background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"7px 8px",fontSize:12,fontFamily:MONO,outline:"none"}}>
                        {["Push","Pull","Legs","Arms","Abs","PT","Full Body","Cardio"].map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginBottom:10,lineHeight:1.4}}>
                    "Counts as" sets which weekly goal this hits (e.g. Chest, Core for abs, Full Body). Legs = Quads/Hams/Glutes/Calves; Arms = Biceps/Triceps; Abs = Core.
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button style={{flex:1,background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:newExName.trim()?"pointer":"default",fontFamily:MONO,opacity:newExName.trim()?1:0.4}}
                      onClick={()=>{
                        if (!newExName.trim() || !onAddCustom) return;
                        const newId = onAddCustom(newExName, newExMuscle, newExCat);
                        setExercises([...exercises,{id:uid(),exId:newId,bw:newExCat==="Abs"||newExCat==="PT",sets:[{id:uid(),weight:"",reps:"",done:false}],notes:""}]);
                        setNewExName(""); setCreatingCustom(false); setShowPicker(false);
                      }}>Create + Add</button>
                    <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:MONO}} onClick={()=>{setCreatingCustom(false);setNewExName("");}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button style={{width:"100%",background:"transparent",border:`1px dashed ${C.accent}`,borderRadius:10,color:C.accent,padding:"10px 14px",marginBottom:10,cursor:"pointer",fontFamily:MONO,fontSize:12,letterSpacing:"0.05em"}}
                  onClick={()=>setCreatingCustom(true)}>+ Create custom exercise</button>
              )}
              {filteredEx.map(([id,name])=>{
                const isCustom = !!customExercises[id];
                return (
                  <button key={id} style={{width:"100%",background:"transparent",border:`1px solid ${isCustom?C.purple+"55":C.border}`,borderRadius:10,color:C.text,padding:"11px 14px",marginBottom:6,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                    onClick={()=>{setExercises([...exercises,{id:uid(),exId:id,bw:defaultBwFor(id),sets:[{id:uid(),weight:"",reps:"",done:false}],notes:""}]);setShowPicker(false);}}>
                    <span style={{fontSize:13,fontFamily:MONO,color:C.text}}>
                      {name}
                      {isCustom && <span style={{fontSize:9,color:C.purple,marginLeft:6,letterSpacing:"0.05em"}}>CUSTOM</span>}
                    </span>
                    <span style={{fontSize:11,color:C.dim,fontFamily:MONO}}>{mergedMeta[id]?.muscle}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {setFlash && <SetFlash key={setFlash.ts} label={setFlash.label} onDone={()=>setSetFlash(null)}/>}
      {activePR && <PRCelebration pr={activePR} onClose={handlePRClose}/>}
    </div>
  );
}

// ─── Brief set-complete flash (fires every ✓ tap with valid data) ────────────
function SetFlash({ label, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 1100); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{
        background:`linear-gradient(135deg, ${C.accent} 0%, #FF8A4C 100%)`,
        color:"#000", padding:"22px 38px", borderRadius:20,
        boxShadow:`0 0 50px ${C.accent}cc, 0 0 100px ${C.accent}55`,
        animation:"setFlashPop 1.1s cubic-bezier(0.2, 0.8, 0.3, 1) forwards",
        textAlign:"center",
      }}>
        <div style={{fontSize:34,fontWeight:900,fontFamily:MONO,lineHeight:1}}>✓</div>
        <div style={{fontSize:13,fontWeight:700,fontFamily:MONO,marginTop:5,opacity:0.85,letterSpacing:"0.05em"}}>{label}</div>
      </div>
    </div>
  );
}

// ─── PR Celebration ───────────────────────────────────────────────────────────
function PRCelebration({ pr, onClose }) {
  useEffect(()=>{ const t = setTimeout(onClose, 6000); return ()=>clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",animation:"prFadeIn 0.25s ease-out"}}>
      {/* Sparkle burst */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        {Array.from({length:28}).map((_,i)=>{
          const angle = (i/28) * Math.PI * 2;
          const r = 200 + (i%3)*40;
          return (
            <div key={i} style={{
              position:"absolute", left:"50%", top:"50%",
              width:8, height:8, borderRadius:"50%",
              background: i%3===0?C.accent:i%3===1?C.purple:C.yellow,
              boxShadow:"0 0 10px currentColor",
              "--tx": `${Math.cos(angle)*r}px`,
              "--ty": `${Math.sin(angle)*r}px`,
              animation:`prSparkle 1.4s cubic-bezier(0.2, 0.6, 0.3, 1) ${i*0.015}s both`,
            }}/>
          );
        })}
      </div>
      {/* Trophy + numbers */}
      <div onClick={e=>e.stopPropagation()} style={{
        position:"relative", textAlign:"center", padding:"36px 32px",
        background:`linear-gradient(180deg, ${C.card} 0%, ${C.surface} 100%)`,
        border:`1px solid ${C.accent}`, borderRadius:20, maxWidth:360, width:"calc(100% - 32px)",
        boxShadow:`0 0 60px rgba(255,107,53,0.28), 0 0 120px rgba(255,107,53,0.12)`,
        animation:"prPop 0.5s cubic-bezier(0.18, 1.25, 0.5, 1)",
      }}>
        <div style={{fontSize:64,marginBottom:12,animation:"prTrophyBounce 0.8s ease-out"}}>🏆</div>
        <div style={{fontSize:10,letterSpacing:"0.3em",color:C.accent,fontFamily:MONO,fontWeight:700,marginBottom:8}}>NEW PERSONAL RECORD</div>
        <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:MONO,marginBottom:24}}>{pr.exName}</div>
        <div style={{fontSize:64,fontWeight:900,color:C.accent,fontFamily:MONO,lineHeight:1,textShadow:"0 0 32px rgba(255,107,53,0.6)",marginBottom:6}}>{pr.kind==="bw" ? pr.value : (pr.value ?? pr.rm)}</div>
        <div style={{fontSize:9,letterSpacing:"0.25em",color:C.muted,fontFamily:MONO,marginBottom:18}}>{pr.kind==="bw" ? "REPS IN A SET" : "LBS"}</div>
        <div style={{fontSize:12,color:C.muted,fontFamily:MONO,marginBottom:24}}>
          {pr.kind==="bw" ? <>bodyweight × {pr.reps} reps</> : <>{pr.weight} lbs × {pr.reps} reps</>}
          {pr.prev > 0
            ? <span style={{color:C.dim}}> · up from {pr.prev}{pr.kind==="bw"?" reps":" lbs"}</span>
            : <span style={{color:C.dim}}> · first PR</span>}
        </div>
        <button onClick={onClose} style={{background:C.accent,border:"none",borderRadius:10,color:"#000",padding:"14px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}>Keep Going →</button>
      </div>
    </div>
  );
}

// ─── Perfect Day Celebration ──────────────────────────────────────────────────
// Fires on Home the moment you've logged a workout + clean diet + active for
// today, once per day (localStorage-flagged).
function PerfectDayCelebration({ onClose }) {
  useEffect(()=>{ const t = setTimeout(onClose, 7000); return ()=>clearTimeout(t); }, [onClose]);
  const G = "#22ee66";
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",animation:"prFadeIn 0.25s ease-out"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        {Array.from({length:32}).map((_,i)=>{
          const angle = (i/32) * Math.PI * 2;
          const r = 220 + (i%4)*40;
          return (
            <div key={i} style={{
              position:"absolute", left:"50%", top:"50%",
              width:8, height:8, borderRadius:"50%",
              background: i%3===0 ? G : i%3===1 ? "#86efac" : C.yellow,
              boxShadow:"0 0 10px currentColor",
              "--tx": `${Math.cos(angle)*r}px`,
              "--ty": `${Math.sin(angle)*r}px`,
              animation:`prSparkle 1.6s cubic-bezier(0.2, 0.6, 0.3, 1) ${i*0.012}s both`,
            }}/>
          );
        })}
      </div>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"relative", textAlign:"center", padding:"36px 32px",
        background:`linear-gradient(180deg, ${C.card} 0%, ${C.surface} 100%)`,
        border:`1px solid ${G}`, borderRadius:20, maxWidth:360, width:"calc(100% - 32px)",
        boxShadow:`0 0 60px ${G}33, 0 0 120px ${G}1a`,
        animation:"prPop 0.5s cubic-bezier(0.18, 1.25, 0.5, 1)",
      }}>
        <div style={{fontSize:64,marginBottom:12,animation:"prTrophyBounce 0.8s ease-out"}}>⭐</div>
        <div style={{fontSize:10,letterSpacing:"0.3em",color:G,fontFamily:MONO,fontWeight:700,marginBottom:8}}>YOU JUST EARNED</div>
        <div style={{fontSize:30,fontWeight:900,color:C.text,fontFamily:MONO,marginBottom:10,letterSpacing:"0.06em"}}>PERFECT DAY</div>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginBottom:22,lineHeight:1.6}}>Workout · clean diet · active. Three for three. Stack another tomorrow.</div>
        <div style={{display:"flex",justifyContent:"center",gap:14,marginBottom:24,fontSize:16,fontFamily:MONO,color:G}}>
          <span>🏋 ✓</span><span>🥗 ✓</span><span>👟 ✓</span>
        </div>
        <button onClick={onClose} style={{background:G,border:"none",borderRadius:10,color:"#000",padding:"14px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}>Keep going →</button>
      </div>
    </div>
  );
}


// ─── ROONEY CHAT ─────────────────────────────────────────────────────────────
// ─── Rooney tools ─────────────────────────────────────────────────────────────
const EXERCISE_ID_LIST = Object.keys(EXERCISES).join(", ");
const ROONEY_TOOLS = [
  {
    name: "build_workout",
    description: "Create a workout TEMPLATE for a day — exercises pre-loaded but with EMPTY sets (no weight/reps). Use when Andrew asks you to 'set up a day', 'build me a workout', 'make a template', or recommends a session he'll do. He then opens it from Recent Workouts and fills in the weights himself as he trains. Default date is today. Pick 4-7 exercises that fit what he asked for. For each: give an ex_id from the catalog if one fits; otherwise give a name + muscle + cat and a custom exercise gets created (e.g. name 'Shoulder PT', muscle 'PT', cat 'PT'). Do NOT put in any weights or reps — leave them blank for him to log.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Workout name, e.g. 'Shoulder PT + Push', 'Pull Day'." },
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
        exercises: {
          type: "array",
          description: "Exercises to pre-load with empty sets.",
          items: {
            type: "object",
            properties: {
              ex_id: { type: "string", description: `A catalog id if one fits: ${EXERCISE_ID_LIST}` },
              name: { type: "string", description: "If no catalog id fits, a name for a new custom exercise." },
              muscle: { type: "string", description: "For a new exercise: Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings, Glutes, Calves, Core, PT, Cardio, or Full Body. This drives goal-counting." },
              cat: { type: "string", description: "For a new exercise: Push, Pull, Legs, Arms, PT, Full Body, or Cardio." },
              sets: { type: "number", description: "How many empty sets to create. Default 3." }
            }
          }
        }
      },
      required: ["name", "exercises"]
    }
  },
  {
    name: "log_workout",
    description: "Add a past workout to Andrew's history. Use this when Andrew tells you he worked out on a specific day and you have enough detail to record it. If you don't know enough (e.g., he just says 'I worked out yesterday' with no specifics), ask first. Date must be ISO format YYYY-MM-DD; resolve relative phrases like 'yesterday' using today's date from the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD" },
        name: { type: "string", description: "Short workout name like 'Push Day', 'Legs', 'Quick lift'. Default to 'Workout' if unclear." },
        duration_minutes: { type: "number", description: "Approximate duration in minutes. Default 45 if unknown." },
        exercises: {
          type: "array",
          description: "Exercises performed. Each is one exercise with N identical sets of (reps × weight). Optional — if Andrew didn't say what he did, leave empty.",
          items: {
            type: "object",
            properties: {
              ex_id: { type: "string", description: `Exercise ID from this list: ${EXERCISE_ID_LIST}` },
              sets: { type: "number", description: "Number of sets" },
              reps: { type: "number", description: "Reps per set" },
              weight: { type: "number", description: "Weight in lbs per set. Use 0 for bodyweight or cardio." }
            },
            required: ["ex_id", "sets", "reps"]
          }
        }
      },
      required: ["date", "name", "duration_minutes"]
    }
  },
  {
    name: "log_diet",
    description: "Set diet quality for one date. green = clean / on plan. yellow = decent / minor slips. red = off plan.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD" },
        status: { type: "string", enum: ["green","yellow","red"] }
      },
      required: ["date","status"]
    }
  },
  {
    name: "log_activity",
    description: "Set activity level for one date. green = crushed it (gym, run, all in). yellow = light movement / walk. red = full rest day.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD" },
        status: { type: "string", enum: ["green","yellow","red"] }
      },
      required: ["date","status"]
    }
  },
  {
    name: "remember",
    description: "Save a fact about Andrew so future conversations remember it. Use this when he shares something noteworthy and durable — an injury, a preference, a deadline, a long-term goal, a person in his life. DO NOT use for trivial in-the-moment chat. Categories: physical (injuries, limitations, allergies), preference (training style, likes/dislikes), goal (long-term aim), context (current life situation, upcoming events), relationship (people he mentions repeatedly), other.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["physical","preference","goal","context","relationship","other"] },
        text: { type: "string", description: "The fact, written in third person as a brief sentence. Example: 'Andrew has chronic left knee pain from old skiing injury — avoid deep squats and box jumps.'" },
      },
      required: ["category", "text"]
    }
  },
  {
    name: "forget",
    description: "Remove a previously-stored memory. Use only when Andrew explicitly asks you to forget something, or when a fact is clearly stale/wrong. Pass the memory id from the ROONEY MEMORY section of the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        memory_id: { type: "string", description: "The id of the memory to remove." },
      },
      required: ["memory_id"]
    }
  },
  {
    name: "add_kanban_card",
    description: "Add a card to a kanban board column. Use when Andrew says 'remind me to', 'add to my todo', 'put on my Job Search board', etc. Match boards/columns case-insensitively. If column not specified, use the first column (usually Backlog or Todo).",
    input_schema: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name. Will match case-insensitively against existing boards." },
        column: { type: "string", description: "Column name. Optional — defaults to the first column of the board." },
        text: { type: "string", description: "The card text / task description." }
      },
      required: ["board","text"]
    }
  },
];

function computeObservations({ history, dietLog, activeLog, focusSessions, goals }) {
  const gl = Array.isArray(goals) ? goals : [];
  const G = {
    perfectDays: 3,
    workouts:    gl.find(g=>g.kind==="workouts")?.target ?? 4,
    dietRed:     gl.find(g=>g.kind==="diet_red")?.target ?? 1,
  };
  const obs = [];
  const today = isoDate();
  const thisWeekDays = getWeekDays(0);
  const lastWeekDays = getWeekDays(-1);

  // Workouts this week vs last
  const wkW = history.filter(w => thisWeekDays.includes(isoDate(new Date(w.date)))).length;
  const lastW = history.filter(w => lastWeekDays.includes(isoDate(new Date(w.date)))).length;
  if (wkW >= G.workouts) obs.push(`Hit workout goal: ${wkW}/${G.workouts} this week.`);
  else if (wkW < lastW && lastW > 0) obs.push(`Workouts trending down: ${wkW} this week vs ${lastW} last week.`);

  // Perfect days streak
  const wkSet = new Set(history.map(w => isoDate(new Date(w.date))));
  const perfect = thisWeekDays.filter(d => dietLog[d]==="green" && activeLog[d]==="green" && wkSet.has(d)).length;
  if (perfect >= G.perfectDays) obs.push(`Hit perfect days goal: ${perfect}/${G.perfectDays}.`);
  else if (perfect > 0) obs.push(`Perfect days so far: ${perfect}/${G.perfectDays}.`);

  // Red diet days
  const redDays = thisWeekDays.filter(d => dietLog[d]==="red").length;
  if (redDays > G.dietRed) obs.push(`Cheat days over cap: ${redDays} (max ${G.dietRed}).`);

  // PR check on latest workout — weighted PRs by heaviest lbs, bodyweight by reps.
  const latest = history[0];
  if (latest) {
    const priors = bestByExercise(history.slice(1), latest.id);
    for (const ex of latest.exercises) {
      const meta = EX_META[ex.exId];
      if (meta?.cat === "Cardio") continue;
      let bestW = 0, bestBW = 0;
      for (const s of ex.sets) {
        if (!s.done) continue;
        const m = setMetric(s);
        if (m.kind === "weight" && m.value > bestW)  bestW  = m.value;
        if (m.kind === "bw"     && m.value > bestBW) bestBW = m.value;
      }
      const prev = priors[ex.exId] || { maxWeight: 0, bwReps: 0 };
      const name = EXERCISES[ex.exId] || ex.exId;
      if (bestW > 0 && bestW > prev.maxWeight) {
        obs.push(`New PR on ${isoDate(new Date(latest.date))}: ${name} ${bestW} lbs (prev ${prev.maxWeight || "none"}).`);
        break;
      }
      if (bestBW > 0 && bestBW > prev.bwReps) {
        obs.push(`New bodyweight PR on ${isoDate(new Date(latest.date))}: ${name} ${bestBW} reps (prev ${prev.bwReps || "none"}).`);
        break;
      }
    }
  }

  // Skipped muscle group: any exercise category not seen in last 14 days
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
  const recentCats = new Set();
  for (const w of history) {
    if (new Date(w.date) < cutoff) break;
    for (const ex of w.exercises) {
      const cat = EX_META[ex.exId]?.cat;
      if (cat) recentCats.add(cat);
    }
  }
  for (const cat of ["Legs","Pull","Push"]) {
    if (!recentCats.has(cat) && history.length > 0) obs.push(`No ${cat} day in the last 14 days.`);
  }

  // Focus minutes change
  const wkF = focusSessions.filter(s => thisWeekDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);
  const lastF = focusSessions.filter(s => lastWeekDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);
  if (wkF >= 240) obs.push(`Strong focus week: ${Math.round(wkF/60*10)/10}h logged.`);
  else if (lastF >= 120 && wkF < lastF/2) obs.push(`Focus time down: ${Math.round(wkF/60*10)/10}h this week vs ${Math.round(lastF/60*10)/10}h last.`);

  return obs;
}

function buildRooneyContext({ history, dietLog, activeLog, focusSessions, boards, memories, goals, zone2Log = [], goalLogs = [], customExercises = {} }) {
  const today = isoDate();
  const thisWeekDays = getWeekDays(0);

  const wkWorkouts = history.filter(w => thisWeekDays.includes(isoDate(new Date(w.date)))).length;
  const wkDietGreen = thisWeekDays.filter(d => dietLog[d] === "green").length;
  const wkDietRed   = thisWeekDays.filter(d => dietLog[d] === "red").length;
  const wkActive    = thisWeekDays.filter(d => activeLog[d] === "green").length;
  const wkFocusMins = focusSessions.filter(s => thisWeekDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);
  const wkZone2Mins = zone2Log.filter(z => thisWeekDays.includes(z.date)).reduce((a,z)=>a+(z.minutes||0),0);

  // Compute progress on the user's configured goals
  const goalLines = (Array.isArray(goals) ? goals : []).map(g => {
    const p = computeGoalProgress(g, { history, dietLog, activeLog, zone2Log, goalLogs, weekDays: thisWeekDays, customExercises });
    const tgt = p.type === "max" ? `≤${p.target}` : p.target;
    return `- ${p.label}: ${p.got}/${tgt}${p.unit} ${p.hit ? "(hit)" : "(not yet)"}`;
  }).join("\n");

  const lastWorkout = history[0];
  const totalVol = (wk) => wk.exercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);

  const boardSummary = boards.map(b => {
    const inProgress = b.cols.find(c => c.name.toLowerCase().includes("progress"))?.cards.length || 0;
    const todo = b.cols.find(c => c.name.toLowerCase().includes("todo") || c.name.toLowerCase().includes("backlog"))?.cards.length || 0;
    return `${b.name}: ${todo} to do, ${inProgress} in progress`;
  }).join("; ");

  const allTimeWorkouts = history.length;
  const todayDiet   = dietLog[today]   || "not logged";
  const todayActive = activeLog[today] || "not logged";
  const todayFocusMins = focusSessions.filter(s=>s.date===today).reduce((a,s)=>a+s.mins,0);

  return `You are Rooney, Andrew's personal coach inside his IRON app — a unified personal operating system tracking fitness, diet, activity, focus, and work.

ANDREW'S PROFILE:
- Revenue Strategy & Operations professional, MBA, math background
- Currently between roles, actively job searching (top target: Tulip Interfaces CEO office)
- Also building Glossa, a Greek language learning app (React, Supabase, Claude API)
- Trains at ~200 lbs, lean athletic goal
- Key lifts: bench ~2 plates, deadlift progressing toward 3-4 plates, squat ~2-2.5 plates
- Prefers weight in plates not total lbs when discussing lifting
- Learning Modern Greek (~A2 level)
- Manchester United fan, PC gamer

HOW TRACKING WORKS:
- Andrew logs his lifts (exercises, sets, weights) for progression. He does NOT time workouts — duration doesn't matter, only that he trained.
- His goals are weekly and mostly "did I hit this muscle group N days this week" (binary-ish), plus Zone 2 minutes and diet/activity days.
- Zone 2 is cardio logged with a duration (e.g. "20 min bike"). It counts toward his weekly Zone 2 minutes goal.
- Diet and activity are 3-state daily (green / neutral / red).
- Focus sessions (deep work timer) are separate and NOT one of his fitness goals.

ANDREW'S WEEKLY GOALS (his configured targets, with live progress):
${goalLines || "- (no goals configured)"}

TODAY (${today}):
- Diet: ${todayDiet}
- Activity: ${todayActive}
- Focus session time today: ${todayFocusMins} minutes

THIS WEEK:
- Workout days: ${wkWorkouts}
- Zone 2: ${wkZone2Mins} minutes
- Focus session time: ${wkFocusMins} minutes (${Math.round(wkFocusMins/60*10)/10} hours)
- Diet green days: ${wkDietGreen}, red days: ${wkDietRed}
- Active (green) days: ${wkActive}

${lastWorkout ? `LAST WORKOUT: ${lastWorkout.name} on ${isoDate(new Date(lastWorkout.date))}, ${Math.round(lastWorkout.elapsed/60)} min, ${totalVol(lastWorkout).toLocaleString()} lbs volume, ${lastWorkout.exercises.length} exercises` : "LAST WORKOUT: none logged yet"}

ALL TIME: ${allTimeWorkouts} workouts logged

WORK BOARDS: ${boardSummary || "no boards"}

RECENT FOCUS SESSIONS: ${focusSessions.slice(0,3).map(s=>`${s.label} (${s.mins}m on ${s.date})`).join(", ") || "none yet"}

${(memories && memories.length > 0) ? `ROONEY'S MEMORY OF ANDREW (across all past conversations — reference these when relevant):
${memories.map(m => `- [${m.category} · id=${m.id}] ${m.text}`).join("\n")}
` : `ROONEY'S MEMORY OF ANDREW: empty so far. As Andrew shares enduring facts (injuries, preferences, goals, life context, people he mentions), use the remember() tool to save them.`}

${(() => {
  const obs = computeObservations({ history, dietLog, activeLog, focusSessions, goals });
  if (obs.length === 0) return "OBSERVATIONS THIS WEEK: nothing notable to flag.";
  return `OBSERVATIONS THIS WEEK (use these proactively when relevant — Andrew may not have noticed):
${obs.map(o => "- " + o).join("\n")}`;
})()}

YOUR ROLE:
- Be honest and direct but warm and supportive — never sycophantic
- Reference Andrew's actual data when relevant, don't make things up
- Keep responses concise — this is a mobile chat, not an essay
- You can give workout suggestions, diet nudges, focus tips, or job search encouragement
- Use plates (not total lbs) when discussing lifting
- No em-dashes in your responses
- Sign off occasionally as Rooney but don't overdo it

TOOLS YOU CAN USE:
You have tools to mutate Andrew's data and your own memory: log_workout, log_diet, log_activity, add_kanban_card, remember, forget.
- Today's date is ${today}. When Andrew says "yesterday", "last Monday", etc., resolve to ISO YYYY-MM-DD relative to ${today}.
- For log_workout: if Andrew gives you enough detail (exercises, sets/reps/weight), call the tool. If he's vague ("I worked out yesterday"), ASK for what he did and approximate duration before calling. Don't invent specifics.
- For log_diet / log_activity: call directly when he describes his day.
- For add_kanban_card: existing boards are listed above under WORK BOARDS. Match by partial name (case-insensitive). If the board doesn't exist, ask before creating.
- For remember: use sparingly but proactively. When Andrew shares a durable fact about himself — an injury ("my left knee acts up"), a preference ("I hate cardio mornings"), a life context ("I have a Tulip interview Thursday"), a person (his coach "Mike at the gym"), or a long-term goal ("I want to deadlift 4 plates by July") — call remember() so future conversations have it. Don't ask permission, just do it and briefly note "noted." Don't remember trivial throwaway comments.
- For forget: only call when Andrew explicitly says to drop a memory, OR when a memory in ROONEY'S MEMORY OF ANDREW is clearly contradicted by new info. Use the id shown in brackets.
- After calling a tool, briefly confirm what you did (one sentence). Don't repeat the data — the tool already updated the app.
- NEVER call a tool to delete or overwrite data without explicit confirmation. log_diet / log_activity overwrite existing values for that date, so confirm if a value is already set.`;
}

function RooneyChat({ history, dietLog, activeLog, focusSessions, boards, memories=[], goals, zone2Log=[], goalLogs=[], customExercises={}, persistedMessages=null, onSaveConversation, onClearConversation, onLogWorkout, onBuildWorkout, onLogDiet, onLogActivity, onAddCard, onRemember, onForget, onDeleteMemory, onClose }) {
  const GREETING = { role:"assistant", content: "Hey Andrew. I'm Rooney. I remember our past conversations and what you tell me. I can also log past workouts, diet days, activity, Zone 2, or todo cards. What's on your mind?" };
  const [messages, setMessages] = useState(() =>
    (persistedMessages && persistedMessages.length > 0) ? persistedMessages : [GREETING]
  );
  const [showMemPanel, setShowMemPanel] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const savedOnceRef = useRef(false);
  // The conversation loads from Supabase asynchronously. If it arrives after
  // mount and the user hasn't chatted yet, adopt it so history is continuous.
  const adoptedRef = useRef(!!(persistedMessages && persistedMessages.length > 0));
  useEffect(() => {
    if (adoptedRef.current) return;
    if (persistedMessages && persistedMessages.length > 0) {
      adoptedRef.current = true;
      setMessages(persistedMessages);
    }
  }, [persistedMessages]);

  // Persist conversation whenever it changes (after the first render)
  useEffect(() => {
    if (!savedOnceRef.current) { savedOnceRef.current = true; return; }
    if (onSaveConversation && messages.length > 0) onSaveConversation(messages);
  }, [messages]);

  function newConversation() {
    setMessages([GREETING]);
    if (onClearConversation) onClearConversation();
  }

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  useEffect(()=>{ setTimeout(()=>inputRef.current?.focus(), 100); }, []);

  function executeTool(name, input) {
    try {
      if (name === "log_workout") {
        const r = onLogWorkout(input);
        return { ok: true, summary: r.summary };
      }
      if (name === "build_workout") {
        const r = onBuildWorkout(input);
        return { ok: r.ok !== false, summary: r.summary };
      }
      if (name === "log_diet") {
        const r = onLogDiet(input.date, input.status);
        return { ok: true, summary: r.summary };
      }
      if (name === "log_activity") {
        const r = onLogActivity(input.date, input.status);
        return { ok: true, summary: r.summary };
      }
      if (name === "add_kanban_card") {
        const r = onAddCard(input);
        return { ok: r.ok, summary: r.summary };
      }
      if (name === "remember") {
        const r = onRemember(input.category, input.text);
        return { ok: true, summary: r.summary };
      }
      if (name === "forget") {
        const r = onForget(input.memory_id);
        return { ok: true, summary: r.summary };
      }
      return { ok: false, summary: `Unknown tool: ${name}` };
    } catch (e) {
      return { ok: false, summary: `Tool failed: ${e.message || String(e)}` };
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg = { role:"user", content: text };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setLoading(true);

    const systemPrompt = buildRooneyContext({ history, dietLog, activeLog, focusSessions, boards, memories, goals, zone2Log, goalLogs, customExercises });

    // Convert displayed messages into API messages (drop UI-only fields).
    // Cap to the last 40 turns so a long thread stays affordable + within limits.
    let apiMessages = nextMsgs.slice(-40).map(m => ({ role: m.role, content: m.content }));

    const collectedToolCalls = [];

    try {
      // Tool-use loop: keep calling API until we get a normal text response
      for (let turn = 0; turn < 6; turn++) {
        const res = await fetch("/api/rooney", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1500,
            system: systemPrompt,
            tools: ROONEY_TOOLS,
            messages: apiMessages,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          setMessages(m => [...m, { role:"assistant", content: `API error ${res.status}: ${errBody.slice(0,300)}` }]);
          setLoading(false);
          return;
        }

        const data = await res.json();
        const blocks = data.content || [];
        const toolUses = blocks.filter(b => b.type === "tool_use");
        const textBlock = blocks.find(b => b.type === "text");

        if (toolUses.length === 0) {
          // Done — text response
          const reply = textBlock?.text?.trim() || "(no reply)";
          setMessages(m => [...m, { role:"assistant", content: reply, toolCalls: collectedToolCalls.slice() }]);
          setLoading(false);
          return;
        }

        // Execute each tool, build tool_result blocks
        const toolResults = [];
        for (const tu of toolUses) {
          const result = executeTool(tu.name, tu.input);
          collectedToolCalls.push({ name: tu.name, input: tu.input, ok: result.ok, summary: result.summary });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: result.summary,
            is_error: !result.ok,
          });
        }

        // Append the assistant's tool_use turn AND the user's tool_result turn
        apiMessages.push({ role: "assistant", content: blocks });
        apiMessages.push({ role: "user", content: toolResults });
      }

      // Safety: hit turn limit
      setMessages(m => [...m, { role:"assistant", content: "I got stuck in a tool loop. Try rephrasing.", toolCalls: collectedToolCalls.slice() }]);
    } catch (e) {
      setMessages(m => [...m, { role:"assistant", content: `Connection issue: ${e.message || "unknown"}. On localhost, the /api/rooney endpoint only works under \`vercel dev\` (not plain \`npm run dev\`). In production it runs as a Vercel function.` }]);
    }
    setLoading(false);
  }

  const SUGGESTIONS = [
    "How am I tracking this week?",
    "What should I train today given my recent workouts?",
    "I worked out yesterday — log it",
    "Suggest a good progression goal for my bench",
    "Add 'follow up with Carla' to my Job Search board",
  ];

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.7)"}}>
      <div style={{width:"100%",maxWidth:480,height:"82vh",background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"16px 18px",borderBottom:"1px solid #1a1a1a",flexShrink:0}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B35,#38bdf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#000",fontFamily:"monospace",flexShrink:0}}>R</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace"}}>Rooney</div>
            <div style={{fontSize:10,color:"#444",fontFamily:"monospace"}}>Your personal coach · {memories.length} memor{memories.length===1?"y":"ies"}</div>
          </div>
          <button title="Start a new conversation" style={{background:"transparent",border:"none",color:"#666",fontSize:11,cursor:"pointer",fontFamily:"monospace",lineHeight:1,marginRight:6}} onClick={newConversation}>New</button>
          <button title="What Rooney remembers about you" style={{background:"transparent",border:"none",color:memories.length>0?"#FF6B35":"#444",fontSize:18,cursor:"pointer",lineHeight:1,marginRight:4}} onClick={()=>setShowMemPanel(true)}>🧠</button>
          <button style={{background:"transparent",border:"none",color:"#444",fontSize:20,cursor:"pointer",lineHeight:1}} onClick={onClose}>✕</button>
        </div>

        {showMemPanel && (
          <div onClick={()=>setShowMemPanel(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:5,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"calc(100% - 24px)",maxWidth:440,maxHeight:"calc(82vh - 80px)",background:"#0d0d0d",border:"1px solid #2a2a2a",borderRadius:14,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:"1px solid #1a1a1a"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace"}}>🧠 What Rooney remembers</div>
                  <div style={{fontSize:10,color:"#555",fontFamily:"monospace",marginTop:2}}>Loaded into every conversation. Tap ✕ on any item to delete.</div>
                </div>
                <button style={{background:"transparent",border:"none",color:"#555",fontSize:18,cursor:"pointer"}} onClick={()=>setShowMemPanel(false)}>✕</button>
              </div>
              <div style={{overflowY:"auto",padding:"10px 14px 16px"}}>
                {memories.length === 0 ? (
                  <div style={{textAlign:"center",color:"#555",fontSize:12,fontFamily:"monospace",padding:"30px 10px",lineHeight:1.6}}>
                    Nothing yet. As you chat with Rooney and share things about yourself (injuries, preferences, goals, life context), Rooney will start saving them here.
                  </div>
                ) : (
                  Object.entries(memories.reduce((acc,m)=>{(acc[m.category]||=[]).push(m); return acc;}, {})).map(([cat, items]) => (
                    <div key={cat} style={{marginBottom:14}}>
                      <div style={{fontSize:9,color:"#555",fontFamily:"monospace",letterSpacing:"0.15em",marginBottom:6,fontWeight:700}}>{cat.toUpperCase()}</div>
                      {items.map(m => (
                        <div key={m.id} style={{display:"flex",alignItems:"flex-start",gap:8,background:"#161616",border:"1px solid #1e1e1e",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                          <div style={{flex:1,fontSize:12,color:"#cfcfcf",fontFamily:"monospace",lineHeight:1.5}}>{m.text}</div>
                          <button onClick={()=>onDeleteMemory(m.id)} style={{background:"transparent",border:"none",color:"#444",fontSize:12,cursor:"pointer",padding:2,lineHeight:1}}>✕</button>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px",display:"flex",flexDirection:"column",gap:10}}>
          {messages.map((m,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:6}}>
              {m.toolCalls && m.toolCalls.length>0 && (
                <div style={{display:"flex",flexDirection:"column",gap:4,maxWidth:"82%"}}>
                  {m.toolCalls.map((tc,ti)=>(
                    <div key={ti} style={{fontSize:10,color:tc.ok?"#FF6B35":"#dc2626",fontFamily:"monospace",background:tc.ok?"rgba(255,107,53,0.07)":"rgba(220,38,38,0.08)",border:`1px solid ${tc.ok?"rgba(255,107,53,0.3)":"rgba(220,38,38,0.3)"}`,borderRadius:8,padding:"6px 10px",letterSpacing:"0.02em",lineHeight:1.5}}>
                      <span style={{opacity:0.7,marginRight:6}}>{tc.ok?"✓":"⚠"} {tc.name}</span>{tc.summary}
                    </div>
                  ))}
                </div>
              )}
              <div style={{
                maxWidth:"82%", padding:"10px 14px", borderRadius: m.role==="user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.role==="user" ? "#FF6B35" : "#1a1a1a",
                color: m.role==="user" ? "#000" : "#e8e8e8",
                fontSize:13, fontFamily:"monospace", lineHeight:1.55,
                border: m.role==="assistant" ? "1px solid #222" : "none",
                whiteSpace:"pre-wrap",
              }}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div style={{display:"flex",justifyContent:"flex-start"}}>
              <div style={{background:"#1a1a1a",border:"1px solid #222",borderRadius:"14px 14px 14px 4px",padding:"10px 16px",display:"flex",gap:4,alignItems:"center"}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#444",animation:`bounce 1s ${i*0.2}s infinite`}}/>)}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Suggestion chips */}
        {messages.length <= 2 && (
          <div style={{display:"flex",gap:6,padding:"0 16px 10px",overflowX:"auto",flexShrink:0}}>
            {SUGGESTIONS.map(s=>(
              <button key={s} style={{flexShrink:0,background:"#161616",border:"1px solid #2a2a2a",borderRadius:20,padding:"6px 12px",fontSize:11,color:"#666",cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap"}}
                onClick={()=>{setInput(s);setTimeout(()=>inputRef.current?.focus(),50);}}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{padding:"10px 14px 20px",borderTop:"1px solid #1a1a1a",display:"flex",gap:8,flexShrink:0}}>
          <input ref={inputRef} style={{flex:1,background:"#161616",border:"1px solid #2a2a2a",borderRadius:12,color:"#e8e8e8",padding:"10px 14px",fontSize:13,fontFamily:"monospace",outline:"none"}}
            placeholder="Ask Rooney anything…" value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/>
          <button style={{background:input.trim()?"#FF6B35":"#1a1a1a",color:input.trim()?"#000":"#444",border:"none",borderRadius:12,width:44,fontSize:18,cursor:input.trim()?"pointer":"default",transition:"all 0.2s",fontFamily:"monospace"}}
            onClick={send}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────
function CenteredCard({ children }) {
  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:MONO,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{maxWidth:380,width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:28}}>
        {children}
      </div>
    </div>
  );
}

function SetupRequiredScreen() {
  return (
    <CenteredCard>
      <div style={{fontSize:32,marginBottom:12,textAlign:"center"}}>⚙</div>
      <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:MONO,marginBottom:8,letterSpacing:"0.05em"}}>Setup required</div>
      <div style={{fontSize:13,color:C.muted,fontFamily:MONO,lineHeight:1.6}}>
        Supabase env vars are missing. Add <span style={{color:C.accent}}>VITE_SUPABASE_URL</span> and <span style={{color:C.accent}}>VITE_SUPABASE_ANON_KEY</span> in your Vercel project settings, then redeploy.
      </div>
    </CenteredCard>
  );
}

function LoadingScreen({ text="Loading..." }) {
  return (
    <CenteredCard>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.accent,animation:`bounce 1s ${i*0.18}s infinite`}}/>)}
      </div>
      <div style={{fontSize:12,color:C.muted,fontFamily:MONO,textAlign:"center",letterSpacing:"0.1em"}}>{text}</div>
    </CenteredCard>
  );
}

function SignInScreen({ onSignIn, onSignUp, onResetPassword }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr(null); setMsg(null);
    if (!email.trim()) { setErr("Enter your email."); return; }
    if (!password) { setErr("Enter a password."); return; }

    if (mode === "signup") {
      if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
      if (password !== confirm) { setErr("Passwords don't match."); return; }
      setBusy(true);
      const { data, error } = await onSignUp(email.trim(), password);
      setBusy(false);
      if (error) {
        setErr(error.message?.includes("already") ? "An account with that email already exists. Switch to Sign in." : (error.message || "Sign-up failed."));
      } else if (data?.user && !data?.session) {
        // Email confirmation is still ON in Supabase — tell them
        setMsg("Account created, but email confirmation is enabled. Disable it in Supabase (Authentication > Providers > Email > turn off Confirm email) for instant sign-in.");
      }
      // If session exists, onAuthStateChange flips the screen automatically
    } else {
      setBusy(true);
      const { error } = await onSignIn(email.trim(), password);
      setBusy(false);
      if (error) setErr(error.message?.includes("Invalid") ? "Wrong email or password." : (error.message || "Sign-in failed."));
    }
  }

  async function forgot() {
    setErr(null); setMsg(null);
    if (!email.trim()) { setErr("Type your email above first, then tap Forgot password."); return; }
    setBusy(true);
    const { error } = await onResetPassword(email.trim());
    setBusy(false);
    if (error) setErr(error.message || "Couldn't send reset email.");
    else setMsg("Password reset email sent. Check your inbox and follow the link to set a new password.");
  }

  const isSignup = mode === "signup";

  return (
    <CenteredCard>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <BarbellMark size={32}/>
        <span style={{fontSize:20,fontWeight:700,letterSpacing:"0.2em",color:"#fff",fontFamily:MONO}}>IRON</span>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:"#161616",border:`1px solid ${C.border}`,borderRadius:10,padding:3,marginBottom:18}}>
        {[{k:"signin",label:"Sign in"},{k:"signup",label:"Sign up"}].map(t => (
          <button key={t.k} onClick={()=>{setMode(t.k);setErr(null);setMsg(null);}} style={{
            flex:1, background: mode===t.k ? C.accent : "transparent",
            color: mode===t.k ? "#000" : C.muted, border:"none", borderRadius:7,
            padding:"8px 0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:MONO, letterSpacing:"0.05em",
          }}>{t.label}</button>
        ))}
      </div>

      <form onSubmit={submit}>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,lineHeight:1.5,marginBottom:14}}>
          {isSignup ? "Pick an email and password. That's it — you're in." : "Enter your email and password."}
        </div>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" autoFocus required autoComplete="email"
          style={{width:"100%",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,padding:"11px 14px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" required
          autoComplete={isSignup ? "new-password" : "current-password"}
          style={{width:"100%",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,padding:"11px 14px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        {isSignup && (
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="confirm password" required autoComplete="new-password"
            style={{width:"100%",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,padding:"11px 14px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        )}
        <button type="submit" disabled={busy}
          style={{width:"100%",background:C.accent,color:"#000",border:"none",borderRadius:10,padding:"12px",fontSize:13,fontWeight:700,cursor:busy?"default":"pointer",fontFamily:MONO,opacity:busy?0.5:1,letterSpacing:"0.05em",marginTop:4}}>
          {busy ? (isSignup?"Creating account...":"Signing in...") : (isSignup?"Create account":"Sign in")}
        </button>
      </form>

      {!isSignup && (
        <button onClick={forgot} disabled={busy} style={{background:"transparent",border:"none",color:C.muted,padding:"10px 0 0",fontSize:11,cursor:"pointer",fontFamily:MONO,textDecoration:"underline"}}>Forgot password?</button>
      )}

      {err && <div style={{fontSize:11,color:C.red,fontFamily:MONO,marginTop:12,lineHeight:1.5}}>{err}</div>}
      {msg && <div style={{fontSize:11,color:C.green,fontFamily:MONO,marginTop:12,lineHeight:1.5}}>{msg}</div>}
    </CenteredCard>
  );
}

// One editable goal card inside the goals editor.
function GoalEditRow({ g, onChange, onRemove }) {
  const isTimed = g.type === "timed";
  const isMax = (GOAL_KINDS[g.kind]?.type) === "max";
  const step = isTimed ? 10 : 1;
  const max  = isTimed ? 600 : 7;
  const unit = isTimed ? "min/wk" : isMax ? "max days/wk" : "days/wk";
  const typeLabel = isTimed ? "Timed" : g.type === "workout" ? "Workout" : "Habit";
  const bump = (delta) => onChange({ ...g, target: Math.max(isTimed?0:1, Math.min(max, (g.target||0) + delta)) });
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <input value={g.emoji||""} onChange={e=>onChange({ ...g, emoji: e.target.value.slice(0,2) })} maxLength={2}
          style={{width:36,flexShrink:0,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"7px 0",fontSize:16,textAlign:"center",outline:"none"}}/>
        <input value={g.label||""} onChange={e=>onChange({ ...g, label: e.target.value })} placeholder="Goal name"
          style={{flex:1,minWidth:0,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box"}}/>
        <button title="Remove goal" onClick={onRemove} style={{width:30,height:30,flexShrink:0,background:"transparent",border:"none",color:"#777",fontSize:14,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}>
        <span style={{fontSize:10,color:C.muted,fontFamily:MONO}}>{typeLabel}{g.group?` · ${g.group}`:""}</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <button onClick={()=>bump(-step)} style={{width:28,height:28,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:14,cursor:"pointer",fontFamily:MONO}}>−</button>
          <span style={{width:40,textAlign:"center",fontSize:14,color:C.text,fontFamily:MONO,fontWeight:700}}>{g.target ?? 0}</span>
          <button onClick={()=>bump(step)} style={{width:28,height:28,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:14,cursor:"pointer",fontFamily:MONO}}>+</button>
          <span style={{fontSize:9,color:C.dim,fontFamily:MONO,width:54,textAlign:"right"}}>{unit}</span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {GOAL_COLORS.map(col => (
            <button key={col} onClick={()=>onChange({ ...g, color: col })} aria-label="Pick color"
              style={{width:20,height:20,borderRadius:"50%",background:col,border:g.color===col?`2px solid #fff`:`2px solid transparent`,cursor:"pointer",padding:0}}/>
          ))}
        </div>
        <button onClick={()=>onChange({ ...g, active: g.active===false })}
          style={{flexShrink:0,background:g.active===false?"transparent":g.color+"22",border:`1px solid ${g.active===false?C.border2:g.color}`,borderRadius:7,color:g.active===false?C.muted:g.color,fontSize:10,fontFamily:MONO,padding:"5px 10px",cursor:"pointer"}}>
          {g.active===false?"Off":"Active"}
        </button>
      </div>
    </div>
  );
}

function GoalsEditor({ goals, onSave, onClose, onReset }) {
  const [draft, setDraft] = useState(() => goals.map(g => normalizeGoal({ ...g })));
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("habit");     // workout | habit | timed
  const [newGroup, setNewGroup] = useState("Any workout");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(GOAL_COLORS[1]);
  const [newEmoji, setNewEmoji] = useState("");

  function updateGoal(id, next) { setDraft(d => d.map(g => g.id === id ? next : g)); }
  function removeGoal(id) { setDraft(d => d.filter(g => g.id !== id)); }

  function resetAddForm() { setAdding(false); setNewType("habit"); setNewGroup("Any workout"); setNewName(""); setNewColor(GOAL_COLORS[1]); setNewEmoji(""); }
  function addGoal() {
    let kind, group;
    if (newType === "workout") {
      if (newGroup === "Any workout") { kind = "workouts"; }
      else { kind = "muscle"; group = newGroup; }
    } else if (newType === "timed") { kind = "timed"; }
    else { kind = "habit"; }
    const label = newName.trim() || (group || (newType==="timed"?"Timed goal":newType==="workout"?"Workout":"New habit"));
    const target = GOAL_KINDS[kind]?.defaultTarget ?? (newType==="timed"?60:3);
    const g = normalizeGoal({
      id: "g_" + Math.random().toString(36).slice(2,8),
      kind, type: newType, group, label, target,
      color: newColor, emoji: newEmoji.trim() || undefined, active: true,
    });
    setDraft(d => [...d, g]);
    resetAddForm();
  }

  const TYPE_OPTS = [
    { key:"workout", label:"Workout", hint:"Hit the gym" },
    { key:"habit",   label:"Habit",   hint:"Daily yes/no" },
    { key:"timed",   label:"Timed",   hint:"Minutes/week" },
  ];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:150,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"90vh",display:"flex",flexDirection:"column",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 18px",paddingTop:"calc(16px + env(safe-area-inset-top))",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:"#0d0d0d",zIndex:2}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>Your Goals</div>
            <div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginTop:2}}>Workouts, habits, skills — anything you want to build consistently.</div>
          </div>
          <button style={{background:"transparent",border:"none",color:C.muted,fontSize:16,cursor:"pointer"}} onClick={onClose}>✕</button>
        </div>

        <div style={{padding:"12px 16px"}}>
          {draft.map(g => (
            <GoalEditRow key={g.id} g={g} onChange={next=>updateGoal(g.id, next)} onRemove={()=>removeGoal(g.id)} />
          ))}

          {adding ? (
            <div style={{background:"#161616",border:`1px solid ${C.accent}`,borderRadius:12,padding:14,marginTop:6}}>
              <div style={{fontSize:11,color:C.accent,fontFamily:MONO,marginBottom:12,letterSpacing:"0.1em",fontWeight:700}}>NEW GOAL</div>

              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {TYPE_OPTS.map(t => (
                  <button key={t.key} onClick={()=>setNewType(t.key)}
                    style={{flex:1,background:newType===t.key?C.accent+"22":"#1a1a1a",border:`1px solid ${newType===t.key?C.accent:C.border2}`,borderRadius:8,padding:"8px 4px",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:12,color:newType===t.key?C.accent:C.text,fontFamily:MONO,fontWeight:700}}>{t.label}</div>
                    <div style={{fontSize:8.5,color:C.muted,fontFamily:MONO,marginTop:2}}>{t.hint}</div>
                  </button>
                ))}
              </div>

              {newType === "workout" && (
                <select value={newGroup} onChange={e=>setNewGroup(e.target.value)} style={{width:"100%",background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px",fontSize:12,fontFamily:MONO,outline:"none",marginBottom:8}}>
                  <option value="Any workout">Any workout</option>
                  {Object.keys(MUSCLE_GROUPS).map(grp => <option key={grp} value={grp}>{grp}</option>)}
                </select>
              )}

              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <input value={newEmoji} onChange={e=>setNewEmoji(e.target.value.slice(0,2))} maxLength={2} placeholder="🙂"
                  style={{width:42,flexShrink:0,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px 0",fontSize:16,textAlign:"center",outline:"none"}}/>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder={newType==="workout"?(newGroup==="Any workout"?"Name (e.g. Lift)":`Name (default: ${newGroup})`):newType==="timed"?"Name (e.g. Read, Meditate)":"Name (e.g. Floss, Journal)"}
                  style={{flex:1,minWidth:0,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px 10px",fontSize:12,fontFamily:MONO,outline:"none",boxSizing:"border-box"}}/>
              </div>

              <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>
                {GOAL_COLORS.map(col => (
                  <button key={col} onClick={()=>setNewColor(col)} aria-label="Pick color"
                    style={{width:24,height:24,borderRadius:"50%",background:col,border:newColor===col?`2px solid #fff`:`2px solid transparent`,cursor:"pointer",padding:0}}/>
                ))}
              </div>

              <div style={{display:"flex",gap:6}}>
                <button style={{flex:1,background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"9px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO}} onClick={addGoal}>Add goal</button>
                <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 14px",fontSize:12,cursor:"pointer",fontFamily:MONO}} onClick={resetAddForm}>Cancel</button>
              </div>
            </div>
          ) : (
            <button style={{width:"100%",background:"transparent",border:`1px dashed ${C.accent}`,borderRadius:10,color:C.accent,padding:"12px",fontSize:12,cursor:"pointer",fontFamily:MONO,marginTop:4,letterSpacing:"0.05em"}} onClick={()=>setAdding(true)}>+ Add a goal</button>
          )}
        </div>

        <div style={{display:"flex",gap:8,padding:"12px 16px",paddingBottom:"calc(12px + env(safe-area-inset-bottom))",borderTop:`1px solid ${C.border}`,position:"sticky",bottom:0,background:"#0d0d0d"}}>
          <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={onReset}>Reset</button>
          <div style={{flex:1}}/>
          <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={onClose}>Cancel</button>
          <button style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"10px 18px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO}} onClick={()=>onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS SHEET ───────────────────────────────────────────────────────────
function SettingsSheet({ userEmail, goals = [], onEditGoals, onUpdatePassword, onSignOut, onClearAll, onPreviewPerfectDay, onPreviewPR, onClose }) {
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  async function savePassword(){
    if (!newPw || newPw.length < 6 || pwBusy || !onUpdatePassword) return;
    setPwBusy(true); setPwMsg(null);
    const { error } = await onUpdatePassword(newPw);
    setPwBusy(false);
    if (error) setPwMsg({ kind:"err", text: error.message || "Couldn't update password." });
    else { setPwMsg({ kind:"ok", text: "Password saved. Use it to sign in next time." }); setNewPw(""); setShowPwForm(false); setTimeout(()=>setPwMsg(null), 4000); }
  }
  const typeName = { workout:"Workout", habit:"Habit", timed:"Timed" };
  const goalSub = (g) => {
    const n = normalizeGoal(g);
    const t = typeName[n.type] || "Goal";
    const freq = n.type === "timed" ? `${n.target} min/wk`
      : (GOAL_KINDS[n.kind]?.type === "max" ? `≤${n.target}/wk` : `${n.target}×/wk`);
    return `${t} · ${freq}`;
  };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:170,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,maxHeight:"90vh",background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 18px",paddingTop:"calc(16px + env(safe-area-inset-top))",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:"#0d0d0d"}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO,letterSpacing:"0.05em"}}>Settings</div>
          <button style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer"}} onClick={onClose}>✕</button>
        </div>

        <div style={{padding:"16px 16px calc(24px + env(safe-area-inset-bottom))"}}>
          {/* Your Goals */}
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:10,fontWeight:700}}>YOUR GOALS</div>
          <div style={{marginBottom:8}}>
            {goals.length===0 ? (
              <div style={{fontSize:11,color:C.muted,fontFamily:MONO,padding:"4px 0 10px"}}>No goals yet.</div>
            ) : goals.map(g=>(
              <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",marginBottom:6,opacity:g.active===false?0.5:1}}>
                <span style={{fontSize:13,color:C.text,fontFamily:MONO,display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                  <span style={{fontSize:14}}>{normalizeGoal(g).emoji}</span>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.label || g.group || g.kind}</span>
                </span>
                <span style={{fontSize:10,color:C.muted,fontFamily:MONO,flexShrink:0,marginLeft:8}}>{goalSub(g)}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>{onClose();onEditGoals();}} style={{width:"100%",background:"transparent",border:`1px solid ${C.accent}`,borderRadius:10,color:C.accent,padding:"11px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:MONO,marginBottom:22}}>Manage goals</button>

          {/* Account */}
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:10,fontWeight:700}}>ACCOUNT</div>
          {userEmail && <div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginBottom:10}}>Signed in as <span style={{color:C.text}}>{userEmail}</span></div>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {onUpdatePassword && <button onClick={()=>{setShowPwForm(s=>!s);setPwMsg(null);}} style={{background:"transparent",border:`1px solid ${C.accent}55`,borderRadius:8,color:C.accent,padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}}>{showPwForm?"Cancel":"Set / change password"}</button>}
            {onSignOut && <button onClick={onSignOut} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}}>Sign out</button>}
          </div>
          {showPwForm && (
            <div style={{background:C.card,border:`1px solid ${C.accent}55`,borderRadius:10,padding:12,marginBottom:10}}>
              <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginBottom:8}}>Pick a password (min 6 chars).</div>
              <input type="password" autoComplete="new-password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="new password" minLength={6}
                style={{width:"100%",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
              <button onClick={savePassword} disabled={newPw.length<6||pwBusy} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:newPw.length>=6&&!pwBusy?"pointer":"default",fontFamily:MONO,opacity:newPw.length>=6&&!pwBusy?1:0.4}}>{pwBusy?"Saving...":"Save password"}</button>
            </div>
          )}
          {pwMsg && <div style={{fontSize:10,color:pwMsg.kind==="ok"?C.green:C.red,fontFamily:MONO,marginBottom:10}}>{pwMsg.text}</div>}

          {/* Data */}
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",margin:"22px 0 10px",fontWeight:700}}>DATA</div>
          <button onClick={onClearAll} style={{background:"transparent",border:`1px solid ${C.red}55`,borderRadius:8,color:C.red,padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}}>Clear all data</button>

          {(onPreviewPerfectDay || onPreviewPR) && (
            <>
              <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",margin:"22px 0 10px",fontWeight:700}}>FUN</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {onPreviewPerfectDay && <button onClick={onPreviewPerfectDay} style={{background:"transparent",border:`1px solid #22ee6655`,borderRadius:8,color:"#22ee66",padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}}>⭐ Preview Perfect Day</button>}
                {onPreviewPR && <button onClick={onPreviewPR} style={{background:"transparent",border:`1px solid ${C.accent}55`,borderRadius:8,color:C.accent,padding:"9px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}}>🏆 Preview PR popup</button>}
              </div>
              <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:8,lineHeight:1.6}}>Perfect Day auto-fires once per day when you log a workout + 🟢 diet + 🟢 active. A real PR fires when a set beats the purple "PR" chip shown on each exercise during a workout — that chip is your historical best.</div>
            </>
          )}

          {/* Build version — so you can verify the app picked up the latest deploy */}
          <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:24,paddingTop:14,borderTop:`1px solid ${C.border}`,lineHeight:1.6,letterSpacing:"0.05em"}}>
            BUILD <span style={{color:C.sub}}>{(typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev").slice(0,16).replace("T"," ")} UTC</span>
            <div style={{marginTop:4}}>If the build time isn't recent, the iPhone app is on a cached version — fully close it (swipe up) and reopen, or remove from the home screen and re-add from Safari.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // === Hooks (all called unconditionally — React rules) ===
  const auth = useAuth();
  const userId = auth.user?.id || null;
  const workoutsState = useWorkouts(userId);
  const dietState     = useDietLog(userId);
  const activityState = useActivityLog(userId);
  const focusState    = useFocusSessions(userId);
  const boardsState   = useBoards(userId);
  const customExState = useCustomExercises(userId);
  const memoriesState = useRooneyMemories(userId);
  const zone2State    = useZone2Log(userId);
  const settingsState = useSettings(userId, DEFAULT_GOAL_LIST);
  const convoState    = useRooneyConversation(userId);
  const goalLogsState = useGoalLogs(userId);
  const goalSnapsState = useGoalSnapshots(userId);
  const bwState       = useBodyweight(userId);

  // ── Multi-device sync ─────────────────────────────────────────────────────
  // Refetch every table when the user comes back to this device (window focus
  // or tab visibility change), plus a light 60-second heartbeat while active.
  // Uses a single ref so the sync effect below isn't rebound on every render.
  const refreshAllRef = useRef(() => {});
  refreshAllRef.current = () => {
    if (!userId) return;
    workoutsState.refresh?.();
    dietState.refresh?.();
    activityState.refresh?.();
    focusState.refresh?.();
    boardsState.refresh?.();
    customExState.refresh?.();
    memoriesState.refresh?.();
    zone2State.refresh?.();
    settingsState.refresh?.();
    convoState.refresh?.();
    goalLogsState.refresh?.();
    goalSnapsState.refresh?.();
    bwState.refresh?.();
  };
  useEffect(() => {
    if (!userId) return;
    function onVisible() { if (document.visibilityState === "visible") refreshAllRef.current(); }
    function onFocus() { refreshAllRef.current(); }
    // pageshow catches Safari/Chrome back-forward cache restores — that path
    // skips normal load hooks and would otherwise show stale cross-device data.
    function onPageShow(e) { if (e.persisted) refreshAllRef.current(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    // Faster heartbeat (30s) — cheap RLS-scoped selects, adds up to ~2/min.
    const interval = setInterval(() => { if (document.visibilityState === "visible") refreshAllRef.current(); }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      clearInterval(interval);
    };
  }, [userId]);

  // UI state
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState("home");
  const [wkInit, setWkInit] = useState(null);
  const [completedWk, setCompletedWk] = useState(null);
  const [editingWk, setEditingWk] = useState(null);
  const [showRooney, setShowRooney] = useState(false);
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPerfectDay, setShowPerfectDay] = useState(false);
  const [previewPR, setPreviewPR] = useState(null);

  // ── In-progress workout draft ─────────────────────────────────────────────
  // Lives in localStorage (device-local by nature — you're mid-session on one
  // device). Nothing reaches your workout history until you tap "Lock it in".
  const DRAFT_KEY = "iron_workout_draft";
  const [workoutDraft, setWorkoutDraft] = useState(() => {
    try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  function saveWorkoutDraft(d) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
    setWorkoutDraft(d);
  }
  function clearWorkoutDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setWorkoutDraft(null);
  }

  async function hardRefresh() {
    setRefreshing(true);
    try {
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
      if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
    } catch (e) { console.error("hardRefresh:", e); }
    window.location.reload();
  }
  const [migrationSummary, setMigrationSummary] = useState(null);

  // Editable weekly goals (configurable list, cloud-synced via user_settings).
  // Drop any legacy perfect_days goals (retired — redundant with the individual
  // goals), then normalize so every goal has type/color/emoji/active.
  const goalList = (settingsState.goals && settingsState.goals.length ? settingsState.goals : DEFAULT_GOAL_LIST)
    .filter(g => g.kind !== "perfect_days")
    .map(normalizeGoal);
  // Every goal-list edit also records a timestamped snapshot so the Trends
  // heatmap can evaluate past days against the goals that were ACTIVE at the time.
  async function setGoalList(nextGoals) {
    await settingsState.setGoals(nextGoals);
    goalSnapsState.saveSnapshot(nextGoals);
  }
  const zone2Log = zone2State.data;
  const goalLogs = goalLogsState.data;

  // Migrate any pre-existing localStorage data into Supabase on first sign-in
  useEffect(() => {
    if (!userId) return;
    migrateLocalStorage(userId).then(r => {
      if (r?.migrated && r.summary) {
        const total = Object.values(r.summary).reduce((a,n)=>a+n,0);
        if (total > 0) setMigrationSummary(r.summary);
      }
    });
  }, [userId]);

  // Perfect Day celebration — fires the moment all three conditions land for
  // today (workout + clean diet + active), once per calendar day. MUST live
  // before any early returns so hook order stays consistent across renders.
  useEffect(() => {
    const t = isoDate();
    const KEY = `iron_perfect_${t}`;
    try { if (localStorage.getItem(KEY)) return; } catch { return; }
    const dl = dietState.data || {};
    const al = activityState.data || {};
    const h  = workoutsState.data || [];
    const dietGreen   = dl[t] === "green";
    const activeGreen = al[t] === "green";
    const workedOut   = workoutDateSet(h).has(t);
    if (dietGreen && activeGreen && workedOut) {
      try { localStorage.setItem(KEY, "1"); } catch {}
      setShowPerfectDay(true);
    }
  }, [dietState.data, activityState.data, workoutsState.data]);

  // Daily maintenance: (1) spawn a fresh instance for any recurring template
  // whose weekday matches today (per-template dedup via `lastSpawned`), and
  // (2) sweep completed non-template cards so the board doesn't pile up.
  useEffect(() => {
    if (!userId) return;
    if (!boardsState.data || boardsState.data.length === 0) return;
    const t = isoDate();
    const board = boardsState.data[0];
    if (!board) return;

    const todayWeekday = new Date(t + "T12:00:00").getDay();  // 0=Sun ... 6=Sat
    const templatesToSpawn = [];
    for (const col of (board.cols || [])) {
      for (const k of (col.cards || [])) {
        if (k.recurrence?.kind === "weekly" && k.recurrence.weekday === todayWeekday && k.lastSpawned !== t) {
          templatesToSpawn.push(k);
        }
      }
    }

    const KEY = "iron_last_task_cleanup";
    let last = null;
    try { last = localStorage.getItem(KEY); } catch {}
    const shouldSweep = last !== t;
    const hasDone = (board.cols || []).some(c => (c.cards || []).some(k => k.done && !k.recurrence));
    const doSweep = shouldSweep && hasDone;

    if (templatesToSpawn.length === 0 && !doSweep) {
      if (shouldSweep) { try { localStorage.setItem(KEY, t); } catch {} }
      return;
    }

    const spawnedIds = new Set(templatesToSpawn.map(x => x.id));
    const newInstances = templatesToSpawn.map(tpl => ({
      id: uid(), text: tpl.text, tags: tpl.tags || [], done: false,
      category: tpl.category || "work", sourceId: tpl.id,
    }));

    boardsState.setAll(bs => bs.map((b, i) => {
      if (i !== 0) return b;
      return {
        ...b,
        cols: (b.cols || []).map(c => {
          let cards = c.cards.map(k => spawnedIds.has(k.id) ? { ...k, lastSpawned: t } : k);
          // Sweep: drop done cards, but preserve templates even if accidentally checked
          if (doSweep) cards = cards.filter(k => !k.done || k.recurrence);
          // Drop spawned instances into Today lane
          if (c.name === "Today" && newInstances.length > 0) cards = [...cards, ...newInstances];
          return { ...c, cards };
        }),
      };
    }));
    if (shouldSweep) { try { localStorage.setItem(KEY, t); } catch {} }
  }, [userId, boardsState.data]);

  // Manual trigger for the Settings preview button (also clears today's dedup
  // flag so a real Perfect Day landing later still fires).
  function previewPerfectDay() {
    try { localStorage.removeItem(`iron_perfect_${isoDate()}`); } catch {}
    setShowPerfectDay(true);
  }

  // === Auth gates (early returns) ===
  if (!supabaseConfigured) return <SetupRequiredScreen/>;
  if (auth.loading) return <LoadingScreen text="Loading..."/>;
  if (!auth.user) return <SignInScreen onSignIn={auth.signInWithPassword} onSignUp={auth.signUp} onResetPassword={auth.resetPassword}/>;

  // === Data from hooks (renamed to match existing code) ===
  const history = workoutsState.data;
  const dietLog = dietState.data;
  const activeLog = activityState.data;
  const focusSessions = focusState.data;
  const boards = boardsState.data;
  const customExercises = customExState.data;
  const setBoards = boardsState.setAll;
  const addCustomExercise = (name, muscle, cat) => customExState.add(name, muscle, cat);

  // Single task board (Today / In Progress / Keep in Mind) — Home + Focus share this
  const board = boards[0] || null;
  // Tasks in the Today lane with a future due date are scheduled — hidden
  // from the Home "TODAY" checklist until that date arrives.
  const todayISO = isoDate();
  // Home hides completed tasks entirely (they still show on Focus). Also drops
  // future-scheduled cards until their day arrives, and recurring TEMPLATES
  // (their spawned instances show instead).
  const todayTasks = (board?.cols?.find(c => c.name === "Today")?.cards || [])
    .filter(k => !k.done && !k.recurrence && (!k.dueDate || k.dueDate <= todayISO));
  function updateBoard(mutator) { setBoards(bs => bs.map((b,i) => i===0 ? mutator(b) : b)); }
  function addTask(laneName, text, dueDate = null, category = "work") {
    if (!text.trim() || !board) return;
    const card = { id: uid(), text: text.trim(), tags: [], done: false, category };
    if (dueDate) card.dueDate = dueDate;
    updateBoard(b => ({ ...b, cols: b.cols.map(c => c.name===laneName ? { ...c, cards: [...c.cards, card] } : c) }));
  }
  // Generic per-card edit — used to set/clear dueDate + recurrence from the
  // action menu. Passing { field: null } cleanly removes the field.
  function updateTask(cardId, patch) {
    updateBoard(b => ({ ...b, cols: b.cols.map(c => ({ ...c, cards: c.cards.map(k => {
      if (k.id !== cardId) return k;
      const next = { ...k, ...patch };
      if (patch.dueDate === null || patch.dueDate === "") delete next.dueDate;
      if (patch.recurrence === null) { delete next.recurrence; delete next.lastSpawned; }
      return next;
    }) })) }));
  }
  function toggleTask(cardId) {
    // Simple flip — no reorder here. Display-side sort in HomeTab/FocusTab
    // arranges cards by [category, done] so done items sink to the bottom of
    // their section, and newly-added active items appear above them.
    updateBoard(b => ({ ...b, cols: b.cols.map(c => ({ ...c, cards: c.cards.map(k => k.id===cardId ? { ...k, done: !k.done } : k) })) }));
  }
  function moveTask(cardId, toLaneName) {
    let moved = null;
    updateBoard(b => {
      const cols = b.cols.map(c => { const f = c.cards.find(k=>k.id===cardId); if (f) moved = f; return { ...c, cards: c.cards.filter(k=>k.id!==cardId) }; });
      return { ...b, cols: cols.map(c => c.name===toLaneName && moved ? { ...c, cards: [...c.cards, moved] } : c) };
    });
  }
  function removeTask(cardId) {
    updateBoard(b => ({ ...b, cols: b.cols.map(c => ({ ...c, cards: c.cards.filter(k=>k.id!==cardId) })) }));
  }
  // Apply a new lane→[cardId] ordering (from drag-and-drop) to the board.
  function reorderTasks(laneToIds) {
    updateBoard(b => {
      const byId = {};
      b.cols.forEach(c => c.cards.forEach(k => { byId[k.id] = k; }));
      return { ...b, cols: b.cols.map(c => ({ ...c, cards: (laneToIds[c.name] || []).map(id => byId[id]).filter(Boolean) })) };
    });
  }

  function updateDiet(d,v){ dietState.setForDate(d, v); }
  function updateActive(d,v){ activityState.setForDate(d, v); }
  function addSession(s){ focusState.add(s); }

  // Goal logging (for generic habit + timed goals, backed by goal_logs)
  function toggleGoalToday(goalId, date=isoDate()){ goalLogsState.toggle(goalId, date); }
  function setGoalMinutes(goalId, minutes, date=isoDate()){ goalLogsState.setValue(goalId, date, minutes); }

  async function clearAll() {
    if (!window.confirm("Clear ALL data? This wipes your workouts, diet, activity, focus sessions, boards, and custom exercises from the cloud. Cannot be undone.")) return;
    await Promise.all([
      supabase.from("workouts").delete().eq("user_id", userId),
      supabase.from("diet_log").delete().eq("user_id", userId),
      supabase.from("activity_log").delete().eq("user_id", userId),
      supabase.from("focus_sessions").delete().eq("user_id", userId),
      supabase.from("boards").delete().eq("user_id", userId),
      supabase.from("custom_exercises").delete().eq("user_id", userId),
      supabase.from("zone2_log").delete().eq("user_id", userId),
      supabase.from("rooney_memories").delete().eq("user_id", userId),
      supabase.from("bodyweight_log").delete().eq("user_id", userId),
    ]);
    window.location.reload();
  }

  // Rooney tool handlers — receive structured input from Claude, mutate state, return summary string
  function rooneyLogWorkout(input) {
    const date = input.date; // YYYY-MM-DD
    const name = input.name || "Workout";
    const durationMinutes = Math.max(1, Math.min(360, Math.round(input.duration_minutes || 45)));
    const exercisesInput = Array.isArray(input.exercises) ? input.exercises : [];

    const exercises = exercisesInput.map(ex => {
      if (!EXERCISES[ex.ex_id] && !customExercises[ex.ex_id]) throw new Error(`Unknown exercise id: ${ex.ex_id}. Valid built-in ids and any custom ones you've created. Use ones from the catalog.`);
      const setCount = Math.max(1, Math.min(20, parseInt(ex.sets) || 1));
      const reps = parseInt(ex.reps) || 0;
      const weight = ex.weight != null ? Number(ex.weight) : 0;
      const sets = Array.from({length: setCount}, () => ({
        id: uid(), weight: weight === 0 ? "0" : String(weight || ""), reps: String(reps || ""), done: true,
      }));
      return { id: uid(), exId: ex.ex_id, sets, notes: "" };
    });

    const workout = {
      id: uid(),
      name,
      date: new Date(date + "T12:00:00").toISOString(),
      elapsed: durationMinutes * 60,
      exercises,
    };
    workoutsState.add(workout);
    const exSummary = exercises.length > 0
      ? ` (${exercises.length} exercise${exercises.length>1?"s":""})`
      : "";
    return { summary: `Logged "${name}" on ${date}, ${durationMinutes} min${exSummary}.` };
  }
  function rooneyBuildWorkout(input) {
    const date = input.date || isoDate();
    const name = input.name || "Workout";
    const exsInput = Array.isArray(input.exercises) ? input.exercises : [];
    if (exsInput.length === 0) return { ok: false, summary: "No exercises provided to build a template." };

    const blocks = exsInput.map(e => {
      let exId = e.ex_id;
      // Resolve to a valid exId: catalog id → name match → create custom
      if (!exId || (!EXERCISES[exId] && !customExercises[exId])) {
        const nameLower = (e.name || "").toLowerCase().trim();
        const match = Object.entries(EXERCISES).find(([, n]) => n.toLowerCase() === nameLower);
        if (match) exId = match[0];
        else if (e.name) exId = addCustomExercise(e.name, e.muscle || "Other", e.cat || "Full Body");
        else exId = null;
      }
      if (!exId) return null;
      const setCount = Math.max(1, Math.min(8, parseInt(e.sets) || 3));
      const sets = Array.from({ length: setCount }, () => ({ id: uid(), weight: "", reps: "", done: false }));
      return { id: uid(), exId, sets, notes: "" };
    }).filter(Boolean);

    if (blocks.length === 0) return { ok: false, summary: "Couldn't resolve any exercises." };
    const workout = { name, date: new Date(date + "T12:00:00").toISOString(), elapsed: 0, exercises: blocks };
    workoutsState.add(workout);
    return { ok: true, summary: `Built "${name}" for ${date} with ${blocks.length} exercises (empty). Open it from Recent Workouts to log your weights.` };
  }
  function rooneyLogDiet(date, status) {
    if (!["green","yellow","red"].includes(status)) throw new Error("Invalid status");
    updateDiet(date, status);
    return { summary: `Set diet on ${date} to ${status}.` };
  }
  function rooneyLogActivity(date, status) {
    if (!["green","yellow","red"].includes(status)) throw new Error("Invalid status");
    updateActive(date, status);
    return { summary: `Set activity on ${date} to ${status}.` };
  }
  function rooneyRemember(category, text) {
    const cat = ["physical","preference","goal","context","relationship","other"].includes(category) ? category : "other";
    memoriesState.add(cat, text);
    return { summary: `Noted (${cat}): ${text.slice(0,80)}${text.length>80?"...":""}` };
  }
  function rooneyForget(id) {
    const found = memoriesState.data.find(m => m.id === id);
    memoriesState.remove(id);
    return { summary: found ? `Forgot: ${found.text.slice(0,60)}${found.text.length>60?"...":""}` : "Nothing matched that id." };
  }

  function rooneyAddCard(input) {
    const boardQuery = (input.board || "").toLowerCase();
    const targetBoard = boards.find(b => b.name.toLowerCase().includes(boardQuery) || boardQuery.includes(b.name.toLowerCase()));
    if (!targetBoard) {
      return { ok: false, summary: `No board matching "${input.board}". Existing boards: ${boards.map(b=>b.name).join(", ")}.` };
    }
    const colQuery = (input.column || "").toLowerCase();
    let targetColIdx = 0;
    if (colQuery) {
      const idx = targetBoard.cols.findIndex(c => c.name.toLowerCase().includes(colQuery));
      if (idx >= 0) targetColIdx = idx;
    }
    const targetCol = targetBoard.cols[targetColIdx];
    setBoards(bs => bs.map(b => b.id !== targetBoard.id ? b : {
      ...b,
      cols: b.cols.map((c, i) => i !== targetColIdx ? c : { ...c, cards: [...c.cards, { id: uid(), text: input.text, tags: [] }] }),
    }));
    return { ok: true, summary: `Added "${input.text}" to ${targetBoard.name} > ${targetCol.name}.` };
  }

  function startWorkout(exercises, name="Quick Workout"){ setWkInit({exercises,name}); setScreen("workout"); }
  // Resume the in-progress draft exactly where it was left off.
  function resumeDraft(){
    if (!workoutDraft) return;
    setWkInit({ exercises: [], name: workoutDraft.name || "Workout", blocks: workoutDraft.exercises, startedAt: workoutDraft.startedAt });
    setScreen("workout");
  }
  async function finishWorkout(wk){
    const saved = await workoutsState.add(wk);
    setCompletedWk(saved || wk);
    setScreen("summary");
  }

  function startBackfill(date=null){
    setWkInit({exercises:[], name:"Past Workout", date: date || isoDate()});
    setScreen("backfill");
  }
  async function saveBackfill(wk){
    const saved = await workoutsState.add(wk);
    setCompletedWk(saved || wk);
    setScreen("summary");
  }
  function openEditWorkout(idx){
    setEditingWk({workout:history[idx], index:idx});
    setScreen("edit");
  }
  async function saveEdit(wk){
    if (editingWk?.workout?.id) {
      await workoutsState.update(editingWk.workout.id, {
        name: wk.name, date: wk.date, elapsed: wk.elapsed, exercises: wk.exercises,
      });
    }
    setEditingWk(null); setScreen("home");
  }
  async function deleteWorkout(){
    if (editingWk?.workout?.id) {
      await workoutsState.remove(editingWk.workout.id);
    }
    setEditingWk(null); setScreen("home");
  }

  // Rooney travels with you — rendered on the workout screens too, so you can
  // ask a question mid-set without leaving the log.
  const rooneyUI = (
    <>
      {!showRooney && (
        <button onClick={()=>setShowRooney(true)} aria-label="Ask Rooney, your coach" title="Ask Rooney" style={{position:"fixed",bottom:78,right:16,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",zIndex:30,padding:0}}>
          <span style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B35,#38bdf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#000",fontFamily:"monospace",boxShadow:"0 4px 20px rgba(255,107,53,0.35)"}}>R</span>
          <span style={{fontSize:8,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",background:C.bg,padding:"1px 5px",borderRadius:6}}>ROONEY</span>
        </button>
      )}
      {showRooney && (
        <RooneyChat
          history={history} dietLog={dietLog} activeLog={activeLog}
          focusSessions={focusSessions} boards={boards}
          memories={memoriesState.data}
          goals={goalList}
          zone2Log={zone2Log}
          goalLogs={goalLogs}
          customExercises={customExercises}
          persistedMessages={convoState.messages}
          onSaveConversation={convoState.save}
          onClearConversation={convoState.clear}
          onLogWorkout={rooneyLogWorkout}
          onBuildWorkout={rooneyBuildWorkout}
          onLogDiet={rooneyLogDiet}
          onLogActivity={rooneyLogActivity}
          onAddCard={rooneyAddCard}
          onRemember={rooneyRemember}
          onForget={rooneyForget}
          onDeleteMemory={(id)=>memoriesState.remove(id)}
          onClose={()=>setShowRooney(false)}
        />
      )}
    </>
  );

  if(screen==="workout"&&wkInit) return <>
    <WorkoutScreen mode="live"
      initExercises={wkInit.exercises}
      initialBlocks={wkInit.blocks || null}
      draftStartedAt={wkInit.startedAt || null}
      workoutName={wkInit.name}
      customExercises={customExercises} onAddCustom={addCustomExercise} history={history}
      onFinish={finishWorkout} onCancel={()=>setScreen("home")}
      onSaveDraft={saveWorkoutDraft} onDiscardDraft={clearWorkoutDraft}/>
    {rooneyUI}
  </>;
  if(screen==="backfill"&&wkInit) return <>
    <WorkoutScreen mode="backfill" initExercises={wkInit.exercises} workoutName={wkInit.name} initialDate={wkInit.date} customExercises={customExercises} onAddCustom={addCustomExercise} history={history} onFinish={saveBackfill} onCancel={()=>setScreen("home")}/>
    {rooneyUI}
  </>;
  if(screen==="edit"&&editingWk) return <>
    <WorkoutScreen
      mode="edit"
      initExercises={[]}
      initialBlocks={editingWk.workout.exercises}
      initialDate={editingWk.workout.date.slice(0,10)}
      initialElapsedSec={editingWk.workout.elapsed}
      workoutName={editingWk.workout.name}
      customExercises={customExercises}
      onAddCustom={addCustomExercise}
      history={history}
      excludeWorkoutId={editingWk.workout.id}
      onFinish={saveEdit}
      onCancel={()=>{setEditingWk(null);setScreen("home");}}
      onDelete={deleteWorkout}
    />
    {rooneyUI}
  </>;

  if(screen==="summary"&&completedWk){
    const vol=completedWk.exercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);
    const done=completedWk.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0);
    return(
      <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
        <div style={{textAlign:"center",padding:"48px 24px 28px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{width:64,height:64,background:C.accent,color:"#000",borderRadius:"50%",fontSize:28,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>✓</div>
          <div style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:6,fontFamily:MONO}}>{completedWk.name}</div>
        </div>
        <div style={{display:"flex",justifyContent:"space-around",padding:"20px 16px",borderBottom:`1px solid ${C.border}`}}>
          {[["Duration",formatTime(completedWk.elapsed)],["Volume",`${vol.toLocaleString()} lbs`],["Sets",done]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:C.accent,fontFamily:MONO,marginBottom:4}}>{v}</div><div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em",fontFamily:MONO}}>{l.toUpperCase()}</div></div>
          ))}
        </div>
        <div style={{padding:"16px 16px 80px"}}>
          {completedWk.exercises.map(item=>{
            const exVol=item.sets.reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
            const maxW=item.sets.reduce((a,s)=>Math.max(a,parseFloat(s.weight)||0),0);
            const doneSets=item.sets.filter(s=>s.done);
            const bwRepsMax=doneSets.reduce((b,s)=>Math.max(b, isBwSet(s) ? parseInt(s.reps) : 0),0);
            const maxLabel = maxW>0 ? `max ${maxW} lbs` : (bwRepsMax>0 ? `max BW × ${bwRepsMax}` : "—");
            return(
              <div key={item.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:C.text,fontFamily:MONO}}>{EXERCISES[item.exId]||customExercises[item.exId]?.name||item.exId}</span><span style={{fontSize:12,color:C.accent,fontFamily:MONO}}>{exVol>0?`${exVol.toLocaleString()} lbs`:""}</span></div>
                <div style={{fontSize:11,color:C.muted,fontFamily:MONO}}>{doneSets.length} sets · {maxLabel}</div>
              </div>
            );
          })}
        </div>
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,padding:"12px 16px",background:C.bg,borderTop:`1px solid ${C.border}`}}>
          <button style={{width:"100%",background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:MONO}} onClick={()=>{setScreen("home");setTab("iron");}}>Back to Home</button>
        </div>
      </div>
    );
  }

  const TABS = [
    { key:"home",   icon:"🏠", label:"Home"   },
    { key:"iron",   icon:"🏋", label:"Iron"   },
    { key:"focus",  icon:"⬡",  label:"Focus"  },
    { key:"trends", icon:"📈", label:"Trends" },
  ];

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:MONO,maxWidth:1100,margin:"0 auto",position:"relative"}}>

      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",paddingTop:"calc(12px + env(safe-area-inset-top))",position:"sticky",top:0,zIndex:25,background:C.bg+"f2",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <BarbellMark size={28}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:"0.2em",color:"#fff",fontFamily:MONO}}>IRON</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {dietLog[isoDate()]&&<span style={{fontSize:14}}>{DIET_CONFIG[dietLog[isoDate()]].emoji}</span>}
          {activeLog[isoDate()]&&<span style={{fontSize:14}}>{ACTIVE_CONFIG[activeLog[isoDate()]].emoji}</span>}
          <button onClick={hardRefresh} aria-label="Refresh for the latest version" title="Refresh" style={{background:"transparent",border:"none",color:C.muted,fontSize:23,cursor:"pointer",padding:"2px 4px",lineHeight:1,display:"flex",alignItems:"center"}}>
            <span style={{display:"inline-block",animation:refreshing?"spin 0.7s linear infinite":"none"}}>⟳</span>
          </button>
          <button onClick={()=>setShowSettings(true)} aria-label="Settings" title="Settings" style={{background:"transparent",border:"none",color:C.muted,fontSize:17,cursor:"pointer",padding:"2px 4px",lineHeight:1,display:"flex",alignItems:"center"}}>⚙</button>
        </div>
      </div>

      {/* Content */}
      <div style={{paddingBottom:80}}>
        {tab==="home"  && <HomeTab  history={history} dietLog={dietLog} activeLog={activeLog} focusSessions={focusSessions} zone2Log={zone2Log} goalLogs={goalLogs} customExercises={customExercises} todayTasks={todayTasks} onToggleTask={toggleTask} onAddTask={addTask} onUpdateTask={updateTask} onUpdateDiet={updateDiet} onUpdateActive={updateActive} onToggleGoal={toggleGoalToday} onSetGoalMinutes={setGoalMinutes} onGoTo={setTab} onOpenEdit={openEditWorkout} onClearAll={clearAll} onSignOut={auth.signOut} userEmail={auth.user?.email} onUpdatePassword={auth.updatePassword} goals={goalList} onEditGoals={()=>setShowGoalsEditor(true)}/>}
        {tab==="iron"  && <>
          <IronTab  history={history} onStartWorkout={startWorkout} draft={workoutDraft} onResumeDraft={resumeDraft} onDiscardDraft={clearWorkoutDraft}/>
          <LogTab   history={history} dietLog={dietLog} activeLog={activeLog} zone2Log={zone2Log} goals={goalList} goalLogs={goalLogs} bodyweight={bwState.data} onUpdateDiet={updateDiet} onUpdateActive={updateActive} onAddZone2={(date,minutes,label)=>zone2State.add(date,minutes,label)} onRemoveZone2={(id)=>zone2State.remove(id)} onToggleGoal={toggleGoalToday} onSetGoalMinutes={setGoalMinutes} onSetBodyweight={bwState.setForDate} onStartBackfill={startBackfill} onOpenEdit={openEditWorkout}/>
        </>}
        {tab==="focus" && <FocusTab focusSessions={focusSessions} onAddSession={addSession} board={board} onAddTask={addTask} onToggleTask={toggleTask} onMoveTask={moveTask} onRemoveTask={removeTask} onReorder={reorderTasks} onUpdateTask={updateTask}/>}
        {tab==="trends" && <TrendsTab history={history} dietLog={dietLog} activeLog={activeLog} zone2Log={zone2Log} focusSessions={focusSessions} bodyweight={bwState.data} goals={goalList} goalLogs={goalLogs} goalSnapshots={goalSnapsState.snapshots} customExercises={customExercises}/>}
      </div>

      {/* Rooney floating button */}
      {rooneyUI}

      {showGoalsEditor && (
        <GoalsEditor
          goals={goalList}
          onSave={(g) => { setGoalList(g); setShowGoalsEditor(false); }}
          onClose={() => setShowGoalsEditor(false)}
          onReset={() => { setGoalList(DEFAULT_GOAL_LIST); setShowGoalsEditor(false); }}
        />
      )}

      {showSettings && (
        <SettingsSheet
          userEmail={auth.user?.email}
          goals={goalList}
          onEditGoals={()=>setShowGoalsEditor(true)}
          onUpdatePassword={auth.updatePassword}
          onSignOut={auth.signOut}
          onClearAll={clearAll}
          onPreviewPerfectDay={()=>{ setShowSettings(false); previewPerfectDay(); }}
          onPreviewPR={()=>{ setShowSettings(false); setPreviewPR({ exName: "Bench Press", kind: "weight", value: 185, prev: 175, weight: "185", reps: "5" }); }}
          onClose={()=>setShowSettings(false)}
        />
      )}

      {showPerfectDay && <PerfectDayCelebration onClose={()=>setShowPerfectDay(false)}/>}
      {previewPR && <PRCelebration pr={previewPR} onClose={()=>setPreviewPR(null)}/>}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:1100,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:20,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {TABS.map(t=>{
          const active = tab===t.key;
          return (
            <button key={t.key} style={{flex:1,background:active?C.accent+"12":"none",border:"none",borderTop:`2px solid ${active?C.accent:"transparent"}`,padding:"9px 0 11px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}
              onClick={()=>{ setTab(t.key); refreshAllRef.current?.(); }}>
              <span style={{fontSize:16,color:active?C.accent:"#6b6b6b",opacity:active?1:0.9}}>{t.icon}</span>
              <span style={{fontSize:9,color:active?C.accent:"#6b6b6b",fontFamily:MONO,letterSpacing:"0.08em",fontWeight:active?700:400}}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const _s=document.createElement("style");
_s.textContent=`
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes prFadeIn{from{opacity:0}to{opacity:1}}
@keyframes prPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes prTrophyBounce{0%{transform:scale(0) rotate(-15deg)}50%{transform:scale(1.3) rotate(8deg)}100%{transform:scale(1) rotate(0)}}
@keyframes prSparkle{0%{transform:translate(0,0) scale(0);opacity:0}15%{transform:translate(calc(var(--tx)*0.15), calc(var(--ty)*0.15)) scale(1.2);opacity:1}100%{transform:translate(var(--tx), var(--ty)) scale(0.3);opacity:0}}
@keyframes steamRise{
  0%   { transform: translateY(0) scaleY(1);   opacity: 0; }
  20%  { opacity: 0.8; }
  100% { transform: translateY(-22px) scaleY(1.15); opacity: 0; }
}
@keyframes checkDraw{from{stroke-dashoffset:22}to{stroke-dashoffset:0}}
@keyframes setFlashPop{0%{transform:scale(0.3);opacity:0}18%{transform:scale(1.12);opacity:1}55%{transform:scale(1);opacity:1}100%{transform:scale(0.85);opacity:0}}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
*{-webkit-tap-highlight-color:transparent}
textarea{font-family:'DM Mono','Courier New',monospace}
`;
document.head.appendChild(_s);
