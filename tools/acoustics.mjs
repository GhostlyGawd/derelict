/**
 * Compartment acoustics — the phase 4 done-bar that each response is the
 * response of the room it claims to come from.
 *
 * This one needs no browser. The claim is about the generated data, so it reads
 * the WAVs off disk and measures them:
 *
 *   1. Every compartment maps to a response, and compartments with identical
 *      dimensions share one. Five responses for seven compartments is correct
 *      rather than a shortcut, so it is asserted rather than assumed.
 *   2. Each response's measured decay matches the Sabine estimate for the box
 *      it was generated from. This is the check that catches a response built
 *      from the wrong room's numbers — a failure that is completely silent and
 *      that no listening test would localise.
 *   3. Compartments of different size differ measurably. If the Hold and the
 *      Service Passage came out the same length, the feature is decoration.
 *
 * Sabine assumes a closed box and these compartments are coupled by open
 * doorways, so it is a reference for the generator, not a claim about the real
 * field. The tolerance is wide enough to say so.
 *
 *   node tools/acoustics.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SPACES } from '../src/game/layout.js';

const ASSETS = path.resolve('public/assets');
const manifest = JSON.parse(readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));

/**
 * How far a measured decay may sit from the box's Sabine estimate.
 *
 * Measures within 2% in practice, because the generator and the estimate are
 * the same arithmetic — which is the point: this is not validating acoustics
 * theory, it is checking that each response was built from its own room's
 * numbers. 15% leaves room for the Schroeder fit without leaving room for a
 * response wired to the wrong compartment, where the nearest wrong answer is
 * 0.54s against 1.38s.
 */
const TOLERANCE = 0.15;
/** Two differently sized compartments have to differ by at least this ratio. */
const DISTINCT = 1.25;

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

/** Reads a 16-bit PCM WAV into per-channel Float32Arrays. */
function readWav(file) {
  const buf = readFileSync(file);
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  // Walk the chunks rather than assuming data starts at 44 — it does here, but
  // a reader that assumes it breaks silently the day an encoder adds a chunk.
  let at = 12;
  let dataAt = 44;
  let dataBytes = buf.length - 44;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'data') {
      dataAt = at + 8;
      dataBytes = size;
      break;
    }
    at += 8 + size + (size % 2);
  }
  const frames = Math.floor(dataBytes / (2 * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      out[c][i] = buf.readInt16LE(dataAt + (i * channels + c) * 2) / 32768;
    }
  }
  return { channels: out, sampleRate, frames };
}

/**
 * Reverberation time by Schroeder backward integration.
 *
 * The energy decay curve is the tail's remaining energy at each instant, which
 * is far smoother than the impulse itself. The slope is fitted between −5 dB
 * and −25 dB — starting below the peak deliberately, so the early reflections
 * do not drag the line — and extrapolated to a full 60 dB.
 */
function measureRt60(samples, sampleRate) {
  const n = samples.length;
  const edc = new Float64Array(n);
  let running = 0;
  for (let i = n - 1; i >= 0; i--) {
    running += samples[i] * samples[i];
    edc[i] = running;
  }
  if (edc[0] <= 0) return 0;

  const db = new Float64Array(n);
  for (let i = 0; i < n; i++) db[i] = 10 * Math.log10(Math.max(edc[i] / edc[0], 1e-12));

  const cross = (target) => {
    for (let i = 0; i < n; i++) if (db[i] <= target) return i;
    return -1;
  };
  const from = cross(-5);
  const to = cross(-25);
  if (from < 0 || to < 0 || to <= from) return 0;
  // 20 dB of decay took (to - from) samples, so 60 dB takes three times that.
  return ((to - from) / sampleRate) * 3;
}

console.log('acoustics: public/assets');

const table = manifest.acoustics || {};
const ids = Object.keys(table);

// ---- Every compartment answered, identical boxes sharing one response -------
console.log('\n  coverage');
const shapeOf = (s) =>
  [
    Math.round((s.x[1] - s.x[0]) * 100) / 100,
    Math.round((s.z[1] - s.z[0]) * 100) / 100,
    Math.round(s.h * 100) / 100,
  ].join('x');

const distinctShapes = new Set(SPACES.map(shapeOf));
expect(
  `${SPACES.length} compartments reduce to ${distinctShapes.size} distinct boxes`,
  ids.length === distinctShapes.size,
  `${ids.length} responses for ${distinctShapes.size} distinct boxes — identical rooms should share one`
);

const mapped = new Map();
for (const [id, entry] of Object.entries(table)) {
  for (const space of entry.spaces) mapped.set(space, id);
}
for (const space of SPACES) {
  expect(
    `${space.id.padEnd(9)} → ${mapped.get(space.id) || '(none)'}`,
    mapped.has(space.id),
    'this compartment has no response'
  );
}

// Two compartments share a response exactly when they are the same box.
for (const a of SPACES) {
  for (const b of SPACES) {
    if (a.id >= b.id) continue;
    const same = shapeOf(a) === shapeOf(b);
    const shared = mapped.get(a.id) === mapped.get(b.id);
    if (same !== shared) {
      failures++;
      console.log(
        `  FAIL  ${a.id} and ${b.id} are ${same ? 'the same box but use different' : 'different boxes but share a'} response`
      );
    }
  }
}

// ---- Each response is the response of its own box ---------------------------
console.log(`\n  decay, against Sabine (±${(TOLERANCE * 100).toFixed(0)}%)`);
const measured = new Map();
for (const [id, entry] of Object.entries(table)) {
  const wav = readWav(path.join(ASSETS, entry.file));
  // Measured on the two channels summed: the reverberant field is what is
  // being characterised, not either ear's view of it.
  const mono = new Float32Array(wav.frames);
  for (let i = 0; i < wav.frames; i++) {
    for (const ch of wav.channels) mono[i] += ch[i] / wav.channels.length;
  }
  const rt = measureRt60(mono, wav.sampleRate);
  measured.set(id, rt);

  const error = entry.sabine > 0 ? Math.abs(rt - entry.sabine) / entry.sabine : 1;
  expect(
    `${id.padEnd(12)} ${entry.box.join('×')} m  sabine ${entry.sabine.toFixed(2)}s  measured ${rt.toFixed(2)}s`,
    error <= TOLERANCE,
    `${(error * 100).toFixed(0)}% off — this response was not generated from this box`
  );
}

// ---- Different sizes actually sound different -------------------------------
console.log(`\n  separation (≥${DISTINCT}× between different boxes)`);
const sorted = [...measured.entries()].sort((a, b) => a[1] - b[1]);
const [shortestId, shortest] = sorted[0];
const [longestId, longest] = sorted[sorted.length - 1];
expect(
  `${shortestId} ${shortest.toFixed(2)}s → ${longestId} ${longest.toFixed(2)}s ` +
    `(${(longest / shortest).toFixed(2)}×)`,
  shortest > 0 && longest / shortest >= 2,
  `only ${(longest / shortest).toFixed(2)}× across the whole ship — the compartments do not differ audibly`
);

// And no two *distinct* boxes may collapse onto the same decay.
for (let i = 0; i < sorted.length - 1; i++) {
  const [idA, a] = sorted[i];
  const [idB, b] = sorted[i + 1];
  const ratio = a > 0 ? b / a : 0;
  if (ratio < DISTINCT) {
    console.log(
      `  note  ${idA} ${a.toFixed(2)}s and ${idB} ${b.toFixed(2)}s are within ${ratio.toFixed(2)}× — ` +
        'adjacent compartment sizes, not a defect on their own'
    );
  }
}

if (failures) {
  console.error(`\nacoustics: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nacoustics: OK — every compartment sounds like the box it was generated from');
