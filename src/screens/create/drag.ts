import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import type { BlockSource, GridPoint } from './draft';
import { haptic } from '../../state/ui';

/**
 * Pointer-based drag and drop for sounds, so it works the same with mouse, pen and touch.
 * Mouse and pen pick up after a few pixels of movement. Touch picks up on a short hold,
 * so an ordinary swipe still scrolls the page.
 */
export interface DragState {
  source: BlockSource;
  x: number;
  y: number;
  /** Where on the grid the pointer is, or null when it is off the grid. */
  at: GridPoint | null;
}

type Resolver = (x: number, y: number, source: BlockSource) => GridPoint | null;

let current: DragState | null = null;
let resolver: Resolver | null = null;
let clickBlockedUntil = 0;
const listeners = new Set<() => void>();

const emit = (next: DragState | null) => {
  current = next;
  listeners.forEach(l => l());
};

export const useDrag = () =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );

/** The block grid tells the drag layer which row, time and block sit under a point. */
export function registerGrid(resolve: Resolver) {
  resolver = resolve;
  return () => {
    if (resolver === resolve) resolver = null;
  };
}

/** True right after a drag ends, so the click the browser fires afterwards can be ignored. */
export const clickWasDrag = () => performance.now() < clickBlockedUntil;

const HOLD_MS = 180;
const MOUSE_SLOP = 6;
const TOUCH_SLOP = 10;

export function pressToDrag(e: ReactPointerEvent, source: BlockSource, onDrop: (state: DragState) => void) {
  if (e.button !== 0) return;
  const touch = e.pointerType === 'touch';
  const id = e.pointerId;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let dragging = false;
  let holdTimer = 0;

  const locate = (x: number, y: number): DragState => ({ source, x, y, at: resolver?.(x, y, source) ?? null });
  const begin = (x: number, y: number) => {
    dragging = true;
    haptic(8);
    getSelection()?.removeAllRanges();
    document.documentElement.classList.add('is-dragging');
    emit(locate(x, y));
  };
  const blockScroll = (ev: TouchEvent) => {
    if (dragging) ev.preventDefault();
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const dist = Math.hypot(ev.clientX - x0, ev.clientY - y0);
    if (!dragging) {
      if (touch) {
        if (dist > TOUCH_SLOP) finish(); // a scroll, not a pick-up
        return;
      }
      if (dist < MOUSE_SLOP) return;
      begin(ev.clientX, ev.clientY);
    }
    emit(locate(ev.clientX, ev.clientY));
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const state = dragging ? locate(ev.clientX, ev.clientY) : null;
    finish();
    if (state) {
      clickBlockedUntil = performance.now() + 350;
      onDrop(state);
    }
  };
  const finish = () => {
    clearTimeout(holdTimer);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
    removeEventListener('touchmove', blockScroll);
    if (dragging) emit(null);
    dragging = false;
    document.documentElement.classList.remove('is-dragging');
  };
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish();
  };

  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cancel);
  addEventListener('touchmove', blockScroll, { passive: false });
  if (touch) holdTimer = window.setTimeout(() => begin(x0, y0), HOLD_MS);
}
