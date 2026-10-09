/**
 * The trace gate — phase 7, spec 7.3.2.
 *
 * Every report in this project that mattered was a feeling about a run only the
 * owner played: the footstep ring, "a touch less responsive", the dry
 * footsteps, the touch overlap. None of them could be reproduced here until it
 * had been fixed. A trace is that run, bottled — raw input and the time step of
 * every frame — and this plays it back through the real input layer and the
 * real frame loop and asserts it ends where it ended for the player.
 *
 * Two things, in order:
 *
 *   1. A round trip. The harness plays a short two-thumb run on a portrait
 *      phone with `?trace` on, takes the recording, and replays it in a fresh
 *      page. Record and replay have to agree at every checkpoint. If they do
 *      not, no trace means anything, so this runs first and fails loudly.
 *   2. Every committed trace in tools/traces/. One recorded on the current
 *      input layer is replayed and asserted. One recorded on an older layer is
 *      retired evidence: a deliberate change to how touches are assigned is
 *      supposed to make it diverge, so it is reported and not gated.
 *
 * Replay steps the game's own frame body with each recorded time step and
 * skips drawing, which is most of a frame's cost under a software rasteriser.
 * What drawing also did — bring every world matrix up to date for the next
 * frame's interaction ray — still happens at the same point.
 *
 *   node tools/replay.mjs [baseUrl]
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { launch, deviceFor as device, boot as bootAt, replay as replayIn } from './lib/replayer.mjs';

import { inStickZone } from '../src/core/touchzones.js';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const TRACES = path.resolve('tools/traces');
/** Metres. A replay of the same input on the same layer should land on the same spot. */
const POSITION_TOLERANCE = 0.05;
/** Radians. */
const YAW_TOLERANCE = 0.01;

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

const deviceFor = (trace) => device(browser, trace, errors);
const boot = (page, query = '') => bootAt(page, BASE, query);
const replay = (trace) => replayIn(browser, BASE, trace, { errors });

// ---- 1. Round trip -----------------------------------------------------------
//
// Recorded the way a player records one: with the browser's own clock driving
// the frames, and touches arriving whenever they arrive. The run is two thumbs
// on a portrait phone — the case 7.3.1 is about — with a crouch held part-way
// and an interact pressed at nothing.
console.log(`replay: ${BASE}`);
console.log('\n  round trip — recorded here, replayed in a fresh page');

const recorded = await (async () => {
  const { context, page } = await deviceFor({ viewport: { w: 390, h: 844, dpr: 1 }, touch: true });
  await boot(page, '?trace');
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });

  const trace = await page.evaluate(async () => {
    const g = window.__derelict;
    const canvas = g.canvas;
    const crouch = document.getElementById('touch-crouch');
    const interact = document.getElementById('touch-interact');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (target, type, touches) => {
      const list = touches.map(
        ([identifier, clientX, clientY]) => new Touch({ identifier, target, clientX, clientY })
      );
      target.dispatchEvent(
        new TouchEvent(type, {
          changedTouches: list,
          touches: type === 'touchend' ? [] : list,
          bubbles: true,
          cancelable: true,
        })
      );
    };

    // Left thumb down low on the left and pushed forward.
    fire(canvas, 'touchstart', [[1, 90, 700]]);
    for (let i = 1; i <= 6; i++) {
      fire(canvas, 'touchmove', [[1, 90 + i, 700 - i * 7]]);
      await wait(30);
    }
    // Right thumb down on the right while still walking, and dragged.
    fire(canvas, 'touchstart', [[2, 300, 420]]);
    for (let i = 1; i <= 30; i++) {
      fire(canvas, 'touchmove', [[2, 300 - i * 2.5, 420 + Math.sin(i / 4) * 6]]);
      await wait(35);
    }
    fire(canvas, 'touchend', [[2, 225, 420]]);
    // Crouch held for a moment, then an interact at nothing.
    fire(crouch, 'touchstart', [[3, 340, 600]]);
    await wait(500);
    fire(crouch, 'touchend', [[3, 340, 600]]);
    fire(interact, 'touchstart', [[4, 330, 740]]);
    fire(interact, 'touchend', [[4, 330, 740]]);
    // Strafe left a little, then three more look sweeps while still walking —
    // a second thumb going down, dragging and lifting, over and over, is the
    // pattern the owner reported trouble with.
    for (let i = 1; i <= 12; i++) {
      fire(canvas, 'touchmove', [[1, 90 - i * 3, 658]]);
      await wait(40);
    }
    for (let sweep = 0; sweep < 3; sweep++) {
      const id = 10 + sweep;
      fire(canvas, 'touchstart', [[id, 280, 380]]);
      for (let i = 1; i <= 24; i++) {
        fire(canvas, 'touchmove', [[id, 280 + (sweep % 2 ? 1 : -1) * i * 3, 380 - i]]);
        fire(canvas, 'touchmove', [[1, 54 + Math.sin(i / 3) * 20, 640 - (i % 5)]]);
        await wait(40);
      }
      fire(canvas, 'touchend', [[id, 280, 356]]);
      await wait(150);
    }
    await wait(600);
    fire(canvas, 'touchend', [[1, 54, 658]]);
    await wait(400);

    g.trace.end();
    return g.trace.export();
  });
  await context.close();
  return trace;
})();

console.log(
  `  recorded ${recorded.frames.length} frames, ${recorded.events.length} events, ` +
    `${recorded.checkpoints.length} checkpoints, input layer v${recorded.input}`
);
expect('the recording captured raw touches', recorded.events.some((e) => e[0] === 't'), 'no touch events in the trace');
expect(
  'the recording carries raw frame intervals and the device (format 2, 8.3.2)',
  recorded.version === 2 &&
    recorded.intervals?.length === recorded.frames.length &&
    typeof recorded.device?.renderer === 'string' &&
    recorded.device.scale > 0,
  `version ${recorded.version}, ${recorded.intervals?.length} intervals for ${recorded.frames.length} frames, device ${JSON.stringify(recorded.device)}`
);
expect(
  'the run went somewhere',
  recorded.final && Math.hypot(recorded.final[3], recorded.final[4] - 4.6) > 0.5,
  `ended at ${JSON.stringify(recorded.final)}`
);
const roundTrip = await replay(recorded);
judge('round trip, touch', recorded, roundTrip);

// The same on a desktop: held keys, mouse look and a click, through the
// keyboard and pointer paths rather than the touch one.
const desk = await (async () => {
  const { context, page } = await deviceFor({ viewport: { w: 1024, h: 640, dpr: 1 }, touch: false });
  await boot(page, '?trace');
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
  const trace = await page.evaluate(async () => {
    const g = window.__derelict;
    // Headless cannot take a real pointer lock; recorded as the browser would
    // report gaining one, so replay applies the same state.
    document.dispatchEvent(new Event('pointerlockchange'));
    g.input.locked = true;
    g.trace.events.push(['l', g.trace.frame, 1]);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const look = (x, y) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y, bubbles: true }));
    key('keydown', 'KeyW');
    for (let i = 0; i < 40; i++) {
      look(i < 20 ? 6 : -4, i % 7 === 0 ? 2 : 0);
      if (i === 15) key('keydown', 'KeyA');
      if (i === 25) key('keyup', 'KeyA');
      if (i === 30) key('keydown', 'KeyC');
      await wait(40);
    }
    key('keyup', 'KeyC');
    g.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    await wait(500);
    key('keyup', 'KeyW');
    await wait(300);
    g.trace.end();
    return g.trace.export();
  });
  await context.close();
  return trace;
})();
console.log(
  `  recorded ${desk.frames.length} frames, ${desk.events.length} events, ` +
    `${desk.checkpoints.length} checkpoints on a desktop`
);
judge('round trip, desktop', desk, await replay(desk));

// The same with a pad (8.3.4): sticks, A, B and Start, through the polled path
// rather than an evented one. Recorded on a desktop with a synthetic pad; the
// replay has no pad at all, only the trace's record of what it reported.
const padded = await (async () => {
  const { context, page } = await deviceFor({ viewport: { w: 1024, h: 640, dpr: 1 }, touch: false });
  await page.addInitScript({ path: path.resolve('tools/lib/fakepad.js') });
  await boot(page, '?trace');
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
  const trace = await page.evaluate(async () => {
    const g = window.__derelict;
    const pad = window.__pad;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Forward, easing on, with the right stick swinging the view about. The
    // swing stays to one side: a full sine averages to no turn at all, and on
    // a slow runner that sampled it at few enough frames to end inside the
    // bar below.
    for (let i = 0; i < 30; i++) {
      pad.axes[1] = -Math.min(1, i / 10);
      pad.axes[2] = 0.45 + Math.sin(i / 5) * 0.35;
      pad.axes[3] = Math.cos(i / 7) * 0.3;
      await wait(30);
    }
    pad.axes[2] = 0;
    pad.axes[3] = 0;
    // Crouch held while strafing.
    pad.buttons[1] = 1;
    pad.axes[0] = 0.7;
    await wait(500);
    pad.buttons[1] = 0;
    pad.axes[0] = 0;
    // A at nothing, then Start to pause and Start to come back.
    pad.buttons[0] = 1;
    await wait(80);
    pad.buttons[0] = 0;
    await wait(80);
    pad.buttons[9] = 1;
    await wait(80);
    pad.buttons[9] = 0;
    await wait(200);
    const paused = g.phase;
    pad.buttons[9] = 1;
    await wait(80);
    pad.buttons[9] = 0;
    await wait(200);
    // Pulled out mid-stride, and put back.
    pad.axes[1] = -1;
    await wait(200);
    pad.unplugged = true;
    await wait(300);
    pad.unplugged = false;
    pad.axes[1] = 0;
    await wait(300);
    g.trace.end();
    return { paused, trace: g.trace.export() };
  });
  await context.close();
  return trace;
})();
const padEvents = padded.trace.events.filter((e) => e[0] === 'p');
console.log(`  recorded ${padded.trace.frames.length} frames, ${padEvents.length} pad states, with a pad`);
expect('the recording captured the pad', padEvents.length > 20, `${padEvents.length} pad events`);
expect('Start paused the run', padded.paused === 'paused', `phase after Start was ${padded.paused}`);
expect('the pad going away was recorded', padEvents.some((e) => e[2] === null), 'no disconnect in the trace');
expect(
  'the pad moved and turned the player',
  Math.hypot(padded.trace.final[3], padded.trace.final[4] - 4.6) > 0.5 && Math.abs(padded.trace.final[5]) > 0.05,
  `ended at ${JSON.stringify(padded.trace.final)}`
);
judge('round trip, pad', padded.trace, await replay(padded.trace));

// ---- 2. Committed traces ------------------------------------------------------
let committed = [];
try {
  committed = readdirSync(TRACES).filter((f) => f.endsWith('.json')).sort();
} catch {
  /* no directory yet */
}
console.log(`\n  committed traces (${committed.length})`);
const currentInput = await (async () => {
  const { context, page } = await deviceFor({ viewport: { w: 390, h: 844, dpr: 1 }, touch: true });
  await boot(page);
  const v = await page.evaluate(() => window.__derelict.inputVersion);
  await context.close();
  return v;
})();

for (const file of committed) {
  const trace = JSON.parse(readFileSync(path.join(TRACES, file), 'utf8'));
  const label = `${file} (v${trace.input}, ${trace.touch ? 'touch' : 'desktop'} ${trace.viewport.w}×${trace.viewport.h}, ${trace.frames.length} frames)`;
  if (trace.input !== currentInput) {
    console.log(`  retired ${label} — recorded on input layer v${trace.input}, current is v${currentInput}; kept as evidence, not gated`);
    if (trace.touch) reassigned(trace);
    continue;
  }
  const result = await replay(trace);
  judge(file, trace, result);
}

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nreplay: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nreplay: OK — recorded runs replay to where they ended');

// ------------------------------------------------------------------------------

/**
 * 7.5: the fix measured against real thumbs. Walks a retired touch trace's
 * touch-downs and assigns each one twice — by the midline split version 1
 * used, and by the zone table — and reports where they disagree. Not gated: a
 * difference here is the change working, and the owner's hand is the judge of
 * whether it is the right one.
 */
function reassigned(trace) {
  const { w, h } = trace.viewport;
  const run = (assign) => {
    const roles = new Map();
    const held = { stick: null, look: null };
    const counts = { stick: 0, look: 0, dropped: 0 };
    for (const e of trace.events) {
      if (e[0] !== 't' || e[3] !== 'w') continue;
      const [, , kind, , touches] = e;
      for (const [id, x, y] of touches) {
        if (kind === 's') {
          const role = assign(x, y, held);
          roles.set(id, role);
          if (role !== 'dropped') held[role] = id;
          counts[role]++;
        } else if (kind === 'e' || kind === 'c') {
          const role = roles.get(id);
          if (role && held[role] === id) held[role] = null;
        }
      }
    }
    return { roles, counts };
  };
  const v1 = run((x, y, held) =>
    x < w / 2 ? (held.stick === null ? 'stick' : 'dropped') : held.look === null ? 'look' : 'dropped'
  );
  const v2 = run((x, y, held) =>
    inStickZone(x, y, w, h) && held.stick === null ? 'stick' : held.look === null ? 'look' : 'dropped'
  );
  let changed = 0;
  const examples = [];
  for (const [id, before] of v1.roles) {
    const after = v2.roles.get(id);
    if (after !== before) {
      changed++;
      if (examples.length < 4) examples.push(`${before}→${after}`);
    }
  }
  const total = v1.roles.size;
  console.log(
    `          ${total} touch-downs on the view: v1 gave ${v1.counts.stick} stick, ${v1.counts.look} look, ` +
      `${v1.counts.dropped} dropped; the zone table gives ${v2.counts.stick} stick, ${v2.counts.look} look, ` +
      `${v2.counts.dropped} dropped — ${changed} assigned differently${examples.length ? ` (${examples.join(', ')}…)` : ''}`
  );
}

function judge(label, trace, result) {
  // The first checkpoint at which the two runs part, if they do.
  let parted = null;
  const theirs = new Map(trace.checkpoints.map((c) => [c[0], c]));
  for (const mine of result.checkpoints) {
    const ref = theirs.get(mine[0]);
    if (!ref) continue;
    if (
      ref[1] !== mine[1] ||
      ref[2] !== mine[2] ||
      Math.hypot(ref[3] - mine[3], ref[4] - mine[4]) > POSITION_TOLERANCE ||
      Math.abs(ref[5] - mine[5]) > YAW_TOLERANCE
    ) {
      parted = { ref, mine };
      break;
    }
  }
  expect(
    `${label}: every checkpoint agrees (${result.checkpoints.length})`,
    !parted,
    parted ? `parted at frame ${parted.ref[0]}: recorded ${JSON.stringify(parted.ref)}, replayed ${JSON.stringify(parted.mine)}` : ''
  );

  const a = trace.final;
  const b = result.final;
  const off = Math.hypot(a[3] - b[3], a[4] - b[4]);
  expect(
    `${label}: ends where it ended (${a[1]}, ${a[2]} cells, ${off.toFixed(3)} m apart)`,
    a[1] === b[1] && a[2] === b[2] && off <= POSITION_TOLERANCE && Math.abs(a[5] - b[5]) <= YAW_TOLERANCE,
    `recorded ${JSON.stringify(a)}, replayed ${JSON.stringify(b)}`
  );
}
