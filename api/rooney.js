// Vercel serverless function: proxies Rooney chat requests to Anthropic.
//
// Security model:
//  - ANTHROPIC_API_KEY lives ONLY in Vercel's environment variable storage
//    (set via `vercel env add ANTHROPIC_API_KEY` or the Vercel dashboard). It
//    never touches the browser bundle and is never in any local file.
//  - Every request must carry a valid Supabase access token in an
//    `Authorization: Bearer <token>` header. Without one we answer 401 and
//    never touch the Anthropic key — so a stranger who finds this URL can't
//    spend the owner's Anthropic credit.
//  - The model and max_tokens are pinned here, server-side, so even a real
//    signed-in session can't be replayed to request a different model or a
//    huge (expensive) response.

// Only these models may be requested. Add to the set when the client changes.
const ALLOWED_MODELS = new Set(["claude-opus-5"]);
const DEFAULT_MODEL = "claude-opus-5";

// Hard ceiling on the response length we'll pay for (the client asks for 2000).
const MAX_TOKENS_CAP = 4000;

// Ceiling on the request we'll forward. Well above any real Rooney turn
// (digest + 40 messages + tools), far below anything worth abusing.
const MAX_BODY_CHARS = 600_000;

// Fields we pass through to Anthropic. Anything else in the body is dropped —
// notably `stream`, which this handler can't relay.
const FORWARDED_FIELDS = ["system", "tools", "tool_choice", "temperature", "top_p", "stop_sequences"];

// Vercel exposes every project environment variable to serverless functions,
// including the VITE_-prefixed pair the frontend already uses, so no new
// variables are needed. The unprefixed names are checked first in case they
// are added later.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── 1. Require a signed-in IRON user ──────────────────────────────────────
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: sign in to talk to Rooney." });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({
      error: "Supabase settings are not available to this function. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) in the Vercel dashboard, then redeploy.",
    });
  }

  try {
    // Ask Supabase whether this token is a real, unexpired session.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: "Unauthorized: session invalid or expired. Sign in again." });
    }
    const user = await userRes.json();
    if (!user || !user.id) {
      return res.status(401).json({ error: "Unauthorized: token did not resolve to a user." });
    }
  } catch (e) {
    return res.status(401).json({ error: `Unauthorized: could not verify session (${String(e)})` });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set on this Vercel project. Add it via the Vercel dashboard or `vercel env add ANTHROPIC_API_KEY`, then redeploy.",
    });
  }

  // ── 2. Validate and clamp the request before forwarding ───────────────────
  // req.body is already parsed JSON in Vercel's Node runtime.
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: "Bad request: expected a JSON body with a non-empty `messages` array." });
  }

  const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({
      error: `Bad request: model "${model}" is not allowed here. Allowed: ${[...ALLOWED_MODELS].join(", ")}.`,
    });
  }

  const requestedTokens = Number(body.max_tokens);
  const maxTokens = Number.isFinite(requestedTokens) && requestedTokens > 0
    ? Math.min(Math.floor(requestedTokens), MAX_TOKENS_CAP)
    : MAX_TOKENS_CAP;

  const payload = { model, max_tokens: maxTokens, messages: body.messages };
  for (const field of FORWARDED_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: "Request too large." });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: serialized,
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: `Proxy failed: ${String(e)}` });
  }
}
