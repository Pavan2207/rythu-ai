import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const envFile = resolve(root, '.env.local');

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(VACHANA_API_KEY_ID|EVON_BASE_URL|EVON_MODEL_ID)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

const languageCodes = new Set(['auto', 'hi-IN', 'en-IN', 'te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN', 'bn-IN', 'gu-IN', 'hi-en']);
const speechLanguages = new Set(['hi-IN', 'en-IN', 'te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN', 'bn-IN', 'gu-IN']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 14 * 1024 * 1024) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

async function proxySpeechToText(request, response) {
  const body = await readJson(request);
  const apiKey = process.env.VACHANA_API_KEY_ID;
  if (!apiKey) return sendJson(response, 503, { error: 'Gnani is not configured. Add VACHANA_API_KEY_ID to .env.local and restart the server.' });
  const audio = Buffer.from(String(body.audioBase64 || ''), 'base64');
  const languageCode = String(body.languageCode || 'indic-auto');
  const model = body.model === 'prisma-v2.5' ? 'prisma-v2.5' : 'prisma-v3.0';
  const format = ['verbatim', 'transcribe', 'codemix', 'transliterate'].includes(body.format) ? body.format : 'transcribe';
  const requestedLanguages = languageCode.split(',').map(code => code.trim());
  const validLanguage = languageCode === 'indic-auto'
    ? model === 'prisma-v3.0'
    : requestedLanguages.length <= 4
      && requestedLanguages.every(code => speechLanguages.has(code))
      && (model === 'prisma-v3.0' || requestedLanguages.length === 1);

  if (!audio.length) return sendJson(response, 400, { error: 'A short microphone recording is required.' });
  if (audio.length > 10 * 1024 * 1024) return sendJson(response, 413, { error: 'Recording is too large. Keep clips under 30 seconds.' });
  if (!validLanguage) {
    return sendJson(response, 400, { error: 'Use a supported language. Auto-detection and language pairs require Prisma v3.0; Prisma v2.5 accepts one language.' });
  }

  const form = new FormData();
  form.set('audio_file', new Blob([audio], { type: 'audio/wav' }), 'field-recording.wav');
  form.set('model', model);
  form.set('language_code', languageCode);
  form.set('format', format);

  const upstream = await fetch('https://api.vachana.ai/stt/v3', {
    method: 'POST', headers: { 'X-API-Key-ID': apiKey }, body: form, signal: AbortSignal.timeout(65000)
  });
  const result = await upstream.json().catch(() => ({ error: 'Gnani returned an unreadable response.' }));
  sendJson(response, upstream.status, result);
}

async function proxyTextToSpeech(request, response) {
  const body = await readJson(request);
  const apiKey = process.env.VACHANA_API_KEY_ID;
  if (!apiKey) return sendJson(response, 503, { error: 'Gnani is not configured. Add VACHANA_API_KEY_ID to .env.local and restart the server.' });
  const text = String(body.text || '').trim();
  const language = String(body.language || 'te-IN');
  if (!text || text.length > 3000) return sendJson(response, 400, { error: 'Speech text must be between 1 and 3,000 characters.' });
  if (!languageCodes.has(language)) return sendJson(response, 400, { error: 'Choose a supported Indic language.' });
  const synthesisLanguage = language === 'hi-en' ? 'auto' : language;

  const upstream = await fetch('https://api.vachana.ai/api/v1/tts/inference', {
    method: 'POST',
    headers: { 'X-API-Key-ID': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      text, voice: 'Shivani', model: 'timbre-v3.0', language: synthesisLanguage, speed: 1.0,
      audio_config: { sample_rate: 48000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' }
    }),
    signal: AbortSignal.timeout(65000)
  });
  if (!upstream.ok) {
    const errorText = await upstream.text();
    let errorBody;
    try { errorBody = JSON.parse(errorText); } catch { errorBody = { error: 'Gnani speech synthesis failed.' }; }
    return sendJson(response, upstream.status, errorBody);
  }
  const audio = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(200, { 'content-type': upstream.headers.get('content-type') || 'audio/wav', 'content-length': audio.length, 'cache-control': 'no-store' });
  response.end(audio);
}

async function generateLocalEvonAnswer(request, response) {
  const body = await readJson(request);
  const endpoint = process.env.EVON_BASE_URL;
  if (!endpoint) return sendJson(response, 503, { error: 'Local Evon is not configured. Request the Evon weights and start a local OpenAI-compatible inference server.' });

  let url;
  try { url = new URL(endpoint); }
  catch { return sendJson(response, 500, { error: 'EVON_BASE_URL must be a valid local inference URL.' }); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return sendJson(response, 400, { error: 'Evon must run locally; remote inference endpoints are not allowed.' });
  }

  const question = String(body.question || '').trim();
  const textLanguage = String(body.textLanguage || 'en-IN');
  const speechLanguage = String(body.speechLanguage || 'en-IN');
  if (!question || question.length > 2000) return sendJson(response, 400, { error: 'A spoken question under 2,000 characters is required.' });
  if (!languageCodes.has(textLanguage) || textLanguage === 'auto' || !languageCodes.has(speechLanguage) || speechLanguage === 'auto') {
    return sendJson(response, 400, { error: 'Choose supported text and voice languages.' });
  }

  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.EVON_MODEL_ID || 'gnani/gnani-evon-v3.3-30B-A3B',
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: 'system', content: `You are Rythu AI, a concise voice-first assistant for Indian farmers. Return only a JSON object with string fields "text" and "spokenText". Put the answer in ${textLanguage} in "text" and translate the same answer into ${speechLanguage} in "spokenText". Use only the spoken request and supplied sample context. Never claim to have live weather, mandi, OCR, or verified agronomy data unless provided. For crop symptoms, give cautious next checks and do not prescribe pesticide dosages. For calculations, state assumptions. If the required service/data is unavailable, say so plainly.` },
        { role: 'user', content: `Feature: ${String(body.feature || 'general').slice(0, 40)}\nDetected input language: ${String(body.inputLanguage || 'unknown').slice(0, 30)}\nSpoken request: ${question}` }
      ]
    }),
    signal: AbortSignal.timeout(90000)
  });
  if (!upstream.ok) return sendJson(response, 502, { error: 'Local Evon inference failed. Check the configured model server.' });
  const result = await upstream.json().catch(() => null);
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return sendJson(response, 502, { error: 'Local Evon returned no answer.' });
  let answers;
  try { answers = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { return sendJson(response, 502, { error: 'Local Evon must return JSON with text and spokenText fields.' }); }
  if (typeof answers.text !== 'string' || typeof answers.spokenText !== 'string' || !answers.text.trim() || !answers.spokenText.trim()) {
    return sendJson(response, 502, { error: 'Local Evon response is missing text or spokenText.' });
  }
  sendJson(response, 200, {
    answer: answers.text.trim(), spokenText: answers.spokenText.trim(),
    textLanguage, speechLanguage,
    model: result.model || process.env.EVON_MODEL_ID || 'gnani/gnani-evon-v3.3-30B-A3B'
  });
}

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/status') {
    return sendJson(response, 200, { gnaniConfigured: Boolean(process.env.VACHANA_API_KEY_ID), evonConfigured: Boolean(process.env.EVON_BASE_URL), sttModel: 'Prisma v3.0', ttsModel: 'Timbre v3.0' });
  }
  if (request.method === 'POST' && url.pathname === '/api/stt') return proxySpeechToText(request, response);
  if (request.method === 'POST' && url.pathname === '/api/tts') return proxyTextToSpeech(request, response);
  if (request.method === 'POST' && url.pathname === '/api/answer') return generateLocalEvonAnswer(request, response);
  if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed.' });

  let requestedPath;
  try { requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { return sendJson(response, 400, { error: 'Invalid path.' }); }
  const filePath = resolve(root, `.${requestedPath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return sendJson(response, 403, { error: 'Forbidden.' });
  const relativePath = filePath.slice(root.length + 1);
  if (relativePath.split(sep).some(part => part.startsWith('.')) || relativePath.toLowerCase() === 'server.mjs') {
    return sendJson(response, 404, { error: 'Not found.' });
  }
  try {
    const content = readFileSync(filePath);
    response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
  }
}

const server = createServer((request, response) => {
  handle(request, response).catch(error => sendJson(response, error.status || 502, { error: error.status ? error.message : 'Speech service is temporarily unavailable.' }));
});

const port = Number(process.env.PORT || 8000);
server.listen(port, '127.0.0.1', () => console.log(`Rythu AI running at http://127.0.0.1:${port}`));