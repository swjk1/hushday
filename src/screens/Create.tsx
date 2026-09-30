import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { Icon } from '../components/bits';
import { PlayerCard } from '../components/PlayerCard';
import { SOUNDS } from '../core/sounds';
import type { MixComponent, MixDraft, SoundId } from '../core/types';
import { LENGTH_OPTIONS_MIN, MAX_COMPONENTS, MIN_SPAN_SEC, MixValidationError, sanitizeDraft } from '../core/validate';
import { createMix, updateMix } from '../state/actions';
import { track } from '../state/events';
import { DRAFT, preview, usePlayback } from '../state/playback';
import { go, haptic, toast } from '../state/ui';
import { Arrange } from './create/Arrange';
import { applyDrop, cid, duplicateBlock, initialDraft, planDrop, planTap, rowIsFree, snap, withRows, type BlockSource, type EditorMode, type Placement } from './create/draft';
import type { DragState } from './create/drag';
import { MixIdentity } from './create/MixIdentity';
import { Onboarding, needsOnboarding } from './create/Onboarding';
import { BlockInspector, DragGhost, SoundLibrary } from './create/SoundLibrary';

export function Create({ mode, sourceId }: { mode: EditorMode; sourceId?: string }) {
  const [draft, setDraft] = useState<MixDraft>(() => initialDraft(mode, sourceId));
  // Every selected block; a braid selects as one. The inspector shows the first.
  const [selected, setSelected] = useState<string[]>([]);
  const [onboarding, setOnboarding] = useState(() => mode === 'new' && needsOnboarding());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { status, info } = usePlayback();
  const playingPreview = info?.kind === 'preview' && status === 'playing';
  const previewing = playingPreview && info.sourceId === DRAFT;
  const L = draft.lengthSec;
  const full = draft.components.length >= MAX_COMPONENTS;
  const blocks = selected.map(id => draft.components.find(c => c.id === id)).filter((c): c is MixComponent => !!c);
  const audible = draft.components.some(c => SOUNDS[c.sound].category !== 'quiet');

  const counts = useMemo(() => {
    const m = new Map<SoundId, number>();
    for (const c of draft.components) m.set(c.sound, (m.get(c.sound) ?? 0) + 1);
    return m;
  }, [draft.components]);

  useEffect(() => {
    track('mix_editor_opened', { mode, sourceId: sourceId ?? null });
    return () => {
      if (engine.getSnapshot().info?.kind === 'preview') engine.stop();
    };
  }, []);

  // Keep a running preview in step with edits: glide in place when the same blocks are
  // playing, otherwise restart from the same point once edits settle.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const snapshot = engine.getSnapshot();
    if (snapshot.info?.sourceId !== DRAFT || snapshot.info.kind !== 'preview' || snapshot.status !== 'playing') return;
    if (!draft.components.length) return engine.stop();
    if (engine.retune(draft)) return;
    const handle = setTimeout(() => preview(draft, Math.min(engine.elapsed(), L - 1)), 350);
    return () => clearTimeout(handle);
  }, [draft]);

  // Always derive from the latest draft: taps can land faster than React re-renders.
  const update = (change: Partial<MixDraft> | ((d: MixDraft) => Partial<MixDraft>)) => {
    setError(null);
    setDraft(d => ({ ...d, ...(typeof change === 'function' ? change(d) : change) }));
  };
  const removeBlock = (id: string) => {
    const c = draft.components.find(x => x.id === id);
    if (c) track('sound_component_removed', { sound: c.sound, count: draft.components.length - 1 });
    setSelected(s => s.filter(x => x !== id));
    update(d => ({ components: d.components.filter(x => x.id !== id) }));
  };

  // Plans are made against what's on screen; the updater re-checks against the latest draft,
  // so quick successive taps or drops never overwrite each other.
  const removeGroup = (ids: string[]) => {
    track('sound_component_removed', { count: draft.components.length - ids.length, combination: ids.length });
    setSelected(s => s.filter(x => !ids.includes(x)));
    update(d => ({ components: d.components.filter(x => !ids.includes(x.id)) }));
  };

  const place = (source: BlockSource, spot: Placement) => {
    const id = source.kind === 'block' ? source.id : source.kind === 'group' ? source.ids[0] : cid();
    if (source.kind === 'library') track('sound_component_added', { sound: source.sound, count: draft.components.length + 1, combined: !!spot.combinedWith });
    haptic(spot.combinedWith ? [8, 40, 14] : 6);
    setSelected(source.kind === 'group' ? source.ids : [id]);
    update(d => {
      if (source.kind === 'group') {
        return source.ids.every(x => d.components.some(c => c.id === x)) ? applyDrop(d, source, spot).draft : {};
      }
      if (spot.combinedWith) {
        // Combining shares the target's row on purpose; only check the target is still there.
        const target = d.components.find(c => c.id === spot.combinedWith);
        const fresh = target && planDrop(d, source, { row: target.row ?? 0, time: target.start, onto: target.id });
        return fresh?.combinedWith ? applyDrop(d, source, fresh, id).draft : {};
      }
      const free = rowIsFree(d.components, spot.row, spot.start, spot.end, source.kind === 'block' ? source.id : undefined);
      return free ? applyDrop(d, source, spot, id).draft : {};
    });
  };
  const dropped = (state: DragState, spot: Placement | null) => {
    if (spot) return place(state.source, spot);
    if (state.source.kind === 'block' && !state.at) return removeBlock(state.source.id);
    if (state.source.kind === 'group' && !state.at) return removeGroup(state.source.ids);
    if (state.at) toast(full && state.source.kind === 'library' ? `Up to ${MAX_COMPONENTS} blocks per Mix` : 'No room there. Try another track.');
  };
  const tap = (sound: SoundId) => {
    if (!planTap(draft, sound)) return toast(full ? `Up to ${MAX_COMPONENTS} blocks per Mix` : 'No free track for that block');
    const id = cid();
    track('sound_component_added', { sound, count: draft.components.length + 1 });
    haptic(6);
    setSelected([id]);
    update(d => {
      const spot = planTap(d, sound);
      return spot ? applyDrop(d, { kind: 'library', sound }, spot, id).draft : {};
    });
  };
  const duplicate = (blockId: string) => {
    if (!duplicateBlock(draft, blockId)) return toast(full ? `Up to ${MAX_COMPONENTS} blocks per Mix` : 'No room for a copy');
    const id = cid();
    setSelected([id]);
    update(d => duplicateBlock(d, blockId, id)?.draft ?? {});
  };

  const togglePreview = () => {
    if (previewing) return engine.stop();
    if (!audible) return toast('Add a sound block first');
    preview(draft, 0);
  };

  const setLength = (minutes: number) =>
    update(d => {
      const prev = d.lengthSec;
      const next = minutes * 60;
      const components = d.components.map(c => {
        const toEnd = c.end >= prev;
        const span = Math.min(c.end - c.start, next);
        const start = Math.min(c.start, next - Math.max(MIN_SPAN_SEC, Math.min(span, next)));
        const end = toEnd ? next : Math.min(next, Math.max(start + MIN_SPAN_SEC, start + span));
        return { ...c, start: Math.max(0, start), end };
      });
      return { lengthSec: next, components: withRows(components) };
    });

  const save = async () => {
    let clean: MixDraft;
    try {
      clean = sanitizeDraft(draft);
    } catch (e) {
      setError(e instanceof MixValidationError ? e.message : 'Check your Mix');
      return;
    }
    setSaving(true);
    try {
      if (engine.getSnapshot().info?.kind === 'preview') engine.stop();
      if (mode === 'edit' && sourceId) {
        await updateMix(sourceId, clean);
        go(`/mix/${sourceId}`);
      } else {
        const mix = await createMix(clean);
        history.replaceState(null, '', `#/mix/${mix.id}`);
        dispatchEvent(new HashChangeEvent('hashchange'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="two-col studio-layout">
      <div className="studio">
        <div className="studio-top">
          <div className="field">
            <label htmlFor="mix-name">Name</label>
            <input id="mix-name" className="text-input" value={draft.name} maxLength={40} placeholder="Untitled" onChange={e => update({ name: e.target.value })} />
          </div>
          <div className="field">
            <span className="field-label" id="length-label">Length</span>
            <div className="pills" role="radiogroup" aria-labelledby="length-label">
              {LENGTH_OPTIONS_MIN.map(m => (
                <button key={m} role="radio" aria-checked={L === m * 60} className={`pill ${L === m * 60 ? 'selected' : ''}`} onClick={() => setLength(m)}>
                  {m} min
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="studio-bar">
          <button className="studio-play" onClick={togglePreview}>
            <span className="dot"><Icon name={previewing ? 'stop' : 'play'} size={12} /></span>
            {previewing ? 'Stop' : 'Play mix'}
          </button>
          <button className="text-btn" onClick={() => setOnboarding(true)}>How it works</button>
        </div>

        <Arrange
          draft={draft}
          selected={selected}
          previewing={previewing}
          onSelect={setSelected}
          onDrop={dropped}
          onResize={patches =>
            update(d => ({
              components: d.components.map(c => {
                const p = patches.find(x => x.id === c.id);
                return p ? { ...c, start: p.start, end: p.end } : c;
              }),
            }))
          }
          onSeek={f => preview(draft, snap(f * L) >= L ? 0 : f * L)}
        />

        {blocks.length > 0 && (
          <BlockInspector
            blocks={blocks}
            lengthSec={L}
            onChange={patch => update(d => ({ components: d.components.map(c => (selected.includes(c.id) ? { ...c, ...patch(c) } : c)) }))}
            onDuplicate={() => duplicate(blocks[0].id)}
            onDelete={() => (blocks.length > 1 ? removeGroup(selected) : removeBlock(blocks[0].id))}
            onClose={() => setSelected([])}
          />
        )}

        <SoundLibrary
          counts={counts}
          full={full}
          onTap={tap}
          onDrop={state => dropped(state, state.at ? planDrop(draft, state.source, state.at) : null)}
        />

        <div className="studio-foot">
          <label className="check">
            <input type="checkbox" checked={draft.repeat === 'loop'} onChange={e => update({ repeat: e.target.checked ? 'loop' : 'sustain' })} /> Loop
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>

      <aside className="studio-aside">
        <PlayerCard />
        <MixIdentity draft={draft} audible={audible} onSave={save} saving={saving} label={mode === 'edit' ? 'Save changes' : 'Save'} />
      </aside>

      <DragGhost />
      {onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
    </div>
  );
}
