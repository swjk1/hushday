import { CURATED_MIXES, SHORT_EXPERIENCES } from '../core/catalog';
import { canonicalize } from '../core/fingerprint';
import type { Discovery, Mix, MixDraft } from '../core/types';
import { ApiError, api, isOffline } from './api';
import { flush, track } from './events';
import { getState, setState, type User } from './store';
import { setUi, toast, type Reveal } from './ui';

const uuid = () => crypto.randomUUID();

export function findMix(id: string): Mix | null {
  return CURATED_MIXES.find(m => m.id === id) ?? getState().mixes.find(m => m.id === id) ?? null;
}

export const findShort = (id: string) => SHORT_EXPERIENCES.find(s => s.id === id) ?? null;

let sessionPromise: Promise<boolean> | null = null;

/** Makes sure this device has an account. Resolves false when the API is unreachable. */
export function ensureSession(): Promise<boolean> {
  if (getState().token) return Promise.resolve(true);
  sessionPromise ??= api<{ token: string; user: User }>('session', { method: 'POST' })
    .then(({ token, user }) => {
      setState({ token, user });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      sessionPromise = null;
    });
  return sessionPromise;
}

/** Calls the API as the current user, recreating the device session once if it expired. */
async function authed<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!(await ensureSession())) throw new ApiError(0, 'Offline');
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setState({ token: null, user: null });
      if (await ensureSession()) return api<T>(path, options);
    }
    throw error;
  }
}

const peeks = new Map<string, number>();

/** How many people have already made this exact Mix. Null when the service can't be reached. */
export async function peekDiscovery(mix: MixDraft): Promise<number | null> {
  const canonical = canonicalize(mix);
  const known = peeks.get(canonical);
  if (known !== undefined) return known;
  try {
    const { count } = await api<{ count: number }>(`discovery?c=${encodeURIComponent(canonical)}`);
    peeks.set(canonical, count);
    return count;
  } catch {
    return null;
  }
}

export async function bootstrap() {
  track('app_opened', { standalone: matchMedia('(display-mode: standalone)').matches });
  if (!(await ensureSession())) return;
  try {
    const remote = await authed<{ mixes: Mix[]; saved: string[] }>('mixes');
    const pending = getState().mixes.filter(m => m.sync === 'pending' && !remote.mixes.some(r => r.id === m.id));
    const localSaved = getState().saved.filter(id => !remote.saved.includes(id));
    setState({ mixes: [...pending, ...remote.mixes], saved: [...remote.saved, ...localSaved] });
    for (const id of localSaved) void authed('saves', { method: 'POST', body: { mixId: id } }).catch(() => {});
    for (const mix of pending) await pushMix(mix).catch(() => {});
  } catch {
    /* stay on local data */
  }
  void flush();
}

async function pushMix(mix: Mix): Promise<Discovery | null> {
  const { mix: saved, discovery } = await authed<{ mix: Mix; discovery: Discovery | null }>('mixes', {
    method: 'POST',
    body: { id: mix.id, mix: toDraft(mix) },
  });
  replaceMix({ ...saved, discovery: saved.discovery ?? discovery });
  return discovery;
}

const toDraft = (mix: MixDraft): MixDraft => ({
  name: mix.name, lengthSec: mix.lengthSec, repeat: mix.repeat, components: mix.components, parentMixId: mix.parentMixId ?? null,
  ...(mix.blend ? { blend: mix.blend } : {}),
});

function replaceMix(mix: Mix) {
  setState(s => ({ mixes: s.mixes.some(m => m.id === mix.id) ? s.mixes.map(m => (m.id === mix.id ? mix : m)) : [mix, ...s.mixes] }));
}

/** Saves a new Mix and opens the discovery reveal. Works offline; the number arrives later. */
export async function createMix(draft: MixDraft): Promise<Mix> {
  const local: Mix = {
    ...toDraft(draft), id: uuid(), creatorId: getState().user?.id ?? null, curated: false,
    createdAt: new Date().toISOString(), discovery: null, sync: 'pending',
  };
  replaceMix(local);
  peeks.clear(); // counts change once this lands
  let reveal: Reveal = { mixId: local.id, mixName: local.name, discovery: null, pending: true };
  try {
    const discovery = await pushMix(local);
    reveal = { ...reveal, discovery, pending: false };
  } catch (error) {
    if (!isOffline(error)) {
      setState(s => ({ mixes: s.mixes.filter(m => m.id !== local.id) }));
      throw error;
    }
  }
  track('discovery_revealed', { mixId: local.id, pending: reveal.pending, number: reveal.discovery?.number ?? null });
  setUi({ reveal });
  return findMix(local.id) ?? local;
}

export async function updateMix(id: string, draft: MixDraft) {
  const current = findMix(id);
  if (!current) return;
  if (current.sync === 'pending') {
    replaceMix({ ...current, ...toDraft(draft) });
    return;
  }
  const { mix, discovery } = await authed<{ mix: Mix; discovery: Discovery | null }>(`mixes?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { mix: toDraft(draft) },
  });
  replaceMix(mix);
  peeks.clear();
  if (discovery) {
    track('discovery_revealed', { mixId: id, number: discovery.number, edit: true });
    setUi({ reveal: { mixId: id, mixName: mix.name, discovery, pending: false } });
  } else {
    toast('Mix updated');
  }
}

export async function deleteMix(id: string) {
  const mix = findMix(id);
  if (!mix || mix.curated) return;
  if (mix.sync !== 'pending') await authed(`mixes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  setState(s => ({ mixes: s.mixes.filter(m => m.id !== id), saved: s.saved.filter(x => x !== id) }));
  toast('Mix deleted');
}

export function toggleSave(id: string) {
  const saved = getState().saved.includes(id);
  setState(s => ({ saved: saved ? s.saved.filter(x => x !== id) : [id, ...s.saved] }));
  toast(saved ? 'Removed from your library' : 'Saved to your library');
  const request = saved
    ? authed(`saves?mixId=${encodeURIComponent(id)}`, { method: 'DELETE' })
    : authed('saves', { method: 'POST', body: { mixId: id } });
  void request.catch(() => {});
}

export interface Profile {
  user: User;
  stats: { mixesCreated: number; discoveries: number; firstDiscoveries: number; zonesCompleted: number; zoneSeconds: number };
  discoveries: { number: number; first: boolean; mixId: string; mixName: string; mixDeleted: boolean; totalDiscoverers: number; createdAt: string }[];
}

export async function loadProfile() {
  const profile = await authed<Profile>('me');
  setState({ user: profile.user });
  return profile;
}

export async function renameUser(username: string) {
  const { user } = await authed<{ user: User }>('me', { method: 'PATCH', body: { username } });
  setState({ user });
}

export function recordZone(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  void authed('zones', { method, body }).catch(() => {});
}
