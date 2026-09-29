import { Glyph, Icon } from '../components/bits';
import { SoundSwatch } from '../components/SoundSwatch';
import { SOUNDS, SOUND_ORDER } from '../core/sounds';
import { engine } from '../audio/engine';
import { audition, usePlayback } from '../state/playback';

/** Every sound on its own: its mark, its texture, and a short listen. */
export function Sounds() {
  const { status, info } = usePlayback();
  const hearing = status === 'playing' && info?.kind === 'preview' && info.sourceId.startsWith('audition:') ? info.sourceId.slice(9) : null;
  return (
    <div className="sound-library">
      {SOUND_ORDER.map(s => {
        const def = SOUNDS[s];
        const on = hearing === s;
        const quiet = def.category === 'quiet';
        return (
          <article key={s} className={`sound-card ${on ? 'on' : ''}`} style={{ ['--c' as string]: def.color }}>
            <div className="sound-card-head">
              <Glyph sound={s} size="lg" />
              <button className={`sound-play ${on ? 'on' : ''}`} onClick={() => (on ? engine.stop() : audition(s))} aria-label={on ? `Stop ${def.name}` : `Hear ${def.name}`}>
                <Icon name={on ? 'stop' : 'play'} size={14} />
              </button>
            </div>
            <h3>{def.label}</h3>
            <div className="sound-type">{def.family}</div>
            <SoundSwatch sound={s} level={quiet ? 0.9 : def.defaultLevel} animate={on} feather={!quiet} taper={quiet ? QUIET_TAPER : undefined} className="sound-card-texture" />
          </article>
        );
      })}
    </div>
  );
}

const QUIET_TAPER = { in: 0.4, out: 0.4 };
