# hushday

Useful sound without managing your life around an app. Pick a **Mix**, choose how long to stay in it (a **Zone**), or hit a short **Shot**. Make your own Mix and find out whether anyone has made the same thing before.

## Model

| Concept | What it is | Where |
| --- | --- | --- |
| Mix | The audio package: sound blocks (brown, red, pink, white, 432 Hz and 528 Hz tones, fan, rain, ocean, wind, stream, fire, night, focus audio, quiet) on track rows over time. Blocks that overlap play together | `src/core/types.ts` |
| Zone | A session that runs a Mix for 30m / 1h / 2h / 3h / until stopped. Loops or holds the Mix internally; cycles are never shown | `src/state/playback.ts`, `api/zones.ts` |
| ShortExperience | The instant format, currently branded "Shot". Rename via `SHORT_FORMAT_NAME` in `src/core/catalog.ts` | `src/core/catalog.ts` |
| Discovery | Each saved Mix is normalised into a fingerprint. First person to reach it gets FIRST DISCOVERY, later people get #N | `src/core/fingerprint.ts`, `server/mixes.ts` |
| Emblem | Each Mix draws a circular identity from its sounds; the fingerprint seeds its outline, so the same Mix always looks the same | `src/viz/blend.ts` |
| Share code | A whole Mix packed into a `#/s/<code>` link, so anyone can play or remix it without an account | `src/core/share.ts` |

The editor (`src/screens/create/`) is a block arranger: drag sounds from the palette onto tracks, move and resize blocks, and drop one block onto another to braid them together on the same track (`src/viz/weave.ts`); dragging one back out pulls them apart. `GET /api/discovery?c=<canonical>` returns how many people already found a Mix, so the editor can say "you'd be the Nth" before saving. Likes, downloads and rank are laid out in `MixStats` but not wired yet.

`src/core` is platform-independent (no DOM or Node APIs) so the same rules run in the browser, the API and a future native app.

### Fingerprint v1

A Mix reduces to: repeat mode, length bucket (≤15 / ≤35 / ≤70 / longer minutes), and, for each component, sound + placement (whole Mix, or early/mid/late × brief/part/most) + intensity bucket (low/medium/high) + slow entry. Layer order, names, exact seconds and small slider moves don't matter. Bump `FINGERPRINT_VERSION` when the rules change; families record the version they were created under.

## Stack

- Vite + React + TypeScript PWA. Audio is synthesised live in an AudioWorklet (`public/hush-gen.worklet.js`), with every gain change pre-scheduled on the audio clock so backgrounded tabs stay accurate and pause is just suspending the context.
- Vercel Functions in `api/` (Web-standard handlers) with Neon Postgres via the Vercel Marketplace. Schema is created on first request (`server/db.ts`).
- Anonymous device accounts (`api/session.ts`); usage events batched to `api/events.ts`. Server-side events cover fingerprints, discovery numbers, and Mix create/edit/delete/save.

## Run

```sh
npm install
npm run dev      # app + /api on http://localhost:5173
npm test         # core rules: fingerprint, timeline, validation
npm run build    # typecheck + production build
```

The dev server serves `api/` too. Discovery numbers need `DATABASE_URL` in `.env.local`. Vercel marks the Neon variables as secret, so `vercel env pull` writes placeholders. Copy the connection string from the Neon dashboard (Vercel → Storage → hushday-db) into `.env.local`. Without it, the app runs offline-first: Mixes save locally and get their number when the API is reachable.

## Deploy

```sh
vercel deploy          # preview
vercel deploy --prod   # production
```

Preview and Production currently share the same `hushday-db` database.

## Limits

- Web background audio: plays with the tab in the background and exposes lock-screen controls; iOS may still stop audio when locked on some versions. A native wrapper is the path to guaranteed background playback.
- Accounts are per device until real sign-in is added (Neon Auth is provisioned alongside the database).
