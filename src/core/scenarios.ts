import { SOUNDS } from './sounds.js';
import { isQuiet, layerAt } from './timeline.js';
import type { MixDraft, SoundId } from './types.js';

/**
 * "Good for": the moments a Mix suits, worked out from the Mix itself.
 *
 * Nothing is guessed from outside. The Mix is read the way it plays: how much of each sound is heard over one
 * pass (its time on, its fades, any Quiet over it, and its volume against the sound's own default), how busy or
 * calm the whole is, how steady, whether it has quiet breaks, how long it runs, and whether it holds at the end.
 * Every scenario scores those features; the best three are offered, never two from the same family (a study
 * Mix is not also offered for studying, deep work and a sprint). Same Mix, same answer, on any device.
 */

export interface ScenarioPick {
  id: string;
  label: string;
  /** One line on why, in terms of the Mix's own sounds. */
  why: string;
}

/** What a Mix sounds like, as numbers. Shares are of the whole Mix's sound and add up to 1. */
export interface MixFeatures {
  share: Partial<Record<SoundId, number>>;
  /** How busy it is: 0 (deep, still) to 1 (bright, eventful). */
  energy: number;
  /** How much of the Mix plays without sounds coming and going (1 = every sound runs the whole way). */
  steady: number;
  /** Volume against the sounds' own defaults (1 = as tuned, below 1 = softer). */
  softness: number;
  /** Has a quiet break: a Quiet block over some or all of it. */
  breaks: boolean;
  minutes: number;
  /** Holds at the end instead of looping: it settles and stays. */
  holds: boolean;
  /** How many different sounds are heard. */
  variety: number;
}

// How busy each sound is on its own, 0 to 1.
const ENERGY: Partial<Record<SoundId, number>> = {
  brown: 0.15, red: 0.1, pink: 0.35, white: 0.7, tone432: 0.3, tone528: 0.35, fan: 0.25, rain: 0.45, ocean: 0.45,
  wind: 0.45, stream: 0.5, fire: 0.5, night: 0.45, gulls: 0.75, focus: 0.9, zen: 0.15,
};

const SAMPLES = 240;

export function mixFeatures(mix: MixDraft): MixFeatures {
  const audible = mix.components.filter(c => !isQuiet(c) && c.level >= 0.05);
  const L = mix.lengthSec;
  const heard: Partial<Record<SoundId, number>> = {};
  let steadyTime = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const t = ((k + 0.5) / SAMPLES) * L;
    for (const c of audible) {
      const volume = Math.min(1.5, c.level / SOUNDS[c.sound].defaultLevel);
      heard[c.sound] = (heard[c.sound] ?? 0) + layerAt(mix, c, t) * volume;
    }
  }
  const total = Object.values(heard).reduce((a, b) => a + (b ?? 0), 0);
  const share: Partial<Record<SoundId, number>> = {};
  for (const [s, v] of Object.entries(heard)) if (total > 0 && v) share[s as SoundId] = v / total;
  for (const c of audible) steadyTime += ((c.end - c.start) / L) * (share[c.sound] ?? 0) / Math.max(1, audible.filter(o => o.sound === c.sound).length);
  const energy = Object.entries(share).reduce((sum, [s, v]) => sum + (v ?? 0) * (ENERGY[s as SoundId] ?? 0.4), 0);
  const softness = audible.length
    ? audible.reduce((sum, c) => sum + (share[c.sound] ?? 0) * (c.level / SOUNDS[c.sound].defaultLevel), 0) /
      Math.max(1e-9, audible.reduce((sum, c) => sum + (share[c.sound] ?? 0), 0))
    : 1;
  return {
    share, energy, steady: Math.min(1, steadyTime), softness,
    breaks: mix.components.some(isQuiet),
    minutes: L / 60,
    holds: mix.repeat === 'sustain',
    variety: Object.values(share).filter(v => (v ?? 0) > 0.08).length,
  };
}

interface Scenario {
  id: string;
  label: string;
  /** Scenarios in one family are never offered together. */
  family: 'study' | 'sleep' | 'calm' | 'place' | 'day' | 'noise';
  /** The sounds that make the case, for the one-line reason. */
  sounds: SoundId[];
  /** The reason after the sounds' names: for several sounds (or a plural name), and for one. */
  phrase: [many: string, one: string];
  score: (f: MixFeatures, s: (...ids: SoundId[]) => number) => number;
}

const NOISE: SoundId[] = ['brown', 'red', 'pink', 'white', 'fan'];
const DARK: SoundId[] = ['brown', 'red', 'fan'];
const TONES: SoundId[] = ['tone432', 'tone528', 'zen'];

const SCENARIOS: Scenario[] = [
  {
    id: 'late-night-study', label: 'Late-night studying', family: 'study',
    sounds: ['focus', 'rain', 'night', 'fire', 'brown', 'red', 'stream'],
    phrase: ['keep a low, steady room around you for long hours', 'keeps a low, steady room around you for long hours'],
    score: (f, s) => {
      const night = s('night', 'fire', 'rain');
      const bed = s(...DARK, 'pink', 'stream');
      if (night + bed < 0.4 || f.energy > 0.62) return 0;
      return 0.35 * Math.min(1, s('focus') * 4) + 0.35 * night + 0.25 * bed + (f.minutes >= 30 ? 0.1 : 0) + 0.1 * f.steady;
    },
  },
  {
    id: 'deep-work', label: 'Deep work', family: 'study',
    sounds: ['focus', 'brown', 'pink', 'red', 'white', 'fan'],
    phrase: ['hold your attention without asking for any of it', 'holds your attention without asking for any of it'],
    score: (f, s) => {
      const noise = s(...NOISE);
      if (s('focus') === 0 && (noise < 0.6 || f.steady < 0.8)) return 0;
      return 0.45 * Math.min(1, s('focus') * 3) + 0.35 * noise + 0.2 * f.steady;
    },
  },
  {
    id: 'study-sprint', label: 'A study sprint', family: 'study',
    sounds: ['focus', 'pink', 'brown', 'white'],
    phrase: ['make a short, sharp block of work', 'makes a short, sharp block of work'],
    score: (f, s) => (s('focus') >= 0.15 && f.minutes >= 10 && f.minutes <= 25 ? 0.45 + 0.4 * Math.min(1, s('focus') * 3) : 0),
  },
  {
    id: 'reading', label: 'Reading', family: 'day',
    sounds: ['rain', 'fire', 'stream', 'ocean', 'brown', 'night'],
    phrase: ['sit softly behind the page', 'sits softly behind the page'],
    score: (f, s) => (s('focus') > 0.25 || f.energy > 0.6 ? 0 : 0.55 * s('rain', 'fire', 'stream', 'night') + 0.3 * s('ocean') + 0.2 * s(...DARK) + 0.25 * (1 - f.energy)),
  },
  {
    id: 'falling-asleep', label: 'Falling asleep', family: 'sleep',
    sounds: ['brown', 'red', 'ocean', 'rain', 'fan', 'zen'],
    phrase: ['stay dark and even, nothing to catch the ear', 'stays dark and even, nothing to catch the ear'],
    score: (f, s) => {
      if (s('focus') > 0 || s('white') > 0.3 || s('gulls') > 0.15) return 0;
      return 0.5 * s(...DARK, 'ocean', 'rain') + 0.25 * s('zen') + 0.3 * (1 - f.energy) + (f.holds || f.minutes >= 45 ? 0.15 : 0) + (f.softness < 0.95 ? 0.08 : 0);
    },
  },
  {
    id: 'power-nap', label: 'A power nap', family: 'sleep',
    sounds: ['brown', 'ocean', 'rain', 'fan', 'red'],
    phrase: ['settle you fast and keep it short', 'settles you fast and keeps it short'],
    score: (f, s) => (f.minutes <= 25 && s('focus') === 0 && f.energy < 0.45 ? 0.25 + 0.4 * s(...DARK, 'ocean', 'rain') : 0),
  },
  {
    id: 'settling-a-baby', label: 'Settling a baby', family: 'sleep',
    sounds: ['white', 'pink', 'fan', 'brown'],
    phrase: ['make a steady shush that covers the house', 'makes a steady shush that covers the house'],
    score: (f, s) => (s('focus', 'gulls', ...TONES) > 0.1 || f.steady < 0.85 ? 0 : 0.8 * s('white', 'pink', 'fan') + 0.2 * f.steady - 0.1),
  },
  {
    id: 'meditation', label: 'Meditation', family: 'calm',
    sounds: ['zen', 'tone432', 'tone528', 'ocean', 'wind'],
    phrase: ['give the breath something slow to rest on', 'gives the breath something slow to rest on'],
    score: (f, s) => {
      if (s(...TONES) === 0 && !(f.breaks && f.energy < 0.35)) return 0;
      return 0.6 * s(...TONES) + 0.2 * s('ocean', 'wind') + (f.breaks ? 0.15 : 0) + 0.2 * (1 - f.energy);
    },
  },
  {
    id: 'slow-breathing', label: 'Slow breathing', family: 'calm',
    sounds: ['ocean', 'zen', 'wind'],
    phrase: ['rise and fall at a pace you can breathe to', 'rises and falls at a pace you can breathe to'],
    score: (_f, s) => (s('ocean') > 0.2 ? 0.25 + 0.4 * s('ocean') + 0.3 * s('zen', 'wind') : 0),
  },
  {
    id: 'winding-down', label: 'Winding down after work', family: 'calm',
    sounds: ['fire', 'rain', 'stream', 'zen', 'night', 'ocean'],
    phrase: ['ease the day off your shoulders', 'eases the day off your shoulders'],
    score: (f, s) => (f.energy > 0.6 || s('focus') > 0.2 ? 0 : 0.5 * s('fire', 'rain', 'stream', 'zen', 'night') + 0.3 * (1 - f.energy) + (f.breaks ? 0.1 : 0)),
  },
  {
    id: 'cozy-evening', label: 'A cozy evening in', family: 'place',
    sounds: ['fire', 'rain', 'wind', 'night'],
    phrase: ['bring the fireside into the room', 'brings the fireside into the room'],
    score: (_f, s) => (s('fire') > 0.15 ? 0.3 + 0.6 * s('fire') + 0.25 * s('rain', 'wind', 'night') : 0),
  },
  {
    id: 'rainy-day', label: 'A rainy day indoors', family: 'place',
    sounds: ['rain', 'wind', 'brown'],
    phrase: ['put weather on the window', 'puts weather on the window'],
    score: (_f, s) => (s('rain') > 0.2 ? 0.3 + 0.7 * s('rain') : 0),
  },
  {
    id: 'summer-night', label: 'A summer night', family: 'place',
    sounds: ['night', 'stream', 'wind'],
    phrase: ['open a window onto a warm night', 'opens a window onto a warm night'],
    score: (_f, s) => (s('night') > 0.15 ? 0.3 + 0.7 * s('night') + 0.1 * s('stream', 'wind') : 0),
  },
  {
    id: 'seaside', label: 'A day by the sea', family: 'place',
    sounds: ['ocean', 'gulls', 'wind'],
    phrase: ['take you down to the shore', 'takes you down to the shore'],
    score: (_f, s) => (s('ocean', 'gulls') > 0.2 ? 0.25 + 0.7 * s('ocean', 'gulls') + 0.15 * s('wind') : 0),
  },
  {
    id: 'slow-morning', label: 'A slow morning', family: 'day',
    sounds: ['stream', 'gulls', 'wind', 'pink'],
    phrase: ['keep things light while the day starts', 'keeps things light while the day starts'],
    score: (f, s) => (s('night', 'fire') > 0.3 || f.energy < 0.3 ? 0 : 0.6 * s('stream', 'gulls', 'wind') + 0.2 * (f.minutes <= 30 ? 1 : 0.5) + 0.1 * s('pink')),
  },
  {
    id: 'creative-flow', label: 'Writing and creative work', family: 'day',
    sounds: ['stream', 'rain', 'wind', 'fire', 'focus', 'gulls'],
    phrase: ['keep a little life in the room while ideas come', 'keeps a little life in the room while ideas come'],
    score: (f, s) => (f.variety >= 2 && s('rain', 'stream', 'wind', 'fire', 'gulls', 'night', 'ocean') > 0.35 ? 0.1 + 0.05 * Math.min(4, f.variety) + 0.3 * s('rain', 'stream', 'wind', 'fire', 'gulls') + 0.05 * Math.min(1, s('focus') * 3) : 0),
  },
  {
    id: 'blocking-noise', label: 'Blocking out a noisy room', family: 'noise',
    sounds: ['white', 'pink', 'brown', 'fan', 'red'],
    phrase: ['mask voices, traffic and open-plan chatter', 'masks voices, traffic and open-plan chatter'],
    score: (f, s) => (s(...NOISE) < 0.5 ? 0 : 0.6 * s('white', 'pink') + 0.3 * s(...NOISE) + (f.softness >= 1 ? 0.1 : 0)),
  },
  {
    id: 'commute', label: 'Travel and commuting', family: 'noise',
    sounds: ['brown', 'pink', 'white', 'rain', 'fan'],
    phrase: ['smooth over engines and announcements', 'smooths over engines and announcements'],
    score: (f, s) => (s(...NOISE) < 0.6 || f.steady < 0.8 ? 0 : 0.5 * s(...NOISE) + 0.1),
  },
];

/** Every scenario's id, for anything that pairs scenarios with something else (their photos). */
export const SCENARIO_IDS = SCENARIOS.map(sc => sc.id);

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const listNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** The scenarios a Mix suits best: up to three, at most one per family, best first. */
export function recommendScenarios(mix: MixDraft, count = 3): ScenarioPick[] {
  const f = mixFeatures(mix);
  const s = (...ids: SoundId[]) => ids.reduce((sum, id) => sum + (f.share[id] ?? 0), 0);
  const scored = SCENARIOS.map((sc, order) => ({ sc, order, score: sc.score(f, s) }))
    .filter(x => x.score >= 0.35)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const picks: ScenarioPick[] = [];
  const families = new Set<string>();
  for (const { sc } of scored) {
    if (families.has(sc.family)) continue;
    families.add(sc.family);
    // The reason names the Mix's own sounds that make the case, loudest first.
    const names = sc.sounds.filter(id => (f.share[id] ?? 0) > 0.05).sort((a, b) => (f.share[b] ?? 0) - (f.share[a] ?? 0)).slice(0, 2).map((id, i) => (i === 0 ? SOUNDS[id].name : lowerFirst(SOUNDS[id].name)));
    const lead = names.length ? listNames(names) : 'These sounds';
    // Seagulls and Night crickets read as plural on their own.
    const plural = names.length !== 1 || /s$/.test(names[0]);
    picks.push({ id: sc.id, label: sc.label, why: `${lead} ${sc.phrase[plural ? 0 : 1]}.` });
    if (picks.length >= count) break;
  }
  return picks;
}
