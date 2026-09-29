import type { MouseEvent } from 'react';
import { DiscoveryBadge, Icon } from '../components/bits';
import { Knot } from '../components/Knot';
import { PlayerCard, useElapsed } from '../components/PlayerCard';
import { PlayerWave } from '../components/Wave';
import { CURATED_MIXES, SHORT_EXPERIENCES, SHORT_FORMAT_NAME } from '../core/catalog';
import { clock, mixSounds, roughDuration, title } from '../core/format';
import { SOUNDS } from '../core/sounds';
import type { Mix } from '../core/types';
import { end, pause, playMix, playShort, resume, usePlayback } from '../state/playback';
import { useApp } from '../state/store';

/** Play, or pause/resume when this is what's already playing. */
function useToggle(id: string, start: () => void) {
  const { status, info } = usePlayback();
  const mine = info?.sourceId === id && (status === 'playing' || status === 'paused');
  const playing = mine && status === 'playing';
  const toggle = (e?: MouseEvent) => {
    e?.stopPropagation();
    if (playing) pause();
    else if (mine) resume();
    else start();
  };
  return { playing, mine, toggle };
}

export function Home() {
  const created = useApp(s => s.mixes);
  return (
    <div className="two-col">
      <div>
        <NowBanner />
        <div className="section-head"><span className="tiny-label">Curated</span></div>
        <div className="quick-grid">
          {CURATED_MIXES.map(m => <MixCard key={m.id} mix={m} />)}
          {SHORT_EXPERIENCES.map(s => <ShotCard key={s.id} id={s.id} name={s.name} minutes={Math.round(s.durationSec / 60)} mix={s.mix as Mix} />)}
        </div>
        <div className="section-head">
          <span className="tiny-label">Saved</span>
          <a className="text-link" href="#/library">All mixes <Icon name="arrow" size={14} /></a>
        </div>
        <div className="list-card">
          {created.length ? created.slice(0, 4).map(m => <MixRow key={m.id} mix={m} />) : (
            <div className="empty-state"><a className="text-link" href="#/create">Make a mix <Icon name="arrow" size={14} /></a></div>
          )}
        </div>
      </div>
      <aside className="aside">
        <div className="aside-heading"><span className="live-dot" /> Player</div>
        <PlayerCard />
      </aside>
    </div>
  );
}

function NowBanner() {
  const { status, info } = usePlayback();
  const elapsed = useElapsed(status === 'playing');
  if (!info || status === 'idle' || info.kind === 'preview') {
    return (
      <div className="zone-banner">
        <span className="zone-empty-mark"><Icon name="today" size={20} /></span>
        <strong>Nothing playing</strong>
      </div>
    );
  }
  const total = info.totalSec;
  const left = status === 'complete' ? 'Done' : total == null ? `${clock(elapsed)} in` : `${clock(Math.max(0, total - elapsed))} left`;
  return (
    <div className="zone-banner active">
      <div className="zone-status-top">
        <span className="zone-on-dot" /> {status === 'paused' ? 'Paused' : info.kind === 'zone' ? 'Zone on' : 'Now playing'}
        <span className="zone-remaining">{left}</span>
      </div>
      <h3>{info.mix.name}</h3>
      <p>{mixSounds(info.mix).map(s => SOUNDS[s].label).join(' · ')}</p>
      <PlayerWave className="banner-wave" />
      <div className="zone-footer">
        {status !== 'complete' && <button className="text-btn" onClick={() => (status === 'playing' ? pause() : resume())}>{status === 'playing' ? 'Pause' : 'Resume'}</button>}
        <button className="text-btn" onClick={end}>Stop</button>
      </div>
    </div>
  );
}

function MixCard({ mix }: { mix: Mix }) {
  const { playing, toggle } = useToggle(mix.id, () => playMix(mix.id));
  const lead = SOUNDS[mix.components[0].sound];
  return (
    <div className="quick-card" style={{ ['--glow' as string]: lead.color }}>
      <a className="card-link" href={`#/mix/${mix.id}`} aria-label={title(mix.name)} />
      <Knot mix={mix} animate={playing} />
      <button className={`card-play ${playing ? 'on' : ''}`} onClick={toggle} aria-label={playing ? `Pause ${mix.name}` : `Play ${mix.name}`}>
        <Icon name={playing ? 'pause' : 'play'} size={14} />
      </button>
      <strong>{title(mix.name)}</strong>
      <small>{roughDuration(mix.lengthSec)}</small>
    </div>
  );
}

function ShotCard({ id, name, minutes, mix }: { id: string; name: string; minutes: number; mix: Mix }) {
  const { playing, toggle } = useToggle(id, () => playShort(id));
  return (
    <button className="quick-card" onClick={toggle} style={{ ['--glow' as string]: SOUNDS.focus.color }} aria-label={`${playing ? 'Pause' : 'Play'} ${name}`}>
      <Knot mix={mix} animate={playing} />
      <span className={`card-play ${playing ? 'on' : ''}`} aria-hidden="true"><Icon name={playing ? 'pause' : 'play'} size={14} /></span>
      <strong>{name}</strong>
      <small>{SHORT_FORMAT_NAME.singular} · {minutes} min</small>
    </button>
  );
}

export function MixRow({ mix }: { mix: Mix }) {
  const { playing, toggle } = useToggle(mix.id, () => playMix(mix.id));
  return (
    <div className="mix-row">
      <a className="card-link" href={`#/mix/${mix.id}`} aria-label={title(mix.name)} />
      <Knot mix={mix} animate={playing} className="knot-sm" />
      <span className="mix-row-info">
        <strong>{title(mix.name)}</strong>
        <small>{roughDuration(mix.lengthSec)}</small>
      </span>
      <DiscoveryBadge discovery={mix.discovery} pending={mix.sync === 'pending'} />
      <button className={`round-action ${playing ? 'on' : ''}`} onClick={toggle} aria-label={playing ? `Pause ${mix.name}` : `Play ${mix.name}`}>
        <Icon name={playing ? 'pause' : 'play'} size={13} />
      </button>
    </div>
  );
}
