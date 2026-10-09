/**
 * Writes dist/sw.js from src/sw/worker.js and the build's own file list
 * (8.3.6). Run by the Vite build when the bundle closes, and by
 * tools/weight.mjs to simulate a deploy.
 *
 * Every file the build ships is listed with the first 16 hex digits of its
 * SHA-256. The build's id is the hash of the list itself, so a deploy that
 * changes nothing changes nothing, and any change at all makes a new worker.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.js');
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Phase 9: the house is a second page in the same build. It is not the ship,
// so its page and its own entry chunk stay out of the ship's cache.
const NOT_THE_SHIP = /^(house\/|bundle\/house-)/;

export function writePrecache(dist, { retire = false } = {}) {
  const files = walk(dist).filter((f) => f !== 'sw.js' && !NOT_THE_SHIP.test(f));
  const list = files.map((f) => ({ url: `/${f}`, hash: hash(readFileSync(path.join(dist, f))) }));
  const build = hash(JSON.stringify(list) + (retire ? ':retire' : ''));
  const source = readFileSync(TEMPLATE, 'utf8')
    .replace("'__BUILD__'", JSON.stringify(build))
    .replace('__PRECACHE__', JSON.stringify(list))
    .replace('__RETIRE__', JSON.stringify(retire));
  writeFileSync(path.join(dist, 'sw.js'), source);
  const bytes = files.reduce((n, f) => n + statSync(path.join(dist, f)).size, 0);
  return { build, files: list.length, bytes, retire };
}

/** The Vite plugin: writes the worker once the bundle is on disk. */
export function precache() {
  let outDir = 'dist';
  return {
    name: 'derelict-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const retire = process.env.DERELICT_RETIRE_WORKER === '1';
      const r = writePrecache(outDir, { retire });
      console.log(
        `  sw.js — build ${r.build}, ${r.files} files, ${(r.bytes / 1e6).toFixed(2)} MB precached${retire ? ' (RETIRING: this worker removes itself)' : ''}`
      );
    },
  };
}
