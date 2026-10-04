import { SOUNDS } from '../core/sounds';
import { duckAt, envelopeAt, isQuiet } from '../core/timeline';
import type { MixDraft, SoundId } from '../core/types';
import { hash } from './strands';

/**
 * How each sound moves in the player wave. Low sounds sit a little lower and move slowly;
 * bright sounds sit higher and move fast, so a mix separates into readable layers.
 */
interface WaveStyle {
  len: number;
  threads: number;
  width: number;
  gap: number;
  lane: number;
  speed: number;
  grain?: boolean;
  zigzag?: boolean;
  drops?: boolean;
  breathe?: boolean;
  silk?: boolean;
  pulse?: boolean;
  dash?: number[];
}

const WAVE: Record<Exclude<SoundId, 'quiet'>, WaveStyle> = {
  brown: { len: 95, threads: 3, width: 2.1, gap: 0.8, lane: 0.12, speed: 0.55 },
  red: { len: 160, threads: 2, width: 3.2, gap: 0.6, lane: 0.2, speed: 0.32 },
  pink: { len: 38, threads: 3, width: 1.3, gap: 1.2, lane: 0.02, speed: 1.3 },
  white: { len: 22, threads: 3, width: 1, gap: 2, lane: -0.08, speed: 1.9, grain: true, dash: [1.2, 3.2] },
  tone432: { len: 34, threads: 2, width: 1.4, gap: 0.45, lane: -0.06, speed: 1.1 },
  tone528: { len: 28, threads: 2, width: 1.3, gap: 0.45, lane: -0.1, speed: 1.25 },
  rain: { len: 70, threads: 2, width: 1, gap: 1, lane: -0.04, speed: 0.8, drops: true },
  ocean: { len: 190, threads: 4, width: 1.5, gap: 0.35, lane: 0.07, speed: 0.4, breathe: true },
  wind: { len: 130, threads: 4, width: 0.8, gap: 1.35, lane: -0.12, speed: 0.5, silk: true },
  fan: { len: 120, threads: 2, width: 1.6, gap: 0.5, lane: 0.05, speed: 0.9 },
  stream: { len: 44, threads: 3, width: 1.1, gap: 1.1, lane: -0.03, speed: 1.6 },
  fire: { len: 18, threads: 3, width: 1.2, gap: 1.4, lane: 0.06, speed: 1.7, grain: true },
  night: { len: 24, threads: 2, width: 1, gap: 0.9, lane: -0.14, speed: 1.3, dash: [2, 6], pulse: true },
  gulls: { len: 60, threads: 2, width: 1.1, gap: 0.8, lane: -0.1, speed: 0.8, dash: [10, 7] },
  focus: { len: 28, threads: 2, width: 1.7, gap: 0.9, lane: 0, speed: 1.5, dash: [5, 4], pulse: true },
  zen: { len: 120, threads: 2, width: 1.5, gap: 0.6, lane: 0.08, speed: 0.35, breathe: true },
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => {
  const v = clamp(x, 0, 1);
  return v * v * (3 - 2 * v);
};
const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');

function blur(src: Float32Array, r: number) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    let n = 0;
    for (let d = -r; d <= r; d++) {
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

/**
 * The playing Mix across its whole length: each sound its own layer of threads, drawn in its
 * own way and colour, swelling where it plays and easing in and out at its ends. Played is
 * bright, ahead is dim, and a glowing point marks now. Height follows live loudness.
 */
export function drawWave(g: CanvasRenderingContext2D, w: number, h: number, mix: MixDraft | null, now: number, time: number, energy: number) {
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  if (!mix) {
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, mid);
    g.lineTo(w, mid);
    g.stroke();
    return;
  }
  const L = mix.lengthSec;
  const cols = Math.max(60, Math.floor(w / 1.5));
  const head = clamp(now / L, 0, 1) * w;
  const lift = 0.45 + energy * 1.4;
  const radius = Math.max(3, Math.round(cols * 0.045));

  g.save();
  g.globalCompositeOperation = 'screen';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  mix.components.filter(c => !isQuiet(c)).forEach((c, j) => {
    const st = WAVE[c.sound as Exclude<SoundId, 'quiet'>];
    const rgb = rgbOf(SOUNDS[c.sound].color);
    const phase = j * 2.1;
    const raw = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) {
      const t = (i / cols) * L;
      raw[i] = envelopeAt(c, t, mix) * duckAt(mix, c, t);
    }
    // Presence softened at the edges, so entries and exits ease in instead of hanging there.
    const e = blur(blur(raw, radius), radius);
    const paint = g.createLinearGradient(0, 0, w, 0);
    for (let s = 0; s <= 32; s++) paint.addColorStop(s / 32, `rgba(${rgb},${smooth(e[Math.round((s / 32) * cols)] * 1.6).toFixed(3)})`);

    const yAt = (i: number, k: number) => {
      const x = (i / cols) * w;
      const p = e[i];
      const near = Math.exp(-Math.pow((x - head) / (w * 0.18), 2));
      let amp = h * 0.3 * (0.4 + 0.6 * c.level) * p * (1 + near * lift);
      const u = (x / st.len) * Math.PI * 2 + time * st.speed + phase + k * st.gap;
      let v: number;
      if (st.zigzag) {
        const f = (((x / st.len + time * st.speed * 0.15 + k * 0.5) % 1) + 1) % 1;
        v = (4 * Math.abs(f - 0.5) - 1) * (0.6 + 0.4 * hash(Math.floor(x / st.len), k));
      } else if (st.silk) v = Math.sin(u) * 0.8 + Math.sin(u * 0.37 + k) * 0.35;
      else v = Math.sin(u);
      if (st.breathe) amp *= 0.45 + 0.55 * Math.sin(x / 260 - time * 0.3 + k * 0.2) ** 2;
      if (st.pulse) amp *= 0.7 + 0.3 * Math.sin(time * 5 + x / 18);
      if (st.grain) v += (hash(i, k, Math.floor(time * 12)) - 0.5) * 0.9;
      return mid + st.lane * h * p + v * amp * (0.6 + (0.2 * k) / st.threads);
    };

    g.strokeStyle = paint;
    if (st.dash) g.setLineDash(st.dash);
    for (let k = 0; k < st.threads; k++) {
      if (st.dash) g.lineDashOffset = -time * (st.pulse ? 34 : 12) - k * 3;
      g.beginPath();
      for (let i = 0; i <= cols; i++) {
        const x = (i / cols) * w;
        const y = yAt(i, k);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.globalAlpha = st.silk ? 0.08 : 0.12;
      g.lineWidth = st.width * 3.2;
      g.stroke();
      g.globalAlpha = (st.silk ? 0.7 : 0.95) - (k / st.threads) * 0.35;
      g.lineWidth = st.width;
      g.stroke();
    }
    g.setLineDash([]);

    if (st.drops) {
      // Rain falls through its layer: small drops drifting down and fading.
      g.fillStyle = paint;
      for (let d = 0; d < Math.floor(w / 9); d++) {
        const i = Math.floor(hash(d, 1) * cols);
        const fall = (hash(d, 2) + time * (0.35 + 0.3 * hash(d, 3))) % 1;
        if (e[i] < 0.05) continue;
        const y = yAt(i, 0) - h * 0.22 * e[i] + fall * h * 0.44 * e[i];
        g.globalAlpha = Math.sin(fall * Math.PI) * 0.9;
        g.beginPath();
        g.arc((i / cols) * w, y, 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  });

  // Played stays bright; what's ahead dims, fading across now with no seam.
  const fade = g.createLinearGradient(0, 0, w, 0);
  const feather = Math.max(8, w * 0.03);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(clamp((head - feather) / w, 0, 1), 'rgba(0,0,0,1)');
  fade.addColorStop(clamp((head + feather) / w, 0, 1), 'rgba(0,0,0,0.42)');
  fade.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  g.restore();

  const glow = g.createRadialGradient(head, mid, 0, head, mid, h * 0.6);
  glow.addColorStop(0, `rgba(241,244,233,${0.35 + energy * 0.4})`);
  glow.addColorStop(1, 'rgba(241,244,233,0)');
  g.fillStyle = glow;
  g.fillRect(head - h, 0, h * 2, h);
  g.fillStyle = '#f1f4e9';
  g.beginPath();
  g.arc(head, mid, 2.6, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}
