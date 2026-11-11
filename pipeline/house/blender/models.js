import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import { dressHouse } from '../../../src/house/dress.js';
import { buildHouse } from '../../../src/house/level.js';
import { askedFor } from '../../../src/house/models.js';
import { buildThings } from '../../../src/house/things.js';
import { HOUSE_TEXTURES } from '../textures.js';
import { BLENDER_VERSION } from './version.js';

/**
 * `npm run model`: Blender models the house's pieces (everything modelled by
 * Blender). The house is built in Node with no models, and every piece it
 * asks for (`want` in src/house/models.js) is a model to make. Blender writes
 * one GLB per piece to pipeline/house/models/, and `models.json` stamps each
 * with the hash of what it is made from: its own request, the modelling
 * script, and the sizes the textures stand for. Only what is stale or missing
 * is modelled again. The files are committed: the pipeline copies them and
 * fails if any piece the house asks for is missing or stale (`checkModels`),
 * and neither CI nor the deploy runs Blender.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
export const MODEL_DIR = path.resolve(HERE, '../models');
const STAMP = path.join(MODEL_DIR, 'models.json');

/** The files every model is made from, beside its own request. */
export const MODEL_SOURCES = ['pipeline/house/blender/models.py', 'pipeline/house/textures.js', 'pipeline/house/model/hall.json'];

/** Every piece the house asks for, by building it in Node with nothing modelled. */
export function requests() {
  const mats = new Proxy({}, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (!t[k]) t[k] = new THREE.MeshBasicMaterial({ name: k });
      return t[k];
    },
  });
  buildHouse(mats, {});
  dressHouse(mats, {});
  buildThings(mats, {});
  return askedFor().sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** A piece's hash: its request and the files every model is made from. */
function pieceHash(piece, common) {
  return createHash('sha256').update(common).update(JSON.stringify(piece)).digest('hex');
}
function commonHash() {
  const h = createHash('sha256');
  for (const file of MODEL_SOURCES) h.update(file).update('\0').update(readFileSync(path.join(ROOT, file))).update('\0');
  return h.digest('hex');
}

/** The committed models, by id, as files; fails, naming the remedy, if any the house asks for is missing or stale. */
export function checkModels() {
  const stamp = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : { models: {} };
  const common = commonHash();
  const bad = [];
  const out = {};
  for (const piece of requests()) {
    const have = stamp.models?.[piece.id];
    if (!have || have !== pieceHash(piece, common) || !existsSync(path.join(MODEL_DIR, `${piece.id}.glb`))) bad.push(piece.id);
    else out[piece.id] = path.join(MODEL_DIR, `${piece.id}.glb`);
  }
  if (bad.length) {
    throw new Error(
      `the house asks for ${bad.length} piece(s) Blender has not modelled as they are now (${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ', …' : ''}). Run npm run model and commit the result.`
    );
  }
  return out;
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
  out.wall = out.plaster;
  out.hallRug = out.rug;
  return out;
}

async function main() {
  const blender = process.env.BLENDER || '/opt/blender-4.2.3-linux-x64/blender';
  const version = execFileSync(blender, ['-b', '--factory-startup', '--version'], { encoding: 'utf8' });
  if (!version.includes(`Blender ${BLENDER_VERSION}`)) throw new Error(`model wants Blender ${BLENDER_VERSION}; ${blender} is ${version.split('\n')[0]}`);
  const all = requests();
  const common = commonHash();
  const stamp = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : { models: {} };
  stamp.models ??= {};
  const force = process.argv.includes('--all');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const todo = all.filter((p) =>
    only.length ? only.some((o) => p.id === o || p.kind === o) : force || stamp.models[p.id] !== pieceHash(p, common) || !existsSync(path.join(MODEL_DIR, `${p.id}.glb`))
  );
  mkdirSync(MODEL_DIR, { recursive: true });
  const t0 = Date.now();
  if (todo.length) {
    const work = mkdtempSync(path.join(os.tmpdir(), 'house-model-'));
    writeFileSync(path.join(work, 'job.json'), JSON.stringify({ metres: metres(), pieces: todo }));
    // Blender exits 0 when its script throws unless it is told not to; a
    // failed run once stamped fifty models it had not written.
    execFileSync(blender, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', path.join(HERE, 'models.py'), '--', path.join(work, 'job.json'), MODEL_DIR], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    rmSync(work, { recursive: true, force: true });
    const unwritten = todo.filter((p) => !existsSync(path.join(MODEL_DIR, `${p.id}.glb`)) || statSync(path.join(MODEL_DIR, `${p.id}.glb`)).mtimeMs < t0);
    if (unwritten.length) throw new Error(`Blender did not write ${unwritten.map((p) => p.id).join(', ')}`);
  }
  // Stamp what was made, and forget what the house no longer asks for.
  const wanted = new Set(all.map((p) => p.id));
  const models = {};
  for (const p of all) {
    if (todo.includes(p)) models[p.id] = pieceHash(p, common);
    else if (stamp.models[p.id]) models[p.id] = stamp.models[p.id];
  }
  for (const f of readdirSync(MODEL_DIR)) if (f.endsWith('.glb') && !wanted.has(f.slice(0, -4))) rmSync(path.join(MODEL_DIR, f));
  writeFileSync(STAMP, JSON.stringify({ blender: BLENDER_VERSION, sources: MODEL_SOURCES, models }, null, 2) + '\n');
  console.log(`model — ${todo.length} of ${all.length} pieces modelled in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
