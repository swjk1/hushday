import { SOUNDS } from '../core/sounds';
import type { SoundId } from '../core/types';
import { hash } from './strands';
import { BANDS, BAND_PX, QUIET_BAND } from './bands';

/**
 * One track row of the block editor. Each block is a sheaf of fine threads in its sound's
 * colour, shaped by that sound's band (bands.ts). Where blocks on the same row overlap, the sheaves swing around each
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
  const at = (x: number) => Math.round(Math.min(cols, Math.max(0, (x / w) * cols)));

  g.save();
  g.globalCompositeOperation = 'screen';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  audible.forEach((b, j) => {
    const def = SOUNDS[b.sound];
    const band = BANDS[b.sound as Exclude<SoundId, 'quiet'>];
    const threads = band.threads + Math.round(b.level * 3);
    const lineWidth = Math.max(0.9, def.strand.width * 0.6);
    const fade = b.ghost ? 0.25 : 1;
    const centre = (i: number) => mid + Math.sin(radians(i) + phase[j]) * swing * braid[j][i];
    g.strokeStyle = def.color;
    for (let k = 0; k < threads; k++) {
      const c = { h, level: b.level, off: k - (threads - 1) / 2, f: k / Math.max(1, threads - 1) };
      const pts: (Point | null)[] = [];
      for (let i = 0; i <= cols; i++) {
        const e = env[j][i];
        if (!e) {
          pts.push(null);
          continue;
        }
        const u = xAt(i) / BAND_PX;
        // Each sound keeps its own shape alone, and tightens where it braids so the knot still reads.
        const y = centre(i) + band.y(u, i, k, threads, time, c) * (0.3 + 0.7 * e) * (1 - 0.45 * braid[j][i]);
        pts.push([xAt(i), y, band.alpha ? band.alpha(u, k, threads, time) : 1]);
      }
      strokeThread(g, pts, (0.45 + 0.4 * b.level) * (0.75 + 0.25 * hash(k, j + 3)) * fade, lineWidth, true);
    }
    if (band.overlay) {
      g.save();
      band.overlay(g, { w, h, time, fade, envAt: x => env[j][at(x)], centreAt: x => centre(at(x)) });
      g.restore();
    }
  });
  g.restore();

  // Quiet blocks: grey strands that close to a point at the centre and open again, dimming as they meet.
  g.strokeStyle = '#9d978b';
  for (const q of quiet) {
    const span = q.end - q.start;
    const n = QUIET_BAND.strands;
    for (let k = 0; k < n; k++) {
      const pts: (Point | null)[] = [];
      for (let i = 0; i <= cols; i++) {
        const t = tAt(i);
        if (t < q.start || t > q.end) {
          pts.push(null);
          continue;
        }
        const u = (t - q.start) / span;
        pts.push([xAt(i), mid + (k / (n - 1) - 0.5) * h * 0.62 * QUIET_BAND.spread(u, q.level), QUIET_BAND.alpha(u, q.level)]);
      }
      strokeThread(g, pts, (0.35 + 0.4 * hash(k, 9)) * (q.ghost ? 0.3 : 1), 1, false);
    }
  }
  g.globalAlpha = 1;
}

type Point = [x: number, y: number, alpha: number];

/**
 * One thread, broken into runs wherever the block is absent. With a halo, a faint wide stroke
 * sits under the thin one so colours glow where they cross. Brightness can vary along the
 * thread, so it is drawn in short pieces, each at its mean brightness.
 */
function strokeThread(g: CanvasRenderingContext2D, pts: (Point | null)[], base: number, lineWidth: number, halo: boolean) {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const p of pts) {
    if (p) run.push(p);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  const STEP = 5;
  for (const r of runs) {
    const even = r.every(p => p[2] === r[0][2]);
    for (let a = 0; a < r.length - 1; a += even ? r.length : STEP) {
      const piece = r.slice(a, even ? r.length : Math.min(r.length, a + STEP + 1));
      const alpha = base * (piece.reduce((m, p) => m + p[2], 0) / piece.length);
      g.beginPath();
      g.moveTo(piece[0][0], piece[0][1]);
      for (let i = 1; i < piece.length; i++) g.lineTo(piece[i][0], piece[i][1]);
      if (halo) {
        g.globalAlpha = 0.07 * Math.min(1, alpha * 1.4);
        g.lineWidth = 6;
        g.stroke();
      }
      g.globalAlpha = alpha;
      g.lineWidth = lineWidth;
      g.stroke();
    }
  }
}
