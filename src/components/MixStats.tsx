import { Icon } from './bits';

/**
 * Popularity for a Mix. Only discoverers exist today; likes, downloads, rank and featuring
 * are laid out so they can be wired to the API later without changing the screen.
 */
export interface PopularityStats {
  discoverers?: number;
  likes?: number;
  downloads?: number;
  rank?: number | null;
  featured?: boolean;
}

function Stat({ label, value, soon }: { label: string; value?: number | null; soon?: boolean }) {
  return (
    <div className={`pop-stat ${soon ? 'soon' : ''}`}>
      <span className="mono pop-stat-label">{label}</span>
      <span className="display md pop-stat-value">{value == null ? '—' : value.toLocaleString('en-US')}</span>
      {soon && <span className="mono pop-stat-soon">Soon</span>}
    </div>
  );
}

export function MixStats({ stats }: { stats: PopularityStats }) {
  return (
    <section className="block popularity">
      <header className="block-head">
        <h2 className="label">Popularity</h2>
        {stats.featured && <span className="badge badge-first"><Icon name="spark" size={12} /> Featured</span>}
      </header>
      <div className="popularity-stats">
        <Stat label="Discoverers" value={stats.discoverers ?? null} />
        <Stat label="Likes" value={stats.likes} soon={stats.likes === undefined} />
        <Stat label="Downloads" value={stats.downloads} soon={stats.downloads === undefined} />
        <Stat label="Rank" value={stats.rank} soon={stats.rank === undefined} />
      </div>
    </section>
  );
}
