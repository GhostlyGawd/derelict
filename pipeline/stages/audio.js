import path from 'node:path';

import { SOUNDS } from '../manifest.js';
import { synthesiseSound } from '../offline/audio.js';
import {
  edgeFade,
  encodeMp3,
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

  return entries;
}
