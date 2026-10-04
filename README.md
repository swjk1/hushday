# hushday

Useful sound without managing your life around an app. Pick a **Mix**, choose how long to stay in it (a **Zone**), or hit a short **Shot**. Make your own Mix and find out whether anyone has made the same thing before.

## Model

| Concept | What it is | Where |
| --- | --- | --- |
| Mix | The audio package: sound blocks (brown, red, pink, white, 432 Hz and 528 Hz tones, fan, rain, ocean, wind, stream, fire, night, seagulls, focus audio, zen, quiet) on track rows over time. Blocks that overlap play together | `src/core/types.ts` |
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

## Recordings

All seven nature sounds play real recordings: public domain, CC0, or CC BY 4.0. The CC BY recordings are credited in the app, on the Sounds page, with their licence and what was changed. Everything else is synthesised. The loops live in `public/sounds/`. Each is the original recording, untouched apart from choosing a stretch, cutting out stray sounds where noted, crossfading the end into the start, and one fixed volume change. Each file wraps half a second of its own loop onto both edges, so the loop points in `src/core/sounds.ts` stay seamless if an MP3 decoder shifts timing slightly.

| Sound | Version | Recording | By | Licence |
| --- | --- | --- | --- | --- |
| Rain | Original | [Rain falling on a canopy, Halenfeld, Germany](https://archive.org/details/aporee_23977_27849) | Matthes via Radio Aporee | Public Domain Mark |
| Rain | B | [Heavy rain, Egå, Denmark](https://archive.org/details/aporee_58354_66946) | audiotraction via Radio Aporee | Public Domain Mark |
| Ocean | Original | [Ocean Waves](https://freesound.org/s/531015/) | Noted451 via Freesound | CC0 1.0 |
| Ocean | B | [Close waves, Klong Muang beach, Thailand](https://archive.org/details/aporee_47950_54511) | Felix Blume via Radio Aporee | Public Domain Mark |
| Wind | Original | [Autumn wind and dry leaves](https://freesound.org/s/457318/) | Stek59 via Freesound | CC0 1.0 |
| Wind | B | [Wind on a grove of reeds, Copenhagen](https://archive.org/details/aporee_14720_17165) | Alessandro Altavilla via Radio Aporee | Public Domain Mark |
| Wind | C | [In the wood very windy, Sälsten, Sweden](https://archive.org/details/aporee_51051_58278) | a Radio Aporee recordist | Public Domain Mark |
| Wind | D | [Lower Geyser Basin (Strong Wind), Yellowstone](https://archive.org/details/nps-yell-sounds-soundscapes) | NPS/Peter Comley | Public Domain Mark |
| Wind | E | [Howling Wind, Troon, Cornwall](https://archive.org/details/aporee_30717_35328) | djake via Radio Aporee | Public Domain Mark |
| Stream | Original | [Stream River Water Up Close (a man talking and a passing hum cut out)](https://freesound.org/s/433589/) | jackthemurray via Freesound | CC0 1.0 |
| Stream | B | [Creek, Boulder, Colorado](https://archive.org/details/aporee_16764_19506) | daytondaft via Radio Aporee | Public Domain Mark |
| Stream | C | [Stream Krčnik, Slovenia](https://archive.org/details/aporee_50749_57876) | Bojan Marusic via Radio Aporee | Public Domain Mark |
| Stream | D | [Brook among thawing snow, Alytus, Lithuania](https://archive.org/details/aporee_71794_83851) | Martynas Baranauskas via Radio Aporee | Public Domain Mark |
| Fire | Original | [chimney fire](https://freesound.org/s/18766/) | reinsamba via Freesound | CC BY 4.0 |
| Fire | B | [Fireplace](https://archive.org/details/FireFavorite) | inchadney | CC0 1.0 |
| Night | Original | [Crickets in the night, Laos (one brief call cut out)](https://freesound.org/s/221164/) | caquet via Freesound | CC BY 4.0 |
| Night | B | [Nighttime crickets, Les Cluses, France](https://archive.org/details/aporee_70514_82218) | Jillis Molenaar via Radio Aporee | Public Domain Mark |
| Seagulls | Original | [seagulls, Scheveningen, the Netherlands](https://freesound.org/s/144835/) | Eelke via Freesound | CC BY 4.0 |

## Scenario images

The "Good for" photos in `public/scenes/` are all CC0 or public domain, found through [Openverse](https://openverse.org) and cropped to 16:9.

| Scenario | Photo | By | Licence |
| --- | --- | --- | --- |
| Late-night studying | [Office Work](https://stocksnap.io/photo/office-work-N0ZRKV9CI6) | Lee Campbell | CC0 1.0 |
| Deep work | [Top Workspace](https://stocksnap.io/photo/top-workspace-MY9TVNEESX) | Top Down Tech | CC0 1.0 |
| A study sprint | [Notebook Paper](https://stocksnap.io/photo/notebook-paper-JLXDNN5BNE) | Angelina Litvin | CC0 1.0 |
| Reading | [Free flat lay reading book](https://www.rawpixel.com/image/5923409/photo-image-book-public-domain-black) | Unknown | CC0 1.0 |
| Falling asleep | [Pillows Sheets](https://stocksnap.io/photo/pillows-sheets-M0YZ9Q79DZ) | Jay Mantri | CC0 1.0 |
| A power nap | [Hammock Relax](https://stocksnap.io/photo/hammock-relax-DSSPYT64JZ) | Freestocks.org | CC0 1.0 |
| Settling a baby | [Untitled](https://www.rawpixel.com/image/6051660/free-public-domain-cc0-photo) | Unknown | CC0 1.0 |
| Meditation | [Balancing stones beach](https://www.rawpixel.com/image/6034388/photo-image-wallpaper-public-domain-beach) | Unknown | CC0 1.0 |
| Slow breathing | [A branch](https://www.flickr.com/photos/189681306@N02/53591589188) | Ted Moravec | CC0 1.0 |
| Winding down after work | [Teacup Teacups](https://stocksnap.io/photo/teacup-teacups-TTOEJQHHZ1) | Suzy Hazelwood | CC0 1.0 |
| A cozy evening in | [fireplace](https://www.flickr.com/photos/47121680@N00/52533388780) | joncutrer | CC0 1.0 |
| A rainy day indoors | [A view through a rain-speckled window, showing droplets of water collecting on the glass.](https://wordpress.org/photos/photo/61362bda1d/) | nidhidhandhukiya | CC0 1.0 |
| A summer night | [Starry sky background](https://www.rawpixel.com/image/6034023/photo-image-background-aesthetic-public-domain) | Unknown | CC0 1.0 |
| A day by the sea | ['Grand designs' Pegasus bay.](https://www.flickr.com/photos/88123769@N02/51501276311) | Bernard Spragg | Public Domain Mark |
| A slow morning | [Cafe Window](https://stocksnap.io/photo/cafe-window-NDIQFBYIHR) | Burst | CC0 1.0 |
| Writing and creative work | [Journal Notepad](https://stocksnap.io/photo/journal-notepad-DPKNIIN5X3) | Cathryn Lavery | CC0 1.0 |
| Blocking out a noisy room | [Koss headphones](https://www.flickr.com/photos/57866029@N00/52459692877) | Abdulla Al Muhairi | CC0 1.0 |
| Travel and commuting | [Munich Hauptbahnhof](https://www.flickr.com/photos/15802578@N00/51707662507) | wwward0 | CC0 1.0 |

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
