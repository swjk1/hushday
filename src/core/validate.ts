import { LEGACY_SOUNDS, SOUNDS, isSoundId } from './sounds.js';
import type { MixComponent, MixDraft } from './types.js';

/** The quick choices in the editor. */
export const LENGTH_OPTIONS_MIN = [10, 20, 30, 45, 60];
/** A custom length is any whole number of minutes in this range: long enough for a few one-minute blocks,
 * short enough to arrange comfortably on the timeline. */
export const MIN_LENGTH_MIN = 5;
export const MAX_LENGTH_MIN = 120;
export const MAX_COMPONENTS = 8;
export const MIN_SPAN_SEC = 60;
export const MAX_NAME = 40;

export class MixValidationError extends Error {}

const fail = (message: string): never => {
  throw new MixValidationError(message);
};

/** Turns untrusted input into a clean MixDraft, or throws a message fit to show the user. */
export function sanitizeDraft(input: unknown): MixDraft {
  if (!input || typeof input !== 'object') fail('Missing Mix');
  const raw = input as Record<string, unknown>;

  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) fail('Give your Mix a name');
  if (name.length > MAX_NAME) fail(`Keep the name under ${MAX_NAME} characters`);

  const lengthSec = Number(raw.lengthSec);
  const minutes = lengthSec / 60;
  if (!Number.isInteger(minutes) || minutes < MIN_LENGTH_MIN || minutes > MAX_LENGTH_MIN) fail(`Pick a length from ${MIN_LENGTH_MIN} to ${MAX_LENGTH_MIN} minutes`);

  const repeat = raw.repeat === 'sustain' ? 'sustain' : 'loop';

  if (!Array.isArray(raw.components) || raw.components.length === 0) fail('Add at least one sound');
  const list = raw.components as unknown[];
  if (list.length > MAX_COMPONENTS) fail(`A Mix can hold up to ${MAX_COMPONENTS} sounds`);

  const ids = new Set<string>();
  const components: MixComponent[] = list.map((item, index) => {
    const c = (item ?? {}) as Record<string, unknown>;
    // Mixes saved before a sound was retired keep playing with its nearest replacement.
    const sound = typeof c.sound === 'string' && c.sound in LEGACY_SOUNDS ? LEGACY_SOUNDS[c.sound] : c.sound;
    if (!isSoundId(sound)) fail('Unknown sound in this Mix');
    let id = typeof c.id === 'string' && c.id.length <= 40 && c.id ? c.id : `c${index}`;
    if (ids.has(id)) id = `${id}-${index}`;
    ids.add(id);
    const start = Math.round(Number(c.start));
    const end = Math.round(Number(c.end));
    if (!Number.isFinite(start) || !Number.isFinite(end)) fail('Check the timing of each sound');
    if (start < 0 || end > lengthSec || end - start < MIN_SPAN_SEC) fail('Each sound needs at least a minute inside the Mix');
    const level = Math.round(Math.min(1, Math.max(0, Number(c.level) || 0)) * 100) / 100;
    const row = Number.isInteger(c.row) ? Math.min(MAX_COMPONENTS - 1, Math.max(0, c.row as number)) : index;
    // Keep a variant only if this sound actually offers it; anything else plays the original.
    const variant = SOUNDS[sound as MixComponent['sound']].variants?.find(v => v.id === c.variant)?.id;
    return { id, sound: sound as MixComponent['sound'], start, end, level, entry: c.entry === 'slow' ? 'slow' : 'soft', row, ...(variant ? { variant } : {}) };
  });

  if (!components.some(c => SOUNDS[c.sound].category !== 'quiet' && c.level >= 0.05)) fail('Add a sound you can hear');

  const parentMixId = typeof raw.parentMixId === 'string' && raw.parentMixId.length <= 64 ? raw.parentMixId : null;
  // Auto-Blend: kept only as { on, v } with a sensible rule version; anything else plays as the original.
  const b = raw.blend as { on?: unknown; v?: unknown } | undefined;
  const v = Number(b?.v);
  const blend = b && typeof b === 'object' && Number.isInteger(v) && v >= 1 && v <= 99 ? { on: b.on === true, v } : undefined;
  return { name, lengthSec, repeat, components, parentMixId, ...(blend ? { blend } : {}) };
}
