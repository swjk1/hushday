import { useSyncExternalStore } from 'react';
import type { Discovery } from '../core/types';
import { getState } from './store';

export interface Reveal { mixId: string; mixName: string; discovery: Discovery | null; pending: boolean }

interface UiState {
  durationFor: string | null;
  playerOpen: boolean;
  reveal: Reveal | null;
  toast: string | null;
}

let ui: UiState = { durationFor: null, playerOpen: false, reveal: null, toast: null };
const listeners = new Set<() => void>();
let toastTimer = 0;

export function setUi(patch: Partial<UiState>) {
  ui = { ...ui, ...patch };
  listeners.forEach(listener => listener());
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(ui),
  );
}

export function toast(message: string) {
  setUi({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setUi({ toast: null }), 3200);
}

export function haptic(pattern: number | number[] = 8) {
  if (getState().settings.haptics && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}

export const go = (path: string) => {
  location.hash = path;
};
