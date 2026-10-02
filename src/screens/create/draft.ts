import { BLEND_VERSION } from '../../core/blend-version';
import { SOUNDS } from '../../core/sounds';
import type { MixComponent, MixDraft, SoundId } from '../../core/types';
import { MAX_COMPONENTS, MIN_SPAN_SEC } from '../../core/validate';
import { findMix } from '../../state/actions';

/** Timeline edits snap to whole minutes. */
export const STEP = 60;
export const snap = (t: number) => Math.round(t / STEP) * STEP;
export const cid = () => Math.random().toString(36).slice(2, 9);

export type EditorMode = 'new' | 'edit' | 'remix';

/** A Mix handed to the editor from elsewhere (a shared link), picked up by the next new draft. */
let handoff: MixDraft | null = null;
export const handOffDraft = (mix: MixDraft) => {
  handoff = mix;
};

/**
 * Gives every block a row. Stored rows are kept as they are (blocks that share a row and
 * overlap are combined on purpose); older Mixes without rows get one free row per block.
 */
export function withRows(components: MixComponent[]): MixComponent[] {
  const placed: MixComponent[] = [];
  for (const c of components) {
    const row = c.row ?? firstFreeRow(placed, c.start, c.end, placed.length) ?? placed.length;
    placed.push({ ...c, row: Math.min(ROWS_MAX - 1, row) });
  }
  return placed;
}

function initial(mode: EditorMode, sourceId?: string): MixDraft {
  const source = sourceId ? findMix(sourceId) : null;
  // An edit keeps the Mix's own Auto-Blend setting and version; a remix inherits it; a new Mix starts with it on.
  if (source && mode === 'edit') return { name: source.name, lengthSec: source.lengthSec, repeat: source.repeat, components: source.components, parentMixId: source.parentMixId ?? null, ...(source.blend ? { blend: source.blend } : {}) };
  if (source && mode === 'remix') {
    return { name: '', lengthSec: source.lengthSec, repeat: source.repeat, components: source.components.map(c => ({ ...c, id: cid() })), parentMixId: source.id, ...(source.blend ? { blend: source.blend } : {}) };
  }
  if (mode === 'new' && handoff) {
    const shared = handoff;
    handoff = null;
    return { ...shared, name: '', components: shared.components.map(c => ({ ...c, id: cid() })), parentMixId: null };
  }
  return { name: '', lengthSec: 30 * 60, repeat: 'loop', components: [], parentMixId: null, blend: { on: true, v: BLEND_VERSION } };
}

export function initialDraft(mode: EditorMode, sourceId?: string): MixDraft {
  const d = initial(mode, sourceId);
  return { ...d, components: withRows(d.components) };
}

export function defaultComponent(sound: SoundId, L: number): MixComponent {
  const def = SOUNDS[sound];
  if (def.category === 'functional') {
    const len = Math.max(MIN_SPAN_SEC, Math.min(8 * 60, snap(L * 0.3)));
    const start = Math.min(L - len, snap(L * 0.4));
    return { id: cid(), sound, start, end: start + len, level: def.defaultLevel, entry: 'soft' };
  }
  if (def.category === 'quiet') {
    const len = Math.max(MIN_SPAN_SEC, Math.min(5 * 60, snap(L * 0.15)));
    const start = Math.min(L - len, snap(L * 0.72));
    return { id: cid(), sound, start, end: start + len, level: 0.9, entry: 'soft' };
  }
  return { id: cid(), sound, start: 0, end: L, level: def.defaultLevel, entry: 'soft' };
}

export const ROWS_MAX = MAX_COMPONENTS;

/** True when that sound already braids with the target block (so combining again is pointless). */
function combinedWithSound(d: MixDraft, target: MixComponent, sound: SoundId, exclude?: string) {
  return d.components.some(c => c.id !== exclude && c.id !== target.id && c.sound === sound && (c.row ?? 0) === (target.row ?? 0) && overlaps(c.start, c.end, target.start, target.end));
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && a1 > b0;

export function rowIsFree(components: MixComponent[], row: number, start: number, end: number, exclude?: string) {
  return !components.some(c => c.id !== exclude && (c.row ?? 0) === row && overlaps(start, end, c.start, c.end));
}

/** The free row closest to `near` (checking near, near+1, near-1, near+2, ...). */
export function firstFreeRow(components: MixComponent[], start: number, end: number, near = 0, exclude?: string): number | null {
  for (let step = 0; step < ROWS_MAX * 2; step++) {
    const row = near + (step % 2 ? Math.ceil(step / 2) : -step / 2);
    if (row < 0 || row >= ROWS_MAX) continue;
    if (rowIsFree(components, row, start, end, exclude)) return row;
  }
  return null;
}

/** How long a freshly dropped block is. Continuous sounds start at half the Mix. */
export function defaultSpan(sound: SoundId, L: number) {
  const def = SOUNDS[sound];
  if (def.category === 'functional') return Math.max(MIN_SPAN_SEC, Math.min(8 * 60, snap(L * 0.3)));
  if (def.category === 'quiet') return Math.max(MIN_SPAN_SEC, Math.min(5 * 60, snap(L * 0.15)));
  return Math.max(MIN_SPAN_SEC, snap(L / 2));
}

export type BlockSource =
  | { kind: 'library'; sound: SoundId }
  | { kind: 'block'; id: string; sound: SoundId; grab: number; span: number }
  /** A whole combination: every block braided together on one row, moved as one. */
  | { kind: 'group'; ids: string[]; sounds: SoundId[]; sound: SoundId; grab: number; span: number; start: number };

/** The blocks braided with `c`: same row, overlapping it directly or through each other. */
export function groupOf(d: MixDraft, c: MixComponent): MixComponent[] {
  const row = c.row ?? 0;
  const inRow = d.components.filter(o => (o.row ?? 0) === row);
  const group = [c];
  for (let i = 0; i < group.length; i++) {
    for (const o of inRow) {
      if (!group.includes(o) && overlaps(o.start, o.end, group[i].start, group[i].end)) group.push(o);
    }
  }
  return group;
}
export interface GridPoint { row: number; time: number; onto: string | null }
export interface Placement { row: number; start: number; end: number; combinedWith: string | null }

/**
 * Where a block lands if dropped at a grid point. Dropping onto a block of a different sound
 * combines them: the new block takes that block's span on the same row and the two braid
 * together. Otherwise it goes where the pointer is, moving to the nearest free row on a
 * collision, which is also how a block is pulled back out of a combination.
 */
export function planDrop(d: MixDraft, source: BlockSource, at: GridPoint): Placement | null {
  const L = d.lengthSec;
  if (source.kind === 'group') return planGroup(d, source, at);
  const self = source.kind === 'block' ? source.id : undefined;
  if (source.kind === 'library' && d.components.length >= MAX_COMPONENTS) return null;
  const target = at.onto && at.onto !== self ? d.components.find(c => c.id === at.onto) : undefined;
  if (target && target.sound !== source.sound && !combinedWithSound(d, target, source.sound, self)) {
    return { row: target.row ?? 0, start: target.start, end: target.end, combinedWith: target.id };
  }
  const span = Math.min(L, source.kind === 'block' ? source.span : defaultSpan(source.sound, L));
  const grab = source.kind === 'block' ? source.grab : span / 2;
  const start = Math.max(0, Math.min(L - span, snap(at.time - grab)));
  const row = rowIsFree(d.components, at.row, start, start + span, self) ? at.row : firstFreeRow(d.components, start, start + span, at.row, self);
  return row == null ? null : { row, start, end: start + span, combinedWith: null };
}

/**
 * Moving a whole combination: every member shifts by the same amount and lands on one row.
 * Dropped onto another block it joins that block's braid, lining up with its start.
 */
function planGroup(d: MixDraft, source: Extract<BlockSource, { kind: 'group' }>, at: GridPoint): Placement | null {
  const L = d.lengthSec;
  const members = new Set(source.ids);
  const others = d.components.filter(c => !members.has(c.id));
  const moved = d.components.filter(c => members.has(c.id));
  const target = at.onto && !members.has(at.onto) ? others.find(c => c.id === at.onto) : undefined;
  if (target) {
    const start = Math.max(0, Math.min(L - source.span, target.start));
    return { row: target.row ?? 0, start, end: start + source.span, combinedWith: target.id };
  }
  const start = Math.max(0, Math.min(L - source.span, snap(at.time - source.grab)));
  const delta = start - source.start;
  const fits = (row: number) => moved.every(c => rowIsFree(others, row, c.start + delta, c.end + delta));
  for (let step = 0; step < ROWS_MAX * 2; step++) {
    const row = at.row + (step % 2 ? Math.ceil(step / 2) : -step / 2);
    if (row >= 0 && row < ROWS_MAX && fits(row)) return { row, start, end: start + source.span, combinedWith: null };
  }
  return null;
}

export function applyDrop(d: MixDraft, source: BlockSource, place: Placement, newId = cid()): { draft: Partial<MixDraft>; id: string } {
  if (source.kind === 'group') {
    const delta = place.start - source.start;
    const members = new Set(source.ids);
    return {
      id: source.ids[0],
      draft: { components: d.components.map(c => (members.has(c.id) ? { ...c, row: place.row, start: c.start + delta, end: c.end + delta } : c)) },
    };
  }
  if (source.kind === 'block') {
    return {
      id: source.id,
      draft: { components: d.components.map(c => (c.id === source.id ? { ...c, row: place.row, start: place.start, end: place.end } : c)) },
    };
  }
  const def = SOUNDS[source.sound];
  const block: MixComponent = {
    id: newId, sound: source.sound, start: place.start, end: place.end, row: place.row,
    level: def.category === 'quiet' ? 0.9 : def.defaultLevel, entry: 'soft',
  };
  return { id: block.id, draft: { components: [...d.components, block] } };
}

/** Tapping a sound: the usual default placement, on the first row with room. */
export function planTap(d: MixDraft, sound: SoundId): Placement | null {
  if (d.components.length >= MAX_COMPONENTS) return null;
  const base = defaultComponent(sound, d.lengthSec);
  const row = firstFreeRow(d.components, base.start, base.end, 0);
  return row == null ? null : { row, start: base.start, end: base.end, combinedWith: null };
}

/** A copy right after the original, on the same row when there's room. */
export function duplicateBlock(d: MixDraft, id: string, newId = cid()): { draft: Partial<MixDraft>; id: string } | null {
  const c = d.components.find(x => x.id === id);
  if (!c || d.components.length >= MAX_COMPONENTS) return null;
  const L = d.lengthSec;
  const span = c.end - c.start;
  const after = Math.min(c.end, L - span);
  const candidates: [number, number][] = [[after, after + span], [Math.max(0, c.start - span), Math.max(0, c.start - span) + span], [c.start, c.end]];
  for (const [start, end] of candidates) {
    const row = rowIsFree(d.components, c.row ?? 0, start, end) ? c.row ?? 0 : firstFreeRow(d.components, start, end, (c.row ?? 0) + 1);
    if (row == null) continue;
    const copy: MixComponent = { ...c, id: newId, start, end, row };
    return { id: copy.id, draft: { components: [...d.components, copy] } };
  }
  return null;
}
