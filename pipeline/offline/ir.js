/**
 * Impulse responses, synthesised from the compartment tables in layout.js.
 *
 * The first new asset class since the glyph atlas, and the first the player
 * never perceives directly: this is data the mixer convolves, not a sound
 * anyone hears on its own.
 *
 * Everything here is a function of numbers the level already carries — each
 * space's x and z extents and its ceiling height. Nothing is hand-tuned per
 * room, which is the whole argument for generating these rather than writing a
 * reverb out of delay taps: the acoustics stay inside the pipeline, and a room
 * that gets resized gets a new response for free.
 *
 * Two parts, which is how a real response is shaped:
 *
 *   Early reflections are placed by the image-source method. A listener at the
 *   centre of a box hears its six walls at 2× their distance, so the taps land
 *   at the room's real dimensions — a 2.4 m ceiling answers in 14 ms and an
 *   18 m hold answers in 52. Second-order combinations fill in behind them.
 *
 *   The late tail is decaying noise, split into two bands so the top decays
 *   faster than the bottom, which is what stops synthetic reverb sounding like
 *   a plate. Its length is the room's own Sabine estimate.
 *
 * No direct path: the response is used on a send, so the dry signal is the
 * direct sound and this is only what the room adds.
 */

/** Speed of sound, m/s. */
const C = 343;

/** Seeded, so a clean checkout reproduces every response byte-for-byte. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sabine's estimate for a closed box.
 *
 * A reference for the generator, not a claim about the real field — the
 * compartments are coupled by open doorways and Sabine assumes they are not.
 * It earns its place by catching the failure where a response is generated
 * from the wrong room's numbers, which is silent and which no listening test
 * would localise.
 */
export function sabineRt60(w, d, h, absorption) {
  const volume = w * d * h;
  const surface = 2 * (w * d + w * h + d * h);
  return (0.161 * volume) / (surface * absorption);
}

/**
 * @param spec  { w, d, h, absorption, seed }
 * @param sampleRate
 * @returns { channels: [Float32Array, Float32Array], rt60, seconds }
 */
export function synthesiseImpulseResponse(spec, sampleRate) {
  const { w, d, h, absorption = 0.15, seed = 1 } = spec;
  const rt60 = sabineRt60(w, d, h, absorption);

  // The tail is truncated where it is already 60 dB down, and capped hard.
  //
  // Tail length is the one dial that decides whether convolution costs frames
  // on a phone — §4.3.2 said so before this was built, and the owner's first
  // play came back "a touch less responsive". A 0.95 s cap takes about 30% off
  // the two largest compartments and costs nothing audible: what the ear reads
  // as size is the first few hundred milliseconds and the colour of the decay,
  // not how long the last 20 dB takes to disappear under the room tone.
  const seconds = Math.min(rt60, 0.95);
  const length = Math.max(64, Math.ceil(seconds * sampleRate));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const random = rng(seed);

  // ---- Early reflections ---------------------------------------------------
  // Listener and source both at the centre of the box, at standing ear height,
  // so each wall answers at twice its own distance.
  const ear = Math.min(1.62, h * 0.55);
  const firstOrder = [w, w, d, d, 2 * ear, 2 * (h - ear)];

  const reflect = Math.sqrt(Math.max(0, 1 - absorption));
  const tap = (distance, order, pan) => {
    if (distance <= 0) return;
    const t = distance / C;
    const i = Math.round(t * sampleRate);
    if (i <= 0 || i >= length) return;
    // Spherical spreading, plus one absorption event per reflection order.
    const gain = (reflect ** order / Math.max(1, distance)) * (0.7 + random() * 0.6);
    const sign = random() < 0.5 ? -1 : 1;
    left[i] += gain * sign * (1 - pan);
    right[i] += gain * sign * (1 + pan);
  };

  for (const distance of firstOrder) {
    // Lateral reflections are what make a room sound wide; the floor and
    // ceiling arrive centred.
    const lateral = distance !== 2 * ear && distance !== 2 * (h - ear);
    tap(distance, 1, lateral ? (random() - 0.5) * 1.2 : 0);
  }
  for (let a = 0; a < firstOrder.length; a++) {
    for (let b = a; b < firstOrder.length; b++) {
      tap(firstOrder[a] + firstOrder[b], 2, (random() - 0.5) * 1.4);
    }
  }

  // ---- Late tail -----------------------------------------------------------
  // Two bands off one noise source, split by a one-pole. The top decays about
  // 2.2× faster than the bottom, which is roughly what air and painted steel
  // do and is most of the difference between "a room" and "a plate".
  const onset = Math.round((Math.min(...firstOrder) / C) * sampleRate);
  const lowTau = rt60 / 6.91; // 60 dB is e^-6.91
  const highTau = lowTau / 2.2;
  const cutoff = Math.exp((-2 * Math.PI * 900) / sampleRate);

  let lpL = 0;
  let lpR = 0;
  for (let i = onset; i < length; i++) {
    const t = (i - onset) / sampleRate;
    const nL = random() * 2 - 1;
    const nR = random() * 2 - 1;
    lpL = nL * (1 - cutoff) + lpL * cutoff;
    lpR = nR * (1 - cutoff) + lpR * cutoff;
    const lowL = lpL;
    const lowR = lpR;
    const highL = nL - lpL;
    const highR = nR - lpR;

    const eLow = Math.exp(-t / lowTau);
    const eHigh = Math.exp(-t / highTau);
    // The tail builds rather than starting at full level: a room takes a few
    // milliseconds to fill, and a hard edge here reads as a gate.
    const build = Math.min(1, t / 0.012);

    left[i] += build * (lowL * 2.6 * eLow + highL * 0.55 * eHigh);
    right[i] += build * (lowR * 2.6 * eLow + highR * 0.55 * eHigh);
  }

  // ---- Normalise -----------------------------------------------------------
  // To a fixed energy rather than a fixed peak, so a big room does not simply
  // arrive louder than a small one — the difference between them should be
  // length and colour, which is what the ear reads as size.
  let energy = 0;
  for (let i = 0; i < length; i++) energy += left[i] * left[i] + right[i] * right[i];
  const scale = energy > 0 ? 0.55 / Math.sqrt(energy / length) : 0;
  for (let i = 0; i < length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }

  // A short fade out, so truncating the tail never clicks.
  const fade = Math.min(length, Math.round(0.02 * sampleRate));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    left[length - 1 - i] *= k;
    right[length - 1 - i] *= k;
  }

  return { channels: [left, right], rt60, seconds: length / sampleRate };
}
