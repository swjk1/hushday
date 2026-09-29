import { useEffect, useMemo, useState } from 'react';
import { BlendCanvas } from '../components/BlendCanvas';
import { Icon, Kicker, SoundLine } from '../components/bits';
import { MixRibbon } from '../components/MixRibbon';
import { roughDuration } from '../core/format';
import { decodeMix } from '../core/share';
import { peekDiscovery } from '../state/actions';
import { track } from '../state/events';
import { DRAFT, preview, usePlayback } from '../state/playback';
import { engine } from '../audio/engine';
import { go } from '../state/ui';
import { layersOf, seedFor } from '../viz/blend';
import { handOffDraft } from './create/draft';

/** A Mix opened from a share link. Plays straight away and invites a version of your own. */
export function SharedMix({ code }: { code: string }) {
  const mix = useMemo(() => decodeMix(code), [code]);
  const [count, setCount] = useState<number | null>(null);
  const { status, info } = usePlayback();
  const playing = status === 'playing' && info?.kind === 'preview' && info.sourceId === DRAFT && info.mix.name === mix?.name;

  useEffect(() => {
    if (!mix) return;
    track('mix_viewed', { shared: true });
    void peekDiscovery(mix).then(setCount);
    return () => {
      if (engine.getSnapshot().info?.kind === 'preview') engine.stop();
    };
  }, [mix]);

  if (!mix) {
    return (
      <div className="screen">
        <p className="muted">That link doesn’t hold a Mix we can read.</p>
        <a className="link" href="#/create">Make your own</a>
      </div>
    );
  }

  const remix = () => {
    handOffDraft(mix);
    go('/create');
  };

  return (
    <div className="screen detail shared">
      <Kicker>Shared Mix · {roughDuration(mix.lengthSec)}</Kicker>
      <h1 className="display xl">{mix.name}</h1>
      <p className="lede">
        {count == null ? 'Someone shared their Mix with you.' : count <= 1 ? 'Only one person has made this Mix so far.' : `${count.toLocaleString('en-US')} people have made this Mix.`}
      </p>
      <div className="shared-art">
        <BlendCanvas layers={layersOf(mix)} seed={seedFor(mix)} label={`${mix.name} emblem`} />
      </div>
      <SoundLine mix={mix} />
      <div className="bleed detail-ribbon">
        <MixRibbon mix={mix} height={120} animate={playing} playhead={playing ? () => engine.elapsed() : undefined} />
      </div>
      <div className="actions">
        <button className="btn light" onClick={() => (playing ? engine.stop() : preview(mix, 0))}>
          <Icon name={playing ? 'stop' : 'play'} size={18} /> {playing ? 'Stop' : 'Play'}
        </button>
        <button className="btn lime" onClick={remix}><Icon name="branch" size={18} /> Make your own version</button>
      </div>
      <p className="small muted">Change anything and it becomes a Mix of your own, with its own discovery number.</p>
    </div>
  );
}
