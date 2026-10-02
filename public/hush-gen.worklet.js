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

// ---- Simple versions -------------------------------------------------------------------------
// One main texture per sound: fixed sine pitches, a filtered noise wash with an optional slow
// swell, and one rounded event repeating on a fixed period. Built to the "Sound studies" recipe.

// Web Audio's lowpass/highpass Q is in dB; the studies used 0.5, which is a linear Q of about 1.06.
const SIMPLE_Q = Math.pow(10, 0.5 / 20);

function biquad(kind, f) {
  const w = (TAU * Math.min(f, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * SIMPLE_Q);
  const a0 = 1 + alpha;
  const lp = kind === 'lp';
  const b0 = (lp ? (1 - cos) / 2 : (1 + cos) / 2) / a0;
  const b1 = (lp ? 1 - cos : -(1 + cos)) / a0;
  return { b0, b1, b2: b0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}

function runBiquad(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
}

function makeSimple(p, rnd) {
  const s = {
    p,
    t: 0,
    tonePhase: rnd(),
    secondPhase: rnd(),
    toneGain: p.second ? 0.045 : 0.065 * (p.toneAmp == null ? 1 : p.toneAmp),
    noiseGain: (p.amp == null ? 1 : p.amp) * 0.42,
    filters: [0, 1].map(() => [p.high ? biquad('hp', p.high) : null, p.low ? biquad('lp', p.low) : null].filter(Boolean)),
    periodN: p.period ? Math.round(p.period * sampleRate) : 0,
    lenN: p.length ? Math.round(p.length * sampleRate) : 0,
    startN: Math.round(0.3 * sampleRate),
    rustleK: 1 - Math.exp((-TAU * 900) / sampleRate),
    rustleLp: 0,
    rnd,
  };
  // Each block enters its event cycle at its own seeded point, so stacked event sounds don't fire together.
  s.pos = s.periodN ? Math.floor(rnd() * s.periodN) : 0;
  return s;
}

function renderSimple(s, ch, left, right, n) {
  const p = s.p;
  const dt = 1 / sampleRate;
  for (let i = 0; i < n; i++) {
    let mono = 0;
    if (p.tone) {
      s.tonePhase += p.tone * dt;
      if (s.tonePhase >= 1) s.tonePhase -= 1;
      mono += Math.sin(TAU * s.tonePhase) * s.toneGain;
      if (p.second) {
        s.secondPhase += p.second * dt;
        if (s.secondPhase >= 1) s.secondPhase -= 1;
        mono += Math.sin(TAU * s.secondPhase) * 0.035;
      }
    }
    if (s.periodN && s.lenN) {
      const k = s.pos - s.startN;
      if (k >= 0 && k < s.lenN) {
        const x = k / s.lenN;
        const env = Math.pow(Math.sin(Math.PI * x), 2) * Math.exp(-2 * x);
        if (p.rustle) {
          s.rustleLp += s.rustleK * (s.rnd() * 2 - 1 - s.rustleLp);
          mono += s.rustleLp * env * 0.15;
        } else {
          mono += Math.sin((TAU * p.event * k) / sampleRate) * env * p.eventAmp;
        }
      }
      s.pos = (s.pos + 1) % s.periodN;
    }
    let l = mono;
    let r = mono;
    if (p.noise) {
      let nl;
      let nr;
      if (p.noise === 'brown') {
        nl = brown(ch[0], white(ch[0]));
        nr = brown(ch[1], white(ch[1]));
        const mid = (nl + nr) * 0.5;
        nl = mid * 0.6 + nl * 0.4;
        nr = mid * 0.6 + nr * 0.4;
      } else {
        nl = pink(ch[0], white(ch[0]));
        nr = pink(ch[1], white(ch[1]));
      }
      for (const f of s.filters[0]) nl = runBiquad(f, nl);
      for (const f of s.filters[1]) nr = runBiquad(f, nr);
      const g = s.noiseGain * (p.swell ? 1 + (p.depth || 0) * Math.sin((TAU * s.t) / p.swell) : 1);
      l += nl * g;
      r += nr * g;
    }
    left[i] = l;
    if (right !== left) right[i] = r;
    s.t += dt;
  }
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
    // A simpler alternative version of a sound, described by parameters rather than a type.
    this.simple = o.synth ? makeSimple(o.synth, this.shared) : null;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] || out[0];
    const n = left.length;
    const type = this.type;
    if (this.simple) {
      renderSimple(this.simple, this.ch, left, right, n);
      return this.alive;
    }

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
