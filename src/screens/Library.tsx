import { useState } from 'react';
import { CURATED_MIXES } from '../core/catalog';
import type { Mix } from '../core/types';
import { useApp } from '../state/store';
import { MixRow } from './Home';

export function Library() {
  const created = useApp(s => s.mixes);
  const savedIds = useApp(s => s.saved);
  const [tab, setTab] = useState<'created' | 'saved'>(created.length || !savedIds.length ? 'created' : 'saved');
  const saved = savedIds
    .map(id => CURATED_MIXES.find(m => m.id === id) ?? created.find(m => m.id === id))
    .filter((m): m is Mix => !!m);
  const list = tab === 'created' ? created : saved;

  return (
    <div className="library">
      <div className="pills" role="tablist" aria-label="Mixes">
        <button role="tab" aria-selected={tab === 'created'} className={`pill ${tab === 'created' ? 'selected' : ''}`} onClick={() => setTab('created')}>
          Made <span className="pill-count">{created.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'saved'} className={`pill ${tab === 'saved' ? 'selected' : ''}`} onClick={() => setTab('saved')}>
          Saved <span className="pill-count">{saved.length}</span>
        </button>
      </div>
      <div className="list-card">
        {list.length ? list.map(m => <MixRow key={m.id} mix={m} />) : (
          <div className="empty-state">
            {tab === 'created' ? <a className="text-link" href="#/create">Make a mix</a> : 'Nothing saved yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
