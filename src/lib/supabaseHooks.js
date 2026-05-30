// Supabase-backed state hooks. Each hook owns one table's worth of state,
// fetches from cloud on mount, and exposes mutation methods that write through.
// Local state updates optimistically; errors log to console (improvement target).

import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "./supabase";

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInWithMagicLink = useCallback(async (email) => {
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  }, []);

  const verifyCode = useCallback(async (email, token) => {
    return supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: "email",
    });
  }, []);

  const signInWithPassword = useCallback(async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(async (email, password) => {
    return supabase.auth.signUp({ email, password });
  }, []);

  const resetPassword = useCallback(async (email) => {
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  }, []);

  const updatePassword = useCallback(async (password) => {
    return supabase.auth.updateUser({ password });
  }, []);

  const signOut = useCallback(async () => supabase.auth.signOut(), []);

  return { user, loading, signInWithMagicLink, verifyCode, signInWithPassword, signUp, resetPassword, updatePassword, signOut };
}

// ─── WORKOUTS ─────────────────────────────────────────────────────────────────
export function useWorkouts(userId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("workouts").select("*").eq("user_id", userId).order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("workouts load:", error);
        setData(data || []);
        setLoading(false);
      });
  }, [userId]);

  async function add(w) {
    const row = { user_id: userId, name: w.name, date: w.date, elapsed: w.elapsed, exercises: w.exercises };
    const { data: inserted, error } = await supabase.from("workouts").insert(row).select().single();
    if (error) { console.error("add workout:", error); return null; }
    setData(d => [inserted, ...d].sort((a,b)=>new Date(b.date)-new Date(a.date)));
    return inserted;
  }

  async function update(id, patch) {
    setData(d => d.map(w => w.id === id ? { ...w, ...patch } : w).sort((a,b)=>new Date(b.date)-new Date(a.date)));
    const cleanPatch = { name: patch.name, date: patch.date, elapsed: patch.elapsed, exercises: patch.exercises };
    Object.keys(cleanPatch).forEach(k => cleanPatch[k] === undefined && delete cleanPatch[k]);
    const { error } = await supabase.from("workouts").update(cleanPatch).eq("id", id);
    if (error) console.error("update workout:", error);
  }

  async function remove(id) {
    setData(d => d.filter(w => w.id !== id));
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) console.error("delete workout:", error);
  }

  return { data, loading, add, update, remove };
}

// ─── DIET LOG ─────────────────────────────────────────────────────────────────
export function useDietLog(userId) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("diet_log").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) console.error("diet load:", error);
        const map = {};
        (data || []).forEach(r => { map[r.date] = r.status; });
        setData(map);
        setLoading(false);
      });
  }, [userId]);

  async function setForDate(date, status) {
    setData(d => {
      const next = { ...d };
      if (status === null || status === undefined) delete next[date];
      else next[date] = status;
      return next;
    });
    if (status === null || status === undefined) {
      const { error } = await supabase.from("diet_log").delete().eq("user_id", userId).eq("date", date);
      if (error) console.error("diet delete:", error);
    } else {
      const { error } = await supabase.from("diet_log").upsert({ user_id: userId, date, status });
      if (error) console.error("diet upsert:", error);
    }
  }

  return { data, loading, setForDate };
}

// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────
export function useActivityLog(userId) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("activity_log").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) console.error("activity load:", error);
        const map = {};
        (data || []).forEach(r => { map[r.date] = r.status; });
        setData(map);
        setLoading(false);
      });
  }, [userId]);

  async function setForDate(date, status) {
    setData(d => {
      const next = { ...d };
      if (status === null || status === undefined) delete next[date];
      else next[date] = status;
      return next;
    });
    if (status === null || status === undefined) {
      const { error } = await supabase.from("activity_log").delete().eq("user_id", userId).eq("date", date);
      if (error) console.error("activity delete:", error);
    } else {
      const { error } = await supabase.from("activity_log").upsert({ user_id: userId, date, status });
      if (error) console.error("activity upsert:", error);
    }
  }

  return { data, loading, setForDate };
}

// ─── FOCUS SESSIONS ───────────────────────────────────────────────────────────
export function useFocusSessions(userId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("focus_sessions").select("*").eq("user_id", userId).order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("focus load:", error);
        setData(data || []);
        setLoading(false);
      });
  }, [userId]);

  async function add(s) {
    const row = { user_id: userId, date: s.date, mins: s.mins, label: s.label || "Deep work" };
    const { data: inserted, error } = await supabase.from("focus_sessions").insert(row).select().single();
    if (error) { console.error("add session:", error); return null; }
    setData(d => [inserted, ...d]);
    return inserted;
  }

  return { data, loading, add };
}

// ─── BOARDS ───────────────────────────────────────────────────────────────────
// Boards are mutated with the full setBoards(updater) pattern. The hook diffs
// the previous vs next array and persists each changed board.
const LANES = ["Today", "In Progress", "Keep in Mind"];
function mapColToLane(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("progress")) return "In Progress";
  if (n.includes("done") || n.includes("today")) return "Today";
  return "Keep in Mind"; // Backlog, Todo, etc.
}

export function useBoards(userId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      const { data: boards, error } = await supabase.from("boards").select("*").eq("user_id", userId).order("position", { ascending: true });
      if (error) console.error("boards load:", error);
      let list = boards || [];

      // One-time migration to a single board with 3 fixed lanes.
      const isSingle = list.length === 1 && Array.isArray(list[0].cols) && list[0].cols.length === 3 && list[0].cols.every((c, i) => c.name === LANES[i]);
      if (!isSingle) {
        const laneCards = { "Today": [], "In Progress": [], "Keep in Mind": [] };
        for (const b of list) {
          for (const col of (b.cols || [])) {
            const lane = mapColToLane(col.name);
            const doneFromColumn = (col.name || "").toLowerCase().includes("done");
            for (const card of (col.cards || [])) {
              laneCards[lane].push({ ...card, done: card.done ?? (lane === "Today" && doneFromColumn) });
            }
          }
        }
        const newBoard = {
          user_id: userId, name: "Tasks", color: "#FF6B35", position: 0,
          cols: LANES.map((name, i) => ({ id: "lane" + i, name, cards: laneCards[name] })),
        };
        try {
          await supabase.from("boards").delete().eq("user_id", userId);
          const { data: inserted } = await supabase.from("boards").insert(newBoard).select().single();
          list = inserted ? [inserted] : [{ ...newBoard, id: "local" }];
        } catch (e) { console.error("board migration:", e); list = [{ ...newBoard, id: "local" }]; }
      }

      setData(list);
      setLoading(false);
    })();
  }, [userId]);

  // Compatible with setBoards(bs => ...) callsites.
  const setAll = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Persist diffs in background — fire and forget
      (async () => {
        try {
          for (let i = 0; i < next.length; i++) {
            const after = next[i];
            const before = prev.find(b => b.id === after.id);
            if (!before) {
              // New board (no id match) — insert
              const row = { user_id: userId, name: after.name, color: after.color, cols: after.cols, position: i };
              await supabase.from("boards").insert(row);
            } else if (
              JSON.stringify(before.cols) !== JSON.stringify(after.cols)
              || before.name !== after.name
              || before.color !== after.color
            ) {
              await supabase.from("boards").update({ name: after.name, color: after.color, cols: after.cols }).eq("id", after.id);
            }
          }
          // Deletions
          for (const before of prev) {
            if (!next.find(b => b.id === before.id)) {
              await supabase.from("boards").delete().eq("id", before.id);
            }
          }
        } catch (e) { console.error("boards sync:", e); }
      })();
      return next;
    });
  }, [userId]);

  return { data, loading, setAll };
}

// ─── CUSTOM EXERCISES ─────────────────────────────────────────────────────────
export function useCustomExercises(userId) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("custom_exercises").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) console.error("custom ex load:", error);
        const map = {};
        (data || []).forEach(r => { map[r.id] = { name: r.name, muscle: r.muscle, cat: r.cat, custom: true }; });
        setData(map);
        setLoading(false);
      });
  }, [userId]);

  // IMPORTANT: returns the id SYNCHRONOUSLY (callers use it immediately as exId).
  // The DB write happens in the background. Making this async caused a crash:
  // callers got a Promise and React tried to render it as the exId.
  function add(name, muscle, cat) {
    const id = "cx_" + Math.random().toString(36).slice(2,9);
    const clean = (name || "").trim() || "Custom exercise";
    setData(d => ({ ...d, [id]: { name: clean, muscle, cat, custom: true } }));
    supabase.from("custom_exercises").insert({ id, user_id: userId, name: clean, muscle, cat })
      .then(({ error }) => { if (error) console.error("custom ex add:", error); });
    return id;
  }

  return { data, loading, add };
}

// ─── ROONEY MEMORIES ──────────────────────────────────────────────────────────
export function useRooneyMemories(userId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("rooney_memories").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("memories load:", error);
        setData(data || []);
        setLoading(false);
      });
  }, [userId]);

  async function add(category, text) {
    const row = { user_id: userId, category, text };
    const { data: inserted, error } = await supabase.from("rooney_memories").insert(row).select().single();
    if (error) { console.error("add memory:", error); return null; }
    setData(d => [inserted, ...d]);
    return inserted;
  }

  async function remove(id) {
    setData(d => d.filter(m => m.id !== id));
    const { error } = await supabase.from("rooney_memories").delete().eq("id", id);
    if (error) console.error("delete memory:", error);
  }

  async function reload() {
    if (!userId) return;
    const { data: fresh } = await supabase.from("rooney_memories").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setData(fresh || []);
  }

  return { data, loading, add, remove, reload };
}

// ─── ZONE 2 LOG ───────────────────────────────────────────────────────────────
export function useZone2Log(userId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("zone2_log").select("*").eq("user_id", userId).order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("zone2 load:", error);
        setData(data || []);
        setLoading(false);
      });
  }, [userId]);

  async function add(date, minutes, label) {
    const row = { user_id: userId, date, minutes, label: label || "Zone 2" };
    const { data: inserted, error } = await supabase.from("zone2_log").insert(row).select().single();
    if (error) { console.error("zone2 add:", error); return null; }
    setData(d => [inserted, ...d]);
    return inserted;
  }

  async function remove(id) {
    setData(d => d.filter(z => z.id !== id));
    const { error } = await supabase.from("zone2_log").delete().eq("id", id);
    if (error) console.error("zone2 delete:", error);
  }

  return { data, loading, add, remove };
}

// ─── USER SETTINGS (goals list) ───────────────────────────────────────────────
export function useSettings(userId, defaultGoals) {
  const [goals, setGoalsState] = useState(defaultGoals);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("user_settings").select("goals").eq("user_id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("settings load:", error);
        if (data && Array.isArray(data.goals) && data.goals.length > 0) {
          setGoalsState(data.goals);
        } else {
          // No settings row yet — seed with defaults
          supabase.from("user_settings").upsert({ user_id: userId, goals: defaultGoals, updated_at: new Date().toISOString() }).then(()=>{});
          setGoalsState(defaultGoals);
        }
        setLoading(false);
      });
  }, [userId]);

  async function setGoals(next) {
    setGoalsState(next);
    const { error } = await supabase.from("user_settings").upsert({ user_id: userId, goals: next, updated_at: new Date().toISOString() });
    if (error) console.error("settings save:", error);
  }

  return { goals, loading, setGoals };
}

// ─── ROONEY CONVERSATION (persisted chat thread) ──────────────────────────────
export function useRooneyConversation(userId) {
  const [messages, setMessages] = useState(null); // null = still loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("rooney_conversation").select("messages").eq("user_id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("conversation load:", error);
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
        setLoading(false);
      });
  }, [userId]);

  async function save(msgs) {
    const trimmed = msgs.slice(-120); // cap stored history
    const { error } = await supabase.from("rooney_conversation").upsert({ user_id: userId, messages: trimmed, updated_at: new Date().toISOString() });
    if (error) console.error("conversation save:", error);
  }

  async function clear() {
    setMessages([]);
    const { error } = await supabase.from("rooney_conversation").upsert({ user_id: userId, messages: [], updated_at: new Date().toISOString() });
    if (error) console.error("conversation clear:", error);
  }

  return { messages, loading, save, clear };
}

// ─── GOAL LOGS (habit + timed user-defined goals) ─────────────────────────────
export function useGoalLogs(userId) {
  const [data, setData] = useState([]); // [{goal_id, date, completed, value}]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("goal_logs").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) console.error("goal_logs load:", error);
        setData(data || []);
        setLoading(false);
      });
  }, [userId]);

  // Toggle a binary habit completion for a date
  async function toggle(goalId, date) {
    const existing = data.find(g => g.goal_id === goalId && g.date === date);
    if (existing) {
      setData(d => d.filter(g => !(g.goal_id === goalId && g.date === date)));
      const { error } = await supabase.from("goal_logs").delete().eq("user_id", userId).eq("goal_id", goalId).eq("date", date);
      if (error) console.error("goal_log delete:", error);
    } else {
      const row = { user_id: userId, goal_id: goalId, date, completed: true, value: null };
      setData(d => [...d, row]);
      const { error } = await supabase.from("goal_logs").upsert(row);
      if (error) console.error("goal_log upsert:", error);
    }
  }

  // Set minutes for a timed goal on a date (null/0 clears)
  async function setValue(goalId, date, minutes) {
    if (!minutes || minutes <= 0) {
      setData(d => d.filter(g => !(g.goal_id === goalId && g.date === date)));
      await supabase.from("goal_logs").delete().eq("user_id", userId).eq("goal_id", goalId).eq("date", date);
      return;
    }
    const row = { user_id: userId, goal_id: goalId, date, completed: true, value: minutes };
    setData(d => { const o = d.filter(g => !(g.goal_id===goalId && g.date===date)); return [...o, row]; });
    const { error } = await supabase.from("goal_logs").upsert(row);
    if (error) console.error("goal_log value:", error);
  }

  return { data, loading, toggle, setValue };
}

// ─── BODY WEIGHT (one measurement per day, in lbs) ────────────────────────────
export function useBodyweight(userId) {
  const [data, setData] = useState({}); // { "YYYY-MM-DD": number }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("bodyweight_log").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) console.error("bodyweight load:", error);
        const map = {};
        (data || []).forEach(r => { map[r.date] = Number(r.weight); });
        setData(map);
        setLoading(false);
      });
  }, [userId]);

  // Pass an empty/zero/invalid weight to clear that day's entry.
  async function setForDate(date, weight) {
    const w = parseFloat(weight);
    if (!w || w <= 0 || isNaN(w)) {
      setData(d => { const n = { ...d }; delete n[date]; return n; });
      const { error } = await supabase.from("bodyweight_log").delete().eq("user_id", userId).eq("date", date);
      if (error) console.error("bodyweight delete:", error);
      return;
    }
    setData(d => ({ ...d, [date]: w }));
    const { error } = await supabase.from("bodyweight_log").upsert({
      user_id: userId, date, weight: w, updated_at: new Date().toISOString(),
    });
    if (error) console.error("bodyweight upsert:", error);
  }

  return { data, loading, setForDate };
}

// ─── ONE-TIME MIGRATION: localStorage → Supabase ──────────────────────────────
const MIG_FLAG = "iron_migrated_to_supabase_v1";

export async function migrateLocalStorage(userId) {
  if (!userId || localStorage.getItem(MIG_FLAG)) return { migrated: false };

  const summary = { workouts: 0, dietDays: 0, activityDays: 0, focusSessions: 0, customExercises: 0 };

  try {
    // history → workouts
    const history = JSON.parse(localStorage.getItem("history") || "[]");
    if (history.length > 0) {
      const rows = history.map(w => ({
        user_id: userId, name: w.name, date: w.date,
        elapsed: w.elapsed || 0, exercises: w.exercises || [],
      }));
      const { error } = await supabase.from("workouts").insert(rows);
      if (!error) summary.workouts = rows.length;
    }

    // dietLog
    const dietLog = JSON.parse(localStorage.getItem("dietLog") || "{}");
    const dietRows = Object.entries(dietLog)
      .filter(([,v]) => ["green","yellow","red"].includes(v))
      .map(([date, status]) => ({ user_id: userId, date, status }));
    if (dietRows.length > 0) {
      const { error } = await supabase.from("diet_log").upsert(dietRows);
      if (!error) summary.dietDays = dietRows.length;
    }

    // activeLog
    const activeLog = JSON.parse(localStorage.getItem("activeLog") || "{}");
    const actRows = Object.entries(activeLog)
      .filter(([,v]) => ["green","yellow","red"].includes(v))
      .map(([date, status]) => ({ user_id: userId, date, status }));
    if (actRows.length > 0) {
      const { error } = await supabase.from("activity_log").upsert(actRows);
      if (!error) summary.activityDays = actRows.length;
    }

    // focusSessions
    const focusSessions = JSON.parse(localStorage.getItem("focusSessions") || "[]");
    if (focusSessions.length > 0) {
      const rows = focusSessions.map(s => ({
        user_id: userId, date: s.date, mins: s.mins, label: s.label || "Deep work",
      }));
      const { error } = await supabase.from("focus_sessions").insert(rows);
      if (!error) summary.focusSessions = rows.length;
    }

    // customExercises
    const customExercises = JSON.parse(localStorage.getItem("customExercises") || "{}");
    const cxRows = Object.entries(customExercises).map(([id, info]) => ({
      id, user_id: userId, name: info.name, muscle: info.muscle, cat: info.cat,
    }));
    if (cxRows.length > 0) {
      const { error } = await supabase.from("custom_exercises").insert(cxRows);
      if (!error) summary.customExercises = cxRows.length;
    }

    localStorage.setItem(MIG_FLAG, new Date().toISOString());
    return { migrated: true, summary };
  } catch (e) {
    console.error("migration error:", e);
    return { migrated: false, error: e };
  }
}
