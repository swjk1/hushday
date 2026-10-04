import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURATED_MIXES } from './catalog.js';
import { FIRST_CURATED } from './test-fixtures.js';
import { canonicalize } from './fingerprint.js';
import { decodeMix, encodeMix } from './share.js';
import { SOUNDS } from './sounds.js';
import { breakpointTimes, duckAt, envelopeAt, layerAt, positionAt } from './timeline.js';
import type { MixComponent, MixDraft } from './types.js';
import { MixValidationError, sanitizeDraft } from './validate.js';

const c = (sound: MixComponent['sound'], startMin: number, endMin: number, level: number, id: string = sound): MixComponent => ({
  id, sound, start: startMin * 60, end: endMin * 60, level, entry: 'soft',
});
const mix = (components: MixComponent[], lengthMin = 30): MixDraft => ({ name: 'Test', lengthSec: lengthMin * 60, repeat: 'loop', components });

describe('fingerprint', () => {
  it('treats small slider differences as the same discovery', () => {
    expect(canonicalize(mix([c('brown', 0, 30, 0.41), c('rain', 0, 30, 0.2)]))).toBe(
      canonicalize(mix([c('brown', 0, 30, 0.42), c('rain', 0, 30, 0.2)])),
    );
  });

  it('ignores layer order, names and ids', () => {
    const a = mix([c('brown', 0, 30, 0.7), c('rain', 0, 30, 0.5)]);
    const b = { ...mix([c('rain', 0, 30, 0.5, 'x'), c('brown', 0, 30, 0.7, 'y')]), name: 'Other' };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('separates major intensity differences', () => {
    expect(canonicalize(mix([c('brown', 0, 30, 0.2)]))).not.toBe(canonicalize(mix([c('brown', 0, 30, 0.9)])));
  });

  it('separates structure: sections, quiet placement and slow entries', () => {
    const base = mix([c('brown', 0, 30, 0.7), c('focus', 12, 20, 0.7)]);
    const later = mix([c('brown', 0, 30, 0.7), c('focus', 22, 29, 0.7)]);
    const withQuiet = mix([...base.components, c('quiet', 22, 25, 1)]);
    const slow = mix([c('brown', 0, 30, 0.7), { ...c('focus', 12, 20, 0.7), entry: 'slow' }]);
    const all = [base, later, withQuiet, slow].map(canonicalize);
    expect(new Set(all).size).toBe(4);
  });

  it('buckets nearby lengths together but not wildly different ones', () => {
    const a = canonicalize(mix([c('pink', 0, 20, 0.6)], 20));
    const b = canonicalize(mix([c('pink', 0, 30, 0.6)], 30));
    const d = canonicalize(mix([c('pink', 0, 60, 0.6)], 60));
    expect(a).toBe(b);
    expect(a).not.toBe(d);
  });
});

describe('timeline', () => {
  const locked = FIRST_CURATED[0];

  it('keeps full-length layers continuous across loop boundaries', () => {
    const brown = locked.components[0];
    expect(envelopeAt(brown, 0, locked)).toBe(1);
    expect(envelopeAt(brown, locked.lengthSec, locked)).toBe(1);
  });

  it('starts a slow entry already audible and swells within 90 seconds', () => {
    const m = mix([c('brown', 0, 30, 0.7), { ...c('rain', 10, 25, 0.5), entry: 'slow' }]);
    const rain = m.components[1];
    expect(envelopeAt(rain, 10 * 60 - 1, m)).toBe(0);
    expect(envelopeAt(rain, 10 * 60, m)).toBeCloseTo(0.2);
    expect(envelopeAt(rain, 10 * 60 + 45, m)).toBeGreaterThan(0.5);
    expect(envelopeAt(rain, 10 * 60 + 90, m)).toBe(1);
    // Silence is pinned a second before the step so the audio ramp is short, not minutes long.
    expect(breakpointTimes(rain, m)).toContain(10 * 60 - 1);
  });

  it('ducks everything during a quiet section on a track of its own', () => {
    // These blocks have no tracks (an older Mix), so the Quiet block is braided with nothing and quiets every sound.
    for (const layer of locked.components.filter(x => x.sound !== 'quiet')) {
      expect(duckAt(locked, layer, 23.5 * 60)).toBeLessThan(0.2);
      expect(duckAt(locked, layer, 10 * 60)).toBe(1);
    }
  });

  it('quiets only the sounds a Quiet block is dropped onto', () => {
    const on = (x: MixComponent, row: number) => ({ ...x, row });
    const rain = on(c('rain', 0, 30, 0.5), 0), brown = on(c('brown', 0, 30, 0.5), 1), zen = on(c('zen', 0, 30, 0.5), 2);
    const quiet = on(c('quiet', 10, 20, 0.9), 0);
    const m = mix([rain, brown, zen, quiet]);
    // Braided with the rain (same track, overlapping): the rain dips, the others play on.
    expect(duckAt(m, rain, 15 * 60)).toBeLessThan(0.2);
    expect(duckAt(m, brown, 15 * 60)).toBe(1);
    expect(duckAt(m, zen, 15 * 60)).toBe(1);
    expect(duckAt(m, rain, 5 * 60)).toBe(1);
    // On a track of its own, overlapping nothing there, it quiets everything.
    const alone = mix([rain, brown, zen, on(quiet, 3)]);
    for (const x of [rain, brown, zen]) expect(duckAt(alone, x, 15 * 60)).toBeLessThan(0.2);
    // Two sounds braided on one track both dip under it; a sound on another track does not.
    const mid = mix([on(c('rain', 0, 12, 0.5), 0), on(c('brown', 4, 30, 0.5, 'b2'), 0), zen, on(c('quiet', 5, 10, 0.9), 0)]);
    expect(duckAt(mid, mid.components[1], 7 * 60)).toBeLessThan(0.2);
    expect(duckAt(mid, zen, 7 * 60)).toBe(1);
    // The level a sound plays at is its own fades times the dip over it.
    expect(layerAt(m, rain, 15 * 60)).toBeCloseTo(envelopeAt(rain, 15 * 60, m) * duckAt(m, rain, 15 * 60));
  });

  it('loops or holds when a Zone outlasts the Mix', () => {
    expect(positionAt(locked, 65 * 60)).toMatchObject({ pass: 2, pos: 5 * 60 });
    const tide = FIRST_CURATED.find(m => m.id === 'c-low-tide')!;
    expect(positionAt(tide, 5 * 3600)).toMatchObject({ sustaining: true, pos: tide.lengthSec });
    const tideBrown = tide.components[1];
    expect(envelopeAt(tideBrown, tide.lengthSec, tide)).toBe(1);
  });

  it('eases sections and quiet dips in and out instead of stepping', () => {
    const shape = { lengthSec: 30 * 60, repeat: 'loop' as const };
    const focus = c('focus', 10, 18, 0.7);
    const quiet = c('quiet', 20, 25, 0.9);
    const dip = mix([c('brown', 0, 30, 0.7), quiet]);
    let worst = 0;
    for (let t = 0; t < shape.lengthSec; t++) {
      worst = Math.max(worst, Math.abs(envelopeAt(focus, t + 1, shape) - envelopeAt(focus, t, shape)));
      worst = Math.max(worst, Math.abs(duckAt(dip, dip.components[0], t + 1) - duckAt(dip, dip.components[0], t)));
    }
    // No single second moves the level more than a small, audibly smooth step.
    expect(worst).toBeLessThan(0.08);
    // S-curve: slow at the very start of the fade, not a straight ramp.
    expect(envelopeAt(focus, 10 * 60 + 3, shape)).toBeLessThan(3 / 30);
  });

  it('produces sorted breakpoints bounded by the Mix', () => {
    for (const component of locked.components) {
      const times = breakpointTimes(component, locked);
      expect(times[0]).toBe(0);
      expect(times.at(-1)).toBe(locked.lengthSec);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });
});

describe('validation', () => {
  it('accepts the curated Mixes', () => {
    for (const m of CURATED_MIXES) expect(() => sanitizeDraft(m)).not.toThrow();
  });

  it('accepts any whole-minute length from 5 to 120, and nothing else', () => {
    for (const min of [5, 7, 37, 60, 120]) expect(sanitizeDraft({ ...mix([c('brown', 0, min, 0.5)], min) }).lengthSec).toBe(min * 60);
    for (const sec of [4 * 60, 121 * 60, 7.5 * 60, 0, -60]) expect(() => sanitizeDraft({ ...mix([c('brown', 0, 4, 0.5)]), lengthSec: sec })).toThrow(MixValidationError);
  });

  it('keeps a custom length through a share link', () => {
    const back = decodeMix(encodeMix({ ...mix([c('brown', 0, 37, 0.5)], 37), name: 'ODD' }))!;
    expect(back.lengthSec).toBe(37 * 60);
  });

  it('rejects Mixes with nothing audible or bad timing', () => {
    expect(() => sanitizeDraft(mix([c('quiet', 0, 5, 1)]))).toThrow(MixValidationError);
    expect(() => sanitizeDraft(mix([c('brown', 0, 45, 0.5)]))).toThrow(MixValidationError);
    expect(() => sanitizeDraft({ ...mix([c('brown', 0, 30, 0.5)]), lengthSec: 1234 })).toThrow(MixValidationError);
  });
});

describe('share codes', () => {
  it('round-trips a Mix through a link, new sounds included', () => {
    const original = { ...mix([c('red', 0, 30, 0.7), c('tone528', 5, 12, 0.3), c('wind', 10, 25, 0.55), c('quiet', 22, 26, 0.9)]), name: 'DEEP END' };
    const code = encodeMix(original);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeMix(code)!;
    expect(back.name).toBe('DEEP END');
    expect(canonicalize(back)).toBe(canonicalize(original));
  });

  it('keeps old links playable after a sound is retired', () => {
    // Slot 4 was Hi-freq; the number stays reserved and decodes to its replacement.
    const legacy = btoa(JSON.stringify([1, 'OLD', 30, 0, [[4, 0, 180, 40, 0, 0], [5, 0, 180, 60, 0, 1]]]));
    const back = decodeMix(legacy)!;
    expect(back.components.map(c => c.sound)).toEqual(['white', 'rain']);
    expect(sanitizeDraft(mix([{ ...c('white', 0, 30, 0.4), sound: 'hifreq' as never }])).components[0].sound).toBe('white');
  });

  it('rejects codes that are not Mixes', () => {
    expect(decodeMix('not-a-mix')).toBeNull();
    expect(decodeMix(encodeMix({ ...mix([c('brown', 0, 30, 0.5)]), name: 'X' }).slice(0, 10))).toBeNull();
  });
});

describe('recorded sounds', () => {
  const recorded = Object.values(SOUNDS).filter(s => s.sample);

  it('plays every nature sound from a recording, in every version, each with a usable loop and a credit', () => {
    const nature = Object.values(SOUNDS).filter(s => s.family === 'Nature').map(s => s.id).sort();
    expect(recorded.map(s => s.id).sort()).toEqual(nature);
    const loops = [...recorded.map(s => s.sample!), ...recorded.flatMap(s => s.variants ?? []).map(v => v.sample)];
    expect(loops.every(Boolean)).toBe(true);
    for (const { file, loopStart, loopEnd, credit } of loops as NonNullable<(typeof loops)[number]>[]) {
      expect(file).toMatch(/^sounds\/[a-z]+(-[a-z]+)?\.mp3$/);
      expect(existsSync(new URL(`../../public/${file}`, import.meta.url))).toBe(true);
      // The wrap-around margin before loopStart is what keeps the seam clean.
      expect(loopStart).toBeGreaterThanOrEqual(0.25);
      expect(loopEnd - loopStart).toBeGreaterThan(30);
      expect(credit).toMatch(/Public Domain Mark|CC0|CC BY 4\.0/);
    }
  });
});

describe('sound versions', () => {
  const withVariants = Object.values(SOUNDS).filter(s => s.variants);

  it('offers other versions for six nature sounds, each calibrated and described', () => {
    // Each sound's previous original stays on as version f (listed first); Rain has a second recording, and Wind
    // and Stream more. Ids are never reused: a and b were retired, and Stream's e became its original.
    expect(withVariants.map(s => s.id).sort()).toEqual(['fire', 'night', 'ocean', 'rain', 'stream', 'wind']);
    const ids: Record<string, string[]> = { rain: ['b'], wind: ['f', 'c', 'd', 'e'], stream: ['f', 'c', 'd'], ocean: ['f'], fire: ['f'], night: ['f'] };
    for (const s of withVariants) {
      expect(s.variants!.map(v => v.id)).toEqual(ids[s.id]);
      if (s.freq) for (const v of s.variants!) expect(v.synth?.tone).toBe(s.freq);
      for (const v of s.variants!) {
        expect(v.gain).toBeGreaterThan(0);
        // Each version is either generated or recorded, never both or neither.
        expect(!!v.synth !== !!v.sample).toBe(true);
        expect(v.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('keeps a valid version through saving and drops one a sound does not offer', () => {
    // Rain offers B; Fire's versions were retired, so an old Fire A plays the original; Brown never had one.
    const clean = sanitizeDraft(mix([{ ...c('rain', 0, 30, 0.5), variant: 'b' }, { ...c('fire', 0, 30, 0.5), variant: 'a' }, { ...c('brown', 0, 30, 0.5), variant: 'b' }, { ...c('wind', 0, 30, 0.5), variant: 'z' as never }]));
    expect(clean.components.map(x => x.variant)).toEqual(['b', undefined, undefined, undefined]);
  });

  it('carries versions through share links, and leaves originals exactly as before', () => {
    const original = { ...mix([{ ...c('rain', 0, 30, 0.6), variant: 'b' }, c('brown', 0, 30, 0.7)]), name: 'SHORE' };
    const back = decodeMix(encodeMix(original))!;
    expect(back.components.map(x => x.variant)).toEqual(['b', undefined]);
    const later = { ...mix([{ ...c('wind', 0, 30, 0.6), variant: 'e' }, { ...c('stream', 0, 30, 0.6), variant: 'c' }]), name: 'GUST' };
    expect(decodeMix(encodeMix(later))!.components.map(x => x.variant)).toEqual(['e', 'c']);
    // A Mix without versions encodes exactly as it did before versions existed.
    const plain = { ...mix([c('brown', 0, 30, 0.7)]), name: 'PLAIN' };
    const packed = JSON.parse(atob(encodeMix(plain).replace(/-/g, '+').replace(/_/g, '/')));
    expect(packed[4][0]).toHaveLength(6);
  });

  it('treats a version as its own discovery, without changing the originals', () => {
    const a = canonicalize(mix([c('fire', 0, 30, 0.5)]));
    expect(a).toContain('fire@full');
    expect(canonicalize(mix([{ ...c('fire', 0, 30, 0.5), variant: 'b' }]))).not.toBe(a);
  });
});
