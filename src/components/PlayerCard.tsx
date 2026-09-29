import { useEffect, useState } from 'react';
import { engine } from '../audio/engine';
import { FEATURED_MIX_ID } from '../core/catalog';
import { clock, mixSounds } from '../core/format';
import { SOUNDS } from '../core/sounds';
import { positionAt } from '../core/timeline';
import { end, pause, playMix, resume, usePlayback } from '../state/playback';
import { setUi } from '../state/ui';
import { Icon } from './bits';
import { PlayerWave } from './Wave';

/** Re-renders a few times a second with the current elapsed time. */
export function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(() => engine.elapsed());
  useEffect(() => {
    setElapsed(engine.elapsed());
    if (!active) return;
    const id = setInterval(() => setElapsed(engine.elapsed()), 250);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

const STATUS = { zone: 'Zone', play: 'Playing', short: 'Shot', preview: 'Preview' } as const;

/** The breathing orb, tinted by the first two sounds of whatever is playing. */
export function Orb({ colors }: { colors: string[] }) {
  return (
    <div className="sound-orb" style={{ ['--orb-a' as string]: colors[0] ?? '#c4d1ae', ['--orb-b' as string]: colors[1] ?? colors[0] ?? '#869f9d' }} aria-hidden="true">
      <div className="orb-ring" />
      <div className="orb-ring" />
      <div className="orb-core" />
    </div>
  );
}

export function PlayerCard() {
  const { status, info } = usePlayback();
  const active = !!info && status !== 'idle';
  const playing = status === 'playing';
  const elapsed = useElapsed(playing);
  const mix = active ? info.mix : null;
  const colors = mix ? mixSounds(mix).filter(s => s !== 'quiet').map(s => SOUNDS[s].color) : [];
  const total = info?.totalSec ?? null;
  const pos = mix ? positionAt(mix, elapsed).pos : 0;

  return (
    <div className={`player-card ${playing ? 'is-playing' : ''}`}>
      <div className="player-card-top">
        <span className="tiny-label">{!active ? 'Idle' : status === 'paused' ? 'Paused' : status === 'complete' ? 'Done' : STATUS[info.kind]}</span>
        {active && <button className="icon-btn" onClick={() => setUi({ playerOpen: true })} aria-label="Open player"><Icon name="up" size={16} /></button>}
      </div>
      <Orb colors={colors} />
      <h3 className="player-title">{mix ? mix.name || 'Untitled' : 'Quiet'}</h3>
      <div className="player-subtitle">{mix ? mixSounds(mix).map(s => SOUNDS[s].label).join(' · ') : ''}</div>
      <PlayerWave className="player-wave" />
      <div className="progress-labels">
        <span>{mix ? clock(Math.min(pos, mix.lengthSec)) : '0:00'}</span>
        <span>{!mix ? '0:00' : info?.kind === 'zone' && total == null ? 'Until stopped' : clock(total != null && info?.kind === 'zone' ? Math.max(0, total - elapsed) : mix.lengthSec)}</span>
      </div>
      <div className="player-controls">
        {active && status !== 'complete' && <button className="text-btn" onClick={end}>Stop</button>}
        <button
          className="play-button"
          onClick={() => (!active || status === 'complete' ? playMix(FEATURED_MIX_ID) : playing ? pause() : resume())}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        {active && info.kind === 'play' && status !== 'complete' && (
          <button className="text-btn" onClick={() => setUi({ durationFor: info.sourceId })}>Zone</button>
        )}
      </div>
    </div>
  );
}
