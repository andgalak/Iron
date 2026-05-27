// Vercel serverless function: proxies Rooney chat requests to Anthropic.
// The API key lives ONLY in Vercel's environment variable storage (set via
// `vercel env add ANTHROPIC_API_KEY` or the Vercel dashboard). It never
// touches the browser bundle and is never in any local file.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set on this Vercel project. Add it via the Vercel dashboard or `vercel env add ANTHROPIC_API_KEY`, then redeploy.",
    });
  }

  try {
    // req.body is already parsed JSON in Vercel's Node runtime.
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: `Proxy failed: ${String(e)}` });
  }
}
