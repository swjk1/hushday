import { useSyncExternalStore } from 'react';
import type { Mix } from '../core/types';

export interface User { id: string; username: string; createdAt: string }
export interface Settings { haptics: boolean; volume: number }

export interface AppState {
  token: string | null;
  user: User | null;
  /** Mixes this person created, newest first. Pending ones are waiting for the server. */
  mixes: Mix[];
  /** Library of saved Mix ids (curated or created). */
  saved: string[];
  /** Mix ids played at least once, for "Mix reused". */
  used: string[];
  settings: Settings;
}

const KEY = 'hushday.state.v3';
const DEFAULTS: AppState = { token: null, user: null, mixes: [], saved: [], used: [], settings: { haptics: true, volume: 0.8 } };

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: the app keeps working in memory */
  }
}

let state: AppState = { ...DEFAULTS, ...readStorage<Partial<AppState>>(KEY, {}) };
state.settings = { ...DEFAULTS.settings, ...state.settings };
const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  writeStorage(KEY, state);
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Selectors must return existing references (no new arrays/objects) to avoid re-render loops. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}
