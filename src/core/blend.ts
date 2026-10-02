import { rulesFor, type BlendRules, type Role } from './blend-rules.js';
import { breakpointTimes, envelopeAt, isQuiet } from './timeline.js';
import type { MixComponent, MixDraft } from './types.js';

/**
 * Auto-Blend: small, predictable level cuts that help overlapping sounds sit together.
 *
 * Everything here is a function of the arrangement only: which blocks are present and how far each
 * has faded in at a moment. It never reads a block's level (apart from treating a block below 0.05
 * as absent), so a slider move is heard exactly as made and the blend never pushes back.
 *
 * For each present block i at time t, with m_j(t) the fade of every other present block j:
 *   pair  = clamp( min over j of m_j · roleCut[role_i][role_j], maxPairCut, 0 )
 *   stack = clamp( −stackK · (summed loudness − loudest single loudness, in dB), stackMax, 0 )
 *   low   = a cut of up to lowMax on low-heavy blocks, scaled by how much less low end each has than the deepest,
 *           when the summed low end builds up (the deepest block itself keeps its weight)
 *   cut   = pair + stack + low                                   always ≤ 0
 * plus one constant makeup gain for the whole Mix that restores its average loudness, with every block's
 * final gain held to min(boostMax, cut + makeup). The sound a combination favours can end up at most
 * boostMax (1 dB) above its original level while the others step back, so the balance survives the
 * loudness match and peaks rise by no more than that. Cuts follow the blocks' own fades, so they swell in
 * and out with the music, and they are continuous across the loop point.
 */

export interface BlendPlan {
  v: number;
  /** Constant boost for the whole Mix, in dB (≥ 0). */
  makeupDb: number;
  /** Per block id: the cut in dB at each time (seconds into one pass), linear in between, and the most
   * its final gain may reach in dB (low-heavy blocks: 0, so the makeup never adds bass). */
  voices: Record<string, { times: number[]; db: number[]; ceiling: number }>;
}

export interface BlendHint {
  kind: 'tones' | 'dense' | 'copies';
  ids: string[];
  /** Seconds into the Mix where it first happens. */
  at: number;
}

const versionKey = (c: MixComponent) => (c.variant ? `${c.sound}.${c.variant}` : c.sound);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const db10 = (x: number) => 10 * Math.log10(x);

function members(mix: MixDraft) {
  return mix.components.filter(c => !isQuiet(c) && c.level >= 0.05);
}

function roleOf(rules: BlendRules, c: MixComponent): Role {
  return rules.roles[versionKey(c)] ?? rules.roles[c.sound] ?? 'texture';
}

function power(rules: BlendRules, c: MixComponent) {
  const d = rules.data[versionKey(c)] ?? rules.data[c.sound];
  return { p: Math.pow(10, (d?.lufs ?? -24) / 10), low: d?.lowShare ?? 0 };
}

/** The times worth evaluating: every point where some block's fade changes shape. */
function sampleTimes(mix: MixDraft, list: MixComponent[]) {
  const all = new Set<number>([0, mix.lengthSec]);
  for (const c of list) for (const t of breakpointTimes(c, mix)) all.add(Math.round(t * 1000) / 1000);
  return [...all].filter(t => t >= 0 && t <= mix.lengthSec).sort((a, b) => a - b);
}

/** The cut for every present block at one moment, from the fades at that moment. */
function cutsAt(rules: BlendRules, list: MixComponent[], env: number[], info: { p: number; low: number }[], roles: Role[]) {
  const cuts = new Array<number>(list.length).fill(0);
  let sum = 0;
  let loudest = 0;
  let lowSum = 0;
  let anchorLow = 0;
  for (let j = 0; j < list.length; j++) {
    const e = env[j] * env[j] * info[j].p;
    sum += e;
    loudest = Math.max(loudest, e);
    const le = e * info[j].low;
    lowSum += le;
    anchorLow = Math.max(anchorLow, le);
  }
  // Only a stack that gets loud is eased: measured against the louder of the loudest single sound and stackFrom.
  const floor = Math.max(loudest, Math.pow(10, rules.stackFrom / 10));
  const stack = sum > 0 ? clamp(-rules.stackK * Math.max(0, db10(sum / floor)), rules.stackMax, 0) : 0;
  const lowExcess = anchorLow > 0 ? db10(lowSum / anchorLow) : 0;
  // Every block gets a cut whether or not it is sounding yet: its own presence doesn't change its cut, and this
  // keeps the curve smooth right up to its start and end instead of snapping to 0 dB at the edges.
  for (let i = 0; i < list.length; i++) {
    let pair = 0;
    for (let j = 0; j < list.length; j++) {
      if (j === i || env[j] <= 0) continue;
      pair = Math.min(pair, env[j] * rules.roleCut[roles[i]][roles[j]]);
    }
    pair = clamp(pair, rules.maxPairCut, 0);
    // The deepest sound keeps its weight; the others give way in proportion to how much less low end they carry,
    // so when two low sounds cross over during a fade the cut moves smoothly from one to the other.
    const share = anchorLow > 0 ? (env[i] * env[i] * info[i].p * info[i].low) / anchorLow : 1;
    const low = info[i].low > rules.lowHeavy ? clamp(-(lowExcess - rules.lowFree), rules.lowMax, 0) * (1 - share) : 0;
    cuts[i] = pair + stack + low;
  }
  return cuts;
}

/** Drops points that sit within `tol` dB of the straight line through their neighbours. */
function simplify(times: number[], db: number[], tol = 0.05) {
  if (times.length <= 2) return { times, db };
  const keepT = [times[0]];
  const keepD = [db[0]];
  for (let k = 1; k < times.length - 1; k++) {
    const t0 = keepT[keepT.length - 1], d0 = keepD[keepD.length - 1];
    const t2 = times[k + 1], d2 = db[k + 1];
    const line = t2 === t0 ? d0 : d0 + ((d2 - d0) * (times[k] - t0)) / (t2 - t0);
    if (Math.abs(line - db[k]) > tol) { keepT.push(times[k]); keepD.push(db[k]); }
  }
  keepT.push(times[times.length - 1]);
  keepD.push(db[db.length - 1]);
  // A curve that never moves collapses to a single value.
  if (keepD.every(v => Math.abs(v - keepD[0]) <= tol)) return { times: [times[0], times[times.length - 1]], db: [keepD[0], keepD[0]] };
  return { times: keepT, db: keepD };
}

/** The blend for a Mix, or null when it plays as the original. */
export function planBlend(mix: MixDraft): BlendPlan | null {
  if (!mix.blend?.on) return null;
  const rules = rulesFor(mix.blend.v);
  const list = members(mix);
  const plan: BlendPlan = { v: mix.blend.v, makeupDb: 0, voices: {} };
  if (!list.length) return plan;
  const info = list.map(c => power(rules, c));
  const roles = list.map(c => roleOf(rules, c));
  const times = sampleTimes(mix, list);
  const series = list.map(() => [] as number[]);
  // Each block's energy at each moment, for the makeup gain.
  const energy: number[][] = [];
  for (const t of times) {
    const env = list.map(c => envelopeAt(c, t, mix));
    const cuts = cutsAt(rules, list, env, info, roles);
    for (let j = 0; j < list.length; j++) series[j].push(cuts[j]);
    energy.push(env.map((e, j) => e * e * info[j].p));
  }
  // How far above its original level each block may end up: boostMax, or 0 for low-heavy blocks.
  const ceilings = info.map(d => (d.low > rules.lowHeavy ? 0 : rules.boostMax));
  // Area under the Mix's loudness over one pass, with a given makeup (each block held under its ceiling).
  const area = (makeup: number, original = false) => {
    let total = 0;
    for (let k = 1; k < times.length; k++) {
      const at = (q: number) => energy[q].reduce((sum, e, j) => sum + e * (original ? 1 : Math.pow(10, Math.min(ceilings[j], series[j][q] + makeup) / 10)), 0);
      total += ((times[k] - times[k - 1]) * (at(k) + at(k - 1))) / 2;
    }
    return total;
  };
  // The original: every block at exactly its own level.
  const target = area(0, true);
  if (target > 0) {
    // The largest makeup, up to the cap, that does not take the Mix above the original's loudness. Beyond the
    // deepest cut plus the highest ceiling it would change nothing (every block already at its ceiling), so stop there.
    const deepest = Math.max(0, ...series.flat().map(v => -v));
    let lo = 0, hi = Math.min(rules.makeupMax, deepest + Math.max(...ceilings));
    if (area(hi) <= target) lo = hi;
    else for (let n = 0; n < 30; n++) { const mid = (lo + hi) / 2; if (area(mid) <= target) lo = mid; else hi = mid; }
    plan.makeupDb = Math.floor(lo * 100) / 100;
  }
  list.forEach((c, j) => {
    plan.voices[c.id] = { ...simplify(times, series[j].map(v => Math.round(v * 100) / 100)), ceiling: ceilings[j] };
  });
  return plan;
}

/** A block's cut in dB at time t (seconds into one pass), linear between planned points. */
export function blendDbAt(plan: BlendPlan | null, id: string, t: number): number {
  const v = plan?.voices[id];
  if (!v) return 0;
  const { times, db } = v;
  if (t <= times[0]) return db[0];
  for (let k = 1; k < times.length; k++) {
    if (t <= times[k]) {
      const f = (t - times[k - 1]) / (times[k] - times[k - 1] || 1);
      return db[k - 1] + (db[k] - db[k - 1]) * f;
    }
  }
  return db[db.length - 1];
}

/**
 * The linear gain the blend applies to a block at time t, makeup included, never more than its ceiling
 * (1 dB, or 0 dB for low-heavy blocks) above the original. 1 when there is no plan.
 */
export function blendGainAt(plan: BlendPlan | null, id: string, t: number): number {
  if (!plan) return 1;
  const ceiling = plan.voices[id]?.ceiling ?? 0;
  return Math.pow(10, Math.min(ceiling, blendDbAt(plan, id, t) + plan.makeupDb) / 20);
}

/** Simple-ratio intervals (octaves folded away) that sit well together. */
const CONSONANT = [1, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 5 / 3, 2];
function consonant(a: number, b: number) {
  let r = Math.max(a, b) / Math.min(a, b);
  while (r > 2.0001) r /= 2;
  return CONSONANT.some(c => Math.abs(r / c - 1) < 0.006);
}

/**
 * Non-blocking suggestions for combinations no level balance can fix. They never stop a save.
 *  tones   two pitched sounds overlap at intervals that clash
 *  dense   many textures and bright layers stack at once
 *  copies  the same sound overlaps itself
 */
export function blendHints(mix: MixDraft): BlendHint[] {
  const rules = rulesFor(mix.blend?.v ?? 1);
  const list = members(mix);
  const hints: BlendHint[] = [];
  const seen = new Set<string>();
  const add = (kind: BlendHint['kind'], ids: string[], at: number) => {
    const sig = `${kind}:${[...ids].sort().join(',')}`;
    if (!seen.has(sig)) { seen.add(sig); hints.push({ kind, ids, at }); }
  };
  const overlap = (a: MixComponent, b: MixComponent) => a.start < b.end && b.start < a.end;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!overlap(a, b)) continue;
      const at = Math.max(a.start, b.start);
      if (versionKey(a) === versionKey(b)) add('copies', [a.id, b.id], at);
      const fa = rules.fundamentals[versionKey(a)], fb = rules.fundamentals[versionKey(b)];
      if (fa && fb && fa.some(x => fb.some(y => !consonant(x, y)))) add('tones', [a.id, b.id], at);
    }
  }
  // Density: at each block start, how many textures and bright layers are playing.
  for (const c of list) {
    const now = list.filter(o => o.start <= c.start && o.end > c.start && ['texture', 'bright'].includes(roleOf(rules, o)));
    if (now.length >= rules.denseAt) add('dense', now.map(o => o.id), c.start);
  }
  return hints.sort((x, y) => x.at - y.at);
}
