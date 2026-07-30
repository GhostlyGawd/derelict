import path from 'node:path';
import fs from 'node:fs/promises';

import { TEXTURES } from '../manifest.js';
import { synthesiseGlyphAtlas } from '../offline/glyphatlas.js';
import { synthesiseTexture } from '../offline/textures.js';
import { contactSheet, crunchTexture, encodeMask, encodeRaster } from '../lib/image.js';
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
    // The atlas's metrics are derived, not stored, so they have to be recomputed
    // even on a cache hit — the glyph tables are the source of truth for them.
    const glyphs = spec.atlas ? synthesiseGlyphAtlas(spec) : null;

    if (!force && (await exists(file))) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = manifestEntry(spec, await size(file), glyphs?.metrics);
      sheet.push({ buffer: await fs.readFile(file) });
      continue;
    }

    if (glyphs) {
      // Written at 1:1 with no palette quantisation. This is a coverage mask
      // rather than a picture, and both the downscale and the dither exist to
      // make noisy colour cheap — on type they only cost contrast. Encoder
      // options are pinned rather than defaulted, or the sheet reproduces
      // differently on another libvips build.
      const png = await encodeMask(glyphs.raster);
      await write(file, png);
      entries[spec.id] = manifestEntry(spec, png.length, glyphs.metrics);
      sheet.push({ buffer: png });
      const count = Object.keys(glyphs.metrics.chars).length;
      log.done(`${spec.id} — ${spec.size}px, ${count} glyphs, ${bytes(png.length)} → ${rel(file)}`);
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

function manifestEntry(spec, byteLength, glyphs) {
  return {
    file: `textures/${spec.id}.png`,
    size: spec.size,
    bytes: byteLength,
    ...(spec.emissive ? { emissive: true } : {}),
    ...(glyphs ? { glyphs } : {}),
  };
}

