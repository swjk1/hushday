// hushday sound generators. One processor per Mix component; everything is synthesised
// live so continuous layers never loop audibly. Output is stereo with decorrelated channels.

const TAU = Math.PI * 2;

function makeRng(seed) {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function channel(seed) {
  return { rnd: makeRng(seed), b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0, brown: 0, lp: 0, lp2: 0, drop: 0, decay: 0.995, dropLp: 0, prev: 0, hp: 0, low: 0, band: 0 };
}

function white(c) { return c.rnd() * 2 - 1; }

function pink(c, w) {
  c.b0 = 0.99886 * c.b0 + w * 0.0555179;
  c.b1 = 0.99332 * c.b1 + w * 0.0750759;
  c.b2 = 0.969 * c.b2 + w * 0.153852;
  c.b3 = 0.8665 * c.b3 + w * 0.3104856;
  c.b4 = 0.55 * c.b4 + w * 0.5329522;
  c.b5 = -0.7616 * c.b5 - w * 0.016898;
  const out = (c.b0 + c.b1 + c.b2 + c.b3 + c.b4 + c.b5 + c.b6 + w * 0.5362) * 0.11;
  c.b6 = w * 0.115926;
  return out;
}

function brown(c, w) {
  c.brown = (c.brown + 0.02 * w) / 1.02;
  return c.brown * 3.5;
}

// Brown with a further one-pole low-pass (~250 Hz): almost all energy in the deep lows.
function red(c, w) {
  const b = brown(c, w);
  c.lp2 += (b - c.lp2) * 0.032;
  return c.lp2 * 1.4;
}

class HushGenerator extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.type = o.type || 'pink';
    const seed = (o.seed || 1) >>> 0;
    this.ch = [channel(seed * 2654435761), channel((seed + 7919) * 2246822519)];
    this.shared = makeRng(seed ^ 0x5bd1e995);
    // Pure tone: a fixed pitch in Hz, identical in both channels so headphones hear no beating.
    this.freq = Number(o.freq) > 0 ? Number(o.freq) : 0;
    this.phase = this.shared();
    this.alive = true;
    this.port.onmessage = event => { if (event.data === 'stop') this.alive = false; };
    this.dt = 1 / sampleRate;
    this.t = 0;
    // Ocean swell state
    this.swellPhase = this.shared();
    this.swellPeriod = 8 + this.shared() * 5;
    // Wind: a wandering filter centre and a gust envelope, both slow random walks.
    this.gust = 0.5;
    this.gustTarget = 0.6;
    this.centre = 450;
    this.centreTarget = 450;
    // Rain intensity drift
    this.rainDrift = 0.5;
    this.rainTarget = 0.5;
    // Night: three crickets at different pitches, rates and positions, each pausing now and then.
    this.crickets = [
      { f: 4100, rate: 2.1, trill: 34, len: 0.42, pan: 0.25, phase: this.shared(), on: true },
      { f: 4650, rate: 1.7, trill: 28, len: 0.5, pan: 0.78, phase: this.shared(), on: true },
      { f: 3750, rate: 2.7, trill: 41, len: 0.3, pan: 0.5, phase: this.shared(), on: false },
    ];
  }

  swell() {
    this.swellPhase += this.dt / this.swellPeriod;
    if (this.swellPhase >= 1) {
      this.swellPhase -= 1;
      this.swellPeriod = 8 + this.shared() * 5;
    }
    const p = this.swellPhase;
    // Quick rise, long fall.
    const s = p < 0.35 ? Math.sin((Math.PI / 2) * (p / 0.35)) : Math.cos((Math.PI / 2) * ((p - 0.35) / 0.65));
    return s * s;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] || out[0];
    const n = left.length;
    const type = this.type;

    for (let i = 0; i < n; i++) {
      let l = 0;
      let r = 0;
      if (type === 'white') {
        l = white(this.ch[0]) * 0.25;
        r = white(this.ch[1]) * 0.25;
      } else if (type === 'pink') {
        l = pink(this.ch[0], white(this.ch[0]));
        r = pink(this.ch[1], white(this.ch[1]));
      } else if (type === 'brown') {
        l = brown(this.ch[0], white(this.ch[0]));
        r = brown(this.ch[1], white(this.ch[1]));
        const mid = (l + r) * 0.5;
        l = mid * 0.6 + l * 0.4;
        r = mid * 0.6 + r * 0.4;
      } else if (type === 'red') {
        l = red(this.ch[0], white(this.ch[0]));
        r = red(this.ch[1], white(this.ch[1]));
        const mid = (l + r) * 0.5;
        l = mid * 0.7 + l * 0.3;
        r = mid * 0.7 + r * 0.3;
      } else if (this.freq) {
        // Phase accumulates in cycles and wraps, so long sessions never lose precision.
        this.phase += this.freq * this.dt;
        if (this.phase >= 1) this.phase -= 1;
        l = r = Math.sin(TAU * this.phase) * 0.5;
      } else if (type === 'wind') {
        if (i === 0) {
          if (this.shared() < 0.006) this.gustTarget = 0.4 + this.shared() * 0.6;
          if (this.shared() < 0.004) this.centreTarget = 240 + this.shared() * 700;
          this.gust += (this.gustTarget - this.gust) * 0.004;
          this.centre += (this.centreTarget - this.centre) * 0.002;
        }
        for (let k = 0; k < 2; k++) {
          const c = this.ch[k];
          const x = pink(c, white(c));
          // State-variable band-pass; the two channels sit slightly apart for width.
          const f = 2 * Math.sin((Math.PI * this.centre * (k ? 1.08 : 0.94)) / sampleRate);
          c.low += f * c.band;
          const high = x - c.low - 0.55 * c.band;
          c.band += f * high;
          // Gusts swing the level by about half rather than fivefold, so the bed stays steady.
          const v = (c.band * 1.6 + c.low * 0.35) * (0.5 + 0.5 * this.gust);
          if (k === 0) l = v; else r = v;
        }
      } else if (type === 'rain') {
        if (i === 0) {
          if (this.shared() < 0.004) this.rainTarget = 0.3 + this.shared() * 0.7;
          this.rainDrift += (this.rainTarget - this.rainDrift) * 0.01;
        }
        const density = (40 + 90 * this.rainDrift) * this.dt;
        for (let k = 0; k < 2; k++) {
          const c = this.ch[k];
          const w = white(c);
          const p = pink(c, w);
          c.lp += (p - c.lp) * 0.08;
          const hiss = (p - c.lp) * 1.1;
          if (c.rnd() < density) {
            c.drop = 0.25 + c.rnd() * 0.75;
            c.decay = 0.991 + c.rnd() * 0.007;
          }
          c.drop *= c.decay;
          const w2 = white(c);
          c.dropLp += (w2 - c.dropLp) * 0.35;
          const drop = c.drop * (w2 - c.dropLp) * 0.55;
          const body = brown(c, w) * 0.18;
          const v = hiss * (0.55 + 0.25 * this.rainDrift) + drop + body;
          if (k === 0) l = v; else r = v;
        }
      } else if (type === 'ocean') {
        const s = this.swell();
        // Waves swing between about half and full rather than near-silence and full.
        const env = 0.52 + 0.48 * s;
        const k = 0.03 + 0.08 * s;
        for (let j = 0; j < 2; j++) {
          const c = this.ch[j];
          const w = white(c);
          const noise = brown(c, w) * 0.75 + pink(c, w) * 0.6;
          c.lp += (noise - c.lp) * k;
          c.lp2 += (c.lp - c.lp2) * 0.5;
          const foam = (noise - c.lp) * s * s * s * 0.16;
          const v = (c.lp2 * 1.5 + foam) * env;
          if (j === 0) l = v; else r = v;
        }
      } else if (type === 'fan') {
        const t = this.t;
        // Motor hum with a couple of harmonics and a faint blade-pass wobble, the same in both ears.
        const wobble = 1 + 0.12 * Math.sin(TAU * 23.5 * t);
        const hum = (0.5 * Math.sin(TAU * 118 * t) + 0.22 * Math.sin(TAU * 236 * t) + 0.08 * Math.sin(TAU * 354 * t)) * wobble;
        for (let k = 0; k < 2; k++) {
          const c = this.ch[k];
          // Air rush: pink noise low-passed around 900 Hz, steady.
          c.lp += (pink(c, white(c)) - c.lp) * 0.11;
          const v = hum * 0.22 + c.lp * 1.5;
          if (k === 0) l = v; else r = v;
        }
      } else if (type === 'night') {
        const t = this.t;
        if (i === 0) {
          for (const cr of this.crickets) if (this.shared() < 0.0025) cr.on = !cr.on;
        }
        // A faint, dark bed so the chirps sit in something.
        for (let k = 0; k < 2; k++) {
          const c = this.ch[k];
          c.lp += (pink(c, white(c)) - c.lp) * 0.04;
          if (k === 0) l = c.lp * 0.9; else r = c.lp * 0.9;
        }
        for (const cr of this.crickets) {
          if (!cr.on) continue;
          const cycle = 1 / cr.rate;
          const tt = ((t * cr.rate + cr.phase) % 1) * cycle;
          if (tt >= cr.len) continue;
          // Each chirp is a short tone burst, itself pulsing (the trill), rounded at both ends.
          const env = Math.sin((Math.PI * tt) / cr.len) * (0.5 + 0.5 * Math.sin(TAU * cr.trill * tt));
          const v = env * Math.sin(TAU * cr.f * t) * 0.09;
          l += v * (1 - cr.pan);
          r += v * cr.pan;
        }
      } else if (type === 'focus') {
        const t = this.t;
        const drift = 0.88 + 0.12 * Math.sin(TAU * 0.04 * t);
        // A warm two-note pad (A2 + E3 with a whisper of the octave), barely detuned between
        // ears so it shimmers without an audible beat.
        const padL = 0.5 * Math.sin(TAU * 110 * t) + 0.3 * Math.sin(TAU * 164.81 * t) + 0.12 * Math.sin(TAU * 220 * t);
        const padR = 0.5 * Math.sin(TAU * 110.15 * t) + 0.3 * Math.sin(TAU * 164.96 * t) + 0.12 * Math.sin(TAU * 220.15 * t);
        // Rounded pulse at 10 per second, 40% deep, a quarter cycle apart in each ear so it
        // rocks gently instead of hammering. The pad is pulsed less than the noise.
        const pl = 0.5 - 0.5 * Math.cos(TAU * 10 * t);
        const pr = 0.5 - 0.5 * Math.cos(TAU * 10 * t - Math.PI / 2);
        // Low-passed pink noise: a warmer bed than raw pink, with the fizz taken off.
        const c0 = this.ch[0];
        const c1 = this.ch[1];
        c0.lp += (pink(c0, white(c0)) - c0.lp) * 0.06;
        c1.lp += (pink(c1, white(c1)) - c1.lp) * 0.06;
        l = padL * 0.3 * drift * (1 - 0.15 * pl) + c0.lp * 1.7 * (1 - 0.4 * pl);
        r = padR * 0.3 * drift * (1 - 0.15 * pr) + c1.lp * 1.7 * (1 - 0.4 * pr);
      }
      left[i] = l;
      if (right !== left) right[i] = r;
      this.t += this.dt;
    }
    return this.alive;
  }
}

registerProcessor('hush-gen', HushGenerator);
