import { useEffect, useState } from 'react';
import { Orb } from '../components/PlayerCard';
import { SOUNDS } from '../core/sounds';
import { mixSounds, ordinal, title } from '../core/format';
import { findMix } from '../state/actions';
import { setUi, useUi, haptic } from '../state/ui';

/** Counts up to the discovery number so the reveal lands with a little weight. */
function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(active ? 1 : target);
  useEffect(() => {
    if (!active || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const startAt = performance.now();
    const duration = Math.min(1400, 500 + Math.log10(target + 1) * 350);
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - startAt) / duration);
      setValue(Math.max(1, Math.round(target * (1 - Math.pow(1 - p, 3)))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);
  return value;
}

export function Reveal() {
  const reveal = useUi(s => s.reveal);
  const discovery = reveal?.discovery ?? null;
  const count = useCountUp(discovery?.number ?? 1, !!discovery && !discovery.first);

  useEffect(() => {
    if (reveal) haptic(discovery?.first ? [14, 70, 14, 70, 28] : [10, 50, 16]);
  }, [reveal]);

  if (!reveal) return null;
  const mix = findMix(reveal.mixId);
  const close = () => setUi({ reveal: null });
  const first = discovery?.first ?? false;

  return (
    <div className={`reveal ${first ? 'is-first' : ''}`} role="dialog" aria-modal="true" aria-labelledby="reveal-title">
      <div className="reveal-card">
        {mix && <Orb colors={mixSounds(mix).filter(s => s !== 'quiet').map(s => SOUNDS[s].color)} />}
        <span className="tiny-label">{title(reveal.mixName)}</span>
        {reveal.pending ? (
          <>
            <h1 id="reveal-title" className="reveal-title">Saved</h1>
            <p>Your number arrives next time you're online.</p>
          </>
        ) : first ? (
          <>
            <h1 id="reveal-title" className="reveal-title">First <em>discovery.</em></h1>
            <p>Nobody has made this before.</p>
          </>
        ) : discovery ? (
          <>
            <h1 id="reveal-title" className="reveal-title">Discovery <em>#{count.toLocaleString('en-US')}</em></h1>
            <p>
              {discovery.alreadyDiscovered
                ? `You'd already found this one. You were the ${ordinal(discovery.number)}.`
                : `You're the ${ordinal(discovery.number)} to make it.`}
            </p>
          </>
        ) : null}
        <div className="reveal-actions">
          <button className="btn outline" onClick={close}>Done</button>
          <button className="btn primary" onClick={() => setUi({ reveal: null, durationFor: reveal.mixId })}>Start Zone</button>
        </div>
      </div>
    </div>
  );
}
