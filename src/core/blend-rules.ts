import { SOUND_DATA_V1, type VersionData } from './blend-data.js';

/**
 * Auto-Blend rules, one frozen set per version. A saved Mix plans with the version it was saved
 * with, so improving the rules means adding RULES[2], never editing RULES[1].
 */

/** What a sound does in a mix: a bed under everything, a texture with detail, a bright layer up top, or a pitch. */
export type Role = 'bed' | 'texture' | 'bright' | 'tonal';

export interface BlendRules {
  /** Role by sound id; a version can override with its own key, e.g. 'focus.a'. */
  roles: Record<string, Role>;
  /** How many dB a sound of the row role steps back while a sound of the column role plays. Always ≤ 0. */
  roleCut: Record<Role, Record<Role, number>>;
  /** Floor for the pair cut. */
  maxPairCut: number;
  /** Stack cut: −stackK × (how far the summed loudness exceeds the louder of the loudest sound alone and
   * stackFrom, in LUFS), floored at stackMax. Quiet stacks are left alone; only a stack that gets loud is eased. */
  stackK: number;
  stackMax: number;
  stackFrom: number;
  /** Bass cut: sounds with more than lowHeavy of their energy below 150 Hz, other than the deepest one, step
   * back once the summed low end exceeds the deepest sound's own by more than lowFree dB, by at most lowMax. */
  lowHeavy: number;
  lowFree: number;
  lowMax: number;
  /** One constant boost per Mix that restores its average loudness, capped. */
  makeupMax: number;
  /** No block ever ends up more than this many dB above its original level, so the makeup cannot
   * undo the balance by simply lifting everything back, and peaks rise at most this much. Low-heavy
   * blocks are held at their original level instead, so the makeup never adds bass. */
  boostMax: number;
  /** Pitches in Hz of tonal versions, for clash hints. */
  fundamentals: Record<string, number[]>;
  /** A hint appears when this many textures or bright layers overlap. */
  denseAt: number;
  data: Record<string, VersionData>;
}

export const RULES: Record<number, BlendRules> = {
  1: {
    roles: {
      brown: 'bed', red: 'bed', pink: 'bed', fan: 'bed', ocean: 'bed',
      rain: 'texture', wind: 'texture', stream: 'texture', fire: 'texture',
      white: 'bright', night: 'bright',
      tone432: 'tonal', tone528: 'tonal', focus: 'tonal', zen: 'tonal',
    },
    roleCut: {
      // A bed makes room for detail on top of it, and shares space with another bed.
      bed: { bed: -1, texture: -1.5, bright: 0, tonal: 0 },
      // Two textures compete for the same middle; each gives a little.
      texture: { bed: 0, texture: -1, bright: 0, tonal: 0 },
      // A bright layer sits just under everything else and gives more to another bright layer.
      bright: { bed: -0.5, texture: -1, bright: -1.5, tonal: 0 },
      // Pitches only make room for other pitches.
      tonal: { bed: 0, texture: 0, bright: 0, tonal: -1.5 },
    },
    maxPairCut: -4,
    stackK: 0.5,
    stackMax: -3,
    stackFrom: -23,
    lowHeavy: 0.5,
    lowFree: 1.5,
    lowMax: -2,
    makeupMax: 3,
    boostMax: 1,
    fundamentals: {
      tone432: [432], tone528: [528],
      focus: [110, 164.81], zen: [108, 162], fan: [108],
    },
    denseAt: 4,
    data: SOUND_DATA_V1,
  },
};

/** The rules for a saved version: that version, or the newest this app knows that is older. */
export function rulesFor(v: number): BlendRules {
  const known = Object.keys(RULES).map(Number).filter(n => n <= v).sort((a, b) => b - a);
  return RULES[known[0] ?? 1];
}
