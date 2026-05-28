import { useState, useEffect, useRef } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  useAuth, useWorkouts, useDietLog, useActivityLog,
  useFocusSessions, useBoards, useCustomExercises, useRooneyMemories, migrateLocalStorage,
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

// ─── Config ───────────────────────────────────────────────────────────────────
const DIET_CONFIG   = { green: { emoji:"🟢", label:"Clean",    color: C.green,  desc:"On plan"        }, yellow: { emoji:"⚪", label:"Decent",   color: C.neutral, desc:"Minor slips"    }, red:    { emoji:"🔴", label:"Off",      color: C.red,    desc:"Off plan"       } };
const ACTIVE_CONFIG = { green: { emoji:"🟢", label:"Active",   color: C.green,  desc:"Crushed it"     }, yellow: { emoji:"⚪", label:"Moving",   color: C.neutral, desc:"Light movement" }, red:    { emoji:"🔴", label:"Rest",     color: C.red,    desc:"Rest day"       } };

const DEFAULT_GOALS = { perfectDays: 3, workouts: 4, dietGreen: 4, dietRed: 1, activeGreen: 4 };
// Back-compat alias — components that haven't been threaded with the user's
// edited goals (legacy bits, IronTab) read from this. The dashboard uses the
// editable user-set goals via the goals prop.
const WEEKLY_GOALS = DEFAULT_GOALS;
const GOAL_META = [
  { key: "perfectDays", emoji: "⭐", label: "Perfect days",    type: "min", hint: "Diet green + active + workout, same day" },
  { key: "workouts",    emoji: "🏋", label: "Workouts",       type: "min", hint: "Strength or session-logged training" },
  { key: "dietGreen",   emoji: "🟢", label: "Clean diet days", type: "min", hint: "Days you logged as green diet" },
  { key: "activeGreen", emoji: "🟢", label: "Active days",     type: "min", hint: "Days you logged as green activity" },
  { key: "dietRed",     emoji: "🔴", label: "Red diet days",   type: "max", hint: "At most this many off-plan days" },
];

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
  plank:"Plank", russian_twist:"Russian Twist", hanging_leg:"Hanging Leg Raise",
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
  plank:{muscle:"Core",cat:"Full Body"}, russian_twist:{muscle:"Core",cat:"Full Body"}, hanging_leg:{muscle:"Core",cat:"Full Body"},
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
function isoDate(d=new Date()) { return d.toISOString().slice(0,10); }
function e1RM(w, r) { if (!w || !r) return 0; return Math.round(w * (1 + r/30)); }
function bestRMByExercise(history, excludeId=null) {
  const result = {};
  for (const w of history) {
    if (excludeId && w.id === excludeId) continue;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!s.done) continue;
        const rm = e1RM(parseFloat(s.weight), parseInt(s.reps));
        if (rm > (result[ex.exId] || 0)) result[ex.exId] = rm;
      }
    }
  }
  return result;
}
function formatTime(s) { const m=Math.floor(s/60).toString().padStart(2,"0"); return `${m}:${(s%60).toString().padStart(2,"0")}`; }
function getWeekDays(offset=0) {
  const now=new Date(); const day=now.getDay();
  const mon=new Date(now); mon.setDate(now.getDate()-((day+6)%7)+offset*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return isoDate(d); });
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
function HomeTab({ history, dietLog, activeLog, focusSessions, onGoTo, onOpenEdit, onClearAll, onSignOut, userEmail, onUpdatePassword, goals = DEFAULT_GOALS, onEditGoals }) {
  const G = goals;
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
    else {
      setPwMsg({ kind:"ok", text: "Password saved. Use it to sign in next time." });
      setNewPw(""); setShowPwForm(false);
      setTimeout(()=>setPwMsg(null), 4000);
    }
  }
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
            {todayLabel}
            {todayPerfectCount===3 && <span style={{marginLeft:8,fontSize:22}}>⭐</span>}
          </div>
          <div style={{fontSize:28,fontWeight:700,color:todayPerfectCount===3?C.accent:todayPerfectCount>=2?C.green:C.muted,fontFamily:MONO}}>{todayScore}%</div>
        </div>
      </div>

      {/* 3 pillars */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[
          {label:"DIET",    hit:todayDietGreen,   icon: todayDiet?DIET_CONFIG[todayDiet].emoji:"·",     sub: todayDiet?DIET_CONFIG[todayDiet].label:"—",       color: todayDiet?DIET_CONFIG[todayDiet].color:C.dim,                dest:"log"},
          {label:"ACTIVE",  hit:todayActiveGreen, icon: todayActive?ACTIVE_CONFIG[todayActive].emoji:"·", sub: todayActive?ACTIVE_CONFIG[todayActive].label:"—", color: todayActive?ACTIVE_CONFIG[todayActive].color:C.dim,          dest:"log"},
          {label:"WORKOUT", hit:todayHasWorkout,  icon: todayHasWorkout?"✓":"·",                          sub: todayHasWorkout?`${todayWorkouts} done`:"—",       color: todayHasWorkout?C.accent:C.dim,                                dest:"iron"},
        ].map((p,i)=>(
          <button key={i} onClick={()=>onGoTo(p.dest)} style={{
            background: p.hit ? p.color+"18" : C.card,
            border: `1px solid ${p.hit ? p.color : C.border}`,
            borderRadius:12, padding:"12px 10px", cursor:"pointer", textAlign:"center",
          }}>
            <div style={{fontSize:22,marginBottom:4,color:p.color,lineHeight:1}}>{p.icon}</div>
            <div style={{fontSize:9,color:p.color,fontFamily:MONO,letterSpacing:"0.08em",fontWeight:700}}>{p.label}</div>
            {p.sub && <div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginTop:2}}>{p.sub}</div>}
          </button>
        ))}
      </div>

      {/* PERFECT DAYS hero card */}
      <div style={{background:`linear-gradient(135deg, ${C.accent}10, ${C.purple}10)`,border:`1px solid ${C.accent}55`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:C.accent,fontFamily:MONO,letterSpacing:"0.15em",fontWeight:700,marginBottom:4}}>⭐ PERFECT DAYS</div>
            <div style={{fontSize:11,color:C.sub,fontFamily:MONO,lineHeight:1.5,maxWidth:240}}>Ate clean · was active · did a workout — all three, same day.</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:34,fontWeight:700,color:C.accent,fontFamily:MONO,lineHeight:1}}>{wkPerfect}</div>
            <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:2,letterSpacing:"0.1em"}}>THIS WEEK / GOAL {G.perfectDays}</div>
          </div>
        </div>
        <div style={{height:4,background:C.border,borderRadius:2,marginTop:10}}>
          <div style={{height:4,borderRadius:2,width:`${Math.min(wkPerfect/Math.max(G.perfectDays,1),1)*100}%`,background:C.accent,transition:"width 0.5s"}}/>
        </div>
      </div>

      {/* Week/Month toggle */}
      <div style={{display:"flex",gap:4,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:4,marginBottom:14}}>
        {["week","month"].map(m=>(
          <button key={m} onClick={()=>setViewMode(m)} style={{
            flex:1, background: viewMode===m ? C.accent : "transparent",
            color: viewMode===m ? "#000" : C.muted, border:"none", borderRadius:6,
            padding:"7px 0", fontSize:11, fontWeight:700, cursor:"pointer",
            fontFamily:MONO, letterSpacing:"0.1em",
          }}>{m.toUpperCase()}</button>
        ))}
      </div>

      {viewMode === "week" ? (
        <>
          {/* Week strip */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:12}}>
            <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>THIS WEEK</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
              {thisWeekDays.map((d,i)=>{
                const labels="MTWTFSS";
                const diet=dietLog[d]; const active=activeLog[d]; const didWk=wkSet.has(d);
                const dcfg=diet?DIET_CONFIG[diet]:null;
                const perfect = isPerfectDay(d, dietLog, activeLog, wkSet);
                return (
                  <div key={d} style={{textAlign:"center",position:"relative"}}>
                    <div style={{fontSize:9,color:d===today?C.accent:C.dim,fontFamily:MONO,marginBottom:3,fontWeight:d===today?700:400}}>{labels[i]}</div>
                    <div style={{background:dcfg?dcfg.color+"18":"#111",border:`1.5px solid ${perfect?C.accent:dcfg?dcfg.color:C.border}`,borderRadius:8,padding:"5px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minHeight:42,position:"relative",boxShadow:perfect?`0 0 12px ${C.accent}44`:"none"}}>
                      {perfect && <div style={{position:"absolute",top:-7,right:-3,fontSize:11}}>⭐</div>}
                      {dcfg ? <span style={{fontSize:12}}>{dcfg.emoji}</span> : <span style={{fontSize:10,color:C.dim}}>·</span>}
                      {active && <span style={{fontSize:9}}>{ACTIVE_CONFIG[active].emoji}</span>}
                      {didWk && <span style={{fontSize:9,color:C.accent,lineHeight:1}}>▶</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly goals */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em"}}>WEEKLY GOALS</div>
              {onEditGoals && <button onClick={onEditGoals} style={{background:"transparent",border:"none",color:C.muted,fontSize:10,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em",textDecoration:"underline"}}>Edit</button>}
            </div>
            <GoalBar label="⭐ Perfect days"  got={wkPerfect}   target={G.perfectDays} color={C.accent}/>
            <GoalBar label="Workouts"         got={wkWorkouts}  target={G.workouts}    color={C.accent}/>
            <GoalBar label="Clean diet days"  got={wkDietGreen} target={G.dietGreen}   color={C.green}/>
            <GoalBar label="Active days"      got={wkActive}    target={G.activeGreen} color={C.green}/>
            <GoalBar label="Red diet days"    got={wkDietRed}   target={G.dietRed}     color={C.red} invert/>
          </div>
        </>
      ) : (
        <>
          {/* Month nav */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px"}}>
            <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={()=>setMonthOffset(o=>o-1)}>‹</button>
            <span style={{fontSize:12,color:C.text,fontFamily:MONO,fontWeight:700,letterSpacing:"0.05em"}}>{monthData.label}</span>
            <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:MONO,opacity:monthOffset>=0?0.3:1}} onClick={()=>monthOffset<0&&setMonthOffset(o=>o+1)}>›</button>
          </div>

          {/* Month calendar */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
              {["M","T","W","T","F","S","S"].map((l,i)=>(
                <div key={i} style={{fontSize:9,color:C.dim,fontFamily:MONO,textAlign:"center",letterSpacing:"0.05em"}}>{l}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
              {monthData.cells.map((d,i)=>{
                if (d === null) return <div key={i} style={{aspectRatio:"1"}}/>;
                const diet=dietLog[d]; const active=activeLog[d]; const didWk=wkSet.has(d);
                const dcfg=diet?DIET_CONFIG[diet]:null;
                const perfect = isPerfectDay(d, dietLog, activeLog, wkSet);
                const isToday = d===today;
                const isFuture = d>today;
                return (
                  <div key={d} style={{
                    aspectRatio:"1",
                    background: perfect ? C.accent+"22" : dcfg ? dcfg.color+"12" : C.bg,
                    border: `1px solid ${isToday?C.accent: perfect?C.accent:dcfg?dcfg.color:C.border}`,
                    borderRadius:6, padding:"2px 2px",
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:0,
                    opacity: isFuture ? 0.3 : 1,
                    position:"relative",
                    boxShadow: perfect ? `0 0 6px ${C.accent}33` : "none",
                  }}>
                    <span style={{fontSize:9,color:isToday?C.accent:perfect?C.accent:C.muted,fontFamily:MONO,fontWeight:isToday?700:400,lineHeight:1}}>{new Date(d+"T12:00:00").getDate()}</span>
                    <div style={{display:"flex",gap:1,marginTop:1,height:10,alignItems:"center"}}>
                      {dcfg && <span style={{fontSize:7}}>{dcfg.emoji}</span>}
                      {active && <span style={{fontSize:7}}>{ACTIVE_CONFIG[active].emoji}</span>}
                      {didWk && <span style={{fontSize:7,color:C.accent,fontWeight:700,lineHeight:1}}>▶</span>}
                    </div>
                    {perfect && <div style={{position:"absolute",top:-4,right:-2,fontSize:8}}>⭐</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month totals */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            <ScoreCard label="⭐ PERFECT" value={monthData.totals.perfect} color={C.accent}/>
            <ScoreCard label="WORKOUTS"   value={monthData.totals.workouts} color={C.accent}/>
            <ScoreCard label="CLEAN DIET" value={monthData.totals.dietGreen} color={C.green}/>
            <ScoreCard label="ACTIVE 🟢" value={monthData.totals.active} color={C.green}/>
            <ScoreCard label="FOCUS HRS" value={monthData.totals.focusMins>0?`${Math.round(monthData.totals.focusMins/60*10)/10}h`:"—"} color={C.blue}/>
            <ScoreCard label="RED DIET 🔴" value={monthData.totals.dietRed} color={monthData.totals.dietRed>4?C.red:C.text}/>
          </div>
        </>
      )}

      {/* 8-WEEK TRENDS — always visible */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>8-WEEK TRENDS</div>
      {[
        {label:"⭐ PERFECT DAYS / WEEK", data:weeks.map(w=>w.perfect),  max:7,     color:C.accent, goalLine: G.perfectDays},
        {label:"WORKOUTS / WEEK",        data:weeks.map(w=>w.workouts), max:maxWk, color:C.accent, goalLine: G.workouts},
        {label:"CLEAN DIET DAYS",        data:weeks.map(w=>w.dg),       max:7,     color:C.green,  goalLine: G.dietGreen},
        {label:"ACTIVE DAYS",            data:weeks.map(w=>w.ag),       max:7,     color:C.green,  goalLine: G.activeGreen},
      ].map(({label,data,max,color,goalLine})=>(
        <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
          <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>{label}</div>
          <MiniChart data={data} max={max} color={color} goalLine={goalLine}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>{weeks[0].label}</span>
            <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>Now</span>
          </div>
        </div>
      ))}

      {/* Focus hours trend */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>FOCUS HOURS / WEEK</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60}}>
          {weeks.map((w,i)=>{
            const h=Math.max((w.focusMins/Math.max(maxF,1))*52,w.focusMins>0?4:2);
            return <div key={i} style={{flex:1,height:h,background:w.focusMins>=120?C.blue:w.focusMins>0?C.border2:C.border,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}}/>;
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>{weeks[0].label}</span>
          <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>Now</span>
        </div>
      </div>

      {/* Red diet days trend */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>RED DIET DAYS / WEEK · max {G.dietRed}</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:40}}>
          {weeks.map((w,i)=>{
            const h=Math.max((w.dr/3)*36,w.dr>0?4:2);
            return <div key={i} style={{flex:1,height:h,background:w.dr===0?C.green:w.dr<=G.dietRed?C.border2:C.red,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}}/>;
          })}
        </div>
      </div>

      {/* Recent workouts */}
      {history.length>0&&(
        <>
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>RECENT WORKOUTS</div>
          {history.slice(0,5).map((w,i)=>(
            <button key={i} onClick={()=>onOpenEdit(i)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:6,cursor:"pointer",textAlign:"left",color:"inherit",font:"inherit",display:"block"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:12,color:C.text,fontFamily:MONO,fontWeight:600}}>{w.name}</div><div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:2}}>{new Date(w.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:C.accent,fontFamily:MONO,fontWeight:700}}>{formatTime(w.elapsed)}</span><span style={{fontSize:13,color:C.dim}}>›</span></div>
              </div>
            </button>
          ))}
        </>
      )}

      {/* Account + Danger zone */}
      <div style={{marginTop:24,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
        {userEmail && (
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,marginBottom:10,letterSpacing:"0.05em"}}>
            Signed in as <span style={{color:C.muted}}>{userEmail}</span>
          </div>
        )}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
          {onUpdatePassword && (
            <button style={{background:"transparent",border:`1px solid ${C.accent}55`,borderRadius:8,color:C.accent,padding:"8px 14px",fontSize:10,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}
              onClick={()=>{setShowPwForm(s=>!s); setPwMsg(null);}}>
              {showPwForm ? "Cancel" : "Set / change password"}
            </button>
          )}
          {onSignOut && (
            <button style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"8px 14px",fontSize:10,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}
              onClick={onSignOut}>Sign out</button>
          )}
          <button style={{background:"transparent",border:`1px solid ${C.red}33`,borderRadius:8,color:C.red,padding:"8px 14px",fontSize:10,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}
            onClick={onClearAll}>Clear all data</button>
        </div>
        {showPwForm && (
          <div style={{background:C.card,border:`1px solid ${C.accent}55`,borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginBottom:8}}>Pick a password (min 6 chars). Browser will offer to save it for autofill.</div>
            <input type="password" autoComplete="new-password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="new password" minLength={6}
              style={{width:"100%",background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
            <button onClick={savePassword} disabled={newPw.length<6||pwBusy}
              style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:newPw.length>=6&&!pwBusy?"pointer":"default",fontFamily:MONO,opacity:newPw.length>=6&&!pwBusy?1:0.4}}>
              {pwBusy ? "Saving..." : "Save password"}
            </button>
          </div>
        )}
        {pwMsg && (
          <div style={{fontSize:10,color:pwMsg.kind==="ok"?C.green:C.red,fontFamily:MONO,marginBottom:8}}>{pwMsg.text}</div>
        )}
      </div>

    </div>
  );
}

// ─── IRON TAB ─────────────────────────────────────────────────────────────────
function IronTab({ history, dietLog, activeLog, onUpdateDiet, onUpdateActive, onStartWorkout, onOpenEdit }) {
  const today = isoDate();
  const thisWeekDays = getWeekDays(0);
  const wkWorkouts = thisWeekCount(history);

  function formatElapsed(s){ return formatTime(s); }
  function totalVol(exs){ return exs.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0); }
  function compSets(exs){ return exs.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0); }
  function dayLabel(iso){ const d=new Date(iso+"T12:00:00"); const diff=Math.round((new Date()-d)/86400000); if(diff===0)return"Today"; if(diff===1)return"Yesterday"; if(diff<7)return d.toLocaleDateString("en-US",{weekday:"short"}); return d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); }

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

      {/* Stats strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        <ScoreCard label="THIS WEEK" value={`${wkWorkouts}/${WEEKLY_GOALS.workouts}`} color={wkWorkouts>=WEEKLY_GOALS.workouts?C.accent:C.text}/>
        <ScoreCard label="ALL TIME" value={history.length} color={C.text}/>
        <ScoreCard label="DIET TODAY" value={dietLog[today]?DIET_CONFIG[dietLog[today]].emoji:"—"} color={C.text}/>
      </div>

      {/* Start workout */}
      <button style={{width:"100%",background:C.accent,color:"#000",border:"none",borderRadius:12,padding:"16px 18px",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:12,fontFamily:MONO,marginBottom:16,textAlign:"left"}}
        onClick={()=>onStartWorkout([])}>
        <span style={{fontSize:20}}>▶</span>
        <div><div>Start Empty Workout</div><div style={{fontSize:11,color:"rgba(0,0,0,0.5)",marginTop:2}}>Log any exercises</div></div>
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

      {/* Diet + Activity quick log */}
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,marginTop:16,fontWeight:700}}>TODAY</div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div><div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:8}}>DIET</div><TrafficLight config={DIET_CONFIG} value={dietLog[today]} onChange={v=>onUpdateDiet(today,v)}/></div>
          <div><div style={{fontSize:9,color:C.muted,fontFamily:MONO,marginBottom:8}}>ACTIVITY</div><TrafficLight config={ACTIVE_CONFIG} value={activeLog[today]} onChange={v=>onUpdateActive(today,v)}/></div>
        </div>
      </div>

      {/* Recent */}
      {history.length>0&&(
        <>
          <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>RECENT</div>
          {history.slice(0,5).map((w,i)=>(
            <button key={i} onClick={()=>onOpenEdit(i)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8,cursor:"pointer",textAlign:"left",color:"inherit",font:"inherit",display:"block"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div><div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:MONO}}>{w.name}</div><div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginTop:2}}>{dayLabel(w.date)}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:13,color:C.accent,fontFamily:MONO,fontWeight:700}}>{formatElapsed(w.elapsed)}</span><span style={{fontSize:14,color:C.dim}}>›</span></div>
              </div>
              <div style={{fontSize:11,color:C.dim,fontFamily:MONO,marginTop:6}}>{compSets(w.exercises)} sets · {totalVol(w.exercises).toLocaleString()} lbs</div>
            </button>
          ))}
        </>
      )}
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
    <svg viewBox="0 0 120 120" width={120} height={120} style={{display:"block"}}>
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

// ─── FOCUS TAB ────────────────────────────────────────────────────────────────
function FocusTab({ focusSessions, onAddSession, boards, setBoards }) {
  const today = isoDate();
  const [timerMins, setTimerMins] = useState(90);
  const [timerInput, setTimerInput] = useState("90");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionLabel, setSessionLabel] = useState("");
  const [activeBoard, setActiveBoard] = useState(boards[0]?.id||null);
  const [addingCard, setAddingCard] = useState(null); // colId
  const [newCardText, setNewCardText] = useState("");
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [dragging, setDragging] = useState(null); // {boardId, colId, cardId}
  const [dragOver, setDragOver] = useState(null); // colId
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

  const board = boards.find(b=>b.id===activeBoard);

  function addCard(colId){
    if(!newCardText.trim()) return;
    setBoards(bs=>bs.map(b=>b.id===activeBoard?{...b,cols:b.cols.map(c=>c.id===colId?{...c,cards:[...c.cards,{id:uid(),text:newCardText.trim(),tags:[]}]}:c)}:b));
    setNewCardText(""); setAddingCard(null);
  }
  function removeCard(colId,cardId){
    setBoards(bs=>bs.map(b=>b.id===activeBoard?{...b,cols:b.cols.map(c=>c.id===colId?{...c,cards:c.cards.filter(k=>k.id!==cardId)}:c)}:b));
  }
  function addCol(){
    if(!newColName.trim()) return;
    setBoards(bs=>bs.map(b=>b.id===activeBoard?{...b,cols:[...b.cols,{id:uid(),name:newColName.trim(),cards:[]}]}:b));
    setNewColName(""); setAddingCol(false);
  }
  function moveCard(fromColId,cardId,toColId){
    if(fromColId===toColId) return;
    let card;
    setBoards(bs=>bs.map(b=>{
      if(b.id!==activeBoard) return b;
      const cols=b.cols.map(c=>{
        if(c.id===fromColId){ card=c.cards.find(k=>k.id===cardId); return{...c,cards:c.cards.filter(k=>k.id!==cardId)}; }
        return c;
      });
      return{...b,cols:cols.map(c=>c.id===toColId&&card?{...c,cards:[...c.cards,card]}:c)};
    }));
  }

  // Coffee mug fill: 1 = full, 0 = empty
  const fillPct = totalSecs > 0 ? Math.max(0, 1 - pct) : 1;

  return (
    <div style={{padding:"16px 16px 80px"}}>

      {/* Timer */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:20,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          {/* Coffee mug */}
          <div style={{position:"relative",flexShrink:0,width:120,height:120}}>
            <CoffeeMug fillPct={fillPct} running={running} timeText={formatTime(remaining)}/>
          </div>

          <div style={{flex:1}}>
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

        <div style={{display:"flex",gap:8,marginTop:14}}>
          {!running
            ? <button style={{flex:1,background:C.accent,color:"#000",border:"none",borderRadius:10,padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:MONO}} onClick={startTimer}>▶ Start</button>
            : <button style={{flex:1,background:"#161616",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px",fontSize:13,color:C.text,cursor:"pointer",fontFamily:MONO}} onClick={stopTimer}>◼ Stop + Save</button>
          }
        </div>

        {/* Stats */}
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

      {/* Board selector */}
      <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
        {boards.map(b=>(
          <button key={b.id} style={{flexShrink:0,background:activeBoard===b.id?b.color+"22":"#161616",border:`1px solid ${activeBoard===b.id?b.color:C.border}`,borderRadius:20,padding:"5px 14px",fontSize:11,color:activeBoard===b.id?b.color:C.muted,cursor:"pointer",fontFamily:MONO,whiteSpace:"nowrap"}}
            onClick={()=>setActiveBoard(b.id)}>{b.name}</button>
        ))}
        <button style={{flexShrink:0,background:"#161616",border:`1px dashed ${C.border2}`,borderRadius:20,padding:"5px 14px",fontSize:11,color:C.dim,cursor:"pointer",fontFamily:MONO}}
          onClick={()=>{ const name=prompt("Board name?"); if(name){const colors=[C.purple,C.blue,C.green,C.yellow]; const nb={id:uid(),name,color:colors[boards.length%colors.length],cols:[{id:uid(),name:"Todo",cards:[]},{id:uid(),name:"In Progress",cards:[]},{id:uid(),name:"Done",cards:[]}]}; setBoards(bs=>[...bs,nb]); setActiveBoard(nb.id); }}}>+ Board</button>
      </div>

      {/* Kanban */}
      {board&&(
        <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
          {board.cols.map(col=>(
            <div key={col.id} style={{flexShrink:0,width:220,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12,outline:dragOver===col.id?`2px solid ${board.color}`:undefined}}
              onDragOver={e=>{e.preventDefault();setDragOver(col.id);}}
              onDrop={e=>{ if(dragging&&dragging.colId!==col.id){moveCard(dragging.colId,dragging.cardId,col.id);} setDragging(null);setDragOver(null); }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:C.sub,fontFamily:MONO,letterSpacing:"0.08em"}}>{col.name.toUpperCase()}</div>
                <span style={{fontSize:11,color:C.dim,fontFamily:MONO}}>{col.cards.length}</span>
              </div>
              {col.cards.map(card=>(
                <div key={card.id} draggable
                  onDragStart={()=>setDragging({boardId:board.id,colId:col.id,cardId:card.id})}
                  style={{background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,padding:"10px 10px",marginBottom:6,cursor:"grab",position:"relative"}}>
                  <div style={{fontSize:12,color:C.text,fontFamily:MONO,lineHeight:1.5,paddingRight:16}}>{card.text}</div>
                  {card.tags?.length>0&&(
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                      {card.tags.map(t=><span key={t} style={{fontSize:9,color:board.color,background:board.color+"18",padding:"2px 6px",borderRadius:4,fontFamily:MONO}}>{t}</span>)}
                    </div>
                  )}
                  <button style={{position:"absolute",top:6,right:6,background:"transparent",border:"none",color:C.dim,fontSize:11,cursor:"pointer",lineHeight:1}} onClick={()=>removeCard(col.id,card.id)}>✕</button>
                </div>
              ))}
              {addingCard===col.id
                ? <div>
                    <textarea style={{width:"100%",background:"#1a1a1a",border:`1px solid ${board.color}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:12,fontFamily:MONO,outline:"none",resize:"none",boxSizing:"border-box",minHeight:64}}
                      autoFocus value={newCardText} onChange={e=>setNewCardText(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addCard(col.id);}if(e.key==="Escape")setAddingCard(null);}}
                      placeholder="Card text…"/>
                    <div style={{display:"flex",gap:6,marginTop:6}}>
                      <button style={{flex:1,background:board.color,color:"#000",border:"none",borderRadius:6,padding:"6px",fontSize:11,cursor:"pointer",fontFamily:MONO,fontWeight:700}} onClick={()=>addCard(col.id)}>Add</button>
                      <button style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:11,color:C.muted,cursor:"pointer",fontFamily:MONO}} onClick={()=>setAddingCard(null)}>Cancel</button>
                    </div>
                  </div>
                : <button style={{width:"100%",background:"transparent",border:`1px dashed ${C.border2}`,borderRadius:8,padding:"7px",fontSize:11,color:C.dim,cursor:"pointer",fontFamily:MONO,marginTop:2}}
                    onClick={()=>setAddingCard(col.id)}>+ Add card</button>
              }
            </div>
          ))}
          {addingCol
            ? <div style={{flexShrink:0,width:220}}>
                <input style={{width:"100%",background:C.card,border:`1px solid ${board.color}`,borderRadius:10,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:6}}
                  autoFocus placeholder="Column name…" value={newColName} onChange={e=>setNewColName(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")addCol();if(e.key==="Escape")setAddingCol(false);}}/>
                <div style={{display:"flex",gap:6}}>
                  <button style={{flex:1,background:board.color,color:"#000",border:"none",borderRadius:6,padding:"8px",fontSize:12,cursor:"pointer",fontFamily:MONO,fontWeight:700}} onClick={addCol}>Add</button>
                  <button style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px",fontSize:12,color:C.muted,cursor:"pointer",fontFamily:MONO}} onClick={()=>setAddingCol(false)}>Cancel</button>
                </div>
              </div>
            : <button style={{flexShrink:0,width:44,background:C.card,border:`1px dashed ${C.border}`,borderRadius:12,color:C.dim,fontSize:20,cursor:"pointer",alignSelf:"flex-start",padding:"10px 0"}}
                onClick={()=>setAddingCol(true)}>+</button>
          }
        </div>
      )}
    </div>
  );
}

// ─── PROGRESS TAB ─────────────────────────────────────────────────────────────
function ProgressTab({ history, dietLog, activeLog, focusSessions, onClearAll }) {
  const WEEKS = 8;
  const now = new Date();
  const weeks = Array.from({length:WEEKS},(_,i)=>{
    const ws=new Date(now); ws.setDate(now.getDate()-(WEEKS-1-i)*7);
    const we=new Date(ws); we.setDate(ws.getDate()+7);
    const label=ws.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const wDays=Array.from({length:7},(_,j)=>{const d=new Date(ws);d.setDate(ws.getDate()+j);return isoDate(d);});
    const workouts=history.filter(w=>{const d=new Date(w.date);return d>=ws&&d<we;}).length;
    const dg=wDays.filter(d=>dietLog[d]==="green").length;
    const dr=wDays.filter(d=>dietLog[d]==="red").length;
    const ag=wDays.filter(d=>activeLog[d]==="green").length;
    const focusMins=focusSessions.filter(s=>wDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);
    return {label,workouts,dg,dr,ag,focusMins};
  });

  const maxW=Math.max(...weeks.map(w=>w.workouts),1);
  const maxF=Math.max(...weeks.map(w=>w.focusMins),1);

  const thisWeekDays=getWeekDays(0);
  const twW=thisWeekCount(history);
  const twDG=thisWeekDays.filter(d=>dietLog[d]==="green").length;
  const twDR=thisWeekDays.filter(d=>dietLog[d]==="red").length;
  const twAG=thisWeekDays.filter(d=>activeLog[d]==="green").length;
  const twFocus=focusSessions.filter(s=>thisWeekDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);

  function MiniChart({data,max,color,height=60}){
    return(
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height}}>
        {data.map((v,i)=>{
          const h=Math.max((v/Math.max(max,1))*height*0.85,v>0?4:2);
          const hit=v>=4;
          return <div key={i} style={{flex:1,height:h,background:hit?color:v>0?C.border2:C.border,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}}/>;
        })}
      </div>
    );
  }

  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>THIS WEEK</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        <ScoreCard label="WORKOUTS"  value={`${twW}/${WEEKLY_GOALS.workouts}`}   color={twW>=WEEKLY_GOALS.workouts?C.accent:C.text}/>
        <ScoreCard label="DIET 🟢"   value={`${twDG}/${WEEKLY_GOALS.dietGreen}`} color={twDG>=WEEKLY_GOALS.dietGreen?C.green:C.text}/>
        <ScoreCard label="ACTIVE 🟢" value={`${twAG}/${WEEKLY_GOALS.activeGreen}`} color={twAG>=WEEKLY_GOALS.activeGreen?C.green:C.text}/>
        <ScoreCard label="FOCUS HRS" value={twFocus>0?`${Math.round(twFocus/60*10)/10}h`:"—"} color={C.blue}/>
        <ScoreCard label="DIET 🔴"   value={`${twDR}/≤${WEEKLY_GOALS.dietRed}`} color={twDR<=WEEKLY_GOALS.dietRed?C.green:C.red}/>
      </div>

      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>8-WEEK TRENDS</div>

      {[
        {label:"WORKOUTS / WEEK", data:weeks.map(w=>w.workouts), max:maxW, color:C.accent},
        {label:"CLEAN DIET DAYS", data:weeks.map(w=>w.dg),       max:7,    color:C.green},
        {label:"ACTIVE DAYS",     data:weeks.map(w=>w.ag),       max:7,    color:C.green},
      ].map(({label,data,max,color})=>(
        <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
          <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>{label}</div>
          <MiniChart data={data} max={max} color={color}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>{weeks[0].label}</span>
            <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>Now</span>
          </div>
        </div>
      ))}

      {/* Focus hours trend */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>FOCUS HOURS / WEEK</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60}}>
          {weeks.map((w,i)=>{
            const h=Math.max((w.focusMins/Math.max(maxF,1))*52,w.focusMins>0?4:2);
            return <div key={i} style={{flex:1,height:h,background:w.focusMins>=120?C.blue:w.focusMins>0?C.border2:C.border,borderRadius:"3px 3px 0 0",transition:"height 0.4s",title:`${Math.round(w.focusMins/60*10)/10}h`}}/>;
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>{weeks[0].label}</span>
          <span style={{fontSize:9,color:C.border2,fontFamily:MONO}}>Now</span>
        </div>
      </div>

      {/* Diet red days */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
        <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:10}}>RED DIET DAYS / WEEK</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:40}}>
          {weeks.map((w,i)=>{
            const h=Math.max((w.dr/3)*36,w.dr>0?4:2);
            return <div key={i} style={{flex:1,height:h,background:w.dr===0?C.green:w.dr<=1?C.border2:C.red,borderRadius:"3px 3px 0 0",transition:"height 0.4s"}}/>;
          })}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{marginTop:32,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:9,color:C.dim,fontFamily:MONO,letterSpacing:"0.15em",marginBottom:8,fontWeight:700}}>DATA</div>
        <button style={{background:"transparent",border:`1px solid ${C.red}33`,borderRadius:8,color:C.red,padding:"10px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}
          onClick={onClearAll}>Clear all data</button>
        <div style={{fontSize:9,color:C.dim,fontFamily:MONO,marginTop:6,lineHeight:1.6}}>Removes workouts, diet, activity, focus, and boards from this browser. Cannot be undone.</div>
      </div>

    </div>
  );
}

// ─── LOG TAB ──────────────────────────────────────────────────────────────────
function LogTab({ history, dietLog, activeLog, onUpdateDiet, onUpdateActive, onStartBackfill, onOpenEdit }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekDays(weekOffset);
  const today = isoDate();
  const DAY_FULL = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // Index workouts by date for fast lookup
  const wkByDate = {};
  history.forEach((w, idx) => {
    const d = isoDate(new Date(w.date));
    if (!wkByDate[d]) wkByDate[d] = [];
    wkByDate[d].push({ w, idx });
  });

  function totalVol(exs){return exs.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);}

  return (
    <div style={{padding:"16px 16px 80px"}}>
      {/* Header */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:MONO,letterSpacing:"0.1em",marginBottom:4}}>LOG / EDIT</div>
        <div style={{fontSize:22,fontWeight:700,color:C.text,fontFamily:MONO,lineHeight:1.1}}>Past days</div>
        <div style={{fontSize:11,color:C.dim,fontFamily:MONO,marginTop:6,lineHeight:1.5}}>
          Set or change diet, activity, or workouts for any day this week. Use the arrows to look at older weeks.
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
                  {DAY_FULL[i]}{isToday ? " · TODAY" : ""}
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
                      <div style={{fontSize:10,color:C.dim,fontFamily:MONO,marginTop:2}}>
                        {w.exercises.length} ex · {Math.round(w.elapsed/60)} min · {totalVol(w.exercises).toLocaleString()} lbs
                      </div>
                    </div>
                    <span style={{fontSize:14,color:C.dim}}>›</span>
                  </button>
                ))}
                <button onClick={()=>onStartBackfill(d)} style={{
                  width:"100%", background:"transparent", border:`1px dashed ${C.border2}`,
                  borderRadius:8, color:C.dim, padding:"8px", fontSize:11, cursor:"pointer",
                  fontFamily:MONO, marginTop:wks.length>0?0:0,
                }}>+ Log workout on this day</button>
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
}) {
  // Merged catalogs that include user-created exercises
  const mergedNames = {...EXERCISES, ...Object.fromEntries(Object.entries(customExercises).map(([id,c])=>[id,c.name]))};
  const mergedMeta  = {...EX_META,    ...Object.fromEntries(Object.entries(customExercises).map(([id,c])=>[id,{muscle:c.muscle, cat:c.cat}]))};

  // PR detection — compute previous bests once on mount
  const prevBestsRef = useRef(null);
  const prTriggeredRef = useRef(new Set());
  const [activePR, setActivePR] = useState(null);
  if (prevBestsRef.current === null) prevBestsRef.current = bestRMByExercise(history, excludeWorkoutId);
  const [exercises, setExercises] = useState(() =>
    initialBlocks || initExercises.map(id=>({id:uid(),exId:id,sets:[{id:uid(),weight:"",reps:"",done:false},{id:uid(),weight:"",reps:"",done:false},{id:uid(),weight:"",reps:"",done:false}],notes:""}))
  );
  const [workoutName, setWorkoutName] = useState(initWorkoutName || "Workout");
  const [elapsed, setElapsed] = useState(initialElapsedSec);
  const [date, setDate] = useState(initialDate || isoDate());
  const [showPicker, setShowPicker] = useState(false);
  const [restLeft, setRestLeft] = useState(null);
  const timerRef=useRef(null); const restRef=useRef(null);
  const isLive = mode === "live";
  useEffect(()=>{
    if (!isLive) return;
    timerRef.current=setInterval(()=>setElapsed(e=>e+1),1000);
    return()=>clearInterval(timerRef.current);
  },[isLive]);
  function startRest(s){clearInterval(restRef.current);setRestLeft(s);restRef.current=setInterval(()=>setRestLeft(r=>{if(r<=1){clearInterval(restRef.current);return null;}return r-1;}),1000);}
  function totalVol(exs){return exs.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);}
  function compSets(exs){return exs.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0);}
  function e1RM(w,r){if(!w||!r)return 0;return Math.round(w*(1+r/30));}
  const done=compSets(exercises); const vol=totalVol(exercises);
  const canSave = isLive ? done > 0 : true;
  const ALL_EX=Object.entries(mergedNames);
  const [exSearch,setExSearch]=useState(""); const [exCat,setExCat]=useState("All");
  const [creatingCustom,setCreatingCustom]=useState(false);
  const [newExName,setNewExName]=useState(""); const [newExMuscle,setNewExMuscle]=useState("Quads"); const [newExCat,setNewExCat]=useState("Legs");
  const filteredEx=ALL_EX.filter(([id,name])=>{const m=mergedMeta[id];return name.toLowerCase().includes(exSearch.toLowerCase())&&(exCat==="All"||m?.cat===exCat);});

  function handleSave() {
    const finalDate = isLive ? new Date().toISOString() : new Date(date + "T12:00:00").toISOString();
    onFinish({exercises, elapsed, name: workoutName || "Workout", date: finalDate});
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 16px 12px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bg,zIndex:10,gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          {isLive ? (
            <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>{workoutName}</div>
          ) : (
            <input value={workoutName} onChange={e=>setWorkoutName(e.target.value)} placeholder="Workout name"
              style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO,background:"transparent",border:"none",outline:"none",padding:0,width:"100%"}}/>
          )}
          {isLive ? (
            <div style={{color:C.accent,fontFamily:MONO,fontSize:13}}>{formatTime(elapsed)}</div>
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
          <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={onCancel}>{isLive?"Discard":"Cancel"}</button>
          <button style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:canSave?"pointer":"default",fontFamily:MONO,opacity:canSave?1:0.4}}
            onClick={canSave?handleSave:undefined}>{isLive?"Finish":"Save"}</button>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-around",padding:"10px 0",borderBottom:`1px solid ${C.border}`,background:"#0d0d0d"}}>
        {[["Sets",done],["Volume",vol>0?`${(vol/1000).toFixed(1)}k lbs`:"—"],["Exercises",exercises.length]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center"}}><div style={{fontSize:17,fontWeight:700,color:C.text,fontFamily:MONO}}>{v}</div><div style={{fontSize:9,color:C.dim,letterSpacing:"0.1em",fontFamily:MONO,marginTop:2}}>{l}</div></div>
        ))}
      </div>
      {restLeft!==null&&<div style={{display:"flex",alignItems:"center",gap:10,background:C.card,borderBottom:`1px solid ${C.border}`,padding:"8px 16px"}}><span style={{color:C.accent}}>⏱</span><span style={{fontSize:16,fontWeight:700,color:C.accent,fontFamily:MONO,flex:1}}>{formatTime(restLeft)}</span><button style={{background:"transparent",border:"none",color:C.dim,fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={()=>{clearInterval(restRef.current);setRestLeft(null);}}>skip</button></div>}
      <div style={{padding:"12px 12px 100px"}}>
        {exercises.map((item,ei)=>{
          const exName=mergedNames[item.exId]||item.exId; const meta=mergedMeta[item.exId];
          const exVol=item.sets.reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
          const bestRM=item.sets.reduce((b,s)=>Math.max(b,e1RM(parseFloat(s.weight),parseInt(s.reps))),0);
          return(
            <div key={item.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div><div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:MONO,marginBottom:2}}>{exName}</div><div style={{fontSize:11,color:C.muted,fontFamily:MONO}}>{meta?.muscle} · {meta?.cat}</div></div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {exVol>0&&<span style={{fontSize:10,color:C.accent,background:"rgba(255,107,53,0.1)",padding:"2px 7px",borderRadius:6,fontFamily:MONO}}>{(exVol/1000).toFixed(1)}k</span>}
                  {bestRM>0&&<span style={{fontSize:10,color:C.purple,background:"rgba(167,139,250,0.1)",padding:"2px 7px",borderRadius:6,fontFamily:MONO}}>{bestRM}</span>}
                  <button style={{background:"transparent",border:"none",color:C.dim,fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={()=>setExercises(exercises.filter((_,j)=>j!==ei))}>✕</button>
                </div>
              </div>
              {item.sets.map((s,si)=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{width:22,textAlign:"center",fontSize:11,color:C.dim,fontFamily:MONO}}>{si+1}</span>
                  <input style={{flex:1,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:14,fontFamily:MONO,textAlign:"center",outline:"none",WebkitAppearance:"none"}} type="number" placeholder="lbs" value={s.weight} onChange={e=>{const sets=[...item.sets];sets[si]={...s,weight:e.target.value};setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}/>
                  <span style={{color:C.dim,fontSize:12}}>×</span>
                  <input style={{flex:1,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:14,fontFamily:MONO,textAlign:"center",outline:"none",WebkitAppearance:"none"}} type="number" placeholder="reps" value={s.reps} onChange={e=>{const sets=[...item.sets];sets[si]={...s,reps:e.target.value};setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}/>
                  {e1RM(parseFloat(s.weight),parseInt(s.reps))>0&&<span style={{fontSize:10,color:C.muted,fontFamily:MONO,width:40,textAlign:"center"}}>{e1RM(parseFloat(s.weight),parseInt(s.reps))}</span>}
                  <button style={{width:34,height:34,borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:700,background:s.done?C.accent:"transparent",color:s.done?"#000":C.dim,border:s.done?"none":`1px solid ${C.border2}`,transition:"all 0.15s",flexShrink:0,fontFamily:MONO}} onClick={()=>{
                    const newDone = !s.done;
                    // PR detection: only on transition to done, for non-cardio, in non-edit mode
                    if (newDone && mode !== "edit" && mergedMeta[item.exId]?.cat !== "Cardio" && !prTriggeredRef.current.has(s.id)) {
                      const rm = e1RM(parseFloat(s.weight), parseInt(s.reps));
                      if (rm > 0) {
                        const prev = prevBestsRef.current[item.exId] || 0;
                        if (rm > prev) {
                          prTriggeredRef.current.add(s.id);
                          prevBestsRef.current[item.exId] = rm;
                          setActivePR({
                            exId: item.exId,
                            exName: mergedNames[item.exId] || item.exId,
                            rm, prev,
                            weight: s.weight, reps: s.reps,
                          });
                        }
                      }
                    }
                    const sets=[...item.sets];sets[si]={...s,done:newDone};setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));
                  }}>{s.done?"✓":"○"}</button>
                  <button style={{width:20,background:"transparent",border:"none",color:C.border2,fontSize:10,cursor:"pointer"}} onClick={()=>{const sets=item.sets.filter((_,j)=>j!==si);setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex));}}>✕</button>
                </div>
              ))}
              <button style={{width:"100%",background:"transparent",border:`1px dashed ${C.border}`,borderRadius:8,color:C.dim,padding:"7px",fontSize:11,cursor:"pointer",marginTop:4,fontFamily:MONO}} onClick={()=>{ const sets=[...item.sets,{id:uid(),weight:"",reps:"",done:false}]; setExercises(exercises.map((ex,j)=>j===ei?{...ex,sets}:ex)); }}>+ Add Set</button>
            </div>
          );
        })}
        <button style={{width:"100%",background:"transparent",border:`1px solid ${C.border}`,borderRadius:12,color:C.muted,padding:14,fontSize:13,cursor:"pointer",marginTop:4,fontFamily:MONO}} onClick={()=>setShowPicker(true)}>+ Add Exercise</button>
        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <span style={{color:C.dim,fontSize:11,fontFamily:MONO,flexShrink:0}}>Rest:</span>
          {[60,90,120,180].map(s=><button key={s} style={{background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.muted,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={()=>startRest(s)}>{s<60?`${s}s`:`${s/60}m`}</button>)}
        </div>
      </div>
      {showPicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"78vh",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"16px 18px",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>Add Exercise</span><button style={{background:"transparent",border:"none",color:C.muted,fontSize:16,cursor:"pointer"}} onClick={()=>setShowPicker(false)}>✕</button></div>
            <input style={{background:"#161616",border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,padding:"10px 14px",fontSize:13,margin:"12px 16px 0",outline:"none",fontFamily:MONO}} placeholder="Search…" value={exSearch} onChange={e=>setExSearch(e.target.value)} autoFocus/>
            <div style={{display:"flex",gap:6,padding:"10px 16px",overflowX:"auto",flexShrink:0}}>
              {["All","Push","Pull","Legs","Arms","Full Body","Cardio"].map(c=><button key={c} style={{borderRadius:20,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO,whiteSpace:"nowrap",flexShrink:0,background:exCat===c?C.accent:"#1a1a1a",color:exCat===c?"#000":C.muted,border:exCat===c?"none":`1px solid ${C.border}`}} onClick={()=>setExCat(c)}>{c}</button>)}
            </div>
            <div style={{overflowY:"auto",padding:"0 12px 24px"}}>
              {creatingCustom ? (
                <div style={{background:"#161616",border:`1px solid ${C.accent}`,borderRadius:10,padding:14,marginBottom:8}}>
                  <div style={{fontSize:11,color:C.accent,fontFamily:MONO,marginBottom:10,letterSpacing:"0.1em",fontWeight:700}}>NEW CUSTOM EXERCISE</div>
                  <input autoFocus value={newExName} onChange={e=>setNewExName(e.target.value)} placeholder="Name (e.g. Bulgarian Split Squat)"
                    style={{width:"100%",background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,fontFamily:MONO,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                  <div style={{display:"flex",gap:8,marginBottom:10}}>
                    <select value={newExMuscle} onChange={e=>setNewExMuscle(e.target.value)}
                      style={{flex:1,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"7px 8px",fontSize:12,fontFamily:MONO,outline:"none"}}>
                      {["Chest","Back","Shoulders","Biceps","Triceps","Traps","Quads","Hamstrings","Glutes","Calves","Core","Cardio","Full Body","Other"].map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={newExCat} onChange={e=>setNewExCat(e.target.value)}
                      style={{flex:1,background:"#1a1a1a",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"7px 8px",fontSize:12,fontFamily:MONO,outline:"none"}}>
                      {["Push","Pull","Legs","Arms","Full Body","Cardio"].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button style={{flex:1,background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:700,cursor:newExName.trim()?"pointer":"default",fontFamily:MONO,opacity:newExName.trim()?1:0.4}}
                      onClick={()=>{
                        if (!newExName.trim() || !onAddCustom) return;
                        const newId = onAddCustom(newExName, newExMuscle, newExCat);
                        setExercises([...exercises,{id:uid(),exId:newId,sets:[{id:uid(),weight:"",reps:"",done:false},{id:uid(),weight:"",reps:"",done:false},{id:uid(),weight:"",reps:"",done:false}],notes:""}]);
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
                    onClick={()=>{setExercises([...exercises,{id:uid(),exId:id,sets:[{id:uid(),weight:"",reps:"",done:false},{id:uid(),weight:"",reps:"",done:false},{id:uid(),weight:"",reps:"",done:false}],notes:""}]);setShowPicker(false);}}>
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
      {activePR && <PRCelebration pr={activePR} onClose={()=>setActivePR(null)}/>}
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
        <div style={{fontSize:64,fontWeight:900,color:C.accent,fontFamily:MONO,lineHeight:1,textShadow:"0 0 32px rgba(255,107,53,0.6)",marginBottom:6}}>{pr.rm}</div>
        <div style={{fontSize:9,letterSpacing:"0.25em",color:C.muted,fontFamily:MONO,marginBottom:18}}>EST 1RM · LBS</div>
        <div style={{fontSize:12,color:C.muted,fontFamily:MONO,marginBottom:24}}>
          {pr.weight} lbs × {pr.reps} reps
          {pr.prev > 0 ? <span style={{color:C.dim}}> · up from {pr.prev}</span> : <span style={{color:C.dim}}> · first PR</span>}
        </div>
        <button onClick={onClose} style={{background:C.accent,border:"none",borderRadius:10,color:"#000",padding:"14px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:MONO,letterSpacing:"0.05em"}}>Keep Going →</button>
      </div>
    </div>
  );
}


// ─── ROONEY CHAT ─────────────────────────────────────────────────────────────
// ─── Rooney tools ─────────────────────────────────────────────────────────────
const EXERCISE_ID_LIST = Object.keys(EXERCISES).join(", ");
const ROONEY_TOOLS = [
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
  const G = { ...DEFAULT_GOALS, ...(goals || {}) };
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
  if (redDays > G.dietRed) obs.push(`Red diet days over cap: ${redDays} (max ${G.dietRed}).`);

  // PR check on latest workout
  const latest = history[0];
  if (latest) {
    const priors = bestRMByExercise(history.slice(1), latest.id);
    for (const ex of latest.exercises) {
      const meta = EX_META[ex.exId];
      if (meta?.cat === "Cardio") continue;
      let best = 0;
      for (const s of ex.sets) {
        if (!s.done) continue;
        const rm = e1RM(parseFloat(s.weight), parseInt(s.reps));
        if (rm > best) best = rm;
      }
      const prev = priors[ex.exId] || 0;
      if (best > 0 && best > prev) {
        const name = EXERCISES[ex.exId] || ex.exId;
        obs.push(`New PR on ${isoDate(new Date(latest.date))}: ${name} ${best} e1RM (prev ${prev || "none"}).`);
        break; // one PR mention per latest workout
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

function buildRooneyContext({ history, dietLog, activeLog, focusSessions, boards, memories, goals }) {
  const today = isoDate();
  const thisWeekDays = getWeekDays(0);

  const wkWorkouts = history.filter(w => thisWeekDays.includes(isoDate(new Date(w.date)))).length;
  const wkDietGreen = thisWeekDays.filter(d => dietLog[d] === "green").length;
  const wkDietRed   = thisWeekDays.filter(d => dietLog[d] === "red").length;
  const wkActive    = thisWeekDays.filter(d => activeLog[d] === "green").length;
  const wkFocusMins = focusSessions.filter(s => thisWeekDays.includes(s.date)).reduce((a,s)=>a+s.mins,0);

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

WEEKLY GOALS (only 3 trackers — diet, activity, workouts):
- Workouts: 4/week (current: ${wkWorkouts}/4)
- Clean diet days: 4 green/week (current: ${wkDietGreen}/4)
- Max red diet days: 1/week (current: ${wkDietRed})
- Active days: 4 green/week (current: ${wkActive}/4)

Focus is NOT a daily traffic-light tracker. Focus sessions are real timed work blocks Andrew logs via the coffee-mug timer on the Focus tab. Use focus minutes/hours as a metric, not as a "did you focus today" yes/no.

TODAY (${today}):
- Diet: ${todayDiet}
- Activity: ${todayActive}
- Focus session time today: ${todayFocusMins} minutes

THIS WEEK:
- Workouts completed: ${wkWorkouts}
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

function RooneyChat({ history, dietLog, activeLog, focusSessions, boards, memories=[], goals, onLogWorkout, onLogDiet, onLogActivity, onAddCard, onRemember, onForget, onDeleteMemory, onClose }) {
  const [messages, setMessages] = useState([
    { role:"assistant", content: "Hey Andrew. I'm Rooney. I can see your workouts, diet, focus, and boards, and I remember things you tell me across conversations. I can also log past workouts, diet days, activity, or todo cards. What's on your mind?" }
  ]);
  const [showMemPanel, setShowMemPanel] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  useEffect(()=>{ setTimeout(()=>inputRef.current?.focus(), 100); }, []);

  function executeTool(name, input) {
    try {
      if (name === "log_workout") {
        const r = onLogWorkout(input);
        return { ok: true, summary: r.summary };
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

    const systemPrompt = buildRooneyContext({ history, dietLog, activeLog, focusSessions, boards, memories, goals });

    // Convert displayed messages into API messages (drop UI-only fields)
    let apiMessages = nextMsgs.map(m => {
      if (Array.isArray(m.content)) return { role: m.role, content: m.content };
      return { role: m.role, content: m.content };
    });

    const collectedToolCalls = [];

    try {
      // Tool-use loop: keep calling API until we get a normal text response
      for (let turn = 0; turn < 6; turn++) {
        const res = await fetch("/api/rooney", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
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
        <span style={{fontSize:24}}>🔥</span>
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

function GoalsEditor({ goals, onSave, onClose, onReset }) {
  const [draft, setDraft] = useState({ ...goals });
  function set(key, val) {
    const n = parseInt(val);
    setDraft(d => ({ ...d, [key]: isNaN(n) ? 0 : Math.max(0, Math.min(7, n)) }));
  }
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:150,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"88vh",display:"flex",flexDirection:"column",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 18px",borderBottom:`1px solid ${C.border}`}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:MONO}}>Edit Weekly Goals</div>
            <div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginTop:2}}>How often you want to hit each per week</div>
          </div>
          <button style={{background:"transparent",border:"none",color:C.muted,fontSize:16,cursor:"pointer"}} onClick={onClose}>✕</button>
        </div>
        <div style={{padding:"8px 16px"}}>
          {GOAL_META.map(m => (
            <div key={m.key} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:22,width:28,textAlign:"center"}}>{m.emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.text,fontFamily:MONO}}>{m.label}</div>
                <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginTop:2}}>
                  {m.type === "max" ? "at most" : "at least"} this many per week
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button style={{width:30,height:30,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:14,cursor:"pointer",fontFamily:MONO}} onClick={()=>set(m.key, (draft[m.key]||0) - 1)}>−</button>
                <input type="number" min="0" max="7" value={draft[m.key] ?? 0} onChange={e=>set(m.key, e.target.value)}
                  style={{width:44,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"6px 0",fontSize:14,fontFamily:MONO,textAlign:"center",outline:"none"}}/>
                <button style={{width:30,height:30,background:"#161616",border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:14,cursor:"pointer",fontFamily:MONO}} onClick={()=>set(m.key, (draft[m.key]||0) + 1)}>+</button>
                <span style={{fontSize:10,color:C.dim,fontFamily:MONO,width:24,textAlign:"right"}}>/wk</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
          <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={onReset}>Reset</button>
          <div style={{flex:1}}/>
          <button style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:11,cursor:"pointer",fontFamily:MONO}} onClick={onClose}>Cancel</button>
          <button style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"10px 18px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:MONO}} onClick={()=>onSave(draft)}>Save</button>
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

  // UI state
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState("home");
  const [wkInit, setWkInit] = useState(null);
  const [completedWk, setCompletedWk] = useState(null);
  const [editingWk, setEditingWk] = useState(null);
  const [showRooney, setShowRooney] = useState(false);
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState(null);

  // Editable weekly goals — localStorage-backed for now (low complexity,
  // doesn't really need cross-device sync since you'd set the same anyway).
  const [goals, setGoalsRaw] = usePersistedState("iron_goals", DEFAULT_GOALS);
  const mergedGoals = { ...DEFAULT_GOALS, ...goals };
  function setGoals(next) { setGoalsRaw({ ...mergedGoals, ...next }); }

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

  function updateDiet(d,v){ dietState.setForDate(d, v); }
  function updateActive(d,v){ activityState.setForDate(d, v); }
  function addSession(s){ focusState.add(s); }

  async function clearAll() {
    if (!window.confirm("Clear ALL data? This wipes your workouts, diet, activity, focus sessions, boards, and custom exercises from the cloud. Cannot be undone.")) return;
    await Promise.all([
      supabase.from("workouts").delete().eq("user_id", userId),
      supabase.from("diet_log").delete().eq("user_id", userId),
      supabase.from("activity_log").delete().eq("user_id", userId),
      supabase.from("focus_sessions").delete().eq("user_id", userId),
      supabase.from("boards").delete().eq("user_id", userId),
      supabase.from("custom_exercises").delete().eq("user_id", userId),
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
        id: uid(), weight: String(weight || ""), reps: String(reps || ""), done: true,
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

  if(screen==="workout"&&wkInit) return <WorkoutScreen mode="live" initExercises={wkInit.exercises} workoutName={wkInit.name} customExercises={customExercises} onAddCustom={addCustomExercise} history={history} onFinish={finishWorkout} onCancel={()=>setScreen("home")}/>;
  if(screen==="backfill"&&wkInit) return <WorkoutScreen mode="backfill" initExercises={wkInit.exercises} workoutName={wkInit.name} initialDate={wkInit.date} customExercises={customExercises} onAddCustom={addCustomExercise} history={history} onFinish={saveBackfill} onCancel={()=>setScreen("home")}/>;
  if(screen==="edit"&&editingWk) return <WorkoutScreen
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
  />;

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
            return(
              <div key={item.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:C.text,fontFamily:MONO}}>{EXERCISES[item.exId]||customExercises[item.exId]?.name||item.exId}</span><span style={{fontSize:12,color:C.accent,fontFamily:MONO}}>{exVol>0?`${exVol.toLocaleString()} lbs`:""}</span></div>
                <div style={{fontSize:11,color:C.muted,fontFamily:MONO}}>{item.sets.filter(s=>s.done).length} sets · max {maxW} lbs</div>
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
    { key:"home",  icon:"🏠",  label:"Home"  },
    { key:"iron",  icon:"🏋",  label:"Iron"  },
    { key:"focus", icon:"⬡",  label:"Focus" },
    { key:"log",   icon:"✎",  label:"Log"   },
  ];

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:MONO,maxWidth:480,margin:"0 auto",position:"relative"}}>

      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 18px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:20}}>🔥</span>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:"0.2em",color:"#fff",fontFamily:MONO}}>IRON</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {dietLog[isoDate()]&&<span style={{fontSize:14}}>{DIET_CONFIG[dietLog[isoDate()]].emoji}</span>}
          {activeLog[isoDate()]&&<span style={{fontSize:14}}>{ACTIVE_CONFIG[activeLog[isoDate()]].emoji}</span>}
        </div>
      </div>

      {/* Content */}
      <div style={{paddingBottom:80}}>
        {tab==="home"  && <HomeTab  history={history} dietLog={dietLog} activeLog={activeLog} focusSessions={focusSessions} onGoTo={setTab} onOpenEdit={openEditWorkout} onClearAll={clearAll} onSignOut={auth.signOut} userEmail={auth.user?.email} onUpdatePassword={auth.updatePassword} goals={mergedGoals} onEditGoals={()=>setShowGoalsEditor(true)}/>}
        {tab==="iron"  && <IronTab  history={history} dietLog={dietLog} activeLog={activeLog} onUpdateDiet={updateDiet} onUpdateActive={updateActive} onStartWorkout={startWorkout} onOpenEdit={openEditWorkout}/>}
        {tab==="focus" && <FocusTab focusSessions={focusSessions} onAddSession={addSession} boards={boards} setBoards={setBoards}/>}
        {tab==="log"   && <LogTab   history={history} dietLog={dietLog} activeLog={activeLog} onUpdateDiet={updateDiet} onUpdateActive={updateActive} onStartBackfill={startBackfill} onOpenEdit={openEditWorkout}/>}
      </div>

      {/* Rooney floating button */}
      {!showRooney && (
        <button onClick={()=>setShowRooney(true)} style={{position:"fixed",bottom:72,right:16,width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B35,#38bdf8)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#000",fontFamily:"monospace",boxShadow:"0 4px 20px rgba(255,107,53,0.35)",zIndex:30}}>R</button>
      )}

      {/* Rooney overlay */}
      {showRooney && (
        <RooneyChat
          history={history} dietLog={dietLog} activeLog={activeLog}
          focusSessions={focusSessions} boards={boards}
          memories={memoriesState.data}
          goals={mergedGoals}
          onLogWorkout={rooneyLogWorkout}
          onLogDiet={rooneyLogDiet}
          onLogActivity={rooneyLogActivity}
          onAddCard={rooneyAddCard}
          onRemember={rooneyRemember}
          onForget={rooneyForget}
          onDeleteMemory={(id)=>memoriesState.remove(id)}
          onClose={()=>setShowRooney(false)}
        />
      )}

      {showGoalsEditor && (
        <GoalsEditor
          goals={mergedGoals}
          onSave={(g) => { setGoals(g); setShowGoalsEditor(false); }}
          onClose={() => setShowGoalsEditor(false)}
          onReset={() => { setGoals(DEFAULT_GOALS); setShowGoalsEditor(false); }}
        />
      )}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:20}}>
        {TABS.map(t=>(
          <button key={t.key} style={{flex:1,background:"none",border:"none",padding:"10px 0 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}
            onClick={()=>setTab(t.key)}>
            <span style={{fontSize:16,color:tab===t.key?C.accent:C.dim}}>{t.icon}</span>
            <span style={{fontSize:9,color:tab===t.key?C.accent:C.dim,fontFamily:MONO,letterSpacing:"0.08em"}}>{t.label}</span>
          </button>
        ))}
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
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
*{-webkit-tap-highlight-color:transparent}
textarea{font-family:'DM Mono','Courier New',monospace}
`;
document.head.appendChild(_s);
