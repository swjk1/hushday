import { useEffect, useState } from 'react';
import { Icon } from './components/bits';
import { useApp } from './state/store';
import { useUi } from './state/ui';
import { Create } from './screens/Create';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { MixDetail } from './screens/MixDetail';
import { Profile } from './screens/Profile';
import { Reveal } from './screens/Reveal';
import { SharedMix } from './screens/SharedMix';
import { Sounds } from './screens/Sounds';
import { DurationSheet, MiniPlayer, Player } from './screens/Zone';

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function Screen({ route }: { route: string[] }) {
  const [page, id] = route;
  switch (page) {
    case 'mix': return <MixDetail key={id} id={id} />;
    case 'create': return <Create key={`create-${id ?? ''}`} mode={id ? 'remix' : 'new'} sourceId={id} />;
    case 'edit': return <Create key={`edit-${id}`} mode="edit" sourceId={id} />;
    case 's': return <SharedMix key={id} code={id ?? ''} />;
    case 'sounds': return <Sounds />;
    case 'library': return <Library />;
    case 'me': return <Profile />;
    default: return <Home />;
  }
}

const NAV = [
  { href: '#/', tab: 'today', label: 'Today', icon: 'today' },
  { href: '#/create', tab: 'studio', label: 'Studio', icon: 'studio' },
  { href: '#/sounds', tab: 'sounds', label: 'Sounds', icon: 'sounds' },
  { href: '#/library', tab: 'mixes', label: 'Mixes', icon: 'mixes' },
] as const;

const TITLES: Record<string, string> = { today: 'Today', studio: 'Studio', sounds: 'Sounds', mixes: 'Mixes', me: 'Profile', mix: 'Mix', s: 'Shared mix' };

function tabOf(page: string | undefined) {
  if (page === 'create' || page === 'edit') return 'studio';
  if (page === 'sounds') return 'sounds';
  if (page === 'library') return 'mixes';
  if (page === 'me' || page === 'mix' || page === 's') return page;
  return 'today';
}

export function App() {
  const route = useRoute();
  const user = useApp(s => s.user);
  const toast = useUi(s => s.toast);
  const tab = tabOf(route[0]);
  // Today and the Studio carry their own player card; everywhere else gets the mini player.
  const hasCard = tab === 'today' || tab === 'studio';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#/" className="brand" aria-label="hushday home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>hushday<span className="brand-dot">.</span></span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map(n => (
            <a key={n.tab} href={n.href} className={`nav-item ${tab === n.tab ? 'active' : ''}`} aria-current={tab === n.tab ? 'page' : undefined}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <strong className="topbar-title">{TITLES[tab]}</strong>
          <div className="topbar-right">
            <a href="#/me" className="user-chip">{user?.username ?? 'Profile'}</a>
            <a href="#/create" className="top-add"><Icon name="plus" size={15} /><span>New mix</span></a>
          </div>
        </header>
        <div className="view">
          <Screen route={route} />
        </div>
      </main>
      {!hasCard && <MiniPlayer />}
      <DurationSheet />
      <Player />
      <Reveal />
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
