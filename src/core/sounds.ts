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
  /** Simpler alternative versions, offered alongside the original. */
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
    blurb: 'Light rain falling through a forest.',
    detail: 'A real recording of light rain in Serrinha do Alambari, Brazil, looped seamlessly every 90 seconds. By Felix Blume via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness the generated version had, so existing mixes keep their balance.
    gain: 1.7, defaultLevel: 0.5, strand: { width: 1.3, spacing: 2.8, texture: 'drops' },
    family: 'Nature', tone: [0.35, 0.75, 0.9],
    sample: { file: 'sounds/rain.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Felix Blume via Radio Aporee (archive.org aporee_54335_62155), Public Domain Mark' },
  },
  ocean: {
    id: 'ocean', label: 'Ocean', name: 'Ocean', category: 'continuous', color: '#4FCDB3',
    blurb: 'Waves rolling in from the Gulf of Mexico.',
    detail: 'A real recording of waves at Casitas, Veracruz, looped seamlessly every 90 seconds. By Felix Blume via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness the generated version had, so existing mixes keep their balance.
    gain: 1.84, defaultLevel: 0.5, strand: { width: 1.8, spacing: 3.2, texture: 'swell' },
    family: 'Nature', tone: [0.9, 0.6, 0.35],
    sample: { file: 'sounds/ocean.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Felix Blume via Radio Aporee (archive.org aporee_47956_54521), Public Domain Mark' },
  },
  wind: {
    id: 'wind', label: 'Wind', name: 'Wind', category: 'continuous', color: '#F1D27E',
    blurb: 'Wind moving through conifers.',
    detail: 'A real recording of wind in conifers in The Hague, looped seamlessly every 80 seconds. By Alessio Dutto via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness the generated version had, so existing mixes keep their balance.
    gain: 1.85, defaultLevel: 0.45, strand: { width: 0.9, spacing: 2.4, texture: 'silk' },
    family: 'Nature', tone: [0.55, 0.8, 0.45],
    sample: { file: 'sounds/wind.mp3', loopStart: 0.5, loopEnd: 80.5, credit: 'Alessio Dutto via Radio Aporee (archive.org aporee_17080_19888), Public Domain Mark' },
  },
  fan: {
    id: 'fan', label: 'Fan', name: 'Fan', category: 'continuous', color: '#B0BEC5',
    blurb: 'A box fan in the next room. Steady and plain.',
    detail: 'A low motor hum with a faint blade wobble under low-passed air noise. Nothing changes, which is the point.',
    gain: 1, defaultLevel: 0.5, strand: { width: 1.6, spacing: 3, texture: 'smooth' },
    family: 'Noise', tone: [0.75, 0.7, 0.2],
  },
  stream: {
    id: 'stream', label: 'Stream', name: 'Stream', category: 'continuous', color: '#8EE3F5',
    blurb: 'Soft water flowing, close up.',
    detail: 'A real recording of a small stream, looped seamlessly about once a minute. "Stream River Water Up Close" by jackthemurray, CC0.',
    // Calibrated by measured loudness (ITU-R BS.1770) to sit with the other sounds.
    gain: 2.33, defaultLevel: 0.5, strand: { width: 1.1, spacing: 2.2, texture: 'ripple' },
    family: 'Nature', tone: [0.2, 0.85, 0.7],
    sample: { file: 'sounds/stream.mp3', loopStart: 0.5, loopEnd: 63.389333, credit: 'jackthemurray (Freesound 433589), CC0' },
  },
  fire: {
    id: 'fire', label: 'Fire', name: 'Fire', category: 'continuous', color: '#FF9A3C',
    blurb: 'A small wood fire crackling outdoors.',
    detail: 'A real recording of a small fire in Stabulankiai, Lithuania, looped seamlessly about every two and a half minutes. By alas23 via Radio Aporee, public domain.',
    // Matches the level the synthesised fire used to play at.
    gain: 2.41, defaultLevel: 0.5, strand: { width: 1.3, spacing: 2.6, texture: 'spike' },
    family: 'Nature', tone: [0.9, 0.4, 0.55],
    sample: { file: 'sounds/fire.mp3', loopStart: 0.5, loopEnd: 140.543271, credit: 'alas23 via Radio Aporee (archive.org aporee_19997_23285), Public Domain Mark' },
  },
  night: {
    id: 'night', label: 'Night', name: 'Night crickets', category: 'continuous', color: '#5DBF8A',
    blurb: 'Night insects in a quiet garden.',
    detail: 'A real recording of night insects in Corvallis, Oregon, looped seamlessly every 90 seconds. By Peter Cusack via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) to the loudness the generated version had, so existing mixes keep their balance.
    gain: 1.43, defaultLevel: 0.4, strand: { width: 1, spacing: 2.6, texture: 'drops' },
    family: 'Nature', tone: [0.15, 0.3, 1],
    sample: { file: 'sounds/night.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Peter Cusack via Radio Aporee (archive.org aporee_65348_75468), Public Domain Mark' },
  },
  focus: {
    id: 'focus', label: 'Focus', name: 'Focus audio', category: 'functional', color: '#C6E86A',
    blurb: 'A short, driving pulse to lock in.',
    detail: 'A warm two-note pad over low-passed noise, with a rounded pulse of about 10 per second that rocks gently between the ears. Works on speakers or headphones; keep it low to medium.',
    gain: 0.8, defaultLevel: 0.6, strand: { width: 1.6, spacing: 3, texture: 'pulse' },
    family: 'Function', tone: [0.45, 0.95, 0.4],
  },
  quiet: {
    id: 'quiet', label: 'Quiet', name: 'Quiet section', category: 'quiet', color: '#9AABB3',
    blurb: 'A pause. Everything drops away.',
    detail: 'Fades every other layer down for its length, then brings them back.',
    gain: 0, defaultLevel: 1, strand: { width: 1, spacing: 3, texture: 'none' },
    family: 'Space', tone: [0, 0, 0],
  },
};

export const SOUND_ORDER: SoundId[] = ['brown', 'red', 'pink', 'white', 'tone432', 'tone528', 'fan', 'rain', 'ocean', 'wind', 'stream', 'fire', 'night', 'focus', 'quiet'];

/** Sounds that no longer exist, and what stored Mixes and old links play instead. */
export const LEGACY_SOUNDS: Record<string, SoundId> = { hifreq: 'white' };

/**
 * Alternative versions of ten sounds, offered beside each original. Nature sounds offer other public-domain
 * recordings; the rest offer simpler generated versions from the "Sound studies" proposals.
 * A strips the sound back to one defining texture; B leaves more room for harmony, with tonal
 * choices related to a shared 108 Hz foundation. The two Hz tones stay at exactly 432 and 528 Hz, so
 * they offer no retuned B. Gains are calibrated with ITU-R BS.1770 loudness
 * so each version matches its original at the same level.
 */
const VARIANTS: Partial<Record<SoundId, SoundVariant[]>> = {
  tone432: [
    { id: 'a', label: 'Single thread', note: '432 Hz', blurb: 'Exact 432 Hz, softly voiced. One sine, centred and completely steady.', gain: 3.46, synth: { tone: 432 } },
  ],
  tone528: [
    { id: 'a', label: 'Clear thread', note: '528 Hz, exact', blurb: 'Exact 528 Hz. A quiet, stable single tone with no modulation.', gain: 3.23, synth: { tone: 528 } },
  ],
  fan: [
    { id: 'a', label: 'Air only', note: 'Unpitched', blurb: 'A steady, dark air wash, without the motor pitches or blade wobble.', gain: 2, synth: { noise: 'pink', low: 700, amp: 1.9 } },
    { id: 'b', label: 'Quiet motor', note: '108 Hz and air', blurb: 'One low sine under a trace of soft air. No wobble or extra harmonics.', gain: 4.87, synth: { tone: 108, toneAmp: 0.7, noise: 'pink', low: 420, amp: 0.55 } },
  ],
  rain: [
    { id: 'a', label: 'Rain on a canopy', note: 'Close, on a porch roof', blurb: 'Rain falling on a canopy in Halenfeld, Germany. Closer and more detailed.', gain: 1.77, sample: { file: 'sounds/rain-a.mp3', loopStart: 0.5, loopEnd: 60.5, credit: 'Matthes via Radio Aporee (archive.org aporee_23977_27849), Public Domain Mark' } },
    { id: 'b', label: 'Heavy rain', note: 'Dense, steady', blurb: 'Heavy rain in Egå, Denmark. A fuller, denser downpour.', gain: 1.77, sample: { file: 'sounds/rain-b.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'audiotraction via Radio Aporee (archive.org aporee_58354_66946), Public Domain Mark' } },
  ],
  ocean: [
    { id: 'a', label: 'Close waves', note: 'Near the water', blurb: 'Waves breaking close on Klong Muang beach, Thailand. More movement, wave by wave.', gain: 1.74, sample: { file: 'sounds/ocean-a.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Felix Blume via Radio Aporee (archive.org aporee_47950_54511), Public Domain Mark' } },
    { id: 'b', label: 'Pacific shore', note: 'Wide surf', blurb: 'The Pacific at Goleta, California. A broad, rolling surf.', gain: 1.85, sample: { file: 'sounds/ocean-b.mp3', loopStart: 0.5, loopEnd: 85.5, credit: 'lingkangmeng via Radio Aporee (archive.org aporee_46559_52874), Public Domain Mark' } },
  ],
  wind: [
    { id: 'a', label: 'Wind in reeds', note: 'Soft rustle', blurb: 'Wind moving through a stand of reeds in Copenhagen. Lighter and more rustling.', gain: 1.84, sample: { file: 'sounds/wind-a.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Alessandro Altavilla via Radio Aporee (archive.org aporee_14720_17165), Public Domain Mark' } },
    { id: 'b', label: 'Strong wind', note: 'Open, blowing', blurb: 'Strong wind in Utena, Lithuania. A fuller, more open rush of air.', gain: 1.83, sample: { file: 'sounds/wind-b.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'alas23 via Radio Aporee (archive.org aporee_59185_67914), Public Domain Mark' } },
  ],
  stream: [
    { id: 'a', label: 'Mountain stream', note: 'Steady water', blurb: 'A mountain stream under a wooden bridge in Pitões das Júnias, Portugal. Very even.', gain: 1.47, sample: { file: 'sounds/stream-a.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Tiago CarvE via Radio Aporee (archive.org aporee_69234_80475), Public Domain Mark' } },
    { id: 'b', label: 'Creek', note: 'Fuller flow', blurb: 'A creek in Boulder, Colorado. A fuller, rushing flow.', gain: 1.45, sample: { file: 'sounds/stream-b.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'daytondaft via Radio Aporee (archive.org aporee_16764_19506), Public Domain Mark' } },
  ],
  fire: [
    { id: 'a', label: 'Fireplace close-up', note: 'Indoor, close', blurb: 'A fireplace heard up close in an old house in Kłodzko, Poland. Hiss and crackle.', gain: 1.97, sample: { file: 'sounds/fire-a.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Piotrek Zyla via Radio Aporee (archive.org aporee_60408_69386), Public Domain Mark' } },
    { id: 'b', label: 'Settled fireplace', note: 'Low, calm', blurb: 'A calm fireplace, mostly low warmth with gentle crackling.', gain: 2.39, sample: { file: 'sounds/fire-b.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'inchadney via Freesound and archive.org FireFavorite, CC0' } },
  ],
  night: [
    { id: 'a', label: 'Crickets in the south', note: 'Bright chorus', blurb: 'Night crickets at Les Cluses in the south of France. A bright, even chorus.', gain: 1.19, sample: { file: 'sounds/night-a.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Jillis Molenaar via Radio Aporee (archive.org aporee_70514_82218), Public Domain Mark' } },
    { id: 'b', label: 'Crickets by the sea', note: 'Close, lively', blurb: 'Crickets on a seafront promenade in Split, Croatia. Closer and livelier.', gain: 1.2, sample: { file: 'sounds/night-b.mp3', loopStart: 0.5, loopEnd: 75.5, credit: 'Nicolas Germain via Radio Aporee (archive.org aporee_45692_51884), Public Domain Mark' } },
  ],
  focus: [
    { id: 'a', label: 'One anchor', note: '108 Hz', blurb: 'A single low 108 Hz sine, without the pad, noise, pulse or stereo motion.', gain: 3.13, synth: { tone: 108 } },
    { id: 'b', label: 'Open fifth', note: '108 and 162 Hz', blurb: 'Two quiet, fixed sines a plain open fifth apart, without pulsing.', gain: 3.48, synth: { tone: 108, second: 162 } },
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
