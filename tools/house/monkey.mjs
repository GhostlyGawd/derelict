/**
 * Monkey runs in the house — phase 9, 9.6 "no monkey can break it".
 *
 * The ship's harness (tools/monkey.mjs), pointed at the house: the same
 * devices, the same recording through the game's own ?trace, the same replay,
 * shrinking and regression traces, with the house's brain
 * (tools/lib/monkey-house.js) in place of the ship's. Its invariants are the
 * ship's with keys in place of cells: never inside geometry, always on the
 * floor under you, the ring holding exactly what was found and not yet used,
 * and the loop, every door, drawer and the clock only ever moving forward.
 * Every run is then finished by the autopilot, out of the front door.
 *
 *   node tools/house/monkey.mjs [baseUrl] [--seeds=N]   (four by default: one per device)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { boot, deviceFor, launch, replay } from '../lib/replayer.mjs';

const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const BASE = new URL('house/', ROOT).href;
const COUNT = Number(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] || 4);
const BRAIN = readFileSync(path.resolve('tools/lib/monkey-house.js'), 'utf8');
const REGRESSIONS = path.resolve('tools/traces/monkey-house');
const { LOOP } = await import(new URL('../../src/house/layout.js', import.meta.url).href);
const LOOP_STEPS = LOOP.length;

const DEVICES = [
  { name: 'desktop', viewport: { w: 1024, h: 640, dpr: 1 }, touch: false },
  { name: 'portrait phone', viewport: { w: 390, h: 844, dpr: 1 }, touch: true },
  { name: 'landscape phone', viewport: { w: 844, h: 390, dpr: 1 }, touch: true },
  { name: 'desktop with a pad', viewport: { w: 1024, h: 640, dpr: 1 }, touch: false, pad: true },
];
/** The fixed seed list. Change it on purpose, never to make a run go green. */
const SEEDS = [9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108].slice(0, COUNT);

const errors = [];
const browser = await launch();

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

const CHECK = `(g, frame) => { const r = window.__monkey.check(frame); return r ? { stop: r } : 0; }`;
const FINISH = `async () => window.__monkey.finish({ cap: 20000 })`;

/** One monkey run, recorded. */
async function drive(seed, device) {
  const { context, page } = await deviceFor(browser, device, errors);
  if (device.pad) await page.addInitScript({ path: path.resolve('tools/lib/fakepad.js') });
  await boot(page, BASE, '?trace');
  await page.addScriptTag({ content: BRAIN });
  await page.evaluate((desk) => {
    // Recorded under the rule replay plays under: no real pointer lock, whose
    // change events arrive on the wall clock rather than on a frame.
    if (desk) window.__derelict.canvas.requestPointerLock = () => Promise.resolve();
    window.__derelict.manualClockOnStart = true;
    document.getElementById('start').click();
  }, !device.touch);
  await page.waitForFunction(() => window.__derelict?.phase === 'playing' && window.__derelict.manualClock, null, {
    timeout: 15000,
  });
  const out = await page.evaluate(async (s) => {
    const g = window.__derelict;
    if (!g.input.usingTouch) g.input.locked = true;
    const result = await window.__monkey.drive({ seed: s });
    const trace = g.trace.export();
    return { result, trace };
  }, seed);
  await context.close();
  out.trace.synthetic = { seed, device: device.name };
  return out;
}

/** Replays a trace with the invariants watching; `finish` hands over to the autopilot at the end. */
function watch(trace, { finish = false } = {}) {
  return replay(browser, BASE, trace, { errors, inject: [BRAIN], perFrame: CHECK, after: finish ? FINISH : null });
}

/** Where a replay first left its recording, so a mismatch says when as well as how far. */
function divergence(recorded = [], replayed = []) {
  const at = new Map(replayed.map((c) => [c[0], c]));
  for (const c of recorded) {
    const d = at.get(c[0]);
    if (d && JSON.stringify(c) !== JSON.stringify(d)) return `; first apart at frame ${c[0]}: recorded ${JSON.stringify(c)}, replayed ${JSON.stringify(d)}`;
  }
  return '; every checkpoint agreed';
}

/** The same failure, for shrinking: same first few words of the reason. */
const kindOf = (reason) => String(reason).split(/[\s(]/).slice(0, 3).join(' ');

/**
 * Shrinks a failing trace: cut it at the failure, then remove spans of events
 * for as long as the replay still fails the same way. Halving spans, the
 * usual way, with a cap on replays so a stubborn case still finishes.
 */
async function shrink(trace, reason) {
  const want = kindOf(reason);
  // An invariant breaks during the recorded input. An autopilot that cannot
  // finish breaks after it, so those are replayed with the autopilot taking
  // over at the end, and cut no shorter than the whole recording.
  const pilot = String(reason).startsWith('autopilot:');
  const fails = async (t) => {
    const r = await watch(t, { finish: pilot });
    if (r.stopped && kindOf(r.stopped.reason) === want) return r.stopped;
    if (pilot && r.after?.reason && kindOf(r.after.reason) === want) return { frame: t.frames.length - 2, reason: r.after.reason };
    return null;
  };
  let best = trace;
  const first = await fails(best);
  if (!first) return { trace: best, reproduced: false };
  best = cut(best, first.frame + 2);
  let budget = 40;
  let span = Math.ceil(best.events.length / 2);
  while (span >= 1 && budget > 0) {
    let removed = false;
    for (let at = 0; at < best.events.length && budget > 0; at += span) {
      const candidate = { ...best, events: best.events.filter((_, k) => k < at || k >= at + span) };
      budget--;
      const f = await fails(candidate);
      if (f) {
        best = cut(candidate, f.frame + 2);
        removed = true;
        at -= span;
      }
    }
    if (!removed) span = Math.floor(span / 2);
  }
  return { trace: best, reproduced: true };
}

function cut(trace, frames) {
  return {
    ...trace,
    frames: trace.frames.slice(0, frames),
    intervals: trace.intervals?.slice(0, frames),
    events: trace.events.filter((e) => e[1] < frames),
    checkpoints: trace.checkpoints.filter((c) => c[0] <= frames),
  };
}

console.log(`house monkey: ${BASE}`);

// ---- The invariants can fail ---------------------------------------------------
// A gate that cannot go red proves nothing. Each of these breaks the house on
// purpose, in a fresh page, and the check has to notice.
console.log('\n  the invariants catch what they claim to');
{
  const { context, page } = await deviceFor(browser, DEVICES[0], errors);
  await boot(page, BASE);
  await page.addScriptTag({ content: BRAIN });
  await page.evaluate(() => {
    window.__derelict.manualClockOnStart = true;
    document.getElementById('start').click();
  });
  await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
  const caught = await page.evaluate(() => {
    const g = window.__house;
    const out = {};
    const tryBreak = (name, breakIt, mendIt) => {
      breakIt();
      out[name] = window.__monkey.check(0);
      mendIt();
    };
    const p = g.player.position;
    const home = p.clone();
    const cab = g.things.containers[0].colliders()[0];
    tryBreak('inside geometry', () => p.set((cab.minX + cab.maxX) / 2, 0, (cab.minZ + cab.maxZ) / 2), () => p.copy(home));
    tryBreak('off the floor', () => (p.y = 1.4), () => (p.y = 0));
    tryBreak('outside the house', () => p.set(0, 0, 9), () => p.copy(home));
    tryBreak('a key on the ring that was never found', () => g.ring.push('front-key'), () => (g.ring.length = 0));
    const study = g.doorsById.get('study-door');
    tryBreak('a step done before what it needs', () => (study.open = true), () => (study.open = false));
    const parlour = g.doorsById.get('parlour-door');
    tryBreak('a door closing again', () => { parlour.open = true; window.__monkey.check(0); parlour.open = false; }, () => {});
    tryBreak('a phase going backwards', () => { g.phase = 'ended'; window.__monkey.check(0); g.phase = 'playing'; }, () => {});
    return out;
  });
  for (const [name, reason] of Object.entries(caught)) {
    expect(`${name} is caught${reason ? ` ("${reason}")` : ''}`, Boolean(reason), 'the check passed a broken house');
  }
  await context.close();
}

// ---- Regression traces first: anything the monkey ever found stays found. ----
let regressions = [];
try {
  regressions = readdirSync(REGRESSIONS).filter((f) => f.endsWith('.json')).sort();
} catch {
  /* none yet */
}
// ---- The owner's runs ------------------------------------------------------------
// Recorded on the owner's phone with ?trace, replayed exactly as recorded: every
// checkpoint the same, and the run ending where it ended for the owner (7.3.2).
// They live in their own folder, so the ship's replay and profiler never read them.
const owners = readdirSync(path.resolve('tools/traces/house')).filter((f) => f.endsWith('.json')).sort();
console.log(`\n  the owner's house runs (${owners.length})`);
for (const file of owners) {
  const trace = JSON.parse(readFileSync(path.resolve('tools/traces/house', file), 'utf8'));
  const r = await watch(trace);
  const at = new Map((r.checkpoints || []).map((c) => [c[0], c]));
  const same = trace.checkpoints.filter((c) => JSON.stringify(c) === JSON.stringify(at.get(c[0]))).length;
  expect(
    `${file}: replays exactly (${same}/${trace.checkpoints.length} checkpoints) and ends ${trace.final?.[1]}`,
    !r.stopped && same === trace.checkpoints.length && JSON.stringify(r.final) === JSON.stringify(trace.final),
    r.stopped ? `frame ${r.stopped.frame}: ${r.stopped.reason}` : `replayed ${JSON.stringify(r.final)}${divergence(trace.checkpoints, r.checkpoints)}`
  );
}

console.log(`\n  regression traces (${regressions.length})`);
for (const file of regressions) {
  const trace = JSON.parse(readFileSync(path.join(REGRESSIONS, file), 'utf8'));
  const r = await watch(trace, { finish: true });
  expect(
    `${file}: every invariant holds through the recorded input (${trace.frames.length} frames)`,
    !r.stopped,
    r.stopped ? `frame ${r.stopped.frame}: ${r.stopped.reason}` : ''
  );
  if (!r.stopped) {
    expect(`${file}: the autopilot finishes the run from there`, r.after && !r.after.reason, r.after?.reason || 'did not run');
  }
}

// ---- Seeded runs ---------------------------------------------------------------
console.log(`\n  seeded runs (${SEEDS.length})`);
const kinds = new Map();
for (let n = 0; n < SEEDS.length; n++) {
  const seed = SEEDS[n];
  const device = DEVICES[n % DEVICES.length];
  const { result, trace } = await drive(seed, device);
  for (const [, kind] of result.log) kinds.set(kind, (kinds.get(kind) || 0) + 1);
  const label = `seed ${seed}, ${device.name}: ${result.log.length} hostile bursts, ${result.frame} frames`;
  if (result.reason) {
    expect(label, false, `frame ${result.frame}: ${result.reason} (last burst ${JSON.stringify(result.log.at(-1))})`);
    const { trace: small, reproduced } = await shrink(trace, result.reason);
    mkdirSync(REGRESSIONS, { recursive: true });
    const file = path.join(REGRESSIONS, `seed-${seed}.json`);
    writeFileSync(file, JSON.stringify(small));
    console.log(
      `          ${reproduced ? `shrunk to ${small.events.length} events over ${small.frames.length} frames` : 'did NOT reproduce on replay — the trace is not the whole run'}; written to ${path.relative(process.cwd(), file)}`
    );
    continue;
  }
  expect(`${label}, ended with ${result.cells}/${LOOP_STEPS} steps of the loop`, result.phase === 'ended', `phase ${result.phase}`);

  // One run per device is replayed, to show a monkey's recording is a faithful
  // regression artefact: same invariants, same end.
  if (n < DEVICES.length) {
    const r = await watch(trace);
    const a = trace.final;
    const b = r.final;
    const off = a && b ? Math.hypot(a[3] - b[3], a[4] - b[4]) : Infinity;
    expect(
      `seed ${seed} replays to the same end (${b?.[1]}, ${off.toFixed(3)} m apart)`,
      !r.stopped && a && a[1] === b[1] && a[2] === b[2] && off <= 0.05,
      r.stopped ? `stopped at ${r.stopped.frame}: ${r.stopped.reason}` : `recorded ${JSON.stringify(a)}, replayed ${JSON.stringify(b)}${divergence(trace.checkpoints, r.checkpoints)}`
    );
  }
}
console.log(`\n  hostile bursts thrown: ${[...kinds.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nhouse monkey: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nhouse monkey: OK — no seeded monkey broke an invariant, and every run was played out');
