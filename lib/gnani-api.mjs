const speechLanguages = new Set(['hi-IN', 'en-IN', 'te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN', 'bn-IN', 'gu-IN']);
const responseLanguages = new Set([...speechLanguages, 'hi-en']);

function jsonResponse(status, value) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

export function getStatus() {
  const evonUrl = process.env.EVON_BASE_URL;
  let evonConfigured = false;
  if (evonUrl) {
    try {
      const url = new URL(evonUrl);
      evonConfigured = process.env.VERCEL
        ? url.protocol === 'https:' && !url.username && !url.password
        : ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { evonConfigured = false; }
  }
  return jsonResponse(200, {
    gnaniConfigured: Boolean(process.env.VACHANA_API_KEY_ID),
    evonConfigured,
    sttModel: 'Prisma v3.0',
    ttsModel: 'Timbre v3.0'
  });
}

export async function speechToText(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
  const apiKey = process.env.VACHANA_API_KEY_ID;
  if (!apiKey) return jsonResponse(503, { error: 'Gnani speech is not configured. Add VACHANA_API_KEY_ID in Vercel Environment Variables.' });
  const body = await readJson(request);
  const audio = Buffer.from(String(body.audioBase64 || ''), 'base64');
  const languageCode = String(body.languageCode || 'indic-auto');
  const model = body.model === 'prisma-v2.5' ? 'prisma-v2.5' : 'prisma-v3.0';
  const allowedFormats = model === 'prisma-v3.0'
    ? new Set(['verbatim', 'transcribe', 'codemix', 'transliterate'])
    : new Set(['verbatim', 'transcribe']);
  const requestedLanguages = languageCode.split(',').map(code => code.trim());
  const validLanguage = languageCode === 'indic-auto'
    ? model === 'prisma-v3.0'
    : requestedLanguages.length <= 4
      && requestedLanguages.every(code => speechLanguages.has(code))
      && (model === 'prisma-v3.0' || requestedLanguages.length === 1);
  const format = allowedFormats.has(body.format) ? body.format : 'transcribe';

  if (!audio.length) return jsonResponse(400, { error: 'A short microphone recording is required.' });
  if (audio.length > 10 * 1024 * 1024) return jsonResponse(413, { error: 'Recording is too large. Keep clips under 30 seconds.' });
  if (!validLanguage) return jsonResponse(400, { error: 'Use a supported language. Auto-detection and language pairs require Prisma v3.0; Prisma v2.5 accepts one language.' });

  const form = new FormData();
  form.set('audio_file', new Blob([audio], { type: 'audio/wav' }), 'field-recording.wav');
  form.set('model', model);
  form.set('language_code', languageCode);
  form.set('format', format);

  try {
    const upstream = await fetch('https://api.vachana.ai/stt/v3', {
      method: 'POST', headers: { 'X-API-Key-ID': apiKey }, body: form, signal: AbortSignal.timeout(60000)
    });
    const result = await upstream.json().catch(() => ({ error: 'Gnani returned an unreadable response.' }));
    return jsonResponse(upstream.status, result);
  } catch {
    return jsonResponse(502, { error: 'Gnani speech service is temporarily unavailable.' });
  }
}

export async function textToSpeech(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
  const apiKey = process.env.VACHANA_API_KEY_ID;
  if (!apiKey) return jsonResponse(503, { error: 'Gnani speech is not configured. Add VACHANA_API_KEY_ID in Vercel Environment Variables.' });
  const body = await readJson(request);
  const text = String(body.text || '').trim();
  const language = String(body.language || 'te-IN');
  if (!text || text.length > 3000) return jsonResponse(400, { error: 'Speech text must be between 1 and 3,000 characters.' });
  if (!responseLanguages.has(language)) return jsonResponse(400, { error: 'Choose a supported response language.' });

  try {
    const upstream = await fetch('https://api.vachana.ai/api/v1/tts/inference', {
      method: 'POST',
      headers: { 'X-API-Key-ID': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text, voice: 'Shivani', model: 'timbre-v3.0', language: language === 'hi-en' ? 'auto' : language,
        speed: 1.0,
        audio_config: { sample_rate: 48000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' }
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      let error;
      try { error = JSON.parse(detail); } catch { error = { error: 'Gnani speech synthesis failed.' }; }
      return jsonResponse(upstream.status, error);
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: { 'content-type': upstream.headers.get('content-type') || 'audio/wav', 'cache-control': 'no-store' }
    });
  } catch {
    return jsonResponse(502, { error: 'Gnani speech service is temporarily unavailable.' });
  }
}

export async function evonAnswer(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
  const endpoint = process.env.EVON_BASE_URL;
  if (!endpoint) return jsonResponse(503, { error: 'Evon is not configured. Set EVON_BASE_URL to your HTTPS-hosted, self-managed Gnani Evon runtime.' });

  let url;
  try { url = new URL(endpoint); }
  catch { return jsonResponse(500, { error: 'EVON_BASE_URL must be a valid inference URL.' }); }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (process.env.VERCEL ? url.protocol !== 'https:' || localHost || url.username || url.password : !localHost) {
    return jsonResponse(400, { error: 'On Vercel, Evon must use an HTTPS endpoint that you manage. Local runtimes must use loopback.' });
  }

  const body = await readJson(request);
  const question = String(body.question || '').trim();
  const textLanguage = String(body.textLanguage || 'en-IN');
  const speechLanguage = String(body.speechLanguage || 'en-IN');
  if (!question || question.length > 2000) return jsonResponse(400, { error: 'A spoken question under 2,000 characters is required.' });
  if (!responseLanguages.has(textLanguage) || !responseLanguages.has(speechLanguage)) return jsonResponse(400, { error: 'Choose supported text and voice languages.' });

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.EVON_MODEL_ID || 'gnani/gnani-evon-v3.3-30B-A3B', temperature: 0.2, max_tokens: 300,
        messages: [
          { role: 'system', content: `You are Rythu AI, a concise voice-first Indian farmer assistant. Return only JSON with string fields "text" and "spokenText". Write "text" in ${textLanguage} and translate that same answer into ${speechLanguage} for "spokenText". Never invent live APMC, weather, OCR, or agronomy data. Use cautious crop guidance; never prescribe pesticide dosages.` },
          { role: 'user', content: `Feature: ${String(body.feature || 'general').slice(0, 40)}\nDetected input language: ${String(body.inputLanguage || 'unknown').slice(0, 30)}\nSpoken request: ${question}` }
        ]
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!upstream.ok) return jsonResponse(502, { error: 'Evon inference failed. Check your managed runtime.' });
    const result = await upstream.json().catch(() => null);
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return jsonResponse(502, { error: 'Evon returned no answer.' });
    let answers;
    try { answers = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { return jsonResponse(502, { error: 'Evon must return JSON fields text and spokenText.' }); }
    if (typeof answers.text !== 'string' || typeof answers.spokenText !== 'string') return jsonResponse(502, { error: 'Evon response is missing text or spokenText.' });
    return jsonResponse(200, {
      answer: answers.text.trim(), spokenText: answers.spokenText.trim(), textLanguage, speechLanguage,
      model: result.model || process.env.EVON_MODEL_ID || 'gnani/gnani-evon-v3.3-30B-A3B'
    });
  } catch {
    return jsonResponse(502, { error: 'Evon runtime is unreachable.' });
  }
}