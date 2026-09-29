import { useEffect, useState } from 'react';
import { canonicalize } from '../../core/fingerprint';
import { ordinal } from '../../core/format';
import type { MixDraft } from '../../core/types';
import { peekDiscovery } from '../../state/actions';

type Peek = { state: 'idle' | 'loading' | 'offline' } | { state: 'known'; count: number };

/** Live discovery status for the Mix being made: how many people got here first. */
function usePeek(draft: MixDraft, enabled: boolean): Peek {
  const [peek, setPeek] = useState<Peek>({ state: 'idle' });
  const key = enabled ? canonicalize(draft) : '';
  useEffect(() => {
    if (!key) return setPeek({ state: 'idle' });
    let live = true;
    setPeek(p => (p.state === 'known' ? p : { state: 'loading' }));
    const handle = setTimeout(async () => {
      const count = await peekDiscovery(draft);
      if (live) setPeek(count == null ? { state: 'offline' } : { state: 'known', count });
    }, 500);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [key]);
  return peek;
}

export function MixIdentity({ draft, audible, onSave, saving, label }: { draft: MixDraft; audible: boolean; onSave: () => void; saving: boolean; label: string }) {
  const peek = usePeek(draft, audible);
  let big = '—';
  let note = '';
  if (audible && peek.state === 'known' && peek.count === 0) {
    big = 'First';
    note = 'Nobody has made this yet.';
  } else if (audible && peek.state === 'known') {
    big = ordinal(peek.count + 1);
    note = 'to make this mix';
  } else if (audible && peek.state === 'offline') {
    note = 'Your number arrives when you save.';
  } else if (audible) {
    big = '…';
  }
  return (
    <section className={`identity ${big === 'First' ? 'is-first' : ''}`} aria-live="polite">
      <span className="tiny-label">Discovery</span>
      <strong className="big">{big}</strong>
      {note && <p>{note}</p>}
      <button className="btn primary wide" onClick={onSave} disabled={saving || !audible}>
        {saving ? 'Checking…' : label}
      </button>
    </section>
  );
}
