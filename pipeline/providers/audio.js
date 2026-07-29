import { log } from '../lib/log.js';
import { requestBuffer } from '../lib/http.js';

/**
 * Text→sound-effect generation (ElevenLabs sound generation).
 *
 * The service caps a single request well below the 30 s the ambient loop
 * needs, so long sounds are requested at the maximum length and the audio
 * post-process extends them into a seamless loop.
 */

const MAX_SECONDS = Number(process.env.SFX_MAX_SECONDS || 22);

export function audioProviderStatus() {
  return {
    name: 'elevenlabs',
    ready: Boolean(process.env.ELEVENLABS_API_KEY),
    hint: 'set ELEVENLABS_API_KEY',
  };
}

export function requestedSeconds(seconds) {
  return Math.min(seconds, MAX_SECONDS);
}

/**
 * Returns `{ format: 'pcm' | 'mp3', data, sampleRate }`.
 *
 * Raw PCM is requested by default so the audio post-process can actually
 * normalise loudness and build loops; if the service hands back compressed
 * audio anyway, the stage ships it untouched and says so.
 */
export async function generateSound(prompt, { seconds = 4, influence = 0.45 } = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');

  const duration = requestedSeconds(seconds);
  const format = process.env.SFX_OUTPUT_FORMAT || 'pcm_44100';
  log.note(`elevenlabs ${duration.toFixed(1)}s ${format}: ${prompt.slice(0, 80)}…`);

  const data = await requestBuffer(
    `https://api.elevenlabs.io/v1/sound-generation?output_format=${encodeURIComponent(format)}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: duration,
        prompt_influence: influence,
      }),
    },
    { label: 'elevenlabs sound-generation' }
  );

  if (format.startsWith('pcm_')) {
    return { format: 'pcm', data, sampleRate: Number(format.slice(4)) || 44100 };
  }
  return { format: format.startsWith('mp3') ? 'mp3' : format, data, sampleRate: 44100 };
}
