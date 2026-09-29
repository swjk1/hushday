import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { engine } from '../../audio/engine';
import { RowCanvas } from '../../components/RowCanvas';
import { SOUNDS } from '../../core/sounds';
import { fades } from '../../core/timeline';
import type { MixComponent, MixDraft } from '../../core/types';
import { MIN_SPAN_SEC } from '../../core/validate';
import { haptic } from '../../state/ui';
import { ROWS_MAX, STEP, groupOf, planDrop, snap, type BlockSource, type Placement } from './draft';
import { clickWasDrag, pressToDrag, registerGrid, useDrag, type DragState } from './drag';

interface Props {
  draft: MixDraft;
  selected: string | null;
  previewing: boolean;
  onSelect: (id: string | null) => void;
  /** A block or library sound was dropped: place it, or remove it when dropped off the grid. */
  onDrop: (state: DragState, place: Placement | null) => void;
  onResize: (id: string, patch: Pick<MixComponent, 'start' | 'end'>) => void;
  onSeek: (fraction: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Stretches of the Mix where two or more audible blocks play at once: the combined parts. */
function stacks(components: MixComponent[], L: number) {
  const audible = components.filter(c => SOUNDS[c.sound].category !== 'quiet');
  const cuts = [...new Set([0, L, ...audible.flatMap(c => [c.start, c.end])])].sort((a, b) => a - b);
  const out: { start: number; end: number; count: number }[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    const count = audible.filter(c => c.start <= mid && c.end >= mid).length;
    if (count < 2) continue;
    const prev = out[out.length - 1];
    if (prev && prev.end === cuts[i] && prev.count === count) prev.end = cuts[i + 1];
    else out.push({ start: cuts[i], end: cuts[i + 1], count });
  }
  return out;
}

/**
 * The block editor: track rows across the length of the Mix. Drag sounds in from the
 * palette, move blocks in time and between rows, pull their edges to resize. Blocks that
 * overlap in time play together; dropping one onto another snaps it to the same span.
 */
export function Arrange({ draft, selected, previewing, onSelect, onDrop, onResize, onSeek }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const drag = useDrag();
  const L = draft.lengthSec;
  const used = draft.components.reduce((m, c) => Math.max(m, (c.row ?? 0) + 1), 0);
  const rows = clamp(Math.max(4, used + 1), 1, ROWS_MAX);

  useEffect(
    () =>
      registerGrid((x, y) => {
        const el = grid.current;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const pad = 24;
        if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null;
        const row = clamp(Math.floor(((y - r.top) / r.height) * rows), 0, rows - 1);
        const time = clamp((x - r.left) / r.width, 0, 1) * L;
        const onto = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-block]')?.dataset.block ?? null;
        return { row, time, onto };
      }),
    [rows, L],
  );

  // The playhead moves every frame from the audio clock, without re-rendering React.
  useEffect(() => {
    if (!previewing) return;
    let frame = 0;
    const tick = () => {
      if (playhead.current) playhead.current.style.left = `${(Math.min(L, engine.elapsed() % L) / L) * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [previewing, L]);

  const plan = useMemo(() => (drag?.at ? planDrop(draft, drag.source, drag.at) : null), [drag, draft]);
  const dragging = new Set(drag?.source.kind === 'block' ? [drag.source.id] : drag?.source.kind === 'group' ? drag.source.ids : []);
  const timeAt = (clientX: number) => {
    const r = grid.current!.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1) * L;
  };
  const combined = useMemo(() => stacks(draft.components, L), [draft.components, L]);

  let hint = '';
  if (drag) {
    const name = drag.source.kind === 'group' ? drag.source.sounds.map(s => SOUNDS[s].label).join(' + ') : SOUNDS[drag.source.sound].label;
    const target = plan?.combinedWith ? draft.components.find(c => c.id === plan.combinedWith) : null;
    if (!drag.at) hint = drag.source.kind === 'library' ? `Drop ${name} on a track` : `Release to remove ${name}`;
    else if (!plan) hint = 'No room there';
    else if (target) hint = `Intertwine ${name} with ${SOUNDS[target.sound].label}`;
    else hint = `${Math.round(plan.start / 60)}–${Math.round(plan.end / 60)} min`;
  }

  const tickEvery = L >= 45 * 60 ? 15 * 60 : L >= 20 * 60 ? 5 * 60 : 2 * 60;
  const ticks = Array.from({ length: Math.floor(L / tickEvery) + 1 }, (_, i) => i * tickEvery);

  return (
    <div className={`arrange ${drag ? 'is-dragging-block' : ''} ${drag && !drag.at && drag.source.kind !== 'library' ? 'is-removing' : ''}`}>
      <div
        className="arrange-ruler mono"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(clamp((e.clientX - r.left) / r.width, 0, 1));
        }}
        title="Tap to preview from here"
      >
        {ticks.map(t => (
          <span key={t} style={{ left: `${(t / L) * 100}%` }}>{t / 60}{t === 0 ? '' : t + tickEvery > L ? ' min' : ''}</span>
        ))}
      </div>
      <div
        ref={grid}
        className="arrange-grid"
        style={{ ['--rows' as string]: rows, ['--cols' as string]: L / tickEvery }}
        onClick={e => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {combined.map(s => (
          <span
            key={`${s.start}-${s.end}`}
            className="arrange-stack"
            style={{ left: `${(s.start / L) * 100}%`, width: `${((s.end - s.start) / L) * 100}%`, opacity: Math.min(1, 0.35 + s.count * 0.18) }}
            aria-hidden="true"
          />
        ))}
        {Array.from({ length: rows }, (_, r) => <span key={r} className="arrange-row" style={{ top: `calc(${r} * var(--row))` }} aria-hidden="true" />)}

        {Array.from({ length: rows }, (_, r) => {
          const inRow = draft.components.filter(c => (c.row ?? 0) === r);
          if (!inRow.length) return null;
          return (
            <RowCanvas
              key={`row-${r}`}
              className="arrange-weave"
              lengthSec={L}
              animate={previewing}
              blocks={inRow.map(c => {
                const f = fades(c, draft);
                return { id: c.id, sound: c.sound, start: c.start, end: c.end, level: c.level, fadeIn: f.fadeIn, fadeOut: f.fadeOut, ghost: dragging.has(c.id) };
              })}
              style={{ top: `calc(${r} * var(--row) + 4px)` }}
            />
          );
        })}

        {draft.components.map(c => (
          <Block
            key={c.id}
            component={c}
            draft={draft}
            selected={selected === c.id}
            lifting={dragging.has(c.id)}
            target={plan?.combinedWith === c.id}
            gridEl={grid}
            onSelect={() => onSelect(c.id)}
            onDrop={onDrop}
            onResize={patch => onResize(c.id, patch)}
          />
        ))}

        {/* One label per block, above every frame, so each sound in a braid can be picked or pulled out. */}
        {draft.components.map(c => {
          const row = c.row ?? 0;
          const before = draft.components.filter(o => o.id !== c.id && (o.row ?? 0) === row && o.start <= c.start && o.end > c.start && (o.start < c.start || o.id < c.id));
          const def = SOUNDS[c.sound];
          return (
            <button
              key={`chip-${c.id}`}
              className={`block-chip ${selected === c.id ? 'on' : ''} ${dragging.has(c.id) ? 'lifting' : ''}`}
              style={{ left: `calc(${(c.start / L) * 100}% + ${6 + before.length * 64}px)`, top: `calc(${row} * var(--row) + 8px)`, ['--c' as string]: def.color }}
              title={groupOf(draft, c).length > 1 ? `Drag to pull ${def.label} out` : undefined}
              onPointerDown={e => pressToDrag(e, { kind: 'block', id: c.id, sound: c.sound, grab: timeAt(e.clientX) - c.start, span: c.end - c.start }, state =>
                onDrop(state, state.at ? planDrop(draft, state.source, state.at) : null),
              )}
              onClick={() => {
                if (!clickWasDrag()) onSelect(c.id);
              }}
              onContextMenu={e => e.preventDefault()}
              aria-label={`Select ${def.name}`}
            >
              <span className="dot" style={{ background: def.color }} />
              {def.label}
            </button>
          );
        })}

        {drag?.at && plan && (
          <span
            className="arrange-slot"
            style={{
              left: `${(plan.start / L) * 100}%`, width: `${((plan.end - plan.start) / L) * 100}%`,
              top: `calc(${plan.row} * var(--row) + 4px)`, ['--c' as string]: SOUNDS[drag.source.sound].color,
            }}
            aria-hidden="true"
          />
        )}
        {previewing && <div ref={playhead} className="arrange-playhead" aria-hidden="true" />}
        {!draft.components.length && !drag && (
          <div className="arrange-empty mono">Drag a sound onto a track, or tap one below</div>
        )}
      </div>
      <div className={`arrange-hint mono ${hint ? 'show' : ''}`} aria-live="polite">{hint}</div>
    </div>
  );
}

interface BlockProps {
  component: MixComponent;
  draft: MixDraft;
  selected: boolean;
  lifting: boolean;
  target: boolean;
  gridEl: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onDrop: (state: DragState, place: Placement | null) => void;
  onResize: (patch: Pick<MixComponent, 'start' | 'end'>) => void;
}

function Block({ component: c, draft, selected, lifting, target, gridEl, onSelect, onDrop, onResize }: BlockProps) {
  const def = SOUNDS[c.sound];
  const L = draft.lengthSec;
  const quiet = def.category === 'quiet';
  const [edge, setEdge] = useState<'start' | 'end' | null>(null);
  const span = c.end - c.start;

  // Neighbours on the same row bound how far an edge can go.
  const row = c.row ?? 0;
  const same = draft.components.filter(o => o.id !== c.id && (o.row ?? 0) === row);
  const floor = Math.max(0, ...same.filter(o => o.end <= c.start).map(o => o.end));
  const ceiling = Math.min(L, ...same.filter(o => o.start >= c.end).map(o => o.start));

  const timeAt = (clientX: number) => {
    const r = gridEl.current!.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1) * L;
  };
  const resizeFrom = (which: 'start' | 'end') => (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    setEdge(which);
  };
  const resizeMove = (e: ReactPointerEvent) => {
    if (!edge) return;
    const t = snap(timeAt(e.clientX));
    if (edge === 'start') onResize({ start: clamp(t, floor, c.end - MIN_SPAN_SEC), end: c.end });
    else onResize({ start: c.start, end: clamp(t, c.start + MIN_SPAN_SEC, ceiling) });
  };
  const resizeEnd = () => {
    if (edge) haptic(4);
    setEdge(null);
  };
  const nudge = (which: 'start' | 'end') => (e: ReactKeyboardEvent) => {
    const by = e.key === 'ArrowRight' ? STEP : e.key === 'ArrowLeft' ? -STEP : 0;
    if (!by) return;
    e.preventDefault();
    if (which === 'start') onResize({ start: clamp(c.start + by, floor, c.end - MIN_SPAN_SEC), end: c.end });
    else onResize({ start: c.start, end: clamp(c.end + by, c.start + MIN_SPAN_SEC, ceiling) });
  };

  return (
    <div
      data-block={c.id}
      className={`track-block ${quiet ? 'quiet' : ''} ${selected ? 'on' : ''} ${lifting ? 'lifting' : ''} ${target ? 'target' : ''}`}
      style={{
        left: `${(c.start / L) * 100}%`, width: `${(span / L) * 100}%`, top: `calc(${row} * var(--row) + 4px)`,
        ['--c' as string]: def.color,
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${def.name}, ${Math.round(c.start / 60)} to ${Math.round(c.end / 60)} minutes, track ${row + 1}`}
      onPointerDown={e => {
        if (edge) return;
        // The body moves the whole combination; a single block is just a combination of one.
        const group = groupOf(draft, c);
        const start = Math.min(...group.map(g => g.start));
        const end = Math.max(...group.map(g => g.end));
        const source: BlockSource = group.length > 1
          ? { kind: 'group', ids: group.map(g => g.id), sounds: group.map(g => g.sound), sound: c.sound, grab: timeAt(e.clientX) - start, span: end - start, start }
          : { kind: 'block', id: c.id, sound: c.sound, grab: timeAt(e.clientX) - c.start, span };
        pressToDrag(e, source, state => onDrop(state, state.at ? planDrop(draft, state.source, state.at) : null));
      }}
      onPointerMove={resizeMove}
      onPointerUp={resizeEnd}
      onPointerCancel={resizeEnd}
      onClick={() => {
        if (!clickWasDrag() && !edge) onSelect();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {edge && <span className="block-time mono">{Math.round(c.start / 60)}–{Math.round(c.end / 60)}m</span>}
      <span className="block-edge start" role="slider" tabIndex={-1} aria-label={`${def.name} start`} aria-valuemin={0} aria-valuemax={L / 60} aria-valuenow={c.start / 60} onPointerDown={resizeFrom('start')} onKeyDown={nudge('start')} />
      <span className="block-edge end" role="slider" tabIndex={-1} aria-label={`${def.name} end`} aria-valuemin={0} aria-valuemax={L / 60} aria-valuenow={c.end / 60} onPointerDown={resizeFrom('end')} onKeyDown={nudge('end')} />
    </div>
  );
}
