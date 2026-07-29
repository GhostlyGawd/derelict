/**
 * On-foot walkthrough. The route is walked with held movement keys and mouse
 * look only — no teleporting — so collision, doorway widths and the debris
 * squeeze are all genuinely exercised. This is what backs the "no soft-locks"
 * claim; tools/smoke.mjs teleports between rooms and cannot.
 *
 *   node tools/walkthrough.mjs [baseUrl] [--shots]
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('tools/shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const read = () =>
  page.evaluate(() => {
    const g = window.__derelict;
    return {
      x: g.player.position.x,
      z: g.player.position.z,
      phase: g.phase,
      cells: g.cells,
      prompt: document.getElementById('prompt').textContent,
    };
  });

/** Mouse look is fair game; position is not. */
const face = (yaw) => page.evaluate((y) => void (window.__derelict.player.yaw = y), yaw);

/**
 * Walks to a point by holding W and re-aiming, the way a player would.
 * Fails loudly if progress stalls — that is the soft-lock detector.
 */
async function walkTo(name, tx, tz, { arrive = 0.75, timeoutMs = 22000, expectBlocked = false } = {}) {
  const start = Date.now();
  let travelled = 0;
  let last = await read();
  let stalledFor = 0;

  await page.keyboard.down('KeyW');
  try {
    for (;;) {
      const now = await read();
      const step = Math.hypot(now.x - last.x, now.z - last.z);
      travelled += step;

      const dx = tx - now.x;
      const dz = tz - now.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= arrive) {
        if (expectBlocked) {
          throw new Error(`expected to be blocked short of ${name}, but walked straight through`);
        }
        return { travelled, seconds: (Date.now() - start) / 1000, end: now };
      }

      // yaw 0 looks down -Z, so forward is (-sin, -cos).
      await face(Math.atan2(-dx, -dz));

      stalledFor = step < 0.012 ? stalledFor + 1 : 0;
      if (stalledFor >= 26) {
        if (expectBlocked) {
          return { travelled, seconds: (Date.now() - start) / 1000, end: now, blocked: true };
        }
        throw new Error(
          `stuck walking to ${name}: held at (${now.x.toFixed(2)}, ${now.z.toFixed(2)}), ` +
            `${distance.toFixed(2)} m short`
        );
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timed out walking to ${name}: reached (${now.x.toFixed(2)}, ${now.z.toFixed(2)}), ` +
            `${distance.toFixed(2)} m short`
        );
      }

      last = now;
      await page.waitForTimeout(60);
    }
  } finally {
    await page.keyboard.up('KeyW');
  }
}

/** Legs of the route, in order. Names are what a failure will report. */
const ROUTE = [
  ['bay centre', 0, 0.5],
  ['corridor A door', -6.2, 0],
  ['corridor A', -13, 0],
  ['hold entrance', -20.5, 0],
  ['hold, west wall', -28, -3.4],
  ['switch 1', -31.9, -3.4, { arrive: 0.5 }],
];

const RETURN_AND_EAST = [
  ['hold entrance', -20.5, 0],
  ['corridor A', -13, 0],
  ['bay centre', 0, 0],
  ['corridor B door', 6.2, 0],
  // Straight down the centreline into the pile: this must stop the player,
  // which is what makes the blockage read as collapsed debris rather than as
  // a corridor that happens to be narrow.
  ['debris pile (expect blocked)', 16.5, 0, { expectBlocked: true, timeoutMs: 12000 }],
  // Then the squeeze itself, aimed at the gap the way a player would after
  // bumping into the pile once.
  ['squeeze, along the south wall', 16.5, 0.7, { timeoutMs: 30000 }],
  ['annex entrance', 20.5, 0],
  ['switch 2', 31.9, 1.6, { arrive: 0.5 }],
];

const SHORTCUT_HOME = [
  ['shortcut mouth', 20.5, 4.6],
  ['shortcut passage', 13, 4.6],
  ['bay, via hatch', 5.5, 4.6],
  ['airlock threshold', 0, -5.5],
  ['airlock chamber', 0, -9.5, { arrive: 1.2 }],
];

let totalDistance = 0;
let totalSeconds = 0;

async function leg([name, x, z, opts]) {
  const r = await walkTo(name, x, z, opts);
  totalDistance += r.travelled;
  totalSeconds += r.seconds;
  const note = r.blocked ? ' (stopped, as expected)' : '';
  console.log(
    `  → ${name.padEnd(30)} ${r.travelled.toFixed(1).padStart(5)} m  ${r.seconds.toFixed(1)}s${note}`
  );
}

console.log(`walkthrough: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(1600);

console.log('\n  Airlock Bay → Storage Hold');
for (const l of ROUTE) await leg(l);

let s = await read();
if (!s.prompt) throw new Error('walked to switch 1 but no interact prompt appeared');
await page.keyboard.press('KeyE');
await page.waitForTimeout(1500);
s = await read();
if (s.cells !== 1) throw new Error(`switch 1 did not register on foot (cells=${s.cells})`);
console.log('  switch 1 flipped');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w1-switch1.png') });

console.log('\n  Storage Hold → Engine Annex, through the squeeze');
for (const l of RETURN_AND_EAST) await leg(l);

s = await read();
if (!s.prompt) throw new Error('walked to switch 2 but no interact prompt appeared');
await page.keyboard.press('KeyE');
await page.waitForTimeout(2600);
s = await read();
if (s.cells !== 2) throw new Error(`switch 2 did not register on foot (cells=${s.cells})`);
console.log('  switch 2 flipped, airlock cycling');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w2-switch2.png') });

console.log('\n  Engine Annex → Airlock, via the shortcut hatch');
for (const l of SHORTCUT_HOME) await leg(l);

await page.waitForFunction(() => window.__derelict?.phase === 'ended', null, { timeout: 20000 });
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w3-end.png') });

const runTime = await page.evaluate(() => window.__derelict.runTime);
console.log(
  `\n  walked ${totalDistance.toFixed(0)} m in ${totalSeconds.toFixed(0)}s ` +
    `(run clock ${Math.floor(runTime / 60)}:${String(Math.floor(runTime % 60)).padStart(2, '0')})`
);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nwalkthrough: OK — route is walkable end to end, no soft-locks');
