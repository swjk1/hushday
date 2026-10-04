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
    gain: 0.9, defaultLevel: 0.53, strand: { width: 2.2, spacing: 3.4, texture: 'smooth' },
    family: 'Noise', tone: [1, 0.45, 0.12],
  },
  red: {
    id: 'red', label: 'Red', name: 'Red noise', category: 'continuous', color: '#E3776A',
    blurb: 'Deeper than brown. A slow, heavy rumble.',
    detail: 'Brown noise with its highs rolled off further, so nearly all the energy sits in the deep lows.',
    gain: 1, defaultLevel: 0.49, strand: { width: 2.8, spacing: 4.2, texture: 'heavy' },
    family: 'Noise', tone: [1, 0.25, 0.05],
  },
  pink: {
    id: 'pink', label: 'Pink', name: 'Pink noise', category: 'continuous', color: '#F0A3C4',
    blurb: 'Balanced and even. Good all-rounder.',
    detail: 'Equal energy per octave (about 3 dB per octave roll-off). Close to how we hear balance.',
    gain: 0.95, defaultLevel: 0.41, strand: { width: 1.5, spacing: 2.6, texture: 'ripple' },
    family: 'Noise', tone: [0.8, 0.72, 0.6],
  },
  white: {
    id: 'white', label: 'White', name: 'White noise', category: 'continuous', color: '#E9EEF4',
    blurb: 'Bright and crisp. Masks voices.',
    detail: 'Flat spectrum, equal energy at every frequency. Best kept low under other layers.',
    gain: 0.55, defaultLevel: 0.29, strand: { width: 0.9, spacing: 1.8, texture: 'grain' },
    family: 'Noise', tone: [0.55, 0.8, 1],
  },
  tone432: {
    id: 'tone432', label: '432 Hz', name: '432 Hz tone', category: 'continuous', color: '#9F8CFF',
    blurb: 'A steady, mellow tone. Just under A.',
    detail: 'A pure sine wave at 432 Hz, identical in both ears. No noise, no drift. Keep it low under other layers.',
    gain: 0.45, defaultLevel: 0.29, freq: 432, strand: { width: 1.4, spacing: 2.8, texture: 'tone' },
    family: 'Tone', tone: [0.1, 1, 0.15],
  },
  tone528: {
    id: 'tone528', label: '528 Hz', name: '528 Hz tone', category: 'continuous', color: '#E8A0FF',
    blurb: 'A steady, brighter tone. A touch above C.',
    detail: 'A pure sine wave at 528 Hz, identical in both ears. No noise, no drift. Keep it low under other layers.',
    gain: 0.42, defaultLevel: 0.29, freq: 528, strand: { width: 1.2, spacing: 2.4, texture: 'tone' },
    family: 'Tone', tone: [0.08, 1, 0.25],
  },
  rain: {
    id: 'rain', label: 'Rain', name: 'Rain', category: 'continuous', color: '#78B1EA',
    blurb: 'Rain falling on a canopy, close by.',
    detail: 'A real recording of rain falling on a canopy in Halenfeld, Germany, looped seamlessly every minute. By Matthes via Radio Aporee, public domain.',
    // Calibrated (ITU-R BS.1770) toward this sound's loudness, raised no further than keeps its loudest moment under full scale.
    gain: 2.507, defaultLevel: 0.41, strand: { width: 1.3, spacing: 2.8, texture: 'drops' },
    family: 'Nature', tone: [0.35, 0.75, 0.9],
    sample: { file: 'sounds/rain.mp3', loopStart: 0.5, loopEnd: 60.5, credit: 'Matthes via Radio Aporee (archive.org aporee_23977_27849), Public Domain Mark' },
  },
  ocean: {
    id: 'ocean', label: 'Ocean', name: 'Ocean', category: 'continuous', color: '#4FCDB3',
    blurb: 'Ocean waves rolling in and drawing back.',
    detail: 'A real recording of ocean waves, looped seamlessly every 63 seconds, otherwise untouched. By Noted451 via Freesound, CC0.',
    // Calibrated (ITU-R BS.1770) toward this sound's loudness, raised no further than keeps its loudest moment under full scale.
    gain: 1.405, defaultLevel: 0.41, strand: { width: 1.8, spacing: 3.2, texture: 'swell' },
    family: 'Nature', tone: [0.9, 0.6, 0.35],
    sample: { file: 'sounds/ocean-waves.mp3', loopStart: 0.5, loopEnd: 63.5, credit: 'Noted451 via Freesound (freesound.org/s/531015), CC0' },
  },
  wind: {
    id: 'wind', label: 'Wind', name: 'Wind', category: 'continuous', color: '#F1D27E',
    blurb: 'Autumn wind blowing dry leaves along.',
    detail: 'A real recording of autumn wind blowing dry leaves across a pavement, looped seamlessly every 36 seconds, otherwise untouched. By Stek59 via Freesound, CC0.',
    // Calibrated (ITU-R BS.1770) toward this sound's loudness, raised no further than keeps its loudest moment under full scale.
    gain: 2.415, defaultLevel: 0.37, strand: { width: 0.9, spacing: 2.4, texture: 'silk' },
    family: 'Nature', tone: [0.55, 0.8, 0.45],
    sample: { file: 'sounds/wind-leaves.mp3', loopStart: 0.5, loopEnd: 36.5, credit: 'Stek59 via Freesound (freesound.org/s/457318), CC0' },
  },
  fan: {
    id: 'fan', label: 'Fan', name: 'Fan', category: 'continuous', color: '#B0BEC5',
    blurb: 'A quiet motor under a trace of soft air.',
    detail: 'One low 108 Hz motor tone under soft, low-passed air. No wobble, no extra harmonics. Nothing changes, which is the point.',
    gain: 4.87, defaultLevel: 0.41, strand: { width: 1.6, spacing: 3, texture: 'smooth' },
    family: 'Noise', tone: [0.75, 0.7, 0.2],
    synth: { tone: 108, toneAmp: 0.7, noise: 'pink', low: 420, amp: 0.55 },
  },
  stream: {
    id: 'stream', label: 'Stream', name: 'Stream', category: 'continuous', color: '#8EE3F5',
    blurb: 'A river rushing over stones, up close.',
    detail: 'A real recording of a river up close. A man talking and a passing hum are cut out; otherwise it is untouched, looped seamlessly every 48 seconds. By jackthemurray via Freesound, CC0.',
    // Calibrated (ITU-R BS.1770) toward this sound's loudness, raised no further than keeps its loudest moment under full scale.
    gain: 0.394, defaultLevel: 0.41, strand: { width: 1.1, spacing: 2.2, texture: 'ripple' },
    family: 'Nature', tone: [0.2, 0.85, 0.7],
    sample: { file: 'sounds/stream-river.mp3', loopStart: 0.5, loopEnd: 48.5, credit: 'jackthemurray via Freesound (freesound.org/s/433589), CC0' },
  },
  fire: {
    id: 'fire', label: 'Fire', name: 'Fire', category: 'continuous', color: '#FF9A3C',
    blurb: 'Wood crackling and cracking in a chimney fire.',
    detail: 'A real recording of a fire in a chimney, wood crackling and cracking, looped seamlessly every 90 seconds, otherwise untouched. Its crackles are sharp, so it plays a little quieter than other sounds; turn it up to taste. By reinsamba via Freesound, CC BY 4.0.',
    // Calibrated (ITU-R BS.1770) toward this sound's loudness, raised no further than keeps its loudest moment under full scale.
    gain: 2.96, defaultLevel: 0.5, strand: { width: 1.3, spacing: 2.6, texture: 'spike' },
    family: 'Nature', tone: [0.9, 0.4, 0.55],
    sample: { file: 'sounds/fire-chimney.mp3', loopStart: 0.5, loopEnd: 90.5, credit: '“chimney fire” by reinsamba (freesound.org/s/18766), CC BY 4.0; looped, volume adjusted' },
  },
  night: {
    id: 'night', label: 'Night', name: 'Night crickets', category: 'continuous', color: '#5DBF8A',
    blurb: 'Crickets at night in a village in Laos.',
    detail: 'A real recording of crickets at night in a village in Laos. One brief call is cut out; otherwise it is untouched, looped seamlessly every 84 seconds. By caquet via Freesound, CC BY 4.0.',
    // Calibrated (ITU-R BS.1770) toward this sound's loudness, raised no further than keeps its loudest moment under full scale.
    gain: 0.25, defaultLevel: 0.33, strand: { width: 1, spacing: 2.6, texture: 'drops' },
    family: 'Nature', tone: [0.15, 0.3, 1],
    sample: { file: 'sounds/night-laos.mp3', loopStart: 0.5, loopEnd: 84.5, credit: '“Crickets in the night” by caquet (freesound.org/s/221164), CC BY 4.0; one call cut, looped, volume adjusted' },
  },
  gulls: {
    id: 'gulls', label: 'Seagulls', name: 'Seagulls', category: 'continuous', color: '#D8C7A0',
    blurb: 'Seagulls calling over a North Sea beach.',
    detail: 'A real recording of seagulls on a sandy beach near Scheveningen in the Netherlands, looped seamlessly every 36 seconds, otherwise untouched. By Eelke via Freesound, CC BY 4.0.',
    // Calibrated (ITU-R BS.1770) to sit like Night: a bright layer over everything else.
    gain: 0.48, defaultLevel: 0.33, strand: { width: 1, spacing: 2.8, texture: 'drops' },
    family: 'Nature', tone: [0.3, 0.6, 0.8],
    sample: { file: 'sounds/gulls.mp3', loopStart: 0.5, loopEnd: 36.5, credit: '“seagulls” by Eelke (freesound.org/s/144835), CC BY 4.0; cut, looped, volume adjusted' },
  },
  focus: {
    id: 'focus', label: 'Focus', name: 'Focus audio', category: 'functional', color: '#C6E86A',
    blurb: 'A short, driving pulse to lock in.',
    detail: 'A warm two-note pad over low-passed noise, with a rounded pulse of about 10 per second that rocks gently between the ears. Works on speakers or headphones; keep it low to medium.',
    gain: 0.8, defaultLevel: 0.49, strand: { width: 1.6, spacing: 3, texture: 'pulse' },
    family: 'Function', tone: [0.45, 0.95, 0.4],
  },
  zen: {
    id: 'zen', label: 'Zen', name: 'Zen', category: 'continuous', color: '#B7C4F4',
    blurb: 'Two low, still tones a fifth apart.',
    detail: 'Two quiet, fixed sines at 108 and 162 Hz, a plain open fifth, with no pulse or drift. Calm under anything.',
    gain: 3.48, defaultLevel: 0.49, strand: { width: 1.4, spacing: 2.8, texture: 'tone' },
    family: 'Tone', tone: [0.95, 0.2, 0],
    synth: { tone: 108, second: 162 },
  },
  quiet: {
    id: 'quiet', label: 'Quiet', name: 'Quiet section', category: 'quiet', color: '#9AABB3',
    blurb: 'A pause. The sounds under it drop away.',
    detail: 'Dropped onto sounds, it fades just those down for its length, then brings them back. On a track of its own, it fades everything.',
    gain: 0, defaultLevel: 1, strand: { width: 1, spacing: 3, texture: 'none' },
    family: 'Space', tone: [0, 0, 0],
  },
};

export const SOUND_ORDER: SoundId[] = ['brown', 'red', 'pink', 'white', 'tone432', 'tone528', 'fan', 'rain', 'ocean', 'wind', 'stream', 'fire', 'night', 'gulls', 'focus', 'zen', 'quiet'];

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
    { id: 'b', label: 'Heavy rain', note: 'Dense, steady', blurb: 'Heavy rain in Egå, Denmark. A fuller, denser downpour.', gain: 2.29, sample: { file: 'sounds/rain-b.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'audiotraction via Radio Aporee (archive.org aporee_58354_66946), Public Domain Mark' } },
  ],
  // Ids are never reused: earlier, retired versions of Wind and Stream were 'a' and 'b', and Stream's 'e' (a river)
  // became its original. 'f' is the sound's previous original, kept as a version.
  wind: [
    { id: 'f', label: 'Reeds', note: 'Rustling, whistling', blurb: 'Wind moving softly through reeds in Copenhagen.', gain: 3.035, sample: { file: 'sounds/wind.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Alessandro Altavilla via Radio Aporee (archive.org aporee_14720_17165), Public Domain Mark' } },
    { id: 'c', label: 'Windy forest', note: 'Trees, gusting', blurb: 'A very windy day in a forest at Sälsten, Sweden: wind roaring through the treetops in long waves.', gain: 1.85, sample: { file: 'sounds/wind-c.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'a Radio Aporee recordist (archive.org aporee_51051_58278), Public Domain Mark' } },
    { id: 'd', label: 'Strong wind', note: 'Deep, rushing', blurb: 'Strong wind across the Lower Geyser Basin in Yellowstone. Deep and dark, a steady rush with no hiss.', gain: 1.192, sample: { file: 'sounds/wind-d.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'NPS/Peter Comley, Yellowstone National Park Sound Library (archive.org nps-yell-sounds-soundscapes), Public Domain Mark' } },
    { id: 'e', label: 'Howling wind', note: 'Wires, hedgerows', blurb: 'A wild day in Cornwall: wind howling over wires and through the hedgerows.', gain: 1.209, sample: { file: 'sounds/wind-e.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'djake via Radio Aporee (archive.org aporee_30717_35328), Public Domain Mark' } },
  ],
  stream: [
    { id: 'f', label: 'Creek', note: 'Soft, flowing', blurb: 'A creek in Boulder, Colorado, flowing softly.', gain: 1.29, sample: { file: 'sounds/stream.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'daytondaft via Radio Aporee (archive.org aporee_16764_19506), Public Domain Mark' } },
    { id: 'c', label: 'Babbling brook', note: 'Close, bubbly', blurb: 'The Krčnik stream in Slovenia, recorded up close. Lively bubbling and trickling.', gain: 1.58, sample: { file: 'sounds/stream-c.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Bojan Marusic via Radio Aporee (archive.org aporee_50749_57876), Public Domain Mark' } },
    { id: 'd', label: 'Snowmelt brook', note: 'Small, trickling', blurb: 'A small brook running through thawing snow in Alytus, Lithuania. Clear and trickling.', gain: 1.21, sample: { file: 'sounds/stream-d.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Martynas Baranauskas via Radio Aporee (archive.org aporee_71794_83851), Public Domain Mark' } },
  ],
  ocean: [
    { id: 'f', label: 'Close waves', note: 'Close, rolling', blurb: 'Waves rolling in close on Klong Muang beach in Thailand.', gain: 1.75, sample: { file: 'sounds/ocean.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Felix Blume via Radio Aporee (archive.org aporee_47950_54511), Public Domain Mark' } },
  ],
  fire: [
    { id: 'f', label: 'Fireplace', note: 'Warm, gentle', blurb: 'A calm fireplace, mostly low warmth with gentle crackle.', gain: 1.696, sample: { file: 'sounds/fire.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'inchadney via Freesound and archive.org FireFavorite, CC0' } },
  ],
  night: [
    { id: 'f', label: 'Cricket chorus', note: 'Bright, even', blurb: 'A bright, even chorus of crickets at Les Cluses in the south of France.', gain: 0.324, sample: { file: 'sounds/night.mp3', loopStart: 0.5, loopEnd: 90.5, credit: 'Jillis Molenaar via Radio Aporee (archive.org aporee_70514_82218), Public Domain Mark' } },
  ],
};
for (const [id, list] of Object.entries(VARIANTS)) SOUNDS[id as SoundId].variants = list;

/** The alternative version a block plays, or null for the original. */
export const variantOf = (sound: SoundId, variant: VariantId | undefined): SoundVariant | null =>
  (variant && SOUNDS[sound].variants?.find(v => v.id === variant)) || null;

/** Display name of a block's version: the variant's label, or "Original". */
export const variantLabel = (sound: SoundId, variant: VariantId | undefined) => variantOf(sound, variant)?.label ?? 'Original';

/** The letter a version is shown with: the original is A, then B, C, D in the order offered (stored ids can skip retired ones). */
export const variantMark = (sound: SoundId, variant: VariantId | undefined) => {
  const i = variant ? SOUNDS[sound].variants?.findIndex(v => v.id === variant) ?? -1 : -1;
  return i < 0 ? 'A' : String.fromCharCode(66 + i);
};

export const isSoundId = (value: unknown): value is SoundId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SOUNDS, value);

/** Perceptual curve from the 0–1 intensity slider to linear gain. */
export const levelGain = (level: number) => (level <= 0 ? 0 : Math.pow(level, 1.7));
