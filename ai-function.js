/* Netlify Function: the only place the Google Gemini key lives.
   The browser sends: { task, system, prompt, images[], links[], history[] }  ->  we reply { text }.
   Env vars (Netlify > Project configuration > Environment variables):
     GEMINI_API_KEY    required   (free key from https://aistudio.google.com/apikey)
     GEMINI_MODEL      optional   (default: gemini-flash-latest)
     SUPABASE_URL + SUPABASE_ANON_KEY   optional but recommended: only logged-in users can use the AI */

const JSON_TASKS = new Set(['flashcards', 'quiz', 'essay']);
const reply = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only.' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return reply(500, { error: 'The AI is not set up yet: GEMINI_API_KEY is missing in Netlify.' });

  // Only let signed-in users spend your free quota
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    let ok = false;
    if (token) {
      try {
        const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
          headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
        });
        ok = r.ok;
      } catch (e) { ok = false; }
    }
    if (!ok) return reply(401, { error: 'Please log in to use the AI.' });
  }

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad request.' }); }

  const task = String(b.task || '');
  const system = String(b.system || 'You are a helpful study tutor.').slice(0, 4000);
  const text = String(b.prompt || '').slice(0, 30000);
  if (!text.trim()) return reply(400, { error: 'Nothing to answer.' });

  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 6)
    .map(d => /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d)))
    .filter(Boolean)
    .map(m => ({ inlineData: { mimeType: m[1], data: m[2] } }));
  const links = (Array.isArray(b.links) ? b.links : []).slice(0, 3).filter(u => /^https?:\/\//i.test(String(u)));

  const contents = (Array.isArray(b.history) ? b.history : []).slice(-8)
    .map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(h.content || '').slice(0, 4000) }] }));
  while (contents.length && contents[0].role === 'model') contents.shift();
  contents.push({ role: 'user', parts: [...images, { text }] });

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: JSON_TASKS.has(task) ? 0.3 : 0.6 }
  };
  if (JSON_TASKS.has(task)) body.generationConfig.responseMimeType = 'application/json';
  if (links.length && !JSON_TASKS.has(task)) body.tools = [{ url_context: {} }];

  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'])];
  let status = 0;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body)
        });
      } catch (e) { return reply(502, { error: 'Could not reach Google AI. Try again.' }); }
      if (r.ok) {
        const j = await r.json();
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        const out = parts.map(p => p.text || '').join('');
        if (!out) return reply(200, { text: 'I could not answer that. Try rewording your question.' });
        return reply(200, { text: out });
      }
      status = r.status;
      if (status === 400 && body.tools && attempt === 0) { delete body.tools; continue; } // link reading unavailable: retry without
      break;
    }
    if (status !== 404) break; // only try the next model if this one was not found
  }
  const msg = status === 429 ? 'The free AI limit was reached for now. Try again in a minute.'
    : (status === 401 || status === 403) ? 'Google rejected the AI key. Check GEMINI_API_KEY in Netlify.'
    : 'The AI service returned an error (' + status + ').';
  return reply(502, { error: msg });
};
