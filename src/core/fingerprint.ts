import { SOUNDS } from './sounds.js';
import type { MixComponent, MixDraft } from './types.js';

/**
 * Discovery fingerprint, version 1.
 *
 * A Mix is reduced to its meaningful structure so that tiny slider differences
 * (Brown 41% vs 42%) land in the same discovery family. Bump the version when the
 * rules change; families store the version they were created under.
 *
 * Inputs that matter: which sounds, where each sits in the Mix (early/middle/late and how
 * much of it), rough intensity, slow entries, quiet-section placement, repeat behaviour,
 * and the rough Mix length. Ignored: names, ids, layer order, exact seconds and percentages.
 */
export const FINGERPRINT_VERSION = 1;

export function lengthBucket(lengthSec: number) {
  const min = lengthSec / 60;
  if (min <= 15) return 'S';
  if (min <= 35) return 'M';
  if (min <= 70) return 'L';
  return 'XL';
}

export function levelBucket(level: number) {
  if (level < 0.34) return 'lo';
  if (level < 0.67) return 'md';
  return 'hi';
}

const PHASES = ['early', 'mid', 'late'] as const;

export function placement(c: MixComponent, lengthSec: number) {
  const coverage = (c.end - c.start) / lengthSec;
  if (coverage >= 0.9) return 'full';
  const phase = PHASES[Math.min(2, Math.floor((c.start / lengthSec) * 3))];
  const span = coverage < 0.2 ? 'brief' : coverage < 0.5 ? 'part' : 'most';
  return `${phase}-${span}`;
}

const placementRank = (p: string) => (p === 'full' ? 0 : 1 + PHASES.indexOf(p.split('-')[0] as (typeof PHASES)[number]));

export function componentToken(c: MixComponent, lengthSec: number) {
  const where = placement(c, lengthSec);
  const slow = c.entry === 'slow' ? '~' : '';
  // A variant is a different sound to discover; originals keep exactly the tokens they always had.
  const sound = c.variant ? `${c.sound}.${c.variant}` : c.sound;
  return { rank: placementRank(where), token: `${sound}@${where}:${levelBucket(c.level)}${slow}` };
}

/** Canonical, order-independent description of a Mix. Equal strings mean the same discovery. */
export function canonicalize(mix: MixDraft): string {
  const tokens = mix.components
    .filter(c => c.level >= 0.05 || SOUNDS[c.sound].category === 'quiet')
    .map(c => componentToken(c, mix.lengthSec));
  const unique = [...new Map(tokens.map(t => [t.token, t])).values()];
  unique.sort((a, b) => a.rank - b.rank || a.token.localeCompare(b.token));
  return `v${FINGERPRINT_VERSION}|${mix.repeat}|${lengthBucket(mix.lengthSec)}|${unique.map(t => t.token).join(',')}`;
}
