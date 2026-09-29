import { useEffect, useState } from 'react';
import { BlendCanvas } from '../../components/BlendCanvas';
import { SoundSwatch } from '../../components/SoundSwatch';
import { SOUNDS } from '../../core/sounds';
import type { SoundId } from '../../core/types';
import { readStorage, writeStorage } from '../../state/store';

const KEY = 'hushday.onboarded.create.v1';
export const needsOnboarding = () => !readStorage<boolean>(KEY, false);

const orb = (sound: SoundId, level = SOUNDS[sound].defaultLevel) => ({ key: sound, sound, level });

/** A tiny track grid where a block slides in and snaps under another, on a loop. */
function BlockDemo() {
  const [round, setRound] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRound(r => r + 1), 2800);
    return () => clearInterval(timer);
  }, []);
  const incoming = (['rain', 'hifreq', 'wind'] as SoundId[])[round % 3];
  return (
    <div className="onb-grid" aria-hidden="true">
      <span className="onb-block" style={{ ['--c' as string]: SOUNDS.brown.color, left: '8%', width: '62%', top: 8 }}>
        <SoundSwatch sound="brown" level={0.7} animate />
      </span>
      <span className="onb-block" style={{ ['--c' as string]: SOUNDS.ocean.color, left: '40%', width: '52%', top: 100 }}>
        <SoundSwatch sound="ocean" level={0.6} animate />
      </span>
      <span key={round} className="onb-block onb-incoming" style={{ ['--c' as string]: SOUNDS[incoming].color, left: '8%', width: '62%', top: 54 }}>
        <SoundSwatch sound={incoming} level={0.6} animate />
      </span>
    </div>
  );
}

const STEPS = [
  {
    title: 'Pick a sound block',
    body: 'Every sound has its own look. Spiky is bright, silky is soft, heavy is deep. Tap ▶ on a card to hear it first.',
    art: () => (
      <div className="onb-orbs">
        {(['red', 'hifreq', 'wind'] as SoundId[]).map((s, i) => (
          <span key={s} className="onb-orb">
            <BlendCanvas layers={[orb(s)]} seed={i + 2} compact />
            <span className="mono">{SOUNDS[s].label}</span>
          </span>
        ))}
      </div>
    ),
  },
  {
    title: 'Stack blocks to combine',
    body: 'Drag blocks onto the tracks. Drop one sound onto another and they intertwine into one braided block. Drag it back out to pull them apart. On a phone, press and hold to pick one up.',
    art: () => <BlockDemo />,
  },
  {
    title: 'Find one nobody has',
    body: 'Every Mix gets a number. Make one nobody has made and it’s a first discovery, yours to share.',
    art: () => (
      <div className="onb-first">
        <BlendCanvas layers={[orb('ocean'), orb('pink', 0.5), orb('focus', 0.4)]} seed={42} className="onb-blend" />
        <span className="display lg onb-number">#1</span>
      </div>
    ),
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const finish = () => {
    writeStorage(KEY, true);
    onDone();
  };
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="onb" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb-card">
        <div className="onb-art">{current.art()}</div>
        <div className="onb-dots" aria-hidden="true">
          {STEPS.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
        <span className="kicker">Step {step + 1} of {STEPS.length}</span>
        <h2 id="onb-title" className="display lg">{current.title}</h2>
        <p className="lede">{current.body}</p>
        <div className="onb-actions">
          <button className="btn ghost small-btn" onClick={finish}>Skip</button>
          <button className="btn lime small-btn" onClick={() => (last ? finish() : setStep(step + 1))} autoFocus>
            {last ? 'Start mixing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
