import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { LAYERS, exportScene } from './export.js';

/**
 * `npm run bake:light`: Blender lights the house's charts (9.4.4).
 *
 * Exports the house from our code, runs the pinned Blender over it with
 * bake.py, and writes one 16-bit PNG of light per chart to
 * pipeline/house/light/, with `inputs.json` naming the hash of everything
 * that went in. Those files are committed: the pipeline composes them, and
 * neither CI nor the deploy runs Blender. The pipeline fails if the hash no
 * longer matches the house (`checkLight`).
 *
 * A map stores light, the factor a white surface's colour is multiplied by,
 * as RGBE: an 8-bit mantissa per channel and a shared exponent in alpha, so
 * the dark corners keep their precision beside the lamp's pool.
 */
export const BLENDER_VERSION = '4.2.3';
export const SAMPLES = Number(process.env.BAKE_SAMPLES || 1024);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIGHT_DIR = path.resolve(HERE, '../light');
const TEXTURES = path.resolve(HERE, '../../../public/assets/house/textures');

/** Fails, naming the remedy, if the committed light no longer belongs to the house. */
export async function checkLight(textureDir = TEXTURES) {
  const { hash, scene } = await exportScene(textureDir);
  const file = path.join(LIGHT_DIR, 'inputs.json');
  const committed = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  if (!committed || committed.hash !== hash) {
    throw new Error(
      `the baked light in pipeline/house/light is stale: the house, its lamps or bake.py changed since it was baked (${committed?.hash?.slice(0, 12) ?? 'none'} → ${hash.slice(0, 12)}). Run npm run bake:light and commit the result.`
    );
  }
  return { scene, committed };
}

/** A chart's light, one Float32Array of RGB per layer, rows top first, from its committed PNGs. */
export async function readLight(id) {
  const layers = {};
  let size;
  for (const layer of LAYERS) {
    const { data, info } = await sharp(path.join(LIGHT_DIR, `${id}.${layer}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = new Float32Array(info.width * info.height * 3);
    for (let p = 0; p < info.width * info.height; p++) {
      const e = data[p * 4 + 3];
      const f = e === 0 ? 0 : 2 ** (e - 136);
      for (let k = 0; k < 3; k++) out[p * 3 + k] = (data[p * 4 + k] + 0.5) * f;
    }
    layers[layer] = out;
    size = { w: info.width, h: info.height };
  }
  return { layers, ...size };
}

/** RGBE: three 8-bit mantissas sharing the exponent in alpha, as Radiance's .hdr keeps light. */
function rgbe(r, g, b, out, o) {
  const m = Math.max(r, g, b);
  if (m < 1e-9) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  const e = Math.ceil(Math.log2(m / (255.5 / 256)));
  const f = 2 ** -(e - 8);
  out[o] = Math.min(255, Math.floor(r * f));
  out[o + 1] = Math.min(255, Math.floor(g * f));
  out[o + 2] = Math.min(255, Math.floor(b * f));
  out[o + 3] = e + 128;
}

async function main() {
  const blender = process.env.BLENDER || '/opt/blender-4.2.3-linux-x64/blender';
  const version = execFileSync(blender, ['-b', '--factory-startup', '--version'], { encoding: 'utf8' });
  if (!version.includes(`Blender ${BLENDER_VERSION}`)) throw new Error(`bake:light wants Blender ${BLENDER_VERSION}; ${blender} is ${version.split('\n')[0]}`);
  const { scene, json, bin, hash } = await exportScene(TEXTURES);
  const work = mkdtempSync(path.join(os.tmpdir(), 'house-light-'));
  writeFileSync(path.join(work, 'scene.json'), json);
  writeFileSync(path.join(work, 'scene.bin'), bin);
  const raw = path.join(work, 'raw');
  const t0 = Date.now();
  execFileSync(blender, ['-b', '--factory-startup', '--python', path.join(HERE, 'bake.py'), '--', work, raw, String(SAMPLES)], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  mkdirSync(LIGHT_DIR, { recursive: true });
  for (const c of scene.charts) {
    for (const layer of LAYERS) {
      const f = readFileSync(path.join(raw, `${c.id}.${layer}.f32`));
      const px = new Float32Array(f.buffer, f.byteOffset, f.length / 4);
      const out = Buffer.alloc(c.w * c.h * 4);
      for (let y = 0; y < c.h; y++) {
        // Blender keeps rows bottom first; a PNG is top first.
        const src = (c.h - 1 - y) * c.w;
        for (let x = 0; x < c.w; x++) {
          const i = (src + x) * 4;
          rgbe(Math.max(0, px[i]), Math.max(0, px[i + 1]), Math.max(0, px[i + 2]), out, (y * c.w + x) * 4);
        }
      }
      await sharp(out, { raw: { width: c.w, height: c.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(LIGHT_DIR, `${c.id}.${layer}.png`));
    }
  }
  writeFileSync(
    path.join(LIGHT_DIR, 'inputs.json'),
    JSON.stringify({ hash, blender: BLENDER_VERSION, samples: SAMPLES, layers: LAYERS, charts: scene.charts.map((c) => c.id) }, null, 2) + '\n'
  );
  rmSync(work, { recursive: true, force: true });
  console.log(`bake:light — ${scene.charts.length} charts in ${((Date.now() - t0) / 1000).toFixed(0)} s, hash ${hash.slice(0, 12)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
