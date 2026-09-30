import { SOUNDS, type StrandTexture } from '../core/sounds';
import type { SoundId } from '../core/types';

/** Cheap deterministic noise so strands keep their character from frame to frame. */
export const hash = (a: number, b: number, c = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Vertical displacement of one strand, in px, for a sound's texture. Shared with the ribbon. */
export function wobble(texture: StrandTexture, u: number, i: number, k: number, time: number) {
  switch (texture) {
    case 'smooth': return Math.sin(u * 9 + time * 0.6 + k * 0.9) * 1.1;
    case 'heavy': return Math.sin(u * 4 + time * 0.3 + k * 0.35) * 1.8;
    // Alternating sharp peaks: a zigzag that re-rolls its heights many times a second.
    case 'spike': return ((i + k) % 2 ? 1 : -1) * (0.5 + hash(i, k, Math.floor(time * 20))) * 2.1;
    case 'silk': return Math.sin(u * 3 + time * 0.35 + k * 0.22) * 4 + Math.sin(u * 7 - time * 0.2 + k * 0.6) * 1.2;
    case 'ripple': return Math.sin(u * 26 + time * 1.4 + k * 1.7) * 0.9;
    case 'grain': return (hash(i, k, Math.floor(time * 14)) - 0.5) * 1.8;
    case 'drops': return Math.sin(u * 14 + time * 0.8 + k) * 0.6;
    case 'swell': return Math.sin(u * 5 - time * 0.5 + k * 0.12) * 3.2;
    case 'pulse': return Math.sin(u * 18 + time + k * 0.5) * 0.8;
    case 'tone': return Math.sin(u * 22 + time * 1.2 + k * 0.5) * 1.3;
    default: return 0;
  }
}

export interface SwatchOptions {
  time: number;
  /** 0–1 intensity. More strands and a wider band as it rises. */
  level: number;
  /** Fade the left and right ends, for free-standing swatches. */
  feather?: boolean;
  /**
   * Share of the width taken by the fade in and fade out (0–1 each). The band swells up from
   * a point and narrows back down, following the same curve the audio does.
   */
  taper?: { in: number; out: number };
}

const smooth = (x: number) => {
  const v = Math.max(0, Math.min(1, x));
  return v * v * (3 - 2 * v);
};

/**
 * One sound on its own: a band of strands in the ribbon's language, filling a small box.
 * Used for the sound palette and the lane bars in the editor.
 */
export function drawSwatch(g: CanvasRenderingContext2D, w: number, h: number, sound: SoundId, o: SwatchOptions) {
  g.clearRect(0, 0, w, h);
  if (w < 2 || h < 2) return;
  const def = SOUNDS[sound];
  const { texture, spacing, width } = def.strand;
  const cols = Math.max(12, Math.floor(w / 3));
  const xAt = (i: number) => (i / cols) * w;
  const mid = h / 2;
  const tin = o.taper?.in ?? 0;
  const tout = o.taper?.out ?? 0;
  const env = (u: number) => (tin > 0 ? smooth(u / tin) : 1) * (tout > 0 ? smooth((1 - u) / tout) : 1);

  if (def.category === 'quiet') {
    // Strands that pinch to a hairline in the middle: everything drops away, then returns.
    const n = 5;
    g.strokeStyle = '#9d978b';
    g.lineWidth = 1;
    for (let k = 0; k < n; k++) {
      g.globalAlpha = 0.35 + 0.4 * hash(k, 9);
      g.beginPath();
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const pinch = 1 - o.level * env(u);
        const spread = h * 0.62 * pinch;
        const y = mid + (k / (n - 1) - 0.5) * spread + Math.sin(u * 7 + o.time * 0.4 + k) * 0.6 * pinch;
        (i ? g.lineTo : g.moveTo).call(g, xAt(i), y);
      }
      g.stroke();
    }
  } else {
    const band = h * (0.34 + 0.56 * o.level);
    const strands = Math.max(3, Math.round(band / spacing));
    const amp = Math.min(1, h / 40);
    g.lineWidth = width;
    g.strokeStyle = def.color;
    if (texture === 'pulse') g.setLineDash([3, 4]);
    for (let k = 0; k < strands; k++) {
      g.globalAlpha = 0.5 + 0.5 * hash(k, 3);
      if (texture === 'pulse') g.lineDashOffset = -o.time * 18 - k * 2;
      g.beginPath();
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        // Ocean breathes: the band itself swells and narrows along its length.
        const breathe = texture === 'swell' ? 0.72 + 0.28 * Math.sin(u * 4.2 - o.time * 0.5) : 1;
        const thick = band * breathe * env(u);
        const y = mid - thick / 2 + (thick * (k + 0.5)) / strands + wobble(texture, u, i, k, o.time) * amp;
        (i ? g.lineTo : g.moveTo).call(g, xAt(i), y);
      }
      g.stroke();
    }
    g.setLineDash([]);

    if (texture === 'drops') {
      g.fillStyle = '#CFE0FF';
      const count = Math.max(4, Math.floor(w / 9));
      for (let d = 0; d < count; d++) {
        const u = (hash(d, 1) + o.time * 0.05 * (0.5 + hash(d, 2))) % 1;
        const thick = band * env(u);
        if (thick < 3) continue;
        g.globalAlpha = 0.45 + 0.55 * hash(d, 4);
        g.beginPath();
        g.arc(u * w, mid - thick / 2 + hash(d, 3) * thick, 1.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.globalAlpha = 1;

  if (o.feather) {
    const edge = Math.min(28, w * 0.18);
    const fade = g.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(edge / w, 'rgba(0,0,0,1)');
    fade.addColorStop(1 - edge / w, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = fade;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
}
