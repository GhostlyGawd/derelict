import path from 'node:path';
import fs from 'node:fs/promises';

import { TEXTURES } from '../manifest.js';
import { synthesiseGlyphAtlas } from '../offline/glyphatlas.js';
import { synthesiseTexture } from '../offline/textures.js';
import { contactSheet, crunchTexture, encodeMask, encodeNormal, encodeRaster } from '../lib/image.js';
import { normalMapFrom, reliefCoverage } from '../lib/normal.js';
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
    const normalFile = path.join(outDir, `${spec.id}_n.png`);
    // The atlas's metrics are derived, not stored, so they have to be recomputed
    // even on a cache hit — the glyph tables are the source of truth for them.
    const glyphs = spec.atlas ? synthesiseGlyphAtlas(spec) : null;

    if (!force && (await exists(file)) && (!spec.relief || (await exists(normalFile)))) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = manifestEntry(
        spec,
        await size(file),
        glyphs?.metrics,
        spec.relief ? await size(normalFile) : undefined
      );
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
    const source = synthesiseTexture(spec, spec.size * 2);
    const raw = await encodeRaster(source);

    const crunched = await crunchTexture(raw, spec.size);
    await write(file, crunched);
    sheet.push({ buffer: crunched });

    // Relief comes off the same composed surface, at its final size. Derived
    // here rather than resized from a source-resolution map, because averaging
    // encoded normals denormalises them and flattens what the map is for.
    let relief = null;
    if (spec.relief) {
      const normal = normalMapFrom(source, spec.size);
      const png = await encodeNormal(normal);
      await write(normalFile, png);
      relief = { bytes: png.length, coverage: reliefCoverage(normal) };
    }

    entries[spec.id] = manifestEntry(spec, crunched.length, undefined, relief?.bytes);
    log.done(
      `${spec.id} — ${spec.size}px, ${bytes(crunched.length)} → ${rel(file)}` +
        (relief
          ? `  + normal ${bytes(relief.bytes)}, ${(relief.coverage * 100).toFixed(0)}% relieved`
          : '')
    );
  }

  await write(path.join(CACHE, 'textures-contact.png'), await contactSheet(sheet));
  log.note(`contact sheet → ${rel(path.join(CACHE, 'textures-contact.png'))}`);
  return entries;
}

/**
 * `coverage` is deliberately absent: it is a diagnostic for the run log, and a
 * field that exists only on a fresh run would make the manifest differ between
 * a cached build and a clean one — which is exactly what the determinism gate
 * is there to catch. Byte counts come from the file either way, so they agree.
 */
function manifestEntry(spec, byteLength, glyphs, normalBytes) {
  return {
    file: `textures/${spec.id}.png`,
    size: spec.size,
    bytes: byteLength,
    ...(spec.relief ? { normal: `textures/${spec.id}_n.png`, normalBytes } : {}),
    ...(spec.emissive ? { emissive: true } : {}),
    ...(glyphs ? { glyphs } : {}),
  };
}

