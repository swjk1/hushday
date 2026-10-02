import type { SoundCategory, SoundId, VariantId } from './types.js';

/**
 * Parameters for the simple generator that plays every alternative version. One main texture
 * per sound: a fixed pitch, a filtered noise wash, and/or one rounded event repeating on a period.
 */
export interface SimpleSynth {
  /** Sine pitch in Hz, with an optional second pitch and a relative level for the first. */
  tone?: number;
  second?: number;
  toneAmp?: number;
  /** Noise colour for a wash, its high-pass and low-pass corners in Hz, and its relative level. */
  noise?: 'pink' | 'brown';
  high?: number;
  low?: number;
  amp?: number;
  /** A slow, regular rise and fall of the wash: period in seconds and depth (0–1). */
  swell?: number;
  depth?: number;
  /** One rounded event every `period` seconds, `length` seconds long: a sine at `event` Hz, or a soft rustle. */
  event?: number;
  rustle?: boolean;
  period?: number;
  length?: number;
  eventAmp?: number;
}

export interface SoundVariant {
  id: VariantId;
  label: string;
  blurb: string;
  /** Short note on pitch or motion, shown beside the label. */
  note: string;
  /** Loudness calibration, so switching version keeps the same perceived level. */
  gain: number;
  /** A version is either generated from simple parameters or played from a recorded loop. */
  synth?: SimpleSynth;
  sample?: { file: string; loopStart: number; loopEnd: number; credit: string };
}

export type StrandTexture = 'smooth' | 'heavy' | 'ripple' | 'grain' | 'spike' | 'tone' | 'drops' | 'swell' | 'silk' | 'pulse' | 'none';

export interface SoundDef {
  id: SoundId;
  /** Short label used in sound lines ("Brown · Rain"). */
  label: string;
  name: string;
  category: SoundCategory;
  color: string;
  blurb: string;
  /** Technical notes, shown only when someone opens the details. */
  detail: string;
  /** Loudness calibration so every generator sits at a similar perceived level. */
  gain: number;
  defaultLevel: number;
  strand: { width: number; spacing: number; texture: StrandTexture };
  /** Grouping shown on the sound palette. */
  family: 'Noise' | 'Tone' | 'Nature' | 'Function' | 'Space';
  /** Fixed pitch in Hz for pure tones; other sounds have none. */
  freq?: number;
  /**
   * A recorded loop instead of a generator. The file repeats seamlessly between loopStart and
   * loopEnd (seconds); audio outside that range is wrap-around margin so the seam survives
   * small timing shifts from MP3 decoders.
   */
  sample?: { file: string; loopStart: number; loopEnd: number; credit: string };
  /** An original generated from simple parameters (like the versions) rather than its own generator. */
  synth?: SimpleSynth;
  /** Alternative versions, offered alongside the original. */
  variants?: SoundVariant[];
  /** Rough share of energy in the lows, mids and highs (0–1), drawn as a tone meter. */
  tone: [low: number, mid: number, high: number];
}

export const SOUNDS: Record<SoundId, SoundDef> = {
  brown: {
    id: 'brown', label: 'Brown', name: 'Brown noise', category: 'continuous', color: '#D9A478',
    blurb: 'Deep and warm. Soaks up low rumble.',
    detail: 'Integrated random noise. Energy falls about 6 dB per octave, so it sits low and soft.',
    gain: 0.9, defaultLevel: 0.65, strand: { width: 2.2, spacing: 3.4, texture: 'smooth' },
    family: 'Noise', tone: [1, 0.45, 0.12],
  },
  red: {
    id: 'red', label: 'Red', name: 'Red noise', category: 'continuous', color: '#E3776A',
    blurb: 'Deeper than brown. A slow, heavy rumble.',
    detail: 'Brown noise with its highs rolled off further, so nearly all the energy sits in the deep lows.',
    gain: 1, defaultLevel: 0.6, strand: { width: 2.8, spacing: 4.2, texture: 'heavy' },
    family: 'Noise', tone: [1, 0.25, 0.05],
  },
  pink: {
    id: 'pink', label: 'Pink', name: 'Pink noise', category: 'continuous', color: '#F0A3C4',
    blurb: 'Balanced and even. Good all-rounder.',
    detail: 'Equal energy per octave (about 3 dB per octave roll-off). Close to how we hear balance.',
    gain: 0.95, defaultLevel: 0.5, strand: { width: 1.5, spacing: 2.6, texture: 'ripple' },
    family: 'Noise', tone: [0.8, 0.72, 0.6],
  },
  white: {
    id: 'white', label: 'White', name: 'White noise', category: 'continuous', color: '#E9EEF4',
    blurb: 'Bright and crisp. Masks voices.',
    detail: 'Flat spectrum, equal energy at every frequency. Best kept low under other layers.',
    gain: 0.55, defaultLevel: 0.35, strand: { width: 0.9, spacing: 1.8, texture: 'grain' },
    family: 'Noise', tone: [0.55, 0.8, 1],
  },
  tone432: {
    id: 'tone432', label: '432 Hz', name: '432 Hz tone', category: 'continuous', color: '#9F8CFF',
    blurb: 'A steady, mellow tone. Just under A.',
    detail: 'A pure sine wave at 432 Hz, identical in both ears. No noise, no drift. Keep it low under other layers.',
    gain: 0.45, defaultLevel: 0.35, freq: 432, strand: { width: 1.4, spacing: 2.8, texture: 'tone' },
    family: 'Tone', tone: [0.1, 1, 0.15],
  },
  tone528: {
    id: 'tone528', label: '528 Hz', name: '528 Hz tone', category: 'continuous', color: '#E8A0FF',
    blurb: 'A steady, brighter tone. A touch above C.',
    detail: 'A pure sine wave at 528 Hz, identical in both ears. No noise, no drift. Keep it low under other layers.',
    gain: 0.42, defaultLevel: 0.35, freq: 528, strand: { width: 1.2, spacing: 2.4, texture: 'tone' },
    family: 'Tone', tone: [0.08, 1, 0.25],
  },
  rain: {
    id: 'rain', label: 'Rain', name: 'Rain', category: 'continuous', color: '#78B1EA',
    blurb: 'Rain falling on a canopy, close by.',
    detail: 'A real recording of rain falling on a canopy in Halenfeld, Germany, looped seamlessly every minute. By Matthes via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness this sound has always had, so existing mixes keep their balance.
    gain: 1.77, defaultLevel: 0.5, strand: { width: 1.3, spacing: 2.8, texture: 'drops' },
    family: 'Nature', tone: [0.35, 0.75, 0.9],
    sample: { file: 'sounds/rain.mp3', loopStart: 0.5, loopEnd: 60.5, credit: 'Matthes via Radio Aporee (archive.org aporee_23977_27849), Public Domain Mark' },
  },
  ocean: {
    id: 'ocean', label: 'Ocean', name: 'Ocean', category: 'continuous', color: '#4FCDB3',
    blurb: 'Waves breaking close on a beach.',
    detail: 'A real recording of waves on Klong Muang beach, Thailand, looped seamlessly every 90 seconds. By Felix Blume via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness this sound has always had, so existing mixes keep their balance.
    gain: 1.74, defaultLevel: 0.5, strand: { width: 1.8, spacing: 3.2, texture: 'swell' },
    family: 'Nature', tone: [0.9, 0.6, 0.35],
    sample: { file: 'sounds/ocean.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Felix Blume via Radio Aporee (archive.org aporee_47950_54511), Public Domain Mark' },
  },
  wind: {
    id: 'wind', label: 'Wind', name: 'Wind', category: 'continuous', color: '#F1D27E',
    blurb: 'Wind moving through reeds.',
    detail: 'A real recording of wind on a grove of reeds in Copenhagen, looped seamlessly every 90 seconds. By Alessandro Altavilla via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness this sound has always had, so existing mixes keep their balance.
    gain: 1.84, defaultLevel: 0.45, strand: { width: 0.9, spacing: 2.4, texture: 'silk' },
    family: 'Nature', tone: [0.55, 0.8, 0.45],
    sample: { file: 'sounds/wind.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Alessandro Altavilla via Radio Aporee (archive.org aporee_14720_17165), Public Domain Mark' },
  },
  fan: {
    id: 'fan', label: 'Fan', name: 'Fan', category: 'continuous', color: '#B0BEC5',
    blurb: 'A quiet motor under a trace of soft air.',
    detail: 'One low 108 Hz motor tone under soft, low-passed air. No wobble, no extra harmonics. Nothing changes, which is the point.',
    gain: 4.87, defaultLevel: 0.5, strand: { width: 1.6, spacing: 3, texture: 'smooth' },
    family: 'Noise', tone: [0.75, 0.7, 0.2],
    synth: { tone: 108, toneAmp: 0.7, noise: 'pink', low: 420, amp: 0.55 },
  },
  stream: {
    id: 'stream', label: 'Stream', name: 'Stream', category: 'continuous', color: '#8EE3F5',
    blurb: 'A creek flowing, softly.',
    detail: 'A real recording of a creek in Boulder, Colorado, softened a little and looped seamlessly every 90 seconds. By daytondaft via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness this sound has always had, so existing mixes keep their balance.
    gain: 1.06, defaultLevel: 0.5, strand: { width: 1.1, spacing: 2.2, texture: 'ripple' },
    family: 'Nature', tone: [0.2, 0.85, 0.7],
    sample: { file: 'sounds/stream.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'daytondaft via Radio Aporee (archive.org aporee_16764_19506), Public Domain Mark' },
  },
  fire: {
    id: 'fire', label: 'Fire', name: 'Fire', category: 'continuous', color: '#FF9A3C',
    blurb: 'A calm fireplace, warm and gently crackling.',
    detail: 'A real recording of a settled fireplace, mostly low warmth with gentle crackle, looped seamlessly every 90 seconds. By inchadney, CC0.',
    // Calibrated (ITU-R BS.1770) to the loudness this sound has always had, so existing mixes keep their balance.
    gain: 2.39, defaultLevel: 0.5, strand: { width: 1.3, spacing: 2.6, texture: 'spike' },
    family: 'Nature', tone: [0.9, 0.4, 0.55],
    sample: { file: 'sounds/fire.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'inchadney via Freesound and archive.org FireFavorite, CC0' },
  },
  night: {
    id: 'night', label: 'Night', name: 'Night crickets', category: 'continuous', color: '#5DBF8A',
    blurb: 'A bright, even chorus of night crickets.',
    detail: 'A real recording of night crickets at Les Cluses in the south of France, looped seamlessly every 90 seconds. By Jillis Molenaar via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness this sound has always had, so existing mixes keep their balance.
    gain: 1.19, defaultLevel: 0.4, strand: { width: 1, spacing: 2.6, texture: 'drops' },
    family: 'Nature', tone: [0.15, 0.3, 1],
    sample: { file: 'sounds/night.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Jillis Molenaar via Radio Aporee (archive.org aporee_70514_82218), Public Domain Mark' },
  },
  focus: {
    id: 'focus', label: 'Focus', name: 'Focus audio', category: 'functional', color: '#C6E86A',
    blurb: 'A short, driving pulse to lock in.',
    detail: 'A warm two-note pad over low-passed noise, with a rounded pulse of about 10 per second that rocks gently between the ears. Works on speakers or headphones; keep it low to medium.',
    gain: 0.8, defaultLevel: 0.6, strand: { width: 1.6, spacing: 3, texture: 'pulse' },
    family: 'Function', tone: [0.45, 0.95, 0.4],
  },
  zen: {
    id: 'zen', label: 'Zen', name: 'Zen', category: 'continuous', color: '#B7C4F4',
    blurb: 'Two low, still tones a fifth apart.',
    detail: 'Two quiet, fixed sines at 108 and 162 Hz, a plain open fifth, with no pulse or drift. Calm under anything.',
    gain: 3.48, defaultLevel: 0.6, strand: { width: 1.4, spacing: 2.8, texture: 'tone' },
    family: 'Tone', tone: [0.95, 0.2, 0],
    synth: { tone: 108, second: 162 },
  },
  quiet: {
    id: 'quiet', label: 'Quiet', name: 'Quiet section', category: 'quiet', color: '#9AABB3',
    blurb: 'A pause. Everything drops away.',
    detail: 'Fades every other layer down for its length, then brings them back.',
    gain: 0, defaultLevel: 1, strand: { width: 1, spacing: 3, texture: 'none' },
    family: 'Space', tone: [0, 0, 0],
  },
};

export const SOUND_ORDER: SoundId[] = ['brown', 'red', 'pink', 'white', 'tone432', 'tone528', 'fan', 'rain', 'ocean', 'wind', 'stream', 'fire', 'night', 'focus', 'zen', 'quiet'];

/** Sounds that no longer exist, and what stored Mixes and old links play instead. */
export const LEGACY_SOUNDS: Record<string, SoundId> = { hifreq: 'white' };

/**
 * Alternative versions offered beside an original, kept after listening: a second rain recording.
 * A strips the sound back to one defining texture; B leaves more room for harmony, with tonal
 * choices related to a shared 108 Hz foundation. The two Hz tones stay at exactly 432 and 528 Hz, so
 * they offer no retuned B. Gains are calibrated with ITU-R BS.1770 loudness
 * so each version matches its original at the same level.
 */
const VARIANTS: Partial<Record<SoundId, SoundVariant[]>> = {
  rain: [
    { id: 'b', label: 'Heavy rain', note: 'Dense, steady', blurb: 'Heavy rain in Egå, Denmark. A fuller, denser downpour.', gain: 1.77, sample: { file: 'sounds/rain-b.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'audiotraction via Radio Aporee (archive.org aporee_58354_66946), Public Domain Mark' } },
  ],
};
for (const [id, list] of Object.entries(VARIANTS)) SOUNDS[id as SoundId].variants = list;

/** The alternative version a block plays, or null for the original. */
export const variantOf = (sound: SoundId, variant: VariantId | undefined): SoundVariant | null =>
  (variant && SOUNDS[sound].variants?.find(v => v.id === variant)) || null;

/** Display name of a block's version: the variant's label, or "Original". */
export const variantLabel = (sound: SoundId, variant: VariantId | undefined) => variantOf(sound, variant)?.label ?? 'Original';

export const isSoundId = (value: unknown): value is SoundId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SOUNDS, value);

/** Perceptual curve from the 0–1 intensity slider to linear gain. */
export const levelGain = (level: number) => (level <= 0 ? 0 : Math.pow(level, 1.7));
