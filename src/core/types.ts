// Platform-independent product model. Nothing in src/core may touch the DOM or Node APIs,
// so the same rules run in the browser, in Vercel Functions, and later in a native app.

export type SoundId = 'brown' | 'red' | 'pink' | 'white' | 'tone432' | 'tone528' | 'fan' | 'rain' | 'ocean' | 'wind' | 'stream' | 'fire' | 'night' | 'focus' | 'zen' | 'quiet';
export type SoundCategory = 'continuous' | 'functional' | 'quiet';

/** How a component arrives. "slow" is the long swell used for things like rain slowly entering. */
export type Entry = 'soft' | 'slow';

/** What happens when a Zone outlasts the Mix: repeat the whole timeline, or hold the ending. */
export type RepeatMode = 'loop' | 'sustain';

/** One audio element on the Mix timeline. Times are seconds from the start of the Mix. */
export interface MixComponent {
  id: string;
  sound: SoundId;
  start: number;
  end: number;
  /** 0–1. For a quiet section this is how far everything else drops. */
  level: number;
  entry: Entry;
  /** Track row in the block editor (0 at the top). Purely visual; the sound is the same on any row. */
  row?: number;
  /** Which version of the sound plays. Absent means the original. */
  variant?: VariantId;
}

/** Simpler alternative versions offered for some sounds, alongside the original. */
export type VariantId = 'a' | 'b' | 'c' | 'd' | 'e';

/** The audio package itself. Array order of components is the visual layer order. */
export interface MixDraft {
  name: string;
  lengthSec: number;
  repeat: RepeatMode;
  components: MixComponent[];
  parentMixId?: string | null;
  /** Auto-Blend: on or off, and the rule version the Mix was saved with. Absent means off (the original). */
  blend?: { on: boolean; v: number };
}

export interface Discovery {
  familyId: string;
  number: number;
  first: boolean;
  /** True when this person had already found this family, so no new number was issued. */
  alreadyDiscovered: boolean;
  totalDiscoverers: number;
  fingerprint: string;
}

export interface Mix extends MixDraft {
  id: string;
  creatorId: string | null;
  curated: boolean;
  createdAt: string;
  tagline?: string;
  discovery?: Discovery | null;
  /** Client-side sync state for user-created Mixes. */
  sync?: 'synced' | 'pending';
}

/**
 * The short, instant format (currently branded "Shot"). Internally it is always a
 * ShortExperience so the user-facing name can change without touching the model.
 */
export interface ShortExperience {
  id: string;
  name: string;
  durationSec: number;
  protocol: string;
  visual: 'pulse';
  description: string;
  metadata: Record<string, string>;
  mix: MixDraft;
}

export type ZoneState = 'active' | 'paused' | 'completed' | 'ended';
