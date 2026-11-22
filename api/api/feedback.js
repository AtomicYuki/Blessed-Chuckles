// Anonymous counters only: chats started, helpful, not helpful. No chat text is ever stored.
// Needs a free Upstash Redis (Vercel Storage). Without it, this does nothing and nothing breaks.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEYS = { start: "chuckles:started", up: "chuckles:helpful", down: "chuckles:not_helpful" };

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(200).json({ ok: true, stored: false });
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const key = KEYS[body.v];
      if (!key) return res.status(400).json({ ok: false });
      await redis(["INCR", key]);
      return res.status(200).json({ ok: true });
    }
    const out = {};
    for (const k of Object.keys(KEYS)) {
      const r = await redis(["GET", KEYS[k]]);
      out[k] = Number(r.result || 0);
    }
    return res.status(200).json({ started: out.start, helpful: out.up, not_helpful: out.down });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
};
