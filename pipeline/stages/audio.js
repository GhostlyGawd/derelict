import path from 'node:path';

import { ACOUSTICS, SOUNDS } from '../manifest.js';
import { synthesiseSound } from '../offline/audio.js';
import { synthesiseImpulseResponse } from '../offline/ir.js';
import {
  edgeFade,
  encodeMp3,
  encodeWav,
  makeLoop,
  normalise,
  removeDc,
  resample,
} from '../lib/audio.js';
import { ASSETS, bytes, ensureDir, exists, rel, size, write } from '../lib/io.js';
import { log } from '../lib/log.js';

/**
 * Stage 4 — audio.
 *
 * generate → loudness-normalise → save. Looping ambience is crossfaded into a
 * seamless loop of the requested length and encoded at a lower bitrate: it is
 * a low rumble, and at 30 seconds it would otherwise dominate the download.
 * The runtime overlaps two voices to loop it, so the codec's padding never
 * shows up as a tick.
 */

const RATE = 44100;
/**
 * Impulse responses are generated at half rate. A reverb tail in a small metal
 * room carries almost nothing above 11 kHz, and this is the difference between
 * a manifest that grew by 200 kB and one that grew by 800.
 */
const IR_RATE = 22050;
const LOOP_RATE = 32000;
const LOOP_KBPS = 56;
const CUE_KBPS = 96;

export async function runAudio({ force = false }) {
  log.stage('audio');
  const outDir = path.join(ASSETS, 'audio');
  await ensureDir(outDir);

  const entries = {};

  for (const spec of SOUNDS) {
    const file = path.join(outDir, `${spec.id}.mp3`);
    if (!force && (await exists(file))) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = {
        file: `audio/${spec.id}.mp3`,
        seconds: spec.seconds,
        bytes: await size(file),
        ...(spec.loop ? { loop: true } : {}),
      };
      continue;
    }

    let rate = RATE;
    let seconds = spec.seconds;
    let buffer;
    let samples = removeDc(synthesiseSound(spec, RATE));

    if (spec.loop) {
      if (rate !== LOOP_RATE) {
        samples = resample(samples, rate, LOOP_RATE);
        rate = LOOP_RATE;
      }
      samples = makeLoop(samples, rate, spec.seconds, 1.5);
    } else {
      samples = edgeFade(samples, rate, 0.004);
    }

    const { samples: levelled, gain, rms } = normalise(samples, {
      targetRms: 0.11 * (spec.gain ?? 1),
      peak: 0.94,
    });
    seconds = levelled.length / rate;

    buffer = encodeMp3(levelled, rate, spec.loop ? LOOP_KBPS : CUE_KBPS);
    await write(file, buffer);

    entries[spec.id] = {
      file: `audio/${spec.id}.mp3`,
      seconds: Number(seconds.toFixed(2)),
      bytes: buffer.length,
      ...(spec.loop ? { loop: true } : {}),
    };
    log.done(
      `${spec.id} — ${seconds.toFixed(2)}s mp3, ` +
        `${bytes(buffer.length)}, gain ×${gain.toFixed(2)} → rms ${rms.toFixed(3)} → ${rel(file)}`
    );
  }

  const acoustics = await runAcoustics({ force, outDir });
  return { sounds: entries, acoustics };
}

/**
 * Impulse responses — the new asset class.
 *
 * Written as WAV, not MP3, and that is not an oversight. This is data the mixer
 * convolves rather than a sound anyone hears, and lossy coding of an impulse
 * smears its transients and adds pre-echo — which on a reverb is precisely the
 * artefact you would notice. Same argument that keeps the normal maps out of
 * the palette quantiser.
 */
async function runAcoustics({ force, outDir }) {
  const entries = {};

  for (const spec of ACOUSTICS) {
    const file = path.join(outDir, `${spec.id}.wav`);
    const rt60 = sabineOf(spec);

    if (!force && (await exists(file))) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = await acousticEntry(spec, file, rt60);
      continue;
    }

    const ir = synthesiseImpulseResponse(spec, IR_RATE);
    const buffer = encodeWav(ir.channels, IR_RATE);
    await write(file, buffer);
    entries[spec.id] = await acousticEntry(spec, file, rt60);
    log.done(
      `${spec.id} — ${spec.w}×${spec.d}×${spec.h} m, rt60 ${rt60.toFixed(2)}s, ` +
        `${ir.seconds.toFixed(2)}s ir, ${bytes(buffer.length)} → ${rel(file)}`
    );
  }

  return entries;
}

async function acousticEntry(spec, file, rt60) {
  return {
    file: `audio/${spec.id}.wav`,
    spaces: spec.spaces,
    box: [spec.w, spec.d, spec.h],
    absorption: spec.absorption,
    // The Sabine estimate travels with the response so the CI check can compare
    // what was generated against the box it claims to have come from, without
    // recomputing it from a second copy of the room table.
    sabine: Number(rt60.toFixed(3)),
    bytes: await size(file),
  };
}

function sabineOf({ w, d, h, absorption }) {
  const volume = w * d * h;
  const surface = 2 * (w * d + w * h + d * h);
  return (0.161 * volume) / (surface * absorption);
}
