/* Server-side translation used to localise answer text before it is displayed
   or sent to Timbre. The Gnani Speech APIs cover transcription and synthesis;
   Evon (text generation/translation) is optional and self-hosted, so this
   module provides a text-translation fallback for every supported language. */

export const translationLanguages = new Set(['en-IN', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN', 'bn-IN', 'gu-IN', 'hi-en']);

const cache = new Map();
const CACHE_LIMIT = 2500;
const GOOGLE_TIMEOUT_MS = 8000;
const MYMEMORY_TIMEOUT_MS = 8000;

export function providerLanguage(code) {
  if (code === 'hi-en') return 'hi';
  return String(code || 'en-IN').split('-')[0];
}

function remember(key, value) {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
}

function decodeEntities(value) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function translateWithGoogle(text, targetLanguage, sourceLanguage = 'auto') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${providerLanguage(targetLanguage)}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'RythuAI/1.0 (+prototype)' },
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
  });
  if (!response.ok) return '';
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload?.[0])) return '';
  return payload[0]
    .map(part => (Array.isArray(part) ? String(part[0] || '') : ''))
    .join('')
    .trim();
}

async function translateWithMyMemory(text, targetLanguage) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${providerLanguage(targetLanguage)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(MYMEMORY_TIMEOUT_MS) });
  if (!response.ok) return '';
  const payload = await response.json().catch(() => null);
  const translated = payload?.responseData?.translatedText;
  if (typeof translated !== 'string') return '';
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) return '';
  return decodeEntities(translated).trim();
}

/**
 * Translate text into one of the supported response languages.
 * Returns { text, provider, cached } and throws when no provider responds.
 */
export async function translateTo(text, targetLanguage, sourceLanguage = 'auto') {
  if (!translationLanguages.has(targetLanguage)) {
    throw Object.assign(new Error('Choose a supported translation language.'), { status: 400 });
  }
  if (targetLanguage === 'en-IN') return { text, provider: 'none', cached: true };

  const key = `${targetLanguage}\u0000${text}`;
  if (cache.has(key)) return { ...cache.get(key), cached: true };

  try {
    const googleText = await translateWithGoogle(text, targetLanguage, sourceLanguage);
    if (googleText) {
      const result = { text: googleText, provider: 'Google Translate' };
      remember(key, result);
      return { ...result, cached: false };
    }
  } catch { /* try the next provider */ }

  try {
    const myMemoryText = await translateWithMyMemory(text, targetLanguage);
    if (myMemoryText) {
      const result = { text: myMemoryText, provider: 'MyMemory' };
      remember(key, result);
      return { ...result, cached: false };
    }
  } catch { /* report a single friendly error below */ }

  throw Object.assign(new Error('Translation service is temporarily unavailable.'), { status: 502 });
}

/**
 * Translate a list of short UI strings. Results keep the input order. Strings
 * that cannot be translated are returned unchanged so the page always renders.
 */
export async function translateMany(texts, targetLanguage) {
  if (!translationLanguages.has(targetLanguage)) {
    throw Object.assign(new Error('Choose a supported translation language.'), { status: 400 });
  }
  const list = texts.map(value => String(value ?? ''));
  if (targetLanguage === 'en-IN') return list;

  const unique = [...new Set(list.map(value => value.trim()).filter(Boolean))];
  const translated = new Map();
  const queue = [...unique];

  const worker = async () => {
    while (queue.length) {
      const text = queue.shift();
      try {
        const result = await translateTo(text, targetLanguage, 'en');
        if (result.text) translated.set(text, result.text);
      } catch { /* keep the original string for this item */ }
    }
  };

  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
  return list.map(value => translated.get(value.trim()) ?? value);
}
