import type { SoundCategory, SoundId } from './types.js';

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
    blurb: 'Steady rainfall on a quiet street.',
    detail: 'Synthesised: filtered hiss for the fall plus randomly timed droplets for texture.',
    gain: 1, defaultLevel: 0.5, strand: { width: 1.3, spacing: 2.8, texture: 'drops' },
    family: 'Nature', tone: [0.35, 0.75, 0.9],
  },
  ocean: {
    id: 'ocean', label: 'Ocean', name: 'Ocean', category: 'continuous', color: '#4FCDB3',
    blurb: 'Slow waves that come and go.',
    detail: 'Low noise shaped by irregular 8–13 second swells that brighten at the crest.',
    gain: 0.85, defaultLevel: 0.5, strand: { width: 1.8, spacing: 3.2, texture: 'swell' },
    family: 'Nature', tone: [0.9, 0.6, 0.35],
  },
  wind: {
    id: 'wind', label: 'Wind', name: 'Wind', category: 'continuous', color: '#F1D27E',
    blurb: 'Soft gusts moving through open air.',
    detail: 'Noise through a slowly wandering resonant filter, with gusts that rise and settle every few seconds.',
    gain: 1.05, defaultLevel: 0.45, strand: { width: 0.9, spacing: 2.4, texture: 'silk' },
    family: 'Nature', tone: [0.55, 0.8, 0.45],
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
    // Matches the level the synthesised stream used to play at.
    gain: 1.67, defaultLevel: 0.5, strand: { width: 1.1, spacing: 2.2, texture: 'ripple' },
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
    blurb: 'Crickets in warm grass, far off.',
    detail: 'Three crickets at different pitches and rates, each trilling and pausing on its own, over a faint dark bed.',
    gain: 0.9, defaultLevel: 0.4, strand: { width: 1, spacing: 2.6, texture: 'drops' },
    family: 'Nature', tone: [0.15, 0.3, 1],
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

export const isSoundId = (value: unknown): value is SoundId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SOUNDS, value);

/** Perceptual curve from the 0–1 intensity slider to linear gain. */
export const levelGain = (level: number) => (level <= 0 ? 0 : Math.pow(level, 1.7));
