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
