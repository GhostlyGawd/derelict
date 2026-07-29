/**
 * Headless playtest. Boots the built game in Chromium, walks the full route
 * (bay → hold → flip → annex → flip → shortcut → airlock), and reports console
 * errors plus a frame-rate sample. Used as the pre-deploy gate.
 *
 *   node tools/smoke.mjs [baseUrl] [--shots]
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('tools/shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const errors = [];
let shotIndex = 0;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
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

const state = () => page.evaluate(() => {
  const g = window.__derelict;
  return {
    phase: g.phase,
    cells: g.cells,
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
if (sounds.buffers.length !== 8) throw new Error(`expected 8 sounds, decoded ${sounds.buffers.length}`);
console.log('  audio:', sounds.buffers.map(([id, d]) => `${id} ${d}s`).join(', '));

// ---- Route to the Storage Hold and flip switch 1 -------------------------
await place(-6.0, 0, Math.PI / 2); // face west, in the corridor A doorway
await walk(['KeyW'], 2600);
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
if (s.cells !== 1) throw new Error(`switch 1 did not register (cells=${s.cells})`);
console.log('  switch 1 flipped, hold powered');
await place(-21.5, 0, Math.PI / 2);
await page.waitForTimeout(500);
await shot('hold-powered');

// ---- Route to the Engine Annex and flip switch 2 -------------------------
await place(8.0, 0, -Math.PI / 2); // corridor B, facing east
await walk(['KeyW'], 2200);
console.log('  corridor B squeeze →', JSON.stringify((await state()).pos));
await shot('corridor-b-blockage');

// Thread the gap along the south wall.
await place(11.0, 0.75, -Math.PI / 2);
await walk(['KeyW'], 2600);
s = await state();
if (s.pos[0] < 13.8) throw new Error(`squeeze route is impassable, stuck at x=${s.pos[0]}`);
console.log('  squeeze cleared →', JSON.stringify(s.pos));

await place(31.6, 1.6, -Math.PI / 2);
await page.waitForTimeout(300);
s = await state();
if (!s.prompt) throw new Error(`no interact prompt at switch 2 (${JSON.stringify(s)})`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(2400);
s = await state();
if (s.cells !== 2) throw new Error(`switch 2 did not register (cells=${s.cells})`);
if (!s.hatchOpen) throw new Error('shortcut hatch did not open at 2/2');
console.log('  switch 2 flipped, annex powered, hatch open');
await shot('annex-powered');

// ---- Shortcut home, then out through the airlock -------------------------
await place(18.0, 4.6, Math.PI / 2);
await walk(['KeyW'], 4200);
s = await state();
console.log('  shortcut →', JSON.stringify(s.pos));
if (s.pos[0] > 8.5) throw new Error(`shortcut passage is blocked, stuck at x=${s.pos[0]}`);
await shot('shortcut');

await page.waitForTimeout(2000);
s = await state();
if (!s.airlockOpen) throw new Error('airlock never finished cycling');
await shot('airlock-open');

await place(0, -5.5, 0);
await walk(['KeyW'], 3000);
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
if (s.cells !== 0 || s.airlockOpen) throw new Error(`restart did not reset state: ${JSON.stringify(s)}`);
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
