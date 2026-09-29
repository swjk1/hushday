import { useEffect, useRef } from 'react';
import type { MixDraft } from '../core/types';
import { drawRibbon } from '../viz/ribbon';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  mix: MixDraft;
  height: number;
  animate?: boolean;
  compact?: boolean;
  /** Read every frame; return the current position in the Mix, or null for none. */
  playhead?: () => number | null;
  /** Called with a 0–1 position when the ribbon is tapped. */
  onSeek?: (fraction: number) => void;
  className?: string;
  label?: string;
}

export function MixRibbon({ mix, height, animate = false, compact = false, playhead, onSeek, className, label }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ mix, playhead, compact });
  props.current = { mix, playhead, compact };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext('2d');
    if (!g) return;
    let frame = 0;
    let visible = true;
    let width = 0;
    const seed = (mix.name.length * 7.3) % 50;
    const background = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#101825';

    const paint = (time: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = el.clientWidth;
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(height * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRibbon(g, width, height, props.current.mix, {
        time, compact: props.current.compact, background, playhead: props.current.playhead?.() ?? null,
      });
    };

    const moving = (animate || !!playhead) && !reducedMotion();
    const loop = () => {
      if (visible) paint(performance.now() / 1000);
      frame = requestAnimationFrame(loop);
    };
    if (moving) frame = requestAnimationFrame(loop);
    else paint(seed);

    const resize = new ResizeObserver(() => {
      if (!moving) paint(seed);
    });
    resize.observe(el);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
    };
  }, [mix, height, animate, !!playhead]);

  return (
    <canvas
      ref={canvas}
      className={`ribbon ${onSeek ? 'seekable' : ''} ${className ?? ''}`}
      style={{ height }}
      role="img"
      aria-label={label ?? `Visual of ${mix.name}`}
      onClick={onSeek ? event => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      } : undefined}
    />
  );
}
