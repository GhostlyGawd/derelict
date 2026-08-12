/**
 * Web Audio playback for the ten generated sounds.
 *
 * The context is created inside the Begin-button gesture so iOS Safari lets it
 * run. Anything the pipeline has not produced falls back to a synthesised
 * stand-in, which keeps the greybox build audible.
 */
/** How much of every world sound is fed to the compartment's reverb. */
const SEND_LEVEL = 0.42;
/** Long enough that a threshold does not click, short enough to feel like a door. */
const CROSSFADE = 0.4;

export class AudioBus {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.ambient = null;
    this.ready = false;

    /** Impulse responses by id, and which one each compartment uses. */
    this.responses = new Map();
    this.irOfSpace = new Map();
    /** Two convolvers, crossfaded. One that switched would click. */
    this.wet = [];
    this.activeWet = 0;
    this.space = null;
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

    // The mixer, phase 4. Every world sound goes through a panner into a dry
    // bus and, in parallel, into a send feeding whichever compartment response
    // is loaded. Two convolvers rather than one, because changing a
    // ConvolverNode's buffer mid-stream is audible and crossing between two is
    // not — and a doorway is exactly where you would hear the seam.
    this.dry = this.ctx.createGain();
    this.dry.connect(this.master);

    this.send = this.ctx.createGain();
    this.send.gain.value = SEND_LEVEL;

    for (let i = 0; i < 2; i++) {
      const conv = this.ctx.createConvolver();
      // Equal-power normalisation, so compartments differ by how long and how
      // dark their tail is rather than by how loud it arrives. Length and
      // colour are what the ear reads as size; level just reads as level.
      conv.normalize = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.send.connect(conv);
      conv.connect(gain);
      gain.connect(this.master);
      // `level` is the param because every use of it is a ramp. The node comes
      // along so the wet bus can be tapped from outside: tools/consume.mjs
      // proves each response is *heard* by measuring signal here, and the one
      // bug that shipped a whole phase was a send that was never fed.
      this.wet.push({ conv, gain, level: gain.gain });
    }

    // Room tone: the bed runs through a filter whose corner follows the
    // compartment, so the Hold booms and the Service Passage is close and dry.
    this.toneFilter = this.ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 4000;
    this.toneLevel = this.ctx.createGain();
    this.toneLevel.gain.value = 1;
    this.toneFilter.connect(this.toneLevel).connect(this.master);

    await Promise.all([
      ...SOUND_IDS.map(async (id) => {
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
      }),
      this.#loadAcoustics(),
    ]);

    this.ready = true;
  }

  /**
   * Compartment responses. The manifest says which spaces share which
   * response, so the mapping is read rather than restated — identical boxes
   * sharing one acoustic is a fact about the level, decided in the pipeline.
   */
  async #loadAcoustics() {
    const table = this.assets.manifest?.acoustics;
    if (!table) return;
    await Promise.all(
      Object.entries(table).map(async ([id, entry]) => {
        const raw = this.assets.acoustic(id);
        if (!raw) return;
        try {
          this.responses.set(id, await decode(this.ctx, raw.slice(0)));
          for (const space of entry.spaces || []) this.irOfSpace.set(space, id);
        } catch {
          /* a compartment with no response simply stays dry */
        }
      })
    );
  }

  /**
   * A sound with no place in the room — at the listener, or not diegetic at all.
   *
   * `room` decides whether it still excites the compartment's reverb. It
   * defaults off for interface sounds, and it has to be *on* for anything the
   * player's own body makes. Phase 4 shipped with it effectively absent, so
   * footsteps — the sound you hear more than any other, and the one constantly
   * exciting a real room — went straight to the master bus bone dry. The
   * convolvers were working the whole time and the one signal that would have
   * demonstrated them never reached them.
   */
  play(id, { volume = 1, rate = 1, delay = 0, room = false } = {}) {
    if (!this.ready || volume <= 0.001) return null;
    const buffer = this.buffers.get(id);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.master);
    if (room) gain.connect(this.send);
    source.start(this.ctx.currentTime + delay);
    return source;
  }

  /**
   * A sound with a place in the room.
   *
   * This used to be `1 - d/26`, squared, on a plain gain — the whole of the
   * ship's spatial audio, and with no direction in it at all: a clunk behind
   * you and a clunk in front of you were the same signal. It is a PannerNode
   * now, on `equalpower`. Stereo placement without HRTF is the right trade for
   * a phone speaker and costs almost nothing, which is the same argument that
   * kept HRTF out of the spec.
   */
  playAt(id, position, { volume = 1, maxDistance = 26, rate = 1, delay = 0 } = {}) {
    if (!this.ready || volume <= 0.001) return null;
    const buffer = this.buffers.get(id);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    const panner = this.ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.8;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.2;
    setPosition(panner, position[0], position[1] ?? 1.2, position[2]);

    source.connect(gain).connect(panner);
    panner.connect(this.dry);
    panner.connect(this.send);
    source.start(this.ctx.currentTime + delay);
    return source;
  }

  /** Where the ears are. Called every frame from the game loop. */
  setListener(x, y, z, yaw) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    // yaw 0 looks down -Z, matching the player.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      // Safari still ships the deprecated form.
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * Moves the listener into a compartment: crossfades its response in, and
   * retunes the room tone. Cheap to call every frame — it returns immediately
   * unless the compartment actually changed.
   */
  setSpace(spaceId, tone) {
    if (!this.ready || spaceId === this.space) return;
    this.space = spaceId;

    if (tone) {
      const now = this.ctx.currentTime;
      this.toneFilter.frequency.setTargetAtTime(tone.cutoff, now, 0.25);
      this.toneLevel.gain.setTargetAtTime(tone.level, now, 0.25);
    }

    const irId = this.irOfSpace.get(spaceId);
    const buffer = irId ? this.responses.get(irId) : null;
    const active = this.wet[this.activeWet];
    if (!buffer) {
      // Nowhere with a response: fade the tail out rather than cutting it.
      ramp(active.level, 0, this.ctx.currentTime, CROSSFADE);
      return;
    }
    // Already convolving this one — two compartments can share a response, and
    // walking between them should be seamless rather than re-crossfaded.
    if (active.conv.buffer === buffer && active.level.value > 0.01) return;

    const next = this.wet[this.activeWet ^ 1];
    next.conv.buffer = buffer;
    const now = this.ctx.currentTime;
    ramp(next.level, 1, now, CROSSFADE);
    ramp(active.level, 0, now, CROSSFADE);
    this.activeWet ^= 1;
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
    bus.connect(this.toneFilter);

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

    /**
     * Keeps roughly two and a half seconds of bed scheduled ahead of the clock.
     *
     * The clamp and the `finally` are both load-bearing, and both are there
     * because of one failure. `pump` runs on a timer, so a main thread that
     * stalls — a long frame, a collection, a tab coming back — leaves `next`
     * behind `currentTime`. Scheduling a voice in the past makes the browser
     * clamp its fade-in curve forward to now, and the value events that follow
     * the curve then land *inside* the clamped window, which throws. The throw
     * used to escape before the timer was re-armed, so the pump stopped and the
     * ship's hum never came back for the rest of the run: an asset that was
     * generated, decoded, playing, and then silently gone.
     *
     * tools/framecost.mjs is what surfaced it, by being the first thing in this
     * project to stall the main thread hard enough on purpose.
     */
    const pump = () => {
      if (state.stopped) return;
      try {
        const now = this.ctx.currentTime;
        if (state.next < now + 0.05) state.next = now + 0.05;
        while (state.next < now + 2.5) {
          voice(state.next);
          state.next += body - overlap;
        }
      } finally {
        if (!state.stopped) state.timer = setTimeout(pump, 1000);
      }
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
  'footstep_grate_1',
  'footstep_grate_2',
  'footstep_grate_3',
  'end_sting',
  'cell_lift',
  'cell_seat',
];

/** Sets a panner's position across both the current and the legacy API. */
function setPosition(panner, x, y, z) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
}

/**
 * Crossfade ramp that never lands on exactly zero, which mutes a node.
 *
 * This was a `linearRampToValueAtTime`, and it could be left unapplied: the
 * param stayed pinned at whatever value the crossfade happened to be passing
 * through, and stayed there until the compartment was left and re-entered.
 * tools/consume.mjs caught the Hold convolving at 0.602 of its level and
 * holding — the response correct, selected and audible, and the room simply
 * two-fifths too quiet. That is the kind of wrong no listening test localises
 * and no assertion about the generated data would ever see, and it happens when
 * a second crossfade starts while the first is still in flight, which is what a
 * doorway is. Pinning the destination at the ramp's end time did not fix it,
 * because the event that goes missing is the one scheduled in the future,
 * whichever kind it is.
 *
 * `setTargetAtTime` has no future event to lose. It is one event, at `now`,
 * and the param approaches the target from wherever it currently sits — which
 * is exactly the behaviour a crossfade interrupted by another crossfade wants.
 * The room tone in this file has always been driven this way; now the wet
 * levels are too. The time constant is a quarter of the crossfade, so it is
 * 98% of the way there in the time the linear ramp used to take.
 */
function ramp(param, to, now, seconds) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.setTargetAtTime(Math.max(0.0001, to), now, seconds / 4);
}

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
  footstep_grate_1: { seconds: 0.24, build: (t, d) => step(t, d, 2.1) },
  footstep_grate_2: { seconds: 0.24, build: (t, d) => step(t, d, 2.4) },
  footstep_grate_3: { seconds: 0.24, build: (t, d) => step(t, d, 1.8) },
  end_sting: { seconds: 2.6, build: sting },
  cell_lift: { seconds: 0.5, build: (t, d) => thud(t, d, 150) },
  cell_seat: { seconds: 0.7, build: (t, d) => thud(t, d, 72) },
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
