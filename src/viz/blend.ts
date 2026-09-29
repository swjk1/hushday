import { SOUNDS, type StrandTexture } from '../core/sounds';
import { canonicalize } from '../core/fingerprint';
import type { MixDraft, SoundId } from '../core/types';
import { hash } from './strands';

/**
 * The blend: every layer of a Mix drawn as rings around one centre, each in its own
 * visual language. Rings overlap and are added together (lighter compositing), so where
 * sounds meet their colours merge. The outline is seeded by the Mix structure, so the
 * same Mix always draws the same emblem and a different Mix draws a different one.
 */
export interface BlendLayer {
  key: string;
  sound: SoundId;
  level: number;
}

export interface BlendOptions {
  time: number;
  seed: number;
  /** Layer key → 0–1 progress of its merge-in animation. Missing means settled. */
  merging?: Record<string, number>;
  /** Layer to bring forward; the others dim. */
  focus?: string | null;
  /** 0–1: something is being dragged over the blend. */
  glow?: number;
  /** Small single-sound orbs: fewer strands and segments. */
  compact?: boolean;
}

const TAU = Math.PI * 2;
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

interface Look {
  /** Radial offset in px for strand k at angle a. */
  shape: (a: number, seg: number, k: number, t: number, R: number) => number;
  segments: number;
  width: number;
  dash?: (t: number, k: number) => { pattern: number[]; offset: number };
  join?: CanvasLineJoin;
}

function look(texture: StrandTexture, compact: boolean): Look {
  const seg = compact ? 72 : 180;
  switch (texture) {
    case 'smooth': return { segments: seg, width: 2, shape: (a, _s, k, t, R) => Math.sin(a * 3 + t * 0.5 + k * 0.7) * R * 0.014 };
    case 'heavy': return { segments: seg, width: 3.2, shape: (a, _s, k, t, R) => Math.sin(a * 2 + t * 0.25 + k * 0.3) * R * 0.024 + Math.sin(a * 5 - t * 0.15) * R * 0.006 };
    case 'ripple': return { segments: seg, width: 1.4, shape: (a, _s, k, t, R) => Math.sin(a * 14 + t * 1.2 + k * 1.5) * R * 0.01 };
    case 'grain': return { segments: seg, width: 0.9, shape: (_a, s, k, t, R) => (hash(s, k, Math.floor(t * 14)) - 0.5) * R * 0.03 };
    case 'spike': {
      const n = compact ? 36 : 64;
      return {
        segments: n * 2, width: 1.1, join: 'miter',
        shape: (_a, s, k, t, R) => (s % 2 ? 1 : -0.35) * (0.35 + hash(s, k, Math.floor(t * 18))) * R * 0.05,
      };
    }
    case 'drops': return { segments: seg, width: 1, shape: (a, _s, k, t, R) => Math.sin(a * 6 + t * 0.6 + k) * R * 0.006 };
    case 'swell': return { segments: seg, width: 1.8, shape: (a, _s, k, t, R) => Math.sin(a * 2 - t * 0.6 + k * 0.12) * R * 0.045 * (0.55 + 0.45 * Math.sin(t * 0.4)) };
    case 'silk': return { segments: seg, width: 0.8, shape: (a, _s, k, t, R) => Math.sin(a * 2 + k * 0.4 + t * 0.3) * R * 0.05 };
    case 'pulse': return {
      segments: seg, width: 1.6,
      shape: (a, _s, k, t, R) => Math.sin(a * 4 + t + k * 0.5) * R * 0.008,
      dash: (t, k) => ({ pattern: [3, 5], offset: -t * 24 - k * 3 }),
    };
    default: return { segments: seg, width: 1, shape: () => 0 };
  }
}

/** Seeded silhouette shared by every layer: a few slow lobes. */
function outline(seed: number) {
  const lobes = [2 + Math.floor(hash(seed, 1) * 3), 5 + Math.floor(hash(seed, 2) * 3)];
  const phase = [hash(seed, 3) * TAU, hash(seed, 4) * TAU];
  const amp = [0.035 + hash(seed, 5) * 0.035, 0.01 + hash(seed, 6) * 0.015];
  return (a: number, t: number, R: number) =>
    (Math.sin(a * lobes[0] + phase[0] + t * 0.07) * amp[0] + Math.sin(a * lobes[1] + phase[1] - t * 0.05) * amp[1]) * R;
}

export function drawBlend(g: CanvasRenderingContext2D, w: number, h: number, layers: BlendLayer[], o: BlendOptions) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const R = (Math.min(w, h) / 2) * (o.compact ? 0.92 : 0.86);
  const t = o.time;
  const shapeOf = outline(o.seed);
  const spin = hash(o.seed, 7) * TAU;

  if (o.glow) {
    const halo = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.1);
    halo.addColorStop(0, `rgba(242, 238, 229, ${0.08 * o.glow})`);
    halo.addColorStop(1, 'rgba(242, 238, 229, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
  }

  const audible = layers.filter(l => SOUNDS[l.sound].category !== 'quiet');
  if (!audible.length) return;

  // Bands stack outwards and overlap by a third, so neighbours weave into each other.
  const inner = R * (o.compact ? 0.28 : 0.2);
  const weights = audible.map(l => 0.45 + 0.55 * l.level);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = R - inner;
  let cursor = inner;

  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  audible.forEach((layer, j) => {
    const def = SOUNDS[layer.sound];
    const L = look(def.strand.texture, !!o.compact);
    const band = (span * weights[j]) / total;
    const p = ease(o.merging?.[layer.key] ?? 1);
    const dim = o.focus && o.focus !== layer.key ? 0.3 : 1;
    // Arriving layers spiral in from outside with extra energy, then settle into their band.
    const base = cursor - band * 0.18 + (1 - p) * R * 0.5;
    const width = band * 1.36 * (0.4 + 0.6 * p);
    // Small orbs exaggerate each texture so spiky, silky and heavy still read at a glance.
    const energy = (1 + (1 - p) * 3) * (o.compact ? 2.4 : 1);
    const twist = (1 - p) * Math.PI * 0.9;
    const strands = Math.max(2, Math.min(o.compact ? 6 : 14, Math.round(width / (def.strand.spacing * (o.compact ? 1.6 : 2.2)))));
    cursor += band;

    g.strokeStyle = def.color;
    g.lineWidth = L.width * (o.compact ? 0.8 : 1) * (0.7 + 0.3 * layer.level);
    g.lineJoin = L.join ?? 'round';

    for (let k = 0; k < strands; k++) {
      const r0 = base + (width * (k + 0.5)) / strands;
      g.globalAlpha = (0.32 + 0.4 * hash(k, j + 11)) * p * dim * (def.strand.texture === 'pulse' ? 0.75 + 0.25 * Math.sin(t * 7.5 + k) : 1);
      if (L.dash) {
        const d = L.dash(t, k);
        g.setLineDash(d.pattern);
        g.lineDashOffset = d.offset;
      }
      g.beginPath();
      if (def.strand.texture === 'silk') {
        // Wind: open arcs that sweep around and thin out, never closed rings.
        const start = spin + t * (0.12 + 0.05 * hash(k, 2)) + k * 1.3 + twist;
        const sweep = TAU * (0.45 + 0.35 * hash(k, 5));
        const n = Math.round(L.segments * (sweep / TAU));
        for (let s = 0; s <= n; s++) {
          const a = start + (sweep * s) / n;
          const r = r0 + L.shape(a, s, k, t, R) * energy + shapeOf(a, t, R);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          (s ? g.lineTo : g.moveTo).call(g, x, y);
        }
        g.stroke();
        continue;
      }
      for (let s = 0; s <= L.segments; s++) {
        const a = spin + twist + (s / L.segments) * TAU;
        const r = Math.max(1, r0 + L.shape(a, s % L.segments, k, t, R) * energy + shapeOf(a, t, R));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        (s ? g.lineTo : g.moveTo).call(g, x, y);
      }
      g.closePath();
      g.stroke();
    }
    g.setLineDash([]);

    if (def.strand.texture === 'drops') {
      // Rain falls inward through its band.
      g.fillStyle = '#CFE0FF';
      const count = o.compact ? 10 : 28;
      for (let d = 0; d < count; d++) {
        const a = hash(d, 21) * TAU + spin;
        const fall = (hash(d, 22) + t * (0.18 + 0.1 * hash(d, 23))) % 1;
        const r = base + width * (1 - fall);
        g.globalAlpha = (0.35 + 0.6 * hash(d, 24)) * p * dim * Math.sin(fall * Math.PI);
        g.beginPath();
        g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, o.compact ? 1 : 1.6, 0, TAU);
        g.fill();
      }
    }

    if (p < 1) {
      // The moment of merging: a bright ring that washes outward and fades.
      g.globalAlpha = (1 - p) * 0.6;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, inner + (R - inner) * p * 1.1, 0, TAU);
      g.stroke();
    }
  });
  g.restore();

  // A soft seed of mixed colour in the middle: all the layers, combined.
  const seedR = inner * 0.9;
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, seedR);
  core.addColorStop(0, mixedColor(audible, 0.5));
  core.addColorStop(1, mixedColor(audible, 0));
  g.fillStyle = core;
  g.beginPath();
  g.arc(cx, cy, seedR, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

/** Level-weighted average of the layer colours, as an rgba() string. */
export function mixedColor(layers: BlendLayer[], alpha: number) {
  let r = 0, gr = 0, b = 0, sum = 0;
  for (const l of layers) {
    const hex = SOUNDS[l.sound].color;
    const wgt = 0.3 + l.level;
    r += parseInt(hex.slice(1, 3), 16) * wgt;
    gr += parseInt(hex.slice(3, 5), 16) * wgt;
    b += parseInt(hex.slice(5, 7), 16) * wgt;
    sum += wgt;
  }
  if (!sum) return `rgba(242, 238, 229, ${alpha})`;
  return `rgba(${Math.round(r / sum)}, ${Math.round(gr / sum)}, ${Math.round(b / sum)}, ${alpha})`;
}

/** One blend layer per sound. A sound used in several stretches shows at its strongest level. */
export function layersOf(mix: MixDraft): BlendLayer[] {
  const out = new Map<SoundId, BlendLayer>();
  for (const c of mix.components) {
    if (SOUNDS[c.sound].category === 'quiet') continue;
    const prev = out.get(c.sound);
    if (!prev || c.level > prev.level) out.set(c.sound, { key: c.sound, sound: c.sound, level: c.level });
  }
  return [...out.values()];
}

/** Identity seed from the Mix's discovery structure: the same Mix always draws the same emblem. */
export function seedFor(mix: MixDraft) {
  const text = canonicalize(mix);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 7.3;
}
