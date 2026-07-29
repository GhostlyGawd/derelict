import path from 'node:path';
import fs from 'node:fs/promises';

import { TEXTURES } from '../manifest.js';
import { synthesiseTexture } from '../offline/textures.js';
import { contactSheet, crunchTexture, encodeRaster } from '../lib/image.js';
import { ASSETS, CACHE, bytes, ensureDir, exists, rel, sha1, size, write } from '../lib/io.js';
import { log } from '../lib/log.js';
import { generateImage } from '../providers/images.js';

/**
 * Stage 2 — textures.
 *
 * generate → downscale into the 256–512 px band → save to /public/assets.
 * Provider output is cached by prompt hash so re-running the post-process
 * never re-bills a generation.
 */
export async function runTextures({ backend, force = false }) {
  log.stage('textures');
  const outDir = path.join(ASSETS, 'textures');
  await ensureDir(outDir);

  const entries = {};
  const sheet = [];

  for (const spec of TEXTURES) {
    const file = path.join(outDir, `${spec.id}.png`);
    if (!force && (await exists(file))) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = manifestEntry(spec, await size(file));
      sheet.push({ buffer: await fs.readFile(file) });
      continue;
    }

    const raw =
      backend === 'provider'
        ? await generateWithCache(spec)
        : await encodeRaster(synthesiseTexture(spec, spec.size * 2));

    const crunched = await crunchTexture(raw, spec.size);
    await write(file, crunched);
    entries[spec.id] = manifestEntry(spec, crunched.length);
    sheet.push({ buffer: crunched });
    log.done(`${spec.id} — ${spec.size}px, ${bytes(crunched.length)} → ${rel(file)}`);
  }

  await write(path.join(CACHE, 'textures-contact.png'), await contactSheet(sheet));
  log.note(`contact sheet → ${rel(path.join(CACHE, 'textures-contact.png'))}`);
  return entries;
}

function manifestEntry(spec, byteLength) {
  return {
    file: `textures/${spec.id}.png`,
    size: spec.size,
    bytes: byteLength,
    ...(spec.emissive ? { emissive: true } : {}),
  };
}

async function generateWithCache(spec) {
  const key = sha1(`${spec.prompt}|${spec.size}|${process.env.IMAGE_PROVIDER || 'auto'}`);
  const cached = path.join(CACHE, 'images', `${spec.id}-${key}.png`);
  if (await exists(cached)) {
    log.note(`cache hit ${rel(cached)}`);
    return fs.readFile(cached);
  }
  const buffer = await generateImage(spec.prompt, { width: 1024, height: 1024 });
  await write(cached, buffer);
  return buffer;
}
