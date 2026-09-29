import { mixSounds, ordinal, title } from '../core/format';
import { encodeMix } from '../core/share';
import { SOUNDS } from '../core/sounds';
import type { Discovery, MixDraft } from '../core/types';
import { track } from '../state/events';
import { toast } from '../state/ui';
import { drawBlend, layersOf, seedFor } from '../viz/blend';
import { BlendCanvas } from './BlendCanvas';
import { Icon } from './bits';

export const shareUrl = (mix: MixDraft) => `${location.origin}${location.pathname}#/s/${encodeMix(mix)}`;

export function discoveryLine(discovery?: Discovery | null) {
  if (!discovery) return 'Discovery pending';
  if (discovery.first) return 'First discovery';
  return `The ${ordinal(discovery.number)} person to make this`;
}

/** A 1080×1350 image of the Mix identity: the blend emblem, its name and its discovery. */
async function renderCard(mix: MixDraft, line: string): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue('--ground').trim() || '#101825';
  g.fillRect(0, 0, W, H);

  const art = document.createElement('canvas');
  art.width = 900;
  art.height = 900;
  drawBlend(art.getContext('2d')!, 900, 900, layersOf(mix), { time: 6, seed: seedFor(mix) });
  g.drawImage(art, 90, 150);

  const display = css.getPropertyValue('--serif').trim() || 'Georgia, serif';
  const mono = css.getPropertyValue('--sans').trim() || 'system-ui';
  await document.fonts?.ready;
  g.fillStyle = '#f2eee5';
  g.textAlign = 'center';
  g.font = `400 96px ${display}`;
  g.fillText(title(mix.name), W / 2, 1170, W - 120);
  g.font = `500 30px ${mono}`;
  g.fillStyle = '#cee0ab';
  g.fillText(line.toUpperCase(), W / 2, 1230, W - 120);
  g.fillStyle = '#9d978b';
  g.fillText(mixSounds(mix).map(s => SOUNDS[s].label).join(' · ').toUpperCase(), W / 2, 1280, W - 120);
  g.font = `500 26px ${mono}`;
  g.fillText('HUSHDAY', W / 2, 96);

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

export function ShareMix({ mix, discovery, curated = false }: { mix: MixDraft; discovery?: Discovery | null; curated?: boolean }) {
  const line = curated ? 'A hushday Mix' : discoveryLine(discovery);
  const url = shareUrl(mix);

  const shareLink = async () => {
    track('mix_shared', { how: 'link' });
    const text = `${mix.name}: ${line.toLowerCase()} on hushday.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: mix.name, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Could not copy the link');
    }
  };

  const saveImage = async () => {
    track('mix_shared', { how: 'image' });
    const blob = await renderCard(mix, line);
    const file = new File([blob], `${mix.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mix'}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: mix.name });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="block share">
      <header className="block-head"><h2 className="label">Share</h2></header>
      <div className="share-card">
        <BlendCanvas layers={layersOf(mix)} seed={seedFor(mix)} className="share-art" label={`${mix.name} emblem`} />
        <div className="share-meta">
          <span className="display md">{title(mix.name)}</span>
          <span className={`mono share-line ${discovery?.first ? 'first' : ''}`}>{line}</span>
        </div>
      </div>
      <p className="small muted">Every Mix draws its own emblem from its sounds and timing. Anyone with the link can play it and make their own version.</p>
      <div className="share-actions">
        <button className="btn light small-btn" onClick={shareLink}><Icon name="share" size={16} /> Share link</button>
        <button className="btn ghost small-btn" onClick={saveImage}><Icon name="download" size={16} /> Save image</button>
      </div>
    </section>
  );
}
