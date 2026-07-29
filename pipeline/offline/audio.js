/**
 * Offline sound synthesis.
 *
 * Stands in for the SFX generation leg of the pipeline when no credentials are
 * available. Small DSP toolkit — oscillators, filtered noise, envelopes — with
 * one voice per sound in the manifest.
 */

const TAU = Math.PI * 2;

/* -------------------------------------------------------------- toolkit --- */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** One-pole lowpass, coefficient derived per-sample so cutoff can sweep. */
function lowpass(sampleRate) {
  let z = 0;
  return (x, cutoff) => {
    const a = Math.min(0.999, 1 - Math.exp((-TAU * cutoff) / sampleRate));
    z += a * (x - z);
    return z;
  };
}

function highpass(sampleRate) {
  const lp = lowpass(sampleRate);
  return (x, cutoff) => x - lp(x, cutoff);
}

/** State-variable bandpass — used for the metallic resonances. */
function bandpass(sampleRate) {
  let low = 0;
  let band = 0;
  return (x, freq, q = 4) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, sampleRate / 3)) / sampleRate);
    const damp = 1 / q;
    const high = x - low - damp * band;
    band += f * high;
    low += f * band;
    return band;
  };
}

const expDecay = (t, rate) => Math.exp(-t * rate);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function ramp(t, start, end) {
  return clamp01((t - start) / Math.max(1e-6, end - start));
}

/** Attack/hold/release window. */
function window(t, duration, attack = 0.01, release = 0.1) {
  const a = clamp01(t / attack);
  const r = clamp01((duration - t) / release);
  return a * r;
}

/** Damped modal partials — what makes struck metal sound like metal. */
function modes(t, partials) {
  let v = 0;
  for (const [freq, amp, decay] of partials) {
    v += Math.sin(TAU * freq * t) * amp * expDecay(t, decay);
  }
  return v;
}

function render(seconds, sampleRate, fn) {
  const length = Math.floor(seconds * sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = fn(i / sampleRate, i);
  return out;
}

/* ---------------------------------------------------------------- voices --- */

export function synthesiseSound(spec, sampleRate) {
  switch (spec.synth) {
    case 'ambient':
      return ambient(spec, sampleRate);
    case 'clunk':
      return clunk(spec, sampleRate);
    case 'surge':
      return surge(spec, sampleRate);
    case 'motor':
      return motor(spec, sampleRate);
    case 'footstep':
      return footstep(spec, sampleRate);
    case 'sting':
      return sting(spec, sampleRate);
    default:
      return clunk(spec, sampleRate);
  }
}

/** A dead ship: engine rumble, air handling, and the hull complaining. */
function ambient(spec, sampleRate) {
  const random = rng(0x51e3d);
  const lp = lowpass(sampleRate);
  const lp2 = lowpass(sampleRate);
  const hp = highpass(sampleRate);
  const groanFilter = bandpass(sampleRate);

  // Hull groans placed on a fixed schedule so the sound is reproducible.
  const groans = [3.1, 9.4, 14.8, 21.2, 26.6].map((at) => ({
    at,
    length: 1.8 + random() * 1.6,
    freq: 130 + random() * 220,
    gain: 0.05 + random() * 0.05,
  }));

  return render(spec.seconds, sampleRate, (t) => {
    // Engine bed: a few detuned low partials drifting against each other.
    let v =
      Math.sin(TAU * 41.5 * t + Math.sin(t * 0.11) * 0.6) * 0.2 +
      Math.sin(TAU * 47.3 * t) * 0.12 +
      Math.sin(TAU * 62.1 * t + Math.sin(t * 0.07) * 0.4) * 0.075 +
      Math.sin(TAU * 88.7 * t) * 0.03;

    // Air handling: broadband noise squashed down to a soft hiss.
    const n = random() * 2 - 1;
    v += lp(n, 420) * 0.32;
    v += hp(lp2(n, 2600), 900) * 0.028;

    // Structural groans.
    for (const g of groans) {
      const local = t - g.at;
      if (local < 0 || local > g.length) continue;
      const env = Math.sin((local / g.length) * Math.PI) ** 2;
      const sweep = g.freq * (1 + 0.12 * Math.sin(local * 1.4));
      v += groanFilter(random() * 2 - 1, sweep, 12) * g.gain * env;
    }

    // Very slow breathing on the whole bed.
    return v * (0.86 + 0.14 * Math.sin(TAU * (t / spec.seconds) * 3));
  });
}

/** A heavy breaker being thrown: latch, impact, ring. */
function clunk(spec, sampleRate) {
  const random = rng(0x9a17b);
  const lp = lowpass(sampleRate);
  const bp = bandpass(sampleRate);

  return render(spec.seconds, sampleRate, (t) => {
    let v = 0;

    // Latch releasing a moment before the contact.
    if (t < 0.05) {
      v += lp(random() * 2 - 1, 4200) * expDecay(t, 90) * 0.5;
    }

    const hit = t - 0.06;
    if (hit >= 0) {
      // Body: a low tone dropping in pitch as the throw seats.
      const pitch = 96 * (1 - 0.42 * clamp01(hit * 14));
      v += Math.sin(TAU * pitch * hit) * expDecay(hit, 17) * 0.85;
      // Impact noise.
      v += lp(random() * 2 - 1, 1500) * expDecay(hit, 46) * 0.55;
      // Metal ring in the housing.
      v += modes(hit, [
        [612, 0.1, 6.5],
        [1183, 0.06, 8.5],
        [1874, 0.03, 12],
      ]);
      v += bp(random() * 2 - 1, 2400, 18) * expDecay(hit, 9) * 0.05;
    }

    return v * window(t, spec.seconds, 0.002, 0.25);
  });
}

/** Power coming back: rising sweep, capacitor whine, contactor snap. */
function surge(spec, sampleRate) {
  const random = rng(0x2c8f1);
  const lp = lowpass(sampleRate);
  const bp = bandpass(sampleRate);
  const crackles = [0.08, 0.42, 0.61, 1.05];

  return render(spec.seconds, sampleRate, (t) => {
    const rise = ramp(t, 0, 1.35);
    let v = 0;

    // Noise sweeping up through the spectrum.
    v += lp(random() * 2 - 1, 180 + rise * rise * 6200) * 0.36 * Math.sin(rise * Math.PI * 0.9);

    // Mains hum stack coming up to strength.
    const hum = ramp(t, 0.35, 1.7);
    v +=
      (Math.sin(TAU * 50 * t) * 0.16 + Math.sin(TAU * 100 * t) * 0.09 + Math.sin(TAU * 150 * t) * 0.04) *
      hum;

    // Capacitor whine climbing to pitch.
    v += Math.sin(TAU * (420 + rise * 1750) * t) * 0.07 * Math.sin(rise * Math.PI);

    // Contactors snapping in.
    for (const at of crackles) {
      const local = t - at;
      if (local >= 0 && local < 0.09) {
        v += bp(random() * 2 - 1, 3200, 9) * expDecay(local, 70) * 0.55;
      }
    }

    // Settle out to a steady hum.
    const tail = 1 - clamp01((t - 1.7) / 0.7) * 0.72;
    return v * tail * window(t, spec.seconds, 0.006, 0.45);
  });
}

/** Heavy door: servo whine over grinding rumble, locking clunk at the end. */
function motor(spec, sampleRate) {
  const random = rng(0x77c05);
  const lp = lowpass(sampleRate);
  const lp2 = lowpass(sampleRate);
  const bp = bandpass(sampleRate);
  const runFor = spec.seconds - 0.55;

  return render(spec.seconds, sampleRate, (t) => {
    let v = 0;
    const running = clamp01(t / 0.22) * clamp01((runFor - t) / 0.3);

    if (running > 0) {
      // Servo: a buzzy saw with gear-tooth amplitude ripple.
      const spin = 176 + 14 * Math.sin(t * 1.6);
      const phase = (t * spin) % 1;
      const saw = phase * 2 - 1;
      const teeth = 0.78 + 0.22 * Math.sin(TAU * 13.5 * t);
      v += lp(saw, 1500) * 0.2 * running * teeth;
      v += Math.sin(TAU * spin * 2 * t) * 0.045 * running;

      // Rumble of the slab moving in its track.
      const n = random() * 2 - 1;
      v += lp2(n, 260) * 0.5 * running;
      v += bp(n, 520, 6) * 0.09 * running;
    }

    // Locking clunk once it has finished travelling.
    const hit = t - runFor;
    if (hit >= 0) {
      v += Math.sin(TAU * 74 * hit * (1 - 0.3 * clamp01(hit * 10))) * expDecay(hit, 13) * 0.75;
      v += lp(random() * 2 - 1, 1100) * expDecay(hit, 40) * 0.4;
      v += modes(hit, [
        [430, 0.07, 7],
        [905, 0.04, 10],
      ]);
    }

    return v * window(t, spec.seconds, 0.01, 0.3);
  });
}

/** Boot on deck plate. Variants differ in weight, brightness and rattle. */
function footstep(spec, sampleRate) {
  const variant = spec.variant | 0;
  const random = rng(0x1f00d + variant * 977);
  const lp = lowpass(sampleRate);
  const bp = bandpass(sampleRate);

  const weight = [1, 0.86, 1.12][variant] ?? 1;
  const bright = [2600, 4200, 1900][variant] ?? 2600;
  const rattle = [0, 0.35, 0.7][variant] ?? 0;

  return render(spec.seconds, sampleRate, (t) => {
    let v = 0;

    // Heel contact.
    v += lp(random() * 2 - 1, bright) * expDecay(t, 120) * 0.6;
    v += Math.sin(TAU * 118 * weight * t) * expDecay(t, 44) * 0.5 * weight;
    v += Math.sin(TAU * 61 * weight * t) * expDecay(t, 30) * 0.3 * weight;

    // Hollow deck-plate ring.
    v += modes(t, [
      [340 * weight, 0.055, 22],
      [770 * weight, 0.03, 30],
    ]);

    // Loose panel rattling under the step.
    if (rattle > 0 && t > 0.02 && t < 0.2) {
      v += bp(random() * 2 - 1, 1800, 14) * expDecay(t - 0.02, 24) * 0.14 * rattle;
    }

    return v * window(t, spec.seconds, 0.001, 0.12);
  });
}

/** End card: low drone opening into a clean rising fifth. */
function sting(spec, sampleRate) {
  const random = rng(0x4b17e);
  const lp = lowpass(sampleRate);

  return render(spec.seconds, sampleRate, (t) => {
    const swell = ramp(t, 0, 0.5);
    const open = ramp(t, 0.55, 1.5);
    const shimmer = ramp(t, 1.15, 2.4);
    const tail = 1 - clamp01((t - 1.9) / (spec.seconds - 1.9)) ** 1.5;

    let v = 0;
    v += (Math.sin(TAU * 55 * t) * 0.34 + Math.sin(TAU * 110.3 * t) * 0.2) * swell;
    v += (Math.sin(TAU * 164.8 * t) * 0.18 + Math.sin(TAU * 220 * t) * 0.12) * open;
    v += (Math.sin(TAU * 440 * t) * 0.05 + Math.sin(TAU * 659.3 * t) * 0.035) * shimmer;
    v += lp(random() * 2 - 1, 900 + shimmer * 2400) * 0.05 * swell;

    return v * tail * window(t, spec.seconds, 0.02, 0.6);
  });
}
