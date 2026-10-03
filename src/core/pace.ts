import type { PacePlan } from './blend.js';
import { positionAt } from './timeline.js';
import type { MixDraft } from './types.js';

/**
 * Pace matching, the part of Auto-Blend (from v2) that lets nature sounds move together.
 *
 * A recording's pace is its slow level motion: the waves rolling in, the gusts coming through. Two of
 * them stacked move at unrelated paces, which reads as two places at once. When a Mix has a sound
 * that sets a pace (Ocean, or Wind without Ocean), every other recording overlapping it follows:
 * its own slow motion is evened out a little, and it gently rises and falls with the leader, so the
 * scene breathes as one. The amounts are small (at most +1.5 / −3 dB) and follow the leader's fades.
 *
 * Nothing listens to the signal at play time. Each recording's motion over one loop is measured once
 * from the decoded file, and a recording's place in its loop is a fixed function of elapsed time
 * (its seeded entry point plus the time played), so the whole curve is known in advance and is laid
 * onto the audio clock like every other gain.
 */

/** Motion samples per second. */
export const PACE_RATE = 4;
/** Level motion is measured over this window, so the texture inside a wave or a gust is left alone. */
const SMOOTH_SEC = 1;

/**
 * A recording's slow level motion over one loop, in dB around its own average, PACE_RATE values a
 * second. The loop wraps, so the smoothing wraps too and the curve is seamless at the loop point.
 */
export function loopMotion(channels: ArrayLike<number>[], sampleRate: number, start: number, end: number): Float32Array {
  const n = end - start;
  // A one-second level needs only a fraction of the samples: every few is plenty, and much quicker on a phone.
  const step = Math.max(1, Math.floor(sampleRate / 12000));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let p = 0;
    if (i % step === 0) for (const ch of channels) { const v = ch[start + i]; p += v * v; }
    prefix[i + 1] = prefix[i] + (p * step) / channels.length;
  }
  const w = Math.max(1, Math.min(n - 1, Math.round(SMOOTH_SEC * sampleRate)));
  const windowSum = (from: number) => {
    const s = ((from % n) + n) % n;
    return s + w <= n ? prefix[s + w] - prefix[s] : prefix[n] - prefix[s] + prefix[s + w - n];
  };
  const count = Math.max(1, Math.round((n / sampleRate) * PACE_RATE));
  const out = new Float32Array(count);
  let mean = 0;
  for (let k = 0; k < count; k++) {
    const centre = Math.round((k * n) / count);
    out[k] = 10 * Math.log10(windowSum(centre - Math.floor(w / 2)) / w + 1e-20);
    mean += out[k] / count;
  }
  for (let k = 0; k < count; k++) out[k] -= mean;
  return out;
}

/** How much a recording moves: the spread of its slow level, 10th to 90th percentile, in dB. */
export function motionDepth(motion: ArrayLike<number>): number {
  const sorted = Array.from(motion).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  return at(0.9) - at(0.1);
}

/** One playing recording: its motion, its loop length, and where in the loop it is at elapsed time 0. */
export interface PaceLoop {
  motion: ArrayLike<number>;
  period: number;
  phase: number;
}

/** A recording's motion in dB at a moment of the session, linear between samples, wrapping with the loop. */
export function motionAt(loop: PaceLoop, elapsed: number): number {
  const n = loop.motion.length;
  const into = (((loop.phase + elapsed) % loop.period) + loop.period) % loop.period;
  const x = (into / loop.period) * n;
  const i = Math.floor(x);
  const f = x - i;
  return loop.motion[i % n] * (1 - f) + loop.motion[(i + 1) % n] * f;
}

/** How far the leader has faded in at a point of one pass (0–1), linear between planned points. */
export function paceWeightAt(pace: PacePlan, pos: number): number {
  const { times, weight } = pace;
  if (pos <= times[0]) return weight[0];
  let lo = 0, hi = times.length - 1;
  if (pos >= times[hi]) return weight[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= pos) lo = mid; else hi = mid; }
  const f = (pos - times[lo]) / (times[hi] - times[lo] || 1);
  return weight[lo] + (weight[hi] - weight[lo]) * f;
}

/** The pace adjustment in dB for one block at a moment of the session (0 for a block that doesn't follow). */
export function paceDbAt(pace: PacePlan | null | undefined, id: string, mix: MixDraft, lead: PaceLoop, own: PaceLoop, elapsed: number): number {
  const f = pace?.followers[id];
  if (!pace || !f) return 0;
  const w = paceWeightAt(pace, positionAt(mix, elapsed).pos);
  if (w <= 0) return 0;
  const raw = -f.flatten * motionAt(own, elapsed) + f.follow * motionAt(lead, elapsed);
  return w * Math.min(pace.maxUp, Math.max(pace.maxDown, raw));
}

/**
 * The linear gains one block's pace takes from elapsed time `from`, PACE_RATE values a second, for
 * `seconds` (plus the closing value), ready for setValueCurveAtTime.
 */
export function paceCurve(pace: PacePlan | null | undefined, id: string, mix: MixDraft, lead: PaceLoop, own: PaceLoop, from: number, seconds: number): Float32Array {
  const count = Math.max(2, Math.ceil(seconds * PACE_RATE) + 1);
  const out = new Float32Array(count);
  for (let k = 0; k < count; k++) out[k] = Math.pow(10, paceDbAt(pace, id, mix, lead, own, from + k / PACE_RATE) / 20);
  return out;
}
