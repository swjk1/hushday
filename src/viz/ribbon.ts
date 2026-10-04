import { SOUNDS } from '../core/sounds';
import { duckAt, envelopeAt, isQuiet } from '../core/timeline';
import type { MixDraft } from '../core/types';
import { hash, wobble } from './strands';

/**
 * The Mix ribbon: one continuous band made of coloured strands, one bundle per sound.
 * Thickness follows each sound's intensity over the Mix; texture follows its character
 * (brown flows, white jitters, rain carries droplets, ocean swells, focus pulses).
 * Quiet sections pinch the whole ribbon down to a hairline.
 */
export interface RibbonOptions {
  time: number;
  /** Position inside the Mix, in seconds, to mark as "now". */
  playhead?: number | null;
  compact?: boolean;
  background: string;
}

export function drawRibbon(g: CanvasRenderingContext2D, w: number, h: number, mix: MixDraft, o: RibbonOptions) {
  g.clearRect(0, 0, w, h);
  const L = mix.lengthSec;
  const cols = Math.max(24, Math.floor(w / (o.compact ? 4 : 3)));
  const layers = mix.components.filter(c => !isQuiet(c));
  const maxBand = h * (o.compact ? 0.4 : 0.3);
  const amp = o.compact ? 0.6 : 1;

  const thickness = layers.map(() => new Float32Array(cols + 1));
  const totals = new Float32Array(cols + 1);
  let peak = 0;
  for (let i = 0; i <= cols; i++) {
    const t = (i / cols) * L;
    let total = 0;
    layers.forEach((c, j) => {
      const v = maxBand * (0.22 + 0.78 * c.level) * envelopeAt(c, t, mix) * duckAt(mix, c, t);
      thickness[j][i] = v;
      total += v;
    });
    totals[i] = total;
    peak = Math.max(peak, total);
  }
  // Soften section edges so entries read as a swell, not a wall, at any zoom level.
  const radius = Math.max(1, Math.round(cols * 0.02));
  for (let j = 0; j < layers.length; j++) {
    const src = thickness[j];
    const out = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) {
      let sum = 0;
      let n = 0;
      for (let d = -radius; d <= radius; d++) {
        const k = i + d;
        if (k >= 0 && k <= cols) { sum += src[k]; n++; }
      }
      out[i] = sum / n;
    }
    thickness[j] = out;
  }
  peak = 0;
  for (let i = 0; i <= cols; i++) {
    let total = 0;
    for (let j = 0; j < layers.length; j++) total += thickness[j][i];
    totals[i] = total;
    peak = Math.max(peak, total);
  }
  const scale = peak > h * 0.88 ? (h * 0.88) / peak : 1;
  const center = (i: number) => h / 2 + Math.sin((i / cols) * Math.PI * 2.6 + o.time * 0.15) * h * 0.035;
  const xAt = (i: number) => (i / cols) * w;

  // Hairline spine so the Mix always reads as one continuous object, even through silence.
  g.strokeStyle = 'rgba(242, 238, 229, 0.22)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= cols; i++) (i ? g.lineTo : g.moveTo).call(g, xAt(i), center(i));
  g.stroke();

  const offsets = new Float32Array(cols + 1);
  for (let i = 0; i <= cols; i++) offsets[i] = center(i) - (totals[i] * scale) / 2;

  layers.forEach((c, j) => {
    const def = SOUNDS[c.sound];
    const style = def.strand;
    const band = thickness[j];
    let bandMax = 0;
    for (let i = 0; i <= cols; i++) bandMax = Math.max(bandMax, band[i] * scale);
    const strands = Math.max(1, Math.round(bandMax / style.spacing));
    g.lineWidth = style.width * (o.compact ? 0.85 : 1);
    g.strokeStyle = def.color;
    if (style.texture === 'pulse') g.setLineDash(o.compact ? [2, 3] : [3, 4]);

    for (let k = 0; k < strands; k++) {
      g.globalAlpha = 0.55 + 0.45 * hash(k, j + 3);
      if (style.texture === 'pulse') g.lineDashOffset = -o.time * 18 - k * 2;
      g.beginPath();
      let pen = false;
      for (let i = 0; i <= cols; i++) {
        const thick = band[i] * scale;
        if (thick < 0.35) {
          pen = false;
          continue;
        }
        const fill = Math.min(1, thick / (style.spacing * 3));
        const y = offsets[i] + (thick * (k + 0.5)) / strands + wobble(style.texture, i / cols, i, k, o.time) * fill * amp;
        if (pen) g.lineTo(xAt(i), y);
        else g.moveTo(xAt(i), y);
        pen = true;
      }
      g.stroke();
    }
    g.setLineDash([]);

    if (style.texture === 'drops') {
      g.fillStyle = '#CFE0FF';
      const count = Math.floor(cols / (o.compact ? 8 : 5));
      for (let d = 0; d < count; d++) {
        const fx = (hash(d, 1) + o.time * 0.04 * (0.5 + hash(d, 2))) % 1;
        const i = Math.floor(fx * cols);
        const thick = band[i] * scale;
        if (thick < 2) continue;
        g.globalAlpha = 0.5 + 0.5 * hash(d, 4);
        g.beginPath();
        g.arc(xAt(i), offsets[i] + hash(d, 3) * thick, o.compact ? 0.9 : 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let i = 0; i <= cols; i++) offsets[i] += band[i] * scale;
  });
  g.globalAlpha = 1;

  if (o.playhead != null && L > 0) {
    const x = Math.min(w, Math.max(0, (o.playhead / L) * w));
    g.fillStyle = o.background;
    g.globalAlpha = 0.5;
    g.fillRect(x, 0, w - x, h);
    g.globalAlpha = 1;
    g.fillStyle = '#F2EEE5';
    g.fillRect(Math.round(x) - 0.75, h * 0.08, 1.5, h * 0.84);
  }
}
