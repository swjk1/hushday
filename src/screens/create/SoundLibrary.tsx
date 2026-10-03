import { Glyph, Icon } from '../../components/bits';
import { SoundSwatch } from '../../components/SoundSwatch';
import { SOUNDS, SOUND_ORDER, variantLabel, variantMark, variantOf } from '../../core/sounds';
import { spanLabel } from '../../core/format';
import type { MixComponent, SoundId } from '../../core/types';
import { clickWasDrag, pressToDrag, useDrag, type DragState } from './drag';

interface Props {
  counts: Map<SoundId, number>;
  full: boolean;
  onTap: (sound: SoundId) => void;
  onDrop: (state: DragState) => void;
}

/** Every sound as a chip with its own mark. Drag one onto a track, or tap to add it. */
export function SoundLibrary({ counts, full, onTap, onDrop }: Props) {
  return (
    <div className="palette">
      <div className="palette-head">
        <span className="tiny-label">Sounds</span>
        <small>Drag or tap</small>
      </div>
      <div className="palette-row">
        {SOUND_ORDER.map(s => {
          const def = SOUNDS[s];
          const count = counts.get(s) ?? 0;
          return (
            <button
              key={s}
              className={`sound-chip ${count ? 'used' : ''}`}
              style={{ ['--c' as string]: def.color }}
              disabled={full}
              onPointerDown={e => pressToDrag(e, { kind: 'library', sound: s }, onDrop)}
              onClick={() => {
                if (!clickWasDrag()) onTap(s);
              }}
              onContextMenu={e => e.preventDefault()}
              aria-label={`Add a ${def.name} block`}
            >
              <Glyph sound={s} size="sm" />
              {def.label}
              {count > 0 && <span className="chip-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface InspectorProps {
  /** Everything selected: one block from a chip, or a whole braid from its body. */
  blocks: MixComponent[];
  lengthSec: number;
  /** Auto-Blend is picking volumes: moving a volume takes that block over by hand. */
  autoVolumes?: boolean;
  /** Applied to every selected block; the function sees each block so relative values can be kept. */
  onChange: (patch: (c: MixComponent) => Partial<MixComponent>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const clampLevel = (v: number) => Math.min(1, Math.max(0.05, Math.round(v * 100) / 100));

/**
 * Settings for the selection. With a braid selected, volume moves every block together,
 * keeping their balance, and Delete removes them all.
 */
export function BlockInspector({ blocks, lengthSec, autoVolumes = false, onChange, onDuplicate, onDelete, onClose }: InspectorProps) {
  const many = blocks.length > 1;
  const first = blocks[0];
  const def = SOUNDS[first.sound];
  const quiet = blocks.every(b => SOUNDS[b.sound].category === 'quiet');
  const level = blocks.reduce((s, b) => s + b.level, 0) / blocks.length;
  const slow = blocks.every(b => b.entry === 'slow');
  // Under Auto-Blend's volumes: Auto when every selected block is Auto-Blend's, Yours when any was set by hand.
  const levelOwner = !autoVolumes || quiet ? null : blocks.some(b => b.manual) ? 'yours' : 'auto';
  const start = Math.min(...blocks.map(b => b.start));
  const end = Math.max(...blocks.map(b => b.end));
  const title = many ? blocks.map(b => SOUNDS[b.sound].label).join(' + ') : def.name;
  // Versions are offered when every selected block is the same sound and that sound has simpler versions.
  const variants = blocks.every(b => b.sound === first.sound) ? def.variants : undefined;
  const version = blocks.every(b => (b.variant ?? '') === (first.variant ?? '')) ? first.variant ?? '' : null;
  const chosen = version ? variantOf(first.sound, version) : null;
  return (
    <div className={`inspector ${many ? 'braid' : ''}`} style={{ ['--c' as string]: def.color, ['--thumb' as string]: def.color }}>
      <div className="inspector-head">
        <span className="inspector-swatches">
          {blocks.map(b => <span key={b.id} className="inspector-swatch"><SoundSwatch sound={b.sound} level={b.level} /></span>)}
        </span>
        <strong>{title}</strong>
        {!many && first.variant && <span className="tiny-label">{variantLabel(first.sound, first.variant)}</span>}
        {many && <span className="tiny-label">{blocks.length} blocks</span>}
        <span className="mono muted">{spanLabel(start, end, lengthSec)} · track {(first.row ?? 0) + 1}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close block settings"><Icon name="close" size={16} /></button>
      </div>
      <label className="level">
        <span className="mono muted">
          {quiet ? 'Depth' : many ? 'Volume, all' : 'Volume'}
          {levelOwner && <span className={`level-owner ${levelOwner}`}>{levelOwner === 'auto' ? 'Auto' : 'Yours'}</span>}
        </span>
        <input
          type="range" min={0.05} max={1} step={0.01} value={level}
          onChange={e => {
            const delta = Number(e.target.value) - level;
            // Under Auto-Blend's volumes, setting one by hand keeps it: Auto-Blend balances the rest around it.
            onChange(c => ({ level: clampLevel(c.level + delta), ...(levelOwner ? { manual: true as const } : {}) }));
          }}
          aria-label={`${title} ${quiet ? 'depth' : 'volume'}`}
        />
        <span className="mono muted inspector-pct">{Math.round(level * 100)}</span>
      </label>
      {levelOwner === 'yours' && (
        <button className="text-btn level-reset" onClick={() => onChange(() => ({ manual: undefined }))}>
          Back to auto
        </button>
      )}
      {variants && (
        <>
          <div className="version-pills" role="radiogroup" aria-label={`${def.name} version`}>
            {[{ id: '' as const, label: 'Original' }, ...variants].map(v => (
              <button
                key={v.id || 'original'}
                role="radio"
                aria-checked={version === v.id}
                className={`toggle ${version === v.id ? 'on' : ''}`}
                onClick={() => onChange(() => ({ variant: v.id || undefined }))}
              >
                {v.id ? `${variantMark(first.sound, v.id)} · ${v.label}` : 'Original'}
              </button>
            ))}
          </div>
          <p className="version-note">{chosen ? chosen.blurb : version === '' ? def.blurb : 'These blocks use different versions.'}</p>
        </>
      )}
      <div className="inspector-actions">
        {!quiet && (
          <button className={`toggle ${slow ? 'on' : ''}`} aria-pressed={slow} onClick={() => onChange(() => ({ entry: slow ? 'soft' : 'slow' }))}>
            Slow in
          </button>
        )}
        {!many && <button className="toggle" onClick={onDuplicate}>Duplicate</button>}
        <button className="toggle danger" onClick={onDelete}>{many ? `Delete all ${blocks.length}` : 'Delete'}</button>
      </div>
    </div>
  );
}

/** The block under the pointer while dragging. */
export function DragGhost() {
  const drag = useDrag();
  if (!drag) return null;
  const def = SOUNDS[drag.source.sound];
  const removing = drag.source.kind !== 'library' && !drag.at;
  const sounds = drag.source.kind === 'group' ? drag.source.sounds : [drag.source.sound];
  return (
    <div
      className={`drag-ghost ${drag.at ? 'over' : ''} ${removing ? 'removing' : ''}`}
      style={{ transform: `translate(${drag.x}px, ${drag.y}px)`, ['--c' as string]: def.color }}
      aria-hidden="true"
    >
      <span className="drag-ghost-layers">
        {sounds.map((s, i) => <SoundSwatch key={`${s}-${i}`} sound={s} level={SOUNDS[s].defaultLevel} animate className="drag-ghost-swatch" />)}
      </span>
      <span className="mono">{sounds.map(s => SOUNDS[s].label).join(' + ')}</span>
    </div>
  );
}
