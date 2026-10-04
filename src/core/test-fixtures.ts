import type { Mix, MixComponent, SoundId } from './types.js';

/**
 * The curated Mixes as they first shipped, frozen for tests that check timing and Auto-Blend v1 against fixed
 * arrangements. The live list in catalog.ts can change; these never do.
 */
const MIN = 60;
const part = (id: string, sound: SoundId, startMin: number, endMin: number, level: number, entry: MixComponent['entry'] = 'soft'): MixComponent =>
  ({ id, sound, start: startMin * MIN, end: endMin * MIN, level, entry });
const mix = (id: string, name: string, lengthMin: number, repeat: Mix['repeat'], components: MixComponent[]): Mix =>
  ({ id, name, lengthSec: lengthMin * MIN, repeat, components, creatorId: null, curated: true, createdAt: '2026-09-26T00:00:00.000Z', parentMixId: null });

export const FIRST_CURATED: Mix[] = [
  mix('c-locked-in', 'LOCKED IN', 30, 'loop', [
    part('brown', 'brown', 0, 30, 0.78),
    part('rain', 'rain', 3, 30, 0.52, 'slow'),
    part('focus', 'focus', 12, 20, 0.66),
    part('quiet', 'quiet', 22, 25, 0.85),
  ]),
  mix('c-deep-end', 'DEEP END', 20, 'loop', [
    part('brown', 'brown', 0, 20, 0.72),
    part('ocean', 'ocean', 0, 20, 0.3),
  ]),
  mix('c-soft-static', 'SOFT STATIC', 20, 'loop', [
    part('pink', 'pink', 0, 20, 0.7),
    part('white', 'white', 0, 20, 0.28),
  ]),
  mix('c-rain-room', 'RAIN ROOM', 20, 'loop', [
    part('rain', 'rain', 0, 20, 0.74),
    part('brown', 'brown', 0, 20, 0.3),
  ]),
  mix('c-low-tide', 'LOW TIDE', 30, 'sustain', [
    part('ocean', 'ocean', 0, 30, 0.62),
    part('brown', 'brown', 6, 30, 0.42, 'slow'),
  ]),
];
