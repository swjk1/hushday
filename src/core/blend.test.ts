import { describe, expect, it } from 'vitest';
import { blendDbAt, blendGainAt, blendHints, planBlend } from './blend.js';
import { BLEND_VERSION } from './blend-version.js';
import { CURATED_MIXES } from './catalog.js';
import { canonicalize } from './fingerprint.js';
import { decodeMix, encodeMix } from './share.js';
import { SOUND_ORDER } from './sounds.js';
import type { MixComponent, MixDraft, SoundId } from './types.js';
import { envelopeAt } from './timeline.js';
import { sanitizeDraft } from './validate.js';

const ON = { on: true, v: BLEND_VERSION };
const audible = SOUND_ORDER.filter(s => s !== 'quiet');
const block = (sound: SoundId, startMin: number, endMin: number, id: string = sound, extra: Partial<MixComponent> = {}): MixComponent => ({
  id, sound, start: startMin * 60, end: endMin * 60, level: 0.6, entry: 'soft', ...extra,
});
const mixOf = (components: MixComponent[], lengthMin = 30, repeat: MixDraft['repeat'] = 'loop'): MixDraft => ({
  name: 'T', lengthSec: lengthMin * 60, repeat, components, blend: ON,
});
// A tiny deterministic random source, so failures reproduce.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

describe('Auto-Blend planner', () => {
  // A Mix holds at most eight blocks, so this is every combination that can actually be made: 12,910 of them.
  it('stays small and only cuts, across every combination of up to eight sounds', () => {
    let checked = 0;
    for (let mask = 1; mask < 1 << audible.length; mask++) {
      const set = audible.filter((_, i) => mask & (1 << i));
      if (set.length > 8) continue;
      const plan = planBlend(mixOf(set.map(s => block(s, 0, 30))))!;
      for (const s of set) {
        const db = blendDbAt(plan, s, 600);
        expect(db).toBeLessThanOrEqual(0);
        expect(db).toBeGreaterThanOrEqual(-9);
        // Makeup restores loudness but never lifts a block more than 1 dB above its original level.
        expect(blendGainAt(plan, s, 600)).toBeLessThanOrEqual(Math.pow(10, 1 / 20) + 1e-12);
      }
      expect(plan.makeupDb).toBeGreaterThanOrEqual(0);
      expect(plan.makeupDb).toBeLessThanOrEqual(3);
      if (set.length === 1) {
        expect(blendDbAt(plan, set[0], 600)).toBe(0);
        expect(plan.makeupDb).toBe(0);
      }
      checked++;
    }
    expect(checked).toBe(12910);
  });

  it('never reads levels: any slider setting gives exactly the same plan', () => {
    const r = rng(7);
    for (let n = 0; n < 200; n++) {
      const comps = audible.filter(() => r() < 0.35).slice(0, 8).map((s, i) => block(s, Math.floor(r() * 10), 20 + Math.floor(r() * 10), `b${i}`));
      if (!comps.length) continue;
      const base = planBlend(mixOf(comps));
      const shuffledLevels = comps.map(c => ({ ...c, level: 0.05 + r() * 0.95 }));
      expect(planBlend(mixOf(shuffledLevels))).toEqual(base);
    }
  });

  it('does not depend on the order blocks were added', () => {
    const comps = [block('brown', 0, 30), block('rain', 5, 25), block('ocean', 10, 30), block('wind', 0, 15)];
    const a = planBlend(mixOf(comps))!;
    const b = planBlend(mixOf([...comps].reverse()))!;
    expect(b.makeupDb).toBe(a.makeupDb);
    for (const c of comps) for (const t of [0, 300, 600, 900, 1500]) expect(blendDbAt(b, c.id, t)).toBeCloseTo(blendDbAt(a, c.id, t), 9);
  });

  it('plays as the original when off or absent, and lets quiet and silent blocks be', () => {
    expect(planBlend({ ...mixOf([block('brown', 0, 30)]), blend: undefined })).toBeNull();
    expect(planBlend({ ...mixOf([block('brown', 0, 30)]), blend: { on: false, v: 1 } })).toBeNull();
    const plan = planBlend(mixOf([block('brown', 0, 30), block('rain', 0, 30, 'r', { level: 0.01 }), block('quiet', 10, 15, 'q', { level: 0.9 })]))!;
    expect(Object.keys(plan.voices)).toEqual(['brown']);
    expect(blendDbAt(plan, 'brown', 600)).toBe(0);
  });

  it('moves slowly and meets itself at the loop point', () => {
    const r = rng(11);
    for (let n = 0; n < 60; n++) {
      const comps = audible.filter(() => r() < 0.4).slice(0, 6).map((s, i) => {
        const start = Math.floor(r() * 20), len = 2 + Math.floor(r() * 18);
        return block(s, start, Math.min(30, start + len), `b${i}`, { entry: r() < 0.3 ? 'slow' : 'soft' });
      });
      if (comps.length < 2) continue;
      for (const repeat of ['loop', 'sustain'] as const) {
        const mix = mixOf(comps, 30, repeat);
        const plan = planBlend(mix)!;
        for (const c of comps) {
          let prev = blendDbAt(plan, c.id, 0);
          for (let t = 1; t <= mix.lengthSec; t++) {
            const now = blendDbAt(plan, c.id, t);
            // Only while the block is sounding: at the instant it starts, its cut appears along with it.
            if (envelopeAt(c, t - 1, mix) === 0 || envelopeAt(c, t, mix) === 0) { prev = now; continue; }
            // The steepest a blend can move: its full range (under 9 dB) across the shortest fade any block has
            // (12 s), at the fade curve's steepest point (1.5× its average). That only happens while another block
            // is itself fading in, far faster.
            expect(Math.abs(now - prev)).toBeLessThanOrEqual(1.25);
            prev = now;
          }
          if (repeat === 'loop') expect(Math.abs(blendDbAt(plan, c.id, mix.lengthSec) - blendDbAt(plan, c.id, 0))).toBeLessThan(0.05);
        }
      }
    }
  });

  it('balances a bed, a texture and a second bed the way the rules describe', () => {
    const plan = planBlend(mixOf([block('brown', 0, 30), block('rain', 0, 30), block('ocean', 0, 30)]))!;
    // Rain is the texture both beds make room for; it is cut least.
    expect(blendDbAt(plan, 'rain', 600)).toBeGreaterThan(blendDbAt(plan, 'brown', 600));
    expect(blendDbAt(plan, 'rain', 600)).toBeGreaterThan(blendDbAt(plan, 'ocean', 600));
    expect(plan.makeupDb).toBeGreaterThan(0);
  });

  it('is frozen for version 1: the curated Mixes plan exactly as recorded', () => {
    const plans = Object.fromEntries(CURATED_MIXES.map(m => [m.id, planBlend({ ...m, blend: { on: true, v: 1 } })]));
    expect(plans).toMatchSnapshot();
  });
});

describe('Auto-Blend hints', () => {
  it('suggests separating clashing tones, and leaves simple-ratio pitches alone', () => {
    expect(blendHints(mixOf([block('tone432', 0, 30), block('tone528', 0, 30)])).map(h => h.kind)).toEqual(['tones']);
    expect(blendHints(mixOf([block('tone432', 0, 30), block('focus', 0, 30, 'f', { variant: 'a' })]))).toEqual([]);
    expect(blendHints(mixOf([block('tone432', 0, 10), block('tone528', 15, 30)]))).toEqual([]);
  });

  it('notices a sound stacked on itself and a very dense stack', () => {
    expect(blendHints(mixOf([block('rain', 0, 30, 'r1'), block('rain', 0, 30, 'r2')])).map(h => h.kind)).toEqual(['copies']);
    const dense = blendHints(mixOf([block('rain', 0, 30), block('wind', 0, 30), block('stream', 0, 30), block('fire', 0, 30)]));
    expect(dense.map(h => h.kind)).toContain('dense');
  });
});

describe('Auto-Blend saving and sharing', () => {
  it('keeps the setting through validation and drops junk', () => {
    const base = { name: 'X', lengthSec: 1800, repeat: 'loop', components: [block('brown', 0, 30)] };
    expect(sanitizeDraft({ ...base, blend: { on: true, v: 1 } }).blend).toEqual({ on: true, v: 1 });
    expect(sanitizeDraft({ ...base, blend: { on: 'yes', v: 1 } }).blend).toEqual({ on: false, v: 1 });
    expect(sanitizeDraft({ ...base, blend: { on: true, v: 'one' } }).blend).toBeUndefined();
    expect(sanitizeDraft(base).blend).toBeUndefined();
  });

  it('carries it through share links, which older apps still read as the original', () => {
    const mix = { ...mixOf([block('brown', 0, 30), block('rain', 0, 30)]), name: 'BLEND' };
    const code = encodeMix(mix);
    expect(decodeMix(code)!.blend).toEqual(ON);
    // An older app reads only the first five elements; that still decodes, as the original.
    const packed = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
    expect(packed).toHaveLength(6);
    expect(decodeMix(encodeMix({ ...mix, blend: undefined }))!.blend).toBeUndefined();
  });

  it('is not part of a discovery: on and off are the same Mix to find', () => {
    const mix = mixOf([block('brown', 0, 30), block('rain', 5, 25)]);
    expect(canonicalize(mix)).toBe(canonicalize({ ...mix, blend: undefined }));
  });
});
