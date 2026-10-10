import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * `npm run paint:fill`: the owner's painting, made into the hall's surfaces
 * (9.3, the owner's painting as a source).
 *
 * 1. The painting's corners, where it shows a device and two panels that are
 *    the game's HUD rather than the hall, are painted out by the model.
 * 2. The painting is unwrapped onto the hall's walls, floor and ceiling from
 *    where it was painted (unwrap.js).
 * 3. The model paints every part of them the painter could not see, from the
 *    paint round it. A surface the painter had behind them is painted beside
 *    one they could see, as its guide.
 *
 * Everything it writes is committed, under pipeline/house/concept/, with
 * `fill.json` naming the hash of every file that went in. The pipeline copies
 * it and fails if it is stale; neither CI nor the deploy runs the model.
 *
 * The model is Stable Diffusion 1.5's inpainting weights (CreativeML
 * OpenRAIL-M: free, and allowed in a game), run on the CPU through diffusers,
 * from a Python with torch and diffusers installed (MODEL_PYTHON).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const CONCEPT = path.resolve(HERE, '../concept');
const CHARTS = path.join(CONCEPT, 'charts');
const FILLED = path.join(CONCEPT, 'hall.filled.jpg');
const STAMP = path.join(CONCEPT, 'fill.json');

/**
 * What the fill is made from: the painting, the job, the model's script, and
 * everything that decides where the hall's surfaces are and what hides them.
 */
export const FILL_SOURCES = [
  'pipeline/house/concept/hall.jpg', 'pipeline/house/model/hall.json', 'pipeline/house/model/fill.py',
  'pipeline/house/model/unwrap.js', 'pipeline/house/model/colour.js', 'pipeline/house/model/run.js', 'pipeline/house/bake.js',
  'src/house/layout.js', 'src/house/level.js', 'src/house/dress.js', 'src/house/rooms.js',
  'src/house/things.js', 'src/house/furniture.js', 'src/house/charts.js', 'src/house/painter.js',
];

export function fillHash() {
  const h = createHash('sha256');
  for (const file of FILL_SOURCES) h.update(file).update('\0').update(readFileSync(path.join(ROOT, file))).update('\0');
  return h.digest('hex');
}

function stamp() {
  if (!existsSync(STAMP)) return null;
  const s = JSON.parse(readFileSync(STAMP, 'utf8'));
  const hash = fillHash();
  if (s.hash !== hash) {
    throw new Error(
      `the owner's painting, as filled in pipeline/house/concept, is stale: a file it was made from changed since (FILL_SOURCES in model/run.js) (${s.hash.slice(0, 12)} → ${hash.slice(0, 12)}). Run npm run paint:fill and commit the result.`
    );
  }
  return s;
}

/** The painting the projector shows: filled where the model has filled it. */
export function paintingSource() {
  return stamp() ? FILLED : path.join(CONCEPT, 'hall.jpg');
}

/** The hall's painted charts, by id, as committed files; empty until the model has painted them. */
export function paintedCharts() {
  const s = stamp();
  return s ? Object.fromEntries(s.charts.map((id) => [id, path.join(CHARTS, `${id}.jpg`)])) : {};
}

async function main() {
  const python = process.env.MODEL_PYTHON || 'python3';
  const job = JSON.parse(readFileSync(path.join(HERE, 'hall.json'), 'utf8'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'house-fill-'));
  const t0 = Date.now();
  const run = (items) => {
    const file = path.join(work, `job-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ ...job, items }));
    execFileSync(python, ['-I', path.join(HERE, 'fill.py'), file], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  };
  const maskFile = async (mask, w, h, name) => {
    const file = path.join(work, name);
    await sharp(Buffer.from(mask), { raw: { width: w, height: h, channels: 1 } }).png().toFile(file);
    return file;
  };

  // 1. The HUD out of the painting's corners.
  const meta = await sharp(path.join(CONCEPT, 'hall.jpg')).metadata();
  const hud = new Uint8Array(meta.width * meta.height);
  for (const [x0, y0, x1, y1] of job.hud) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hud[y * meta.width + x] = 255;
  run([{ image: path.join(CONCEPT, 'hall.jpg'), mask: await maskFile(hud, meta.width, meta.height, 'hud.png'), prompt: job.hudPrompt, out: FILLED, seed: 1 }]);

  // 2. Unwrapped onto the hall, from the filled painting.
  const { unwrapHall } = await import('./unwrap.js');
  const { seedChart, targets } = await import('./colour.js');
  const unwrapped = await unwrapHall(FILLED);
  const target = targets(unwrapped);
  const textures = path.join(ROOT, 'public/assets/house/textures');
  mkdirSync(CHARTS, { recursive: true });
  const items = [];
  const behind = [];
  for (const [i, u] of unwrapped.entries()) {
    const id = u.chart.id;
    const image = path.join(work, `${id}.png`);
    // Seeded with the house's own surface in the painting's colours, which the model repaints.
    const seeded = await seedChart(u, textures, job.seed[u.chart.kind], job.tile, target.get(id));
    await sharp(Buffer.from(seeded), { raw: { width: u.w, height: u.h, channels: 3 } }).png().toFile(image);
    const item = {
      image,
      mask: await maskFile(u.mask, u.w, u.h, `${id}.mask.png`),
      prompt: job.prompts[u.chart.kind],
      out: path.join(CHARTS, `${id}.jpg`),
      seed: 100 * (i + 1),
      // A wall is repainted freely; a floor or ceiling only lightly, or the model paints a room onto it.
      strength: job.strength[u.chart.kind],
    };
    // 3. A surface the painter barely saw is painted beside the one they saw most of.
    if (u.seen < 0.05) behind.push({ item, kind: u.chart.kind });
    else items.push({ item, kind: u.chart.kind, seen: u.seen });
  }
  run(items.map((x) => x.item));
  for (const b of behind) {
    const donor = items.filter((x) => x.kind === b.kind).sort((a, c) => c.seen - a.seen)[0];
    b.item.donor = donor.item.out;
  }
  if (behind.length) run(behind.map((x) => x.item));

  writeFileSync(STAMP, JSON.stringify({ hash: fillHash(), sources: FILL_SOURCES, charts: unwrapped.map((u) => u.chart.id) }, null, 2) + '\n');
  rmSync(work, { recursive: true, force: true });
  console.log(`paint:fill — ${unwrapped.length} charts in ${((Date.now() - t0) / 1000).toFixed(0)} s, hash ${fillHash().slice(0, 12)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
