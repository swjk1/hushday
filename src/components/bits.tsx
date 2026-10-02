import type { ReactNode } from 'react';
import { SOUNDS } from '../core/sounds';
import { mixSounds } from '../core/format';
import type { Discovery, MixDraft, SoundId } from '../core/types';

type IconName = 'play' | 'pause' | 'plus' | 'back' | 'down' | 'bookmark' | 'bookmarked' | 'close' | 'up' | 'trash' | 'branch' | 'stop' | 'check' | 'share' | 'download' | 'heart' | 'spark' | 'today' | 'studio' | 'sounds' | 'mixes' | 'arrow' | 'copy' | 'edit';

const PATHS: Record<IconName, ReactNode> = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
  stop: <path d="M6.5 6.5h11v11h-11z" fill="currentColor" stroke="none" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  up: <path d="M5 15l7-7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bookmark: <path d="M7 4h10v16l-5-4-5 4z" />,
  bookmarked: <path d="M7 4h10v16l-5-4-5 4z" fill="currentColor" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />,
  branch: <path d="M7 4v10a4 4 0 0 0 4 4h6M17 14l3 4-3 4M7 4 4 7M7 4l3 3" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  share: <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />,
  download: <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />,
  heart: <path d="M12 19s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 2.2C19 14.7 12 19 12 19z" />,
  spark: <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />,
  today: <><circle cx="12" cy="12" r="8.5" /><circle cx="10" cy="10" r="2.6" /></>,
  studio: <path d="M3 7h9M3 12c3-3 6 3 9 0s6-3 9 0M9 17h12" />,
  sounds: <path d="M5 10v4M9 6v12M13 8.5v7M17 4v16M21 10v4" />,
  mixes: <path d="M3 12c3-6.5 6-6.5 9 0s6 6.5 9 0M3 12c3 6.5 6 6.5 9 0s6-6.5 9 0" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4Z" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** Hand-drawn marks, one per sound, each echoing its texture (24px grid). */
const GLYPHS: Record<SoundId, ReactNode> = {
  brown: <path d="M3 9.5c3-2.6 6-2.6 9 0s6 2.6 9 0M3 15c3-2.6 6-2.6 9 0s6 2.6 9 0" />,
  red: <path d="M2.5 13.5c4.2-6 9.8-6 14 0 1.7 2.3 3.3 2.8 5 2.3" strokeWidth={2.6} />,
  pink: <path d="M3 7.5q1.5-1.6 3 0t3 0 3 0 3 0 3 0 3 0M3 12q1.5-1.6 3 0t3 0 3 0 3 0 3 0 3 0M3 16.5q1.5-1.6 3 0t3 0 3 0 3 0 3 0 3 0" />,
  white: (
    <g fill="currentColor" stroke="none">
      {[[5, 7, 1.1], [10, 5.5, 0.9], [15, 8, 1.1], [19.5, 6, 0.8], [7, 12, 0.8], [12, 11.5, 1.1], [17.5, 12.5, 0.9], [4.5, 17, 0.9], [9.5, 17.5, 1.1], [14.5, 16.5, 0.8], [19, 18, 1.1]].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  ),
  tone432: <path d="M2.5 12c1.6-7 3.15-7 4.75 0s3.15 7 4.75 0 3.15-7 4.75 0 3.15 7 4.75 0" />,
  tone528: <path d="M2.5 12c1.25-6.5 2.55-6.5 3.8 0s2.55 6.5 3.8 0 2.55-6.5 3.8 0 2.55 6.5 3.8 0 2.55-6.5 3.8 0" />,
  rain: <><path d="M8 4.5 6.5 9M14 3.5 12.5 8M19.5 5.5 18 10M10.5 12.5 9 17M17 13 15.5 17.5" /><circle cx="5" cy="19.5" r=".9" fill="currentColor" stroke="none" /><circle cx="13" cy="20.5" r=".9" fill="currentColor" stroke="none" /></>,
  ocean: <><path d="M2.5 13c3 0 3.6-4.5 6.6-4.5s3.6 4.5 6.6 4.5 3.3-4 5.8-4" /><path d="M2.5 18c3 0 4-1.8 6.6-1.8s4 1.8 6.6 1.8 3.8-1.6 5.8-1.6" opacity={0.55} /></>,
  wind: <path d="M2 9.5c4.5 0 5.5-3.5 9.5-3.5 2.8 0 3.2 2.8 1 3M2 14c6.5 0 8.5-2.2 13.5-2.2 3 0 4 1.6 6.5 1.6M5 18.5c4 0 5.5-1.6 9-1.6" />,
  fan: <><circle cx="12" cy="12" r="1.5" /><path d="M12 10.3c-.8-3.2-3.6-5.4-6.6-3.9 1.2 2.7 4 4.3 6.6 3.9ZM13.7 12c3.2-.8 5.4-3.6 3.9-6.6-2.7 1.2-4.3 4-3.9 6.6ZM12 13.7c.8 3.2 3.6 5.4 6.6 3.9-1.2-2.7-4-4.3-6.6-3.9ZM10.3 12c-3.2.8-5.4 3.6-3.9 6.6 2.7-1.2 4.3-4 3.9-6.6Z" /></>,
  stream: <path d="M2.5 8.5c1.6-1.8 3.2 1.8 4.8 0s3.2 1.8 4.8 0 3.2 1.8 4.8 0 3.2 1.8 4.6 0M2.5 13c1.6-1.8 3.2 1.8 4.8 0s3.2 1.8 4.8 0 3.2 1.8 4.8 0 3.2 1.8 4.6 0M2.5 17.5c1.6-1.8 3.2 1.8 4.8 0s3.2 1.8 4.8 0 3.2 1.8 4.8 0 3.2 1.8 4.6 0" />,
  fire: <path d="M12 3c.8 3.2 5.2 5.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2 .9-3.6 2-4.8.1 1.6.9 2.7 2 3.2-.4-3.1-.9-6.4 1.2-8.6ZM12 20.5c-1.6 0-2.6-1.1-2.6-2.5 0-1.5 1.2-2.2 1.6-3.7.9.9 1.4 1.7 1.4 2.5" />,
  night: <><path d="M14.5 3.5a7.6 7.6 0 1 0 6.2 12.2 6.2 6.2 0 0 1-6.2-12.2Z" /><path d="M5 5v3.4M3.3 6.7h3.4M7.5 12.5v2M6.5 13.5h2" /></>,
  focus: <path d="M4 9.5v5M8 6.5v11M12 9.5v5M16 6.5v11M20 9.5v5" />,
  zen: <><path d="M2.5 9c3.2-3.4 6.3-3.4 9.5 0s6.3 3.4 9.5 0" /><path d="M2.5 16c2.1-2.2 4.2-2.2 6.3 0s4.2 2.2 6.4 0 4.2-2.2 6.3 0" opacity={0.6} /></>,
  quiet: <path d="M3 6.5c5.5 0 6 5.5 9 5.5s3.5-5.5 9-5.5M3 17.5c5.5 0 6-5.5 9-5.5s3.5 5.5 9 5.5" />,
};

export function Glyph({ sound, size = 'md' }: { sound: SoundId; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`glyph ${size}`} style={{ ['--c' as string]: SOUNDS[sound].color }} aria-hidden="true">
      <svg viewBox="0 0 24 24">{GLYPHS[sound]}</svg>
    </span>
  );
}

export function SoundDot({ sound }: { sound: SoundId }) {
  return <span className="dot" style={{ background: SOUNDS[sound].color }} />;
}

/** "Brown · Rain · Focus", colour-keyed to the ribbon. */
export function SoundLine({ mix }: { mix: MixDraft }) {
  return (
    <span className="sound-line">
      {mixSounds(mix).map(s => (
        <span key={s} className="sound-tag">
          <SoundDot sound={s} />
          {SOUNDS[s].label}
        </span>
      ))}
    </span>
  );
}

export function DiscoveryBadge({ discovery, pending }: { discovery?: Discovery | null; pending?: boolean }) {
  if (pending) return <span className="badge badge-pending">Discovery pending</span>;
  if (!discovery) return null;
  if (discovery.first) return <span className="badge badge-first">First discovery</span>;
  return <span className="badge">Discovery #{discovery.number.toLocaleString('en-US')}</span>;
}

export function Kicker({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <div className="kicker">
      {live && <span className="live" />}
      {children}
    </div>
  );
}
