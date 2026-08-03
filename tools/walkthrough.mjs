/**
 * On-foot walkthrough. The route is walked with held movement keys and mouse
 * look only — no teleporting — so collision, doorway widths and the debris
 * squeeze are all genuinely exercised. This is what backs the "no soft-locks"
 * claim; tools/smoke.mjs teleports between rooms and cannot.
 *
 *   node tools/walkthrough.mjs [baseUrl] [--shots]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('tools/shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
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
      clock: g.runTime,
      cells: g.cells,
      carrying: g.carry.held ? g.carry.held.id : null,
      released: g.carryables.cradles.filter((c) => c.released).map((c) => c.id),
      prompt: document.getElementById('prompt').textContent,
      crouching: g.player.crouching,
      trapped: g.player.trapped,
      eye: g.camera.position.y,
    };
  });

/** Mouse look is fair game; position is not. */
const face = (yaw) => page.evaluate((y) => void (window.__derelict.player.yaw = y), yaw);

/** Aims at a world point the way a player turns to look at a thing. */
async function faceAt(x, z) {
  const now = await read();
  await face(Math.atan2(-(x - now.x), -(z - now.z)));
  await page.waitForTimeout(180);
}

/**
 * Looks at a fixture and presses E, insisting the prompt appeared first. The
 * prompt is the assertion that matters: it means the crosshair actually found
 * the thing from where a walked player ends up standing, which is the only
 * check that the fixture is mounted at a height a human can aim at.
 */
async function interactWith(name, x, z, expected) {
  await faceAt(x, z);
  const before = await read();
  if (!before.prompt) {
    throw new Error(`stood at (${before.x.toFixed(2)}, ${before.z.toFixed(2)}) facing ${name}, but no prompt appeared`);
  }
  if (expected && !before.prompt.includes(expected)) {
    throw new Error(`expected the ${name} prompt to offer "${expected}", got "${before.prompt}"`);
  }
  await page.keyboard.press('KeyE');
}

/**
 * Walks to a point by holding W and re-aiming, the way a player would.
 * Fails loudly if progress stalls — that is the soft-lock detector.
 */
async function walkTo(name, tx, tz, { arrive = 0.75, timeoutMs = 45000, expectBlocked = false } = {}) {
  const start = Date.now();
  let travelled = 0;
  let last = await read();
  // Stalling is measured against the game clock, which advances with dt, and
  // never against the wall clock. Both of the obvious formulations are really
  // measurements of the renderer: distance-per-poll is a speed, and "no
  // progress in N wall-clock seconds" fires when the host hitches even though
  // the player is walking normally. "Covered less than 25 cm while the game
  // advanced 2.5 s" is a fact about the level.
  let lastProgressClock = last.clock;
  let sinceProgress = 0;

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

      sinceProgress += step;
      if (sinceProgress >= 0.25) {
        sinceProgress = 0;
        lastProgressClock = now.clock;
      }
      const stalled = now.clock - lastProgressClock > 2.5;
      const timedOut = Date.now() - start > timeoutMs;

      // Failing to arrive is the whole assertion for a leg that expects a wall,
      // so either exit condition confirms it.
      if ((stalled || timedOut) && expectBlocked) {
        return { travelled, seconds: (Date.now() - start) / 1000, end: now, blocked: true };
      }
      if (stalled) {
        throw new Error(
          `stuck walking to ${name}: held at (${now.x.toFixed(2)}, ${now.z.toFixed(2)}), ` +
            `${distance.toFixed(2)} m short`
        );
      }
      if (timedOut) {
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

/**
 * Legs of the route, in order. Names are what a failure will report.
 *
 * Phase 2 makes this a round trip rather than a sweep: each cell has to be
 * carried back to the airlock, so the Bay is crossed four times and both
 * corridors are walked in both directions.
 */
const TO_SWITCH_1 = [
  ['bay centre', 0, 0.5],
  ['corridor A door', -6.2, 0],
  ['corridor A', -13, 0],
  ['hold entrance', -20.5, 0],
  ['hold, west wall', -28, -3.4],
  ['switch 1', -31.9, -3.4, { arrive: 0.5 }],
];

const TO_CRADLE_1 = [
  ['hold, mid floor', -29.0, -5.6],
  ['cradle 1', -29.5, -7.55, { arrive: 0.55 }],
];

const HOME_WITH_CELL_1 = [
  ['hold, centre', -24.0, -2.0],
  ['hold entrance', -20.5, 0],
  ['corridor A', -13, 0],
  ['bay centre', 0, 0],
  ['socket 1', 1.72, -5.9, { arrive: 0.5 }],
];

const TO_SWITCH_2 = [
  ['bay centre', 0, 0],
  ['corridor B door', 6.2, 0],
  // Straight down the centreline into the pile: this must stop the player,
  // which is what makes the blockage read as collapsed debris rather than as
  // a corridor that happens to be narrow.
  ['debris pile (expect blocked)', 16.5, 0, { expectBlocked: true, timeoutMs: 12000 }],
  // Back off and line up on the gap, which is what a player does after walking
  // into the pile — rather than grinding along its face at a shallow angle.
  // z = 0.45 is the middle of the passable window: the pile ends at z = 0.05
  // and the south wall starts at 1.1, so a 0.68 m-wide player fits anywhere in
  // z ∈ [0.39, 0.76]. Aiming at either edge of that is how this leg was flaky.
  // Back off and line up on the gap, which is what a player does after walking
  // into the pile — rather than grinding along its face at a shallow angle.
  ['back off the pile', 9.9, 0.45],
];

/**
 * Phase 4 splits the squeeze in two, because the whole point of the feature is
 * that the first of these fails and the second succeeds. Walking the gap
 * upright has to stop at the collapsed structure; the same line crouched has to
 * pass. Between them the harness lets go of crouch under the slab, where
 * standing back up must be refused — the one state crouch could stranded a
 * player in, and so the one worth asserting on foot rather than reasoning about.
 */
const THROUGH_THE_SQUEEZE_STANDING = [
  ['squeeze, standing (expect blocked)', 16.5, 0.45, { expectBlocked: true, timeoutMs: 12000 }],
  ['back off again', 9.9, 0.45],
];

const AFTER_THE_SQUEEZE = [
  ['annex entrance', 20.5, 0],
  ['switch 2', 31.9, 1.6, { arrive: 0.5 }],
];

const TO_CRADLE_2 = [
  ['annex, mid floor', 30.6, -4.6],
  ['cradle 2', 31.2, -7.55, { arrive: 0.55 }],
];

const HOME_WITH_CELL_2 = [
  ['annex, east floor', 30.0, 0],
  ['shortcut mouth', 20.5, 4.6],
  ['shortcut passage', 13, 4.6],
  ['bay, via hatch', 5.5, 4.6],
  ['socket 2', 2.58, -5.9, { arrive: 0.5 }],
];

const INTO_THE_AIRLOCK = [
  ['airlock threshold', 0, -5.5],
  ['airlock chamber', 0, -9.5, { arrive: 1.2 }],
];

/** Phase 5: out through the outer door, onto the deck outside the hull. */
const OUT_THROUGH_THE_OUTER_DOOR = [['threshold, outside the hull', 0, -14.0, { arrive: 0.5 }]];

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

// ---- 1. Switch 1 -----------------------------------------------------------
console.log('\n  Airlock Bay → Storage Hold');
for (const l of TO_SWITCH_1) await leg(l);

await interactWith('switch 1', -32.72, -3.4, 'Restore Power');
await page.waitForTimeout(1500);
let s = await read();
if (!s.released.includes('cradle1')) throw new Error('switch 1 did not release cradle 1 on foot');
if (s.cells !== 0) throw new Error(`switch 1 credited a cell on its own (cells=${s.cells})`);
console.log('  switch 1 flipped, cradle 1 released');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w1-switch1.png') });

// ---- 2. Take cell 1 --------------------------------------------------------
console.log('\n  Storage Hold → cradle 1');
for (const l of TO_CRADLE_1) await leg(l);

await interactWith('cradle 1', -29.5, -8.46, 'Take Power Cell');
await page.waitForTimeout(400);
s = await read();
if (s.carrying !== 'cell1') throw new Error(`cell 1 did not come off the cradle (carrying ${s.carrying})`);
console.log('  cell 1 in hand');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w2-cell1.png') });

// ---- 3. Carry it home, testing set-down on the way -------------------------
console.log('\n  Storage Hold → Airlock Bay, carrying cell 1');
for (const l of HOME_WITH_CELL_1.slice(0, 3)) await leg(l);

// Put it down mid-corridor and take it back: the drop lands at the player's
// feet, so this is the only check that a set-down cell can still be aimed at.
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
s = await read();
if (s.carrying !== null) throw new Error('pressing interact on nothing did not set the cell down');
if (!s.prompt?.includes('Take Power Cell')) {
  throw new Error(`a cell set down at the player's feet offered no prompt (got "${s.prompt}")`);
}
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
s = await read();
if (s.carrying !== 'cell1') throw new Error(`could not pick a set-down cell back up (carrying ${s.carrying})`);
console.log('  set down and picked back up in corridor A');

for (const l of HOME_WITH_CELL_1.slice(3)) await leg(l);

await interactWith('socket 1', 1.72, -6.7, 'Seat Power Cell');
await page.waitForTimeout(1500);
s = await read();
if (s.cells !== 1) throw new Error(`seating cell 1 did not read 1/2 (cells=${s.cells})`);
if (s.released.includes('cradle2')) throw new Error('the Bay coming live released cradle 2 on its own');
console.log('  cell 1 seated — 1/2, Bay live');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w3-seated1.png') });

// ---- 4. Switch 2 -----------------------------------------------------------
console.log('\n  Airlock Bay → Engine Annex, through the squeeze');
for (const l of TO_SWITCH_2) await leg(l);

// ---- The squeeze must be crouched -----------------------------------------
for (const l of THROUGH_THE_SQUEEZE_STANDING) await leg(l);
const uprightStop = await read();
if (uprightStop.x > 11.3) {
  throw new Error(
    `walked upright to x=${uprightStop.x.toFixed(2)}, past the collapsed structure at x=11.3 — ` +
      'the squeeze is not a squeeze'
  );
}

// Waited on as a condition, not a delay. The stance blend advances per frame,
// so "sleep 250 ms and read the eye height" is really a measurement of the
// renderer — the same mistake the stall detector above exists to avoid.
const settled = (want) =>
  page.waitForFunction(
    (target) => Math.abs(window.__derelict.player.crouchBlend - target) < 0.02,
    want,
    { timeout: 10000 }
  );

await page.keyboard.down('KeyC');
await settled(1);
const ducked = await read();
if (!ducked.crouching) throw new Error('held C and the player did not crouch');
if (ducked.eye > 1.12) throw new Error(`crouched but the eye is still at ${ducked.eye.toFixed(2)} m`);
console.log(`  ↓ crouched, eye ${ducked.eye.toFixed(2)} m`);

await leg(['squeeze, crouched — under the slab', 12.4, 0.45, { arrive: 0.4, timeoutMs: 30000 }]);

// Let go of crouch with the structure directly overhead. Standing has to be
// refused, and the player has to stay mobile rather than stuck.
await page.keyboard.up('KeyC');
// Give the game real frames to stand up in and confirm it declined to. Waiting
// on the game clock rather than the wall clock means a slow renderer cannot
// pass this vacuously by simply not running.
const releasedAt = (await read()).clock;
await page.waitForFunction((t) => window.__derelict.runTime > t + 0.6, releasedAt, { timeout: 15000 });
const underneath = await read();
if (!underneath.crouching) {
  throw new Error(
    `stood up at (${underneath.x.toFixed(2)}, ${underneath.z.toFixed(2)}) with structure overhead — ` +
      'crouch can strand a player here'
  );
}
if (!underneath.trapped) throw new Error('the player is crouched under the slab but not reporting it');
console.log('  ✓ standing back up refused while something is overhead');

await page.keyboard.down('KeyC');
await leg(['squeeze, crouched — through', 16.8, 0.45, { arrive: 0.6, timeoutMs: 30000 }]);
await page.keyboard.up('KeyC');
await settled(0);
const cleared = await read();
if (cleared.crouching) throw new Error('past the slab and still unable to stand');
console.log(`  ↑ stood back up past the slab, eye ${cleared.eye.toFixed(2)} m`);

for (const l of AFTER_THE_SQUEEZE) await leg(l);

await interactWith('switch 2', 32.72, 1.6, 'Restore Power');
await page.waitForTimeout(2600);
s = await read();
if (!s.released.includes('cradle2')) throw new Error('switch 2 plus a live Bay did not release cradle 2');
console.log('  switch 2 flipped, cradle 2 released, hatch cycling');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w4-switch2.png') });

// ---- 5. Take cell 2 --------------------------------------------------------
console.log('\n  Engine Annex → cradle 2');
for (const l of TO_CRADLE_2) await leg(l);

await interactWith('cradle 2', 31.2, -8.46, 'Take Power Cell');
await page.waitForTimeout(400);
s = await read();
if (s.carrying !== 'cell2') throw new Error(`cell 2 did not come off the cradle (carrying ${s.carrying})`);
console.log('  cell 2 in hand');

// ---- 6. Home via the shortcut ----------------------------------------------
console.log('\n  Engine Annex → Airlock Bay, via the shortcut hatch');
for (const l of HOME_WITH_CELL_2) await leg(l);

await interactWith('socket 2', 2.58, -6.7, 'Seat Power Cell');
await page.waitForTimeout(2600);
s = await read();
if (s.cells !== 2) throw new Error(`seating cell 2 did not read 2/2 (cells=${s.cells})`);
console.log('  cell 2 seated — 2/2, airlock cycling');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w5-seated2.png') });

console.log('\n  Airlock Bay → out');
for (const l of INTO_THE_AIRLOCK) await leg(l);

// ---- 7. The departure -------------------------------------------------------
//
// Phase 5's done-bar: the ending is a sequence, and the player holds the camera
// throughout. Claude cannot judge whether the moment lands — that is the
// owner's bar — but it can prove nothing was taken away, which is the half that
// is checkable and the half a cutscene would fail.
s = await read();
if (s.phase !== 'leaving') {
  throw new Error(`stepping into the chamber did not start the departure (phase=${s.phase})`);
}
console.log('\n  departure begun — outer door cycling');

const outerState = () =>
  page.evaluate(() => {
    const g = window.__derelict;
    const outer = g.doorsById.get('airlock-outer');
    return {
      t: outer.t,
      open: outer.open,
      chamber: g.lighting.lampsIn('chamber')[0]?.intensity ?? -1,
      behind: g.lighting.lampsIn('hold')[0]?.intensity ?? -1,
    };
  });

// The camera is still the player's. `input.look` is the accumulator the
// pointer-lock mousemove handler writes into, so nudging it drives exactly the
// path a mouse drives — the same move chain.mjs makes when it presses interact
// with the aim taken out. If the camera turns, the player's own update is still
// running, which is the thing a cutscene would have stopped.
const held = await page.evaluate(async () => {
  const g = window.__derelict;
  const yaw = g.player.yaw;
  const at = { x: g.player.position.x, z: g.player.position.z };
  g.input.look.dx += 0.3;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    turned: Math.abs(g.player.yaw - yaw),
    drifted: Math.hypot(g.player.position.x - at.x, g.player.position.z - at.z),
    enabled: g.input.enabled,
    phase: g.phase,
  };
});
if (!held.enabled) throw new Error('input was disabled during the departure — that is a cutscene');
if (held.turned < 0.2) {
  throw new Error(`look input moved the camera ${held.turned.toFixed(3)} rad during the departure`);
}
// And nothing moves the player but the player. A scripted pull-back would show
// up here as travel with no key held.
if (held.drifted > 0.05) {
  throw new Error(`the player drifted ${held.drifted.toFixed(2)} m with no input during the departure`);
}
console.log(`  camera still the player's (turned ${held.turned.toFixed(2)} rad, drifted ${held.drifted.toFixed(3)} m)`);

await page.waitForFunction(() => window.__derelict.doorsById.get('airlock-outer').open, null, {
  timeout: 60000,
});
const opened = await outerState();
if (opened.chamber <= 0.5) {
  throw new Error(`the outer door opened and the chamber never flooded (${opened.chamber})`);
}
console.log(
  `  outer door open — chamber at ${opened.chamber.toFixed(1)}, the ship behind at ${opened.behind.toFixed(1)}`
);
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w6-outer-open.png') });

for (const l of OUT_THROUGH_THE_OUTER_DOOR) await leg(l);

const left = await outerState();
if (left.behind >= opened.behind) {
  throw new Error(
    `the ship behind the airlock never went dark (${opened.behind.toFixed(1)} → ${left.behind.toFixed(1)})`
  );
}
console.log(`  the ship behind fell to ${left.behind.toFixed(1)}`);

// Input goes with the end card and not a moment before it.
const stillHeld = await page.evaluate(() => ({
  phase: window.__derelict.phase,
  enabled: window.__derelict.input.enabled,
}));
if (stillHeld.phase === 'ending' && !stillHeld.enabled) {
  throw new Error('the camera was taken away before the end card');
}

await page.waitForFunction(() => window.__derelict?.phase === 'ended', null, { timeout: 30000 });
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'w6-end.png') });

// The end card reports the run in the ship's language: what got its power back,
// what is in the sockets, how long you were aboard.
const readout = await page.evaluate(() =>
  [...document.querySelectorAll('#end-readout dt')].map((dt) => [
    dt.textContent,
    dt.nextElementSibling?.textContent,
  ])
);
if (readout.length !== 3) {
  throw new Error(`the end card reported ${readout.length} lines, expected 3`);
}
const compartments = readout.find(([label]) => label.includes('COMPARTMENT'));
if (!compartments || compartments[1] !== '7 / 7') {
  throw new Error(`the end card reads "${compartments?.[1]}" compartments restored, expected 7 / 7`);
}
console.log('  end card: ' + readout.map(([k, v]) => `${k} ${v}`).join(', '));

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
