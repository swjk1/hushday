import type { SoundId } from '../core/types';
import { hash } from './strands';

/**
 * How each sound's sheaf of threads is shaped in the editor's track rows. Every band places
 * thread k of n relative to the row's centre line; the row renderer adds the braid swing,
 * the fades at block edges and the tightening where blocks overlap.
 */

const TAU = Math.PI * 2;
const smooth = (x: number) => {
  const v = Math.max(0, Math.min(1, x));
  return v * v * (3 - 2 * v);
};
const frac = (x: number) => ((x % 1) + 1) % 1;
const bump = (p: number, c: number, width: number) => {
  const d = Math.abs(p - c) / width;
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d);
};
/** Smooth value noise along one axis. */
const noise = (x: number, seed: number) => {
  const a = Math.floor(x);
  return hash(a, seed) + (hash(a + 1, seed) - hash(a, seed)) * smooth(x - a);
};

/** Patterns repeat by pixels rather than by row width, so a band looks the same at any size. */
export const BAND_PX = 480;

export interface BandThread {
  /** Row height in px. */
  h: number;
  /** 0–1 block intensity. */
  level: number;
  /** Thread index centred on zero. */
  off: number;
  /** Thread index as 0–1, first to last. */
  f: number;
}

export interface BandOverlay {
  w: number;
  h: number;
  time: number;
  /** Multiplier for anything drawn, e.g. while the block is being dragged away. */
  fade: number;
  /** Block presence (0 outside it) at x px. */
  envAt: (x: number) => number;
  /** The band's centre line at x px, including the braid swing. */
  centreAt: (x: number) => number;
}

export interface Band {
  /** Threads at zero intensity; up to three more are added as the level rises. */
  threads: number;
  /** Offset of one thread from the centre line, in px. `u` is x / BAND_PX, `i` the column. */
  y: (u: number, i: number, k: number, n: number, time: number, c: BandThread) => number;
  /** Optional 0–1 brightness along the thread. */
  alpha?: (u: number, k: number, n: number, time: number) => number;
  /** Optional marks drawn over the threads: falling rain, sparks. */
  overlay?: (g: CanvasRenderingContext2D, o: BandOverlay) => void;
}

/** Ocean's wave profile: a quick rise to the crest and a long fall, like the audio swell. */
function crest(u: number, time: number) {
  const p = frac(u * 2.2 + time * 0.07);
  const s = p < 0.3 ? Math.sin((Math.PI / 2) * (p / 0.3)) : Math.cos((Math.PI / 2) * ((p - 0.3) / 0.7));
  return s * s;
}

const CRICKETS = [
  { at: 0.17, rate: 0.9, len: 0.45, phase: 0.1 },
  { at: 0.55, rate: 0.7, len: 0.5, phase: 0.6 },
  { at: 0.83, rate: 1.15, len: 0.35, phase: 0.35 },
];

export const BANDS: Record<Exclude<SoundId, 'quiet'>, Band> = {
  // A tight, thick bundle whose whole centre rolls in one long, slow wave.
  brown: {
    threads: 9,
    y: (u, _i, k, _n, t, c) => Math.sin(u * TAU * 1.6 - t * 0.35) * c.h * 0.14 + c.off * 2.6 + Math.sin(u * 16 + t * 0.6 + k * 0.7) * 0.7,
  },
  // Heavy threads hang in swags between anchors: bunched at the anchors, spread where they sag.
  red: {
    threads: 6,
    y: (u, _i, k, _n, t, c) => {
      const sag = Math.sin(Math.PI * frac(u * 2.5 - t * 0.04));
      return -c.h * 0.12 + sag * c.h * 0.26 * (0.85 + 0.15 * Math.sin(t * 0.6 + k)) + c.off * (1 + 2.6 * sag);
    },
  },
  // Even threads, each ripple a step behind the last, so diagonal bands of light drift across.
  pink: {
    threads: 11,
    y: (u, _i, k, _n, t, c) => c.off * 3.2 + Math.sin(u * TAU * 9 + k * 0.55 - t * 1.1) * 2.2,
  },
  // Fine, nearly straight threads that fan open and closed, with a light fizz on each.
  white: {
    threads: 14,
    y: (u, i, k, _n, t, c) => c.off * (0.9 + 1.7 * (0.5 + 0.5 * Math.sin(u * TAU * 2 - t * 0.5))) + (hash(i, k, Math.floor(t * 14)) - 0.5) * 1.2,
  },
  // Six fixed nodes per span; between them the wave rises and falls in place.
  tone432: {
    threads: 8,
    y: (u, _i, _k, _n, t, c) => Math.sin(u * TAU * 6) * Math.sin(t * 1.4) * c.h * 0.2 * (0.4 + 0.6 * c.f) + c.off * 1.2,
  },
  // The same with eight nodes and a quicker pulse, so beside 432 Hz it reads as the higher note.
  tone528: {
    threads: 8,
    y: (u, _i, _k, _n, t, c) => Math.sin(u * TAU * 8) * Math.sin(t * 1.8) * c.h * 0.17 * (0.4 + 0.6 * c.f) + c.off * 1.1,
  },
  // Threads leave pinched together and fan out as they travel, like air leaving the blades.
  fan: {
    threads: 10,
    y: (u, _i, k, _n, t, c) => {
      const p = frac(u * 3 - t * 0.45);
      const open = smooth(p < 0.85 ? p / 0.85 : (1 - p) / 0.15);
      return c.off * (1 + 3.6 * open) + Math.sin(u * 40 + t * 4 + k) * 0.3;
    },
  },
  // A calm band with short streaks falling straight down through it.
  rain: {
    threads: 8,
    y: (u, _i, k, _n, t, c) => c.off * 2.6 + Math.sin(u * 12 + t * 0.6 + k) * 0.6,
    overlay: (g, o) => {
      g.strokeStyle = '#CFE0FF';
      g.lineWidth = 1;
      g.lineCap = 'round';
      const count = Math.max(6, Math.floor(o.w / 7));
      for (let d = 0; d < count; d++) {
        const x0 = hash(d, 1) * o.w;
        if (o.envAt(x0) < 0.2) continue;
        const fall = frac(o.time * (0.7 + 0.6 * hash(d, 2)) + hash(d, 3));
        const x = x0 - fall * 3;
        const y = fall * o.h;
        const len = 3 + 3 * hash(d, 4);
        g.globalAlpha = Math.sin(Math.PI * fall) * 0.85 * o.fade;
        g.beginPath();
        g.moveTo(x + 0.8, y - len);
        g.lineTo(x, y);
        g.stroke();
      }
    },
  },
  // Lopsided waves; threads spread and brighten at the crest like foam.
  ocean: {
    threads: 9,
    y: (u, _i, _k, _n, t, c) => {
      const s = crest(u, t);
      return (0.5 - s) * c.h * 0.36 + c.off * (1.8 + 2.6 * s);
    },
    alpha: (u, _k, _n, t) => 0.5 + 0.5 * crest(u, t),
  },
  // Fine lines of air; a gust travels along and the lines bow apart around it.
  wind: {
    threads: 9,
    y: (u, _i, k, _n, t, c) => {
      const gust = bump(frac(u - t * 0.07), 0.5, 0.24);
      return c.off * (2.3 + 3.6 * gust) + Math.sin(u * TAU * 1.5 + t * 0.4 + k * 0.15) * c.h * 0.06;
    },
  },
  // Three thin channels wander at their own speeds, splitting apart and crossing back.
  stream: {
    threads: 9,
    y: (u, _i, k, _n, t, c) => {
      const channel = k % 3;
      const lane = Math.floor(k / 3);
      return Math.sin(u * TAU * (2 + 0.7 * channel) + t * (0.6 + 0.25 * channel) + channel * 2.1) * c.h * 0.16 + (lane - 1) * 1.6 + Math.sin(u * 40 + t * 3 + k) * 0.4;
    },
  },
  // Threads rise from a baseline into flickering tongues, with sparks lifting off.
  fire: {
    threads: 9,
    y: (u, _i, _k, _n, t, c) => {
      const tongue = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(u * TAU * 8 + t * 2.6 + 2 * Math.sin(u * TAU * 3 - t * 1.7)));
      const flicker = 0.7 + 0.3 * noise(u * 18 + t * 2, 7);
      return c.h * 0.34 - c.f * c.h * 0.6 * tongue * flicker;
    },
    alpha: (_u, k, n) => 1 - 0.55 * (k / Math.max(1, n - 1)),
    overlay: (g, o) => {
      g.fillStyle = '#FFD59A';
      const count = Math.max(4, Math.floor(o.w / 18));
      for (let d = 0; d < count; d++) {
        const x0 = hash(d, 1) * o.w;
        if (o.envAt(x0) < 0.2) continue;
        const life = frac(o.time * (0.35 + 0.35 * hash(d, 2)) + hash(d, 3));
        g.globalAlpha = Math.sin(Math.PI * life) * (0.5 + 0.5 * hash(d, 4)) * o.fade;
        g.beginPath();
        g.arc(x0 + Math.sin(life * 6 + d) * 3, o.centreAt(x0) + o.h * 0.3 - life * o.h * 0.85, 0.8 + 0.8 * (1 - life), 0, TAU);
        g.fill();
      }
    },
  },
  // A still band; crickets at points along it trill in short bursts that ripple the threads.
  night: {
    threads: 8,
    y: (u, _i, _k, _n, t, c) => {
      let dy = 0;
      let open = 0;
      for (const cr of CRICKETS) {
        const on = frac(t * cr.rate + cr.phase) < cr.len ? 1 : 0;
        const near = bump(frac(u), cr.at, 0.07) * on;
        dy += near * Math.sin(u * BAND_PX * 0.9 + t * 30) * 3.4;
        open = Math.max(open, near);
      }
      return c.off * 1.8 * (1 + open * 1.4) + Math.sin(u * TAU + t * 0.2) * c.h * 0.03 + dy;
    },
  },
  // Two slow, still waves crossing into a chain of lenses: calm, regular, unhurried.
  zen: {
    threads: 7,
    y: (u, _i, _k, _n, t, c) => Math.sin(u * TAU * 2.5 - t * 0.25) * c.h * 0.18 * Math.cos(c.f * Math.PI),
  },
  // The band pinches and swells at a steady spacing, like beads on a string travelling along.
  focus: {
    threads: 8,
    y: (u, _i, _k, _n, t, c) => c.off * (0.6 + 3.2 * (0.5 + 0.5 * Math.cos(u * TAU * 14 - t * 3))),
  },
};

/** Quiet blocks: straight strands close to a point at the centre and open again, dimming as they meet. */
export const QUIET_BAND = {
  strands: 6,
  /** 0–1 share of the full spread at u (0–1 across the block). */
  spread: (u: number, depth: number) => 1 - depth * (1 - Math.pow(Math.abs(2 * u - 1), 1.3)),
  alpha: (u: number, depth: number) => 1 - depth * 0.75 * (1 - Math.abs(2 * u - 1)),
};
