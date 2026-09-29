import { useEffect, useState } from 'react';
import { roughDuration } from '../core/format';
import { ApiError } from '../state/api';
import { loadProfile, renameUser, type Profile as ProfileData } from '../state/actions';
import { setState, useApp } from '../state/store';
import { toast } from '../state/ui';

export function Profile() {
  const user = useApp(s => s.user);
  const settings = useApp(s => s.settings);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [offline, setOffline] = useState(false);
  const [name, setName] = useState(user?.username ?? '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadProfile().then(setProfile).catch(() => setOffline(true));
  }, []);
  useEffect(() => setName(user?.username ?? ''), [user?.username]);

  const saveName = async () => {
    try {
      await renameUser(name);
      setEditing(false);
      toast('Name updated');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not update name');
    }
  };

  const stats = profile?.stats;
  return (
    <div className="screen profile">
      <span className="kicker">Profile</span>
      {editing ? (
        <form className="rename" onSubmit={e => { e.preventDefault(); void saveName(); }}>
          <input className="name-input display lg" value={name} onChange={e => setName(e.target.value.toLowerCase())} maxLength={24} aria-label="Username" autoFocus />
          <button className="btn lime" type="submit">Save</button>
          <button className="btn ghost" type="button" onClick={() => { setEditing(false); setName(user?.username ?? ''); }}>Cancel</button>
        </form>
      ) : (
        <div className="profile-name">
          <h1 className="display xl">{user?.username ?? 'Offline'}</h1>
          {user && <button className="link" onClick={() => setEditing(true)}>Change</button>}
        </div>
      )}
      {offline && <p className="muted small">Can't reach your account right now. Your Mixes are safe on this device.</p>}

      {stats && (
        <div className="stats">
          <div><span className="stat mono">{stats.firstDiscoveries}</span><span className="label">First discoveries</span></div>
          <div><span className="stat mono">{stats.discoveries}</span><span className="label">Discoveries</span></div>
          <div><span className="stat mono">{stats.zonesCompleted}</span><span className="label">Zones completed</span></div>
          <div><span className="stat mono">{roughDuration(stats.zoneSeconds)}</span><span className="label">In Zones</span></div>
        </div>
      )}

      {profile && (
        <section className="block">
          <header className="block-head"><h2 className="label">Discovery history</h2></header>
          {profile.discoveries.length ? (
            <ol className="history">
              {profile.discoveries.map(d => (
                <li key={`${d.mixId}-${d.number}`}>
                  <span className={`history-num mono ${d.first ? 'first' : ''}`}>{d.first ? 'FIRST' : `#${d.number.toLocaleString('en-US')}`}</span>
                  {d.mixDeleted ? <span className="muted">{d.mixName}</span> : <a href={`#/mix/${d.mixId}`}>{d.mixName}</a>}
                  <span className="mono muted">{new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">Make a Mix to get your first discovery number.</p>
          )}
        </section>
      )}

      <section className="block">
        <header className="block-head"><h2 className="label">Settings</h2></header>
        <label className="setting">
          <span>Haptics</span>
          <input type="checkbox" checked={settings.haptics} onChange={e => setState(s => ({ settings: { ...s.settings, haptics: e.target.checked } }))} />
        </label>
        <p className="muted small">Your account lives on this device for now. Clearing browser data starts a new one.</p>
      </section>
    </div>
  );
}
