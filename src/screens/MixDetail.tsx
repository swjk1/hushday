import { useEffect, useState } from 'react';
import { DiscoveryBadge, Glyph, Icon, Kicker } from '../components/bits';
import { Knot } from '../components/Knot';
import { MixStats } from '../components/MixStats';
import { ShareMix } from '../components/ShareMix';
import { ordinal, roughDuration, spanLabel, title } from '../core/format';
import { SOUNDS } from '../core/sounds';
import { deleteMix, findMix, toggleSave } from '../state/actions';
import { usePlayback } from '../state/playback';
import { track } from '../state/events';
import { useApp } from '../state/store';
import { go, toast } from '../state/ui';
import { PlayControl, ZoneButton } from './controls';

const intensity = (level: number) => (level < 0.34 ? 'Low' : level < 0.67 ? 'Medium' : 'High');

export function MixDetail({ id }: { id: string }) {
  useApp(s => s.mixes); // re-render when the Mix syncs or changes
  const saved = useApp(s => s.saved);
  const mix = findMix(id);
  const [showDetails, setShowDetails] = useState(false);
  const { status, info } = usePlayback();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (mix) track('mix_viewed', { mixId: id, curated: mix.curated });
  }, [id]);

  if (!mix) {
    return (
      <div className="screen">
        <p className="muted">That Mix isn't here anymore.</p>
        <a className="link" href="#/">Back to Listen</a>
      </div>
    );
  }

  const own = !mix.curated;
  const isSaved = saved.includes(mix.id);
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await deleteMix(mix.id);
      go('/library');
    } catch {
      toast('Could not delete right now');
    }
  };

  return (
    <div className="screen detail">
      <button className="back" onClick={() => history.length > 1 ? history.back() : go('/')}>
        <Icon name="back" size={18} /> Back
      </button>
      <Kicker>{mix.curated ? 'hushday Mix' : 'Your Mix'} · {roughDuration(mix.lengthSec)}</Kicker>
      <h1 className="page-title">{title(mix.name)}</h1>
      {(mix.discovery || mix.sync === 'pending') && (
        <div className="detail-discovery">
          <DiscoveryBadge discovery={mix.discovery} pending={mix.sync === 'pending'} />
          {mix.discovery && !mix.discovery.first && (
            <span className="muted small">You were the {ordinal(mix.discovery.number)} person to find this.</span>
          )}
          {mix.discovery?.first && (
            <span className="muted small">
              Nobody had made this before you{mix.discovery.totalDiscoverers > 1 ? `. ${mix.discovery.totalDiscoverers - 1} have found it since.` : '.'}
            </span>
          )}
        </div>
      )}

      <div className="detail-ribbon">
        <Knot mix={mix} animate={info?.sourceId === mix.id && status === 'playing'} className="knot-lg" />
        <div className="ruler">
          <span>0</span>
          <span>{Math.round(mix.lengthSec / 120)} min</span>
          <span>{Math.round(mix.lengthSec / 60)} min{mix.repeat === 'loop' ? ' ↻' : ' →'}</span>
        </div>
      </div>

      <div className="actions">
        <PlayControl mix={mix} />
        <ZoneButton mixId={mix.id} primary />
      </div>

      <section className="block">
        <header className="block-head"><h2 className="label">In this Mix</h2></header>
        <ul className="parts">
          {mix.components.map(c => (
            <li key={c.id}>
              <Glyph sound={c.sound} size="sm" />
              <span className="part-name">{SOUNDS[c.sound].name}</span>
              <span className="mono muted">{spanLabel(c.start, c.end, mix.lengthSec)}</span>
              <span className="mono muted">{SOUNDS[c.sound].category === 'quiet' ? '' : intensity(c.level)}{c.entry === 'slow' ? ' · slow in' : ''}</span>
            </li>
          ))}
        </ul>
        <button className="link" onClick={() => setShowDetails(!showDetails)}>{showDetails ? 'Hide sound details' : 'About these sounds'}</button>
        {showDetails && (
          <dl className="sound-details">
            {[...new Set(mix.components.map(c => c.sound))].map(s => (
              <div key={s}>
                <dt>{SOUNDS[s].name}</dt>
                <dd>{SOUNDS[s].detail}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <ShareMix mix={mix} discovery={mix.discovery} curated={mix.curated} />
      {!mix.curated && <MixStats stats={{ discoverers: mix.discovery?.totalDiscoverers }} />}

      <div className="tool-row">
        <button className="tool" onClick={() => toggleSave(mix.id)}>
          <Icon name={isSaved ? 'bookmarked' : 'bookmark'} size={18} /> {isSaved ? 'Saved' : 'Save'}
        </button>
        {own && <a className="tool" href={`#/edit/${mix.id}`}><Icon name="plus" size={18} /> Edit</a>}
        <a className="tool" href={`#/create/${mix.id}`}><Icon name="branch" size={18} /> Make a version</a>
        {own && (
          <button className={`tool danger ${confirmDelete ? 'armed' : ''}`} onClick={remove} onBlur={() => setConfirmDelete(false)}>
            <Icon name="trash" size={18} /> {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}
