// Supabase client — initialized from Vite env vars.
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Vercel's environment
// variables dashboard. The publishable/anon key is safe to expose in client
// code; Row Level Security (RLS) in the database enforces per-user access.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

// If not configured, we still export a client object so imports don't blow up;
// the app surfaces a "Setup required" screen instead.
export const supabase = supabaseConfigured
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit", // tokens in URL hash; no PKCE code_verifier state to lose
      },
    })
  : null;
