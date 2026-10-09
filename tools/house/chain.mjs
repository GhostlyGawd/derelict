/**
 * The house's loop, in order — phase 9, 9.6 "the loop is ordered".
 *
 * The ship's chain harness (tools/chain.mjs) drives each interaction directly
 * and asserts the machinery refuses until its predecessor is done. The house
 * has two kinds of refusal, and this checks both, from LOOP in layout.js:
 *
 *   - A lock refuses without its keys. Every locked door is pressed with
 *     whatever is on the ring, and must stay shut until the ring holds all of
 *     what it asks for.
 *   - A drawer or a clock refuses by being out of reach. Before each step,
 *     every later step's thing is either out of reach of anywhere the player
 *     can stand (tools/house/lib/grid.mjs), or refuses when pressed.
 *
 * Then each step is taken through the same press the player makes, and must
 * work. At the end the player is walked out of the front door on the real
 * input layer, and the run must end. Every note must be reachable by then,
 * and the one that gives the clock's hour must be reachable before the clock.
 *
 *   node tools/house/chain.mjs [baseUrl]
 */
import { LOOP, openFreeDoors, openHouse, reachable, takeStep } from './lib/grid.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const driver = await openHouse(BASE);
const failures = [];
const lines = [];
const ok = (name, pass, detail = '') => {
  lines.push(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || !detail ? '' : ` — ${detail}`}`);
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

// No barrier can be walked through. The reach model above is about where the
// player can stand; this is about how the real movement code gets there. Each
// thing that bars the way while it is shut — every locked or latched door —
// is walked at from its near side, in a fresh run, with seeded random keys,
// turns and long phone frames, and the player must never end up on the far
// side. The owner got past the old stair gate this way (9.4.1 build notes). To show the
// check can fail, it is run once more with the house's fix for that turned off,
// and must then catch an escape.
{
  const fuzz = (touch) =>
    driver.page.evaluate(
      async ({ touch }) => {
        const g = window.__house;
        g.player.touch = touch;
        let seed = 9001;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC'];
        const up = () => keys.forEach((k) => window.dispatchEvent(new KeyboardEvent('keyup', { code: k })));
        // Each barrier: where to start, which way is "at it", and what counts as through.
        // The stair door is climbed to first: it waits at the head of the stairs.
        const barriers = [
          { id: 'stair-door', start: () => [1.1 + rnd() * 0.7, 0, 4.85], yaw: 0, climb: 120, through: (p) => p.y > 2.99 && p.z < 0.2 },
          { id: 'dining-door', start: () => [-0.8 - rnd() * 0.6, 0, -2.5 + (rnd() - 0.5) * 0.8], yaw: Math.PI / 2, climb: 0, through: (p) => p.x < -2.0 },
          { id: 'study-door', start: () => [4 + (rnd() - 0.5) * 0.8, 0, -0.2 - rnd() * 0.6], yaw: Math.PI, climb: 0, through: (p) => p.z > 1.0 },
          { id: 'front-door', start: () => [(rnd() - 0.5) * 0.8, 0, 4.0 + rnd() * 0.4], yaw: Math.PI, climb: 0, through: (p) => p.z > 5.0 },
        ];
        const out = {};
        for (const b of barriers) {
          let escapes = 0;
          for (let trial = 0; trial < 120; trial++) {
            const [x, y, z] = b.start();
            g.player.position.set(x, y, z);
            g.player.velocity.set(0, 0, 0);
            g.player.yaw = b.yaw + (rnd() - 0.5) * 0.6;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
            for (let i = 0; i < b.climb; i++) g.stepForTest(0.03, { render: false });
            for (let i = 0; i < 300; i++) {
              if (rnd() < 0.1) window.dispatchEvent(new KeyboardEvent(rnd() < 0.6 ? 'keydown' : 'keyup', { code: keys[(rnd() * keys.length) | 0] }));
              if (rnd() < 0.2) g.player.yaw += (rnd() - 0.5) * 1.2;
              g.stepForTest(rnd() < 0.3 ? 0.05 : 1 / 60, { render: false });
              if (b.through(g.player.position)) {
                escapes++;
                break;
              }
            }
            up();
          }
          out[b.id] = escapes;
        }
        g.player.touch = 1e-6;
        return out;
      },
      { touch }
    );
  // A fresh house, with everything shut.
  await driver.page.reload();
  await driver.page.waitForFunction(() => window.__house?.phase === 'title');
  await driver.page.evaluate(() => {
    const g = window.__house;
    g.canvas.requestPointerLock = () => Promise.resolve();
    g.manualClockOnStart = true;
    document.getElementById('start').click();
  });
  await driver.page.waitForFunction(() => window.__house.phase === 'playing');
  await driver.page.evaluate(() => (window.__house.input.locked = true));
  const held = await fuzz(1e-6);
  for (const [id, n] of Object.entries(held)) ok(`${id} cannot be walked through (120 hostile tries)`, n === 0, `${n} got through`);
  const broken = await fuzz(0);
  ok('the barrier check can fail: with the fix off, something gets through', Object.values(broken).some((n) => n > 0), JSON.stringify(broken));
}

// Back to a fresh run for the loop itself.
await driver.page.reload();
await driver.page.waitForFunction(() => window.__house?.phase === 'title');
await driver.page.evaluate(() => {
  const g = window.__house;
  g.manualClockOnStart = true;
  document.getElementById('start').click();
});
await driver.page.waitForFunction(() => window.__house.phase === 'playing');

const thingOf = (row) => row.container ?? row.door ?? 'clock';
const notesSeen = new Set();
let hourNoteBeforeClock = false;

for (let k = 0; k < LOOP.length; k++) {
  const { snap, seen } = await openFreeDoors(driver);
  const at = (id) => snap.targets.find((t) => t.id === id);
  const can = (id) => reachable(seen, snap.colliders, at(id).point);
  for (const n of snap.targets.filter((t) => t.kind === 'note')) if (can(n.id)) notesSeen.add(n.id);
  if (LOOP[k].clock) hourNoteBeforeClock = notesSeen.has('hour');

  // Every later step that still needs something refuses: out of reach, or
  // pressed and nothing happens. A later step whose needs are all met may
  // work — that is the fork upstairs — and is taken in table order instead.
  const done = new Set(LOOP.slice(0, k).map((r) => r.id));
  for (let j = k + 1; j < LOOP.length; j++) {
    const row = LOOP[j];
    if (row.needs.every((n) => done.has(n))) continue;
    const id = thingOf(row);
    if (!can(id)) {
      ok(`before "${LOOP[k].step}": "${row.step}" is out of reach`, true);
      continue;
    }
    const before = JSON.stringify((await driver.snapshot()).state.progress);
    const after = await takeStep(driver, row);
    const moved = JSON.stringify(after.progress) !== before;
    ok(`before "${LOOP[k].step}": "${row.step}" is in reach and refuses`, !moved, `it worked: ${JSON.stringify(after.progress)}`);
  }

  // This step is in reach, and works.
  const id = thingOf(LOOP[k]);
  ok(`"${LOOP[k].step}" is in reach once ${LOOP[k].needs.length ? LOOP[k].needs.join(' and ') : 'the run starts'}`, can(id));
  const state = await takeStep(driver, LOOP[k]);
  await driver.settle();
  ok(
    `"${LOOP[k].step}" works`,
    state.progress.slice(0, k + 1).every(Boolean) && state.progress.slice(k + 1).every((d) => !d),
    `progress ${JSON.stringify(state.progress)}, ring ${JSON.stringify(state.ring)}`
  );
}

// The ring never needed more than its size, and is empty at the end: every key was used at its door.
const end = (await driver.snapshot()).state;
ok('every key was used at its door', end.ring.length === 0, `left on the ring: ${end.ring.join(', ')}`);

{
  const { snap, seen } = await openFreeDoors(driver);
  for (const n of snap.targets.filter((t) => t.kind === 'note')) if (reachable(seen, snap.colliders, n.point)) notesSeen.add(n.id);
  const notes = snap.targets.filter((t) => t.kind === 'note').map((t) => t.id);
  const unread = notes.filter((n) => !notesSeen.has(n));
  ok(`every note can be reached (${notes.length})`, unread.length === 0, `never in reach: ${unread.join(', ')}`);
  ok('the note with the hour is in reach before the clock is', hourNoteBeforeClock);
}

// Out of the front door, on foot, through the real input layer.
const out = await driver.page.evaluate(() => {
  const g = window.__house;
  g.player.position.set(0, 0, 4.4);
  g.player.velocity.set(0, 0, 0);
  g.player.yaw = Math.PI;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
  for (let i = 0; i < 240 && g.phase === 'playing'; i++) g.stepForTest(1 / 60, { render: false });
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
  return { phase: g.phase, z: g.player.position.z };
});
ok('the front door lets the player out, and the run ends', out.phase === 'ended', `phase ${out.phase} at z ${out.z.toFixed(2)}`);

failures.push(...driver.errors.map((e) => `page: ${e}`));
await driver.close();
console.log('The house, in order:');
for (const l of lines) console.log(l);
if (failures.length) {
  console.log(`\nhouse chain: ${failures.length} failed`);
  process.exit(1);
}
console.log('\nhouse chain: OK — no step works before the one above it, and the house can be left');
