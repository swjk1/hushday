import type { SoundCategory, SoundId } from './types.js';

export type StrandTexture = 'smooth' | 'heavy' | 'ripple' | 'grain' | 'spike' | 'drops' | 'swell' | 'silk' | 'pulse' | 'none';

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
  family: 'Noise' | 'Nature' | 'Function' | 'Space';
  /** Rough share of energy in the lows, mids and highs (0–1), drawn as a tone meter. */
  tone: [low: number, mid: number, high: number];
}

export const SOUNDS: Record<SoundId, SoundDef> = {
  brown: {
    id: 'brown', label: 'Brown', name: 'Brown noise', category: 'continuous', color: '#D9A478',
    blurb: 'Deep and warm. Soaks up low rumble.',
    detail: 'Integrated random noise. Energy falls about 6 dB per octave, so it sits low and soft.',
    gain: 0.9, defaultLevel: 0.75, strand: { width: 2.2, spacing: 3.4, texture: 'smooth' },
    family: 'Noise', tone: [1, 0.45, 0.12],
  },
  red: {
    id: 'red', label: 'Red', name: 'Red noise', category: 'continuous', color: '#E3776A',
    blurb: 'Deeper than brown. A slow, heavy rumble.',
    detail: 'Brown noise with its highs rolled off further, so nearly all the energy sits in the deep lows.',
    gain: 1, defaultLevel: 0.7, strand: { width: 2.8, spacing: 4.2, texture: 'heavy' },
    family: 'Noise', tone: [1, 0.25, 0.05],
  },
  pink: {
    id: 'pink', label: 'Pink', name: 'Pink noise', category: 'continuous', color: '#F0A3C4',
    blurb: 'Balanced and even. Good all-rounder.',
    detail: 'Equal energy per octave (about 3 dB per octave roll-off). Close to how we hear balance.',
    gain: 0.95, defaultLevel: 0.6, strand: { width: 1.5, spacing: 2.6, texture: 'ripple' },
    family: 'Noise', tone: [0.8, 0.72, 0.6],
  },
  white: {
    id: 'white', label: 'White', name: 'White noise', category: 'continuous', color: '#E9EEF4',
    blurb: 'Bright and crisp. Masks voices.',
    detail: 'Flat spectrum, equal energy at every frequency. Best kept low under other layers.',
    gain: 0.55, defaultLevel: 0.4, strand: { width: 0.9, spacing: 1.8, texture: 'grain' },
    family: 'Noise', tone: [0.55, 0.8, 1],
  },
  hifreq: {
    id: 'hifreq', label: 'Hi-freq', name: 'High-frequency noise', category: 'continuous', color: '#AD95FF',
    blurb: 'Sharp and airy. Cuts through chatter.',
    detail: 'Blue-leaning noise: energy rises with frequency, so it sits high and bright. Keep it low.',
    gain: 0.6, defaultLevel: 0.35, strand: { width: 1, spacing: 2.2, texture: 'spike' },
    family: 'Noise', tone: [0.1, 0.45, 1],
  },
  rain: {
    id: 'rain', label: 'Rain', name: 'Rain', category: 'continuous', color: '#78B1EA',
    blurb: 'Steady rainfall on a quiet street.',
    detail: 'Synthesised: filtered hiss for the fall plus randomly timed droplets for texture.',
    gain: 1, defaultLevel: 0.6, strand: { width: 1.3, spacing: 2.8, texture: 'drops' },
    family: 'Nature', tone: [0.35, 0.75, 0.9],
  },
  ocean: {
    id: 'ocean', label: 'Ocean', name: 'Ocean', category: 'continuous', color: '#4FCDB3',
    blurb: 'Slow waves that come and go.',
    detail: 'Low noise shaped by irregular 8–13 second swells that brighten at the crest.',
    gain: 1, defaultLevel: 0.6, strand: { width: 1.8, spacing: 3.2, texture: 'swell' },
    family: 'Nature', tone: [0.9, 0.6, 0.35],
  },
  wind: {
    id: 'wind', label: 'Wind', name: 'Wind', category: 'continuous', color: '#F1D27E',
    blurb: 'Soft gusts moving through open air.',
    detail: 'Noise through a slowly wandering resonant filter, with gusts that rise and settle every few seconds.',
    gain: 1.2, defaultLevel: 0.55, strand: { width: 0.9, spacing: 2.4, texture: 'silk' },
    family: 'Nature', tone: [0.55, 0.8, 0.45],
  },
  focus: {
    id: 'focus', label: 'Focus', name: 'Focus audio', category: 'functional', color: '#C6E86A',
    blurb: 'A short, driving pulse to lock in.',
    detail: 'A soft tonal pad and noise with fast rhythmic amplitude modulation (about 16 pulses per second). Works on speakers or headphones; keep it low to medium.',
    gain: 0.8, defaultLevel: 0.7, strand: { width: 1.6, spacing: 3, texture: 'pulse' },
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

export const SOUND_ORDER: SoundId[] = ['brown', 'red', 'pink', 'white', 'hifreq', 'rain', 'ocean', 'wind', 'focus', 'quiet'];

export const isSoundId = (value: unknown): value is SoundId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SOUNDS, value);

/** Perceptual curve from the 0–1 intensity slider to linear gain. */
export const levelGain = (level: number) => (level <= 0 ? 0 : Math.pow(level, 1.7));
