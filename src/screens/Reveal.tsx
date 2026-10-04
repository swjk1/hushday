import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/bits';
import { Orb, useElapsed } from '../components/PlayerCard';
import { SCENE_IMAGES } from '../components/scenes';
import { PlayerWave } from '../components/Wave';
import { clock, mixSounds, ordinal, title } from '../core/format';
import { recommendScenarios } from '../core/scenarios';
import { SOUNDS } from '../core/sounds';
import { positionAt } from '../core/timeline';
import { findMix } from '../state/actions';
import { pause, playMix, resume, usePlayback } from '../state/playback';
import { useApp } from '../state/store';
import { haptic, setUi, useUi } from '../state/ui';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts up to a number so it lands with a little weight, starting after `delay` ms. */
function useCountUp(target: number, delay = 0) {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  useEffect(() => {
    if (reducedMotion()) return setValue(target);
    let frame = 0;
    const timer = window.setTimeout(() => {
      const startAt = performance.now();
      const duration = Math.min(1400, 500 + Math.log10(target + 1) * 350);
      const step = (now: number) => {
        const p = Math.min(1, (now - startAt) / duration);
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [target, delay]);
  return value;
}

/**
 * Text that types itself out, a character at a time, after `delay` ms. Screen readers get the whole text at
 * once; the typing is only drawn. With reduced motion it simply appears.
 */
function Type({ text, delay = 0, speed = 32, className, as: Tag = 'span' }: { text: string; delay?: number; speed?: number; className?: string; as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p' }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) return setShown(text.length);
    setShown(0);
    // Driven by the clock, not by counting ticks: if the browser slows timers (a background tab), the next tick
    // simply catches up, so the text always finishes on time.
    const startAt = performance.now() + delay;
    const interval = window.setInterval(() => {
      const n = Math.max(0, Math.min(text.length, Math.floor(((performance.now() - startAt) / 1000) * speed)));
      setShown(n);
      if (n >= text.length) clearInterval(interval);
    }, Math.max(16, 1000 / speed));
    return () => clearInterval(interval);
  }, [text, delay, speed]);
  const typing = shown < text.length;
  return (
    <Tag className={`type ${className ?? ''}`}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {typing && shown > 0 && <span className="type-caret" />}
        {/* The rest of the text holds its space, so nothing reflows while it types. */}
        <span className="type-rest">{text.slice(shown)}</span>
      </span>
    </Tag>
  );
}

/** How long a line takes to type at `speed` characters a second, for chaining the next one after it. */
const typeTime = (text: string, speed = 32) => (reducedMotion() ? 0 : (text.length / speed) * 1000);

/** The finished-Mix screen: the player on the left, what it's good for on the right, the numbers below. */
export function Reveal() {
  const reveal = useUi(s => s.reveal);
  const mixes = useApp(s => s.mixes);
  const { status, info } = usePlayback();

  useEffect(() => {
    if (!reveal) return;
    haptic(reveal.discovery?.first ? [14, 70, 14, 70, 28] : [10, 50, 16]);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUi({ reveal: null }); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [reveal]);

  const mix = reveal ? findMix(reveal.mixId) : null;
  const goodFor = useMemo(() => (mix ? recommendScenarios(mix) : []), [mix]);
  const discovery = reveal?.discovery ?? null;
  // Which of your Mixes this is, by when each was made.
  const own = [...mixes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nth = mix ? own.findIndex(m => m.id === mix.id) + 1 : 0;

  const mine = !!mix && info?.sourceId === mix.id;
  const playing = mine && status === 'playing';
  const paused = mine && status === 'paused';
  const elapsed = useElapsed(playing);
  const pos = mix && mine ? Math.min(mix.lengthSec, positionAt(mix, elapsed).pos) : 0;

  if (!reveal) return null;
  const close = () => setUi({ reveal: null });
  const name = title(reveal.mixName || 'Untitled');
  const heading = reveal.pending ? 'Saved.' : discovery?.first ? 'First discovery.' : discovery ? `Discovery #${discovery.number.toLocaleString('en-US')}` : 'Saved.';
  const sub = reveal.pending
    ? "Your number arrives next time you're online."
    : discovery?.first ? 'Nobody has made this before.'
    : discovery?.alreadyDiscovered ? `You'd already found this one. You were the ${ordinal(discovery.number)}.`
    : discovery ? `You're the ${ordinal(discovery.number)} to make it.` : '';
  const sounds = mix ? mixSounds(mix).filter(s => s !== 'quiet') : [];

  // The choreography: heading, then the player's name, then each card and its words, then the numbers.
  const tHeading = 150;
  const tSub = tHeading + typeTime(heading, 26) + 120;
  const tName = 450;
  const tCards = 650;
  const cardGap = 220;
  const tStats = tCards + cardGap * 3 + 500;

  return (
    <div className="fin" role="dialog" aria-modal="true" aria-labelledby="fin-title">
      <div className="fin-panel">
        <button className="icon-btn fin-close" onClick={close} aria-label="Close"><Icon name="close" size={18} /></button>
        <header className="fin-head">
          <span className="tiny-label fin-kicker">{name}</span>
          <Type as="h1" className="fin-title" text={heading} delay={tHeading} speed={26} />
          {sub && <Type as="p" className="fin-sub" text={sub} delay={tSub} speed={48} />}
        </header>

        <div className="fin-body">
          <section className={`fin-player ${playing ? 'is-playing' : ''}`} aria-label="Player">
            <Orb colors={sounds.map(s => SOUNDS[s].color)} />
            <Type as="h2" className="fin-name" text={name} delay={tName} speed={22} />
            <p className="fin-sounds">{sounds.map(s => SOUNDS[s].label).join(' · ')}</p>
            <PlayerWave className="fin-wave" />
            <div className="fin-progress" aria-hidden="true">
              <div className="fin-progress-bar" style={{ width: `${mix ? (pos / mix.lengthSec) * 100 : 0}%` }} />
            </div>
            <div className="fin-times">
              <span>{clock(pos)}</span>
              <span>{mix ? clock(mix.lengthSec) : '0:00'}{mix?.repeat === 'loop' ? ' ↻' : ''}</span>
            </div>
            <div className="fin-controls">
              {mix && (
                <button
                  className="play-button"
                  onClick={() => (playing ? pause() : paused ? resume() : playMix(mix.id))}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={22} />
                </button>
              )}
              <button className="btn lime" onClick={() => setUi({ reveal: null, durationFor: reveal.mixId })}>Start Zone</button>
            </div>
          </section>

          <section className="fin-good" aria-label="Good for">
            <Type as="h3" className="fin-label" text="Good for" delay={tCards - 200} speed={30} />
            {goodFor.length === 0 && <Type as="p" className="fin-card-why" text="Play it and see where it takes you." delay={tCards} speed={40} />}
            <ul className="fin-cards" style={{ ['--cols' as string]: Math.max(2, goodFor.length) }}>
              {goodFor.map((g, i) => {
                const at = tCards + i * cardGap;
                return (
                  <li key={g.id} className="fin-card" style={{ animationDelay: `${at}ms` }}>
                    <div className="fin-card-art">
                      {SCENE_IMAGES[g.id] && <img src={SCENE_IMAGES[g.id]} alt="" style={{ animationDelay: `${at}ms` }} />}
                    </div>
                    <Type as="h4" className="fin-card-title" text={g.label} delay={at + 380} speed={34} />
                    <Type as="p" className="fin-card-why" text={g.why} delay={at + 380 + typeTime(g.label, 34) + 80} speed={70} />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="fin-stats" aria-label="About this Mix">
          <Stat index={0} start={tStats} value={discovery ? discovery.number : null} prefix="#" label={discovery?.first ? 'First discovery' : 'Discovery'} note={reveal.pending ? 'Arrives online' : undefined} />
          <Stat index={1} start={tStats} value={discovery ? discovery.totalDiscoverers : null} label={discovery?.totalDiscoverers === 1 ? 'Person has made this' : 'People have made this'} note={reveal.pending ? 'Arrives online' : undefined} />
          <Stat index={2} start={tStats} value={nth || null} ordinalOf label="Of your Mixes" />
          <Stat index={3} start={tStats} value={mix ? Math.round(mix.lengthSec / 60) : null} suffix=" min" label={`${sounds.length} ${sounds.length === 1 ? 'sound' : 'sounds'}, ${mix?.repeat === 'sustain' ? 'holds at the end' : 'loops'}`} />
        </section>

        <footer className="fin-foot">
          <a className="btn outline" href={`#/mix/${reveal.mixId}`} onClick={close}>Open Mix</a>
          <button className="btn outline" onClick={close}>Done</button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ index, start, value, label, prefix = '', suffix = '', ordinalOf, note }: {
  index: number; start: number; value: number | null; label: string; prefix?: string; suffix?: string; ordinalOf?: boolean; note?: string;
}) {
  const at = start + index * 140;
  const n = useCountUp(value ?? 0, at + 200);
  const shown = value == null ? '—' : ordinalOf ? ordinal(Math.max(1, n)) : `${prefix}${n.toLocaleString('en-US')}${suffix}`;
  return (
    <div className="fin-stat" style={{ animationDelay: `${at}ms` }}>
      <span className="fin-stat-value display">{shown}</span>
      <Type className="fin-stat-label" text={label} delay={at + 250} speed={45} />
      {note && <span className="fin-stat-note">{note}</span>}
    </div>
  );
}

