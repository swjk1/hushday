import { blendGainAt, planBlend, type BlendPlan } from '../core/blend';
import { SOUNDS, levelGain, variantOf } from '../core/sounds';
import { breakpointTimes, duckAt, envelopeAt, isQuiet, positionAt, quietBreakpointTimes } from '../core/timeline';
import type { MixComponent, MixDraft } from '../core/types';

export type SessionKind = 'zone' | 'play' | 'short' | 'preview';
export type Status = 'idle' | 'playing' | 'paused' | 'complete';

export interface SessionInfo {
  kind: SessionKind;
  /** Curated, user or ShortExperience id. */
  sourceId: string;
  mix: MixDraft;
  /** Total listening time for the session; null means until stopped. */
  totalSec: number | null;
  zoneId?: string;
  selectedMinutes?: number | null;
}

export interface Snapshot { status: Status; info: SessionInfo | null }

interface Live {
  voices: { id: string; sound: string; variant: string; node: AudioNode; stop: () => void; gain: GainNode; blend: GainNode }[];
  bus: GainNode;
  session: GainNode;
  /** Context time at which elapsed === base. */
  anchor: number;
  base: number;
}

/** The recorded loop a block plays: its version's, or the original's if it plays the original. */
function recordingOf(c: MixComponent) {
  const variant = variantOf(c.sound, c.variant);
  return variant ? variant.sample ?? null : SOUNDS[c.sound].sample ?? null;
}

/** How long Auto-Blend takes to glide to new values when the arrangement or the toggle changes mid-play. */
const BLEND_GLIDE_SEC = 1.5;

/** Lays a block's Auto-Blend gain onto the audio clock: the planned cut and makeup, or a steady 1 when off. */
function scheduleBlend(param: AudioParam, plan: BlendPlan | null, c: MixComponent, mix: MixDraft, start: number, offset: number, until: number, glide = 0) {
  const times = plan?.voices[c.id]?.times ?? [0, mix.lengthSec];
  scheduleCurve(param, mix, start, offset, until, times, t => blendGainAt(plan, c.id, t), glide);
}

/** Scheduling horizon for "until stopped". Audio stays correct even if timers are throttled. */
const HORIZON_SEC = 12 * 3600;
const FADE_IN_SEC = 2.5;

function seedOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}

/**
 * Lays a piecewise-linear curve for one AudioParam onto the audio clock, pass after pass,
 * from `offset` seconds into the session until `until` (context time). Because everything is
 * pre-scheduled, pausing is just suspending the context, and backgrounded tabs keep playing
 * correctly without JavaScript running.
 */
function scheduleCurve(param: AudioParam, mix: MixDraft, start: number, offset: number, until: number, times: number[], valueAt: (t: number) => number, glide = 0) {
  const L = mix.lengthSec;
  const { pos, pass, sustaining } = positionAt(mix, offset);
  param.cancelScheduledValues(0);
  if (glide > 0) {
    // Retuning a live session: slide from wherever the param is now instead of jumping.
    param.setValueAtTime(param.value, start);
    param.linearRampToValueAtTime(valueAt(pos), start + glide);
  } else {
    param.setValueAtTime(valueAt(pos), start);
  }
  if (sustaining) return;
  let passStart = start - pos;
  for (let p = pass; passStart < until; p++, passStart += L) {
    for (const t of times) {
      const at = passStart + t;
      if (at <= start) continue;
      if (at > until) return;
      param.linearRampToValueAtTime(valueAt(t), at);
    }
    if (mix.repeat === 'sustain') return;
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private volumeNode: GainNode | null = null;
  private element: HTMLAudioElement | null = null;
  private moduleReady: Promise<void> | null = null;
  private live: Live | null = null;
  private frozen = 0;
  private timer = 0;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = { status: 'idle', info: null };
  private volume = 0.8;
  private analyser: AnalyserNode | null = null;
  private scope = new Float32Array(1024);
  private level = 0;

  /** Hooks for lock-screen / hardware controls, wired by the playback layer. */
  remote: { pause: () => void; resume: () => void; stop: () => void } = {
    pause: () => this.pause(),
    resume: () => void this.resume(),
    stop: () => this.stop(),
  };
  onComplete: ((info: SessionInfo) => void) | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(status: Status, info: SessionInfo | null) {
    this.snapshot = { status, info };
    this.listeners.forEach(listener => listener());
    this.updateMediaSession();
  }

  elapsed(): number {
    const { status } = this.snapshot;
    if (this.live && this.ctx && status === 'playing') return this.live.base + Math.max(0, this.ctx.currentTime - this.live.anchor);
    return this.frozen;
  }

  /** Smoothed loudness of the output, 0 to about 1. Call once per animation frame. */
  loudness(): number {
    if (!this.analyser || this.snapshot.status !== 'playing') return (this.level *= 0.9);
    this.analyser.getFloatTimeDomainData(this.scope);
    let sum = 0;
    for (let i = 0; i < this.scope.length; i++) sum += this.scope[i] * this.scope[i];
    this.level += (Math.min(1, Math.sqrt(sum / this.scope.length) * 6) - this.level) * 0.12;
    return this.level;
  }

  setVolume(value: number) {
    this.volume = value;
    if (this.volumeNode && this.ctx) this.volumeNode.gain.setTargetAtTime(value * value, this.ctx.currentTime, 0.05);
  }

  /** Must run synchronously inside a user gesture on first use (autoplay rules). */
  private wake() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      const volume = ctx.createGain();
      volume.gain.value = this.volume * this.volume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.005;
      limiter.release.value = 0.25;
      // Cut everything below hearing before the limiter. Several sounds (and the stream recording's
      // mic rumble) carry a lot of energy under 20 Hz; left in, it made the limiter pump the level
      // of everything else and can rattle phone speakers.
      let tail: AudioNode = volume;
      for (let i = 0; i < 2; i++) {
        const cut = ctx.createBiquadFilter();
        cut.type = 'highpass';
        cut.frequency.value = 25;
        cut.Q.value = i ? 1.31 : 0.54; // two stages make a steep 4th-order Butterworth
        tail.connect(cut);
        tail = cut;
      }
      tail.connect(limiter);
      // A quiet tap on the output so visuals can follow how loud the sound is right now.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      limiter.connect(analyser);
      this.analyser = analyser;

      // What you hear always goes straight to the speakers. Routing it through a media element
      // instead made Chrome drop and repeat small chunks whenever the element's buffer and the
      // audio graph drifted apart: stutters in the recordings and lurching pitch in pure tones.
      limiter.connect(ctx.destination);
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        // Safari: declare playback so audio continues with the screen locked / app in background.
        try { nav.audioSession.type = 'playback'; } catch { /* older Safari */ }
      } else {
        // Elsewhere a playing media element is what earns lock-screen controls and keeps the page
        // alive in the background. It carries only a whisper of the mix, about 50 dB down, so its
        // own buffering can never be heard.
        const whisper = ctx.createGain();
        whisper.gain.value = 0.003;
        const dest = ctx.createMediaStreamDestination();
        limiter.connect(whisper).connect(dest);
        const element = new Audio();
        element.srcObject = dest.stream;
        element.setAttribute('playsinline', '');
        this.element = element;
      }
      ctx.addEventListener('statechange', () => {
        if ((ctx.state as string) === 'interrupted' && this.snapshot.status === 'playing') this.pause();
      });
      this.moduleReady = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}hush-gen.worklet.js`);
      this.ctx = ctx;
      this.volumeNode = volume;
    }
    void this.ctx.resume();
    void this.element?.play().catch(() => {});
  }

  private samples = new Map<string, Promise<AudioBuffer>>();

  /** Fetches and decodes a recorded loop once; later sessions reuse the decoded audio. */
  private loadSample(file: string): Promise<AudioBuffer> {
    let pending = this.samples.get(file);
    if (!pending) {
      const ctx = this.ctx!;
      pending = fetch(`${import.meta.env.BASE_URL}${file}`)
        .then(res => {
          if (!res.ok) throw new Error(`${file}: ${res.status}`);
          return res.arrayBuffer();
        })
        .then(bytes => ctx.decodeAudioData(bytes));
      // A failed load is forgotten, so the next session tries again (for example once back online).
      pending.catch(() => this.samples.delete(file));
      this.samples.set(file, pending);
    }
    return pending;
  }

  async start(info: SessionInfo, offset = 0) {
    this.wake();
    const ctx = this.ctx!;
    this.teardown(0.35);
    this.frozen = offset;
    this.set('playing', info);
    await this.moduleReady;
    await ctx.resume();
    // Recorded sounds load once and stay decoded; a missing one is skipped rather than failing the session.
    const files = [...new Set(info.mix.components.map(c => recordingOf(c)?.file).filter((f): f is string => !!f))];
    const recorded = await Promise.all(files.map(async f => [f, await this.loadSample(f).catch(() => null)] as const));
    if (this.snapshot.info !== info) return; // superseded while loading
    const buffers = new Map(recorded);

    const mix = info.mix;
    const start = ctx.currentTime + 0.06;
    const until = info.totalSec == null ? start + HORIZON_SEC : start + Math.max(0, info.totalSec - offset);

    const session = ctx.createGain();
    session.connect(this.volumeNode!);
    const bus = ctx.createGain();
    bus.connect(session);

    const voices: Live['voices'] = [];
    // Auto-Blend's plan depends only on the arrangement; it is null when the Mix plays as the original.
    const plan = planBlend(mix);
    for (const c of mix.components) {
      if (isQuiet(c)) continue;
      const def = SOUNDS[c.sound];
      const variant = variantOf(c.sound, c.variant);
      const seed = seedOf(`${info.sourceId}:${c.id}`);
      let node: AudioNode;
      let stop: () => void;
      const recording = recordingOf(c);
      if (recording) {
        const buffer = buffers.get(recording.file);
        if (!buffer) continue;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.loopStart = recording.loopStart;
        src.loopEnd = Math.min(recording.loopEnd, buffer.duration);
        // Each layer enters the recording at its own seeded point, carried on by the elapsed time,
        // so two copies never line up and a resumed session continues roughly where it was.
        const period = src.loopEnd - src.loopStart;
        const into = src.loopStart + (((seed / 4294967296) * period + offset) % period);
        src.start(start, into);
        node = src;
        stop = () => {
          try { src.stop(); } catch { /* already stopped */ }
        };
      } else {
        const gen = new AudioWorkletNode(ctx, 'hush-gen', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
          processorOptions: { type: c.sound, seed, freq: def.freq, synth: variant?.synth ?? def.synth },
        });
        node = gen;
        stop = () => gen.port.postMessage('stop');
      }
      // node → gain (fade × level) → blend (Auto-Blend's small cut and makeup) → bus (quiet sections).
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const blend = ctx.createGain();
      node.connect(gain).connect(blend).connect(bus);
      const peak = levelGain(c.level) * (variant?.gain ?? def.gain);
      scheduleCurve(gain.gain, mix, start, offset, until, breakpointTimes(c, mix), t => envelopeAt(c, t, mix) * peak);
      scheduleBlend(blend.gain, plan, c, mix, start, offset, until);
      voices.push({ id: c.id, sound: c.sound, variant: c.variant ?? '', node, stop, gain, blend });
    }
    scheduleCurve(bus.gain, mix, start, offset, until, quietBreakpointTimes(mix), t => duckAt(mix, t));

    const s = session.gain;
    s.setValueAtTime(0, start);
    s.linearRampToValueAtTime(1, start + FADE_IN_SEC);
    if (info.totalSec != null) {
      const fadeOut = Math.min(10, Math.max(1, (until - start) / 4));
      if (until - fadeOut > start + FADE_IN_SEC) s.setValueAtTime(1, until - fadeOut);
      s.linearRampToValueAtTime(0, until);
    }

    this.live = { voices, bus, session, anchor: start, base: offset };
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 500);
  }

  /**
   * Applies level and timing edits to the playing session in place, gliding to the new values.
   * Returns false when the change needs a fresh start (sounds added, removed or reordered,
   * or a different length or repeat mode).
   */
  retune(mix: MixDraft): boolean {
    const { live, ctx } = this;
    const { status, info } = this.snapshot;
    if (!live || !ctx || !info || status !== 'playing') return false;
    if (mix.lengthSec !== info.mix.lengthSec || mix.repeat !== info.mix.repeat) return false;
    const audible = mix.components.filter(c => !isQuiet(c));
    if (audible.length !== live.voices.length || audible.some((c, i) => live.voices[i].id !== c.id || live.voices[i].sound !== c.sound || live.voices[i].variant !== (c.variant ?? ''))) return false;

    const offset = this.elapsed();
    const start = ctx.currentTime + 0.02;
    const until = info.totalSec == null ? start + HORIZON_SEC : start + Math.max(0, info.totalSec - offset);
    const glide = 0.12;
    const plan = planBlend(mix);
    audible.forEach((c, i) => {
      const peak = levelGain(c.level) * (variantOf(c.sound, c.variant)?.gain ?? SOUNDS[c.sound].gain);
      scheduleCurve(live.voices[i].gain.gain, mix, start, offset, until, breakpointTimes(c, mix), t => envelopeAt(c, t, mix) * peak, glide);
      // Blend changes (moved blocks, or the toggle) glide slowly so a comparison never jumps.
      scheduleBlend(live.voices[i].blend.gain, plan, c, mix, start, offset, until, BLEND_GLIDE_SEC);
    });
    scheduleCurve(live.bus.gain, mix, start, offset, until, quietBreakpointTimes(mix), t => duckAt(mix, t), glide);
    this.set('playing', { ...info, mix });
    return true;
  }

  private tick() {
    const { status, info } = this.snapshot;
    if (status !== 'playing' || !info || info.totalSec == null) return;
    if (this.elapsed() >= info.totalSec) {
      this.frozen = info.totalSec;
      this.teardown(0.1);
      this.set('complete', info);
      this.onComplete?.(info);
    }
  }

  pause() {
    if (this.snapshot.status !== 'playing') return;
    this.frozen = this.elapsed();
    void this.ctx?.suspend();
    this.element?.pause();
    this.set('paused', this.snapshot.info);
  }

  /** Resumes a live session, or rebuilds one restored from storage after a reload. */
  async resume() {
    const { status, info } = this.snapshot;
    if (status !== 'paused' || !info) return;
    if (!this.live) return this.start(info, this.frozen);
    this.wake();
    this.set('playing', info);
  }

  /** Puts a session back in the paused state after a reload, without any audio yet. */
  restore(info: SessionInfo, elapsed: number) {
    this.teardown(0);
    this.frozen = elapsed;
    this.set('paused', info);
  }

  stop() {
    this.teardown(0.6);
    clearInterval(this.timer);
    this.frozen = 0;
    this.set('idle', null);
  }

  /** Clears a finished session so the UI can return to idle. */
  dismiss() {
    if (this.snapshot.status === 'complete') this.set('idle', null);
  }

  private teardown(fade: number) {
    const live = this.live;
    const ctx = this.ctx;
    this.live = null;
    if (!live || !ctx) return;
    // A paused (suspended) context cannot run a fade; cut silently instead of un-pausing.
    if (ctx.state !== 'running') fade = 0;
    const g = live.session.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(0);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    window.setTimeout(() => {
      for (const v of live.voices) {
        v.stop();
        v.node.disconnect();
        v.gain.disconnect();
        v.blend.disconnect();
      }
      live.bus.disconnect();
      live.session.disconnect();
    }, (fade + 0.15) * 1000);
  }

  private updateMediaSession() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const { status, info } = this.snapshot;
    if (!info || status === 'idle') {
      ms.playbackState = 'none';
      ms.metadata = null;
      return;
    }
    const label = { zone: 'Zone', play: 'Mix', short: 'Short', preview: 'Preview' }[info.kind];
    if (ms.metadata?.title !== info.mix.name) {
      ms.metadata = new MediaMetadata({
        title: info.mix.name, artist: `hushday · ${label}`,
        artwork: [{ src: `${import.meta.env.BASE_URL}icon.svg`, sizes: 'any', type: 'image/svg+xml' }],
      });
      ms.setActionHandler('play', () => this.remote.resume());
      ms.setActionHandler('pause', () => this.remote.pause());
      try { ms.setActionHandler('stop', () => this.remote.stop()); } catch { /* unsupported */ }
    }
    ms.playbackState = status === 'playing' ? 'playing' : 'paused';
  }
}

export const engine = new AudioEngine();

if (import.meta.env.DEV) (window as unknown as { __hushEngine: AudioEngine }).__hushEngine = engine;
