# Rythu AI

A voice-first farmer support prototype built with Gnani AI Speech APIs. Farmers speak requests; answers appear as text and are spoken aloud. Text-response and spoken-response languages can be selected independently. The server translates the visible page text and rule-based answers into every supported language before Timbre speaks them. Plant, insurance and soil flows also accept optional local image attachments, but image analysis is not connected.

## Farmer Features

1. Voice-Activated Plant Doctor
2. Multi-Mandi Live Price & Hold/Sell Advisor
3. Paper-to-Action Crop Insurance & Subsidy Reader
4. Hyper-Local Micro-Climate & Irrigation Voice Alerts
5. Voice-Powered Fertilizer & Seed Calculator
6. Soil Health Card Nutrient Interpreter
7. Voice Pest Prevention Outbreak Alarm
8. Precision Financial & Loan Subsidy Calculator
9. Voice Organic Pesticide Recipe & Guidance
10. Dual-Party Audio Trade & Bargaining Scribe

## Gnani AI Stack

- **Prisma v3.0 REST** transcribes short recordings with `indic-auto` language detection. Prisma v2.5 is also selectable for a specified language.
- **Speech locales:** Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Punjabi, Tamil and Telugu. Prisma v3.0 also accepts up to four comma-separated language hints; the UI includes Indic-English pairs.
- **Timbre v3.0 REST** reads responses aloud in the selected language using the universal voice catalog. Hinglish speech uses Timbre's documented `auto` language mode.
- **Server-side translation** in `lib/translate.mjs` converts the visible page text and the English rule-based answer into the selected text language and (separately) the selected voice language before display and synthesis. It uses the Google Translate web endpoint first and MyMemory as a fallback. Results are cached in memory per server instance. If both providers fail, the app clearly falls back to English.
- The **Text** selector is remembered across pages, so navigation keeps the same visible language. Changing it re-translates headings, labels, checklists, tables, calculator output and the current answer text.
- **Evon v3.3** generates separate text and spoken translations when its requested weights are running behind an OpenAI-compatible inference endpoint. Its response must contain JSON string fields `text` and `spokenText`. Locally, use a loopback URL in `.env.local`; on Vercel, use an HTTPS endpoint you manage. No additional API key is used by this project.
- The Vachana API key stays on the server in `.env.local` as `VACHANA_API_KEY_ID` and is never sent to the browser.
- **Evon weights are not installed by default.** Request the official weights and run a local inference server before expecting model-generated answers. Without Evon, the translated rule-based answers still support every text and voice language.
- Agent Builder is not used.

## Run Locally

1. Set `VACHANA_API_KEY_ID` in `.env.local`.
2. Start the server with `node server.mjs`.
3. Open `http://127.0.0.1:8000`.

Translation needs outbound internet access to Google Translate (with MyMemory as fallback) but does not use the Vachana key. If both providers are unreachable, answers are shown and spoken in English.

## Deploy to Vercel

1. Import `Pavan2207/rythu-ai` from GitHub.
2. Use Framework Preset **Other**, Root Directory `./`, Build Command blank, Install Command blank, and Output Directory `.`. `vercel.json` sets these defaults.
3. In Project Settings → Environment Variables, add `VACHANA_API_KEY_ID` as a Secret for Production and Preview. Add Development only if using `vercel dev`.
4. Use a rotated key. Do not paste the contents of `.env.local` or `.env.example` into Vercel; the example includes a local-only Evon URL.
5. Deploy. Changes to Vercel environment variables require a new deployment.

Optional cross-language Evon responses need self-hosted weights behind an HTTPS endpoint reachable from Vercel. Do not use `127.0.0.1` for the deployed project; that address would refer to the Vercel function itself.

## Pages

The dashboard is split into six static pages. All pages share `styles.css` and `app.js`, and each page only binds the controls it contains.

- `index.html` — overview, daily brief, market snapshot, weather and workspace shortcuts.
- `plant-doctor.html` — voice field assistant, Prisma model/language controls, photo attachment and spoken answers.
- `mandi.html` — sample mandi table, commodity switcher and read-aloud rates.
- `documents.html` — paper-to-action checklist and optional local notice attachment.
- `calculator.html` — seed, fertilizer and input-cost estimate with visible plot-size form.
- `tools.html` — the ten-tool catalog with integration-status dialogs.

## Project Files

- `index.html`, `plant-doctor.html`, `mandi.html`, `documents.html`, `calculator.html`, `tools.html` — the six dashboard pages.
- `styles.css` — shared dashboard layout, cards and responsive rules.
- `app.js` — shared voice recording, transcription, Timbre playback, market, calculator and feature-catalog logic.
- `server.mjs` — local web server and server-side Gnani Speech/Evon proxies.
- `api/*.mjs` — Vercel serverless endpoints for Gnani Speech, translation and optional Evon.
- `lib/gnani-api.mjs` — shared Web-standard request handlers used by Vercel functions.
- `lib/translate.mjs` — cached server-side translation with Google Translate and MyMemory fallback, including batched UI-string translation.
- `vercel.json` — no-build static-site and function configuration.
- `.env.example` — variable names for the Vachana key and optional local Evon endpoint.
- `.env.local` — private local configuration; ignored by Git and never served by the app.
- `README.md` — setup instructions, feature list and integration limits.

## Real Data APIs

- **Weather:** Live current conditions and short forecast from [Open-Meteo](https://open-meteo.com/) via `/api/weather?location=guntur` (no API key required).
- **Mandi prices:** `/api/mandi?commodity=Chilli|Cotton|Paddy` returns live Agmarknet records from [data.gov.in](https://data.gov.in/) when `DATA_GOV_API_KEY` is set; otherwise it falls back to clearly labeled sample rates.

## Demo Boundaries

- Without local Evon, Plant Doctor examples are rule-based triage, not Gnani-generated diagnosis or pesticide prescriptions. They are translated for display and speech but do not become new medical advice.
- Mandi prices are live only when `DATA_GOV_API_KEY` is configured and records are available; otherwise the UI shows labeled sample rates.
- Document and soil uploads are not processed or sent to an OCR service.
- Yield, loan-interest, and irrigation calculations use entered assumptions only.
- OCR, machinery, storage, and AI generation APIs are not connected (beyond optional self-hosted Evon). Translation uses the Google Translate web endpoint with MyMemory as fallback; if both are unavailable, answers fall back to English.
- Voice requests use Prisma for transcription and Timbre for speech in every supported language. Text and spoken answers can use different languages through server-side translation, and the UI labels translated fallback answers.

Verify agricultural, financial, weather, and government-scheme decisions with official local sources.
