/**
 * The owner's phone as the profiler — phase 8, spec 8.3.2.
 *
 * The frame budget (5.3.2) measures relative cost on a software rasteriser,
 * because CI has no GPU. Every trace the owner records carries the time of
 * every frame on the owner's own phone. This reads them.
 *
 * For each committed trace it reports the median, 95th and 99th percentiles,
 * the slowest frame and the long frames, for the whole run and broken down by
 * where the player was standing and what was happening: each compartment, any
 * frame in which a power strike was running, and the departure.
 *
 * Where the player was comes from replaying the trace, which reproduces every
 * frame exactly, rather than from the file, which only holds a checkpoint
 * every 30. A trace recorded on an older input layer no longer replays to the
 * same places (7.3.2), so for those the breakdown falls back to the
 * checkpoints and says so.
 *
 * Format 2 traces carry the raw interval between frames. Format 1 traces only
 * have the game's step, which is clamped at 50 ms, so a frame longer than that
 * reads as 50 and the report says it is a floor.
 *
 * Reported, never gated. It is a fact about one phone on one day.
 *
 *   node tools/profile.mjs [baseUrl]
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { boot, deviceFor, launch, replay } from './lib/replayer.mjs';
import { spaceAt } from '../src/game/layout.js';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const TRACES = path.resolve('tools/traces');
/** Two missed vsyncs at 60 Hz: a frame a player can feel. */
const LONG = 33.4;

const errors = [];
const browser = await launch();

const files = readdirSync(TRACES).filter((f) => f.endsWith('.json')).sort();
console.log(`profile: ${BASE}`);

const currentInput = await (async () => {
  const { context, page } = await deviceFor(browser, { viewport: { w: 390, h: 844, dpr: 1 }, touch: true }, errors);
  await boot(page, BASE);
  const v = await page.evaluate(() => window.__derelict.inputVersion);
  await context.close();
  return v;
})();

/** Per frame: [compartment, striking, phase]. */
const PROBE = `(g) => {
  const s = g.spaces.find((s) => { const p = g.player.position; return p.x >= s.x[0] && p.x <= s.x[1] && p.z >= s.z[0] && p.z <= s.z[1]; });
  return [s ? s.id : 'outside', g.lighting.striking() ? 1 : 0, g.phase];
}`;

let reports = 0;
for (const file of files) {
  const trace = JSON.parse(readFileSync(path.join(TRACES, file), 'utf8'));
  if (trace.synthetic) continue; // the monkey's regressions are not anyone's phone
  const raw = Array.isArray(trace.intervals) && trace.intervals.length === trace.frames.length;
  const ms = raw ? trace.intervals : trace.frames.map((s) => s * 1000);

  let tags;
  let source;
  if (trace.input === currentInput) {
    const result = await replay(browser, BASE, trace, { errors, perFrame: PROBE });
    tags = result.samples;
    source = 'every frame, from replay';
  } else {
    // Retired: the checkpoints are the only positions that are still true.
    tags = [];
    let cp = 0;
    const cps = trace.checkpoints;
    for (let f = 0; f < trace.frames.length; f++) {
      while (cp + 1 < cps.length && cps[cp + 1][0] <= f) cp++;
      const c = cps[cp];
      const s = c ? spaceAt(c[3], c[4]) : null;
      tags.push([s ? s.id : 'outside', null, c ? c[1] : 'playing']);
    }
    source = `every 30th frame, from checkpoints (recorded on input layer v${trace.input}, current is v${currentInput})`;
  }

  const device = trace.device?.renderer ? `${trace.device.renderer}, render scale ${trace.device.scale}` : 'GPU not recorded (format 1)';
  console.log(`\n  ${file}`);
  console.log(`    ${trace.touch ? 'touch' : 'desktop'} ${trace.viewport.w}×${trace.viewport.h} @${trace.viewport.dpr}x — ${device}`);
  console.log(`    ${raw ? 'raw intervals' : 'clamped steps: anything over 50 ms reads as 50, so the slow end is a floor'}; positions ${source}`);
  console.log(`    ${'where'.padEnd(18)} ${'frames'.padStart(6)} ${'p50'.padStart(6)} ${'p95'.padStart(6)} ${'p99'.padStart(6)} ${'max'.padStart(6)} ${'>33ms'.padStart(6)}`);

  const groups = new Map();
  const add = (key, v) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  };
  for (let f = 0; f < ms.length; f++) {
    const v = ms[f];
    add('whole run', v);
    const t = tags[f];
    if (!t) continue;
    add(t[0], v);
    if (t[1]) add('power striking', v);
    if (t[2] === 'leaving' || t[2] === 'ending') add('departure', v);
  }
  const ORDER = ['whole run', 'bay', 'corrA', 'hold', 'corrB', 'annex', 'shortcut', 'chamber', 'outside', 'power striking', 'departure'];
  for (const key of ORDER) {
    const list = groups.get(key);
    if (!list?.length) continue;
    const sorted = [...list].sort((a, b) => a - b);
    const q = (p) => sorted[Math.floor(p * (sorted.length - 1))].toFixed(1);
    const long = list.filter((v) => v > LONG).length;
    console.log(
      `    ${key.padEnd(18)} ${String(list.length).padStart(6)} ${q(0.5).padStart(6)} ${q(0.95).padStart(6)} ${q(0.99).padStart(6)} ${q(1).padStart(6)} ${String(long).padStart(6)}`
    );
  }
  reports++;
}

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`\nprofile: ${reports} owner trace(s) reported — milliseconds per frame on the phone that recorded them; reported, not gated`);
