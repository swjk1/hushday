import { SOUNDS, isSoundId } from './sounds.js';
import type { MixComponent, MixDraft } from './types.js';

export const LENGTH_OPTIONS_MIN = [10, 20, 30, 45, 60];
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
  if (!LENGTH_OPTIONS_MIN.includes(lengthSec / 60)) fail('Pick a Mix length');

  const repeat = raw.repeat === 'sustain' ? 'sustain' : 'loop';

  if (!Array.isArray(raw.components) || raw.components.length === 0) fail('Add at least one sound');
  const list = raw.components as unknown[];
  if (list.length > MAX_COMPONENTS) fail(`A Mix can hold up to ${MAX_COMPONENTS} sounds`);

  const ids = new Set<string>();
  const components: MixComponent[] = list.map((item, index) => {
    const c = (item ?? {}) as Record<string, unknown>;
    if (!isSoundId(c.sound)) fail('Unknown sound in this Mix');
    let id = typeof c.id === 'string' && c.id.length <= 40 && c.id ? c.id : `c${index}`;
    if (ids.has(id)) id = `${id}-${index}`;
    ids.add(id);
    const start = Math.round(Number(c.start));
    const end = Math.round(Number(c.end));
    if (!Number.isFinite(start) || !Number.isFinite(end)) fail('Check the timing of each sound');
    if (start < 0 || end > lengthSec || end - start < MIN_SPAN_SEC) fail('Each sound needs at least a minute inside the Mix');
    const level = Math.round(Math.min(1, Math.max(0, Number(c.level) || 0)) * 100) / 100;
    const row = Number.isInteger(c.row) ? Math.min(MAX_COMPONENTS - 1, Math.max(0, c.row as number)) : index;
    return { id, sound: c.sound as MixComponent['sound'], start, end, level, entry: c.entry === 'slow' ? 'slow' : 'soft', row };
  });

  if (!components.some(c => SOUNDS[c.sound].category !== 'quiet' && c.level >= 0.05)) fail('Add a sound you can hear');

  const parentMixId = typeof raw.parentMixId === 'string' && raw.parentMixId.length <= 64 ? raw.parentMixId : null;
  return { name, lengthSec, repeat, components, parentMixId };
}
