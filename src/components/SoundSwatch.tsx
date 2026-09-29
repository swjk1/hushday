import { useEffect, useRef } from 'react';
import type { SoundId } from '../core/types';
import { drawSwatch } from '../viz/strands';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  sound: SoundId;
  level: number;
  animate?: boolean;
  feather?: boolean;
  taper?: { in: number; out: number };
  className?: string;
}

/** A single sound drawn as a live strand band. Sized by CSS; redraws on resize. */
export function SoundSwatch({ sound, level, animate = false, feather = false, taper, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    let frame = 0;
    let visible = true;
    const still = 2 + sound.length;

    const paint = (time: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSwatch(g, w, h, sound, { time, level, feather, taper });
    };

    const moving = animate && !reducedMotion();
    const loop = () => {
      if (visible) paint(performance.now() / 1000);
      frame = requestAnimationFrame(loop);
    };
    if (moving) frame = requestAnimationFrame(loop);
    else paint(still);

    const resize = new ResizeObserver(() => {
      if (!moving) paint(still);
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
  }, [sound, level, animate, feather, taper?.in, taper?.out]);

  return <canvas ref={canvas} className={`swatch ${className ?? ''}`} aria-hidden="true" />;
}
