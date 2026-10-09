/**
 * The dead-end proof on two floors — phase 9, 9.4.1.
 *
 * The ship's proof (tools/deadend.mjs) is a grid over one deck. The house has
 * two floors and a ramp between them, so a square of the plan is no longer one
 * place: the hall floor, the stairs and the landing can all sit over the same
 * (x, z). The search is therefore over (square, floor height) pairs, and a
 * move is the move the player code makes:
 *
 *   1. Read the live collider set and the floor function out of the running
 *      house, as the ship's proof does, so a collider that exists only because
 *      of a bug still shows up.
 *   2. A node is a square and the height of the floor under it. Its
 *      neighbours are the four squares next door, each at the floor the player
 *      code would put the feet on: `floorAt(x, z, y)`, the highest floor no
 *      more than a step above the feet. A move counts only when the union of
 *      the two player boxes is clear at both heights.
 *   3. Flood fill from the spawn. Every node reached must be reachable back,
 *      which is checked by testing every edge for its reverse rather than
 *      argued. A drop is the one way a floor could strand someone: walk off
 *      the landing into the stairwell and you land on the stairs, but you
 *      cannot step back up three metres. That would be an edge with no
 *      reverse, and it fails here.
 *   4. The stairs are the only way between the floors: every edge that
 *      changes height by more than a step's worth lies on the stairs.
 *   5. Every space in the layout table is reached, on its own floor.
 *   6. Repeat at each gate state, and insist the reachable set only grows.
 *      In greybox (milestone 1) every opening is open and there is one state.
 *
 *   node tools/house/floors.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const URL_ = new URL('house/', BASE).href;

const STEP = 0.1;
/** A change of floor height bigger than this between squares is a climb or a fall. */
const LEVEL_CHANGE = 0.2;

const errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// The proof measures the game, never a cache of it.
await page.route('**/sw.js', (r) => r.abort());
await page.goto(URL_);
await page.waitForFunction(() => window.__house && window.__house.staticColliders, null, { timeout: 60000 });

const { layout, states } = await page.evaluate(async () => {
  const g = window.__house;
  const snap = () => {
    const colliders = [...g.staticColliders];
    for (const d of g.doors || []) colliders.push(...d.colliders());
    return { colliders };
  };
  // Milestone 1 has no doors and so one gate state. Later milestones open
  // each door in chain order and snapshot after each one.
  const states = [{ name: 'greybox, every opening open', ...snap() }];
  return {
    layout: { spawn: [g.player.position.x, g.player.position.y, g.player.position.z] },
    states,
  };
});

// The floor function and the tables are pure data, so the harness imports the
// same module the page runs rather than a copy of it.
const { floorAt, SPACES, STAIRS, PLAYER_RADIUS, PLAYER_HEIGHT } = await import(
  new URL('../../src/house/layout.js', import.meta.url).href
);
layout.spaces = SPACES;
layout.stairs = STAIRS;

const R = PLAYER_RADIUS;
const H = PLAYER_HEIGHT;
// The whole footprint and half a metre round it, so a hole in the outer wall
// would show up as places outside the house.
const x0 = Math.min(...SPACES.map((s) => s.x[0])) - 0.5;
const x1 = Math.max(...SPACES.map((s) => s.x[1])) + 0.5;
const z0 = Math.min(...SPACES.map((s) => s.z[0])) - 0.5;
const z1 = Math.max(...SPACES.map((s) => s.z[1])) + 0.5;
const NX = Math.round((x1 - x0) / STEP) + 1;
const NZ = Math.round((z1 - z0) / STEP) + 1;
const X = (i) => +(x0 + i * STEP).toFixed(3);
const Z = (j) => +(z0 + j * STEP).toFixed(3);
const key = (i, j, y) => `${i},${j},${y.toFixed(3)}`;

/** The player's box over [ax, bx] × [az, bz] at feet height y, against the colliders. */
function clear(colliders, ax, bx, az, bz, y) {
  for (const c of colliders) {
    if (c.minY >= y + H || c.maxY <= y + 0.05) continue;
    if (bx <= c.minX || ax >= c.maxX) continue;
    if (bz <= c.minZ || az >= c.maxZ) continue;
    return false;
  }
  return true;
}

const onStairs = (x, z) =>
  x >= layout.stairs.x[0] && x <= layout.stairs.x[1] && z >= layout.stairs.z[0] && z <= layout.stairs.z[1];

/** The edges out of a node, exactly as the movement code would take them. */
function edges(colliders, i, j, y) {
  const out = [];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
    const nx = X(ni);
    const nz = Z(nj);
    const ny = floorAt(nx, nz, y);
    if (ny === null) continue;
    const ax = Math.min(X(i), nx) - R;
    const bx = Math.max(X(i), nx) + R;
    const az = Math.min(Z(j), nz) - R;
    const bz = Math.max(Z(j), nz) + R;
    if (!clear(colliders, ax, bx, az, bz, y) || !clear(colliders, ax, bx, az, bz, ny)) continue;
    out.push([ni, nj, +ny.toFixed(3)]);
  }
  return out;
}

const failures = [];
const report = [];
let previous = null;

for (const state of states) {
  const { colliders } = state;
  const si = Math.round((layout.spawn[0] - x0) / STEP);
  const sj = Math.round((layout.spawn[2] - z0) / STEP);
  const sy = floorAt(X(si), Z(sj), layout.spawn[1]);
  const start = key(si, sj, sy);
  const seen = new Map([[start, [si, sj, sy]]]);
  const queue = [[si, sj, sy]];
  const oneWay = [];
  const between = [];
  while (queue.length) {
    const [i, j, y] = queue.shift();
    for (const [ni, nj, ny] of edges(colliders, i, j, y)) {
      // Every edge must have its reverse, or the place it leads to is a place
      // you cannot walk back from.
      const back = edges(colliders, ni, nj, ny).some(([bi, bj, by]) => bi === i && bj === j && Math.abs(by - y) < 1e-6);
      if (!back) oneWay.push({ from: [X(i), y, Z(j)], to: [X(ni), ny, Z(nj)] });
      if (Math.abs(ny - y) > LEVEL_CHANGE && !(onStairs(X(i), Z(j)) || onStairs(X(ni), Z(nj)))) {
        between.push({ from: [X(i), y, Z(j)], to: [X(ni), ny, Z(nj)] });
      }
      const k = key(ni, nj, ny);
      if (!seen.has(k)) {
        seen.set(k, [ni, nj, ny]);
        queue.push([ni, nj, ny]);
      }
    }
  }

  // Which floor each reached node is on, and which spaces it reaches.
  const upper = Math.max(...layout.spaces.map((s) => s.y));
  let ground = 0;
  let up = 0;
  let stairs = 0;
  const reached = new Set();
  for (const [i, j, y] of seen.values()) {
    const x = X(i);
    const z = Z(j);
    if (Math.abs(y - upper) < 1e-6) up++;
    else if (Math.abs(y) < 1e-6) ground++;
    else stairs++;
    for (const s of layout.spaces) {
      if (Math.abs(s.y - y) < 1e-6 && x > s.x[0] && x < s.x[1] && z > s.z[0] && z < s.z[1]) reached.add(s.id);
    }
  }
  const missing = layout.spaces.filter((s) => !reached.has(s.id)).map((s) => s.id);

  report.push(
    `  ${state.name}: ${seen.size} places — ${ground} ground, ${stairs} on the stairs, ${up} upper; ` +
      `${reached.size}/${layout.spaces.length} spaces`
  );
  if (oneWay.length) {
    const e = oneWay[0];
    failures.push(
      `${state.name}: ${oneWay.length} one-way moves, e.g. (${e.from.join(', ')}) → (${e.to.join(', ')}) cannot be walked back`
    );
  }
  if (between.length) {
    const e = between[0];
    failures.push(
      `${state.name}: ${between.length} moves between floors off the stairs, e.g. (${e.from.join(', ')}) → (${e.to.join(', ')})`
    );
  }
  if (missing.length) failures.push(`${state.name}: spaces never reached on their own floor: ${missing.join(', ')}`);
  if (!up) failures.push(`${state.name}: the upper floor is never reached`);

  if (previous) {
    let lost = 0;
    for (const k of previous) if (!seen.has(k)) lost++;
    if (lost) failures.push(`${state.name}: ${lost} places reachable before are not reachable now`);
  }
  previous = new Set(seen.keys());
}

await browser.close();

console.log('Two floors:');
for (const line of report) console.log(line);
if (errors.length) failures.push(...errors.map((e) => `page: ${e}`));
if (failures.length) {
  console.log('\nFAIL');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n  ✓ every place on both floors can be walked back from');
console.log('  ✓ the stairs are the only way between the floors');
console.log('  ✓ every space is reached on its own floor');
