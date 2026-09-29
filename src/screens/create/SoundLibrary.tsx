import { Glyph, Icon } from '../../components/bits';
import { SoundSwatch } from '../../components/SoundSwatch';
import { SOUNDS, SOUND_ORDER } from '../../core/sounds';
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
  block: MixComponent;
  lengthSec: number;
  onChange: (patch: Partial<MixComponent>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Settings for the selected block. */
export function BlockInspector({ block: c, lengthSec, onChange, onDuplicate, onDelete, onClose }: InspectorProps) {
  const def = SOUNDS[c.sound];
  const quiet = def.category === 'quiet';
  return (
    <div className="inspector" style={{ ['--c' as string]: def.color, ['--thumb' as string]: def.color }}>
      <div className="inspector-head">
        <span className="inspector-swatch"><SoundSwatch sound={c.sound} level={c.level} /></span>
        <strong>{def.name}</strong>
        <span className="mono muted">{spanLabel(c.start, c.end, lengthSec)} · track {(c.row ?? 0) + 1}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close block settings"><Icon name="close" size={16} /></button>
      </div>
      <label className="level">
        <span className="mono muted">{quiet ? 'Depth' : 'Volume'}</span>
        <input type="range" min={0.05} max={1} step={0.01} value={c.level} onChange={e => onChange({ level: Number(e.target.value) })} aria-label={`${def.name} ${quiet ? 'depth' : 'volume'}`} />
        <span className="mono muted inspector-pct">{Math.round(c.level * 100)}</span>
      </label>
      <div className="inspector-actions">
        {!quiet && (
          <button className={`toggle ${c.entry === 'slow' ? 'on' : ''}`} aria-pressed={c.entry === 'slow'} onClick={() => onChange({ entry: c.entry === 'slow' ? 'soft' : 'slow' })}>
            Slow in
          </button>
        )}
        <button className="toggle" onClick={onDuplicate}>Duplicate</button>
        <button className="toggle danger" onClick={onDelete}>Delete</button>
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
