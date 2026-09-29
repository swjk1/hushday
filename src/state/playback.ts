import { useSyncExternalStore } from 'react';
import { engine, type SessionInfo } from '../audio/engine';
import { SOUNDS } from '../core/sounds';
import type { MixComponent, MixDraft, SoundId } from '../core/types';
import { findMix, findShort, recordZone } from './actions';
import { track } from './events';
import { getState, readStorage, setState, writeStorage } from './store';
import { haptic, setUi, toast } from './ui';

const SESSION_KEY = 'hushday.session.v1';
interface Saved { info: SessionInfo; elapsed: number; savedAt: number }

export const usePlayback = () => useSyncExternalStore(engine.subscribe, engine.getSnapshot);

function persist() {
  const { status, info } = engine.getSnapshot();
  if (!info || info.kind === 'preview' || (status !== 'playing' && status !== 'paused')) {
    writeStorage(SESSION_KEY, null);
    return;
  }
  writeStorage(SESSION_KEY, { info, elapsed: engine.elapsed(), savedAt: Date.now() } satisfies Saved);
}

function noteUse(sourceId: string) {
  const { used } = getState();
  if (used.includes(sourceId)) track('mix_reused', { mixId: sourceId });
  else setState({ used: [sourceId, ...used].slice(0, 300) });
}

/** Closes out whatever is running (recording an early-ended Zone) before something new starts. */
function closeCurrent() {
  const { status, info } = engine.getSnapshot();
  if (info?.kind === 'zone' && (status === 'playing' || status === 'paused')) {
    const activeSeconds = Math.round(engine.elapsed());
    track('zone_ended_early', { zoneId: info.zoneId, mixId: info.sourceId, activeSeconds, selectedMinutes: info.selectedMinutes ?? null });
    recordZone('PATCH', { id: info.zoneId, state: 'ended', activeSeconds });
  }
}

function begin(info: SessionInfo) {
  closeCurrent();
  engine.setVolume(getState().settings.volume);
  void engine.start(info).then(persist);
  haptic(12);
}

export function startZone(mixId: string, minutes: number | null) {
  const mix = findMix(mixId);
  if (!mix) return;
  const zoneId = crypto.randomUUID();
  track('zone_duration_selected', { mixId, minutes });
  track('zone_started', { zoneId, mixId, minutes, curated: mix.curated });
  noteUse(mixId);
  recordZone('POST', { id: zoneId, mixId, selectedMinutes: minutes });
  begin({ kind: 'zone', sourceId: mixId, mix, zoneId, selectedMinutes: minutes, totalSec: minutes == null ? null : minutes * 60 });
  setUi({ durationFor: null, playerOpen: true });
}

export function playMix(mixId: string) {
  const mix = findMix(mixId);
  if (!mix) return;
  track('mix_played', { mixId, curated: mix.curated });
  noteUse(mixId);
  begin({ kind: 'play', sourceId: mixId, mix, totalSec: mix.lengthSec });
}

export function playShort(id: string) {
  const short = findShort(id);
  if (!short) return;
  track('short_experience_played', { id, protocol: short.protocol });
  noteUse(id);
  begin({ kind: 'short', sourceId: id, mix: short.mix, totalSec: short.durationSec });
  setUi({ playerOpen: true });
}

/** sourceId of a draft preview in the editor, as opposed to a single-sound audition. */
export const DRAFT = 'draft';

export function preview(mix: MixDraft, offset = 0) {
  track('mix_previewed', { offset: Math.round(offset), components: mix.components.length });
  closeCurrent();
  engine.setVolume(getState().settings.volume);
  void engine.start({ kind: 'preview', sourceId: DRAFT, mix, totalSec: mix.lengthSec }, offset);
}

const AUDITION_SEC = 14;

/** A short taste of one sound. A quiet section is heard as brown noise dropping away and returning. */
export function audition(sound: SoundId) {
  const def = SOUNDS[sound];
  const L = AUDITION_SEC;
  const components: MixComponent[] = def.category === 'quiet'
    ? [
        { id: 'bed', sound: 'brown', start: 0, end: L, level: 0.7, entry: 'soft' },
        { id: 'gap', sound, start: 4, end: 10, level: 0.9, entry: 'soft' },
      ]
    : [{ id: 'one', sound, start: 0, end: L, level: def.defaultLevel, entry: 'soft' }];
  track('sound_auditioned', { sound });
  closeCurrent();
  engine.setVolume(getState().settings.volume);
  void engine.start({ kind: 'preview', sourceId: `audition:${sound}`, mix: { name: '', lengthSec: L, repeat: 'sustain', components }, totalSec: L }, 0);
}

export function pause() {
  const { info, status } = engine.getSnapshot();
  if (status !== 'playing') return;
  engine.pause();
  haptic(6);
  if (info?.kind === 'zone') {
    const activeSeconds = Math.round(engine.elapsed());
    track('zone_paused', { zoneId: info.zoneId, activeSeconds });
    recordZone('PATCH', { id: info.zoneId, state: 'paused', activeSeconds });
  }
  persist();
}

export function resume() {
  const { info, status } = engine.getSnapshot();
  if (status !== 'paused') return;
  engine.setVolume(getState().settings.volume);
  void engine.resume().then(persist);
  haptic(6);
  if (info?.kind === 'zone') {
    track('zone_resumed', { zoneId: info.zoneId });
    recordZone('PATCH', { id: info.zoneId, state: 'active', activeSeconds: Math.round(engine.elapsed()) });
  }
}

export function end() {
  closeCurrent();
  engine.stop();
  persist();
  setUi({ playerOpen: false });
}

export function setVolume(volume: number) {
  setState(s => ({ settings: { ...s.settings, volume } }));
  engine.setVolume(volume);
}

engine.remote = { pause, resume, stop: end };

engine.onComplete = info => {
  persist();
  haptic([10, 60, 10]);
  if (info.kind === 'zone') {
    track('zone_completed', { zoneId: info.zoneId, mixId: info.sourceId, selectedMinutes: info.selectedMinutes ?? null });
    recordZone('PATCH', { id: info.zoneId, state: 'completed', activeSeconds: info.totalSec ?? 0 });
    toast('Zone complete');
  } else if (info.kind === 'short') {
    track('short_experience_completed', { id: info.sourceId });
  }
  if (info.kind === 'preview' || info.kind === 'play') engine.dismiss();
};

/** After a reload, bring back a running Zone as paused so one tap resumes it. */
export function restoreSession() {
  const saved = readStorage<Saved | null>(SESSION_KEY, null);
  if (!saved?.info) return;
  const { info, elapsed } = saved;
  if (info.totalSec != null && elapsed >= info.totalSec - 5) {
    writeStorage(SESSION_KEY, null);
    return;
  }
  engine.restore(info, elapsed);
}

setInterval(() => {
  if (engine.getSnapshot().status === 'playing') persist();
}, 5000);
document.addEventListener('visibilitychange', persist);
window.addEventListener('pagehide', persist);
