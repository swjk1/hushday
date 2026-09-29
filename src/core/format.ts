import { SOUNDS } from './sounds.js';
import type { MixDraft, SoundId } from './types.js';

export function clock(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function roughDuration(totalSec: number) {
  const min = Math.round(totalSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function soundList(sounds: SoundId[]) {
  return sounds.map(s => SOUNDS[s].label).join(' + ');
}

/** Distinct sounds in a Mix, in layer order, for lines like "Brown · Rain · Focus". */
export function mixSounds(mix: MixDraft): SoundId[] {
  const out: SoundId[] = [];
  for (const c of mix.components) if (!out.includes(c.sound)) out.push(c.sound);
  return out;
}

export function ordinal(n: number) {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n.toLocaleString('en-US')}${suffix}`;
}

export function spanLabel(start: number, end: number, lengthSec: number) {
  if (start <= 0 && end >= lengthSec) return 'Whole Mix';
  return `${Math.round(start / 60)}–${Math.round(end / 60)} min`;
}

/** Mix names are stored as typed (older ones upper case); this sets them in title case for display. */
export const title = (name: string) => name.toLowerCase().replace(/(^|\s)\S/g, ch => ch.toUpperCase());
