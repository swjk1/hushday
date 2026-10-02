// Checks Auto-Blend against the original over every pair and triple of sounds, from real measured audio.
//
//   node scripts/blend-lab/measure.mjs --clips   (once, to render the clips)
//   node scripts/blend-lab/batch.mjs             prints a summary and writes .cache/batch.json
//
// For each combination, all blocks spanning the whole Mix at default levels:
//   loudness change   integrated LUFS, blend minus original (the makeup gain should keep this near 0)
//   peak change       sample peak, blend minus original (should never be above 0)
//   low change        energy below 150 Hz, blend minus original
//   entry jump        for triples: how much loudness jumps when a third sound enters partway through a Mix
//                     that started as a pair (one Mix, so one makeup gain, as in the app)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const cache = join(here, '.cache');
const SR = 48000;
execFileSync(process.execPath, [join(repo, 'node_modules', 'rolldown', 'bin', 'cli.mjs'), join(here, 'batch-entry.ts'), '--format', 'cjs', '--file', join(cache, 'blend.cjs')], { stdio: 'ignore' });
const { planBlend, blendGainAt, SOUND_ORDER } = createRequire(import.meta.url)(join(cache, 'blend.cjs'));

const sounds = SOUND_ORDER.filter(s => s !== 'quiet');
const clips = Object.fromEntries(sounds.map(s => {
  const b = readFileSync(join(cache, `${s}.f32`));
  return [s, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)];
}));
const n = Math.min(...Object.values(clips).map(c => c.length / 2));

function biquad(kind, f, q) {
  const w = (2 * Math.PI * f) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha, lp = kind === 'lp';
  const b0 = (lp ? (1 - cos) / 2 : (1 + cos) / 2) / a0, b1 = (lp ? 1 - cos : -(1 + cos)) / a0;
  return { b: [b0, b1, b0], a: [1, (-2 * cos) / a0, (1 - alpha) / a0] };
}
function filter(x, { b, a }) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const cascade = (x, s) => s.reduce((v, f) => filter(v, f), x);
const K = [{ b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] }, { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] }];
const LP150 = [biquad('lp', 150, 0.54), biquad('lp', 150, 1.31)];
function lufs(L, R) {
  const a = cascade(L, K), b = cascade(R, K), blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), ms = [];
  for (let s = 0; s + blk <= a.length; s += hop) { let p = 0; for (let i = s; i < s + blk; i++) p += a[i] * a[i] + b[i] * b[i]; ms.push(p / blk); }
  const loud = m => -0.691 + 10 * Math.log10(m + 1e-20), abs = ms.filter(m => loud(m) > -70);
  const rel = loud(abs.reduce((x, y) => x + y, 0) / abs.length) - 10, k = abs.filter(m => loud(m) > rel);
  return loud(k.reduce((x, y) => x + y, 0) / k.length);
}
function mixdown(set, gains) {
  const L = new Float32Array(n), R = new Float32Array(n);
  set.forEach((s, j) => { const c = clips[s], g = gains[j]; for (let i = 0; i < n; i++) { L[i] += c[2 * i] * g; R[i] += c[2 * i + 1] * g; } });
  return [L, R];
}
const peakOf = ([L, R]) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i])); return 20 * Math.log10(m); };
const lowOf = ([L, R]) => { const a = cascade(L, LP150), b = cascade(R, LP150); let e = 0; for (let i = 0; i < n; i++) e += a[i] * a[i] + b[i] * b[i]; return 10 * Math.log10(e + 1e-20); };
const block = (s, start = 0) => ({ id: s, sound: s, start, end: 1800, level: 0.6, entry: 'soft' });
const planOf = components => planBlend({ name: 'B', lengthSec: 1800, repeat: 'loop', blend: { on: true, v: 1 }, components });
const blendGains = set => { const plan = planOf(set.map(s => block(s))); return set.map(s => blendGainAt(plan, s, 900)); };

const rows = [];
const combos = [];
for (let i = 0; i < sounds.length; i++) for (let j = i + 1; j < sounds.length; j++) {
  combos.push([sounds[i], sounds[j]]);
  for (let k = j + 1; k < sounds.length; k++) combos.push([sounds[i], sounds[j], sounds[k]]);
}
const loudCache = new Map();
const loudOf = (set, blend) => {
  const key = `${blend ? 'b' : 'o'}:${set.join('+')}`;
  if (!loudCache.has(key)) loudCache.set(key, lufs(...mixdown(set, blend ? blendGains(set) : set.map(() => 1))));
  return loudCache.get(key);
};
for (const set of combos) {
  const orig = mixdown(set, set.map(() => 1));
  const blend = mixdown(set, blendGains(set));
  const row = {
    set: set.join('+'), size: set.length,
    loudness: loudOf(set, true) - loudOf(set, false),
    peak: peakOf(blend) - peakOf(orig),
    low: lowOf(blend) - lowOf(orig),
  };
  if (set.length === 3) {
    // Each sound in turn enters at 10 minutes over the other two: loudness before (5 min) and after (25 min).
    const jumps = set.map((late, x) => {
      const pair = set.filter((_, y) => y !== x);
      const plan = planOf([...pair.map(s => block(s)), block(late, 600)]);
      const before = lufs(...mixdown(pair, pair.map(s => blendGainAt(plan, s, 300))));
      const after = lufs(...mixdown(set, set.map(s => blendGainAt(plan, s, 1500))));
      return { o: loudOf(set, false) - loudOf(pair, false), b: after - before };
    });
    row.entryOrig = Math.max(...jumps.map(j => j.o));
    row.entryBlend = Math.max(...jumps.map(j => j.b));
  }
  rows.push(row);
}
writeFileSync(join(cache, 'batch.json'), JSON.stringify(rows, null, 1));

const stat = (list, f) => { const v = list.map(f).sort((a, b) => a - b); return { min: v[0], p50: v[Math.floor(v.length / 2)], max: v[v.length - 1] }; };
const fmt = s => `min ${s.min.toFixed(2)}  median ${s.p50.toFixed(2)}  max ${s.max.toFixed(2)}`;
for (const size of [2, 3]) {
  const list = rows.filter(r => r.size === size);
  console.log(`\n${list.length} ${size === 2 ? 'pairs' : 'triples'}`);
  console.log('  loudness change (LU)  ', fmt(stat(list, r => r.loudness)));
  console.log('  peak change (dB)      ', fmt(stat(list, r => r.peak)));
  console.log('  low end change (dB)   ', fmt(stat(list, r => r.low)));
  if (size === 3) {
    console.log('  entry jump, original  ', fmt(stat(list, r => r.entryOrig)));
    console.log('  entry jump, blend     ', fmt(stat(list, r => r.entryBlend)));
    console.log('  entry smaller with blend in', list.filter(r => r.entryBlend <= r.entryOrig + 0.01).length, 'of', list.length);
  }
  console.log('  peaks above original in', list.filter(r => r.peak > 0.05).length, 'of', list.length);
}
