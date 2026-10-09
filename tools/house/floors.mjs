/**
 * The dead-end proof on two floors — phase 9, 9.4.1.
 *
 * The ship's proof (tools/deadend.mjs) is a grid over one deck. The house has
 * two floors and a ramp between them, so a square of the plan is no longer one
 * place: the hall floor, the stairs and the landing can all sit over the same
 * (x, z). The search is over (square, floor height) pairs, with the move the
 * player code makes (tools/house/lib/grid.mjs):
 *
 *   1. Every move has its reverse. A drop is the one way a floor could strand
 *      someone: walk off the landing into the stairwell and you land on the
 *      stairs, and you cannot step back up three metres. That is an edge with
 *      no reverse, and it fails here.
 *   2. The stairs are the only way between the floors: every move that
 *      changes height by more than a step's worth lies on the stairs.
 *   3. At every state of the loop, and the reachable set only grows. A state
 *      is judged with every door that needs nothing opened wherever the
 *      player can get to it, because the player can. A door's open leaf is a
 *      collider, so a leaf that swings across a way through fails here.
 *   4. At the end, every space is reached on its own floor.
 *
 *   node tools/house/floors.mjs [baseUrl]
 */
import { LOOP, X, Z, edges, fill, onStairs, openFreeDoors, openHouse, takeStep } from './lib/grid.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const { SPACES } = await import(new URL('../../src/house/layout.js', import.meta.url).href);
/** A change of floor height bigger than this between squares is a climb or a fall. */
const LEVEL_CHANGE = 0.2;

const driver = await openHouse(BASE);
const failures = [];
const report = [];
let previous = null;
let last = null;

const judge = (name, colliders, seen) => {
  const oneWay = [];
  const between = [];
  for (const [i, j, y] of seen.values()) {
    for (const [ni, nj, ny] of edges(colliders, i, j, y)) {
      const back = edges(colliders, ni, nj, ny).some(([bi, bj, by]) => bi === i && bj === j && Math.abs(by - y) < 1e-6);
      if (!back) oneWay.push({ from: [X(i), y, Z(j)], to: [X(ni), ny, Z(nj)] });
      if (Math.abs(ny - y) > LEVEL_CHANGE && !(onStairs(X(i), Z(j)) || onStairs(X(ni), Z(nj)))) {
        between.push({ from: [X(i), y, Z(j)], to: [X(ni), ny, Z(nj)] });
      }
    }
  }
  const reached = new Set();
  let up = 0;
  let stairs = 0;
  for (const [i, j, y] of seen.values()) {
    if (y > 2.99) up++;
    else if (y > 0.001) stairs++;
    for (const s of SPACES) {
      if (Math.abs(s.y - y) < 1e-6 && X(i) > s.x[0] && X(i) < s.x[1] && Z(j) > s.z[0] && Z(j) < s.z[1]) reached.add(s.id);
    }
  }
  report.push(
    `  ${name.padEnd(26)} ${String(seen.size).padStart(6)} places (${up} upper, ${stairs} stairs) — ` +
      `${[...reached].join(', ')}`
  );
  if (oneWay.length) {
    const e = oneWay[0];
    failures.push(`${name}: ${oneWay.length} one-way moves, e.g. (${e.from.join(', ')}) → (${e.to.join(', ')}) cannot be walked back`);
  }
  if (between.length) {
    const e = between[0];
    failures.push(`${name}: ${between.length} moves between floors off the stairs, e.g. (${e.from.join(', ')}) → (${e.to.join(', ')})`);
  }
  if (previous) {
    let lost = 0;
    let example = null;
    for (const [k, n] of previous) {
      if (!seen.has(k)) {
        lost++;
        example ??= n;
      }
    }
    if (lost) failures.push(`${name}: ${lost} places reachable before are not now, e.g. (${X(example[0])}, ${example[2]}, ${Z(example[1])})`);
  }
  previous = seen;
  last = reached;
};

let { snap, seen } = await openFreeDoors(driver);
judge('the start', snap.colliders, seen);
for (const row of LOOP) {
  await takeStep(driver, row);
  await driver.settle();
  ({ snap, seen } = await openFreeDoors(driver));
  judge(`after: ${row.step}`, snap.colliders, seen);
}
const missing = SPACES.filter((s) => !last.has(s.id)).map((s) => s.id);
if (missing.length) failures.push(`at the end, spaces never reached on their own floor: ${missing.join(', ')}`);
failures.push(...driver.errors.map((e) => `page: ${e}`));
await driver.close();

console.log('Two floors, at every step of the loop:');
for (const line of report) console.log(line);
if (failures.length) {
  console.log('\nFAIL');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n  ✓ every place on both floors can be walked back from, at every step');
console.log('  ✓ the stairs are the only way between the floors');
console.log('  ✓ the reachable set only grows, and every space is reached by the end');
