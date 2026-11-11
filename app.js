/* Rythu AI shared client logic.
   Every page loads this file; each block only touches elements that exist on
   the current page, so the dashboard can be split across multiple HTML files. */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };

  const featureCatalog = [
    { id: 'plant', title: 'Voice-Activated Plant Doctor', description: 'Ask about crop symptoms by voice; an optional plant photo can be selected for future vision support.', stack: 'Prisma v3.0 · Vision OCR pending · ICAR treatment rules pending', status: 'Voice preview', target: 'plant-doctor.html', note: 'Text triage is rule-based. Image vision and verified ICAR rules are not connected; no disease or pesticide dose is inferred from a photo.' },
    { id: 'mandi', title: 'Multi-Mandi Live Price & Hold/Sell Advisor', description: 'Ask for commodity rates across nearby mandis and compare a sample snapshot.', stack: 'Prisma v3.0 · APMC Pricing RAG pending · Timbre v3.0 pending', status: 'Sample rates', target: 'mandi.html', note: 'Mandi rates are illustrative, not live. No trend-based hold/sell recommendation is made.' },
    { id: 'insurance', title: 'Paper-to-Action Crop Insurance & Subsidy Reader', description: 'Speak a notice question; optionally attach a circular image for future OCR support.', stack: 'Layout OCR pending · structural entity extraction pending · Timbre v3.0 pending', status: 'OCR pending', target: 'documents.html', note: 'This prototype does not read uploaded notices or verify deadlines, eligibility or required documents.' },
    { id: 'climate', title: 'Hyper-Local Micro-Climate & Irrigation Voice Alerts', description: 'Ask about village weather and spray timing; the current panel is a sample only.', stack: 'Micro-climate API pending · voice alert generator · Timbre v3.0 pending', status: 'Sample weather', target: 'index.html#weather', note: 'Weather values are not live and are not village-verified.' },
    { id: 'inputs', title: 'Voice-Powered Fertilizer & Seed Calculator', description: 'Speak plot size in acres, guntas or bighas to calculate sample seed and input estimates.', stack: 'Voice intent parser · local unit normalization · Timbre v3.0 pending', status: 'Working preview', target: 'calculator.html' },
    { id: 'soil', title: 'Soil Health Card Nutrient Interpreter', description: 'Speak N-P-K values or optionally attach a soil-card image for future OCR support.', stack: 'Vision OCR pending · soil nutrient rules pending · Timbre v3.0 pending', status: 'OCR pending', note: 'No nutrient dose is generated; OCR and crop-specific nutrient rules are not connected.' },
    { id: 'pest', title: 'Voice Pest Prevention Outbreak Alarm', description: 'Ask about regional pest threats; forecasting needs local outbreak and weather data.', stack: 'Prisma v3.0 · predictive pest weather matrix pending · Timbre v3.0 pending', status: 'Data pending', note: 'No pest risk is predicted. Do not apply preventive chemicals based on this preview.' },
    { id: 'kcc', title: 'Precision Financial & Loan Subsidy Calculator', description: 'Speak principal and repayment days for an illustrative 4% simple-interest calculation.', stack: 'Financial formula parser · Timbre v3.0 pending', status: 'Formula preview', preview: 'kcc', note: 'This is not a bank quote. Confirm eligibility, subsidy and loan terms with your lender.' },
    { id: 'organic', title: 'Voice Organic Pesticide Recipe & Guidance', description: 'Ask for organic crop-care guidance; verified recipes and safety sources are pending.', stack: 'Prisma v3.0 · verified organic agronomy database pending · Timbre v3.0 pending', status: 'Knowledge pending', note: 'No recipe or application dosage is provided until a verified agronomy source is connected.' },
    { id: 'scribe', title: 'Dual-Party Audio Trade & Bargaining Scribe', description: 'Create a spoken draft of agreed terms; not a legal contract or speaker-verified record.', stack: 'Prisma v3.0 · dual-party diarization unavailable · state ledger pending', status: 'Transcript preview', note: 'Record only with both parties’ informed consent. The current REST transcription does not separate speakers or lock a transaction.' }
  ];

  const marketData = {
    Chilli: [{ mandi: 'Guntur', price: 18_450, change: 2.4, arrivals: '1,240 qtl' }, { mandi: 'Warangal', price: 17_900, change: 1.1, arrivals: '680 qtl' }, { mandi: 'Khammam', price: 18_100, change: -0.6, arrivals: '410 qtl' }],
    Cotton: [{ mandi: 'Guntur', price: 7_180, change: 0.8, arrivals: '920 qtl' }, { mandi: 'Warangal', price: 7_050, change: -0.3, arrivals: '760 qtl' }, { mandi: 'Khammam', price: 7_120, change: 0.5, arrivals: '540 qtl' }],
    Paddy: [{ mandi: 'Guntur', price: 2_340, change: 0.4, arrivals: '1,850 qtl' }, { mandi: 'Warangal', price: 2_290, change: 0.2, arrivals: '1,120 qtl' }, { mandi: 'Khammam', price: 2_310, change: -0.2, arrivals: '970 qtl' }]
  };
  let liveMarket = { source: 'Sample', rows: null, live: false };
  const cropRates = { paddy: { seed: 24, bags: 2.2, cost: 800 }, cotton: { seed: 2, bags: 3, cost: 1450 }, chilli: { seed: .4, bags: 2, cost: 1100 } };

  const languageSelect = $('#language');
  const textLanguageSelect = $('#textLanguage');
  const toast = $('#toast');
  const dialog = $('#featureDialog');
  const recordButton = $('#recordButton');
  const recordStatus = $('#recordStatus');

  let toastTimer;
  let activeVoiceFeature = null;

  const storedTextLanguage = (() => { try { return localStorage.getItem('rythuTextLanguage'); } catch { return null; } })();
  if (storedTextLanguage && textLanguageSelect && Array.from(textLanguageSelect.options).some(option => option.value === storedTextLanguage)) textLanguageSelect.value = storedTextLanguage;
  const storedVoiceLanguage = (() => { try { return localStorage.getItem('rythuVoiceLanguage'); } catch { return null; } })();
  if (storedVoiceLanguage && languageSelect && Array.from(languageSelect.options).some(option => option.value === storedVoiceLanguage)) languageSelect.value = storedVoiceLanguage;

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }

  async function speak(text, speechLanguage = languageSelect?.value || 'en-IN') {
    try {
      const response = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, language: speechLanguage }) });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || `Timbre request failed (${response.status}).`);
      }
      const audioUrl = URL.createObjectURL(await response.blob());
      const player = new Audio(audioUrl);
      player.addEventListener('ended', () => URL.revokeObjectURL(audioUrl), { once: true });
      player.addEventListener('error', () => URL.revokeObjectURL(audioUrl), { once: true });
      await player.play();
    } catch (error) {
      notify(error.message || 'Timbre is unavailable. Check the local server and Gnani configuration.');
    }
  }

  /* ---------------------------------------------------------------- tools */

  function renderFeatureCatalog() {
    const grid = $('#featureGrid');
    if (!grid) return;
    grid.innerHTML = featureCatalog.map((feature, index) => `<button class="feature-card" type="button" data-feature-id="${feature.id}"><span class="feature-card-top"><span class="feature-number">${String(index + 1).padStart(2, '0')}</span><span class="feature-state">${feature.status}</span></span><strong>${feature.title}</strong><p>${feature.description}</p><i class="feature-arrow" data-lucide="arrow-up-right" width="14"></i></button>`).join('');
    refreshIcons();
    scheduleLocalize();
  }

  function previewMarkup(kind) {
    if (kind === 'yield') return '<div class="integration-pending">Speak your area, expected yield per acre, and worker-days per tonne. The estimate uses your assumptions only.</div>';
    if (kind === 'kcc') return '<div class="integration-pending">Speak the principal and days outstanding for an illustrative simple-interest calculation. Confirm current terms with your bank.</div>';
    if (kind === 'irrigation') return '<div class="integration-pending">Speak target water in litres and pump flow in litres per minute. This is arithmetic only, not a crop-stage recommendation.</div>';
    if (kind === 'soil') return '<div class="integration-pending">Speak the N-P-K values or attach a soil-card image. OCR and nutrient recommendations are not connected.</div><label class="small-button">Attach soil card<input id="soilFile" type="file" accept="image/*,.pdf" hidden></label><div class="voice-help" id="soilFileStatus">File remains on this device; no OCR is performed.</div>';
    const feature = featureCatalog.find(item => item.id === dialog?.dataset.featureId);
    if (feature?.target) return `<div class="integration-pending">${feature.note || 'This workspace module is a sample workflow. Verify any decision with the relevant local authority.'}</div><a class="small-button dialog-action" href="${feature.target}">Open workspace page</a>`;
    return `<div class="integration-pending">${feature?.note || 'This workflow needs an external provider and verified local data before it can return reliable results.'}</div>`;
  }

  function openFeature(feature) {
    if (!dialog || !feature) return;
    dialog.dataset.featureId = feature.id;
    $('#featureStatus').textContent = feature.status;
    $('#featureTitle').textContent = feature.title;
    $('#featureDescription').textContent = feature.description;
    $('#featureStack').textContent = feature.stack;
    $('#featurePreview').innerHTML = previewMarkup(feature.preview || feature.id);
    dialog.showModal();
    refreshIcons();
    scheduleLocalize();
  }

  /* --------------------------------------------------------------- market */

  async function fetchLiveMarket(commodity) {
    try {
      const response = await fetch(`/api/mandi?commodity=${encodeURIComponent(commodity)}`);
      const result = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(result.rows) && result.rows.length) {
        liveMarket = { source: result.source || 'API', rows: result.rows, live: Boolean(result.live) };
        return liveMarket.rows;
      }
    } catch { /* fall back to sample */ }
    liveMarket = { source: 'Sample', rows: null, live: false };
    return marketData[commodity] || [];
  }

  async function renderMarket() {
    const commodity = $('#commodity');
    const rowsTarget = $('#marketRows');
    if (!commodity || !rowsTarget) return;
    rowsTarget.innerHTML = '<tr><td colspan="4">Loading prices…</td></tr>';
    const rows = await fetchLiveMarket(commodity.value);
    rowsTarget.innerHTML = rows.map(row => {
      const change = typeof row.change === 'number' ? `<td class="${row.change >= 0 ? 'trend-up' : 'trend-down'}">${row.change >= 0 ? '+' : ''}${row.change.toFixed(1)}%</td>` : '<td>—</td>';
      const arrivals = row.arrivals || '—';
      return `<tr><td><span class="crop-cell"><span class="crop-dot"></span>${row.mandi}</span></td><td>₹${Number(row.price).toLocaleString('en-IN')}<small> / qtl</small></td>${change}<td>${arrivals}</td></tr>`;
    }).join('');
    const badge = document.querySelector('.market-head .demo-badge') || document.querySelector('.demo-badge');
    if (badge) badge.textContent = liveMarket.live ? 'Live' : 'Sample rates';
    const foot = document.querySelector('.market-foot span');
    if (foot) foot.textContent = liveMarket.live ? `Source: ${liveMarket.source}. Verify with your APMC before selling.` : `Source: ${liveMarket.source}. Illustrative figures; not a live feed.`;
    scheduleLocalize();
  }

  /* ----------------------------------------------------------- calculator */

  function updateCalculator() {
    const areaInput = $('#area');
    const unitInput = $('#unit');
    const cropInput = $('#crop');
    const result = $('#calcResult');
    if (!areaInput || !unitInput || !cropInput || !result) return;
    const area = Math.max(0, Number(areaInput.value) || 0);
    const unit = unitInput.value;
    const crop = cropInput.value;
    const acres = area * (unit === 'gunta' ? 1 / 40 : unit === 'bigha' ? 0.625 : unit === 'cent' ? 1 / 100 : 1);
    const rates = cropRates[crop];
    const seed = acres * rates.seed;
    const bags = acres * rates.bags;
    const cost = Math.round(bags * rates.cost);
    const unitNote = unit === 'bigha' ? ' *Using a demo conversion of 1 bigha = 0.625 acre; local measures vary.' : '';
    result.innerHTML = `<strong>Estimate:</strong> about ${seed.toFixed(1)} kg seed · ${bags.toFixed(1)} fertilizer bags · ₹${cost.toLocaleString('en-IN')} input cost.${unitNote} Rates are placeholders; confirm crop, soil, and local recommendations.`;
    scheduleLocalize();
  }

  /* ---------------------------------------------------------- voice input */

  const translationCache = new Map();

  async function translateApi(text, targetLanguage) {
    if (!text || !targetLanguage || targetLanguage === 'en-IN') return text;
    const key = `${targetLanguage}\u0000${text}`;
    if (translationCache.has(key)) return translationCache.get(key);
    const response = await fetch('/api/translate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, targetLanguage })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.text) throw new Error(result.error || 'Translation API is unavailable.');
    translationCache.set(key, result.text);
    if (translationCache.size > 300) translationCache.clear();
    return result.text;
  }

  const uiTranslationCache = new Map();

  async function translateBatchApi(texts, targetLanguage) {
    if (targetLanguage === 'en-IN') return texts;
    const results = new Array(texts.length);
    const missing = [];
    texts.forEach((text, index) => {
      const key = `${targetLanguage}\u0000${text}`;
      if (uiTranslationCache.has(key)) results[index] = uiTranslationCache.get(key);
      else missing.push({ index, key, text });
    });
    if (!missing.length) return results;

    const response = await fetch('/api/translate-batch', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: missing.map(item => item.text), targetLanguage })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.translations)) throw new Error(payload.error || 'Translation API is unavailable.');
    missing.forEach((item, position) => {
      const translated = typeof payload.translations[position] === 'string' ? payload.translations[position] : item.text;
      results[item.index] = translated;
      uiTranslationCache.set(item.key, translated);
    });
    if (uiTranslationCache.size > 5000) uiTranslationCache.clear();
    return results;
  }

  /* Page-level text localisation: every visible label, heading and paragraph is
     translated into the selected Text language. Originals are cached per node so
     switching languages re-translates from English instead of double-translating. */
  const originalText = new WeakMap();
  const untranslatedSelector = 'script,style,noscript,select,option,optgroup,input,textarea,code,kbd,samp,[data-no-translate],.brand-name,.mobile-brand,.avatar';
  const letterPattern = /[A-Za-z\u0900-\u0DFF]/;
  let localizeSequence = 0;
  let localizeTimer = null;
  let localizeWarningShown = false;
  let originalDocumentTitle = '';

  function shouldTranslate(value) {
    const trimmed = String(value || '').trim();
    if (trimmed.length < 2 || !letterPattern.test(trimmed)) return false;
    return Boolean(trimmed.replace(/[\d\s₹$%+.,:;()/–—|-]/g, ''));
  }

  function collectTranslatableText(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(untranslatedSelector) || !shouldTranslate(node.nodeValue)) continue;
      nodes.push(node);
    }
    return nodes;
  }

  async function localizePage(language = textLanguageSelect?.value || 'en-IN') {
    const job = ++localizeSequence;
    document.documentElement.lang = language === 'hi-en' ? 'hi' : String(language).split('-')[0];
    const nodes = collectTranslatableText(document.body);
    if (!nodes.length) return;
    if (!originalDocumentTitle) originalDocumentTitle = document.title;

    const entries = nodes.map(node => {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      return { node, source: originalText.get(node) };
    });

    if (language === 'en-IN') {
      entries.forEach(({ node, source }) => { node.nodeValue = source; });
      if (originalDocumentTitle) document.title = originalDocumentTitle;
      return;
    }

    const unique = [...new Set([...entries.map(({ source }) => source.trim()), originalDocumentTitle].filter(Boolean))];
    const translations = new Map();
    for (let index = 0; index < unique.length; index += 40) {
      const chunk = unique.slice(index, index + 40);
      let results;
      try {
        results = await translateBatchApi(chunk, language);
      } catch {
        if (job !== localizeSequence) return;
        if (!localizeWarningShown) {
          localizeWarningShown = true;
          notify('Some page text could not be translated and stays in English.');
        }
        return;
      }
      if (job !== localizeSequence) return;
      chunk.forEach((source, position) => {
        const translated = results[position];
        if (typeof translated === 'string' && translated.trim() && translated.trim() !== source) translations.set(source, translated.trim());
      });
    }

    if (job !== localizeSequence) return;
    for (const { node, source } of entries) {
      const sourceText = source.trim();
      const translated = translations.get(sourceText);
      if (!translated) continue;
      const start = source.indexOf(sourceText);
      node.nodeValue = source.slice(0, start) + translated + source.slice(start + sourceText.length);
    }
    const translatedTitle = translations.get(originalDocumentTitle);
    if (translatedTitle) document.title = translatedTitle;
    localizeWarningShown = false;
  }

  function scheduleLocalize() {
    clearTimeout(localizeTimer);
    localizeTimer = setTimeout(() => localizePage(), 120);
  }

  async function refreshAnswerText() {
    const output = $('#analysisOutput');
    if (!output || !output.classList.contains('show')) return;
    const source = output.dataset.sourceText;
    if (!source) return;
    const target = textLanguageSelect?.value || 'en-IN';
    try {
      const localized = target === 'en-IN' ? source : await translateApi(source, target);
      const answer = $('#analysisText');
      if (answer) answer.textContent = localized;
      output.dataset.textLanguage = target;
    } catch { /* keep the previous answer visible */ }
  }

  async function speakLocalized(englishText, speechLanguage) {
    if (!speechLanguage || speechLanguage === 'en-IN') return speak(englishText, 'en-IN');
    try {
      const localized = await translateApi(englishText, speechLanguage);
      await speak(localized, speechLanguage);
    } catch {
      notify('Translation API is unavailable. Speaking English instead.');
      await speak(englishText, 'en-IN');
    }
  }

  let answerSequence = 0;

  function paintAnswer(title, text, source, textLanguage, spokenText, speechLanguage) {
    const output = $('#analysisOutput');
    if (!output) return;
    $('#analysisTitle').textContent = title;
    $('#analysisText').textContent = text;
    $('#analysisSource').textContent = source;
    output.dataset.textLanguage = textLanguage;
    output.dataset.spokenText = spokenText;
    output.dataset.speechLanguage = speechLanguage;
    output.classList.add('show');
    scheduleLocalize();
  }

  async function showVoiceAnswer(title, text, source = 'Rule-based preview · not a live data result', textLanguage = textLanguageSelect?.value || 'en-IN', spokenText = text, speechLanguage = languageSelect?.value || 'en-IN', alreadyLocalized = false) {
    const output = $('#analysisOutput');
    if (!output) return;
    output.dataset.sourceText = alreadyLocalized ? '' : text;
    const job = ++answerSequence;
    const targetText = textLanguage || 'en-IN';
    const targetSpeech = speechLanguage || 'en-IN';

    if (alreadyLocalized) {
      paintAnswer(title, text, source, targetText, spokenText, targetSpeech);
      if (recordStatus) recordStatus.textContent = `Answer · text ${targetText} · voice ${targetSpeech}`;
      await speak(spokenText, targetSpeech);
      return;
    }

    paintAnswer(title, `${textLanguageSelect?.selectedOptions?.[0]?.text || targetText} · …`, `${source} · preparing ${targetText} text and ${targetSpeech} voice…`, 'en-IN', text, targetSpeech);
    if (recordStatus) recordStatus.textContent = `Translating to ${targetText} text and ${targetSpeech} voice...`;
    try {
      const textPromise = targetText === 'en-IN' ? Promise.resolve(text) : translateApi(text, targetText);
      const spokenPromise = targetSpeech === 'en-IN' ? Promise.resolve(text) : targetSpeech === targetText ? textPromise : translateApi(text, targetSpeech);
      const [localizedText, localizedSpoken] = await Promise.all([textPromise, spokenPromise]);
      if (job !== answerSequence) return;
      paintAnswer(title, localizedText, `${source} · text ${targetText} · voice ${targetSpeech}`, targetText, localizedSpoken, targetSpeech);
      if (recordStatus) recordStatus.textContent = `Answer · text ${targetText} · voice ${targetSpeech}`;
      await speak(localizedSpoken, targetSpeech);
    } catch {
      if (job !== answerSequence) return;
      paintAnswer(title, text, `${source} · translation unavailable`, 'en-IN', text, 'en-IN');
      if (recordStatus) recordStatus.textContent = 'Answer · English fallback';
      notify('Translation API is unavailable. Showing and speaking English.');
      await speak(text, 'en-IN');
    }
  }

  function detectVoiceFeature(query) {
    const text = query.toLowerCase();
    const rules = [
      ['scribe', /bargain|deal|trade terms|agreement|record terms|buyer|seller|agreed|(?:price|₹|rupees?).{0,30}\bfor\s*\d+\s*(?:quintals?|qtl)\b/],
      ['mandi', /mandi|market|price|rate|chilli|ధర|మండి|मंडी|भाव|விலை/],
      ['climate', /weather|rain|humidity|spray|वर्षा|बारिश|వర్షం|மழை|ಮಳೆ/],
      ['kcc', /\bkcc\b|loan|interest|subvention|किसान क्रेडिट|వడ్డీ/],
      ['storage', /cold storage|warehouse|store crop|storage|గిడ్డంగి/],
      ['machinery', /tractor|harvester|machinery|hire|rent machine|ట్రాక్టర్/],
      ['soil', /soil health|soil card|npk|nitrogen|phosphorus|potassium|మట్టి కార్డు/],
      ['insurance', /insurance|subsidy|pm.?kisan|passbook|scheme|deadline|భీమా|बीमा/],
      ['irrigation', /irrigation|drip|pump|runtime|పంపు|సేద్యం/],
      ['yield', /yield|harvest|tonne|tonnage|worker|labou?r|उपज|దిగుబడి/],
      ['rotation', /rotation|next crop|nitrogen.?fix|తదుపరి పంట/],
      ['organic', /neem|jeevamrutha|organic pesticide|జీవామృతం|வேம்பு/],
      ['pest', /outbreak|pest alarm|pest risk|humidity pest/],
      ['inputs', /fertili[sz]er|seed|acre|gunta|bigha|cent|calculator|ఎకర|బస్తా/],
      ['plant', /cotton|paddy|rice|crop|leaf|leaves|pest|insect|red|spot|పత్తి|వరి|పంట|పురుగు|ఎర్ర|फसल|कीट/]
    ];
    for (const [id, pattern] of rules) {
      if (pattern.test(text)) return featureCatalog.find(feature => feature.id === id) || featureCatalog[0];
    }
    return null;
  }

  async function handleVoiceCommand(query, detectedLanguage) {
    if (!recordStatus) return;
    const text = query.trim().toLowerCase();
    if (!text) return;
    const feature = activeVoiceFeature
      ? featureCatalog.find(item => item.id === activeVoiceFeature)
      : detectVoiceFeature(text);
    activeVoiceFeature = null;
    const languageNote = detectedLanguage ? `Input: ${detectedLanguage}` : 'Spoken request';
    recordStatus.textContent = `Preparing ${textLanguageSelect.options[textLanguageSelect.selectedIndex].text} text and ${languageSelect.options[languageSelect.selectedIndex].text} voice...`;
    scheduleLocalize();
    try {
      const response = await fetch('/api/answer', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: query, feature: feature?.id || 'general', inputLanguage: detectedLanguage || 'unknown', textLanguage: textLanguageSelect.value, speechLanguage: languageSelect.value })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.answer) {
        showVoiceAnswer(feature?.title || 'Rythu AI', result.answer, `Evon v3.3 · text ${result.textLanguage} · voice ${result.speechLanguage}`, result.textLanguage, result.spokenText, result.speechLanguage, true);
        return;
      }
      if (response.status !== 503) notify(result.error || 'Local Evon could not answer this request.');
    } catch {
      notify('Local Evon is not reachable. Showing the available preview instead.');
    }
    if (!feature) {
      showVoiceAnswer('Rythu AI', `I heard: “${query}”. Say a tool name such as crop, mandi, weather, calculator, KCC, irrigation, or storage; then speak your details.`, `Voice request · ${languageNote}`);
      return;
    }
    if (feature.id === 'plant') {
      const isCotton = /cotton|పత్తి/.test(text);
      const isPaddy = /paddy|rice|వరి/.test(text);
      const isRed = /red|redd|bronze|ఎర్ర/.test(text);
      const isPest = /pest|insect|worm|hole|chew|bug|పురుగు/.test(text);
      const photoNote = $('#plantPhoto')?.files.length ? ' A photo is attached locally, but vision analysis is not connected.' : '';
      if (isCotton && isPest) {
        showVoiceAnswer('Plant doctor', `Do not spray yet. Check leaf undersides and cotton squares on several plants for eggs, larvae, and fresh feeding. The right treatment depends on the pest; share the crop age and what the insect looks like before choosing a product.${photoNote}`, `Rule-based preview · ${languageNote}`);
      } else if (isPaddy && isRed) {
        showVoiceAnswer('Plant doctor', `Red or bronze paddy leaves can have several causes, including nutrient or root stress. Note whether older leaves or whole patches are affected and check the field water level. Do not apply pesticide for red leaves alone; share the crop age and affected area with your KVK for a confirmed cause.${photoNote}`, `Rule-based preview · ${languageNote}`);
      } else {
        showVoiceAnswer('Plant doctor', `First identify the crop, crop age, when the symptom began, and whether it affects a few plants or a whole patch. Do not spray until the cause is confirmed.${photoNote}`, `Rule-based preview · ${languageNote}`);
      }
    } else if (feature.id === 'mandi') {
      const commodity = /\bcotton\b|పత్తి/.test(text) ? 'Cotton' : /\bpaddy\b|\brice\b|వరి/.test(text) ? 'Paddy' : /\bchilli\b|\bchili\b|మిర్చి/.test(text) ? 'Chilli' : null;
      if (!commodity) {
        showVoiceAnswer('Mandi watch', 'This sample price table covers chilli, cotton and paddy only. Say which of these crops you want to check. Rates are illustrative, not live.', `Sample data · ${languageNote}`);
        return;
      }
      if ($('#commodity')) { $('#commodity').value = commodity; renderMarket(); }
      const rows = marketData[commodity];
      showVoiceAnswer('Mandi watch', `Sample ${commodity} modal prices per quintal: Guntur ₹${rows[0].price.toLocaleString('en-IN')}, Warangal ₹${rows[1].price.toLocaleString('en-IN')}, Khammam ₹${rows[2].price.toLocaleString('en-IN')}. These are demo values, not live rates or a sell recommendation.`, `Sample data · ${languageNote}`);
    } else if (feature.id === 'climate') {
      const w = window.__liveWeather;
      if (w && typeof w.temperatureC === 'number') {
        const next = (w.forecast || []).map(f => `${f.condition} near ${Math.round(f.temperature)}°${f.rainChance != null ? ` (${f.rainChance}% rain)` : ''}`).join('; ');
        showVoiceAnswer('Village weather', `Live weather for ${w.location || currentLocation}: ${Math.round(w.temperatureC)}°C, ${w.condition || ''}, humidity ${w.humidityPct ?? 'n/a'}%, wind ${w.windKph ?? 'n/a'} km/h.${next ? ' Next: ' + next + '.' : ''} Source: ${w.source || 'Open-Meteo'}. Check conditions before spraying.`, `Live data · ${w.source || 'Open-Meteo'} · ${languageNote}`);
      } else {
        showVoiceAnswer('Village weather', `Weather for ${currentLocation} is loading or unavailable right now. Try again shortly or check a local forecast before spraying.`, `Live data unavailable · ${languageNote}`);
      }
    } else if (feature.id === 'inputs') {
      const measure = text.match(/(\d+(?:\.\d+)?)\s*(acres?|acre|guntas?|gunta|bighas?|bigha|cents?|cent)/i);
      const crop = /cotton|పత్తి/.test(text) ? 'cotton' : /chilli|chili|మిర్చి/.test(text) ? 'chilli' : 'paddy';
      if (!measure) {
        showVoiceAnswer('Crop calculator', 'Say your plot size, local unit, and crop, for example “two acres of paddy”. Estimates use placeholder rates; confirm local recommendations.', `Voice calculator · ${languageNote}`);
      } else if (!$('#area')) {
        showVoiceAnswer('Crop calculator', 'Open the Crop calculator page to see plot-size estimates, then speak your area there.', `Voice calculator · ${languageNote}`);
      } else {
        $('#area').value = measure[1];
        const spokenUnit = measure[2].toLowerCase();
        $('#unit').value = spokenUnit.startsWith('gunta') ? 'gunta' : spokenUnit.startsWith('bigha') ? 'bigha' : spokenUnit.startsWith('cent') ? 'cent' : 'acre';
        $('#crop').value = crop;
        updateCalculator();
        showVoiceAnswer('Crop calculator', $('#calcResult').innerText, `Assumption-based estimate · ${languageNote}`);
      }
    } else if (feature.id === 'yield') {
      const measure = text.match(/(\d+(?:\.\d+)?)\s*(acres?|acre|guntas?|gunta|bighas?|bigha|cents?|cent)/i);
      const yieldRate = text.match(/([\d,]+(?:\.\d+)?)\s*(?:kg|kilograms?)\s*(?:per|\/)\s*acre/i);
      const laborRate = text.match(/([\d.]+)\s*(?:worker.?days?|workers?)\s*(?:per|\/)\s*(?:tonne|ton)/i);
      if (!measure || !yieldRate) {
        showVoiceAnswer('Yield & labor estimate', 'Say your plot size and your expected yield per acre, for example “three acres, four thousand kilograms per acre”. Add worker-days per tonne for a labor estimate.', `Assumption-based estimate · ${languageNote}`);
      } else {
        const unit = measure[2].toLowerCase();
        const areaAcres = Number(measure[1]) * (unit.startsWith('gunta') ? 1 / 40 : unit.startsWith('bigha') ? 0.625 : unit.startsWith('cent') ? 1 / 100 : 1);
        const tonnes = areaAcres * Number(yieldRate[1].replace(/,/g, '')) / 1000;
        const laborText = laborRate ? ` About ${(tonnes * Number(laborRate[1])).toFixed(1)} worker-days using your labor assumption.` : ' Add worker-days per tonne if you want a labor estimate.';
        showVoiceAnswer('Yield & labor estimate', `Estimated yield: ${tonnes.toFixed(2)} tonnes from your area and yield assumptions.${laborText} This is not a crop forecast.`, `Assumption-based estimate · ${languageNote}`);
      }
    } else if (feature.id === 'kcc') {
      const amountMatch = text.match(/(?:₹|rupees?|rs\.?)\s*([\d,]+(?:\.\d+)?)|loan(?: amount| of)?\s*([\d,]+(?:\.\d+)?)/i);
      const lakhMatch = text.match(/([\d.]+)\s*lakh/i);
      const daysMatch = text.match(/([\d,]+)\s*days?/i);
      const principal = lakhMatch ? Number(lakhMatch[1]) * 100000 : amountMatch ? Number((amountMatch[1] || amountMatch[2]).replace(/,/g, '')) : 0;
      if (!principal || !daysMatch) {
        showVoiceAnswer('KCC interest estimate', 'Say the principal in rupees and the number of days outstanding. I can show an illustrative simple-interest calculation at 4%; confirm your actual KCC terms with your bank.', `Formula preview · ${languageNote}`);
      } else {
        const interest = principal * 0.04 * Number(daysMatch[1].replace(/,/g, '')) / 365;
        showVoiceAnswer('KCC interest estimate', `At 4% simple interest, the illustrative interest is ₹${interest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}. Actual subvention, eligibility and bank terms may differ.`, `Formula preview · ${languageNote}`);
      }
    } else if (feature.id === 'irrigation') {
      const volumeMatch = text.match(/([\d,]+)\s*(?:litres?|liters?)/i);
      const flowMatch = text.match(/([\d,.]+)\s*(?:litres?|liters?)\s*(?:per|\/)\s*(?:minute|min)/i);
      if (!volumeMatch || !flowMatch) {
        showVoiceAnswer('Drip irrigation runtime', 'Say the target water volume in litres and the pump flow in litres per minute. This estimates runtime only; confirm the target volume with local crop and soil guidance.', `Math preview · ${languageNote}`);
      } else {
        const minutes = Number(volumeMatch[1].replace(/,/g, '')) / Number(flowMatch[1].replace(/,/g, ''));
        showVoiceAnswer('Drip irrigation runtime', `Estimated pump runtime: ${Math.floor(minutes / 60)} hours and ${Math.round(minutes % 60)} minutes, using only the values you spoke.`, `Math preview · ${languageNote}`);
      }
    } else if (feature.id === 'insurance') {
      const fileName = $('#documentFile')?.files[0]?.name;
      const attachmentNote = fileName ? ` The file “${fileName}” is attached locally, but OCR is not connected.` : '';
      showVoiceAnswer('Insurance & subsidy checklist', `I can’t read or verify a circular yet. From the original notice, check the scheme name, last date, who is eligible, where to apply, and which land and bank records are required. Confirm the deadline with the issuing office before acting.${attachmentNote}`, `Checklist guidance · ${languageNote}`);
    } else if (feature.id === 'soil') {
      const values = text.match(/(?:n|nitrogen)[^\d]{0,12}(\d+(?:\.\d+)?)[\s\S]{0,60}?(?:p|phosphorus)[^\d]{0,12}(\d+(?:\.\d+)?)[\s\S]{0,60}?(?:k|potassium)[^\d]{0,12}(\d+(?:\.\d+)?)/i);
      if (values) {
        showVoiceAnswer('Soil card values', `I heard N ${values[1]}, P ${values[2]}, and K ${values[3]}. These are only the values you spoke back to me, not a fertilizer dose. Crop-specific soil rules and OCR are not connected; confirm recommendations with your soil lab or KVK.${$('#soilFile')?.files.length ? ' The attached image has not been analyzed.' : ''}`, `Read-back only · ${languageNote}`);
      } else {
        showVoiceAnswer('Soil health card', 'Read the N, P, and K values aloud with their units, for example “N 120, P 35, K 48 milligrams per kilogram”. I can repeat the values, but verified crop-specific doses are not connected.', `Voice read-back · ${languageNote}`);
      }
    } else if (feature.id === 'pest') {
      showVoiceAnswer('Pest prevention alert', 'I don’t have local humidity, temperature, radar, or outbreak records connected, so I can’t predict this week’s pest risk. Check your local KVK advisory and inspect the crop before applying any treatment.', `Regional data unavailable · ${languageNote}`);
    } else if (feature.id === 'organic') {
      showVoiceAnswer('Organic crop care', 'A verified recipe and crop-specific safety source are not connected, so I won’t guess a Jeevamrutha, Neem Astra, or Panchagavya mixture. Confirm preparation, dilution, crop suitability, and application timing with your local KVK before use.', `Verified guidance unavailable · ${languageNote}`);
    } else if (feature.id === 'machinery') {
      showVoiceAnswer('Machinery hiring', 'I can’t check availability or place a booking because no local hiring directory is connected. Ask your Custom Hiring Centre about the machine, village, date, hourly rate, transport charge, and operator availability.', `Directory unavailable · ${languageNote}`);
    } else if (feature.id === 'rotation') {
      showVoiceAnswer('Crop rotation planner', 'A rotation choice depends on your last crop, soil, water, season, and local pest pressure. A verified regional agronomy plan is not connected; ask your KVK before choosing the next crop.', `Agronomy data unavailable · ${languageNote}`);
    } else if (feature.id === 'scribe') {
      showVoiceAnswer('Trade terms draft', `Draft transcript: “${query}”. Confirm the buyer and seller, crop grade, quantity, unit price, total amount and payment date with both parties. This is not a verified agreement; the current transcription does not identify speakers.`, `Prisma transcript preview · ${languageNote}`);
    } else {
      const detail = feature.note || `${feature.description} This preview has no verified live data source for this tool.`;
      showVoiceAnswer(feature.title, detail, `Feature status · ${languageNote}`);
    }
  }

  /* ------------------------------------------------------- WAV conversion */

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeText = (offset, value) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
    writeText(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeText(8, 'WAVE');
    writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeText(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Uint8Array(buffer);
  }

  async function convertRecordingToWav(blob) {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const sampleRate = 16000;
      const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * sampleRate), sampleRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const mono = await offline.startRendering();
      return encodeWav(mono.getChannelData(0), sampleRate);
    } finally { await context.close(); }
  }

  function encodeBase64(bytes) {
    let binary = '';
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return btoa(binary);
  }

  let activeRecorder = null;
  let recordingTimer = null;

  function setRecording(active) {
    if (!recordButton) return;
    recordButton.classList.toggle('recording', active);
    recordButton.setAttribute('aria-label', active ? 'Stop voice input' : 'Start voice input');
    recordButton.title = active ? 'Stop recording' : 'Start voice input';
    recordButton.innerHTML = `<i data-lucide="${active ? 'square' : 'mic'}" width="17"></i>`;
    refreshIcons();
  }

  async function transcribeRecording(blob) {
    recordStatus.textContent = 'Preparing audio...';
    const wav = await convertRecordingToWav(blob);
    const model = $('#sttModel')?.value || 'prisma-v3.0';
    const languageCode = $('#sttLanguage')?.value || 'indic-auto';
    recordStatus.textContent = 'Transcribing with Prisma...';
    const response = await fetch('/api/stt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audioBase64: encodeBase64(wav), model, languageCode, format: 'transcribe' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw new Error(result.error?.message || result.error || result.message || `Prisma request failed (${response.status}).`);
    if (!result.transcript) { notify('No speech was detected. Try a short, clear recording.'); return; }
    if ($('#transcriptText')) $('#transcriptText').textContent = result.transcript;
    recordStatus.textContent = result.detected_language_code ? `Heard ${result.detected_language_code}` : 'Transcription complete';
    scheduleLocalize();
    handleVoiceCommand(result.transcript, result.detected_language_code);
  }

  if (recordButton) {
    recordButton.addEventListener('click', async () => {
      if (activeRecorder?.state === 'recording') { activeRecorder.stop(); clearTimeout(recordingTimer); return; }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { notify('Microphone recording is not supported in this browser.'); return; }
      if ($('#sttModel')?.value === 'prisma-v2.5' && $('#sttLanguage')?.value === 'indic-auto') { notify('Prisma v2.5 needs a specific spoken language.'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        const chunks = [];
        activeRecorder = new MediaRecorder(stream);
        activeRecorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
        activeRecorder.addEventListener('stop', async () => {
          stream.getTracks().forEach(track => track.stop());
          setRecording(false);
          try { await transcribeRecording(new Blob(chunks)); }
          catch (error) { recordStatus.textContent = 'Ready for a short clip'; notify(error.message || 'Prisma could not transcribe this clip.'); }
          finally { activeRecorder = null; }
        }, { once: true });
        activeRecorder.start();
        setRecording(true);
        recordStatus.textContent = 'Recording · up to 28 seconds';
        recordingTimer = setTimeout(() => { if (activeRecorder?.state === 'recording') activeRecorder.stop(); }, 28000);
      } catch { notify('Microphone permission is needed to record a crop question.'); }
    });
  }

  /* ------------------------------------------------------------- startup */

  renderMarket();
  updateCalculator();
  renderFeatureCatalog();
  refreshIcons();
  scheduleLocalize();

  const locationOptions = ['Guntur', 'Vijayawada', 'Visakhapatnam', 'Warangal', 'Khammam', 'Hyderabad', 'Bengaluru', 'Chennai', 'Delhi', 'Mumbai', 'Pune', 'Kolkata', 'Lucknow', 'Jaipur', 'Bhopal', 'Ahmedabad', 'Patna', 'Chandigarh'];
  let currentLocation = (() => { try { return localStorage.getItem('rythuLocation') || 'Guntur'; } catch { return 'Guntur'; } })();

  function updateLocationLabels(label) {
    $$('.location').forEach(el => {
      const icon = el.querySelector('i,svg');
      if (icon) { el.innerHTML = ''; el.appendChild(icon); el.append(` ${label}`); }
      else { el.textContent = label; }
    });
    $$('.profile small').forEach(el => { el.textContent = label; });
    refreshIcons();
  }

  async function loadLiveWeather() {
    try {
      const response = await fetch(`/api/weather?location=${encodeURIComponent(currentLocation)}`);
      const w = await response.json().catch(() => ({}));
      if (!response.ok || w.error) return;
      const label = w.location || currentLocation;
      updateLocationLabels(label);
      const temp = typeof w.temperatureC === 'number' ? `${Math.round(w.temperatureC)}°` : null;
      const condition = w.condition || '';
      const humidity = typeof w.humidityPct === 'number' ? `${w.humidityPct}% humidity` : '';
      const wind = typeof w.windKph === 'number' ? `${Math.round(w.windKph)} km/h wind` : '';
      const meta = [condition, humidity, wind].filter(Boolean).join(' · ');
      $$('.weather-inline strong').forEach(el => { if (temp) el.textContent = temp; });
      $$('.weather-inline span').forEach(el => { if (condition) el.textContent = condition; });
      const bannerTemp = document.querySelector('.condition-banner strong');
      const bannerMeta = document.querySelector('.condition-banner span');
      if (bannerTemp && temp) bannerTemp.textContent = temp;
      if (bannerMeta && meta) bannerMeta.textContent = meta;
      const badge = document.querySelector('#weather .badge, .condition .badge');
      if (badge) badge.textContent = `${label} · Live`;
      window.__liveWeather = w;
      scheduleLocalize();
    } catch { /* keep sample */ }
  }

  function initLocationControl() {
    const top = document.querySelector('.top-actions');
    if (!top) { loadLiveWeather(); return; }
    const wrap = document.createElement('label');
    wrap.className = 'language-control';
    wrap.innerHTML = `Location <select class="language" id="locationSelect" aria-label="Location"></select>`;
    const options = locationOptions.includes(currentLocation) ? locationOptions : [currentLocation, ...locationOptions];
    const sel = wrap.querySelector('select');
    sel.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
    sel.value = currentLocation;
    sel.addEventListener('change', () => {
      currentLocation = sel.value;
      try { localStorage.setItem('rythuLocation', currentLocation); } catch {}
      updateLocationLabels(currentLocation);
      loadLiveWeather();
    });
    top.appendChild(wrap);
    updateLocationLabels(currentLocation);
    loadLiveWeather();
  }

  initLocationControl();

  const requestedFeature = new URLSearchParams(location.search).get('feature');
  if (requestedFeature && featureCatalog.some(feature => feature.id === requestedFeature)) {
    activeVoiceFeature = requestedFeature;
  }

  fetch('/api/status').then(response => response.json()).then(status => {
    const state = $('#integrationState');
    const note = $('#integrationNote');
    if (state) state.textContent = status.evonConfigured ? 'Voice AI live' : status.gnaniConfigured ? 'Voice + translate' : 'Key needed';
    if (note) note.textContent = status.gnaniConfigured
      ? (status.evonConfigured ? 'Prisma, Timbre and local Evon are configured for separate text and voice languages.' : 'Prisma, Timbre and translation are live. Page text, answers and voice use the selected languages.')
      : 'Add VACHANA_API_KEY_ID to .env.local and restart the server to enable Gnani speech.';
    scheduleLocalize();
  }).catch(() => {
    const state = $('#integrationState');
    const note = $('#integrationNote');
    if (state) state.textContent = 'Server needed';
    if (note) note.textContent = 'Open this dashboard through server.mjs to use Gnani speech features.';
    scheduleLocalize();
  });

  textLanguageSelect?.addEventListener('change', () => {
    try { localStorage.setItem('rythuTextLanguage', textLanguageSelect.value); } catch { /* storage can be disabled */ }
    answerSequence += 1;
    scheduleLocalize();
    refreshAnswerText();
  });
  languageSelect?.addEventListener('change', () => {
    try { localStorage.setItem('rythuVoiceLanguage', languageSelect.value); } catch { /* storage can be disabled */ }
  });

  $('#commodity')?.addEventListener('change', renderMarket);
  ['area', 'unit', 'crop'].forEach(id => {
    const input = $(`#${id}`);
    if (!input) return;
    input.addEventListener('input', updateCalculator);
    input.addEventListener('change', updateCalculator);
  });

  $('#speakAdvice')?.addEventListener('click', async () => {
    const output = $('#analysisOutput');
    if (!output) return;
    const source = output.dataset.sourceText;
    const speechLanguage = languageSelect?.value || 'en-IN';
    if (source) {
      try {
        const text = speechLanguage === 'en-IN' ? source : await translateApi(source, speechLanguage);
        output.dataset.spokenText = text;
        output.dataset.speechLanguage = speechLanguage;
        await speak(text, speechLanguage);
        return;
      } catch { /* fall back to the previously prepared speech */ }
    }
    speak(output.dataset.spokenText || $('#analysisText').textContent, output.dataset.speechLanguage || 'en-IN');
  });

  $('#speakBrief')?.addEventListener('click', () => {
    const w = window.__liveWeather;
    if (w && typeof w.temperatureC === 'number') {
      const next = (w.forecast || []).map(f => `${f.condition} around ${Math.round(f.temperature)} degrees`).join(', ');
      const msg = `Current weather in ${w.location || currentLocation}: ${Math.round(w.temperatureC)} degrees, ${w.condition || ''}, humidity ${w.humidityPct ?? 'unknown'} percent.${next ? ' Upcoming: ' + next + '.' : ''} Data from ${w.source || 'Open-Meteo'}.`;
      return speakLocalized(msg, languageSelect?.value || 'en-IN');
    }
    speakLocalized(`Weather for ${currentLocation} is not available right now. Please check a local forecast before spraying.`, languageSelect?.value || 'en-IN');
  });

  $('#speakDocuments')?.addEventListener('click', () => speakLocalized('Checklist: confirm the scheme name and issuing office, the last date to apply, who is eligible, the required land and bank documents, where to submit, and the premium or subsidy amount. This demo does not read your uploaded notice.', languageSelect?.value || 'en-IN'));

  $('#speakEstimate')?.addEventListener('click', () => {
    const estimate = $('#calcResult')?.innerText?.trim();
    if (estimate) speakLocalized(estimate, languageSelect?.value || 'en-IN');
  });

  $('#speakMarket')?.addEventListener('click', async () => {
    const commodity = $('#commodity');
    if (!commodity) return;
    const crop = commodity.value;
    const rows = liveMarket.rows || marketData[crop] || [];
    const parts = rows.slice(0, 3).map(r => `${r.mandi} rupees ${Number(r.price).toLocaleString('en-IN')} per quintal`).join(', ');
    const note = liveMarket.live ? `Live ${crop} prices: ${parts}. Source ${liveMarket.source}. Verify with APMC before selling.` : `Sample ${crop} prices today: ${parts}. These are illustrative demo rates, not live market data.`;
    speakLocalized(note, languageSelect?.value || 'en-IN');
  });

  $('#helpButton')?.addEventListener('click', () => notify('Prisma transcribes any supported language. Answers are translated into your text language, and Timbre speaks the voice language through the API.'));

  $('#plantPhoto')?.addEventListener('change', event => {
    if (event.target.files[0]) {
      $('#plantPhotoName').textContent = event.target.files[0].name;
      $('#plantPhotoStatus').textContent = 'Photo selected locally. Vision analysis is not connected.';
    }
  });

  $('#documentFile')?.addEventListener('change', event => {
    if (event.target.files[0]) $('#documentFileStatus').textContent = `${event.target.files[0].name} selected locally. OCR is not connected.`;
  });

  $('#featureGrid')?.addEventListener('click', event => {
    const card = event.target.closest('[data-feature-id]');
    if (card) openFeature(featureCatalog.find(feature => feature.id === card.dataset.featureId));
  });

  $('#closeFeatureDialog')?.addEventListener('click', () => dialog?.close());

  $('#dialogVoiceButton')?.addEventListener('click', () => {
    const featureId = dialog?.dataset.featureId;
    if (!featureId) return;
    if (recordButton) {
      activeVoiceFeature = featureId;
      dialog.close();
      recordButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      recordButton.click();
      return;
    }
    sessionStorage.setItem('rythuPendingVoice', featureId);
    location.href = `plant-doctor.html?feature=${encodeURIComponent(featureId)}`;
  });

  $('#featurePreview')?.addEventListener('click', event => {
    const action = event.target.closest('.dialog-action');
    if (!action) return;
    const href = action.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    event.preventDefault();
    const destination = $(href);
    dialog?.close();
    destination?.scrollIntoView({ behavior: 'smooth' });
  });

  $('#featurePreview')?.addEventListener('change', event => {
    if (event.target.id === 'soilFile' && event.target.files[0]) {
      $('#soilFileStatus').textContent = `${event.target.files[0].name} selected locally. OCR is not connected.`;
    }
  });

  $('#sttModel')?.addEventListener('change', () => {
    const model = $('#sttModel').value;
    const languageCode = $('#sttLanguage');
    if (model === 'prisma-v2.5' && (languageCode.value === 'indic-auto' || languageCode.value.includes(','))) {
      languageCode.value = languageCode.value === 'indic-auto'
        ? (languageSelect.value === 'hi-en' ? 'hi-IN' : languageSelect.value)
        : languageCode.value.split(',')[0];
    }
    Array.from(languageCode.options).forEach(option => {
      option.disabled = model === 'prisma-v2.5' && (option.value === 'indic-auto' || option.value.includes(','));
    });
  });

  $('#sttLanguage')?.addEventListener('change', event => {
    if ((event.target.value === 'indic-auto' || event.target.value.includes(',')) && $('#sttModel')?.value === 'prisma-v2.5') {
      $('#sttModel').value = 'prisma-v3.0';
      $('#sttModel').dispatchEvent(new Event('change'));
    }
  });

  $('#featureDialog')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });

  // A feature chosen from another page is queued and announced here.
  if (recordButton) {
    const pendingFeature = requestedFeature || sessionStorage.getItem('rythuPendingVoice');
    if (pendingFeature) {
      const feature = featureCatalog.find(item => item.id === pendingFeature);
      if (feature) {
        activeVoiceFeature = feature.id;
        recordStatus.textContent = `Ready · ${feature.title}`;
        notify(`Voice mode ready: ${feature.title}. Tap the microphone and speak.`);
        sessionStorage.removeItem('rythuPendingVoice');
      }
    }
  }
})();
