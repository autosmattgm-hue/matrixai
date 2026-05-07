# Matrix Voice OS

Matrix is a cinematic, voice-first AI shell built around `AI-head.png`. It combines:

- a secure Express backend for NVIDIA NIM integration
- a holographic single-page frontend with Tailwind, GSAP, and Three.js
- Web Speech API wake-word listening, speech synthesis, and local context memory
- a native launch starter pack for Android Assistant and iPhone Siri handoff in `native/`

## Deploy to Vercel

This project is prepared for Vercel with:

- a root `server.js` Express entrypoint exported for Vercel's Node runtime
- static assets served from `public/`
- `vercel.json` configured with `cleanUrls`

### Environment variables

Add these in your Vercel project settings:

- `NVIDIA_API_KEY`
- `NVIDIA_MODEL`
- `NVIDIA_INVOKE_URL`
- `MATRIX_MAX_TOKENS`
- `MATRIX_TEMPERATURE`
- `MATRIX_TOP_P`

You can keep the defaults from `.env.example` for every variable except `NVIDIA_API_KEY`.

### Vercel steps

1. Push this project to GitHub, GitLab, or Bitbucket.
2. Import the repository into Vercel.
3. Add the environment variables from `.env.example`.
4. Deploy.

You can also deploy with the Vercel CLI:

```bash
npm i -g vercel
vercel
vercel --prod
```

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and add your `NVIDIA_API_KEY`.

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Voice flow

- Idle mode continuously waits for `Hey Matrix`, `Matrix`, or `Omega`.
- After activation, speech recognition captures the command in real time.
- Matrix routes simple local commands instantly and sends deeper requests to `/api/matrix/respond`.
- The backend forwards conversation history to NVIDIA's chat completions endpoint and returns the assistant reply to the voice shell.

## Native Phone Launch

The web app now supports native handoff query parameters so a real Android or iPhone wrapper can launch Matrix directly into:

- home: `/?matrix_source=native`
- listening: `/?matrix_source=native&matrix_intent=listen&matrix_listen=1`
- settings: `/?matrix_source=native&matrix_route=settings`

Starter files for that layer are included in:

- `native/android/`
- `native/ios/`

## Notes

- For security, the NVIDIA API key stays server-side and is never exposed to the browser.
- If no API key is configured, Matrix still runs in graceful fallback mode with local commands and voice UX intact.
- NVIDIA chat completions do not provide the same built-in live web search path that the previous OpenAI version used, so truly current answers need a separate search integration if you want them.
- Browser support is best in Chromium-based browsers because `webkitSpeechRecognition` is still vendor-specific.
- A web app cannot wake itself from a fully closed background state on iPhone or Android. That requires the native layer scaffolded in `native/`.
