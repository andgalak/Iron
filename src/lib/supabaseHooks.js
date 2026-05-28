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

  const updatePassword = useCallback(async (password) => {
    return supabase.auth.updateUser({ password });
  }, []);

  const signOut = useCallback(async () => supabase.auth.signOut(), []);

  return { user, loading, signInWithMagicLink, verifyCode, signInWithPassword, updatePassword, signOut };
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
export function useBoards(userId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase.from("boards").select("*").eq("user_id", userId).order("position", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("boards load:", error);
        setData(data || []);
        setLoading(false);
      });
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

  async function add(name, muscle, cat) {
    const id = "cx_" + Math.random().toString(36).slice(2,9);
    setData(d => ({ ...d, [id]: { name: name.trim(), muscle, cat, custom: true } }));
    const { error } = await supabase.from("custom_exercises").insert({ id, user_id: userId, name: name.trim(), muscle, cat });
    if (error) console.error("custom ex add:", error);
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
