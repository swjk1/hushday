// Measures every version of every sound the way the app plays it, for Auto-Blend's data table.
//
//   node scripts/blend-lab/measure.mjs            writes src/core/blend-data-v3.ts
//   node scripts/blend-lab/measure.mjs --clips    also keeps 20 s clips in scripts/blend-lab/.cache for batch checks
//
// Needs ffmpeg on the PATH (to decode the recorded loops). Each version is rendered at its default level
// with its calibration gain, through the same 25 Hz high-pass the app uses, then measured:
//   lufs      integrated loudness, ITU-R BS.1770 with gating
//   lowShare  share of energy below 150 Hz
//   motion    recordings only: how much the slow level moves (waves, gusts), dB, as pace matching measures it
//
// Each rule version's table is frozen once shipped (a saved Mix must always plan the same), so this writes the
// newest table only. Older tables (src/core/blend-data.ts for v1, blend-data-v2.ts for v2) are never regenerated.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const cache = join(here, '.cache');
mkdirSync(cache, { recursive: true });
const keepClips = process.argv.includes('--clips');
const SR = 48000;

// The catalogue is TypeScript; bundle it to plain JavaScript first (TypeScript 7 has no JS API).
execFileSync(process.execPath, [join(repo, 'node_modules', 'rolldown', 'bin', 'cli.mjs'), join(repo, 'src/core/sounds.ts'), '--format', 'cjs', '--file', join(cache, 'sounds.cjs')], { stdio: 'ignore' });
const { SOUNDS, SOUND_ORDER, levelGain } = createRequire(import.meta.url)(join(cache, 'sounds.cjs'));
execFileSync(process.execPath, [join(repo, 'node_modules', 'rolldown', 'bin', 'cli.mjs'), join(repo, 'src/core/pace.ts'), '--format', 'cjs', '--file', join(cache, 'pace.cjs')], { stdio: 'ignore' });
const { loopMotion, motionDepth } = createRequire(import.meta.url)(join(cache, 'pace.cjs'));

// The real generator, run offline.
let Processor = null;
new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', readFileSync(join(repo, 'public/hush-gen.worklet.js'), 'utf8'))(
  class { constructor() { this.port = { onmessage: null }; } }, (_name, c) => { Processor = c; }, SR);

function render(options, seconds) {
  const p = new Processor({ processorOptions: { seed: 4242, ...options } });
  const n = SR * seconds, L = new Float32Array(n), R = new Float32Array(n);
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let o = 0; o < n; o += 128) { p.process([], [[l, r]]); L.set(l.subarray(0, Math.min(128, n - o)), o); R.set(r.subarray(0, Math.min(128, n - o)), o); }
  return [L, R];
}

function decode(file, loopStart, loopEnd) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', join(repo, 'public', file), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const a = Math.round(loopStart * SR), b = Math.min(all.length / 2, Math.round(loopEnd * SR));
  const L = new Float32Array(b - a), R = new Float32Array(b - a);
  for (let i = a; i < b; i++) { L[i - a] = all[2 * i]; R[i - a] = all[2 * i + 1]; }
  return [L, R];
}

// Butterworth biquad sections (RBJ).
function biquad(kind, f, q) {
  const w = (2 * Math.PI * f) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const lp = kind === 'lp';
  const b0 = (lp ? (1 - cos) / 2 : (1 + cos) / 2) / a0, b1 = (lp ? 1 - cos : -(1 + cos)) / a0;
  return { b: [b0, b1, b0], a: [1, (-2 * cos) / a0, (1 - alpha) / a0] };
}
function filter(x, { b, a }) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const cascade = (x, sections) => sections.reduce((v, s) => filter(v, s), x);
const HP25 = [biquad('hp', 25, 0.54), biquad('hp', 25, 1.31)];
const LP150 = [biquad('lp', 150, 0.54), biquad('lp', 150, 1.31)];
const K = [{ b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] }, { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] }];

function lufs(L, R) {
  const a = cascade(L, K), b = cascade(R, K), blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), ms = [];
  for (let s = 0; s + blk <= a.length; s += hop) { let p = 0; for (let i = s; i < s + blk; i++) p += a[i] * a[i] + b[i] * b[i]; ms.push(p / blk); }
  const loud = m => -0.691 + 10 * Math.log10(m + 1e-20);
  const abs = ms.filter(m => loud(m) > -70);
  const rel = loud(abs.reduce((x, y) => x + y, 0) / abs.length) - 10;
  const kept = abs.filter(m => loud(m) > rel);
  return loud(kept.reduce((x, y) => x + y, 0) / kept.length);
}
const energy = x => x.reduce((s, v) => s + v * v, 0);

const out = {};
for (const id of SOUND_ORDER) {
  const def = SOUNDS[id];
  if (def.category === 'quiet') continue;
  const versions = [{ key: id, gain: def.gain, sample: def.sample, options: { type: id, freq: def.freq, synth: def.synth } }];
  for (const v of def.variants ?? []) versions.push({ key: `${id}.${v.id}`, gain: v.gain, sample: v.sample, options: { type: id, freq: def.freq, synth: v.synth } });
  for (const v of versions) {
    let [L, R] = v.sample ? decode(v.sample.file, v.sample.loopStart, v.sample.loopEnd) : render(v.options, 33);
    if (!v.sample) { L = L.subarray(SR * 3); R = R.subarray(SR * 3); }
    const scale = levelGain(def.defaultLevel) * v.gain;
    const l = cascade(L.map(x => x * scale), HP25), r = cascade(R.map(x => x * scale), HP25);
    const low = energy(cascade(l, LP150)) + energy(cascade(r, LP150));
    out[v.key] = { lufs: +lufs(l, r).toFixed(2), lowShare: +(low / (energy(l) + energy(r) + 1e-20)).toFixed(3) };
    if (v.sample) out[v.key].motion = +motionDepth(loopMotion([l, r], SR, 0, l.length)).toFixed(2);
    if (keepClips) {
      const n = Math.min(l.length, SR * 20), clip = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { clip[2 * i] = l[i]; clip[2 * i + 1] = r[i]; }
      writeFileSync(join(cache, `${v.key}.f32`), Buffer.from(clip.buffer));
    }
    console.log(v.key.padEnd(12), String(out[v.key].lufs).padStart(7), 'LUFS', 'low', out[v.key].lowShare, out[v.key].motion != null ? `motion ${out[v.key].motion} dB` : '');
  }
}

const body = Object.entries(out).map(([k, v]) => `  '${k}': { lufs: ${v.lufs}, lowShare: ${v.lowShare}${v.motion != null ? `, motion: ${v.motion}` : ''} },`).join('\n');
writeFileSync(join(repo, 'src/core/blend-data-v3.ts'), `// Generated by scripts/blend-lab/measure.mjs. Do not edit by hand.
//
// Auto-Blend v3 per-version measurements, frozen once shipped: a saved Mix with blend v3 must always plan the
// same, so a later re-measure goes into a new table for a new rule version rather than editing this one.
// lufs: integrated loudness at the default level (ITU-R BS.1770), lowShare: share of energy below 150 Hz,
// motion: recordings only, the spread of the slow level (waves, gusts) in dB, which picks who sets the pace.

import type { VersionData } from './blend-data.js';

export const SOUND_DATA_V3: Record<string, VersionData & { motion?: number }> = {
${body}
};
`);
console.log(`wrote src/core/blend-data-v3.ts with ${Object.keys(out).length} versions`);
