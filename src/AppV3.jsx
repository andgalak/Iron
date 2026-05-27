import { useState, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT = "#C8F135";
const BAR_WEIGHT = 45;
const PLATES = [45, 35, 25, 10, 5, 2.5];
const ACTIVE_CONFIG = {
  green:  { label: "Active",  emoji: "🟢", color: "#4ade80", bg: "rgba(74,222,128,0.12)",  desc: "Crushed it — gym, run, all in" },
  yellow: { label: "Moving",  emoji: "🟡", color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  desc: "Light movement, walk, stretch" },
  red:    { label: "Rest",    emoji: "🔴", color: "#f87171", bg: "rgba(248,113,113,0.12)", desc: "Full rest day" },
};
const DIET_GOALS = { green: 4, yellow: 2, red: 1 }; // legacy default — replaced by editable goals below
const DEFAULT_GOALS = {
  workoutsPerWeek: 3,
  zone2PerWeek: 2,
  dietGreenPerWeek: 4,
  dietRedMaxPerWeek: 1,
  activeDaysPerWeek: 4,
};
const GOAL_META = [
  { key: "workoutsPerWeek",   label: "Workouts",        emoji: "💪", color: "#C8F135", type: "min" },
  { key: "zone2PerWeek",      label: "Zone 2",          emoji: "🫀", color: "#34D399", type: "min" },
  { key: "dietGreenPerWeek",  label: "Green diet days", emoji: "🟢", color: "#4ade80", type: "min" },
  { key: "dietRedMaxPerWeek", label: "Red diet days",   emoji: "🔴", color: "#f87171", type: "max" },
  { key: "activeDaysPerWeek", label: "Active days",     emoji: "👟", color: "#4ade80", type: "min" },
];

const DIET_CONFIG = {
  green:  { label: "Green",  emoji: "🟢", color: "#4ade80", bg: "rgba(74,222,128,0.12)",  desc: "Clean eating, on plan" },
  yellow: { label: "Yellow", emoji: "🟡", color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  desc: "Decent, minor slips" },
  red:    { label: "Red",    emoji: "🔴", color: "#f87171", bg: "rgba(248,113,113,0.12)", desc: "Off plan day" },
};

const EXERCISES = {
  bench:       { name: "Bench Press",       muscle: "Chest",      cat: "Push",   equipment: "barbell" },
  incline:     { name: "Incline Bench",      muscle: "Chest",      cat: "Push",   equipment: "barbell" },
  db_fly:      { name: "DB Fly",             muscle: "Chest",      cat: "Push",   equipment: "dumbbell" },
  cable_fly:   { name: "Cable Fly",          muscle: "Chest",      cat: "Push",   equipment: "cable" },
  dip:         { name: "Weighted Dip",       muscle: "Chest",      cat: "Push",   equipment: "bodyweight" },
  deadlift:    { name: "Deadlift",           muscle: "Back",       cat: "Pull",   equipment: "barbell" },
  row:         { name: "Barbell Row",        muscle: "Back",       cat: "Pull",   equipment: "barbell" },
  pullup:      { name: "Pull-Up",            muscle: "Back",       cat: "Pull",   equipment: "bodyweight" },
  lat:         { name: "Lat Pulldown",       muscle: "Back",       cat: "Pull",   equipment: "cable" },
  cable_row:   { name: "Cable Row",          muscle: "Back",       cat: "Pull",   equipment: "cable" },
  db_row:      { name: "DB Row",             muscle: "Back",       cat: "Pull",   equipment: "dumbbell" },
  squat:       { name: "Back Squat",         muscle: "Quads",      cat: "Legs",   equipment: "barbell" },
  leg_press:   { name: "Leg Press",          muscle: "Quads",      cat: "Legs",   equipment: "machine" },
  rdl:         { name: "Romanian Deadlift",  muscle: "Hamstrings", cat: "Legs",   equipment: "barbell" },
  leg_curl:    { name: "Leg Curl",           muscle: "Hamstrings", cat: "Legs",   equipment: "machine" },
  lunge:       { name: "Walking Lunge",      muscle: "Quads",      cat: "Legs",   equipment: "dumbbell" },
  hack_squat:  { name: "Hack Squat",         muscle: "Quads",      cat: "Legs",   equipment: "machine" },
  calf_raise:  { name: "Calf Raise",         muscle: "Calves",     cat: "Legs",   equipment: "machine" },
  ohp:         { name: "Overhead Press",     muscle: "Shoulders",  cat: "Push",   equipment: "barbell" },
  lateral:     { name: "Lateral Raise",      muscle: "Shoulders",  cat: "Push",   equipment: "dumbbell" },
  curl:        { name: "Barbell Curl",       muscle: "Biceps",     cat: "Arms",   equipment: "barbell" },
  hammer:      { name: "Hammer Curl",        muscle: "Biceps",     cat: "Arms",   equipment: "dumbbell" },
  tricep_push: { name: "Tricep Pushdown",    muscle: "Triceps",    cat: "Arms",   equipment: "cable" },
  skull:       { name: "Skull Crusher",      muscle: "Triceps",    cat: "Arms",   equipment: "barbell" },
  zone2:       { name: "Zone 2 Cardio",      muscle: "Cardio",     cat: "Cardio", equipment: "cardio" },
  stairmaster: { name: "Stairmaster",        muscle: "Cardio",     cat: "Cardio", equipment: "cardio" },
  burpee:      { name: "Burpees",            muscle: "Full Body",  cat: "Cardio", equipment: "bodyweight" },
  kb_swing:    { name: "KB Swing",           muscle: "Full Body",  cat: "Cardio", equipment: "kettlebell" },
  box_jump:    { name: "Box Jump",           muscle: "Quads",      cat: "Cardio", equipment: "bodyweight" },
  med_ball:    { name: "Med Ball Slam",      muscle: "Full Body",  cat: "Cardio", equipment: "other" },
  farmers:     { name: "Farmer's Carry",     muscle: "Full Body",  cat: "Legs",   equipment: "dumbbell" },
  nordic:      { name: "Nordic Curl",        muscle: "Hamstrings", cat: "Legs",   equipment: "bodyweight" },
  face_pull:   { name: "Face Pull",          muscle: "Shoulders",  cat: "Pull",   equipment: "cable" },
  incline_db:  { name: "Incline DB Curl",    muscle: "Biceps",     cat: "Arms",   equipment: "dumbbell" },
};

const MIX_IT_UP_MODES = [
  { id: "quick_hybrid", name: "Quick Hybrid",     emoji: "⚡", desc: "30 min · Strength + cardio finisher", color: ACCENT },
  { id: "big_hiit",     name: "Big HIIT",          emoji: "🔥", desc: "45 min · High intensity circuits",    color: "#FF6B35" },
  { id: "legs_mix",     name: "Legs Remix",        emoji: "🦵", desc: "Legs day but nothing you'd normally pick", color: "#A78BFA" },
  { id: "upper_blast",  name: "Upper Blast",       emoji: "💪", desc: "Push/pull superset focused",          color: "#38BDF8" },
  { id: "recovery",     name: "Active Recovery",   emoji: "🌊", desc: "Light movement, high reps, low weight", color: "#34D399" },
];

const BUILT_IN_PROGRAMS = [
  {
    id: "ppl", name: "Push Pull Legs", tag: "PPL · 3×/week",
    days: [
      { id: "push", name: "Push",  icon: "⬆", exercises: ["bench","incline","ohp","tricep_push","lateral"] },
      { id: "pull", name: "Pull",  icon: "⬇", exercises: ["deadlift","row","pullup","lat","curl"] },
      { id: "legs", name: "Legs",  icon: "🦵", exercises: ["squat","rdl","leg_press","calf_raise"] },
    ],
  },
  {
    id: "upper_lower", name: "Upper / Lower", tag: "4×/week",
    days: [
      { id: "upper_a", name: "Upper A", icon: "💪", exercises: ["bench","row","ohp","curl","skull"] },
      { id: "lower_a", name: "Lower A", icon: "🦵", exercises: ["squat","rdl","leg_curl","calf_raise"] },
      { id: "upper_b", name: "Upper B", icon: "💪", exercises: ["incline","pullup","lateral","hammer","tricep_push"] },
      { id: "lower_b", name: "Lower B", icon: "🦵", exercises: ["leg_press","rdl","lunge","calf_raise"] },
    ],
  },
  {
    id: "zone2_lift", name: "Zone 2 + Lift", tag: "4×/week · Cardio",
    days: [
      { id: "z2_chest", name: "Zone 2 + Chest", icon: "❤️", exercises: ["zone2","bench","incline","cable_fly"] },
      { id: "z2_back",  name: "Zone 2 + Back",  icon: "❤️", exercises: ["zone2","deadlift","row","lat"] },
      { id: "z2_legs",  name: "Zone 2 + Legs",  icon: "❤️", exercises: ["zone2","squat","rdl","leg_press"] },
      { id: "z2_only",  name: "Zone 2 Only",    icon: "🫀", exercises: ["zone2","stairmaster"] },
    ],
  },
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function calcPlates(w) {
  let rem = (w - BAR_WEIGHT) / 2;
  if (rem <= 0) return [];
  const out = [];
  for (const p of PLATES) { const c = Math.floor(rem/p); if (c>0){out.push({plate:p,count:c});rem-=c*p;} }
  return out;
}
function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; }
function est1RM(w,r) { if(!w||!r) return 0; return Math.round(w*(1+r/30)); }
function uid() { return Math.random().toString(36).slice(2,9); }
function makeSet(w="",r="") { return {id:uid(),weight:w,reps:r,done:false}; }
function makeExBlock(exId) { return {id:uid(),exId,sets:[makeSet(),makeSet(),makeSet()],notes:""}; }
function totalVolume(exs) { return exs.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0); }
function completedSets(exs) { return exs.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).length,0); }
function isoDate(d=new Date()) { return d.toISOString().slice(0,10); }
function getDayLabel(iso) {
  const d=new Date(iso+"T12:00:00"); const today=new Date(); const diff=Math.round((today-d)/86400000);
  if(diff===0) return "Today"; if(diff===1) return "Yesterday";
  if(diff<7) return d.toLocaleDateString("en-US",{weekday:"short"});
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}
function getWeekDays(offset=0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day+6)%7) + offset*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); return isoDate(d); });
}
function weekStartDate(offset=0){
  const now=new Date(); const day=now.getDay();
  const m=new Date(now); m.setDate(now.getDate()-((day+6)%7)+offset*7); m.setHours(0,0,0,0);
  return m;
}
function bestRMByExercise(history, excludeWorkoutDate=null) {
  const result = {};
  for (const w of history) {
    if (excludeWorkoutDate && w.date === excludeWorkoutDate) continue;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!s.done) continue;
        const rm = est1RM(parseFloat(s.weight), parseInt(s.reps));
        if (rm > (result[ex.exId] || 0)) result[ex.exId] = rm;
      }
    }
  }
  return result;
}

// ─── Persistence Hook ─────────────────────────────────────────────────────────
function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

// ─── Plate Visual ─────────────────────────────────────────────────────────────
function PlateVisual({ weight }) {
  const plates = calcPlates(parseFloat(weight)||0);
  const colors = {45:"#E53E3E",35:"#3182CE",25:"#FBBF24",10:"#48BB78",5:"#9F7AEA",2.5:"#CBD5E0"};
  if (!plates.length) return <div style={{fontSize:11,color:"#333",fontFamily:"monospace"}}>— bar only —</div>;
  return (
    <div style={{display:"flex",alignItems:"center",gap:3,flexWrap:"wrap"}}>
      {plates.map(({plate,count})=>Array.from({length:count}).map((_,i)=>(
        <div key={`${plate}-${i}`} style={{background:colors[plate]||"#555",color:"#fff",fontSize:9,fontWeight:700,width:plate>=35?22:plate>=10?18:14,height:plate>=35?28:plate>=10?24:18,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>{plate}</div>
      )))}
      <span style={{fontSize:10,color:"#444",marginLeft:4,fontFamily:"monospace"}}>×2 + bar</span>
    </div>
  );
}

// ─── Diet Day Picker ─────────────────────────────────────────────────────────
function DietDayPicker({ date, value, onChange }) {
  return (
    <div style={{display:"flex",gap:8,marginBottom:2}}>
      {Object.entries(DIET_CONFIG).map(([key,cfg])=>(
        <button key={key} onClick={()=>onChange(value===key?null:key)} style={{
          flex:1, padding:"10px 0", borderRadius:10, border:"none", cursor:"pointer",
          background: value===key ? cfg.bg : "#161616",
          outline: value===key ? `2px solid ${cfg.color}` : "2px solid transparent",
          fontSize:18, transition:"all 0.15s",
        }}>{cfg.emoji}</button>
      ))}
    </div>
  );
}

// ─── Active Day Picker ───────────────────────────────────────────────────────
function ActivePicker({ value, onChange }) {
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:6}}>
        {Object.entries(ACTIVE_CONFIG).map(([key,cfg])=>(
          <button key={key} onClick={()=>onChange(value===key?null:key)} style={{
            flex:1, padding:"10px 0", borderRadius:10, border:"none", cursor:"pointer",
            background: value===key ? cfg.bg : "#161616",
            outline: value===key ? `2px solid ${cfg.color}` : "2px solid transparent",
            fontSize:18, transition:"all 0.15s",
          }}>{cfg.emoji}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        {Object.entries(ACTIVE_CONFIG).map(([key,cfg])=>(
          <div key={key} style={{flex:1,fontSize:9,color:value===key?cfg.color:"#2a2a2a",fontFamily:"monospace",textAlign:"center"}}>{cfg.desc}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Diet Tab ────────────────────────────────────────────────────────────────
function DietTab({ dietLog, activeLog, bodyweightLog = {}, goals = DEFAULT_GOALS, onUpdateDiet, onUpdateActive, onUpdateBW }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekDays(weekOffset);
  const today = isoDate();
  const DAY_LABELS = ["M","T","W","T","F","S","S"];

  // Weekly summary
  const weekCounts = { green:0, yellow:0, red:0, active_green:0, active_yellow:0 };
  days.forEach(d=>{
    const v = dietLog[d];
    if(v) weekCounts[v]=(weekCounts[v]||0)+1;
    const av=activeLog[d]; if(av==="green") weekCounts.active_green++; if(av==="yellow") weekCounts.active_yellow++;
  });

  const weekScore = [
    { key:"green", target: goals.dietGreenPerWeek,  got: weekCounts.green },
    { key:"red",   target: goals.dietRedMaxPerWeek, got: weekCounts.red   },
  ];

  return (
    <div style={{padding:"16px 16px 80px"}}>

      {/* Week nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <button style={S.ghostBtn} onClick={()=>setWeekOffset(o=>o-1)}>‹ Prev</button>
        <span style={{fontSize:12,color:"#555",fontFamily:"monospace"}}>
          {weekOffset===0?"This Week":weekOffset===-1?"Last Week":`${Math.abs(weekOffset)} weeks ago`}
        </span>
        <button style={{...S.ghostBtn,opacity:weekOffset>=0?0.3:1}} onClick={()=>weekOffset<0&&setWeekOffset(o=>o+1)}>Next ›</button>
      </div>

      {/* 7-day strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:20}}>
        {days.map((d,i)=>{
          const diet = dietLog[d]; const active2 = activeLog[d];
          const isToday = d===today;
          const cfg = diet ? DIET_CONFIG[diet] : null;
          const acfg2 = active2 ? ACTIVE_CONFIG[active2] : null;
          return (
            <div key={d} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:isToday?ACCENT:"#333",fontFamily:"monospace",marginBottom:4,fontWeight:isToday?700:400}}>{DAY_LABELS[i]}</div>
              <div style={{
                height:44, borderRadius:10, border: isToday?`1px solid ${ACCENT}`:"1px solid #1a1a1a",
                background: cfg ? cfg.bg : "#111",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                fontSize:16,
              }}>
                {cfg ? cfg.emoji : <span style={{fontSize:12,color:"#222"}}>·</span>}
                {acfg2 && <span style={{fontSize:9,color:acfg2.color,marginTop:1}}>{acfg2.emoji}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Goal tracker */}
      <div style={S.sectionLabel}>WEEKLY GOALS</div>
      <div style={{...S.card,marginBottom:16}}>
        {weekScore.map(({key,target,got})=>{
          const cfg = DIET_CONFIG[key];
          const isRed = key==="red";
          const hit = isRed ? got<=target : got>=target;
          return (
            <div key={key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <span style={{fontSize:20}}>{cfg.emoji}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,color:"#888",fontFamily:"monospace"}}>{cfg.label} days</span>
                  <span style={{fontSize:12,fontFamily:"monospace",color:hit?cfg.color:"#444"}}>
                    {got}/{isRed?`≤${target}`:`${target}`} {hit?"✓":""}
                  </span>
                </div>
                <div style={{height:4,background:"#1a1a1a",borderRadius:2}}>
                  <div style={{
                    height:4,borderRadius:2,
                    width:`${Math.min(got/target,1)*100}%`,
                    background: isRed && got>target ? "#f87171" : hit ? cfg.color : "#2a2a2a",
                    transition:"width 0.4s",
                  }}/>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20}}>👟</span>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,color:"#888",fontFamily:"monospace"}}>Active days (green)</span>
              <span style={{fontSize:12,fontFamily:"monospace",color:weekCounts.active_green>=goals.activeDaysPerWeek?ACTIVE_CONFIG.green.color:"#444"}}>
                {weekCounts.active_green}/{goals.activeDaysPerWeek} {weekCounts.active_green>=goals.activeDaysPerWeek?"✓":""}
              </span>
            </div>
            <div style={{height:4,background:"#1a1a1a",borderRadius:2}}>
              <div style={{height:4,borderRadius:2,width:`${Math.min(weekCounts.active_green/Math.max(goals.activeDaysPerWeek,1),1)*100}%`,background:weekCounts.active_green>=goals.activeDaysPerWeek?ACTIVE_CONFIG.green.color:"#2a2a2a",transition:"width 0.4s"}}/>
            </div>
          </div>
        </div>
      </div>

      {/* Today log */}
      <div style={S.sectionLabel}>LOG TODAY</div>
      <div style={S.card}>
        <div style={{fontSize:12,color:"#444",fontFamily:"monospace",marginBottom:10}}>How did you eat today?</div>
        <DietDayPicker date={today} value={dietLog[today]} onChange={v=>onUpdateDiet(today,v)} />
        <div style={{display:"flex",gap:8,marginTop:6}}>
          {Object.entries(DIET_CONFIG).map(([key,cfg])=>(
            <div key={key} style={{flex:1,fontSize:9,color:dietLog[today]===key?cfg.color:"#2a2a2a",fontFamily:"monospace",textAlign:"center"}}>{cfg.desc}</div>
          ))}
        </div>

        <div style={{height:1,background:"#1a1a1a",margin:"16px 0"}}/>

        <div style={{fontSize:12,color:"#444",fontFamily:"monospace",marginBottom:10}}>Activity today</div>
        <ActivePicker value={activeLog[today]} onChange={v=>onUpdateActive(today,v)} />

        <div style={{height:1,background:"#1a1a1a",margin:"16px 0"}}/>

        <div style={{fontSize:12,color:"#444",fontFamily:"monospace",marginBottom:10}}>Bodyweight today</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input
            type="number" step="0.1" min="0" max="600"
            value={bodyweightLog[today] ?? ""}
            onChange={e=>onUpdateBW(today, e.target.value === "" ? null : parseFloat(e.target.value))}
            placeholder="0"
            style={{...S.searchInput, margin:0, flex:1, textAlign:"left", boxSizing:"border-box"}}
          />
          <span style={{fontSize:11,color:"#444",fontFamily:"monospace",width:30}}>lbs</span>
        </div>
      </div>

      {/* Past days (editable) */}
      <div style={S.sectionLabel}>PAST DAYS</div>
      {days.slice(0,-1).reverse().filter(d=>d!==today).map(d=>{
        const diet = dietLog[d]; const active=activeLog[d]; const cfg=diet?DIET_CONFIG[diet]:null; const acfg=active?ACTIVE_CONFIG[active]:null;
        return (
          <div key={d} style={{...S.card,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:13,color:"#888",fontFamily:"monospace"}}>{getDayLabel(d)}</span>
              {cfg && <span style={{fontSize:12,color:cfg.color,fontFamily:"monospace"}}>{cfg.emoji} {cfg.label}</span>}
            </div>
            <DietDayPicker date={d} value={dietLog[d]} onChange={v=>onUpdateDiet(d,v)} />
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,color:"#444",fontFamily:"monospace",marginBottom:8}}>Activity</div>
              <ActivePicker value={activeLog[d]} onChange={v=>onUpdateActive(d,v)} />
            </div>
            <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:"#444",fontFamily:"monospace",minWidth:80}}>Bodyweight</span>
              <input
                type="number" step="0.1" min="0" max="600"
                value={bodyweightLog[d] ?? ""}
                onChange={e=>onUpdateBW(d, e.target.value === "" ? null : parseFloat(e.target.value))}
                placeholder="0"
                style={{...S.searchInput, margin:0, flex:1, textAlign:"left", boxSizing:"border-box", padding:"6px 10px", fontSize:12}}
              />
              <span style={{fontSize:10,color:"#444",fontFamily:"monospace"}}>lbs</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Bodyweight Chart ────────────────────────────────────────────────────────
function BodyweightChart({ entries }) {
  if (entries.length < 1) return null;
  const W = 320, H = 80, padX = 4, padY = 10;
  if (entries.length === 1) {
    return (
      <div style={{fontSize:11,color:"#444",fontFamily:"monospace",textAlign:"center",padding:"20px 0"}}>
        Log a few more days to see the trend
      </div>
    );
  }
  const values = entries.map(([,v])=>v);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const dates = entries.map(([d])=>new Date(d+"T12:00:00").getTime());
  const minT = dates[0], maxT = dates[dates.length-1];
  const tSpan = maxT - minT || 1;
  const points = entries.map(([d,v], i) => {
    const x = padX + ((dates[i] - minT) / tSpan) * (W - padX*2);
    const y = H - padY - ((v - min) / range) * (H - padY*2);
    return [x, y, d, v];
  });
  const pathD = points.map(([x,y],i)=>`${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${points[points.length-1][0].toFixed(1)},${H} L${points[0][0].toFixed(1)},${H} Z`;
  return (
    <div style={{position:"relative"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,display:"block"}} preserveAspectRatio="none">
        <defs>
          <linearGradient id="bwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#bwGrad)"/>
        <path d={pathD} stroke={ACCENT} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>
        {points.map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={2} fill={ACCENT}/>
        ))}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:"#2a2a2a",fontFamily:"monospace"}}>
        <span>{entries[0][0]}</span>
        <span>min {min} · max {max}</span>
        <span>{entries[entries.length-1][0]}</span>
      </div>
    </div>
  );
}

// ─── Progress Chart ──────────────────────────────────────────────────────────
function ProgressChart({ history, dietLog, activeLog, bodyweightLog = {}, goals = DEFAULT_GOALS, onEditGoals }) {
  const WEEK_COUNT = 8;
  const now = new Date();
  const isZone2Ex = (ex) => ex.exId === "zone2" || ex.exId === "stairmaster";
  const weeks = Array.from({length:WEEK_COUNT},(_,i)=>{
    const ws = new Date(now); ws.setDate(now.getDate()-(WEEK_COUNT-1-i)*7);
    const we = new Date(ws); we.setDate(ws.getDate()+7);
    const label = ws.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const wkWorkouts = history.filter(w=>{ const d=new Date(w.date); return d>=ws&&d<we; });
    const workouts = wkWorkouts.length;
    const zone2Sessions = wkWorkouts.filter(w => w.exercises.some(isZone2Ex)).length;
    const zone2Minutes = wkWorkouts.reduce((sum,w)=>sum + w.exercises.reduce((es,ex)=>{
      if (!isZone2Ex(ex)) return es;
      return es + ex.sets.reduce((ss,s)=>ss + (parseFloat(s.weight)||0), 0);
    }, 0), 0);
    const dietArr = []; const activeArr = [];
    for(let di=0;di<7;di++){
      const dd=new Date(ws); dd.setDate(ws.getDate()+di);
      const key=isoDate(dd);
      if(dietLog[key]) dietArr.push(dietLog[key]);
      if(activeLog[key]) activeArr.push(activeLog[key]);
    }
    const greens=dietArr.filter(v=>v==="green").length;
    const reds=dietArr.filter(v=>v==="red").length;
    const activeGreens=activeArr.filter(v=>v==="green").length;
    const activeYellows=activeArr.filter(v=>v==="yellow").length;
    return {label,workouts,zone2Sessions,zone2Minutes,greens,reds,activeGreens,activeYellows,dietArr,activeArr};
  });

  const maxWk = Math.max(...weeks.map(w=>w.workouts),1);

  const recentStreak=(()=>{
    let s=0; const sorted=[...history].sort((a,b)=>new Date(b.date)-new Date(a.date)); let prev=null;
    for(const w of sorted){const d=new Date(w.date);d.setHours(0,0,0,0);if(!prev){s=1;prev=d;continue;}const diff=Math.round((prev-d)/86400000);if(diff<=2){s++;prev=d;}else break;}
    return s;
  })();

  const thisMonthWk = history.filter(w=>{const d=new Date(w.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;

  const muscleBreakdown={};
  history.slice(0,20).forEach(w=>w.exercises.forEach(ex=>{const m=EXERCISES[ex.exId]?.muscle;if(m)muscleBreakdown[m]=(muscleBreakdown[m]||0)+1;}));
  const topMuscles=Object.entries(muscleBreakdown).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const totalEx=topMuscles.reduce((a,[,v])=>a+v,0);
  const mColors={Chest:"#f87171",Back:"#38bdf8",Quads:"#a78bfa",Hamstrings:"#fb923c",Shoulders:"#34d399",Biceps:"#fbbf24",Triceps:"#e879f9",Calves:"#22d3ee",Cardio:ACCENT,"Full Body":"#94a3b8"};

  // This week diet
  const thisWeekDays = getWeekDays(0);
  const twGreen=thisWeekDays.filter(d=>dietLog[d]==="green").length;
  const twYellow=thisWeekDays.filter(d=>dietLog[d]==="yellow").length;
  const twRed=thisWeekDays.filter(d=>dietLog[d]==="red").length;
  const twActiveGreen=thisWeekDays.filter(d=>activeLog[d]==="green").length;
  const twActiveYellow=thisWeekDays.filter(d=>activeLog[d]==="yellow").length;

  // This week Zone 2 + workouts
  const twStart = weekStartDate(0);
  const twEnd = new Date(twStart); twEnd.setDate(twStart.getDate()+7);
  const twAllWorkouts = history.filter(w=>{ const d=new Date(w.date); return d>=twStart && d<twEnd; });
  const twWorkoutCount = twAllWorkouts.length;
  const twZone2Workouts = twAllWorkouts.filter(w=>w.exercises.some(isZone2Ex));
  const twZone2Sessions = twZone2Workouts.length;
  const twZone2Minutes = twZone2Workouts.reduce((sum,w)=>sum + w.exercises.reduce((es,ex)=>{
    if (!isZone2Ex(ex)) return es;
    return es + ex.sets.reduce((ss,s)=>ss + (parseFloat(s.weight)||0), 0);
  }, 0), 0);
  const maxZone2 = Math.max(...weeks.map(w=>w.zone2Sessions), 1);

  // Goal progress for the dashboard
  const goalValues = {
    workoutsPerWeek: twWorkoutCount,
    zone2PerWeek: twZone2Sessions,
    dietGreenPerWeek: twGreen,
    dietRedMaxPerWeek: twRed,
    activeDaysPerWeek: twActiveGreen,
  };

  const goalsHit = GOAL_META.filter(m => {
    const got = goalValues[m.key] || 0; const target = goals[m.key] || 0;
    return m.type === "max" ? got <= target : got >= target;
  }).length;

  // Bodyweight
  const bwEntries = Object.entries(bodyweightLog)
    .filter(([,v]) => typeof v === "number" && !isNaN(v))
    .sort(([a],[b]) => a.localeCompare(b));
  const bwCurrent = bwEntries.length ? bwEntries[bwEntries.length-1][1] : null;
  function findBWBefore(daysAgo) {
    const target = new Date(); target.setDate(target.getDate() - daysAgo);
    const targetISO = isoDate(target);
    for (let i = bwEntries.length-1; i >= 0; i--) {
      if (bwEntries[i][0] <= targetISO) return bwEntries[i][1];
    }
    return null;
  }
  const bw7 = findBWBefore(7);
  const bw30 = findBWBefore(30);
  const delta7  = (bw7  != null && bwCurrent != null) ? bwCurrent - bw7  : null;
  const delta30 = (bw30 != null && bwCurrent != null) ? bwCurrent - bw30 : null;
  // Last 90 days for chart
  const bwChartCutoff = new Date(); bwChartCutoff.setDate(bwChartCutoff.getDate() - 90);
  const bwChartEntries = bwEntries.filter(([d]) => new Date(d+"T12:00:00") >= bwChartCutoff);

  return (
    <div style={{padding:"16px 16px 80px"}}>

      {/* Goals dashboard */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:8,marginTop:8}}>
        <div style={S.sectionLabel}>GOALS — {goalsHit}/{GOAL_META.length} HIT</div>
        <button style={S.editLink} onClick={onEditGoals}>Edit</button>
      </div>
      <div style={{...S.card,marginBottom:16}}>
        {GOAL_META.map((m, i) => {
          const got = goalValues[m.key] || 0;
          const target = goals[m.key] || 0;
          const hit = m.type === "max" ? got <= target : got >= target;
          const pct = target === 0 ? 0 : Math.min(got / target, 1);
          const over = m.type === "max" && got > target;
          return (
            <div key={m.key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:i===GOAL_META.length-1?0:14}}>
              <span style={{fontSize:20,width:24,textAlign:"center"}}>{m.emoji}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,color:"#888",fontFamily:"monospace"}}>{m.label}</span>
                  <span style={{fontSize:12,fontFamily:"monospace",color:hit?m.color:over?"#f87171":"#444"}}>
                    {got}/{m.type==="max"?`≤${target}`:target} {hit?"✓":""}
                  </span>
                </div>
                <div style={{height:5,background:"#1a1a1a",borderRadius:3}}>
                  <div style={{
                    height:5, borderRadius:3,
                    width:`${pct*100}%`,
                    background: over ? "#f87171" : hit ? m.color : "#2a2a2a",
                    transition:"width 0.4s",
                  }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top stats */}
      <div style={S.sectionLabel}>THIS WEEK</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={S.card}>
          <div style={{fontSize:26,fontWeight:700,color:ACCENT,fontFamily:"monospace"}}>{recentStreak}</div>
          <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:2}}>WORKOUT STREAK</div>
        </div>
        <div style={S.card}>
          <div style={{fontSize:26,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace"}}>{thisMonthWk}</div>
          <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:2}}>SESSIONS THIS MONTH</div>
        </div>
      </div>

      {/* Bodyweight */}
      <div style={S.sectionLabel}>BODYWEIGHT</div>
      <div style={{...S.card,marginBottom:16}}>
        {bwCurrent == null ? (
          <div style={{textAlign:"center",padding:"20px 8px"}}>
            <div style={{fontSize:32,marginBottom:8}}>⚖</div>
            <div style={{fontSize:12,color:"#444",fontFamily:"monospace",marginBottom:4}}>No bodyweight logged yet</div>
            <div style={{fontSize:11,color:"#2a2a2a",fontFamily:"monospace"}}>Add a weight on the Diet tab to start tracking</div>
          </div>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"flex-end",gap:14,marginBottom:14}}>
              <div>
                <div style={{fontSize:32,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace",lineHeight:1}}>{bwCurrent}<span style={{fontSize:14,color:"#444",marginLeft:4}}>lbs</span></div>
                <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:4}}>CURRENT</div>
              </div>
              <div style={{flex:1,display:"flex",gap:14,justifyContent:"flex-end"}}>
                {delta7 != null && (
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:700,color:delta7===0?"#888":delta7>0?"#fbbf24":"#34D399",fontFamily:"monospace"}}>
                      {delta7>0?"+":""}{delta7.toFixed(1)}
                    </div>
                    <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:2}}>7 DAYS</div>
                  </div>
                )}
                {delta30 != null && (
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:700,color:delta30===0?"#888":delta30>0?"#fbbf24":"#34D399",fontFamily:"monospace"}}>
                      {delta30>0?"+":""}{delta30.toFixed(1)}
                    </div>
                    <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:2}}>30 DAYS</div>
                  </div>
                )}
              </div>
            </div>
            <BodyweightChart entries={bwChartEntries}/>
          </>
        )}
      </div>

      {/* Diet snapshot */}
      <div style={S.sectionLabel}>DIET THIS WEEK</div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",gap:0,marginBottom:16}}>
          {[["green","🟢",twGreen,goals.dietGreenPerWeek,false],["yellow","🟡",twYellow,null,false],["red","🔴",twRed,goals.dietRedMaxPerWeek,true],["active","👟",twActiveGreen,goals.activeDaysPerWeek,false]].map(([key,emoji,got,target,isRed])=>{
            const hit = target===null ? false : (isRed ? got<=target : got>=target);
            const color = key==="green"?"#4ade80":key==="yellow"?"#fbbf24":key==="red"?"#f87171":ACTIVE_CONFIG.green.color;
            return (
              <div key={key} style={{flex:1,textAlign:"center",padding:"0 4px"}}>
                <div style={{fontSize:20}}>{emoji}</div>
                <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:hit?color:target===null?"#888":"#555",marginTop:4}}>{got}</div>
                <div style={{fontSize:9,color:"#333",fontFamily:"monospace"}}>{target===null?"logged":isRed?`≤${target}`:`/${target}`}</div>
              </div>
            );
          })}
        </div>
        {/* 7-day mini calendar */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {thisWeekDays.map((d,i)=>{
            const diet=dietLog[d]; const act=activeLog[d]; const acfgp=act?ACTIVE_CONFIG[act]:null;
            const cfg=diet?DIET_CONFIG[diet]:null;
            return (
              <div key={d} style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"#2a2a2a",fontFamily:"monospace",marginBottom:3}}>{"MTWTFSS"[i]}</div>
                <div style={{height:28,borderRadius:6,background:cfg?cfg.bg:"#111",border:`1px solid ${cfg?cfg.color:"#1a1a1a"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                  {cfg?cfg.emoji:<span style={{fontSize:8,color:"#222"}}>·</span>}
                </div>
                {acfgp&&<div style={{fontSize:7,color:acfgp.color,marginTop:2}}>{acfgp.emoji}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Zone 2 */}
      <div style={S.sectionLabel}>ZONE 2 THIS WEEK</div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,textAlign:"center",padding:"4px 0"}}>
            <div style={{fontSize:24,fontWeight:700,color:twZone2Sessions>0?ACCENT:"#444",fontFamily:"monospace"}}>{twZone2Sessions}</div>
            <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:2}}>SESSIONS</div>
          </div>
          <div style={{width:1,background:"#1a1a1a"}}/>
          <div style={{flex:1,textAlign:"center",padding:"4px 0"}}>
            <div style={{fontSize:24,fontWeight:700,color:twZone2Minutes>0?"#e8e8e8":"#444",fontFamily:"monospace"}}>{Math.round(twZone2Minutes)}</div>
            <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace",marginTop:2}}>MINUTES</div>
          </div>
        </div>
        <div style={{fontSize:10,color:"#333",fontFamily:"monospace",marginBottom:8}}>8-WEEK SESSIONS TREND</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:50}}>
          {weeks.map((w,i)=>{
            const h = Math.max((w.zone2Sessions/Math.max(maxZone2,2))*44, w.zone2Sessions>0?5:2);
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                {w.zone2Sessions>0&&<span style={{fontSize:9,color:ACCENT,fontFamily:"monospace"}}>{w.zone2Sessions}</span>}
                <div style={{width:"100%",height:h,borderRadius:3,background:w.zone2Sessions>0?ACCENT:"#1a1a1a",transition:"height 0.4s"}}/>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workout frequency */}
      <div style={S.sectionLabel}>WORKOUT FREQUENCY</div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{fontSize:10,color:"#333",fontFamily:"monospace",marginBottom:10}}>SESSIONS/WEEK · GOAL: {goals.workoutsPerWeek}</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
          {weeks.map((w,i)=>{
            const h=Math.max((w.workouts/Math.max(maxWk,goals.workoutsPerWeek||1))*72,w.workouts>0?6:2);
            const hit=w.workouts>=goals.workoutsPerWeek;
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                {w.workouts>0&&<span style={{fontSize:9,color:hit?ACCENT:"#555",fontFamily:"monospace"}}>{w.workouts}</span>}
                <div style={{width:"100%",height:h,borderRadius:3,background:hit?ACCENT:w.workouts>0?"#2a2a2a":"#111",transition:"height 0.4s"}}/>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <span style={{fontSize:9,color:"#1e1e1e",fontFamily:"monospace"}}>{weeks[0].label}</span>
          <span style={{fontSize:9,color:"#1e1e1e",fontFamily:"monospace"}}>Now</span>
        </div>
      </div>

      {/* 8-week diet trend */}
      <div style={S.sectionLabel}>DIET TREND (8 WEEKS)</div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60,marginBottom:8}}>
          {weeks.map((w,i)=>{
            const total=w.dietArr.length||1;
            const gPct=(w.greens/total)*100; const rPct=(w.reds/total)*100;
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",gap:2,height:60,justifyContent:"flex-end"}}>
                {w.reds>0&&<div style={{width:"100%",height:`${Math.max(rPct*0.6,4)}%`,background:"#f87171",borderRadius:"2px 2px 0 0",minHeight:4}}/>}
                {w.greens>0&&<div style={{width:"100%",height:`${Math.max(gPct*0.6,4)}%`,background:"#4ade80",borderRadius:"2px 2px 0 0",minHeight:4}}/>}
                {w.dietArr.length===0&&<div style={{width:"100%",height:4,background:"#111",borderRadius:2}}/>}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:16,fontSize:10,color:"#444",fontFamily:"monospace"}}>
          <span>🟢 green days</span><span>🔴 red days</span>
        </div>
      </div>

      {/* Active trend */}
      <div style={S.sectionLabel}>ACTIVITY TREND</div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60,marginBottom:8}}>
          {weeks.map((w,i)=>{
            const total=w.activeArr.length||1;
            const gPct=(w.activeGreens/total); const yPct=(w.activeYellows/total);
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",gap:2,height:60,justifyContent:"flex-end"}}>
                {w.activeYellows>0&&<div style={{width:"100%",height:`${Math.max(yPct*48,4)}px`,background:"#fbbf24",borderRadius:"2px 2px 0 0",minHeight:4}}/>}
                {w.activeGreens>0&&<div style={{width:"100%",height:`${Math.max(gPct*48,4)}px`,background:ACTIVE_CONFIG.green.color,borderRadius:"2px 2px 0 0",minHeight:4}}/>}
                {w.activeArr.length===0&&<div style={{width:"100%",height:4,background:"#111",borderRadius:2}}/>}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:16,fontSize:10,color:"#444",fontFamily:"monospace"}}><span>🟢 active</span><span>🟡 moving</span></div>
      </div>

      {/* Muscle breakdown */}
      {topMuscles.length>0&&(<>
        <div style={S.sectionLabel}>MUSCLE SPLIT (last 20 sessions)</div>
        <div style={S.card}>
          {topMuscles.map(([m,c])=>(
            <div key={m} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:"#888",fontFamily:"monospace"}}>{m}</span>
                <span style={{fontSize:12,color:"#444",fontFamily:"monospace"}}>{c}</span>
              </div>
              <div style={{height:4,background:"#1a1a1a",borderRadius:2}}>
                <div style={{height:4,borderRadius:2,width:`${(c/totalEx)*100}%`,background:mColors[m]||"#555",transition:"width 0.5s"}}/>
              </div>
            </div>
          ))}
        </div>
      </>)}

      {history.length===0&&Object.keys(dietLog).length===0&&(
        <div style={S.empty}>
          <div style={{fontSize:36,marginBottom:12}}>📈</div>
          <div style={S.emptyTitle}>Nothing logged yet</div>
          <div style={S.emptySub}>Complete workouts and log diet days to see charts</div>
        </div>
      )}
    </div>
  );
}

// ─── AI Mix-It-Up Modal ───────────────────────────────────────────────────────
function MixItUpModal({ mode, onAccept, onReject, onClose }) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(()=>{
    async function go(){
      setLoading(true); setPlan(null); setError(null);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:`You are a smart personal trainer. Generate a "${mode.name}" workout. Mode: ${mode.desc}
Return ONLY JSON:
{"title":"string","tagline":"string","duration":"string","exercises":[{"exId":"one of: bench,incline,db_fly,cable_fly,dip,deadlift,row,pullup,lat,cable_row,db_row,squat,leg_press,rdl,leg_curl,lunge,hack_squat,calf_raise,ohp,lateral,curl,hammer,tricep_push,skull,zone2,stairmaster,burpee,kb_swing,box_jump,med_ball,farmers,nordic,face_pull,incline_db","sets":3,"reps":"string","weight_note":"string","why":"string"}],"coach_note":"string"}
Rules: quick_hybrid=4-5 exercises compound+cardio; big_hiit=6-7 circuit burpee/kb_swing/box_jump; legs_mix=5 exercises NO squat/leg_press use nordic/hack_squat/lunge/farmers; upper_blast=5-6 push/pull supersets; recovery=4-5 high reps low weight zone2/stairmaster. No markdown.`}]}),
        });
        const data=await res.json();
        const text=data.content?.find(b=>b.type==="text")?.text||"";
        setPlan(JSON.parse(text.replace(/```json|```/g,"").trim()));
      } catch(e){ setError("Couldn't generate. Try again."); }
      setLoading(false);
    }
    go();
  },[mode]);

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalTop}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24}}>{mode.emoji}</span>
            <div><div style={{...S.modalTitle,color:mode.color}}>{mode.name}</div><div style={S.modalSub}>{mode.desc}</div></div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        {loading&&<div style={S.loadingWrap}><div style={S.spinner}/><div style={S.loadingText}>Building your workout…</div></div>}
        {error&&<div style={{padding:24,color:"#f87171",fontFamily:"monospace",fontSize:13}}>{error}</div>}
        {plan&&!loading&&(
          <div style={{overflowY:"auto"}}>
            <div style={{padding:"20px 18px 12px",borderBottom:"1px solid #1a1a1a"}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:mode.color,marginBottom:4}}>{plan.title}</div>
              <div style={{fontSize:12,color:"#555",fontFamily:"monospace",marginBottom:6}}>{plan.tagline}</div>
              <div style={{fontSize:12,color:"#444",fontFamily:"monospace"}}>⏱ {plan.duration}</div>
            </div>
            <div style={{background:"#111",border:"1px solid #1a1a1a",borderRadius:10,margin:"12px 16px",padding:"12px",fontSize:12,color:"#888",fontFamily:"monospace",lineHeight:1.6}}>
              <span style={{color:mode.color,marginRight:6}}>🧠</span>{plan.coach_note}
            </div>
            <div style={{padding:"0 16px 8px"}}>
              {plan.exercises.map((ex,i)=>(
                <div key={i} style={{background:"#161616",border:"1px solid #1a1a1a",borderRadius:10,padding:"12px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,color:"#e8e8e8",fontFamily:"monospace",fontWeight:600}}>{EXERCISES[ex.exId]?.name??ex.exId}</span>
                    <span style={{fontSize:12,color:mode.color,fontFamily:"monospace"}}>{ex.sets}×{ex.reps}</span>
                  </div>
                  <div style={{fontSize:11,color:"#555",fontFamily:"monospace",marginBottom:3}}>{ex.weight_note}</div>
                  <div style={{fontSize:10,color:"#333",fontFamily:"monospace",fontStyle:"italic"}}>{ex.why}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,padding:"16px",borderTop:"1px solid #1a1a1a"}}>
              <button style={{flex:1,background:"transparent",border:"1px solid #222",borderRadius:8,color:"#555",padding:"12px",fontSize:13,cursor:"pointer",fontFamily:"monospace"}} onClick={onReject}>Regenerate</button>
              <button style={{flex:2,background:mode.color,border:"none",borderRadius:8,color:"#000",padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"monospace"}} onClick={()=>onAccept(plan)}>Start →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Goals Editor ─────────────────────────────────────────────────────────────
function GoalsEditor({ goals, onSave, onClose, onReset }) {
  const [draft, setDraft] = useState({...goals});
  function set(key, val) {
    const n = parseInt(val);
    setDraft(d => ({...d, [key]: isNaN(n) ? 0 : Math.max(0, Math.min(7, n))}));
  }
  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalTop}>
          <div>
            <div style={S.modalTitle}>Edit Weekly Goals</div>
            <div style={S.modalSub}>How often you want to hit each thing per week</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{padding:"8px 16px 16px"}}>
          {GOAL_META.map(m => (
            <div key={m.key} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #1a1a1a"}}>
              <span style={{fontSize:22,width:28,textAlign:"center"}}>{m.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:"#e8e8e8",fontFamily:"monospace"}}>{m.label}</div>
                <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginTop:2}}>
                  {m.type === "max" ? "at most this many per week" : "at least this many per week"}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button style={S.stepperBtn} onClick={()=>set(m.key, (draft[m.key]||0)-1)}>−</button>
                <input
                  type="number" min="0" max="7"
                  value={draft[m.key] ?? 0}
                  onChange={e=>set(m.key, e.target.value)}
                  style={S.goalInput}
                />
                <button style={S.stepperBtn} onClick={()=>set(m.key, (draft[m.key]||0)+1)}>+</button>
                <span style={{fontSize:10,color:"#444",fontFamily:"monospace",width:30,textAlign:"right"}}>/wk</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,padding:"12px 16px",borderTop:"1px solid #1a1a1a"}}>
          <button style={S.ghostBtn} onClick={onReset}>Reset</button>
          <div style={{flex:1}}/>
          <button style={S.ghostBtn} onClick={onClose}>Cancel</button>
          <button style={S.primaryBtn} onClick={()=>onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Exercise Picker ──────────────────────────────────────────────────────────
function ExercisePicker({ onSelect, onClose }) {
  const [q,setQ]=useState(""); const [cat,setCat]=useState("All");
  const cats=["All","Push","Pull","Legs","Arms","Cardio"];
  const list=Object.entries(EXERCISES).filter(([,ex])=>{
    return ex.name.toLowerCase().includes(q.toLowerCase())&&(cat==="All"||ex.cat===cat);
  });
  return (
    <div style={S.overlay}>
      <div style={S.pickerModal}>
        <div style={S.modalTop}><span style={S.modalTitle}>Add Exercise</span><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        <input style={S.searchInput} placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} autoFocus/>
        <div style={S.catRow}>
          {cats.map(c=><button key={c} style={{...S.catChip,background:cat===c?ACCENT:"#1a1a1a",color:cat===c?"#000":"#555",border:cat===c?"none":"1px solid #222"}} onClick={()=>setCat(c)}>{c}</button>)}
        </div>
        <div style={S.pickerList}>
          {list.map(([id,ex])=>(
            <button key={id} style={S.pickerItem} onClick={()=>{onSelect(id);onClose();}}>
              <span style={S.pickerName}>{ex.name}</span><span style={S.pickerMeta}>{ex.muscle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Set Row ──────────────────────────────────────────────────────────────────
function SetRow({ set, idx, onUpdate, onDelete, showPlates }) {
  const rm=est1RM(parseFloat(set.weight),parseInt(set.reps));
  return (
    <div>
      <div style={S.setRow}>
        <span style={S.setNum}>{idx+1}</span>
        <input style={S.setInput} type="number" placeholder="lbs" value={set.weight} onChange={e=>onUpdate({...set,weight:e.target.value})}/>
        <span style={{color:"#333",fontSize:12}}>×</span>
        <input style={S.setInput} type="number" placeholder="reps" value={set.reps} onChange={e=>onUpdate({...set,reps:e.target.value})}/>
        {rm>0&&<span style={S.rmBadge}>{rm}</span>}
        <button style={{...S.doneBtn,background:set.done?ACCENT:"transparent",color:set.done?"#000":"#333",border:set.done?"none":"1px solid #2a2a2a"}} onClick={()=>onUpdate({...set,done:!set.done})}>{set.done?"✓":"○"}</button>
        <button style={S.delSetBtn} onClick={onDelete}>✕</button>
      </div>
      {showPlates&&set.weight&&parseFloat(set.weight)>BAR_WEIGHT&&(
        <div style={{paddingLeft:28,paddingBottom:4}}><PlateVisual weight={set.weight}/></div>
      )}
    </div>
  );
}

// ─── Exercise Card ────────────────────────────────────────────────────────────
function ExCard({ item, onUpdate, onRemove }) {
  const [showPlates,setShowPlates]=useState(false);
  const ex=EXERCISES[item.exId]; const isCardio=ex?.cat==="Cardio";
  const vol=item.sets.reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
  const best=item.sets.reduce((b,s)=>Math.max(b,est1RM(parseFloat(s.weight),parseInt(s.reps))),0);
  return (
    <div style={S.exCard}>
      <div style={S.exTop}>
        <div>
          <div style={S.exName}>{ex?.name??item.exId}</div>
          <div style={S.exMeta}>{ex?.muscle} · {ex?.cat}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {vol>0&&<span style={S.volChip}>{(vol/1000).toFixed(1)}k</span>}
          {best>0&&!isCardio&&<span style={{...S.volChip,color:"#a78bfa",background:"rgba(167,139,250,0.1)"}}>{best}</span>}
          {!isCardio&&<button style={{...S.iconBtn,color:showPlates?ACCENT:"#333"}} onClick={()=>setShowPlates(p=>!p)}>⬡</button>}
          <button style={{...S.iconBtn,color:"#2a2a2a"}} onClick={onRemove}>✕</button>
        </div>
      </div>
      <div style={S.setHeaderRow}>
        <span style={{width:22}}>#</span>
        <span style={{flex:1,textAlign:"center"}}>{isCardio?"Duration":"Weight"}</span>
        <span style={{width:14}}/>
        <span style={{flex:1,textAlign:"center"}}>{isCardio?"Intensity":"Reps"}</span>
        <span style={{width:44}}/><span style={{width:30}}/><span style={{width:22}}/>
      </div>
      {item.sets.map((s,i)=>(
        <SetRow key={s.id} set={s} idx={i} showPlates={showPlates&&!isCardio}
          onUpdate={u=>{const sets=[...item.sets];sets[i]=u;onUpdate({...item,sets});}}
          onDelete={()=>onUpdate({...item,sets:item.sets.filter((_,j)=>j!==i)})}/>
      ))}
      <button style={S.addSetBtn} onClick={()=>onUpdate({...item,sets:[...item.sets,makeSet()]})}>+ Add Set</button>
    </div>
  );
}

// ─── Workout Screen ───────────────────────────────────────────────────────────
function WorkoutScreen({
  initExercises,
  initialBlocks = null,
  workoutName: initWorkoutName,
  onFinish,
  onCancel,
  onDelete = null,
  mode = "live",
  initialDate = null,
  initialElapsedSec = 0,
  history = [],
  excludeDate = null,
}) {
  const [exercises,setExercises]=useState(()=>initialBlocks || initExercises.map(id=>makeExBlock(id)));
  const [workoutName,setWorkoutName]=useState(initWorkoutName);
  const [elapsed,setElapsed]=useState(initialElapsedSec);
  const [date,setDate]=useState(initialDate || isoDate());
  const [showPicker,setShowPicker]=useState(false);
  const [restLeft,setRestLeft]=useState(null);
  const [activePR,setActivePR]=useState(null);
  const prevBestsRef = useRef(null);
  const prTriggeredRef = useRef(new Set());
  if (prevBestsRef.current === null) prevBestsRef.current = bestRMByExercise(history, excludeDate);
  const timerRef=useRef(null); const restRef=useRef(null);
  const isLive = mode === "live";

  useEffect(()=>{
    if (!isLive) return;
    timerRef.current=setInterval(()=>setElapsed(e=>e+1),1000);
    return()=>clearInterval(timerRef.current);
  },[isLive]);
  function startRest(s){clearInterval(restRef.current);setRestLeft(s);restRef.current=setInterval(()=>setRestLeft(r=>{if(r<=1){clearInterval(restRef.current);return null;}return r-1;}),1000);}
  const done=completedSets(exercises); const vol=totalVolume(exercises);
  const canSave = isLive ? done > 0 : true;

  function handleSave(){
    const finalDate = isLive
      ? new Date().toISOString()
      : new Date(date + "T12:00:00").toISOString();
    onFinish({exercises, elapsed, name: workoutName || "Workout", date: finalDate});
  }

  return (
    <div style={S.screen}>
      <div style={S.wkHeader}>
        <div style={{flex:1,minWidth:0,marginRight:8}}>
          {isLive ? (
            <div style={S.wkName}>{workoutName}</div>
          ) : (
            <input
              style={{...S.wkName, background:"transparent", border:"none", color:"#e8e8e8", outline:"none", width:"100%", padding:0, fontSize:15}}
              value={workoutName}
              onChange={e=>setWorkoutName(e.target.value)}
              placeholder="Workout name"
            />
          )}
          {isLive ? (
            <div style={{color:ACCENT,fontFamily:"monospace",fontSize:14}}>{formatTime(elapsed)}</div>
          ) : (
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
              <input type="date" value={date} max={isoDate()} onChange={e=>setDate(e.target.value)} style={S.dateInput}/>
              <input type="number" min="0" value={Math.round(elapsed/60)} onChange={e=>setElapsed(Math.max(0,parseInt(e.target.value)||0)*60)} style={S.durInput}/>
              <span style={{fontSize:10,color:"#444",fontFamily:"monospace"}}>min</span>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {mode==="edit" && onDelete && (
            <button style={S.deleteBtn} onClick={()=>{ if(window.confirm("Delete this workout? This cannot be undone.")) onDelete(); }}>Delete</button>
          )}
          <button style={S.ghostBtn} onClick={onCancel}>{isLive?"Discard":"Cancel"}</button>
          <button style={{...S.primaryBtn,opacity:canSave?1:0.4,cursor:canSave?"pointer":"default"}} onClick={canSave?handleSave:undefined}>{isLive?"Finish":"Save"}</button>
        </div>
      </div>
      <div style={S.statsStrip}>
        {[["Sets",done],["Volume",vol>0?`${(vol/1000).toFixed(1)}k`:"—"],["Exercises",exercises.length]].map(([l,v])=>(
          <div key={l} style={S.stripItem}><span style={S.stripVal}>{v}</span><span style={S.stripLabel}>{l}</span></div>
        ))}
      </div>
      {restLeft!==null&&(
        <div style={S.restBar}>
          <span style={{color:ACCENT}}>⏱</span>
          <span style={S.restTime}>{formatTime(restLeft)}</span>
          <span style={{flex:1,color:"#444",fontSize:11,fontFamily:"monospace"}}>rest</span>
          <button style={S.restSkip} onClick={()=>{clearInterval(restRef.current);setRestLeft(null);}}>skip</button>
        </div>
      )}
      <div style={{padding:"12px 12px 100px"}}>
        {exercises.map((item,i)=>(
          <ExCard key={item.id} item={item}
            onUpdate={u=>{
              if (mode !== "edit" && EXERCISES[u.exId]?.cat !== "Cardio") {
                const old = exercises[i];
                u.sets.forEach((s, si) => {
                  if (!s.done) return;
                  const oldS = old?.sets?.[si];
                  if (oldS && oldS.done) return;
                  if (prTriggeredRef.current.has(s.id)) return;
                  const rm = est1RM(parseFloat(s.weight), parseInt(s.reps));
                  if (rm <= 0) return;
                  const prev = prevBestsRef.current[u.exId] || 0;
                  if (rm > prev) {
                    prTriggeredRef.current.add(s.id);
                    prevBestsRef.current[u.exId] = rm;
                    setActivePR({
                      exId: u.exId,
                      exName: EXERCISES[u.exId]?.name || u.exId,
                      rm, prev,
                      weight: s.weight,
                      reps: s.reps,
                    });
                  }
                });
              }
              const ex=[...exercises];ex[i]=u;setExercises(ex);
            }}
            onRemove={()=>setExercises(exercises.filter((_,j)=>j!==i))}/>
        ))}
        <button style={S.addExBtn} onClick={()=>setShowPicker(true)}>+ Add Exercise</button>
        <div style={S.restPresets}>
          <span style={{color:"#333",fontSize:11,fontFamily:"monospace",flexShrink:0}}>Rest:</span>
          {[60,90,120,180].map(s=><button key={s} style={S.restChip} onClick={()=>startRest(s)}>{s<60?`${s}s`:`${s/60}m`}</button>)}
        </div>
      </div>
      {showPicker&&<ExercisePicker onSelect={id=>setExercises([...exercises,makeExBlock(id)])} onClose={()=>setShowPicker(false)}/>}
      {activePR&&<PRCelebration pr={activePR} onClose={()=>setActivePR(null)}/>}
    </div>
  );
}

// ─── PR Celebration ───────────────────────────────────────────────────────────
function PRCelebration({ pr, onClose }) {
  useEffect(()=>{ const t = setTimeout(onClose, 6000); return ()=>clearTimeout(t); }, [onClose]);
  return (
    <div style={S.prOverlay} onClick={onClose}>
      <div style={S.prBurst}>
        {Array.from({length:28}).map((_,i)=>{
          const angle = (i/28) * Math.PI * 2;
          const r = 200 + (i%3)*40;
          return (
            <div key={i} style={{
              position:"absolute", left:"50%", top:"50%",
              width:8, height:8, borderRadius:"50%",
              background: i%3===0?ACCENT:i%3===1?"#a78bfa":"#fbbf24",
              boxShadow:`0 0 8px currentColor`,
              "--tx": `${Math.cos(angle)*r}px`,
              "--ty": `${Math.sin(angle)*r}px`,
              animation:`prSparkle 1.4s cubic-bezier(0.2, 0.6, 0.3, 1) ${i*0.015}s both`,
            }}/>
          );
        })}
      </div>
      <div style={S.prModal} onClick={e=>e.stopPropagation()}>
        <div style={S.prTrophy}>🏆</div>
        <div style={S.prKicker}>NEW PERSONAL RECORD</div>
        <div style={S.prExName}>{pr.exName}</div>
        <div style={S.prRm}>{pr.rm}</div>
        <div style={S.prRmLabel}>EST 1RM · LBS</div>
        <div style={S.prDelta}>
          {pr.weight} lbs × {pr.reps} reps
          {pr.prev > 0 ? <span style={{color:"#888"}}> · up from {pr.prev}</span> : <span style={{color:"#888"}}> · first PR</span>}
        </div>
        <button style={S.prCloseBtn} onClick={onClose}>Keep Going →</button>
      </div>
    </div>
  );
}

// ─── Summary Screen ───────────────────────────────────────────────────────────
function SummaryScreen({ workout, onClose }) {
  const vol=totalVolume(workout.exercises); const done=completedSets(workout.exercises);
  const topRM=workout.exercises.reduce((best,ex)=>{
    if(EXERCISES[ex.exId]?.cat==="Cardio") return best;
    const rm=ex.sets.reduce((b,s)=>Math.max(b,est1RM(parseFloat(s.weight),parseInt(s.reps))),0);
    return rm>best.rm?{name:EXERCISES[ex.exId]?.name,rm}:best;
  },{name:null,rm:0});
  return (
    <div style={S.screen}>
      <div style={{textAlign:"center",padding:"48px 24px 28px",borderBottom:"1px solid #1a1a1a"}}>
        <div style={S.bigCheck}>✓</div>
        <div style={{fontSize:22,fontWeight:700,color:"#e8e8e8",marginBottom:6,fontFamily:"monospace"}}>{workout.name}</div>
        <div style={{color:"#444",fontSize:12,fontFamily:"monospace"}}>Completed · {new Date(workout.date).toLocaleDateString()}</div>
      </div>
      <div style={{display:"flex",justifyContent:"space-around",padding:"20px 16px",borderBottom:"1px solid #1a1a1a"}}>
        {[["Duration",formatTime(workout.elapsed)],["Volume",`${vol.toLocaleString()} lbs`],["Sets",done]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:ACCENT,fontFamily:"monospace",marginBottom:4}}>{v}</div>
            <div style={{fontSize:10,color:"#444",letterSpacing:"0.1em",fontFamily:"monospace"}}>{l.toUpperCase()}</div>
          </div>
        ))}
      </div>
      {topRM.name&&<div style={S.insightCard}><span style={{fontSize:18}}>🏆</span><div><div style={{fontSize:13,color:"#e8e8e8",fontFamily:"monospace"}}>Best e1RM today</div><div style={{fontSize:11,color:"#555",fontFamily:"monospace"}}>{topRM.name} — {topRM.rm} lbs</div></div></div>}
      <div style={{padding:"12px 16px 80px"}}>
        {workout.exercises.map(item=>{
          const ex=EXERCISES[item.exId]; const doneS=item.sets.filter(s=>s.done);
          const exVol=item.sets.reduce((a,s)=>a+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0);
          const maxW=item.sets.reduce((a,s)=>Math.max(a,parseFloat(s.weight)||0),0);
          return (
            <div key={item.id} style={S.summaryRow}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:13,color:"#e8e8e8",fontFamily:"monospace"}}>{ex?.name}</span>
                <span style={{fontSize:12,color:ACCENT,fontFamily:"monospace"}}>{exVol>0?`${exVol.toLocaleString()} lbs`:""}</span>
              </div>
              <div style={{fontSize:11,color:"#444",fontFamily:"monospace"}}>{doneS.length} sets · max {maxW} lbs</div>
            </div>
          );
        })}
      </div>
      <div style={S.floatingBtn}><button style={{...S.primaryBtn,width:"100%"}} onClick={onClose}>Back to Home</button></div>
    </div>
  );
}

// ─── Program Builder ──────────────────────────────────────────────────────────
function ProgramBuilder({ onSave, onCancel }) {
  const [name,setName]=useState(""); const [days,setDays]=useState([{id:uid(),name:"Day 1",exercises:[]}]);
  const [activeIdx,setActiveIdx]=useState(0); const [showPicker,setShowPicker]=useState(false);
  const activeDay=days[activeIdx];
  return (
    <div style={S.screen}>
      <div style={S.wkHeader}>
        <div style={S.wkName}>Build Program</div>
        <div style={{display:"flex",gap:8}}>
          <button style={S.ghostBtn} onClick={onCancel}>Cancel</button>
          <button style={{...S.primaryBtn,opacity:name&&days.some(d=>d.exercises.length)?1:0.4}}
            onClick={()=>name&&onSave({id:uid(),name,tag:`Custom · ${days.length} days`,days:days.map(d=>({...d,icon:"⭐"}))})}>Save</button>
        </div>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <input style={{...S.searchInput,width:"100%",boxSizing:"border-box",marginBottom:16}} placeholder="Program name" value={name} onChange={e=>setName(e.target.value)}/>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8}}>
          {days.map((d,i)=><button key={d.id} style={{...S.catChip,flexShrink:0,background:activeIdx===i?ACCENT:"#1a1a1a",color:activeIdx===i?"#000":"#555",border:activeIdx===i?"none":"1px solid #222"}} onClick={()=>setActiveIdx(i)}>{d.name}</button>)}
          <button style={{...S.catChip,flexShrink:0,background:"#1a1a1a",color:"#555",border:"1px dashed #2a2a2a"}} onClick={()=>{setDays(d=>[...d,{id:uid(),name:`Day ${d.length+1}`,exercises:[]}]);setActiveIdx(days.length);}}>+ Day</button>
        </div>
        {activeDay&&(
          <div style={{marginTop:12}}>
            <input style={{...S.searchInput,width:"100%",boxSizing:"border-box",marginBottom:12}} placeholder="Day name" value={activeDay.name} onChange={e=>setDays(d=>d.map((day,idx)=>idx===activeIdx?{...day,name:e.target.value}:day))}/>
            {activeDay.exercises.map((exId,i)=>(
              <div key={i} style={{...S.summaryRow,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:"#e8e8e8",fontFamily:"monospace"}}>{EXERCISES[exId]?.name??exId}</span>
                <button style={S.delSetBtn} onClick={()=>setDays(d=>d.map((day,idx)=>idx===activeIdx?{...day,exercises:day.exercises.filter((_,j)=>j!==i)}:day))}>✕</button>
              </div>
            ))}
            <button style={S.addExBtn} onClick={()=>setShowPicker(true)}>+ Add Exercise</button>
          </div>
        )}
      </div>
      {showPicker&&<ExercisePicker onSelect={id=>{setDays(d=>d.map((day,idx)=>idx===activeIdx?{...day,exercises:[...day.exercises,id]}:day));}} onClose={()=>setShowPicker(false)}/>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]=useState("home");
  const [screen,setScreen]=useState("home");
  const [history,setHistory]=usePersistedState("iron_v3_history", []);
  const [customPrograms,setCustomPrograms]=usePersistedState("iron_v3_customPrograms", []);
  const programs = [...BUILT_IN_PROGRAMS, ...customPrograms];
  const [wkInit,setWkInit]=useState(null);
  const [completedWk,setCompletedWk]=useState(null);
  const [editingWk,setEditingWk]=useState(null); // { workout, index } for edit mode
  const [mixMode,setMixMode]=useState(null);
  const [expandedProg,setExpandedProg]=useState(null);
  const [dietLog,setDietLog]=usePersistedState("iron_v3_dietLog", {});   // { "2025-05-20": "green"|"yellow"|"red" }
  const [activeLog,setActiveLog]=usePersistedState("iron_v3_activeLog", {}); // { "2025-05-20": "green"|"yellow"|"red" }
  const [bodyweightLog,setBodyweightLog]=usePersistedState("iron_v3_bodyweightLog", {}); // { "2025-05-20": 198.5 }
  const [goals,setGoals]=usePersistedState("iron_v3_goals", DEFAULT_GOALS);
  const [showGoalsEditor,setShowGoalsEditor]=useState(false);

  // Merge persisted goals over defaults so new fields appear if added later
  const mergedGoals = {...DEFAULT_GOALS, ...goals};

  function updateDiet(date,val){ setDietLog(l=>({...l,[date]:val})); }
  function updateActive(date,val){ setActiveLog(l=>({...l,[date]:val})); }
  function updateBW(date,val){
    setBodyweightLog(l=>{
      const next={...l};
      if(val===null||val===""||isNaN(val)) delete next[date];
      else next[date]=val;
      return next;
    });
  }

  function startWorkout(exercises,name){ setWkInit({exercises,name}); setScreen("workout"); }
  function handleMixAccept(plan){ setMixMode(null); startWorkout(plan.exercises.map(e=>e.exId),plan.title); }
  function handleFinish(wk){ setHistory(h=>[wk,...h]); setCompletedWk(wk); setScreen("summary"); }

  function startBackfill(){ setWkInit({exercises:[],name:"Past Workout"}); setScreen("backfill"); }
  function handleBackfillSave(wk){
    setHistory(h=>[wk,...h].sort((a,b)=>new Date(b.date)-new Date(a.date)));
    setCompletedWk(wk); setScreen("summary");
  }
  function openEditWorkout(idx){ setEditingWk({workout:history[idx],index:idx}); setScreen("edit"); }
  function handleEditSave(wk){
    setHistory(h=>{
      const next=[...h]; next[editingWk.index]=wk;
      return next.sort((a,b)=>new Date(b.date)-new Date(a.date));
    });
    setEditingWk(null); setScreen("home");
  }
  function handleDeleteWorkout(){
    setHistory(h=>h.filter((_,i)=>i!==editingWk.index));
    setEditingWk(null); setScreen("home");
  }

  if(screen==="workout"&&wkInit) return <WorkoutScreen mode="live" initExercises={wkInit.exercises} workoutName={wkInit.name} history={history} onFinish={handleFinish} onCancel={()=>setScreen("home")}/>;
  if(screen==="backfill"&&wkInit) return <WorkoutScreen mode="backfill" initExercises={wkInit.exercises} workoutName={wkInit.name} history={history} onFinish={handleBackfillSave} onCancel={()=>setScreen("home")}/>;
  if(screen==="edit"&&editingWk) return <WorkoutScreen
    mode="edit"
    initExercises={[]}
    initialBlocks={editingWk.workout.exercises}
    initialDate={editingWk.workout.date.slice(0,10)}
    initialElapsedSec={editingWk.workout.elapsed}
    workoutName={editingWk.workout.name}
    history={history}
    excludeDate={editingWk.workout.date}
    onFinish={handleEditSave}
    onCancel={()=>{setEditingWk(null);setScreen("home");}}
    onDelete={handleDeleteWorkout}
  />;
  if(screen==="summary"&&completedWk) return <SummaryScreen workout={completedWk} onClose={()=>{setScreen("home");setTab("progress");}}/>;
  if(screen==="build") return <ProgramBuilder onSave={p=>{setCustomPrograms(ps=>[...ps,p]);setScreen("home");setTab("programs");}} onCancel={()=>setScreen("home")}/>;

  const today=isoDate();
  const todayDiet=dietLog[today]; const todayActive=activeLog[today];

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={S.logoRow}><span style={S.logoMark}>◈</span><span style={S.logoText}>IRON</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {todayDiet&&<span style={{fontSize:16}}>{DIET_CONFIG[todayDiet].emoji}</span>}
          {todayActive&&<span style={{fontSize:16}}>{ACTIVE_CONFIG[todayActive].emoji}</span>}
          {history.length>0&&<span style={S.streakPill}>🔥 {history.length}</span>}
        </div>
      </div>

      <div style={S.nav}>
        {[["home","Home"],["programs","Programs"],["mix","Mix It Up"],["diet","Diet"],["progress","Progress"]].map(([key,label])=>(
          <button key={key} style={{...S.navBtn,color:tab===key?ACCENT:"#444",borderBottom:tab===key?`2px solid ${ACCENT}`:"2px solid transparent",fontSize:10}} onClick={()=>setTab(key)}>{label}</button>
        ))}
      </div>

      <div style={{paddingBottom:80}}>

        {/* HOME */}
        {tab==="home"&&(
          <div style={{padding:"16px 16px 0"}}>
            <button style={S.quickStart} onClick={()=>startWorkout([],"Quick Workout")}>
              <span style={{fontSize:20}}>▶</span>
              <div><div style={{fontWeight:700,fontSize:15}}>Start Empty Workout</div><div style={{fontSize:11,color:"rgba(0,0,0,0.5)",marginTop:2}}>Log any exercises you want</div></div>
            </button>
            <button style={S.logPastBtn} onClick={startBackfill}>
              <span style={{fontSize:14}}>📅</span>
              <span>Log Past Workout</span>
            </button>

            {/* Today's health snapshot */}
            <div style={S.sectionLabel}>TODAY</div>
            <div style={{...S.card,marginBottom:16}}>
              <div style={{display:"flex",gap:12,marginBottom:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginBottom:8}}>DIET</div>
                  <div style={{display:"flex",gap:6}}>
                    {Object.entries(DIET_CONFIG).map(([key,cfg])=>(
                      <button key={key} onClick={()=>updateDiet(today,todayDiet===key?null:key)} style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",background:todayDiet===key?cfg.bg:"#1a1a1a",outline:todayDiet===key?`2px solid ${cfg.color}`:"2px solid transparent",fontSize:16,transition:"all 0.15s"}}>{cfg.emoji}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginBottom:8}}>ACTIVITY</div>
              <ActivePicker value={activeLog[today]} onChange={v=>updateActive(today,v)}/>
            </div>

            {history.length>0&&(
              <>
                <div style={S.sectionLabel}>RECENT WORKOUTS</div>
                {history.slice(0,5).map((w,i)=>(
                  <button key={i} style={{...S.histCard,width:"100%",cursor:"pointer",textAlign:"left",display:"block",color:"inherit",font:"inherit"}} onClick={()=>openEditWorkout(i)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div><div style={{fontSize:13,fontWeight:600,color:"#e8e8e8",fontFamily:"monospace"}}>{w.name}</div><div style={{fontSize:11,color:"#444",fontFamily:"monospace",marginTop:2}}>{getDayLabel(w.date)}</div></div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:13,color:ACCENT,fontFamily:"monospace",fontWeight:700}}>{formatTime(w.elapsed)}</span>
                        <span style={{fontSize:14,color:"#2a2a2a"}}>›</span>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:"#333",fontFamily:"monospace",marginTop:6}}>{completedSets(w.exercises)} sets · {totalVolume(w.exercises).toLocaleString()} lbs</div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* PROGRAMS */}
        {tab==="programs"&&(
          <div style={{padding:"16px 16px 0"}}>
            <button style={S.buildProgramBtn} onClick={()=>setScreen("build")}>+ Build Custom Program</button>
            <div style={S.sectionLabel}>YOUR PROGRAMS</div>
            {programs.map(prog=>(
              <div key={prog.id} style={S.progCard}>
                <button style={S.progHeader} onClick={()=>setExpandedProg(expandedProg===prog.id?null:prog.id)}>
                  <div><div style={S.progName}>{prog.name}</div><div style={S.progTag}>{prog.tag}</div></div>
                  <span style={{color:"#444",fontSize:16,transform:expandedProg===prog.id?"rotate(90deg)":"none",display:"inline-block",transition:"transform 0.2s"}}>›</span>
                </button>
                {expandedProg===prog.id&&(
                  <div style={{padding:"0 14px 14px"}}>
                    {prog.days.map(day=>(
                      <button key={day.id} style={S.dayRow} onClick={()=>startWorkout(day.exercises,`${prog.name} — ${day.name}`)}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:18}}>{day.icon}</span>
                          <div><div style={{fontSize:13,color:"#e8e8e8",fontFamily:"monospace"}}>{day.name}</div><div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginTop:2}}>{day.exercises.slice(0,3).map(id=>EXERCISES[id]?.name).join(" · ")}{day.exercises.length>3?` +${day.exercises.length-3}`:""}</div></div>
                        </div>
                        <span style={{color:ACCENT,fontSize:13,fontFamily:"monospace",fontWeight:700}}>Start →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* MIX IT UP */}
        {tab==="mix"&&(
          <div style={{padding:"16px 16px 0"}}>
            <div style={S.mixIntro}>
              <div style={{fontSize:22,marginBottom:8}}>🎲</div>
              <div style={{fontSize:15,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace",marginBottom:6}}>Break Your Routine</div>
              <div style={{fontSize:12,color:"#444",fontFamily:"monospace",lineHeight:1.6}}>AI builds a fresh workout outside your normal rotation. Pick a mode, approve what it generates.</div>
            </div>
            {MIX_IT_UP_MODES.map(mode=>(
              <button key={mode.id} style={S.mixCard} onClick={()=>setMixMode(mode)}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:32}}>{mode.emoji}</div>
                  <div><div style={{...S.mixName,color:mode.color}}>{mode.name}</div><div style={S.mixDesc}>{mode.desc}</div></div>
                </div>
                <div style={{color:mode.color,fontSize:20,fontWeight:700}}>→</div>
              </button>
            ))}
          </div>
        )}

        {/* DIET */}
        {tab==="diet"&&<DietTab dietLog={dietLog} activeLog={activeLog} bodyweightLog={bodyweightLog} goals={mergedGoals} onUpdateDiet={updateDiet} onUpdateActive={updateActive} onUpdateBW={updateBW}/>}

        {/* PROGRESS */}
        {tab==="progress"&&<ProgressChart history={history} dietLog={dietLog} activeLog={activeLog} bodyweightLog={bodyweightLog} goals={mergedGoals} onEditGoals={()=>setShowGoalsEditor(true)}/>}
      </div>

      {mixMode&&<MixItUpModal mode={mixMode} onAccept={handleMixAccept} onReject={()=>setMixMode({...mixMode})} onClose={()=>setMixMode(null)}/>}
      {showGoalsEditor&&<GoalsEditor goals={mergedGoals} onSave={g=>{setGoals(g);setShowGoalsEditor(false);}} onClose={()=>setShowGoalsEditor(false)} onReset={()=>{setGoals(DEFAULT_GOALS);setShowGoalsEditor(false);}}/>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  app:{background:"#080808",minHeight:"100vh",color:"#e8e8e8",fontFamily:"'DM Mono','Courier New',monospace",maxWidth:480,margin:"0 auto"},
  screen:{background:"#080808",minHeight:"100vh",color:"#e8e8e8",fontFamily:"'DM Mono','Courier New',monospace",maxWidth:480,margin:"0 auto"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 18px 0"},
  logoRow:{display:"flex",alignItems:"center",gap:8},
  logoMark:{fontSize:22,color:ACCENT},
  logoText:{fontSize:20,fontWeight:700,letterSpacing:"0.2em",color:"#fff"},
  streakPill:{fontSize:11,color:"#555",background:"#111",border:"1px solid #1e1e1e",padding:"4px 10px",borderRadius:20},
  nav:{display:"flex",padding:"14px 18px 0",gap:0,borderBottom:"1px solid #111",marginTop:16},
  navBtn:{flex:1,background:"none",border:"none",padding:"10px 0",letterSpacing:"0.04em",fontFamily:"'DM Mono',monospace",cursor:"pointer",transition:"color 0.2s"},
  sectionLabel:{fontSize:10,letterSpacing:"0.15em",color:"#333",marginBottom:8,marginTop:18,fontWeight:700},
  card:{background:"#111",border:"1px solid #1a1a1a",borderRadius:12,padding:"16px",marginBottom:10},
  quickStart:{width:"100%",background:ACCENT,color:"#000",border:"none",borderRadius:12,padding:"16px 18px",fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:14,fontFamily:"'DM Mono',monospace",marginBottom:4,textAlign:"left"},
  histCard:{background:"#111",border:"1px solid #1a1a1a",borderRadius:10,padding:"12px 14px",marginBottom:8},
  buildProgramBtn:{width:"100%",background:"transparent",border:`1px solid ${ACCENT}`,borderRadius:10,color:ACCENT,padding:"12px",fontSize:13,cursor:"pointer",fontFamily:"'DM Mono',monospace",marginBottom:16,letterSpacing:"0.05em"},
  progCard:{background:"#111",border:"1px solid #1a1a1a",borderRadius:12,marginBottom:10,overflow:"hidden"},
  progHeader:{width:"100%",background:"none",border:"none",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"},
  progName:{fontSize:14,fontWeight:600,color:"#e8e8e8",fontFamily:"'DM Mono',monospace",marginBottom:2},
  progTag:{fontSize:11,color:"#444",fontFamily:"'DM Mono',monospace"},
  dayRow:{width:"100%",background:"#161616",border:"1px solid #1e1e1e",borderRadius:8,padding:"10px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"},
  mixIntro:{background:"#111",border:"1px solid #1a1a1a",borderRadius:12,padding:"20px",marginBottom:16,textAlign:"center"},
  mixCard:{width:"100%",background:"#111",border:"1px solid #1a1a1a",borderRadius:12,padding:"16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"},
  mixName:{fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",marginBottom:4},
  mixDesc:{fontSize:11,color:"#444",fontFamily:"'DM Mono',monospace"},
  insightCard:{display:"flex",alignItems:"center",gap:12,background:"#111",border:"1px solid #1a1a1a",borderRadius:10,padding:"12px 16px",margin:"0 16px 12px"},
  summaryRow:{background:"#111",border:"1px solid #1a1a1a",borderRadius:10,padding:"10px 14px",marginBottom:8},
  wkHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 16px 12px",borderBottom:"1px solid #111",position:"sticky",top:0,background:"#080808",zIndex:10},
  wkName:{fontSize:15,fontWeight:700,letterSpacing:"0.02em",color:"#e8e8e8",fontFamily:"monospace"},
  statsStrip:{display:"flex",justifyContent:"space-around",padding:"10px 0",borderBottom:"1px solid #111",background:"#0d0d0d"},
  stripItem:{display:"flex",flexDirection:"column",alignItems:"center",gap:2},
  stripVal:{fontSize:18,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace"},
  stripLabel:{fontSize:9,color:"#333",letterSpacing:"0.1em",fontFamily:"monospace"},
  restBar:{display:"flex",alignItems:"center",gap:10,background:"#111",borderBottom:"1px solid #1a1a1a",padding:"8px 16px"},
  restTime:{fontSize:16,fontWeight:700,color:ACCENT,fontFamily:"monospace"},
  restSkip:{background:"transparent",border:"none",color:"#333",fontSize:11,cursor:"pointer",fontFamily:"monospace"},
  restPresets:{display:"flex",gap:8,alignItems:"center",marginTop:12,paddingTop:12,borderTop:"1px solid #111"},
  restChip:{background:"#161616",border:"1px solid #222",borderRadius:8,color:"#555",padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:"monospace"},
  exCard:{background:"#111",border:"1px solid #1a1a1a",borderRadius:12,padding:"14px",marginBottom:10},
  exTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10},
  exName:{fontSize:14,fontWeight:600,color:"#e8e8e8",marginBottom:2,fontFamily:"monospace"},
  exMeta:{fontSize:11,color:"#444",fontFamily:"monospace"},
  volChip:{fontSize:10,color:ACCENT,background:"rgba(200,241,53,0.08)",padding:"2px 7px",borderRadius:6,fontFamily:"monospace"},
  iconBtn:{background:"transparent",border:"none",cursor:"pointer",fontSize:14,padding:4},
  setHeaderRow:{display:"flex",alignItems:"center",gap:6,fontSize:9,color:"#2a2a2a",letterSpacing:"0.1em",marginBottom:6,fontFamily:"monospace"},
  setRow:{display:"flex",alignItems:"center",gap:6,marginBottom:4},
  setNum:{width:22,textAlign:"center",fontSize:11,color:"#333",fontFamily:"monospace"},
  setInput:{flex:1,background:"#1a1a1a",border:"1px solid #222",borderRadius:8,color:"#e8e8e8",padding:"8px 10px",fontSize:14,fontFamily:"monospace",textAlign:"center",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"},
  rmBadge:{fontSize:10,color:"#555",fontFamily:"monospace",width:44,textAlign:"center"},
  doneBtn:{width:34,height:34,borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:700,transition:"all 0.15s",flexShrink:0,fontFamily:"monospace"},
  delSetBtn:{width:22,height:22,background:"transparent",border:"none",color:"#2a2a2a",fontSize:10,cursor:"pointer",flexShrink:0},
  addSetBtn:{width:"100%",background:"transparent",border:"1px dashed #1e1e1e",borderRadius:8,color:"#333",padding:"7px",fontSize:11,cursor:"pointer",marginTop:4,fontFamily:"monospace"},
  addExBtn:{width:"100%",background:"transparent",border:"1px solid #1a1a1a",borderRadius:12,color:"#444",padding:"14px",fontSize:13,cursor:"pointer",marginTop:4,fontFamily:"monospace"},
  primaryBtn:{background:ACCENT,color:"#000",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"monospace"},
  ghostBtn:{background:"transparent",color:"#444",border:"1px solid #1e1e1e",borderRadius:8,padding:"10px 16px",fontSize:13,cursor:"pointer",fontFamily:"monospace"},
  deleteBtn:{background:"transparent",color:"#f87171",border:"1px solid rgba(248,113,113,0.35)",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer",fontFamily:"monospace"},
  stepperBtn:{width:28,height:28,background:"#161616",border:"1px solid #222",borderRadius:6,color:"#888",fontSize:14,cursor:"pointer",fontFamily:"monospace",lineHeight:1,padding:0,display:"flex",alignItems:"center",justifyContent:"center"},
  goalInput:{width:40,background:"#1a1a1a",border:"1px solid #222",borderRadius:6,color:"#e8e8e8",padding:"6px 0",fontSize:14,fontFamily:"monospace",textAlign:"center",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"},
  editLink:{background:"transparent",border:"none",color:"#888",fontSize:11,cursor:"pointer",fontFamily:"monospace",textDecoration:"underline",padding:0},
  prOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",animation:"prFadeIn 0.25s ease-out"},
  prBurst:{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"},
  prModal:{position:"relative",textAlign:"center",padding:"36px 32px",background:"linear-gradient(180deg, #0d0d0d 0%, #161616 100%)",border:`1px solid ${ACCENT}`,borderRadius:20,maxWidth:360,width:"calc(100% - 32px)",boxShadow:`0 0 60px rgba(200,241,53,0.25), 0 0 120px rgba(200,241,53,0.1)`,animation:"prPop 0.5s cubic-bezier(0.18, 1.25, 0.5, 1)"},
  prTrophy:{fontSize:64,marginBottom:12,animation:"prTrophyBounce 0.8s ease-out"},
  prKicker:{fontSize:10,letterSpacing:"0.3em",color:ACCENT,fontFamily:"monospace",fontWeight:700,marginBottom:8},
  prExName:{fontSize:18,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace",marginBottom:24,letterSpacing:"0.02em"},
  prRm:{fontSize:64,fontWeight:900,color:ACCENT,fontFamily:"monospace",lineHeight:1,textShadow:`0 0 32px rgba(200,241,53,0.6)`,marginBottom:6},
  prRmLabel:{fontSize:9,letterSpacing:"0.25em",color:"#666",fontFamily:"monospace",marginBottom:18},
  prDelta:{fontSize:12,color:"#aaa",fontFamily:"monospace",marginBottom:24},
  prCloseBtn:{background:ACCENT,border:"none",borderRadius:10,color:"#000",padding:"14px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.05em"},
  dateInput:{background:"#1a1a1a",border:"1px solid #222",borderRadius:6,color:"#e8e8e8",padding:"5px 8px",fontSize:11,fontFamily:"monospace",outline:"none",colorScheme:"dark"},
  durInput:{background:"#1a1a1a",border:"1px solid #222",borderRadius:6,color:"#e8e8e8",padding:"5px 6px",fontSize:11,fontFamily:"monospace",outline:"none",width:50,textAlign:"center",WebkitAppearance:"none",MozAppearance:"textfield"},
  logPastBtn:{width:"100%",background:"transparent",border:`1px solid ${ACCENT}`,borderRadius:12,color:ACCENT,padding:"12px",fontSize:13,cursor:"pointer",fontFamily:"monospace",marginTop:8,marginBottom:4,letterSpacing:"0.05em",display:"flex",alignItems:"center",justifyContent:"center",gap:8},
  floatingBtn:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,padding:"12px 16px",background:"#080808",borderTop:"1px solid #111"},
  bigCheck:{width:64,height:64,background:ACCENT,color:"#000",borderRadius:"50%",fontSize:28,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  pickerModal:{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"78vh",display:"flex",flexDirection:"column"},
  modal:{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"88vh",display:"flex",flexDirection:"column",overflowY:"auto"},
  modalTop:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 18px",borderBottom:"1px solid #1a1a1a",flexShrink:0},
  modalTitle:{fontSize:15,fontWeight:700,color:"#e8e8e8",fontFamily:"monospace"},
  modalSub:{fontSize:11,color:"#444",fontFamily:"monospace",marginTop:2},
  closeBtn:{background:"transparent",border:"none",color:"#444",fontSize:16,cursor:"pointer"},
  searchInput:{background:"#161616",border:"1px solid #222",borderRadius:10,color:"#e8e8e8",padding:"10px 14px",fontSize:13,margin:"12px 16px 0",outline:"none",fontFamily:"monospace"},
  catRow:{display:"flex",gap:6,padding:"10px 16px",overflowX:"auto",flexShrink:0},
  catChip:{borderRadius:20,padding:"5px 14px",fontSize:11,cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap",flexShrink:0},
  pickerList:{overflowY:"auto",padding:"0 12px 24px"},
  pickerItem:{width:"100%",background:"transparent",border:"1px solid #1a1a1a",borderRadius:10,color:"#e8e8e8",padding:"11px 14px",marginBottom:6,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"},
  pickerName:{fontSize:13,fontFamily:"monospace",color:"#e8e8e8"},
  pickerMeta:{fontSize:11,color:"#333",fontFamily:"monospace"},
  loadingWrap:{display:"flex",flexDirection:"column",alignItems:"center",padding:48,gap:16},
  spinner:{width:32,height:32,border:"2px solid #1a1a1a",borderTop:`2px solid ${ACCENT}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  loadingText:{fontSize:13,color:"#444",fontFamily:"monospace"},
  empty:{textAlign:"center",padding:"48px 24px",color:"#333"},
  emptyTitle:{fontSize:14,color:"#444",fontFamily:"monospace",marginBottom:6},
  emptySub:{fontSize:12,color:"#2a2a2a",fontFamily:"monospace"},
};

const _s=document.createElement("style");
_s.textContent=`
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes prFadeIn{from{opacity:0}to{opacity:1}}
@keyframes prPop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes prTrophyBounce{0%{transform:scale(0) rotate(-15deg)}50%{transform:scale(1.3) rotate(8deg)}100%{transform:scale(1) rotate(0)}}
@keyframes prSparkle{0%{transform:translate(0,0) scale(0);opacity:0}15%{transform:translate(calc(var(--tx)*0.15), calc(var(--ty)*0.15)) scale(1.2);opacity:1}100%{transform:translate(var(--tx), var(--ty)) scale(0.3);opacity:0}}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
*{-webkit-tap-highlight-color:transparent}
`;
document.head.appendChild(_s);
