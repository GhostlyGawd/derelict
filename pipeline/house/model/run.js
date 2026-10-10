import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * `npm run paint:fill`: the house's materials, cut from the owner's painting
 * (9.3, the hall modelled to the painting, its materials cut from it).
 *
 * 1. The painting's corners, where it shows the device and the two panels
 *    that are the game's own HUD, are painted out by the model (fill.py),
 *    once, into `hall.filled.jpg`.
 * 2. Each swatch in hall.json is cut from the painting square-on, at its
 *    texture's own texels per metre (swatch.js).
 * 3. Each is grown into a repeating texture (swatches.py): image quilting
 *    rearranges the painting's own paint to the texture's size, and the model
 *    only mends the seam where it wraps.
 *
 * Everything it writes is committed under pipeline/house/concept/, with
 * `swatches.json` naming the hash of every file that went in. The pipeline
 * uses the swatches in place of the generated surfaces they replace, and
 * fails if they are stale; neither CI nor the deploy runs the model.
 *
 * The model is Stable Diffusion 1.5's inpainting weights (CreativeML
 * OpenRAIL-M: free, and allowed in a game), run on the CPU through diffusers,
 * from a Python with torch and diffusers installed (MODEL_PYTHON).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const CONCEPT = path.resolve(HERE, '../concept');
const SWATCHES = path.join(CONCEPT, 'swatches');
const FILLED = path.join(CONCEPT, 'hall.filled.jpg');
const STAMP = path.join(CONCEPT, 'swatches.json');

/** What the swatches are made from: the painting, the job, the scripts, and where the painter stood. */
export const SWATCH_SOURCES = [
  'pipeline/house/concept/hall.jpg', 'pipeline/house/model/hall.json', 'pipeline/house/model/fill.py',
  'pipeline/house/model/swatches.py', 'pipeline/house/model/swatch.js', 'pipeline/house/model/run.js',
  'src/house/painter.js', 'src/house/layout.js',
];

export function swatchHash() {
  const h = createHash('sha256');
  for (const file of SWATCH_SOURCES) h.update(file).update('\0').update(readFileSync(path.join(ROOT, file))).update('\0');
  return h.digest('hex');
}

/** The committed swatches, by texture id; empty until the model has grown them. Fails if they are stale. */
export function paintedSwatches() {
  if (!existsSync(STAMP)) return {};
  const stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
  const hash = swatchHash();
  if (stamp.hash !== hash) {
    throw new Error(
      `the swatches cut from the owner's painting in pipeline/house/concept are stale: a file they were made from changed since (SWATCH_SOURCES in model/run.js) (${stamp.hash.slice(0, 12)} → ${hash.slice(0, 12)}). Run npm run paint:fill and commit the result.`
    );
  }
  return Object.fromEntries(stamp.swatches.map((id) => [id, path.join(SWATCHES, `${id}.png`)]));
}

async function main() {
  const python = process.env.MODEL_PYTHON || 'python3';
  const job = JSON.parse(readFileSync(path.join(HERE, 'hall.json'), 'utf8'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'house-swatch-'));
  const t0 = Date.now();
  const run = (script, items) => {
    const file = path.join(work, `job-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ ...job, items }));
    execFileSync(python, ['-I', path.join(HERE, script), file], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  };

  // 1. The HUD out of the painting's corners.
  if (!existsSync(FILLED) || process.argv.includes('--refill')) {
    const meta = await sharp(path.join(CONCEPT, 'hall.jpg')).metadata();
    const hud = new Uint8Array(meta.width * meta.height);
    for (const [x0, y0, x1, y1] of job.hud) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hud[y * meta.width + x] = 255;
    const mask = path.join(work, 'hud.png');
    await sharp(Buffer.from(hud), { raw: { width: meta.width, height: meta.height, channels: 1 } }).png().toFile(mask);
    run('fill.py', [{ image: path.join(CONCEPT, 'hall.jpg'), mask, prompt: job.hudPrompt, out: FILLED, seed: 1 }]);
  }

  // 2. Each swatch cut square-on, at its texture's texels per metre.
  const { rectify } = await import('./swatch.js');
  mkdirSync(SWATCHES, { recursive: true });
  const items = [];
  for (const [id, s] of Object.entries(job.swatches)) {
    // The swatch at the texture's own density: the texture covers `texMetres` across its `size`.
    const perMetre = s.size[0] / s.texMetres;
    const cut = await rectify(FILLED, s.plane, perMetre);
    const file = path.join(work, `${id}.png`);
    await sharp(Buffer.from(cut.rgb), { raw: { width: cut.w, height: cut.h, channels: 3 } }).png().toFile(file);
    items.push({ ...s.grow, swatch: file, size: s.size, prompt: s.prompt, out: path.join(SWATCHES, `${id}.png`) });
  }

  // 3. Grown into repeating textures.
  run('swatches.py', items);

  writeFileSync(STAMP, JSON.stringify({ hash: swatchHash(), sources: SWATCH_SOURCES, swatches: Object.keys(job.swatches) }, null, 2) + '\n');
  rmSync(work, { recursive: true, force: true });
  console.log(`paint:fill — ${items.length} swatches in ${((Date.now() - t0) / 1000).toFixed(0)} s, hash ${swatchHash().slice(0, 12)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
