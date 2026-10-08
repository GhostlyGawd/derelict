/**
 * Mobile control check. Boots the built game in a touch-emulated phone
 * viewport and exercises the touch scheme: the movement stick, drag look,
 * contextual tap to interact, held crouch — and since phase 7, two thumbs at
 * once, a look drag that starts left of centre, and a sweep of touch-downs
 * across the whole screen against the zone table.
 *
 *   node tools/mobile.mjs [baseUrl] [--shots]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium, devices } from 'playwright';

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
const context = await browser.newContext({
  ...devices['iPhone 13'],
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

/** Synthesises a real touch stream — Playwright's touchscreen only taps. */
async function swipe(from, to, { steps = 12, id = 1, holdMs = 0 } = {}) {
  await page.evaluate(
    async ([a, b, n, identifier, hold]) => {
      const fire = (type, x, y) => {
        const touch = new Touch({ identifier, target: document.body, clientX: x, clientY: y });
        window.dispatchEvent(
          new TouchEvent(type, {
            changedTouches: [touch],
            touches: type === 'touchend' ? [] : [touch],
            targetTouches: type === 'touchend' ? [] : [touch],
            bubbles: true,
            cancelable: true,
          })
        );
      };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      fire('touchstart', a[0], a[1]);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        fire('touchmove', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        await wait(16);
      }
      if (hold > 0) await wait(hold);
      fire('touchend', b[0], b[1]);
    },
    [from, to, steps, id, holdMs]
  );
}

/** Holds the stick deflected so the player actually walks for a while. */
async function hold(from, to, ms) {
  await swipe(from, to, { steps: 6, holdMs: ms });
}

const read = () =>
  page.evaluate(() => {
    const g = window.__derelict;
    return {
      phase: g.phase,
      cells: g.cells,
      carrying: g.carry.held ? g.carry.held.id : null,
      released: g.carryables.cradles.filter((c) => c.released).map((c) => c.id),
      touch: g.input.usingTouch,
      touchUiVisible: !document.getElementById('touch').classList.contains('hidden'),
      pos: [+g.player.position.x.toFixed(2), +g.player.position.z.toFixed(2)],
      yaw: +g.player.yaw.toFixed(3),
      prompt: document.getElementById('prompt').textContent,
      button: document.getElementById('touch-interact').classList.contains('on'),
      crouching: g.player.crouching,
      eye: +g.camera.position.y.toFixed(2),
      crouchBtnHeld: document.getElementById('touch-crouch').classList.contains('held'),
    };
  });

/**
 * Fires one touch phase at a button. The stick and look regions are driven by
 * events on `window`, but the buttons listen on themselves and stop
 * propagation — so a held control has to be poked directly, and in two halves,
 * because the whole point of crouch is what happens while it is down.
 */
const touchButton = (selector, type) =>
  page.evaluate(
    ([sel, t]) => {
      const el = document.querySelector(sel);
      const touch = new Touch({ identifier: 7, target: el, clientX: 0, clientY: 0 });
      el.dispatchEvent(
        new TouchEvent(t, {
          changedTouches: [touch],
          touches: t === 'touchend' ? [] : [touch],
          targetTouches: t === 'touchend' ? [] : [touch],
          bubbles: true,
          cancelable: true,
        })
      );
    },
    [selector, type]
  );

console.log(`mobile: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });

let s = await read();
if (!s.touch) throw new Error('touch scheme not detected on an emulated phone');
console.log('  touch scheme active');

await page.tap('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(1500);
s = await read();
if (!s.touchUiVisible) throw new Error('touch controls are hidden while playing');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm1-bay.png') });

// ---- Left half: virtual joystick ------------------------------------------
const before = (await read()).pos;
await hold([90, 620], [90, 500], 1400); // push the stick forward
const after = (await read()).pos;
const travelled = Math.hypot(after[0] - before[0], after[1] - before[1]);
if (travelled < 1.5) throw new Error(`joystick moved the player only ${travelled.toFixed(2)} m`);
console.log(`  joystick → walked ${travelled.toFixed(2)} m`);

// ---- Right half: drag look -------------------------------------------------
const yawBefore = (await read()).yaw;
await swipe([300, 400], [140, 400], { steps: 14 });
const yawAfter = (await read()).yaw;
if (Math.abs(yawAfter - yawBefore) < 0.3) {
  throw new Error(`drag look barely turned the camera (${yawBefore} → ${yawAfter})`);
}
console.log(`  drag look → yaw ${yawBefore} → ${yawAfter}`);

// ---- Phase 7: two thumbs, in portrait ---------------------------------------
//
// The owner's report: trying to look moved the player instead, and moving and
// looking at once was awkward. The old layer split the screen at the midline,
// so a right thumb that landed just left of it took the stick, and a second
// thumb anywhere on the left while the stick was held was dropped. Every check
// here drives touches the way two thumbs do — overlapping in time — which is
// the one thing this file never did before.

/**
 * Plays several touch streams at once. Each track is [id, from, to, startStep,
 * endStep]; every step fires one touchmove per live track, so two thumbs move
 * in the same frames, as they do on glass.
 */
async function thumbs(tracks, steps, stepMs = 30) {
  await page.evaluate(
    async ([list, n, ms]) => {
      const live = new Map();
      const fire = (type, changed) => {
        const make = ([id, x, y]) => new Touch({ identifier: id, target: document.body, clientX: x, clientY: y });
        const all = [...live.entries()].map(([id, [x, y]]) => make([id, x, y]));
        window.dispatchEvent(
          new TouchEvent(type, { changedTouches: changed.map(make), touches: all, targetTouches: all, bubbles: true, cancelable: true })
        );
      };
      const at = ([id, a, b, s0, s1], step) => {
        const t = Math.min(1, Math.max(0, (step - s0) / Math.max(1, s1 - s0)));
        return [id, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      for (let step = 0; step <= n; step++) {
        for (const track of list) {
          if (step === track[3]) {
            const p = at(track, step);
            live.set(p[0], [p[1], p[2]]);
            fire('touchstart', [p]);
          }
        }
        const moving = list.filter((t) => step > t[3] && step <= t[4]).map((t) => at(t, step));
        for (const p of moving) live.set(p[0], [p[1], p[2]]);
        if (moving.length) fire('touchmove', moving);
        for (const track of list) {
          if (step === track[4]) {
            const p = at(track, step);
            live.delete(p[0]);
            fire('touchend', [p]);
          }
        }
        await new Promise((r) => setTimeout(r, ms));
      }
    },
    [tracks, steps, stepMs]
  );
}

const vp = page.viewportSize();
const W = vp.width;
const H = vp.height;

// Left thumb walks; right thumb goes down left of centre, mid-screen, while the
// stick is held, and drags. The camera has to turn and the walking go on.
{
  const a = await read();
  await thumbs(
    [
      [1, [W * 0.22, H * 0.9], [W * 0.22, H * 0.78], 0, 60],
      [2, [W * 0.44, H * 0.62], [W * 0.85, H * 0.6], 12, 48],
    ],
    60
  );
  const b = await read();
  const walked = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
  if (Math.abs(b.yaw - a.yaw) < 0.3) {
    throw new Error(`a second thumb left of centre did not look (yaw ${a.yaw} → ${b.yaw}) — it was dropped or taken as movement`);
  }
  if (walked < 0.8) throw new Error(`looking with the right thumb stopped the left thumb walking (${walked.toFixed(2)} m)`);
  console.log(`  two thumbs → walked ${walked.toFixed(2)} m and turned ${(b.yaw - a.yaw).toFixed(2)} rad at once`);
}

// One thumb, reaching across: a look drag that starts just left of the
// midline, above the stick's zone, must look and must not walk.
{
  const a = await read();
  await thumbs([[3, [W * 0.45, H * 0.42], [W * 0.1, H * 0.42], 0, 30]], 32);
  const b = await read();
  const walked = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
  if (walked > 0.15) throw new Error(`a look drag left of centre walked the player ${walked.toFixed(2)} m — the overlap the owner reported`);
  if (Math.abs(b.yaw - a.yaw) < 0.3) throw new Error(`a look drag left of centre did not turn the camera (yaw ${a.yaw} → ${b.yaw})`);
  console.log(`  reach-across drag → looked ${(b.yaw - a.yaw).toFixed(2)} rad, walked ${walked.toFixed(2)} m`);
}

// The sweep: touch-downs across the whole screen, judged against the zone
// table the game itself reads. Alone, a touch starts the stick only inside the
// movement zone and is look everywhere else that is not a button. With the
// stick already held, every touch that is not a button is look.
{
  const report = await page.evaluate(() => {
    const g = window.__derelict;
    const input = g.input;
    const zone = input.stickZone?.(window.innerWidth, window.innerHeight);
    if (!zone) return { missing: true };
    const W = window.innerWidth;
    const H = window.innerHeight;
    const inZone = (x, y) => x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1;
    const onButton = (x, y) => Boolean(document.elementFromPoint(x, y)?.closest?.('#touch-interact, #touch-crouch'));
    const down = (id, x, y) => {
      const t = new Touch({ identifier: id, target: document.body, clientX: x, clientY: y });
      window.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [t], touches: [t], bubbles: true, cancelable: true }));
    };
    const up = (id, x, y) => {
      const t = new Touch({ identifier: id, target: document.body, clientX: x, clientY: y });
      window.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t], touches: [], bubbles: true, cancelable: true }));
    };
    const wrong = [];
    let checked = 0;
    for (let i = 0; i < 14; i++) {
      for (let j = 0; j < 22; j++) {
        const x = ((i + 0.5) / 14) * W;
        const y = ((j + 0.5) / 22) * H;
        if (onButton(x, y)) continue;
        checked++;
        // Alone.
        down(50, x, y);
        const stick = input.stick.id === 50;
        const look = input.lookTouch.id === 50;
        up(50, x, y);
        const want = inZone(x, y) ? 'stick' : 'look';
        const got = stick ? 'stick' : look ? 'look' : 'nothing';
        if (got !== want) wrong.push(`alone (${x | 0}, ${y | 0}) ${got}, want ${want}`);
        // Second, with the stick held.
        down(60, zone.x0 + 20, zone.y1 - 20);
        down(61, x, y);
        const second = input.lookTouch.id === 61 ? 'look' : input.stick.id === 61 ? 'stick' : 'nothing';
        up(61, x, y);
        up(60, zone.x0 + 20, zone.y1 - 20);
        if (second !== 'look') wrong.push(`second (${x | 0}, ${y | 0}) ${second}, want look`);
      }
    }
    input.move.x = input.move.y = 0;
    return { checked, wrong, zone };
  });
  if (report.missing) throw new Error('the input layer publishes no stick zone — the zones are not data the harness can read');
  if (report.wrong.length) {
    throw new Error(`${report.wrong.length} of ${report.checked * 2} touch-downs assigned wrongly: ${report.wrong.slice(0, 5).join('; ')}`);
  }
  console.log(`  zone sweep → ${report.checked * 2} touch-downs, every one assigned as the zone table says`);
}

// ---- Held crouch button ----------------------------------------------------
// Held, not toggled, on touch as well as on desktop — so this asserts the state
// while the finger is down and again after it lifts. A toggle would pass the
// first half of this and fail the second.
const standingEye = (await read()).eye;
await touchButton('#touch-crouch', 'touchstart');
await page.waitForFunction(() => window.__derelict.player.crouchBlend > 0.98, null, { timeout: 8000 });
s = await read();
if (!s.crouching) throw new Error('holding the crouch button did not crouch');
if (!s.crouchBtnHeld) throw new Error('the crouch button is down but does not show a held state');
if (s.eye >= standingEye - 0.4) {
  throw new Error(`crouched but the eye only moved ${standingEye} → ${s.eye}`);
}
console.log(`  crouch button held → eye ${standingEye} → ${s.eye}`);
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm1b-crouched.png') });

await touchButton('#touch-crouch', 'touchend');
await page.waitForFunction(() => window.__derelict.player.crouchBlend < 0.02, null, { timeout: 8000 });
s = await read();
if (s.crouching) throw new Error('released the crouch button and stayed crouched — it is behaving as a toggle');
if (s.crouchBtnHeld) throw new Error('the crouch button is up but still shows a held state');
console.log(`  crouch button released → eye back to ${s.eye}`);

// ---- Contextual interact button -------------------------------------------
await page.evaluate(() => {
  const g = window.__derelict;
  g.player.position.set(-31.6, 0, -3.4);
  g.player.yaw = Math.PI / 2;
  g.player.pitch = 0;
});
await page.waitForTimeout(400);
s = await read();
if (!s.prompt) throw new Error('no interact prompt at the switch on mobile');
if (!s.button) throw new Error('context button did not light up');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm2-switch.png') });

await page.tap('#touch-interact');
await page.waitForTimeout(1200);
s = await read();
if (!s.released.includes('cradle1')) throw new Error(`context tap did not flip the switch (${JSON.stringify(s)})`);
console.log('  context tap → switch flipped');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm3-powered.png') });

// ---- Carrying, on touch ----------------------------------------------------
// The whole phase 2 verb has to work with one thumb: take, put down, take back,
// seat. The set-down is the part that could quietly not exist on a phone, since
// it is the one action with nothing in the crosshair to light the button.
await page.evaluate(() => {
  const g = window.__derelict;
  g.player.position.set(-29.5, 0, -7.55);
  g.player.yaw = 0;
  g.player.pitch = 0;
});
await page.waitForTimeout(400);
s = await read();
if (!s.button) throw new Error('context button did not light up at the cradle');
await page.tap('#touch-interact');
await page.waitForTimeout(500);
s = await read();
if (s.carrying !== 'cell1') throw new Error(`context tap did not take the cell (${JSON.stringify(s)})`);
console.log('  context tap → cell taken');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm4-carrying.png') });

// Turn to face open floor, so nothing is targeted and only the carry is left.
await page.evaluate(() => void (window.__derelict.player.yaw = Math.PI));
await page.waitForTimeout(400);
s = await read();
if (!s.button) throw new Error('context button went dark while carrying, so a cell could never be put down on touch');
if (!s.prompt?.includes('Set Down')) throw new Error(`carrying offered no set-down prompt (got "${s.prompt}")`);
await page.tap('#touch-interact');
await page.waitForTimeout(500);
s = await read();
if (s.carrying !== null) throw new Error(`context tap did not set the cell down (${JSON.stringify(s)})`);

await page.tap('#touch-interact');
await page.waitForTimeout(500);
s = await read();
if (s.carrying !== 'cell1') throw new Error(`could not pick the cell back up on touch (${JSON.stringify(s)})`);
console.log('  context tap → set down and picked back up');

await page.evaluate(() => {
  const g = window.__derelict;
  g.player.position.set(1.72, 0, -5.9);
  g.player.yaw = 0;
  g.player.pitch = 0;
});
await page.waitForTimeout(400);
s = await read();
if (!s.button) throw new Error('context button did not light up at the socket');
await page.tap('#touch-interact');
await page.waitForTimeout(1200);
s = await read();
if (s.cells !== 1) throw new Error(`context tap did not seat the cell (${JSON.stringify(s)})`);
console.log('  context tap → cell seated, 1/2');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm5-seated.png') });

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nmobile: OK');
