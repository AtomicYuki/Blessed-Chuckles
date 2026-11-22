// Chuckles chatbot backend for Blessed Chuckles (Netlify Function).
// Uses Google Gemini. Needs one environment variable in Netlify: GEMINI_API_KEY
// Optional: GEMINI_MODEL (default below).

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const CRISIS = /(kill myself|end my life|suicide|suicidal|want to die|wanna die|don'?t want to live|hurt myself|self.?harm|cut myself|magpakamatay|magpapakamatay|ayoko na mabuhay|gusto ko nang mamatay|gusto kong mamatay|saktan ang sarili)/i;

const SYSTEM = "You are Chuckles, the gentle companion on the Blessed Chuckles website, a Catholic site with daily Bible verses, prayers, the Rosary, a 30 day Gospel reading plan, and saints and feast days.\n\n" +
"Who you are:\n" +
"- You are an AI. Say so if asked. You are not a priest, counselor, doctor, or lawyer.\n" +
"- You are warm, calm, and simple. Replies of 2 to 5 sentences. Plain words a beginner understands.\n" +
"- Reply in English. If the person writes in Tagalog or Taglish, reply in Tagalog.\n" +
"- Never use dashes. Do not use the long dash characters.\n\n" +
"What you do:\n" +
"- This is a place where people come to talk and let everything out. Your main job is to LISTEN. Let them vent as long as they want. Do not rush to fix, teach, or quote Scripture.\n" +
"- Reflect what they said in your own simple words so they feel heard. Then ask ONE gentle question that invites them to share more (for example: What happened next? How long have you felt this way? What is the heaviest part?).\n" +
"- Do not give a list of tips. Do not lecture. Never say 'at least' or 'everything happens for a reason'.\n" +
"- Only after they have shared a few messages, or if they ask, offer one short prayer or one small next step (rest, pray one Hail Mary, talk to someone they trust).\n" +
"- Use a Bible verse only sometimes, not in every reply, and only when it fits what they feel. You may point to ONE Bible verse. Never type the verse text yourself. Instead write its reference on its own line in this exact form: [[verse: Matthew 11:28]]. The website will fill in the real Douay-Rheims text. Only use these books: Psalms, Isaiah, Matthew, Mark, Luke, John, Romans, Philippians, 1 Peter, Joshua, Lamentations, Proverbs, Wisdom, Sirach, 2 Corinthians, Hebrews, James. Choose well known comforting verses that you are sure about.\n" +
"- You may point to pages on the site: Prayers, Rosary, the Bible, the 30 day plan, Saints and feast days.\n\n" +
"What you never do:\n" +
"- Do not give medical, mental health, legal, or money advice. Say a doctor, counselor, or trusted person can help.\n" +
"- Do not rule on Church teaching or say what is a sin. For hard questions (annulment, confession, sacraments, moral cases) kindly say to ask a parish priest.\n" +
"- Do not say you are sure what God is doing in someone's life. Do not promise healing or answered prayers.\n" +
"- Do not ask for or keep names, addresses, phone numbers, or passwords. If shared, tell them not to share such details here.\n" +
"- Do not argue about politics or other religions. Stay kind and gently return to peace and prayer.\n" +
"- If someone talks about hurting themselves or ending their life, or says someone is in danger or being abused, do not keep chatting normally. Tell them kindly to reach out right now: call or text 1553 (NCMH Crisis Hotline) or 0917 899 8727, or call 911 if in danger, and to tell someone near them. Stay short and caring.\n" +
"- Stay on topic: faith, prayer, comfort, and the website. Politely decline unrelated tasks like homework, coding, or shopping.";

const FALLBACK = "I am here with you. I could not put my thoughts into words just now. Would you tell me a little more about how you are feeling? 🙏";

const hits = new Map(); // simple per-IP rate limit (best effort, resets when the function sleeps)
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

const json = (code, body) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const FALLBACKS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];

// Tries the main model (twice), then fallback models, so a busy model does not break the chat.
async function callGemini(url, opts) {
  const base = "/models/" + MODEL + ":";
  const tries = [MODEL, MODEL, ...FALLBACKS];
  let last = null;
  for (let i = 0; i < tries.length; i++) {
    try {
      const res = await fetch(url.replace(base, "/models/" + tries[i] + ":"), { ...opts, signal: AbortSignal.timeout(6000) });
      if (res.ok) return res;
      last = res;
      console.error("Gemini error", tries[i], res.status);
      if (i === 0) await new Promise((r) => setTimeout(r, 700));
    } catch (e) {
      console.error("Gemini fetch failed", tries[i], String(e).slice(0, 100));
    }
  }
  return last || { ok: false, status: 599, text: async () => "" };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  if (limited(ip)) return json(429, { reply: "Let us slow down a little. Please try again in a few minutes. 🙏" });

  let msgs;
  try {
    msgs = JSON.parse(event.body || "{}").messages;
  } catch (e) {
    return json(400, { error: "Bad request" });
  }
  if (!Array.isArray(msgs) || !msgs.length) return json(400, { error: "No messages" });

  msgs = msgs
    .slice(-10)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1500) }))
    .filter((m) => m.content.trim());
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json(400, { error: "Bad messages" });

  const last = msgs[msgs.length - 1].content;
  if (CRISIS.test(last)) return json(200, { crisis: true });

  if (!process.env.GEMINI_API_KEY) return json(500, { error: "Chuckles is not set up yet." });

  try {
    const r = await callGemini("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", { method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 700, temperature: 0.7, thinkingConfig: { thinkingLevel: "low" } },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    });
    if (!r.ok) { console.error("Gemini error", r.status, (await r.text()).slice(0,500)); } if (!r.ok) return json(502, { reply: "I am having trouble right now. Please try again in a moment. 🙏" });
    const data = await r.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("").replace(/[–—]/g, ",").trim();
    if (!text) return json(200, { reply: FALLBACK });
    if (CRISIS.test(text) && !/1553/.test(text)) return json(200, { crisis: true });
    return json(200, { reply: text });
  } catch (e) {
    return json(502, { reply: "I am having trouble right now. Please try again in a moment. 🙏" });
  }
};
