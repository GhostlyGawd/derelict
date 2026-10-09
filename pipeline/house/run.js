#!/usr/bin/env node
import path from 'node:path';
import sharp from 'sharp';

import { crunchTexture, encodeRaster, encodeNormal } from '../lib/image.js';
import { ASSETS, bytes, rel, write, writeJson } from '../lib/io.js';
import { log } from '../lib/log.js';
import { normalMapFrom } from '../lib/normal.js';
import { STYLE_BIBLE_HOUSE, TARGET } from './style.js';
import { BAKED_ROOMS, bakeRooms, readLook } from './bake.js';
import { HOUSE_TEXTURES, gradeLut } from './textures.js';

/**
 * The house's asset pipeline (phase 9). Its own manifest, beside the ship's,
 * so nothing the house adds touches what the ship loads.
 *
 *   node pipeline/house/run.js
 */
const OUT = path.join(ASSETS, 'house');

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function main() {
  log.stage('house — style bible');
  log.note(STYLE_BIBLE_HOUSE);
  const manifest = { textures: {}, grade: null, baked: {}, target: TARGET };

  log.stage('house — textures');
  for (const spec of HOUSE_TEXTURES) {
    // Drawn at twice the size so the downscale has real detail to resolve.
    const source = spec.draw(spec.size * 2, seedOf(`house:${spec.id}`));
    const png = await crunchTexture(await encodeRaster(source), spec.size);
    const file = path.join(OUT, 'textures', `${spec.id}.png`);
    await write(file, png);
    const normal = await encodeNormal(normalMapFrom(source, spec.size));
    const normalFile = path.join(OUT, 'textures', `${spec.id}_n.png`);
    await write(normalFile, normal);
    manifest.textures[spec.id] = {
      file: `/assets/house/textures/${spec.id}.png`,
      normal: `/assets/house/textures/${spec.id}_n.png`,
      size: spec.size,
      bytes: png.length + normal.length,
    };
    log.done(`${spec.id} — ${spec.size}px, ${spec.note}, ${bytes(png.length)} → ${rel(file)}`);
  }

  log.stage('house — colour grade');
  const lut = gradeLut(readLook().grade);
  const lutPng = await sharp(Buffer.from(lut.data.buffer), { raw: { width: lut.width, height: lut.height, channels: 3 } })
    .png({ compressionLevel: 9, effort: 10, palette: false, adaptiveFiltering: false })
    .toBuffer();
  const lutFile = path.join(OUT, 'grade.png');
  await write(lutFile, lutPng);
  manifest.grade = { file: '/assets/house/grade.png', size: 16, bytes: lutPng.length };
  // The look's live knobs, for the materials the game lights itself (9.4.4).
  manifest.live = readLook().live;
  log.done(`grade — 16³ lookup table, ${bytes(lutPng.length)} → ${rel(lutFile)}`);

  log.stage(`house — baked surfaces (${BAKED_ROOMS.join(', ')})`);
  const baked = await bakeRooms(path.join(OUT, 'textures'), (c, w, h, n) => log.done(`${c.id} — ${w}×${h}, ${bytes(n)}`));
  for (const b of baked) {
    const file = path.join(OUT, 'baked', `${b.id}.png`);
    await write(file, b.png);
    manifest.baked[b.id] = { file: `/assets/house/baked/${b.id}.png`, width: b.w, height: b.h, bytes: b.png.length };
  }

  await writeJson(path.join(OUT, 'manifest.json'), manifest);
  log.done(`manifest → ${rel(path.join(OUT, 'manifest.json'))}`);
}

main().catch((err) => {
  log.fail(err.stack || String(err));
  process.exit(1);
});
