# hushday

A responsive web prototype for personal sound zones. Turn on Focus, Reset, Wind-down, or Sleep for a temporary window. The app waits for a chosen interval, plays your custom sound cycle, then either rests and repeats or stays quiet until the zone ends. Turn a zone off at any time.

Each saved zone has a duration, first-cycle delay, optional repeat gap, volume, and an ordered cycle. Each stage has its own sound, length, and transition fade. Brown, pink, and white noise, rain, ocean, and tones are generated with the Web Audio API. You can also import local audio files and use them in a cycle. Saved routines from the earlier schedule-based prototype are converted into zone templates on first load.

## Run

Requires Node.js. From this folder:

```sh
npm run start
```

Open <http://localhost:5173>. On PowerShell systems that block `npm.ps1`, use `npm.cmd run start`.

## Prototype limits

Starting a zone enables audio for the current page. Cycles run while the page stays open and the browser permits audio; a closed tab or locked phone cannot provide reliable automatic playback. That needs a native mobile app with platform background audio support. Music from another app may mix depending on the device, but this prototype does not control Spotify or Apple Music. Imported files, zones, tuning choices, and listening history stay in this browser. The patterns page summarizes choices; it does not yet adapt cycles automatically.
