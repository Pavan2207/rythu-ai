import { translationLanguages, translateMany, translateTo } from './translate.mjs';

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
    ttsModel: 'Timbre v3.0',
    translationConfigured: true,
    translationProvider: 'Google Translate / MyMemory fallback'
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
export async function translateText(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
  const body = await readJson(request);
  const text = String(body.text || '').trim();
  const targetLanguage = String(body.targetLanguage || body.language || 'en-IN');
  if (!text || text.length > 3000) return jsonResponse(400, { error: 'Text must be between 1 and 3,000 characters.' });
  if (!translationLanguages.has(targetLanguage)) return jsonResponse(400, { error: 'Choose a supported translation language.' });
  try {
    const result = await translateTo(text, targetLanguage);
    return jsonResponse(200, { text: result.text, targetLanguage, provider: result.provider, cached: result.cached });
  } catch (error) {
    return jsonResponse(error.status || 502, { error: error.status ? error.message : 'Translation service is temporarily unavailable.' });
  }
}

export async function translateBatch(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });
  const body = await readJson(request);
  const texts = Array.isArray(body.texts) ? body.texts : [];
  const targetLanguage = String(body.targetLanguage || body.language || 'en-IN');
  if (!texts.length || texts.length > 250) return jsonResponse(400, { error: 'Send between 1 and 250 text strings.' });
  if (texts.some(text => typeof text !== 'string' || !text.trim() || text.length > 1200)) {
    return jsonResponse(400, { error: 'Each text string must be between 1 and 1,200 characters.' });
  }
  if (!translationLanguages.has(targetLanguage)) return jsonResponse(400, { error: 'Choose a supported translation language.' });
  try {
    const translations = await translateMany(texts, targetLanguage);
    return jsonResponse(200, { translations, targetLanguage });
  } catch (error) {
    return jsonResponse(error.status || 502, { error: error.status ? error.message : 'Translation service is temporarily unavailable.' });
  }
}

const locationCoords = {
  guntur: { lat: 16.3067, lon: 80.4365, label: 'Guntur, Andhra Pradesh' },
  warangal: { lat: 17.9689, lon: 79.5941, label: 'Warangal, Telangana' },
  khammam: { lat: 17.2473, lon: 80.1514, label: 'Khammam, Telangana' },
  hyderabad: { lat: 17.3850, lon: 78.4867, label: 'Hyderabad, Telangana' },
  vijayawada: { lat: 16.5062, lon: 80.6480, label: 'Vijayawada, Andhra Pradesh' },
  visakhapatnam: { lat: 17.6868, lon: 83.2185, label: 'Visakhapatnam, Andhra Pradesh' },
  bengaluru: { lat: 12.9716, lon: 77.5946, label: 'Bengaluru, Karnataka' },
  chennai: { lat: 13.0827, lon: 80.2707, label: 'Chennai, Tamil Nadu' },
  delhi: { lat: 28.6139, lon: 77.2090, label: 'Delhi' },
  mumbai: { lat: 19.0760, lon: 72.8777, label: 'Mumbai, Maharashtra' },
  pune: { lat: 18.5204, lon: 73.8567, label: 'Pune, Maharashtra' },
  kolkata: { lat: 22.5726, lon: 88.3639, label: 'Kolkata, West Bengal' },
  lucknow: { lat: 26.8467, lon: 80.9462, label: 'Lucknow, Uttar Pradesh' },
  jaipur: { lat: 26.9124, lon: 75.7873, label: 'Jaipur, Rajasthan' },
  bhopal: { lat: 23.2599, lon: 77.4126, label: 'Bhopal, Madhya Pradesh' },
  ahmedabad: { lat: 23.0225, lon: 72.5714, label: 'Ahmedabad, Gujarat' },
  patna: { lat: 25.5941, lon: 85.1376, label: 'Patna, Bihar' },
  chandigarh: { lat: 30.7333, lon: 76.7794, label: 'Chandigarh' }
};

function weatherText(code) {
  const map = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
    80: 'Rain showers', 81: 'Moderate showers', 82: 'Violent showers', 95: 'Thunderstorm'
  };
  return map[code] || 'Variable conditions';
}

async function resolveLocation(name) {
  const key = String(name || 'guntur').toLowerCase().trim();
  if (locationCoords[key]) return locationCoords[key];
  try {
    const geo = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json&countryCode=IN`;
    const res = await fetch(geo, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const r = data?.results?.[0];
      if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
        const parts = [r.name, r.admin1].filter(Boolean);
        return { lat: r.latitude, lon: r.longitude, label: parts.join(', ') || r.name };
      }
    }
  } catch { /* fall through */ }
  return locationCoords.guntur;
}

export async function fetchWeather(request) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
  const url = new URL(request.url);
  const requested = String(url.searchParams.get('location') || 'guntur').trim();
  const loc = await resolveLocation(requested);
  try {
    const api = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=1&timezone=auto`;
    const upstream = await fetch(api, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) return jsonResponse(502, { error: 'Weather service unavailable.' });
    const data = await upstream.json();
    const current = data.current || {};
    const hourly = data.hourly || { time: [], temperature_2m: [], weather_code: [], precipitation_probability: [] };
    const nowIndex = 0;
    const next = [1, 3, 5].map(offset => {
      const i = Math.min(nowIndex + offset, (hourly.time || []).length - 1);
      return {
        time: hourly.time?.[i] || null,
        temperature: hourly.temperature_2m?.[i] ?? null,
        condition: weatherText(hourly.weather_code?.[i]),
        rainChance: hourly.precipitation_probability?.[i] ?? null
      };
    }).filter(x => x.time);
    return jsonResponse(200, {
      source: 'Open-Meteo',
      location: loc.label,
      observedAt: current.time || null,
      temperatureC: current.temperature_2m ?? null,
      humidityPct: current.relative_humidity_2m ?? null,
      windKph: current.wind_speed_10m ?? null,
      condition: weatherText(current.weather_code),
      forecast: next
    });
  } catch {
    return jsonResponse(502, { error: 'Weather service is temporarily unavailable.' });
  }
}

export async function fetchMandi(request) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' });
  const url = new URL(request.url);
  const commodity = String(url.searchParams.get('commodity') || 'Chilli').trim();
  const apiKey = process.env.DATA_GOV_API_KEY;
  // Try data.gov.in Agmarknet resource when key is configured
  if (apiKey) {
    try {
      const resource = '35985678-0d79-46b4-9ed6-6f13308a1d24';
      const q = encodeURIComponent(commodity);
      const api = `https://api.data.gov.in/resource/${resource}?api-key=${encodeURIComponent(apiKey)}&format=json&limit=10&filters[commodity]=${q}`;
      const upstream = await fetch(api, { signal: AbortSignal.timeout(15000) });
      if (upstream.ok) {
        const data = await upstream.json();
        const records = Array.isArray(data.records) ? data.records : [];
        if (records.length) {
          const rows = records.slice(0, 6).map(r => ({
            mandi: r.market || r.district || 'Market',
            price: Number(r.modal_price || r.max_price || r.min_price || 0),
            change: null,
            arrivals: r.arrival_date ? String(r.arrival_date) : '—',
            commodity: r.commodity || commodity,
            variety: r.variety || ''
          })).filter(r => r.price > 0);
          if (rows.length) return jsonResponse(200, { source: 'data.gov.in (Agmarknet)', commodity, rows, live: true });
        }
      }
    } catch { /* fall through to sample */ }
  }
  const samples = {
    Chilli: [{ mandi: 'Guntur', price: 18450, change: 2.4, arrivals: '1,240 qtl' }, { mandi: 'Warangal', price: 17900, change: 1.1, arrivals: '680 qtl' }, { mandi: 'Khammam', price: 18100, change: -0.6, arrivals: '410 qtl' }],
    Cotton: [{ mandi: 'Guntur', price: 7180, change: 0.8, arrivals: '920 qtl' }, { mandi: 'Warangal', price: 7050, change: -0.3, arrivals: '760 qtl' }, { mandi: 'Khammam', price: 7120, change: 0.5, arrivals: '540 qtl' }],
    Paddy: [{ mandi: 'Guntur', price: 2340, change: 0.4, arrivals: '1,850 qtl' }, { mandi: 'Warangal', price: 2290, change: 0.2, arrivals: '1,120 qtl' }, { mandi: 'Khammam', price: 2310, change: -0.2, arrivals: '970 qtl' }]
  };
  const rows = samples[commodity] || samples.Chilli;
  return jsonResponse(200, { source: apiKey ? 'Sample (no live records found)' : 'Sample (set DATA_GOV_API_KEY for live Agmarknet)', commodity, rows, live: false });
}
