import { fades } from '../core/timeline';
import type { MixDraft } from '../core/types';
import { RowCanvas } from './RowCanvas';

/** A whole Mix drawn as one knot: every sound on one row, braided where they overlap. */
export function Knot({ mix, animate = false, className }: { mix: MixDraft; animate?: boolean; className?: string }) {
  const blocks = mix.components.map(c => {
    const f = fades(c, mix);
    return { id: c.id, sound: c.sound, start: c.start, end: c.end, level: c.level, fadeIn: f.fadeIn, fadeOut: f.fadeOut };
  });
  return <RowCanvas blocks={blocks} lengthSec={mix.lengthSec} animate={animate} className={`knot ${className ?? ''}`} />;
}
