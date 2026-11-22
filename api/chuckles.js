// Vercel entry point. Reuses the same logic as the Netlify function.
const { handler } = require("../netlify/functions/chuckles.js");

module.exports = async (req, res) => {
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const out = await handler({ httpMethod: req.method, headers: req.headers || {}, body });
  res.status(out.statusCode);
  Object.entries(out.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.send(out.body);
};
