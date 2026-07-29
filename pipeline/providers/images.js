import { log } from '../lib/log.js';
import { requestBuffer, requestJson } from '../lib/http.js';

/**
 * Text→image generation.
 *
 * Three interchangeable providers; whichever one has a key in the environment
 * wins, or set IMAGE_PROVIDER explicitly. All of them return raw image bytes,
 * so the rest of the pipeline never knows which was used.
 */

export function detectImageProvider() {
  const forced = process.env.IMAGE_PROVIDER;
  if (forced) return forced;
  if (process.env.FAL_KEY) return 'fal';
  if (process.env.REPLICATE_API_TOKEN) return 'replicate';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export function imageProviderStatus() {
  const name = detectImageProvider();
  if (!name) return { name: null, ready: false, hint: 'set FAL_KEY, REPLICATE_API_TOKEN or OPENAI_API_KEY' };
  const key = KEYS[name];
  return {
    name,
    ready: Boolean(process.env[key]),
    hint: `set ${key}`,
  };
}

const KEYS = {
  fal: 'FAL_KEY',
  replicate: 'REPLICATE_API_TOKEN',
  openai: 'OPENAI_API_KEY',
};

export async function generateImage(prompt, { width = 1024, height = 1024, seed } = {}) {
  const name = detectImageProvider();
  if (!name) throw new Error('no image provider configured');
  const key = process.env[KEYS[name]];
  if (!key) throw new Error(`${KEYS[name]} is not set`);

  log.note(`${name}: ${prompt.slice(0, 96)}…`);
  switch (name) {
    case 'fal':
      return viaFal(prompt, { width, height, seed, key });
    case 'replicate':
      return viaReplicate(prompt, { width, height, seed, key });
    case 'openai':
      return viaOpenAI(prompt, { width, height, key });
    default:
      throw new Error(`unknown IMAGE_PROVIDER "${name}"`);
  }
}

/* -------------------------------------------------------------------- fal */

async function viaFal(prompt, { width, height, seed, key }) {
  const model = process.env.FAL_MODEL || 'fal-ai/flux/dev';
  const body = {
    prompt,
    image_size: { width, height },
    num_images: 1,
    output_format: 'png',
    enable_safety_checker: false,
  };
  if (seed !== undefined) body.seed = seed;

  const json = await requestJson(
    `https://fal.run/${model}`,
    {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { label: `fal ${model}` }
  );

  const url = json?.images?.[0]?.url || json?.image?.url;
  if (!url) throw new Error(`fal returned no image: ${JSON.stringify(json).slice(0, 300)}`);
  return requestBuffer(url, {}, { label: 'fal image download' });
}

/* -------------------------------------------------------------- replicate */

async function viaReplicate(prompt, { width, height, seed, key }) {
  const model = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-dev';
  const input = {
    prompt,
    width,
    height,
    output_format: 'png',
    num_outputs: 1,
    disable_safety_checker: true,
  };
  if (seed !== undefined) input.seed = seed;

  const json = await requestJson(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({ input }),
    },
    { label: `replicate ${model}` }
  );

  const output = Array.isArray(json?.output) ? json.output[0] : json?.output;
  if (typeof output !== 'string') {
    throw new Error(`replicate returned no image: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return requestBuffer(output, {}, { label: 'replicate image download' });
}

/* ----------------------------------------------------------------- openai */

async function viaOpenAI(prompt, { width, height, key }) {
  const size = width === height ? '1024x1024' : width > height ? '1536x1024' : '1024x1536';
  const json = await requestJson(
    'https://api.openai.com/v1/images/generations',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt,
        size,
        n: 1,
      }),
    },
    { label: 'openai images' }
  );

  const b64 = json?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, 'base64');
  const url = json?.data?.[0]?.url;
  if (url) return requestBuffer(url, {}, { label: 'openai image download' });
  throw new Error(`openai returned no image: ${JSON.stringify(json).slice(0, 300)}`);
}
