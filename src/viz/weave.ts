import { SOUNDS } from '../core/sounds';
import type { SoundId } from '../core/types';
import { hash, wobble } from './strands';

/**
 * One track row of the block editor. Each block is a sheaf of fine threads in its sound's
 * colour and texture. Where blocks on the same row overlap, the sheaves swing around each
 * other on offset phases and pass straight through one another; colours add where they
 * cross (screen blend), so the knot glows where sounds meet instead of stacking.
 */
const PERIOD_PX = 260;
export interface WeaveBlock {
  id: string;
  sound: SoundId;
  start: number;
  end: number;
  level: number;
  /** Fade lengths in seconds, so the bundle swells in and out like the audio. */
  fadeIn: number;
  fadeOut: number;
  /** 0–1: how far this block has woven in after being combined (1 when settled). */
  join: number;
  /** Drawn faintly, e.g. while it is being dragged away. */
  ghost?: boolean;
}

const smooth = (x: number) => {
  const v = Math.max(0, Math.min(1, x));
  return v * v * (3 - 2 * v);
};

function envelope(b: WeaveBlock, t: number) {
  if (t < b.start || t > b.end) return 0;
  let v = 1;
  if (b.fadeIn > 0) v = Math.min(v, (t - b.start) / b.fadeIn);
  if (b.fadeOut > 0) v = Math.min(v, (b.end - t) / b.fadeOut);
  // Keep a visible minimum inside the block so short fades never vanish entirely.
  return 0.18 + 0.82 * smooth(v);
}

/** Box blur, so the braid eases in over the overlap edges instead of snapping. */
function blur(src: Float32Array, radius: number) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    let n = 0;
    for (let d = -radius; d <= radius; d++) {
      const k = i + d;
      if (k >= 0 && k < src.length) {
        sum += src[k];
        n++;
      }
    }
    out[i] = sum / n;
  }
  return out;
}

export function drawRow(g: CanvasRenderingContext2D, w: number, h: number, blocks: WeaveBlock[], L: number, time: number) {
  g.clearRect(0, 0, w, h);
  if (w < 2 || h < 2 || !blocks.length) return;
  const cols = Math.max(24, Math.floor(w / 2.5));
  const mid = h / 2;
  const xAt = (i: number) => (i / cols) * w;
  const tAt = (i: number) => (i / cols) * L;

  const audible = blocks.filter(b => SOUNDS[b.sound].category !== 'quiet');
  const quiet = blocks.filter(b => SOUNDS[b.sound].category === 'quiet');

  // Presence of each block per column, and how braided it is (overlapping another block).
  const env = audible.map(b => {
    const e = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) e[i] = envelope(b, tAt(i));
    return e;
  });
  // Wide enough that a braid unwinds over a few crossings' length rather than kinking.
  const radius = Math.max(4, Math.round(cols * 0.04));
  const braid = audible.map((b, j) => {
    const raw = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) {
      if (!env[j][i]) continue;
      const others = audible.some((_o, k) => k !== j && env[k][i] > 0);
      raw[i] = others ? 1 : 0;
    }
    const soft = blur(blur(raw, radius), radius);
    for (let i = 0; i <= cols; i++) soft[i] *= smooth(b.join);
    return soft;
  });

  // Offset phases spread the sounds evenly around the braid.
  const order = audible.map((b, j) => ({ j, key: b.start * 1e3 + j })).sort((a, b) => a.key - b.key);
  const phase = new Array<number>(audible.length);
  order.forEach((o, rank) => (phase[o.j] = (rank / Math.max(2, audible.length)) * Math.PI * 2));
  // One slow wave every PERIOD_PX, whatever the row's width, so the knot reads as a long drift.
  const radians = (i: number) => (xAt(i) / PERIOD_PX) * Math.PI * 2 + time * 0.25;
  const swing = h * 0.22;
  const scale = Math.min(1.2, h / 42);

  g.save();
  g.globalCompositeOperation = 'screen';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  audible.forEach((b, j) => {
    const def = SOUNDS[b.sound];
    const texture = def.strand.texture;
    const threads = 7 + Math.round(b.level * 3);
    const lineWidth = Math.max(0.9, def.strand.width * 0.6);
    const fade = b.ghost ? 0.25 : 1;
    // Each thread runs a little out of phase with its neighbours, so the sheaf twists
    // softly on its own and passes straight through the others where they cross.
    const path = (k: number) => {
      const off = k - (threads - 1) / 2;
      g.beginPath();
      let pen = false;
      for (let i = 0; i <= cols; i++) {
        const e = env[j][i];
        if (!e) {
          pen = false;
          continue;
        }
        const k2 = braid[j][i];
        const angle = radians(i) + phase[j] + off * 0.16;
        const spread = (4.4 - 2.1 * k2) * scale * (0.3 + 0.7 * e);
        const y = mid + Math.sin(angle) * swing * k2 + off * spread + wobble(texture, i / cols, i, k, time) * 0.55 * e;
        if (pen) g.lineTo(xAt(i), y);
        else g.moveTo(xAt(i), y);
        pen = true;
      }
    };
    g.strokeStyle = def.color;
    if (texture === 'pulse') g.setLineDash([3, 4]);
    for (let k = 0; k < threads; k++) {
      if (texture === 'pulse') g.lineDashOffset = -time * 18 - k * 2;
      path(k);
      // A faint wide halo under each thread gives the glow where colours meet.
      g.globalAlpha = 0.07 * fade;
      g.lineWidth = 6;
      g.stroke();
      g.globalAlpha = (0.45 + 0.4 * b.level) * (0.75 + 0.25 * hash(k, j + 3)) * fade;
      g.lineWidth = lineWidth;
      g.stroke();
    }
    g.setLineDash([]);

    if (texture === 'drops') {
      g.fillStyle = '#CFE0FF';
      const count = Math.max(4, Math.floor(w / 12));
      for (let d = 0; d < count; d++) {
        const u = (hash(d, 1) + time * 0.05 * (0.5 + hash(d, 2))) % 1;
        const i = Math.round(u * cols);
        if (!env[j][i]) continue;
        const centre = mid + Math.sin(radians(i) + phase[j]) * swing * braid[j][i];
        g.globalAlpha = (0.45 + 0.55 * hash(d, 4)) * fade;
        g.beginPath();
        g.arc(xAt(i), centre + (hash(d, 3) - 0.5) * 8 * 4.4 * scale * env[j][i] * 0.5, 1.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  g.restore();

  // Quiet blocks: grey strands that pinch to a hairline across their span.
  for (const q of quiet) {
    g.strokeStyle = '#9d978b';
    g.lineWidth = 1;
    const span = q.end - q.start;
    for (let k = 0; k < 5; k++) {
      g.globalAlpha = (0.35 + 0.4 * hash(k, 9)) * (q.ghost ? 0.3 : 1);
      g.beginPath();
      let pen = false;
      for (let i = 0; i <= cols; i++) {
        const t = tAt(i);
        if (t < q.start || t > q.end) {
          pen = false;
          continue;
        }
        const u = (t - q.start) / span;
        const pinch = 1 - q.level * smooth(u / 0.4) * smooth((1 - u) / 0.4);
        const y = mid + (k / 4 - 0.5) * h * 0.62 * pinch;
        if (pen) g.lineTo(xAt(i), y);
        else g.moveTo(xAt(i), y);
        pen = true;
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}
