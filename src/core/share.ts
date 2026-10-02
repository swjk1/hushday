import type { MixDraft } from './types.js';
import { sanitizeDraft } from './validate.js';

/**
 * Share codes: a whole Mix packed into a short, URL-safe string, so a link carries the Mix
 * itself and works for anyone without an account. Times are stored in 10-second steps and
 * levels in percent; decoding runs the same validation as saving.
 */
const VERSION = 1;

/**
 * Sound slot numbers inside a code. Positions are permanent: a retired sound keeps its slot
 * (validation swaps it for its replacement) and new sounds go on the end, so old links keep
 * decoding to the same Mix. Never reorder this list.
 */
const SLOTS: string[] = ['brown', 'red', 'pink', 'white', 'hifreq', 'rain', 'ocean', 'wind', 'focus', 'quiet', 'tone432', 'tone528', 'fan', 'stream', 'fire', 'night', 'zen'];

type Packed = [v: number, name: string, lengthMin: number, repeat: 0 | 1, parts: [sound: number, start: number, end: number, level: number, slow: 0 | 1, row?: number, variant?: number][], blend?: [on: 0 | 1, v: number]];

/** Variant codes inside a part. Appended only when a block uses one, so older links stay short and older apps ignore it. */
const VARIANT_CODES = ['', 'a', 'b'] as const;

const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code: string) => {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
};

export function encodeMix(mix: MixDraft): string {
  const packed: Packed = [
    VERSION, mix.name, mix.lengthSec / 60, mix.repeat === 'sustain' ? 1 : 0,
    mix.components.map(c => {
      const part: Packed[4][number] = [SLOTS.indexOf(c.sound), Math.round(c.start / 10), Math.round(c.end / 10), Math.round(c.level * 100), c.entry === 'slow' ? 1 : 0, c.row ?? 0];
      if (c.variant) part.push(VARIANT_CODES.indexOf(c.variant));
      return part;
    }),
  ];
  // Auto-Blend rides along as an optional sixth element; older apps ignore it and play the original.
  if (mix.blend) packed.push([mix.blend.on ? 1 : 0, mix.blend.v]);
  return toBase64Url(JSON.stringify(packed));
}

/** Returns null for anything that isn't a valid share code. */
export function decodeMix(code: string): MixDraft | null {
  try {
    const [v, name, lengthMin, repeat, parts, blend] = JSON.parse(fromBase64Url(code)) as Packed;
    if (v !== VERSION || !Array.isArray(parts)) return null;
    return sanitizeDraft({
      name, lengthSec: lengthMin * 60, repeat: repeat ? 'sustain' : 'loop', parentMixId: null,
      blend: Array.isArray(blend) ? { on: blend[0] === 1, v: blend[1] } : undefined,
      components: parts.map(([s, start, end, level, slow, row, variant], i) => ({
        variant: variant ? VARIANT_CODES[variant] || undefined : undefined,
        id: `s${i}`, sound: SLOTS[s], start: start * 10, end: end * 10, level: level / 100, entry: slow ? 'slow' : 'soft', row: row ?? i,
      })),
    });
  } catch {
    return null;
  }
}
