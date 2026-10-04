import { describe, expect, it } from 'vitest';
import { CURATED_MIXES } from './catalog.js';
import { existsSync } from 'node:fs';
import { SCENE_IMAGES } from '../components/scenes.js';
import { SCENARIO_IDS, mixFeatures, recommendScenarios } from './scenarios.js';
import { SOUNDS, SOUND_ORDER } from './sounds.js';
import type { MixComponent, MixDraft, SoundId } from './types.js';

const block = (sound: SoundId, startMin: number, endMin: number, extra: Partial<MixComponent> = {}): MixComponent => ({
  id: `${sound}-${startMin}`, sound, start: startMin * 60, end: endMin * 60, level: SOUNDS[sound].defaultLevel, entry: 'soft', ...extra,
});
const mixOf = (components: MixComponent[], lengthMin = 30, repeat: MixDraft['repeat'] = 'loop'): MixDraft => ({ name: 'T', lengthSec: lengthMin * 60, repeat, components });
const labels = (m: MixDraft) => recommendScenarios(m).map(p => p.id);

describe('Good for', () => {
  it('reads a Mix the way it plays', () => {
    const f = mixFeatures(mixOf([block('brown', 0, 30), block('rain', 0, 15)]));
    // Brown plays twice as long, so it carries more of the sound.
    expect(f.share.brown!).toBeGreaterThan(f.share.rain!);
    expect(Object.values(f.share).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1);
    expect(f.steady).toBeLessThan(1);
    expect(mixFeatures(mixOf([block('zen', 0, 30), block('quiet', 10, 12, { level: 0.9 })])).breaks).toBe(true);
  });

  it('suits the obvious cases', () => {
    expect(labels(mixOf([block('fire', 0, 30)]))[0]).toBe('cozy-evening');
    expect(labels(mixOf([block('rain', 0, 30), block('brown', 0, 30)]))).toContain('rainy-day');
    expect(labels(mixOf([block('white', 0, 30), block('pink', 0, 30)]))[0]).toBe('blocking-noise');
    expect(labels(mixOf([block('ocean', 0, 60), block('brown', 0, 60)], 60, 'sustain'))[0]).toBe('falling-asleep');
    expect(labels(mixOf([block('zen', 0, 30), block('ocean', 0, 30), block('quiet', 10, 12, { level: 0.9 })]))[0]).toBe('meditation');
    expect(labels(mixOf([block('brown', 0, 25), block('pink', 0, 25), block('focus', 0, 25)], 25))[0]).toBe('deep-work');
    expect(labels(mixOf([block('stream', 0, 20), block('gulls', 0, 20)], 20))).toEqual(expect.arrayContaining(['slow-morning', 'seaside']));
    expect(labels(mixOf([block('night', 0, 30), block('stream', 0, 30)]))[0]).toBe('summer-night');
  });

  it('never offers a sleep Mix with focus pulses, or two picks from one family', () => {
    expect(labels(mixOf([block('brown', 0, 30), block('focus', 0, 30)]))).not.toContain('falling-asleep');
    const fams: Record<string, string> = {
      'late-night-study': 'study', 'deep-work': 'study', 'study-sprint': 'study', 'falling-asleep': 'sleep', 'power-nap': 'sleep', 'settling-a-baby': 'sleep',
      meditation: 'calm', 'slow-breathing': 'calm', 'winding-down': 'calm', 'cozy-evening': 'place', 'rainy-day': 'place', 'summer-night': 'place', seaside: 'place',
      reading: 'day', 'slow-morning': 'day', 'creative-flow': 'day', 'blocking-noise': 'noise', commute: 'noise',
    };
    const audible = SOUND_ORDER.filter(s => s !== 'quiet');
    for (let i = 0; i < audible.length; i++) {
      for (let j = i; j < audible.length; j++) {
        const picks = recommendScenarios(mixOf([block(audible[i], 0, 30), block(audible[j], 0, 30, { id: 'second' })]));
        expect(picks.length).toBeLessThanOrEqual(3);
        const families = picks.map(p => fams[p.id]);
        expect(families.every(Boolean)).toBe(true);
        expect(new Set(families).size).toBe(families.length);
        for (const p of picks) expect(p.why).toMatch(/^[A-Z0-9].+\.$/);
      }
    }
  });

  it('gives every curated Mix something, the same answer every time, whatever the order', () => {
    for (const m of CURATED_MIXES) {
      const a = recommendScenarios(m);
      expect(a.length).toBeGreaterThan(0);
      expect(recommendScenarios({ ...m, components: [...m.components].reverse() })).toEqual(a);
    }
  });

  it('writes its reasons in plain English', () => {
    const [cozy] = recommendScenarios(mixOf([block('fire', 0, 30)]));
    expect(cozy.why).toBe('Fire brings the fireside into the room.');
    const sea = recommendScenarios(mixOf([block('gulls', 0, 20)], 20)).find(p => p.id === 'seaside');
    expect(sea?.why).toBe('Seagulls take you down to the shore.');
  });

  it('has a photo for every scenario, and every photo is there', () => {
    expect(Object.keys(SCENE_IMAGES).sort()).toEqual([...SCENARIO_IDS].sort());
    for (const src of Object.values(SCENE_IMAGES)) expect(existsSync(new URL(`../../public/${src}`, import.meta.url))).toBe(true);
  });
});
