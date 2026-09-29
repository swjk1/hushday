import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { positionAt } from '../core/timeline';
import { usePlayback } from '../state/playback';
import { drawWave } from '../viz/wave';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The playing Mix as a live waveform, standing in for a progress bar. Bright up to now, dim
 * ahead. Clicking jumps to that point (not during a Zone, whose timing is the point).
 */
export function PlayerWave({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { status, info } = usePlayback();
  const active = !!info && status !== 'idle';
  const moving = status === 'playing' && !reducedMotion();
  const seekable = active && status !== 'complete' && info.kind !== 'zone';

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    let frame = 0;
    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mix = active ? info.mix : null;
      const now = mix ? (status === 'complete' ? mix.lengthSec : positionAt(mix, engine.elapsed()).pos) : 0;
      drawWave(g, w, h, mix, now, moving ? performance.now() / 1000 : 3, engine.loudness());
    };
    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };
    if (moving) frame = requestAnimationFrame(loop);
    else paint();
    const resize = new ResizeObserver(paint);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [active, moving, info]);

  return (
    <canvas
      ref={canvas}
      className={`wave ${seekable ? 'seekable' : ''} ${className ?? ''}`}
      role="img"
      aria-label={active ? `${info.mix.name}, playback position` : 'Nothing playing'}
      onClick={seekable ? e => {
        const r = e.currentTarget.getBoundingClientRect();
        const f = Math.min(0.98, Math.max(0, (e.clientX - r.left) / r.width));
        void engine.start(info, Math.round(f * info.mix.lengthSec));
      } : undefined}
    />
  );
}
