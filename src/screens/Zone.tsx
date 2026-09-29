import { useEffect } from 'react';
import { engine } from '../audio/engine';
import { Icon } from '../components/bits';
import { Orb, useElapsed } from '../components/PlayerCard';
import { PlayerWave } from '../components/Wave';
import { ZONE_DURATIONS } from '../core/catalog';
import { clock, mixSounds, roughDuration, soundList } from '../core/format';
import { SOUNDS } from '../core/sounds';
import { activeSoundsAt, hasSections, nextEntry, positionAt } from '../core/timeline';
import { findMix } from '../state/actions';
import { end, pause, resume, setVolume, startZone, usePlayback } from '../state/playback';
import { useApp } from '../state/store';
import { setUi, useUi } from '../state/ui';

export function DurationSheet() {
  const mixId = useUi(s => s.durationFor);
  if (!mixId) return null;
  const mix = findMix(mixId);
  if (!mix) return null;
  const close = () => setUi({ durationFor: null });
  return (
    <div className="sheet-wrap" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="how-long" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="tiny-label">{mix.name}</div>
        <h2 id="how-long" className="sheet-title">How long?</h2>
        <div className="durations">
          {ZONE_DURATIONS.map(d => (
            <button key={d.label} className={`duration ${d.minutes == null ? 'wide' : ''}`} onClick={() => startZone(mix.id, d.minutes)}>
              {d.label}
            </button>
          ))}
        </div>
        <button className="link sheet-cancel" onClick={close}>Not now</button>
      </div>
    </div>
  );
}

const KIND_LABEL = { zone: 'Zone active', play: 'Playing', short: 'Shot', preview: 'Preview' } as const;

export function Player() {
  const open = useUi(s => s.playerOpen);
  const { status, info } = usePlayback();
  const volume = useApp(s => s.settings.volume);
  const elapsed = useElapsed(open && status === 'playing');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUi({ playerOpen: false });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !info) return null;
  const { mix } = info;
  const total = info.totalSec;
  const { pos } = positionAt(mix, elapsed);
  const now = activeSoundsAt(mix, pos);
  const next = hasSections(mix) ? nextEntry(mix, pos) : null;
  const complete = status === 'complete';
  const paused = status === 'paused';
  const statusLabel = complete ? (info.kind === 'zone' ? 'Zone complete' : 'Done') : paused ? (info.kind === 'zone' ? 'Zone paused' : 'Paused') : KIND_LABEL[info.kind];

  return (
    <div className={`player ${paused ? 'is-paused' : ''} ${complete ? 'is-complete' : ''}`} role="dialog" aria-modal="true" aria-label={`${mix.name} player`}>
      <div className="player-top">
        <button className="icon-btn" onClick={() => setUi({ playerOpen: false })} aria-label="Minimise player">
          <Icon name="down" size={22} />
        </button>
        <span className="tiny-label">
          {!paused && !complete && <span className="live-dot" />}
          {statusLabel}
        </span>
        <span className="icon-btn-space" />
      </div>

      <div className="player-body">
        <Orb colors={mixSounds(mix).filter(s => s !== 'quiet').map(s => SOUNDS[s].color)} />
        <h1 className="player-name">{mix.name}</h1>
        <PlayerWave className="player-big-wave" />

        <div className="player-time">
          {complete ? (
            <span className="time">{roughDuration(total ?? elapsed)}</span>
          ) : total == null ? (
            <>
              <span className="time">{clock(elapsed)}</span>
              <span className="muted small">in Zone · until you stop</span>
            </>
          ) : (
            <>
              <span className="time">{clock(total - elapsed)}</span>
              <span className="muted small">remaining</span>
            </>
          )}
        </div>

        {!complete && (
          <dl className="player-now">
            <div>
              <dt>Now</dt>
              <dd>{now.quiet ? 'Quiet' : now.sounds.length ? soundList(now.sounds) : 'Starting'}</dd>
            </div>
            {next && (
              <div>
                <dt>Next</dt>
                <dd>{SOUNDS[next.sound].label} in {Math.max(1, Math.round(next.inSec / 60))} min</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <div className="player-controls">
        {complete ? (
          <>
            <button className="btn primary" onClick={() => { engine.dismiss(); setUi({ playerOpen: false }); }}>Done</button>
            {info.kind === 'zone' && <button className="btn outline" onClick={() => { engine.dismiss(); setUi({ playerOpen: false, durationFor: info.sourceId }); }}>Another Zone</button>}
          </>
        ) : (
          <>
            <button className="play-button big" onClick={() => (paused ? resume() : pause())} aria-label={paused ? 'Resume' : 'Pause'}>
              <Icon name={paused ? 'play' : 'pause'} size={28} />
            </button>
            <button className="btn outline end" onClick={end}>End</button>
          </>
        )}
        <label className="volume">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
      </div>
    </div>
  );
}

export function MiniPlayer() {
  const { status, info } = usePlayback();
  const open = useUi(s => s.playerOpen);
  const elapsed = useElapsed(status === 'playing' && !open);
  if (!info || status === 'idle' || open || info.kind === 'preview') return null;
  const paused = status === 'paused';
  const total = info.totalSec;
  const label = status === 'complete' ? 'Complete' : total == null ? `${clock(elapsed)} in` : `${clock(total - elapsed)} left`;
  return (
    <div className="mini">
      <button className="mini-open" onClick={() => setUi({ playerOpen: true })} aria-label={`Open ${info.mix.name}`}>
        <span className="mini-text">
          <strong>{info.mix.name}</strong>
          <span>{paused ? 'Paused · ' : info.kind === 'zone' ? 'Zone · ' : ''}{label}</span>
        </span>
      </button>
      <PlayerWave className="mini-wave" />
      {status !== 'complete' && (
        <button className="play-button small" onClick={() => (paused ? resume() : pause())} aria-label={paused ? 'Resume' : 'Pause'}>
          <Icon name={paused ? 'play' : 'pause'} size={16} />
        </button>
      )}
    </div>
  );
}
