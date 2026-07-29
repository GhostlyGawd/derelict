/**
 * Mobile control check. Boots the built game in a touch-emulated phone
 * viewport and exercises the three-part scheme from the spec: left virtual
 * joystick, right-side drag look, contextual tap to interact.
 *
 *   node tools/mobile.mjs [baseUrl] [--shots]
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium, devices } = require('playwright');

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
      touch: g.input.usingTouch,
      touchUiVisible: !document.getElementById('touch').classList.contains('hidden'),
      pos: [+g.player.position.x.toFixed(2), +g.player.position.z.toFixed(2)],
      yaw: +g.player.yaw.toFixed(3),
      prompt: document.getElementById('prompt').textContent,
      button: document.getElementById('touch-interact').classList.contains('on'),
    };
  });

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
if (s.cells !== 1) throw new Error(`context tap did not flip the switch (cells=${s.cells})`);
console.log('  context tap → switch flipped');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'm3-powered.png') });

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nmobile: OK');
