import { useEffect, useRef } from 'react';
import { drawBlend, type BlendLayer } from '../viz/blend';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const MERGE_SEC = 1.1;

interface Props {
  layers: BlendLayer[];
  seed: number;
  animate?: boolean;
  compact?: boolean;
  focus?: string | null;
  glow?: number;
  className?: string;
  label?: string;
}

/**
 * Canvas for a blend emblem. Layers that appear after the first paint play a merge-in,
 * so dropping a sound onto the blend visibly weaves it in.
 */
export function BlendCanvas({ layers, seed, animate = true, compact = false, focus = null, glow = 0, className, label }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ layers, seed, focus, glow });
  props.current = { layers, seed, focus, glow };
  const arrivals = useRef<Map<string, number> | null>(null);

  // Note arrivals synchronously with the render that introduces them.
  const now = performance.now() / 1000;
  if (!arrivals.current) arrivals.current = new Map(layers.map(l => [l.key, -Infinity]));
  for (const l of layers) if (!arrivals.current.has(l.key)) arrivals.current.set(l.key, reducedMotion() ? -Infinity : now);
  for (const key of [...arrivals.current.keys()]) if (!layers.some(l => l.key === key)) arrivals.current.delete(key);

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    let frame = 0;
    let visible = true;
    const still = 4.2;

    const paint = (time: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const merging: Record<string, number> = {};
      const clock = performance.now() / 1000;
      arrivals.current!.forEach((at, key) => {
        const p = (clock - at) / MERGE_SEC;
        if (p < 1) merging[key] = Math.max(0, p);
      });
      const { layers: current, seed: s, focus: f, glow: gl } = props.current;
      drawBlend(g, w, h, current, { time, seed: s, merging, focus: f, glow: gl, compact });
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
    // While animating, the loop reads the latest props itself; a still canvas repaints on change.
  }, [animate, compact, animate ? null : layers, animate ? null : seed, animate ? null : focus, animate ? null : glow]);

  return <canvas ref={canvas} className={`blend-canvas ${className ?? ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
