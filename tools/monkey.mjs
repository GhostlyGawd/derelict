/**
 * Monkey runs — phase 8, spec 8.3.3.
 *
 * The dead-end proof (P6, 4.3.4) is a static argument over the floor: every
 * place the player can stand can be walked back from. Nothing tested what a
 * player can *do* — interact in the middle of an animation, crouch under the
 * debris with a cell in hand, pause during a strike. Every other harness
 * drives the game the way a careful player would. This one drives it the way a
 * careless one does.
 *
 * For each seed in a fixed list, on a desktop, a portrait phone, a landscape
 * phone or a desktop with a pad:
 *
 *   1. The game is opened with `?trace`, and an autopilot plays it, heading for
 *      the next step of the chain, interrupted by seeded bursts of hostile
 *      input: mashing interact, flickering crouch, spinning the view, keys in
 *      every combination, pausing and resuming, setting a cell down somewhere
 *      awkward and walking off, long frames, storms of taps, three and four
 *      thumbs, the OS cancelling every touch. Every input is a real DOM event,
 *      so the game's own recorder writes the run down.
 *   2. Every frame, the invariants: no exception, never inside geometry, never
 *      off the deck, exactly two cells each in one place, the carry slot and
 *      the panel agreeing with them, and the chain and the phase only ever
 *      moving forward.
 *   3. The autopilot must then finish the run. The floor proof says every place
 *      can be walked back from; this says every state can be played out from.
 *   4. A run that fails is shrunk — events removed for as long as the same
 *      failure still happens on replay — and written to tools/traces/monkey/
 *      as a regression trace. Those are replayed on every run of this harness
 *      with the invariants watching, then finished by the autopilot.
 *
 * Seeded and fixed, so a red run is a reproducible run and never a flake.
 *
 *   node tools/monkey.mjs [baseUrl] [--seeds=N]   (twelve by default: three per device)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { boot, deviceFor, launch, replay } from './lib/replayer.mjs';

const BASE = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const COUNT = Number(process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] || 12);
const BRAIN = readFileSync(path.resolve('tools/lib/monkey-page.js'), 'utf8');
const REGRESSIONS = path.resolve('tools/traces/monkey');

const DEVICES = [
  { name: 'desktop', viewport: { w: 1024, h: 640, dpr: 1 }, touch: false },
  { name: 'portrait phone', viewport: { w: 390, h: 844, dpr: 1 }, touch: true },
  { name: 'landscape phone', viewport: { w: 844, h: 390, dpr: 1 }, touch: true },
  // Moving, crouching and pressing on a pad, turning with the mouse: two
  // devices in two hands, which is the combination nothing else drives.
  { name: 'desktop with a pad', viewport: { w: 1024, h: 640, dpr: 1 }, touch: false, pad: true },
];
/** The fixed seed list. Change it on purpose, never to make a run go green. */
const SEEDS = [8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108, 8109, 8110, 8111, 8112].slice(0, COUNT);

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

console.log(`monkey: ${BASE}`);

// ---- The invariants can fail ---------------------------------------------------
// A gate that cannot go red proves nothing. Each of these breaks the game on
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
    const g = window.__derelict;
    const out = {};
    const tryBreak = (name, breakIt, mendIt) => {
      breakIt();
      out[name] = window.__monkey.check(0);
      mendIt();
    };
    const p = g.player.position;
    const home = p.clone();
    const crate = g.staticColliders.find((c) => c.maxX - c.minX > 0.6 && c.maxZ - c.minZ > 0.6 && c.minY < 0.1 && c.maxY > 0.7 && c.maxY < 3);
    tryBreak('inside geometry', () => p.set((crate.minX + crate.maxX) / 2, 0, (crate.minZ + crate.maxZ) / 2), () => p.copy(home));
    tryBreak('off the deck', () => (p.y = -0.4), () => (p.y = 0));
    tryBreak('outside the ship', () => p.set(0, 0, 30), () => p.copy(home));
    const cell = g.carryables.cells[0];
    tryBreak('a cell carried with an empty slot', () => (cell.status = 'carried'), () => (cell.status = 'cradled'));
    tryBreak('the panel disagreeing with the sockets', () => (g.cells = 1), () => (g.cells = 0));
    const sw = g.switches[0];
    window.__monkey.check(0);
    tryBreak('a switch coming unflipped', () => { sw.used = true; window.__monkey.check(0); sw.used = false; }, () => {});
    tryBreak('a phase going backwards', () => { g.phase = 'leaving'; window.__monkey.check(0); g.phase = 'playing'; }, () => {});
    return out;
  });
  for (const [name, reason] of Object.entries(caught)) {
    expect(`${name} is caught${reason ? ` ("${reason}")` : ''}`, Boolean(reason), 'the check passed a broken game');
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
  expect(`${label}, ended with ${result.cells}/2 cells`, result.phase === 'ended', `phase ${result.phase}`);

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
      r.stopped ? `stopped at ${r.stopped.frame}: ${r.stopped.reason}` : `recorded ${JSON.stringify(a)}, replayed ${JSON.stringify(b)}`
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
  console.error(`\nmonkey: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nmonkey: OK — no seeded monkey broke an invariant, and every run was played out');
