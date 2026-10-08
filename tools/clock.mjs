/**
 * The clock gate — phase 6, spec 6.5.
 *
 * 6.3.2 gives four moving things a sound each, and one rule: the sound is
 * played by the same clock as the motion. A vent that breathes on one timer
 * while its sound breathes on another passes every other check in this
 * project — the sound is generated, consumed, panned and in the right room —
 * and is still wrong in a way only a person notices, after it has shipped.
 *
 * So this records both sides, frame by frame, and pairs them:
 *
 *   - what is *seen*, read off the scene after the idle-life pass has run: the
 *     fan hub's angle, the vent's breath, the spark's burst, the failing lamp's
 *     brownouts;
 *   - what is *heard*, read off the mixer's own entry points: every one-shot
 *     the game starts, with any scheduling delay folded in, and every change
 *     of level on the lamp's buzz.
 *
 * Every visible event needs a sound within a frame of it, and every sound needs
 * a visible event within a frame of it. A sound that is right on average and
 * wrong on any one event fails, because that is what a separate timer is.
 *
 * It never reads the code that does the wiring. It watches the scene and the
 * bus, the same two things a player has.
 *
 *   node tools/clock.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

/** Frames recorded. At the game's clamped dt that is a little over a minute of game time. */
const FRAMES = 1400;
/** How many of each event must be seen for the comparison to say anything. */
const MIN_EVENTS = { fan: 40, vent: 4, spark: 4, lamp: 4 };
/** Tolerance, in frames, either side. */
const SLACK = 1;

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
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

console.log(`clock: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });

// Stand in Corridor B, between the sparks and the failing lamp, facing the
// Annex. Where the player is changes how loud these are and nothing about
// when — which is the whole of what this measures — but standing somewhere
// real keeps it honest.
await page.evaluate(() => {
  const g = window.__derelict;
  g.player.position.set(14, 0, -0.6);
  g.player.yaw = -Math.PI / 2;
});

const record = await page.evaluate(async (frames) => {
  const g = window.__derelict;
  const m = g.mechanism;
  const bus = g.audio;
  const log = { seen: [], heard: [], frames: 0 };
  let frame = 0;
  const rate = () => 1 / 60;

  // ---- Heard: every one-shot the game starts, and every buzz level --------
  const IDS = { fan_pass: 'fan', vent_breath: 'vent', spark_crackle: 'spark' };
  for (const name of ['play', 'playAt']) {
    const original = bus[name].bind(bus);
    bus[name] = (id, ...rest) => {
      const source = original(id, ...rest);
      if (source && IDS[id]) {
        const opts = (name === 'playAt' ? rest[1] : rest[0]) || {};
        // A delay is a sound on a later clock, counted in frames at 60 Hz.
        const late = Math.round((opts.delay || 0) / rate());
        log.heard.push({ kind: IDS[id], frame: frame + late });
      }
      return source;
    };
  }
  if (typeof bus.loop === 'function') {
    const original = bus.loop.bind(bus);
    bus.loop = (id, ...rest) => {
      const handle = original(id, ...rest);
      if (handle && id === 'lamp_buzz') {
        const set = handle.setLevel.bind(handle);
        let last = null;
        handle.setLevel = (level, ...more) => {
          const on = level > 0.05;
          if (on !== last) log.heard.push({ kind: 'lamp', frame, on });
          last = on;
          return set(level, ...more);
        };
      }
      return handle;
    };
  }
  // The handles may already exist from #start; ask the mechanism to rebuild
  // its voices so the wrapped entry point is the one they come through.
  m.resetAudio?.();

  // ---- Seen: read the scene after the idle-life pass ----------------------
  const update = m.update.bind(m);
  const parts = m.parts;
  // `null` until the first frame has been read, so that whatever state the
  // recording happens to start in is a starting state rather than an event.
  let lastSector = null;
  let lastPuff = null;
  let lastBurst = null;
  let lastLampOn = null;
  m.update = (dt, camera) => {
    const lamp = parts.failingLamp;
    const before = lamp ? lamp.intensity : 0;
    update(dt, camera);
    const after = lamp ? lamp.intensity : 0;

    const sector = Math.floor(parts.fanHub.rotation.y / ((Math.PI * 2) / parts.fanBlades));
    if (lastSector !== null && sector !== lastSector) log.seen.push({ kind: 'fan', frame });
    lastSector = sector;

    const puff = parts.ventPuff.material.opacity;
    if (lastPuff !== null && puff > 0 && lastPuff === 0) log.seen.push({ kind: 'vent', frame });
    lastPuff = puff;

    const burst = parts.spark.material.userData.burst || 0;
    if (lastBurst !== null && burst > lastBurst + 1e-6) log.seen.push({ kind: 'spark', frame });
    lastBurst = burst;

    if (lamp && before > 0) {
      const on = after / before > 0.2;
      if (on !== lastLampOn) log.seen.push({ kind: 'lamp', frame, on });
      lastLampOn = on;
    }
    frame++;
  };

  await new Promise((resolve) => {
    const wait = () => (frame >= frames ? resolve() : setTimeout(wait, 50));
    wait();
  });
  m.update = update;
  log.frames = frame;
  return log;
}, FRAMES);

console.log(`  ${record.frames} frames recorded`);

/**
 * Pairs each event on one side with one on the other, nearest first. `on`
 * matters for the lamp: a brownout must be met by the buzz dropping, and a
 * recovery by it coming back — not merely by some change of level.
 */
function unmatched(from, to) {
  const used = new Set();
  const misses = [];
  for (const a of from) {
    let best = -1;
    for (let i = 0; i < to.length; i++) {
      if (used.has(i)) continue;
      const b = to[i];
      if (a.on !== undefined && a.on !== b.on) continue;
      if (Math.abs(a.frame - b.frame) <= SLACK && (best < 0 || Math.abs(to[best].frame - a.frame) > Math.abs(b.frame - a.frame))) {
        best = i;
      }
    }
    if (best < 0) misses.push(a.frame);
    else used.add(best);
  }
  return misses;
}

for (const kind of ['fan', 'vent', 'spark', 'lamp']) {
  const seen = record.seen.filter((e) => e.kind === kind);
  const heard = record.heard.filter((e) => e.kind === kind);
  // The first lamp level is the voice coming up, not a brownout; the first
  // lamp reading is the state it starts in. Neither is an event.
  const s = kind === 'lamp' ? seen.slice(1) : seen;
  const h = kind === 'lamp' ? heard.slice(1) : heard;

  expect(
    `${kind.padEnd(5)} moves (${s.length} visible events)`,
    s.length >= MIN_EVENTS[kind],
    `only ${s.length} in ${record.frames} frames — too few to say anything about a clock`
  );
  const silent = unmatched(s, h);
  expect(
    `${kind.padEnd(5)} every visible event is heard within ${SLACK} frame`,
    silent.length === 0,
    `${silent.length} of ${s.length} unheard (frames ${silent.slice(0, 6).join(', ')}${silent.length > 6 ? '…' : ''})`
  );
  const orphan = unmatched(h, s);
  expect(
    `${kind.padEnd(5)} every sound has a visible event within ${SLACK} frame`,
    orphan.length === 0 && h.length > 0,
    h.length === 0
      ? 'no sound at all'
      : `${orphan.length} of ${h.length} sounds with nothing to see (frames ${orphan.slice(0, 6).join(', ')})`
  );
}

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nclock: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nclock: OK — every idle sound runs on its motion\'s clock');
