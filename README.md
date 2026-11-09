# Rythu AI

A voice-first farmer support prototype built with Gnani AI Speech APIs. Farmers speak requests; answers appear as text and can be spoken aloud. Text-response and spoken-response languages can be selected independently. Plant, insurance and soil flows also accept optional local image attachments, but image analysis is not connected.

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
- **Evon v3.3** generates separate text and spoken translations when its requested weights are running behind an OpenAI-compatible inference endpoint. Its response must contain JSON string fields `text` and `spokenText`. Locally, use a loopback URL in `.env.local`; on Vercel, use an HTTPS endpoint you manage. No additional API key is used by this project.
- The Vachana API key stays on the server in `.env.local` as `VACHANA_API_KEY_ID` and is never sent to the browser.
- **Evon weights are not installed by default.** Request the official weights and run a local inference server before expecting model-generated, translated answers or non-English voice output.
- Agent Builder is not used.

## Run Locally

1. Set `VACHANA_API_KEY_ID` in `.env.local`.
2. Start the server with `node server.mjs`.
3. Open `http://127.0.0.1:8000`.

## Deploy to Vercel

1. Import `Pavan2207/rythu-ai` from GitHub.
2. Use Framework Preset **Other**, Root Directory `./`, Build Command blank, Install Command blank, and Output Directory `.`. `vercel.json` sets these defaults.
3. In Project Settings → Environment Variables, add `VACHANA_API_KEY_ID` as a Secret for Production and Preview. Add Development only if using `vercel dev`.
4. Use a rotated key. Do not paste the contents of `.env.local` or `.env.example` into Vercel; the example includes a local-only Evon URL.
5. Deploy. Changes to Vercel environment variables require a new deployment.

Optional cross-language Evon responses need self-hosted weights behind an HTTPS endpoint reachable from Vercel. Do not use `127.0.0.1` for the deployed project; that address would refer to the Vercel function itself.

## Project Files

- `index.html` — farmer dashboard, voice controls and feature catalog.
- `server.mjs` — local web server and server-side Gnani Speech/Evon proxies.
- `api/*.mjs` — Vercel serverless endpoints for Gnani Speech and optional Evon.
- `lib/gnani-api.mjs` — shared Web-standard request handlers used by Vercel functions.
- `vercel.json` — no-build static-site and function configuration.
- `.env.example` — variable names for the Vachana key and optional local Evon endpoint.
- `.env.local` — private local configuration; ignored by Git and never served by the app.
- `README.md` — setup instructions, feature list and integration limits.

## Demo Boundaries

- Without local Evon, Plant Doctor examples are rule-based English triage, not Gnani-generated diagnosis or pesticide prescriptions.
- Mandi prices are sample data; weather is illustrative.
- Document and soil uploads are not processed or sent to an OCR service.
- Yield, loan-interest, and irrigation calculations use entered assumptions only.
- No APMC, weather, OCR, machinery, storage, or external AI APIs are connected.
- Without the local Evon runtime, voice requests use English rule-based/demo responses. The interface will not mislabel these as translated output.

Verify agricultural, financial, weather, and government-scheme decisions with official local sources.
