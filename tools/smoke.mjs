/**
 * Headless playtest. Boots the built game in Chromium, moves through the full
 * six-step chain (switch 1 → cell 1 → socket 1 → switch 2 → cell 2 → socket 2 →
 * airlock), and reports console errors plus a frame-rate sample. Used as the
 * pre-deploy gate.
 *
 * This one teleports between fixtures: it is the systems check — audio, frame
 * rate, restart, screenshots. walkthrough.mjs walks the same chain on foot and
 * chain.mjs proves the ordering.
 *
 *   node tools/smoke.mjs [baseUrl] [--shots]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('tools/shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const errors = [];
let shotIndex = 0;

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

async function shot(name) {
  if (!SHOTS) return;
  const file = path.join(OUT, `${String(++shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  shot → ${path.relative(process.cwd(), file)}`);
}

/** Teleports the player and points them somewhere; avoids fighting physics. */
async function place(x, z, yaw) {
  await page.evaluate(
    ([px, pz, py]) => {
      const g = window.__derelict;
      g.player.position.set(px, 0, pz);
      g.player.yaw = py;
      g.player.pitch = 0;
    },
    [x, z, yaw]
  );
  await page.waitForTimeout(120);
}

/** Walks with real input so collision and interaction are exercised. */
async function walk(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(60);
}

/**
 * Walks forward in bursts until `done(state)` holds or progress stops.
 *
 * Fixed-duration walks are frame-rate sensitive: movement is dt-based but dt
 * is clamped to a floor, so a slower browser covers less ground in the same
 * wall-clock time. None of these assertions are about how fast the renderer
 * is, so none of them should be written against a stopwatch.
 */
async function advanceUntil(done, { timeoutMs = 40000, ms = 900 } = {}) {
  const start = Date.now();
  let now = await state();
  let previous = now.pos;
  let lastProgressClock = now.clock;
  let sinceProgress = 0;
  while (Date.now() - start < timeoutMs) {
    await walk(['KeyW'], ms);
    now = await state();
    if (done(now)) return now;

    sinceProgress += Math.hypot(now.pos[0] - previous[0], now.pos[1] - previous[1]);
    previous = now.pos;
    // Stalling is measured against the game clock, which advances with dt.
    // A burst count, a per-burst distance and a wall-clock deadline are all
    // really measurements of the renderer: under a software rasteriser, or a
    // host that hitches, a walking player looks identical to a stuck one.
    if (sinceProgress >= 0.25) {
      sinceProgress = 0;
      lastProgressClock = now.clock;
    } else if (now.clock - lastProgressClock > 3) {
      return now;
    }
  }
  return now;
}

const state = () => page.evaluate(() => {
  const g = window.__derelict;
  return {
    phase: g.phase,
    clock: g.runTime,
    cells: g.cells,
    carrying: g.carry.held ? g.carry.held.id : null,
    released: g.carryables.cradles.filter((c) => c.released).map((c) => c.id),
    pos: [+g.player.position.x.toFixed(2), +g.player.position.z.toFixed(2)],
    prompt: document.getElementById('prompt').textContent,
    airlockOpen: g.doorsById.get('airlock').open,
    hatchOpen: g.doorsById.get('hatch-bay').open,
    fps: g.fpsSample,
  };
});

console.log(`smoke: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
console.log('  booted');
await shot('title');

await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(1800);
console.log('  playing:', JSON.stringify(await state()));
await shot('bay-emergency');

// ---- Every generated sound decoded and is audible --------------------------
const sounds = await page.evaluate(() => {
  const bus = window.__derelict.audio;
  return {
    ready: bus.ready,
    buffers: [...bus.buffers.entries()].map(([id, b]) => [id, +b.duration.toFixed(2)]),
    ambient: Boolean(bus.ambient),
  };
});
if (!sounds.ready) throw new Error('audio bus never became ready');
if (!sounds.ambient) throw new Error('ambient loop did not start');
const silent = sounds.buffers.filter(([, d]) => d <= 0);
if (silent.length) throw new Error(`empty audio buffers: ${silent.map(([id]) => id).join(', ')}`);
if (sounds.buffers.length !== 10) throw new Error(`expected 10 sounds, decoded ${sounds.buffers.length}`);
console.log('  audio:', sounds.buffers.map(([id, d]) => `${id} ${d}s`).join(', '));

// ---- Route to the Storage Hold and flip switch 1 -------------------------
await place(-6.0, 0, Math.PI / 2); // face west, in the corridor A doorway
await advanceUntil((v) => v.pos[0] <= -13);
console.log('  corridor A →', JSON.stringify((await state()).pos));
await shot('corridor-a');

await place(-21.5, 0, Math.PI / 2); // look west down the length of the hold
await page.waitForTimeout(400);
await shot('hold-emergency');

await place(-31.6, -3.4, Math.PI / 2);
await page.waitForTimeout(300);
let s = await state();
if (!s.prompt) throw new Error(`no interact prompt at switch 1 (${JSON.stringify(s)})`);
console.log('  prompt:', s.prompt);
await shot('switch-1-aim');

await page.keyboard.press('KeyE');
await page.waitForTimeout(1600);
s = await state();
if (!s.released.includes('cradle1')) throw new Error(`switch 1 did not release cradle 1 (${JSON.stringify(s)})`);
if (s.cells !== 0) throw new Error(`switch 1 credited a cell on its own (cells=${s.cells})`);
console.log('  switch 1 flipped, hold powered, cradle 1 released');
await place(-21.5, 0, Math.PI / 2);
await page.waitForTimeout(500);
await shot('hold-powered');

// ---- Take cell 1 and carry it to the airlock ------------------------------
await place(-29.5, -7.55, 0);
await page.waitForTimeout(300);
s = await state();
if (!s.prompt) throw new Error(`no prompt at cradle 1 (${JSON.stringify(s)})`);
await shot('cradle-1-aim');
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
s = await state();
if (s.carrying !== 'cell1') throw new Error(`cell 1 did not come off the cradle (${JSON.stringify(s)})`);
console.log('  cell 1 taken');

await place(1.72, -5.9, 0);
await page.waitForTimeout(300);
s = await state();
if (!s.prompt) throw new Error(`no prompt at socket 1 (${JSON.stringify(s)})`);
await shot('socket-1-aim');
await page.keyboard.press('KeyE');
await page.waitForTimeout(1600);
s = await state();
if (s.cells !== 1) throw new Error(`seating cell 1 did not read 1/2 (${JSON.stringify(s)})`);
if (s.released.includes('cradle2')) throw new Error('a live Bay released cradle 2 on its own');
console.log('  cell 1 seated — 1/2, bay powered');
await shot('bay-powered');

// ---- Route to the Engine Annex and flip switch 2 -------------------------
await place(8.0, 0, -Math.PI / 2); // corridor B, facing east
await advanceUntil((v) => v.pos[0] >= 10.8);
console.log('  corridor B squeeze →', JSON.stringify((await state()).pos));
await shot('corridor-b-blockage');

// Thread the gap along the south wall. Since phase 4 the gap is hung with
// collapsed structure at 1.2 m, so upright it is a wall and only a crouched
// player gets through. Both halves are asserted: a squeeze that stopped being
// a squeeze would pass the second check on its own.
await place(11.0, 0.75, -Math.PI / 2);
s = await advanceUntil((v) => v.pos[0] >= 14.5);
if (s.pos[0] >= 13.8) throw new Error(`walked the squeeze upright to x=${s.pos[0]} — it is not a squeeze`);
console.log('  squeeze refuses a standing player →', JSON.stringify(s.pos));

await place(11.0, 0.75, -Math.PI / 2);
await page.keyboard.down('KeyC');
try {
  s = await advanceUntil((v) => v.pos[0] >= 14.5);
} finally {
  await page.keyboard.up('KeyC');
}
if (s.pos[0] < 13.8) throw new Error(`squeeze route is impassable even crouched, stuck at x=${s.pos[0]}`);
console.log('  squeeze cleared, crouched →', JSON.stringify(s.pos));
await page.waitForTimeout(300);

await place(31.6, 1.6, -Math.PI / 2);
await page.waitForTimeout(300);
s = await state();
if (!s.prompt) throw new Error(`no interact prompt at switch 2 (${JSON.stringify(s)})`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
s = await state();
if (!s.released.includes('cradle2')) throw new Error(`switch 2 plus a live bay did not release cradle 2 (${JSON.stringify(s)})`);
await page
  .waitForFunction(() => window.__derelict.doorsById.get('hatch-bay').open, null, { timeout: 30000 })
  .catch(() => {
    throw new Error('shortcut hatch did not open with the annex');
  });
console.log('  switch 2 flipped, annex powered, hatch open, cradle 2 released');
await shot('annex-powered');

// ---- Take cell 2 and carry it home ----------------------------------------
await place(31.2, -7.55, 0);
await page.waitForTimeout(300);
s = await state();
if (!s.prompt) throw new Error(`no prompt at cradle 2 (${JSON.stringify(s)})`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
s = await state();
if (s.carrying !== 'cell2') throw new Error(`cell 2 did not come off the cradle (${JSON.stringify(s)})`);
console.log('  cell 2 taken');

// ---- Shortcut home, then out through the airlock -------------------------
// Walked in bursts until progress stops rather than for a fixed duration:
// movement is dt-based but dt is clamped, so under a slow software rasteriser
// a fixed wall-clock walk covers less ground. Stalling is the real signal.
await place(18.0, 4.6, Math.PI / 2);
s = await advanceUntil((v) => v.pos[0] <= 8);
console.log('  shortcut →', JSON.stringify(s.pos));
if (s.pos[0] > 8.5) throw new Error(`shortcut passage is blocked, stuck at x=${s.pos[0]}`);
await shot('shortcut');

await place(2.58, -5.9, 0);
await page.waitForTimeout(300);
s = await state();
if (!s.prompt) throw new Error(`no prompt at socket 2 (${JSON.stringify(s)})`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
s = await state();
if (s.cells !== 2) throw new Error(`seating cell 2 did not read 2/2 (${JSON.stringify(s)})`);
console.log('  cell 2 seated — 2/2');

await page
  .waitForFunction(() => window.__derelict.doorsById.get('airlock').open, null, { timeout: 30000 })
  .catch(() => {
    throw new Error('airlock never finished cycling');
  });
s = await state();
await shot('airlock-open');

await place(0, -5.5, 0);
await advanceUntil((v) => v.phase !== 'playing', { ms: 900 });
await page.waitForFunction(() => window.__derelict?.phase === 'ended', null, { timeout: 12000 });
console.log('  escaped');
await shot('endcard');

// ---- Frame rate + restart ------------------------------------------------
const fps = await page.evaluate(async () => {
  let frames = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      frames++;
      if (performance.now() - start > 2000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return Math.round((frames / (performance.now() - start)) * 1000);
});
console.log(`  fps (swiftshader software raster): ${fps}`);

await page.click('#restart');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(1200);
s = await state();
if (s.cells !== 0 || s.airlockOpen || s.carrying || s.released.length) {
  throw new Error(`restart did not reset state: ${JSON.stringify(s)}`);
}
console.log('  restart clean');
await shot('restarted');

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nsmoke: OK');
writeFileSync('tools/.smoke-ok', new Date().toISOString());
