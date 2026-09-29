import { useEffect, useRef } from 'react';
import { drawRow, type WeaveBlock } from '../viz/weave';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const JOIN_SEC = 0.9;

type RowBlock = Omit<WeaveBlock, 'join'>;

interface Props {
  blocks: RowBlock[];
  lengthSec: number;
  animate: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const partnersOf = (b: RowBlock, all: RowBlock[]) =>
  all.filter(o => o.id !== b.id && o.start < b.end && o.end > b.start).map(o => o.id).sort().join(',');

/**
 * Canvas for one track row. When a block gains a new overlapping partner, both weave
 * together over a moment instead of snapping into the braid.
 */
export function RowCanvas({ blocks, lengthSec, animate, className, style }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const joins = useRef(new Map<string, { partners: string; at: number }>());
  const props = useRef({ blocks, lengthSec });
  props.current = { blocks, lengthSec };

  // Note new partnerships synchronously with the render that creates them.
  const now = performance.now() / 1000;
  const seen = joins.current;
  const first = seen.size === 0;
  for (const b of blocks) {
    const partners = partnersOf(b, blocks);
    const prev = seen.get(b.id);
    const grew = prev ? partners.split(',').some(p => p && !prev.partners.includes(p)) : !first && partners !== '';
    if (!prev || prev.partners !== partners) seen.set(b.id, { partners, at: grew && !reducedMotion() ? now : prev?.at ?? -Infinity });
  }
  for (const id of [...seen.keys()]) if (!blocks.some(b => b.id === id)) seen.delete(id);
  const signature = blocks.map(b => `${b.id}:${b.start}:${b.end}:${b.level}:${b.ghost ? 1 : 0}`).join('|');

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
      const clock = performance.now() / 1000;
      let settling = false;
      const woven = props.current.blocks.map(b => {
        const at = joins.current.get(b.id)?.at ?? -Infinity;
        const join = Math.min(1, Math.max(0, (clock - at) / JOIN_SEC));
        if (join < 1) settling = true;
        return { ...b, join };
      });
      drawRow(g, w, h, woven, props.current.lengthSec, animate && !reducedMotion() ? clock : 3);
      return settling;
    };

    const loop = () => {
      const settling = paint();
      if ((animate && !reducedMotion()) || settling) frame = requestAnimationFrame(loop);
    };
    loop();

    const resize = new ResizeObserver(() => paint());
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [signature, lengthSec, animate]);

  return <canvas ref={canvas} className={`row-canvas ${className ?? ''}`} style={style} aria-hidden="true" />;
}
