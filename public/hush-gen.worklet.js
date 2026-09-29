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

// Differentiated white noise (rising with frequency), high-passed so nothing sits low.
function hifreq(c, w) {
  const d = w - c.prev;
  c.prev = w;
  c.hp += (d - c.hp) * 0.25;
  return (d - c.hp * 0.6) * 0.16;
}

class HushGenerator extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.type = o.type || 'pink';
    const seed = (o.seed || 1) >>> 0;
    this.ch = [channel(seed * 2654435761), channel((seed + 7919) * 2246822519)];
    this.shared = makeRng(seed ^ 0x5bd1e995);
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
      } else if (type === 'hifreq') {
        l = hifreq(this.ch[0], white(this.ch[0]));
        r = hifreq(this.ch[1], white(this.ch[1]));
      } else if (type === 'wind') {
        if (i === 0) {
          if (this.shared() < 0.006) this.gustTarget = 0.25 + this.shared() * 0.75;
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
          const v = (c.band * 1.6 + c.low * 0.35) * (0.2 + 0.8 * this.gust);
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
        const env = 0.16 + 0.84 * s;
        const k = 0.015 + 0.11 * s;
        for (let j = 0; j < 2; j++) {
          const c = this.ch[j];
          const w = white(c);
          const noise = brown(c, w) * 0.75 + pink(c, w) * 0.6;
          c.lp += (noise - c.lp) * k;
          c.lp2 += (c.lp - c.lp2) * 0.5;
          const foam = (noise - c.lp) * s * s * s * 0.22;
          const v = (c.lp2 * 1.5 + foam) * env;
          if (j === 0) l = v; else r = v;
        }
      } else if (type === 'focus') {
        const t = this.t;
        const drift = 0.85 + 0.15 * Math.sin(TAU * 0.05 * t);
        const padL = 0.35 * Math.sin(TAU * 110 * t) + 0.25 * Math.sin(TAU * 164.81 * t) + 0.2 * Math.sin(TAU * 220 * t) + 0.1 * Math.sin(TAU * 329.63 * t);
        const padR = 0.35 * Math.sin(TAU * 110.35 * t) + 0.25 * Math.sin(TAU * 165.16 * t) + 0.2 * Math.sin(TAU * 220.35 * t) + 0.1 * Math.sin(TAU * 329.98 * t);
        // Smooth amplitude modulation around 16 pulses per second, 50% depth.
        const am = 1 - 0.5 * (0.5 - 0.5 * Math.cos(TAU * 16 * t));
        const nl = pink(this.ch[0], white(this.ch[0]));
        const nr = pink(this.ch[1], white(this.ch[1]));
        l = (padL * 0.42 * drift + nl * 0.75) * am;
        r = (padR * 0.42 * drift + nr * 0.75) * am;
      }
      left[i] = l;
      if (right !== left) right[i] = r;
      this.t += this.dt;
    }
    return this.alive;
  }
}

registerProcessor('hush-gen', HushGenerator);
