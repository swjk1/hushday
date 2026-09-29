import type { Entry, Mix, MixComponent, ShortExperience, SoundId } from './types.js';

const MIN = 60;

function part(id: string, sound: SoundId, startMin: number, endMin: number, level: number, entry: Entry = 'soft'): MixComponent {
  return { id, sound, start: startMin * MIN, end: endMin * MIN, level, entry };
}

function curated(id: string, name: string, tagline: string, lengthMin: number, repeat: Mix['repeat'], components: MixComponent[]): Mix {
  return { id, name, tagline, lengthSec: lengthMin * MIN, repeat, components, creatorId: null, curated: true, createdAt: '2026-09-26T00:00:00.000Z', parentMixId: null };
}

export const CURATED_MIXES: Mix[] = [
  curated('c-locked-in', 'LOCKED IN', 'Long, deep work. Rain rolls in, a focus hit lands, a breath, then back under.', 30, 'loop', [
    part('brown', 'brown', 0, 30, 0.78),
    part('rain', 'rain', 3, 30, 0.52, 'slow'),
    part('focus', 'focus', 12, 20, 0.66),
    part('quiet', 'quiet', 22, 25, 0.85),
  ]),
  curated('c-deep-end', 'DEEP END', 'Warm, low and steady. For reading and long stretches.', 20, 'loop', [
    part('brown', 'brown', 0, 20, 0.72),
    part('ocean', 'ocean', 0, 20, 0.3),
  ]),
  curated('c-soft-static', 'SOFT STATIC', 'Blocks out voices, trains and open offices.', 20, 'loop', [
    part('pink', 'pink', 0, 20, 0.7),
    part('white', 'white', 0, 20, 0.28),
  ]),
  curated('c-rain-room', 'RAIN ROOM', 'Rain on the window, a low hum underneath.', 20, 'loop', [
    part('rain', 'rain', 0, 20, 0.74),
    part('brown', 'brown', 0, 20, 0.3),
  ]),
  curated('c-low-tide', 'LOW TIDE', 'Waves settle into a deep hush and stay there.', 30, 'sustain', [
    part('ocean', 'ocean', 0, 30, 0.62),
    part('brown', 'brown', 6, 30, 0.42, 'slow'),
  ]),
];

/** User-facing name for the short format. Change it here; the model calls it ShortExperience. */
export const SHORT_FORMAT_NAME = { singular: 'Shot', plural: 'Shots' };

export const SHORT_EXPERIENCES: ShortExperience[] = [
  {
    id: 'short-focus',
    name: 'Focus Shot',
    durationSec: 8 * MIN,
    protocol: 'focus-am-v1',
    visual: 'pulse',
    description: 'Eight minutes of concentrated focus audio. Press play and get into it.',
    metadata: { modulation: 'amplitude, ~16 pulses/sec', bed: 'pink noise, low' },
    mix: {
      name: 'Focus Shot',
      lengthSec: 8 * MIN,
      repeat: 'sustain',
      components: [part('focus', 'focus', 0, 8, 0.74), part('pink', 'pink', 0, 8, 0.3)],
    },
  },
];

export const FEATURED_MIX_ID = 'c-locked-in';
export const ZONE_DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
  { label: 'Until stopped', minutes: null },
];
