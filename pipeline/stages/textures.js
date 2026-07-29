import path from 'node:path';
import fs from 'node:fs/promises';

import { TEXTURES } from '../manifest.js';
import { synthesiseTexture } from '../offline/textures.js';
import { contactSheet, crunchTexture, encodeRaster } from '../lib/image.js';
import { ASSETS, CACHE, bytes, ensureDir, exists, rel, size, write } from '../lib/io.js';
import { log } from '../lib/log.js';

/**
 * Stage 2 — textures.
 *
 * synthesise → downscale into the 256–512 px band → save to /public/assets.
 */
export async function runTextures({ force = false }) {
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

    // Synthesised at double the target so the downscale has real detail to
    // resolve rather than just re-sampling flat pixels.
    const raw = await encodeRaster(synthesiseTexture(spec, spec.size * 2));

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

