import { Glyph, Icon } from '../components/bits';
import { SoundSwatch } from '../components/SoundSwatch';
import { SOUNDS, SOUND_ORDER, variantMark } from '../core/sounds';
import type { SoundId, VariantId } from '../core/types';
import { engine } from '../audio/engine';
import { audition, usePlayback } from '../state/playback';

/** Every sound on its own: its mark, its texture, and a short listen, in every version it offers. */
export function Sounds() {
  const { status, info } = usePlayback();
  // An audition's source is "audition:<sound>" or "audition:<sound>:<variant>".
  const [, hearingSound, hearingVariant] = status === 'playing' && info?.kind === 'preview' && info.sourceId.startsWith('audition:') ? info.sourceId.split(':') : [];
  const isOn = (s: SoundId, v?: VariantId) => hearingSound === s && (hearingVariant ?? '') === (v ?? '');
  return (
    <div className="sound-library">
      {SOUND_ORDER.map(s => {
        const def = SOUNDS[s];
        const original = isOn(s);
        const any = hearingSound === s;
        const quiet = def.category === 'quiet';
        return (
          <article key={s} className={`sound-card ${any ? 'on' : ''}`} style={{ ['--c' as string]: def.color }}>
            <div className="sound-card-head">
              <Glyph sound={s} size="lg" />
              <button
                className={`sound-play ${original ? 'on' : ''}`}
                onClick={() => (original ? engine.stop() : audition(s))}
                aria-label={original ? `Stop ${def.name}` : `Hear ${def.name}${def.variants ? ', original' : ''}`}
              >
                <Icon name={original ? 'stop' : 'play'} size={14} />
              </button>
            </div>
            <h3>{def.label}</h3>
            <div className="sound-type">{def.family}</div>
            <SoundSwatch sound={s} level={quiet ? 0.9 : def.defaultLevel} animate={any} feather={!quiet} taper={quiet ? QUIET_TAPER : undefined} className="sound-card-texture" />
            {def.variants && (
              <ul className="sound-versions" aria-label={`Other versions of ${def.name}`}>
                {def.variants.map(v => {
                  const on = isOn(s, v.id);
                  return (
                    <li key={v.id} className={on ? 'on' : ''}>
                      <button
                        className={`sound-play small ${on ? 'on' : ''}`}
                        onClick={() => (on ? engine.stop() : audition(s, v.id))}
                        aria-label={on ? `Stop ${def.name}, ${v.label}` : `Hear ${def.name}, ${v.label}`}
                      >
                        <Icon name={on ? 'stop' : 'play'} size={11} />
                      </button>
                      <span className="sound-version-text">
                        <span className="sound-version-name"><b>{variantMark(s, v.id)}</b> {v.label}</span>
                        <span className="sound-version-note">{v.note}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}

const QUIET_TAPER = { in: 0.4, out: 0.4 };
