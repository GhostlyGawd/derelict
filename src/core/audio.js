/**
 * Web Audio playback for the eight generated sounds.
 *
 * The context is created inside the Begin-button gesture so iOS Safari lets it
 * run. Anything the pipeline has not produced falls back to a synthesised
 * stand-in, which keeps the greybox build audible.
 */
export class AudioBus {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.ambient = null;
    this.ready = false;
  }

  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    await Promise.all(
      SOUND_IDS.map(async (id) => {
        const raw = this.assets.audio(id);
        if (raw) {
          try {
            this.buffers.set(id, await decode(this.ctx, raw.slice(0)));
            return;
          } catch {
            /* fall through to the synthesised stand-in */
          }
        }
        this.buffers.set(id, synthesise(this.ctx, id));
      })
    );

    this.ready = true;
  }

  play(id, { volume = 1, rate = 1, delay = 0 } = {}) {
    if (!this.ready || volume <= 0.001) return null;
    const buffer = this.buffers.get(id);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start(this.ctx.currentTime + delay);
    return source;
  }

  /** World sound with simple distance falloff — no panner, no cost. */
  playAt(id, position, listener, { volume = 1, maxDistance = 26, rate = 1 } = {}) {
    const dx = position[0] - listener.x;
    const dz = position[2] - listener.z;
    const distance = Math.hypot(dx, dz);
    const falloff = Math.max(0, 1 - distance / maxDistance);
    return this.play(id, { volume: volume * falloff * falloff, rate });
  }

  /**
   * The 30 s bed, looped by overlapping two voices with an equal-power
   * crossfade rather than with `loop = true`.
   *
   * Compressed audio decodes with silent padding on both ends, so a plain
   * loop ticks once a cycle — very audible on a continuous bed. Overlapping
   * voices sidesteps the codec entirely, and keeps the ambience from settling
   * into an obvious period.
   */
  startAmbient() {
    if (!this.ready || this.ambient) return;
    const buffer = this.buffers.get('ambient_hum');
    if (!buffer) return;

    const bus = this.ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.linearRampToValueAtTime(AMBIENT_LEVEL, this.ctx.currentTime + 3);
    bus.connect(this.master);

    const pad = 0.06;
    const body = Math.max(2, buffer.duration - pad * 2);
    const overlap = Math.min(1.5, body / 3);
    const state = { bus, stopped: false, timer: null, next: this.ctx.currentTime + 0.05 };

    const voice = (at) => {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueCurveAtTime(FADE_IN, at, overlap);
      gain.gain.setValueAtTime(1, at + overlap + 0.001);
      gain.gain.setValueCurveAtTime(FADE_OUT, at + body - overlap, overlap);
      source.connect(gain).connect(bus);
      source.start(at, pad, body);
      source.stop(at + body + 0.05);
    };

    const pump = () => {
      if (state.stopped) return;
      while (state.next < this.ctx.currentTime + 2.5) {
        voice(state.next);
        state.next += body - overlap;
      }
      state.timer = setTimeout(pump, 1000);
    };

    pump();
    this.ambient = state;
  }

  stopAmbient() {
    if (!this.ambient) return;
    this.ambient.stopped = true;
    clearTimeout(this.ambient.timer);
    const { bus } = this.ambient;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    bus.gain.linearRampToValueAtTime(0.0001, now + 0.3);
    setTimeout(() => bus.disconnect(), 600);
    this.ambient = null;
  }

  fadeOut(seconds = 1.2) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + seconds);
  }

  fadeIn(seconds = 0.6, level = 0.9) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(level, now + seconds);
  }

  setSuspended(suspended) {
    if (!this.ctx) return;
    if (suspended && this.ctx.state === 'running') this.ctx.suspend();
    if (!suspended && this.ctx.state === 'suspended') this.ctx.resume();
  }
}

const AMBIENT_LEVEL = 0.34;

/** Equal-power crossfade curves — a linear pair dips 3 dB at the midpoint. */
const CURVE_POINTS = 64;
const FADE_IN = new Float32Array(CURVE_POINTS);
const FADE_OUT = new Float32Array(CURVE_POINTS);
for (let i = 0; i < CURVE_POINTS; i++) {
  const t = i / (CURVE_POINTS - 1);
  FADE_IN[i] = Math.max(0.0001, Math.sin((t * Math.PI) / 2));
  FADE_OUT[i] = Math.max(0.0001, Math.cos((t * Math.PI) / 2));
}

export const SOUND_IDS = [
  'ambient_hum',
  'switch_clunk',
  'power_surge',
  'door_motor',
  'footstep_1',
  'footstep_2',
  'footstep_3',
  'end_sting',
];

function decode(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    // Safari still wants the callback form.
    const result = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (result && typeof result.then === 'function') result.then(resolve, reject);
  });
}

/* ------------------------------------------------------------------------ *
 * Synthesised stand-ins (greybox only — the pipeline replaces all of these). *
 * ------------------------------------------------------------------------ */

const SHAPES = {
  ambient_hum: { seconds: 6, build: humNoise },
  switch_clunk: { seconds: 0.5, build: (t, d) => thud(t, d, 90) },
  power_surge: { seconds: 1.6, build: rise },
  door_motor: { seconds: 2.4, build: motor },
  footstep_1: { seconds: 0.22, build: (t, d) => step(t, d, 1) },
  footstep_2: { seconds: 0.22, build: (t, d) => step(t, d, 1.15) },
  footstep_3: { seconds: 0.22, build: (t, d) => step(t, d, 0.86) },
  end_sting: { seconds: 2.6, build: sting },
};

function synthesise(ctx, id) {
  const shape = SHAPES[id] || SHAPES.switch_clunk;
  const rate = ctx.sampleRate;
  const length = Math.floor(shape.seconds * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = shape.build(i / rate, shape.seconds);
  return buffer;
}

let seed = 1337;
function noise() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
}

function humNoise(t, d) {
  const fade = Math.min(1, t / 0.5) * Math.min(1, (d - t) / 0.5);
  return (
    (Math.sin(t * 2 * Math.PI * 47) * 0.11 +
      Math.sin(t * 2 * Math.PI * 71.5) * 0.05 +
      noise() * 0.014) *
    fade
  );
}

function thud(t, d, freq) {
  const env = Math.exp(-t * 16);
  return (Math.sin(t * 2 * Math.PI * freq * (1 - t * 0.5)) * 0.6 + noise() * 0.35) * env;
}

function rise(t, d) {
  const env = Math.sin(Math.min(1, t / d) * Math.PI);
  const f = 70 + t * 420;
  return (Math.sin(t * 2 * Math.PI * f) * 0.28 + noise() * 0.2) * env;
}

function motor(t, d) {
  const env = Math.min(1, t / 0.25) * Math.min(1, (d - t) / 0.4);
  return (Math.sin(t * 2 * Math.PI * 58) * 0.2 + noise() * 0.12) * env * (0.8 + 0.2 * Math.sin(t * 34));
}

function step(t, d, pitch) {
  const env = Math.exp(-t * 42);
  return (noise() * 0.5 + Math.sin(t * 2 * Math.PI * 120 * pitch) * 0.3) * env;
}

function sting(t, d) {
  const env = Math.exp(-t * 1.4);
  const chord = [110, 165, 220, 330];
  let v = 0;
  for (const f of chord) v += Math.sin(t * 2 * Math.PI * f) / chord.length;
  return v * 0.5 * env;
}
