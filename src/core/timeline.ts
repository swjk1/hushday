import { SOUNDS } from './sounds.js';
import type { MixComponent, MixDraft, SoundId } from './types.js';

type Shape = Pick<MixDraft, 'lengthSec' | 'repeat'>;

export const isQuiet = (c: MixComponent) => SOUNDS[c.sound].category === 'quiet';
const isFullSpan = (c: MixComponent, mix: Shape) => c.start <= 0 && c.end >= mix.lengthSec;

/** Steps each fade is split into when scheduled on the audio clock, so ramps follow the S-curve. */
const FADE_STEPS = 12;

/** Ease-in-out, so entries, exits and quiet dips swell rather than switch. */
const smooth = (x: number) => x * x * (3 - 2 * x);

export function fades(c: MixComponent, mix: Shape) {
  const span = c.end - c.start;
  if (isFullSpan(c, mix)) return { fadeIn: 0, fadeOut: 0 };
  if (isQuiet(c)) {
    const f = Math.min(90, span * 0.3);
    return { fadeIn: f, fadeOut: f };
  }
  const fadeIn = c.entry === 'slow' ? Math.min(150, span * 0.4) : Math.min(30, span * 0.2);
  // In sustain mode, anything running to the end keeps going, so it must not fade out there.
  const fadeOut = c.end >= mix.lengthSec && mix.repeat === 'sustain' ? 0 : Math.min(30, span * 0.2);
  return { fadeIn, fadeOut };
}

/** 0–1 envelope of one component at a position inside a single pass of the Mix. */
export function envelopeAt(c: MixComponent, t: number, mix: Shape): number {
  if (t < c.start || t > c.end) return 0;
  const { fadeIn, fadeOut } = fades(c, mix);
  let v = 1;
  if (fadeIn > 0 && t < c.start + fadeIn) v = (t - c.start) / fadeIn;
  if (fadeOut > 0 && t > c.end - fadeOut) v = Math.min(v, (c.end - t) / fadeOut);
  return smooth(Math.max(0, Math.min(1, v)));
}

/** Multiplier applied to every audible layer; quiet sections pull it down. */
export function duckAt(mix: MixDraft, t: number): number {
  let d = 1;
  for (const c of mix.components) if (isQuiet(c)) d = Math.min(d, 1 - c.level * envelopeAt(c, t, mix));
  return Math.max(0, d);
}

/** Times inside a pass to schedule a component's envelope at. Close enough to linear between them. */
export function breakpointTimes(c: MixComponent, mix: Shape): number[] {
  const { fadeIn, fadeOut } = fades(c, mix);
  const times = [0, c.start, c.end, mix.lengthSec];
  for (let i = 0; i <= FADE_STEPS; i++) {
    const f = i / FADE_STEPS;
    times.push(c.start + fadeIn * f, c.end - fadeOut * f);
  }
  return uniqueSorted(times, mix.lengthSec);
}

export function quietBreakpointTimes(mix: MixDraft): number[] {
  const times = [0, mix.lengthSec];
  for (const c of mix.components) if (isQuiet(c)) times.push(...breakpointTimes(c, mix));
  return uniqueSorted(times, mix.lengthSec);
}

function uniqueSorted(times: number[], max: number) {
  return [...new Set(times.map(t => Math.min(max, Math.max(0, t))))].sort((a, b) => a - b);
}

/**
 * Where playback is inside the Mix after `elapsed` seconds of listening. Cycles exist here
 * internally; they are never shown to the user.
 */
export function positionAt(mix: Shape, elapsed: number) {
  const L = mix.lengthSec;
  if (mix.repeat === 'sustain') {
    return elapsed < L ? { pos: elapsed, pass: 0, sustaining: false } : { pos: L, pass: 0, sustaining: true };
  }
  const pass = Math.floor(elapsed / L);
  return { pos: elapsed - pass * L, pass, sustaining: false };
}

/** Effective level (envelope × quiet duck) of a component, ignoring its intensity. */
export function presenceAt(mix: MixDraft, c: MixComponent, t: number) {
  return isQuiet(c) ? 0 : envelopeAt(c, t, mix) * duckAt(mix, t);
}

export function activeSoundsAt(mix: MixDraft, pos: number) {
  const sounds: SoundId[] = [];
  for (const c of mix.components) {
    if (presenceAt(mix, c, pos) > 0.05 && !sounds.includes(c.sound)) sounds.push(c.sound);
  }
  const quiet = mix.components.some(c => isQuiet(c) && envelopeAt(c, pos, mix) > 0.3);
  return { sounds, quiet };
}

/** The next thing that enters after `pos` within the current pass, if the Mix has sections. */
export function nextEntry(mix: MixDraft, pos: number): { sound: SoundId; inSec: number } | null {
  let best: MixComponent | null = null;
  for (const c of mix.components) {
    if (c.start > pos + 1 && (!best || c.start < best.start)) best = c;
  }
  return best ? { sound: best.sound, inSec: best.start - pos } : null;
}

/** True when a Mix has distinct sections rather than a single continuous blend. */
export const hasSections = (mix: MixDraft) => mix.components.some(c => !isFullSpan(c, mix));
