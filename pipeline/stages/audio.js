import path from 'node:path';

import { SOUNDS } from '../manifest.js';
import { synthesiseSound } from '../offline/audio.js';
import {
  edgeFade,
  encodeMp3,
  encodeWav,
  makeLoop,
  normalise,
  pcm16ToFloat,
  removeDc,
  resample,
} from '../lib/audio.js';
import { ASSETS, bytes, ensureDir, exists, rel, size, write } from '../lib/io.js';
import { log } from '../lib/log.js';
import { generateSound } from '../providers/audio.js';

/**
 * Stage 4 — audio.
 *
 * generate → loudness-normalise → save. Looping ambience is built into a
 * seamless loop of the requested length and shipped as WAV; MP3's encoder
 * padding leaves an audible gap at the loop point, which you notice
 * immediately on a 30 second bed.
 */

const RATE = 44100;
const LOOP_RATE = 22050;

export async function runAudio({ backend, force = false }) {
  log.stage('audio');
  const outDir = path.join(ASSETS, 'audio');
  await ensureDir(outDir);

  const entries = {};

  for (const spec of SOUNDS) {
    const extension = spec.loop ? 'wav' : 'mp3';
    const file = path.join(outDir, `${spec.id}.${extension}`);
    if (!force && (await exists(file))) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = {
        file: `audio/${spec.id}.${extension}`,
        seconds: spec.seconds,
        bytes: await size(file),
        ...(spec.loop ? { loop: true } : {}),
      };
      continue;
    }

    let samples;
    let rate = RATE;
    let passthrough = null;

    if (backend === 'provider') {
      const result = await generateSound(spec.prompt, { seconds: spec.seconds });
      if (result.format === 'pcm') {
        samples = pcm16ToFloat(result.data);
        rate = result.sampleRate;
      } else {
        // Compressed audio we cannot decode without a codec — ship it as it
        // came back and say so, rather than pretending it was normalised.
        passthrough = result.data;
        log.warn(`${spec.id} — provider returned ${result.format}; skipped loudness normalisation`);
      }
    } else {
      samples = synthesiseSound(spec, RATE);
    }

    let buffer;
    let seconds = spec.seconds;

    if (passthrough) {
      buffer = passthrough;
      await write(path.join(outDir, `${spec.id}.mp3`), buffer);
      entries[spec.id] = { file: `audio/${spec.id}.mp3`, seconds, bytes: buffer.length };
      log.done(`${spec.id} — ${bytes(buffer.length)} (passthrough)`);
      continue;
    }

    samples = removeDc(samples);

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

    buffer = spec.loop ? encodeWav(levelled, rate) : encodeMp3(levelled, rate, 96);
    await write(file, buffer);

    entries[spec.id] = {
      file: `audio/${spec.id}.${extension}`,
      seconds: Number(seconds.toFixed(2)),
      bytes: buffer.length,
      ...(spec.loop ? { loop: true } : {}),
    };
    log.done(
      `${spec.id} — ${seconds.toFixed(2)}s ${extension}, ` +
        `${bytes(buffer.length)}, gain ×${gain.toFixed(2)} → rms ${rms.toFixed(3)} → ${rel(file)}`
    );
  }

  return entries;
}
