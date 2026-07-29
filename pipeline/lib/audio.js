import lamejs from '@breezystack/lamejs';

/**
 * Audio post-processing shared by both backends: loudness normalisation, loop
 * construction, and encoding.
 *
 * Everything works on mono Float32 samples in −1..1. Short cues ship as MP3;
 * the looping ambience ships as WAV, because MP3's encoder padding puts an
 * audible gap at the loop point.
 */

export function pcm16ToFloat(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const count = Math.floor(buffer.byteLength / 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

export function floatToPcm16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return out;
}

/**
 * Peak-limited RMS normalisation. Targets a consistent perceived level across
 * the set, then guarantees headroom so nothing clips on playback.
 */
export function normalise(samples, { targetRms = 0.12, peak = 0.92 } = {}) {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  if (rms < 1e-6) return { samples, gain: 1, rms: 0 };

  let gain = targetRms / rms;
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) maxAbs = Math.max(maxAbs, Math.abs(samples[i]));
  if (maxAbs * gain > peak) gain = peak / maxAbs;

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return { samples: out, gain, rms: rms * gain };
}

/** Trims DC offset, which otherwise eats headroom on synthesised material. */
export function removeDc(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / Math.max(1, samples.length);
  if (Math.abs(mean) < 1e-6) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - mean;
  return out;
}

/** Short fades so a one-shot never starts or ends on a discontinuity. */
export function edgeFade(samples, sampleRate, seconds = 0.004) {
  const n = Math.min(Math.floor(seconds * sampleRate), Math.floor(samples.length / 2));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    samples[i] *= k;
    samples[samples.length - 1 - i] *= k;
  }
  return samples;
}

/**
 * Builds a seamless loop of `seconds` by crossfading the tail back over the
 * head. Also used to stretch a provider clip that came back shorter than the
 * requested loop length.
 */
export function makeLoop(samples, sampleRate, seconds, crossfadeSeconds = 1.5) {
  const target = Math.floor(seconds * sampleRate);
  const fade = Math.floor(crossfadeSeconds * sampleRate);

  // Tile the source until there is enough material to cut a loop from.
  let source = samples;
  if (source.length < target + fade) {
    const copies = Math.ceil((target + fade) / source.length);
    const tiled = new Float32Array(source.length * copies);
    for (let c = 0; c < copies; c++) tiled.set(source, c * source.length);
    source = tiled;
  }

  const out = new Float32Array(target);
  out.set(source.subarray(0, target));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + source[target + i] * (1 - k);
  }
  return out;
}

export function encodeWav(samples, sampleRate) {
  const pcm = floatToPcm16(samples);
  const dataBytes = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buffer.writeInt16LE(pcm[i], 44 + i * 2);
  return buffer;
}

export function encodeMp3(samples, sampleRate, kbps = 96) {
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps);
  const pcm = floatToPcm16(samples);
  const block = 1152;
  const chunks = [];
  for (let i = 0; i < pcm.length; i += block) {
    const encoded = encoder.encodeBuffer(pcm.subarray(i, Math.min(i + block, pcm.length)));
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

/** Cheap linear resample — only ever used to drop a rate, never to raise it. */
export function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = to / from;
  const length = Math.floor(samples.length * ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = samples[i0] * (1 - t) + samples[i1] * t;
  }
  return out;
}
