import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKERS, DOORS, STAIRS, openingFor, stairHeight } from '../../../src/house/layout.js';
import { RAIL } from '../../../src/house/level.js';
import { HOUSE_TEXTURES } from '../textures.js';
import { BLENDER_VERSION } from './version.js';

/**
 * `npm run model`: Blender models the house's pieces (9.3, the owner's look
 * at the modelled hall). Runs the pinned Blender over models.py, which writes
 * one GLB per piece to pipeline/house/models/, with `models.json` naming the
 * hash of everything that went in. Those files are committed: the pipeline
 * copies them into the build and fails if they are stale (`checkModels`), and
 * neither CI nor the deploy runs Blender.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
export const MODEL_DIR = path.resolve(HERE, '../models');
const STAMP = path.join(MODEL_DIR, 'models.json');

/** What the models are made from. */
export const MODEL_SOURCES = [
  'pipeline/house/blender/models.py', 'pipeline/house/blender/models.js', 'pipeline/house/textures.js',
  'pipeline/house/model/hall.json', 'src/house/layout.js', 'src/house/level.js',
];

export function modelHash() {
  const h = createHash('sha256');
  for (const file of MODEL_SOURCES) h.update(file).update('\0').update(readFileSync(path.join(ROOT, file))).update('\0');
  return h.digest('hex');
}

/** The committed models, by id, as files; fails, naming the remedy, if they are stale. */
export function checkModels() {
  if (!existsSync(STAMP)) return {};
  const stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
  const hash = modelHash();
  if (stamp.hash !== hash) {
    throw new Error(
      `the models in pipeline/house/models are stale: a file they were made from changed since (MODEL_SOURCES in blender/models.js) (${stamp.hash.slice(0, 12)} → ${hash.slice(0, 12)}). Run npm run model and commit the result.`
    );
  }
  return Object.fromEntries(stamp.models.map((id) => [id, path.join(MODEL_DIR, `${id}.glb`)]));
}

/** The metres one repeat of each texture stands for: the generated ones' own, or the swatch's. */
function metres() {
  const job = JSON.parse(readFileSync(path.join(ROOT, 'pipeline/house/model/hall.json'), 'utf8'));
  const out = {};
  for (const t of HOUSE_TEXTURES) {
    const s = job.swatches[t.id];
    if (s) out[t.id] = s.grow?.quilt === false ? s.plane.size : [s.texMetres, (s.texMetres * s.size[1]) / s.size[0]];
    else if (t.metres) out[t.id] = t.metres;
  }
  // Materials that wear another's texture.
  out.leather = out.wood;
  out.wicker = out.wood;
  out.iron = out.wood;
  out.enamel = [0.6, 0.6];
  out.cloth = out.curtain;
  return out;
}

/** The pieces: every door leaf at its opening's size, and the hall's furniture. */
export function pieces() {
  const doors = DOORS.map((d) => {
    const { opening } = openingFor(d.id);
    // The leaf's size in its opening, as things.js hangs it.
    const w = opening.width - 0.02;
    const h = opening.height - 0.01;
    return { id: `door-${d.id}`, kind: 'door', w, h, glazed: !!d.panes, panes: d.panes ? [2, 2] : undefined, seed: d.id.length };
  });
  return [
    ...doors,
    // Under the window, its front where the painting stands it off the wall.
    { id: 'cabinet', kind: 'cabinet', size: [0.6, 0.65, 0.74] },
    { id: 'chair', kind: 'chair' },
    { id: 'chest', kind: 'chest' },
    { id: 'vase', kind: 'vase', scale: 0.9 },
    { id: 'clock', kind: 'clock', radius: 0.065 },
    { id: 'lamp', kind: 'lamp' },
    // Across the hall between its side walls, and short of the stair slot.
    { id: 'joist', kind: 'joist', length: 4.87 },
    { id: 'joist-short', kind: 'joist', length: 3.82 },
    // As big as the painting shows it on the back wall: 0.43 m across, a metre with its loop.
    { id: 'bag', kind: 'bag', tall: 1.4 },
    { id: 'fixture', kind: 'fixture', scale: 2.4 },
    // The banister's posts, at the heights level.js stands them.
    { id: 'newel', kind: 'newel', height: stairHeight(BLOCKERS[0].z[1]) + RAIL + 0.12 },
    { id: 'baluster', kind: 'baluster', height: RAIL - 0.1 },
    { id: 'rag', kind: 'rag' },
  ];
}

async function main() {
  const blender = process.env.BLENDER || '/opt/blender-4.2.3-linux-x64/blender';
  const version = execFileSync(blender, ['-b', '--factory-startup', '--version'], { encoding: 'utf8' });
  if (!version.includes(`Blender ${BLENDER_VERSION}`)) throw new Error(`model wants Blender ${BLENDER_VERSION}; ${blender} is ${version.split('\n')[0]}`);
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'house-model-'));
  const all = pieces();
  const job = { metres: metres(), pieces: only.length ? all.filter((p) => only.includes(p.id)) : all };
  writeFileSync(path.join(work, 'job.json'), JSON.stringify(job));
  mkdirSync(MODEL_DIR, { recursive: true });
  const t0 = Date.now();
  execFileSync(blender, ['-b', '--factory-startup', '--python', path.join(HERE, 'models.py'), '--', path.join(work, 'job.json'), MODEL_DIR], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  rmSync(work, { recursive: true, force: true });
  if (only.length) {
    console.log(`model — ${job.pieces.length} pieces in ${((Date.now() - t0) / 1000).toFixed(0)} s (a partial run: not stamped)`);
    return;
  }
  const models = all.map((p) => p.id).filter((id) => readdirSync(MODEL_DIR).includes(`${id}.glb`));
  writeFileSync(STAMP, JSON.stringify({ hash: modelHash(), sources: MODEL_SOURCES, blender: BLENDER_VERSION, models }, null, 2) + '\n');
  console.log(`model — ${models.length} pieces in ${((Date.now() - t0) / 1000).toFixed(0)} s, hash ${modelHash().slice(0, 12)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
