import { Icon } from '../components/bits';
import { roughDuration } from '../core/format';
import type { Mix } from '../core/types';
import { pause, playMix, resume, usePlayback } from '../state/playback';
import { setUi } from '../state/ui';

/** Play / Pause for a Mix. Tapping while it's the active session toggles it. */
export function PlayControl({ mix }: { mix: Mix }) {
  const { status, info } = usePlayback();
  const mine = info?.sourceId === mix.id;
  const playing = mine && status === 'playing';
  const paused = mine && status === 'paused';
  return (
    <button
      className="btn light"
      onClick={() => (playing ? pause() : paused ? resume() : playMix(mix.id))}
    >
      <Icon name={playing ? 'pause' : 'play'} size={18} />
      {playing ? 'Pause' : paused ? 'Resume' : 'Play'}
      {!mine && <span className="btn-note">{roughDuration(mix.lengthSec)}</span>}
    </button>
  );
}

export function ZoneButton({ mixId, primary }: { mixId: string; primary?: boolean }) {
  const { status, info } = usePlayback();
  const inZone = info?.kind === 'zone' && info.sourceId === mixId && (status === 'playing' || status === 'paused');
  return (
    <button
      className={`btn ${primary ? 'lime' : 'ghost'}`}
      onClick={() => setUi(inZone ? { playerOpen: true } : { durationFor: mixId })}
    >
      {inZone ? 'Zone active' : 'Start Zone'}
    </button>
  );
}
