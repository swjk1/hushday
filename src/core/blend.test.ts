import { describe, expect, it } from 'vitest';
import { autoLevels, blendDbAt, blendGainAt, blendHints, planBlend, withAutoLevels } from './blend.js';
import { RULES } from './blend-rules.js';
import { PACE_RATE, loopMotion, motionAt, motionDepth, paceCurve, paceDbAt, paceWeightAt } from './pace.js';
import { BLEND_VERSION } from './blend-version.js';
import { FIRST_CURATED } from './test-fixtures.js';
import { canonicalize } from './fingerprint.js';
import { decodeMix, encodeMix } from './share.js';
import { SOUNDS, SOUND_ORDER } from './sounds.js';
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
  // A Mix holds at most eight blocks, so this is every combination of the 16 sounds that can actually be made.
  // Exhaustive, so it runs longer than the default time limit.
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
    expect(checked).toBe(39202);
  }, 60_000);

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

  // Exhaustive, so it runs longer than the default time limit.
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
          // A block with Slow in that starts at minute 0 steps in at 20% at the loop point by design; the cuts
          // move with that audible step, so only arrangements without one must meet exactly.
          const stepsInAtSeam = comps.some(o => o.start === 0 && o.entry === 'slow');
          if (repeat === 'loop' && !stepsInAtSeam) expect(Math.abs(blendDbAt(plan, c.id, mix.lengthSec) - blendDbAt(plan, c.id, 0))).toBeLessThan(0.05);
        }
      }
    }
  }, 60_000);

  it('balances a bed, a texture and a second bed the way the rules describe', () => {
    const plan = planBlend(mixOf([block('brown', 0, 30), block('rain', 0, 30), block('ocean', 0, 30)]))!;
    // Rain is the texture both beds make room for; it is cut least.
    expect(blendDbAt(plan, 'rain', 600)).toBeGreaterThan(blendDbAt(plan, 'brown', 600));
    expect(blendDbAt(plan, 'rain', 600)).toBeGreaterThan(blendDbAt(plan, 'ocean', 600));
    expect(plan.makeupDb).toBeGreaterThan(0);
  });

  it('is frozen for version 1: the curated Mixes plan exactly as recorded', () => {
    const plans = Object.fromEntries(FIRST_CURATED.map(m => [m.id, planBlend({ ...m, blend: { on: true, v: 1 } })]));
    expect(plans).toMatchSnapshot();
  });
});

describe('Auto-Blend hints', () => {
  it('suggests separating clashing tones, and leaves simple-ratio pitches alone', () => {
    expect(blendHints(mixOf([block('tone432', 0, 30), block('tone528', 0, 30)])).map(h => h.kind)).toEqual(['tones']);
    // Zen's 108 and 162 Hz sit at 4:1 and 8:3 (a fourth, octaves folded) under 432 Hz: no clash.
    expect(blendHints(mixOf([block('tone432', 0, 30), block('zen', 0, 30)]))).toEqual([]);
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

describe('Auto-Blend pace matching (v2)', () => {
  it('lets the waves lead and the other recordings follow, leaving noises and tones alone', () => {
    const pace = planBlend(mixOf([block('brown', 0, 30), block('wind', 0, 30), block('ocean', 0, 30), block('rain', 0, 30), block('tone432', 0, 30)]))!.pace!;
    expect(pace.lead).toBe('ocean');
    expect(Object.keys(pace.followers).sort()).toEqual(['rain', 'wind']);
    // Wind rides the swell more than steady rain does.
    expect(pace.followers.wind.follow).toBeGreaterThan(pace.followers.rain.follow);
  });

  it('falls back to the gusts without waves, and does nothing for recordings that never overlap', () => {
    expect(planBlend(mixOf([block('wind', 0, 30), block('stream', 0, 30)]))!.pace!.lead).toBe('wind');
    expect(planBlend(mixOf([block('ocean', 0, 10), block('rain', 15, 30)]))!.pace).toBeUndefined();
    // Ocean overlaps nothing, so the wind leads the rain instead.
    expect(planBlend(mixOf([block('ocean', 0, 10), block('wind', 12, 30), block('rain', 12, 30)]))!.pace!.lead).toBe('wind');
    expect(planBlend(mixOf([block('brown', 0, 30), block('rain', 0, 30)]))!.pace).toBeUndefined();
  });

  it('is off for version 1 and when Auto-Blend is off', () => {
    const comps = [block('ocean', 0, 30), block('wind', 0, 30)];
    expect(planBlend({ ...mixOf(comps), blend: { on: true, v: 1 } })!.pace).toBeUndefined();
    expect(planBlend({ ...mixOf(comps), blend: { on: false, v: BLEND_VERSION } })).toBeNull();
  });

  it('never depends on order or levels', () => {
    const comps = [block('ocean', 0, 20, 'o1'), block('ocean', 5, 30, 'o2'), block('wind', 0, 30, 'w'), block('stream', 10, 30, 's')];
    const a = planBlend(mixOf(comps))!.pace;
    const rand = rng(7);
    const b = planBlend(mixOf([...comps].reverse().map(c => ({ ...c, level: 0.1 + rand() * 0.9 }))))!.pace;
    expect(b).toEqual(a);
    // Two Oceans: the earlier one leads and the other falls in with its waves.
    expect(a!.lead).toBe('o1');
    expect(a!.followers.o2).toBeDefined();
  });

  it('swells in and out with the leader’s own fades', () => {
    const mix = mixOf([block('ocean', 10, 20), block('wind', 0, 30)]);
    const pace = planBlend(mix)!.pace!;
    expect(paceWeightAt(pace, 5 * 60)).toBe(0);
    expect(paceWeightAt(pace, 15 * 60)).toBe(1);
    expect(paceWeightAt(pace, 25 * 60)).toBe(0);
  });

  it('measures a loop’s slow motion seamlessly, around its own average', () => {
    const sr = 400, period = 90, n = sr * period;
    // Noise whose level swells ±3 dB once every 10 s.
    const rand = rng(3);
    const ch = Float32Array.from({ length: n }, (_, i) => (rand() * 2 - 1) * Math.pow(10, (3 * Math.sin((2 * Math.PI * i) / (sr * 10))) / 20));
    const motion = loopMotion([ch], sr, 0, n);
    expect(motion.length).toBe(period * PACE_RATE);
    expect(Math.abs(motion.reduce((s, v) => s + v, 0) / motion.length)).toBeLessThan(1e-3);
    expect(motionDepth(motion)).toBeGreaterThan(3.5);
    expect(motionDepth(motion)).toBeLessThan(6.5);
    // Steady noise barely moves.
    const flat = loopMotion([Float32Array.from({ length: n }, () => rand() * 2 - 1)], sr, 0, n);
    expect(motionDepth(flat)).toBeLessThan(0.6);
    // Wrapping: the end of the loop runs straight into its start.
    const loop = { motion, period, phase: 0 };
    expect(Math.abs(motionAt(loop, period - 1e-6) - motionAt(loop, 0))).toBeLessThan(0.05);
  });

  it('stays within its bounds, moves slowly, and is exactly 1 where it does not apply', () => {
    const mix = mixOf([block('ocean', 5, 25), block('wind', 0, 30), block('brown', 0, 30)]);
    const pace = planBlend(mix)!.pace!;
    const wave = (depth: number, sec: number) => Float32Array.from({ length: 90 * PACE_RATE }, (_, k) => depth * Math.sin((2 * Math.PI * k) / (PACE_RATE * sec)));
    const lead = { motion: wave(3, 10), period: 90, phase: 17.3 };
    const own = { motion: wave(2, 6), period: 90, phase: 41.9 };
    const curve = paceCurve(pace, 'wind', mix, lead, own, 0, mix.lengthSec * 2);
    let prev = 0;
    for (let k = 0; k < curve.length; k++) {
      const db = 20 * Math.log10(curve[k]);
      expect(db).toBeLessThanOrEqual(pace.maxUp + 1e-6);
      expect(db).toBeGreaterThanOrEqual(pace.maxDown - 1e-6);
      if (k > 0) expect(Math.abs(db - prev) * PACE_RATE).toBeLessThan(2);
      prev = db;
    }
    // Before the waves come in, and for a sound that doesn't follow, nothing changes.
    expect(curve[2 * 60 * PACE_RATE]).toBe(1);
    expect(paceDbAt(pace, 'brown', mix, lead, own, 600)).toBe(0);
    // With the waves in, the wind leans into them.
    expect(Math.max(...curve)).toBeGreaterThan(Math.pow(10, 0.5 / 20));
  });
});

describe('Auto-Blend volumes (v3)', () => {
  const lufsOf = (s: SoundId) => RULES[3].data[s].lufs;
  // Loudness of blocks at given levels, relative to each sound's default (level^1.7 amplitude).
  const powerAt = (c: MixComponent, level: number) => Math.pow(10, lufsOf(c.sound) / 10) * Math.pow(level / SOUNDS[c.sound].defaultLevel, 3.4);

  it('only picks volumes when Auto-Blend is on with v3 rules', () => {
    const comps = [block('brown', 0, 30), block('rain', 0, 30)];
    expect(autoLevels({ ...mixOf(comps), blend: { on: true, v: 2 } })).toBeNull();
    expect(autoLevels({ ...mixOf(comps), blend: { on: false, v: 3 } })).toBeNull();
    expect(autoLevels(mixOf(comps))).not.toBeNull();
  });

  it('leaves a sound on its own at its tuned default, whatever its slider said', () => {
    expect(autoLevels(mixOf([block('rain', 0, 30, 'r', { level: 0.95 })]))).toEqual({ r: SOUNDS.rain.defaultLevel });
    // Blocks that never overlap each keep their default too.
    expect(autoLevels(mixOf([block('brown', 0, 10), block('ocean', 15, 30)]))).toEqual({ brown: SOUNDS.brown.defaultLevel, ocean: SOUNDS.ocean.defaultLevel });
  });

  it('turns a stack down together, so it is about as loud as its loudest sound plus a little', () => {
    const comps = [block('brown', 0, 30), block('rain', 0, 30), block('ocean', 0, 30)];
    const levels = autoLevels(mixOf(comps))!;
    for (const c of comps) expect(levels[c.id]).toBeLessThan(SOUNDS[c.sound].defaultLevel);
    const total = comps.reduce((s, c) => s + powerAt(c, levels[c.id]), 0);
    const loudest = Math.max(...comps.map(c => powerAt(c, SOUNDS[c.sound].defaultLevel)));
    // Rounding the sliders to whole percent moves this a few tenths of a dB.
    expect(Math.abs(10 * Math.log10(total / loudest) - 1.5)).toBeLessThan(0.4);
  });

  it('never depends on the sliders of the blocks it controls, or on order', () => {
    const comps = [block('wind', 0, 30), block('stream', 5, 25), block('fire', 0, 20)];
    const rand = rng(11);
    const a = autoLevels(mixOf(comps));
    expect(autoLevels(mixOf([...comps].reverse().map(c => ({ ...c, level: 0.05 + rand() * 0.95 }))))).toEqual(a);
  });

  it('keeps a volume set by hand and balances the rest around it', () => {
    const stack = (brown: Partial<MixComponent>) => autoLevels(mixOf([block('brown', 0, 30, 'b', brown), block('rain', 0, 30), block('ocean', 0, 30)]))!;
    const allAuto = stack({});
    const held = stack({ level: SOUNDS.brown.defaultLevel, manual: true });
    // A block set by hand is never changed; held at full level, it leaves the others to make all the room.
    expect(held.b).toBeUndefined();
    expect(held.rain).toBeLessThan(allAuto.rain);
    expect(held.ocean).toBeLessThan(allAuto.ocean);
    // Turned right down by hand, it barely counts, so the others come back up.
    const low = stack({ level: 0.1, manual: true });
    expect(low.rain).toBeGreaterThan(held.rain);
    expect(Math.min(...Object.values(held))).toBeGreaterThanOrEqual(0.05);
  });

  it('writes its volumes into the Mix, leaves Quiet alone, and settles at once', () => {
    const mix = mixOf([block('brown', 0, 30, 'b', { level: 0.9 }), block('rain', 0, 30, 'r', { level: 0.1 }), block('quiet', 10, 12, 'q', { level: 0.7 })]);
    const once = withAutoLevels(mix);
    expect(once.components.find(c => c.id === 'q')!.level).toBe(0.7);
    expect(once.components.find(c => c.id === 'b')!.level).not.toBe(0.9);
    expect(withAutoLevels(once)).toBe(once);
    // Original keeps every slider exactly as it is.
    const original = { ...mix, blend: { on: false, v: 3 } };
    expect(withAutoLevels(original)).toBe(original);
  });

  it('keeps the hand-set mark through saving and share links', () => {
    const mix = { ...mixOf([block('rain', 0, 30, 'r', { level: 0.3, manual: true }), block('wind', 0, 30, 'w', { variant: 'c', manual: true }), block('brown', 0, 30)]), name: 'HAND', parentMixId: null };
    const clean = sanitizeDraft(mix);
    expect(clean.components.map(c => c.manual)).toEqual([true, true, undefined]);
    expect(sanitizeDraft({ ...mix, components: [{ ...mix.components[0], manual: 'yes' }] }).components[0].manual).toBeUndefined();
    const back = decodeMix(encodeMix(clean))!;
    expect(back.components.map(c => [c.manual, c.variant])).toEqual([[true, undefined], [true, 'c'], [undefined, undefined]]);
  });
});
