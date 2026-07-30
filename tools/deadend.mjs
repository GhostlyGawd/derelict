/**
 * Adversarial dead-end search — the harness behind P6's "no unwinnable states".
 *
 * The claim it has to establish is stronger than "the intended route works":
 * a cell can be set down on any floor the player can stand on, so the level
 * has to guarantee that *every* such position can be walked back from. That is
 * a statement about the whole floor, not about a route, and no amount of
 * playing the game proves it.
 *
 * So this reads the real collider set out of the running game and reasons over
 * it directly:
 *
 *   1. Grid the level at 10 cm. A square is free when the player's collision
 *      box, centred there, overlaps nothing — the same box and the same test
 *      the movement code uses.
 *   2. Flood fill from the spawn. A step between neighbouring squares counts
 *      only if the *union* of the two player boxes is free, which is stricter
 *      than testing the endpoints and so can only under-report reachability.
 *   3. That step relation is symmetric, so the filled component is a set of
 *      mutually reachable squares. Anywhere you can put a cell down, you can
 *      come back for it — provided nothing about the fill is asymmetric, which
 *      is checked rather than assumed by filling again from a socket and
 *      insisting the two components are identical.
 *   4. Repeat at each gate state, and insist the reachable set only ever grows.
 *      A door that closed would be the one way this level could trap someone.
 *
 * PHASE 4 — two stances. The player is no longer one box, so the search is no
 * longer over squares. It is over (square, stance) pairs:
 *
 *   - Each state gets two free grids, one per stance. Crouching only ever
 *     removes colliders from consideration, so the crouched grid is a superset
 *     of the standing one — asserted, not assumed, because the entire squeeze
 *     depends on it.
 *   - Moves stay within a stance. A stance change is an edge in place: ducking
 *     is always available, standing up only where the standing box fits. That
 *     is exactly the rule `Player.#canStand` enforces, and it is what stops
 *     crouch being able to strand anyone.
 *   - Both edge kinds are symmetric, so the component is still mutually
 *     reachable and the "set a cell down anywhere" guarantee survives the
 *     second stance. The backwards fill still checks that rather than trusting
 *     the argument.
 *
 *   node tools/deadend.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

const STEP = 0.1;
/** How close a square has to be to a fixture to count as "you can use it". */
const REACH = 1.6;

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
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

/**
 * The live collider set, exactly as the movement code sees it: the static ones
 * plus whatever each door currently contributes. Reading it rather than
 * rebuilding it from the layout tables is the point — a collider that exists
 * only because of a bug still shows up here.
 */
const snapshot = () =>
  page.evaluate(() => {
    const g = window.__derelict;
    const colliders = [...g.staticColliders];
    for (const d of g.doors) colliders.push(...d.colliders());
    return {
      colliders,
      spawn: [g.player.position.x, g.player.position.z],
      fixtures: [
        ...g.switches.map((s) => ({ id: s.id, at: [s.point.x, s.point.z] })),
        ...g.carryables.cradles.map((c) => ({ id: c.id, at: [c.mount.x, c.mount.z] })),
        ...g.carryables.sockets.map((s) => ({ id: s.id, at: [s.point.x, s.point.z] })),
      ],
      cellColliders: g.carryables.colliders.length,
      spaces: g.spaces.map((s) => ({ id: s.id, x: s.x, z: s.z })),
      metrics: g.metrics,
    };
  });

const act = (kind, id) =>
  page.evaluate(
    ([k, target]) => {
      const g = window.__derelict;
      const found = {
        switch: () => g.switches.find((s) => s.id === target),
        cell: () => g.carryables.cells.find((c) => c.id === target),
        socket: () => g.carryables.sockets.find((s) => s.id === target),
      }[k]();
      if (!found) throw new Error(`no ${k} named ${target}`);
      g.pressInteractForTest(found);
    },
    [kind, id]
  );

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

// ---------------------------------------------------------------- geometry --

/** Stance indices. 0 is standing throughout, so the spawn stance is 0. */
const STAND = 0;
const CROUCH = 1;

/** Builds the walkable grids and the reachable component for one gate state. */
function analyse(name, { colliders, spawn, spaces, metrics }) {
  const RADIUS = metrics.radius;
  // Tallest first, so index 0 is standing.
  const HEIGHTS = [metrics.standing, metrics.crouched];

  // The grid spans the collider bounding box, which includes the void outside
  // the hull. Only floor inside a room counts — otherwise "unreachable free
  // space" would mostly mean "space".
  const inside = (x, z) =>
    spaces.some((s) => x >= s.x[0] && x <= s.x[1] && z >= s.z[0] && z <= s.z[1]);

  // Anything the *taller* box could hit is worth bucketing; the per-stance
  // height test then happens inside boxFree, so one bucket map serves both.
  const active = colliders.filter((c) => c.minY < HEIGHTS[STAND] && c.maxY > 0.05);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of active) {
    minX = Math.min(minX, c.minX);
    maxX = Math.max(maxX, c.maxX);
    minZ = Math.min(minZ, c.minZ);
    maxZ = Math.max(maxZ, c.maxZ);
  }

  const originX = minX - STEP;
  const originZ = minZ - STEP;
  const cols = Math.ceil((maxX - originX) / STEP) + 2;
  const rows = Math.ceil((maxZ - originZ) / STEP) + 2;

  const xOf = (i) => originX + i * STEP;
  const zOf = (j) => originZ + j * STEP;

  // Bucket colliders by grid column so the free test is not O(colliders) for
  // every one of ~150k squares.
  const buckets = new Map();
  for (const c of active) {
    const from = Math.max(0, Math.floor((c.minX - RADIUS - originX) / STEP) - 1);
    const to = Math.min(cols - 1, Math.ceil((c.maxX + RADIUS - originX) / STEP) + 1);
    for (let i = from; i <= to; i++) {
      if (!buckets.has(i)) buckets.set(i, []);
      buckets.get(i).push(c);
    }
  }

  /**
   * True when a player-shaped box spanning this rectangle hits nothing, for a
   * given stance height. `minY >= height` is the same skip the movement code
   * applies, which is what makes a slab hung at 1.2 m invisible to a crouched
   * player and solid to a standing one.
   */
  const boxFree = (i, bMinX, bMaxX, bMinZ, bMaxZ, height) => {
    const near = buckets.get(i);
    if (!near) return true;
    for (const c of near) {
      if (c.minY >= height) continue;
      if (bMaxX <= c.minX || bMinX >= c.maxX) continue;
      if (bMaxZ <= c.minZ || bMinZ >= c.maxZ) continue;
      return false;
    }
    return true;
  };

  const cells = cols * rows;
  const free = [new Uint8Array(cells), new Uint8Array(cells)];
  for (let i = 0; i < cols; i++) {
    const x = xOf(i);
    for (let j = 0; j < rows; j++) {
      const z = zOf(j);
      if (!inside(x, z)) continue;
      for (let s = 0; s < HEIGHTS.length; s++) {
        if (boxFree(i, x - RADIUS, x + RADIUS, z - RADIUS, z + RADIUS, HEIGHTS[s])) {
          free[s][i * rows + j] = 1;
        }
      }
    }
  }

  /**
   * A move is allowed only if the swept box clears too. Conservative on
   * purpose: this can refuse a step the player could actually take, but it can
   * never invent one they could not.
   */
  const canStep = (i, j, di, dj, s) => {
    const x = xOf(i);
    const z = zOf(j);
    const nx = xOf(i + di);
    const nz = zOf(j + dj);
    // Bucket i already carries every collider reaching within RADIUS + STEP of
    // this column, which is exactly the span a one-step swept box covers, so
    // the neighbouring bucket does not need consulting.
    return boxFree(
      i,
      Math.min(x, nx) - RADIUS,
      Math.max(x, nx) + RADIUS,
      Math.min(z, nz) - RADIUS,
      Math.max(z, nz) + RADIUS,
      HEIGHTS[s]
    );
  };

  const indexOf = (x, z) => {
    const i = Math.round((x - originX) / STEP);
    const j = Math.round((z - originZ) / STEP);
    return i >= 0 && i < cols && j >= 0 && j < rows ? i * rows + j : -1;
  };

  /**
   * Breadth-first fill over (square, stance) pairs, 4-connected within a stance
   * plus a stance-change edge in place.
   *
   * `stances` restricts which stances may be used at all — passing a single one
   * models a player who never touches the crouch key, which is how the "the
   * Annex is unreachable standing" claim gets decided.
   */
  function fill(startX, startZ, { from = STAND, stances = [STAND, CROUCH] } = {}) {
    const seen = [new Uint8Array(cells), new Uint8Array(cells)];
    const allowed = new Set(stances);
    const start = indexOf(startX, startZ);
    if (start < 0 || !allowed.has(from) || !free[from][start]) {
      return { seen, count: 0, squares: 0, seeded: false };
    }

    const queue = [from * cells + start];
    seen[from][start] = 1;
    let count = 1;
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      const s = node >= cells ? CROUCH : STAND;
      const at = node - s * cells;
      const i = Math.floor(at / rows);
      const j = at % rows;

      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || ni >= cols || nj < 0 || nj >= rows) continue;
        const next = ni * rows + nj;
        if (seen[s][next] || !free[s][next]) continue;
        if (!canStep(i, j, di, dj, s)) continue;
        seen[s][next] = 1;
        count++;
        queue.push(s * cells + next);
      }

      // Change stance without moving. Ducking needs no room it does not already
      // have; standing up needs the taller box to fit, which is the same
      // condition the game checks before letting go of crouch.
      const other = s === STAND ? CROUCH : STAND;
      if (allowed.has(other) && !seen[other][at] && free[other][at]) {
        seen[other][at] = 1;
        count++;
        queue.push(other * cells + at);
      }
    }

    let squares = 0;
    for (let k = 0; k < cells; k++) if (seen[STAND][k] || seen[CROUCH][k]) squares++;
    return { seen, count, squares, seeded: true };
  }

  /** The nearest square of `reached` to a point, or null if there is none. */
  const standNear = (reached, [x, z]) => {
    const span = Math.ceil(REACH / STEP);
    const ci = Math.round((x - originX) / STEP);
    const cj = Math.round((z - originZ) / STEP);
    let best = null;
    for (let i = Math.max(0, ci - span); i <= Math.min(cols - 1, ci + span); i++) {
      for (let j = Math.max(0, cj - span); j <= Math.min(rows - 1, cj + span); j++) {
        if (!reached[i * rows + j]) continue;
        const d = Math.hypot(xOf(i) - x, zOf(j) - z);
        if (d <= REACH && (best === null || d < best.d)) best = { d, x: xOf(i), z: zOf(j) };
      }
    }
    return best;
  };

  const from = fill(spawn[0], spawn[1]);
  /** The same walk by a player who never presses crouch. */
  const uprightOnly = fill(spawn[0], spawn[1], { stances: [STAND] });

  // Squares occupiable in *some* stance, and squares reached in some stance.
  const reachedAny = new Uint8Array(cells);
  let crouchOnly = 0;
  for (let k = 0; k < cells; k++) {
    if (from.seen[STAND][k] || from.seen[CROUCH][k]) {
      reachedAny[k] = 1;
      if (!uprightOnly.seen[STAND][k]) crouchOnly++;
    }
  }

  // Crouching can only ever remove colliders from consideration, so every
  // square the standing box fits in must also take the crouched one. If this
  // ever fails the height filter is wrong and every conclusion below is void.
  let containment = 0;
  for (let k = 0; k < cells; k++) if (free[STAND][k] && !free[CROUCH][k]) containment++;

  /** Every reachable square as world coordinates, for cross-state comparison. */
  function* reachedPoints() {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (reachedAny[i * rows + j]) yield [xOf(i), zOf(j)];
      }
    }
  }

  /**
   * Every square the player could occupy in either stance, reachable or not.
   * The crouched grid is the superset, so it is the honest definition of floor.
   */
  function* freePoints() {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (free[CROUCH][i * rows + j]) yield [xOf(i), zOf(j)];
      }
    }
  }

  /** Whether a world point falls on a reachable square in this state. */
  const isReached = (x, z) => {
    const k = indexOf(x, z);
    return k >= 0 && Boolean(reachedAny[k]);
  };

  /** Whether a world point is reachable *without ever crouching*. */
  const isReachedUpright = (x, z) => {
    const k = indexOf(x, z);
    return k >= 0 && Boolean(uprightOnly.seen[STAND][k]);
  };

  /** Every square a player who never crouches can stand on. */
  function* uprightPoints() {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (uprightOnly.seen[STAND][i * rows + j]) yield [xOf(i), zOf(j)];
      }
    }
  }

  const squares = from.squares;
  console.log(
    `  ${name.padEnd(22)} ${squares.toLocaleString().padStart(7)} reachable squares ` +
      `(${(squares * STEP * STEP).toFixed(0)} m²), ` +
      `${(crouchOnly * STEP * STEP).toFixed(1)} m² of it crouch-only`
  );
  return {
    name,
    free,
    reached: from.seen,
    reachedAny,
    reachedStanding: from.seen[STAND],
    containment,
    crouchOnly,
    count: from.count,
    squares,
    seeded: from.seeded,
    fill,
    standNear,
    reachedPoints,
    freePoints,
    isReached,
    isReachedUpright,
    uprightPoints,
  };
}

// -------------------------------------------------------------------- run --

console.log(`deadend: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(800);

console.log('\n  walkable floor, per gate state');
const atStart = await snapshot();
const start = analyse('start', atStart);

await act('switch', 'switch1');
await act('cell', 'cell1');
await act('socket', 'socket1');
await page.waitForTimeout(600);
const atOneCell = await snapshot();
const oneCell = analyse('one cell seated', atOneCell);

await act('switch', 'switch2');
await page.waitForFunction(() => window.__derelict.doorsById.get('hatch-bay').open, null, {
  timeout: 30000,
});
const atHatch = await snapshot();
const hatch = analyse('shortcut open', atHatch);

await act('cell', 'cell2');
await act('socket', 'socket2');
await page.waitForFunction(() => window.__derelict.doorsById.get('airlock').open, null, {
  timeout: 30000,
});
const atOpen = await snapshot();
const open = analyse('airlock open', atOpen);

const states = [start, oneCell, hatch, open];

// ---- The floor is one piece, and it is the piece the player is standing on --
console.log('\n  reachability');
for (const s of states) {
  expect(`${s.name}: the spawn stands on free floor`, s.seeded, 'the spawn square is inside a collider');
}

// Orphan floor: walkable deck that is still unreachable once every door the
// game will ever open is open. That is the real defect — an island the player
// can never stand on, or worse, one they could be pushed into and not walk out
// of. Floor behind a door that has not opened yet is gated, not orphaned, so
// intermediate states are judged against the final one rather than against
// themselves.
for (const s of states) {
  let orphans = 0;
  let gated = 0;
  let first = null;
  for (const [x, z] of s.freePoints()) {
    if (s.isReached(x, z)) continue;
    if (open.isReached(x, z)) {
      gated++;
      continue;
    }
    orphans++;
    if (!first) first = [x, z];
  }
  expect(
    `${s.name}: no walkable floor is orphaned` +
      (gated ? ` (${(gated * STEP * STEP).toFixed(1)} m² still behind a closed door)` : ''),
    orphans === 0,
    `${orphans} squares (${(orphans * STEP * STEP).toFixed(1)} m²) are unreachable even at the end, ` +
      `e.g. (${first?.[0].toFixed(2)}, ${first?.[1].toFixed(2)})`
  );
}

// ---- Getting there is the same as getting back ------------------------------
// The whole "set a cell down anywhere" guarantee rests on the step relation
// being symmetric. Filling from a socket instead of the spawn must produce the
// identical component; if it does not, some square is a one-way trip.
const socket = atOpen.fixtures.find((f) => f.id === 'socket1');
for (const s of states) {
  const anchor = s.standNear(s.reachedStanding, socket.at);
  if (!anchor) {
    failures++;
    console.log(`  FAIL  ${s.name}: nowhere to stand at socket 1`);
    continue;
  }
  const back = s.fill(anchor.x, anchor.z);
  // Compared per stance: a (square, stance) pair reachable only one way is
  // just as much a one-way trip as a square is, and would mean some corner of
  // the ship can be crouched into and not stood back out of.
  let mismatch = 0;
  for (const st of [STAND, CROUCH]) {
    for (let k = 0; k < s.reached[st].length; k++) {
      if (s.reached[st][k] !== back.seen[st][k]) mismatch++;
    }
  }
  expect(
    `${s.name}: every reachable square and stance can walk back to the sockets`,
    mismatch === 0,
    `${mismatch} (square, stance) pairs reachable in only one direction`
  );
}

// ---- The two stances are consistent with each other -------------------------
console.log('\n  stances');
for (const s of states) {
  expect(
    `${s.name}: crouching never costs floor`,
    s.containment === 0,
    `${s.containment} squares take the standing box but not the crouched one, ` +
      'which means the height filter is inverted somewhere'
  );
}

// The squeeze has to actually exist, or the feature silently did nothing and
// every other assertion here would still pass.
expect(
  'there is floor that can only be reached crouched',
  start.crouchOnly > 0,
  'no square on the ship requires crouch — the collapsed structure is not blocking anything'
);

// ---- The Annex is unreachable standing --------------------------------------
// The 4.5 done-bar, decided over the floor rather than by walking it. Only
// before the shortcut hatch opens: once it does, the Service Passage is a
// standing route back, which is the point of the shortcut.
const annex = atStart.spaces.find((s) => s.id === 'annex');
const inAnnex = ([x, z]) => x >= annex.x[0] && x <= annex.x[1] && z >= annex.z[0] && z <= annex.z[1];
for (const s of [start, oneCell]) {
  let upright = 0;
  for (const p of s.uprightPoints()) if (inAnnex(p)) upright++;
  expect(
    `${s.name}: the Engine Annex cannot be entered standing`,
    upright === 0,
    `${(upright * STEP * STEP).toFixed(1)} m² of the Annex is reachable without ever crouching`
  );
  let ducked = 0;
  for (const p of s.reachedPoints()) if (inAnnex(p)) ducked++;
  expect(
    `${s.name}: the Engine Annex can be entered crouched`,
    ducked > 0,
    'the Annex is unreachable in either stance — the squeeze is impassable'
  );
}

// ---- Opening things never takes floor away ----------------------------------
for (let i = 1; i < states.length; i++) {
  const before = states[i - 1];
  const after = states[i];
  // Compared by world position, not grid index: each state derives its own
  // origin from the collider bounds, and a retracting door leaf moves those.
  // Counting squares would let a state pass by gaining floor in one place while
  // quietly losing it in another.
  let lost = 0;
  let firstLost = null;
  for (const [x, z] of before.reachedPoints()) {
    if (after.isReached(x, z)) continue;
    lost++;
    if (!firstLost) firstLost = [x, z];
  }
  expect(
    `${after.name}: no floor was lost since "${before.name}"`,
    lost === 0,
    firstLost
      ? `${lost} squares became unreachable, e.g. (${firstLost[0].toFixed(2)}, ${firstLost[1].toFixed(2)})`
      : `${lost} squares became unreachable`
  );
}

// ---- Every fixture can be stood next to, when it matters --------------------
console.log('\n  fixtures');
const NEEDED = [
  ['switch1', start],
  ['cradle1', start],
  ['socket1', start],
  ['socket2', start],
  ['switch2', oneCell],
  ['cradle2', hatch],
];
// Measured against the *standing* component, not the union. Every fixture has
// to be aimable, and the interact ray leaves the eye — which is 57 cm lower
// crouched. A fixture only reachable in a crouch would pass a union test and
// still be unusable.
for (const [id, state] of NEEDED) {
  const fixture = atOpen.fixtures.find((f) => f.id === id);
  const spot = state.standNear(state.reachedStanding, fixture.at);
  expect(
    `${id} can be stood at, upright, at "${state.name}"`,
    Boolean(spot),
    `no square within ${REACH} m of (${fixture.at[0].toFixed(1)}, ${fixture.at[1].toFixed(1)}) ` +
      'is reachable standing'
  );
}

// ---- A dropped cell never becomes an obstacle -------------------------------
// Cells contribute no colliders, which is what keeps the argument above about
// the floor honest: setting one down cannot change what is walkable.
expect(
  'setting a cell down does not add a collider',
  atOpen.colliders.length === atStart.colliders.length ||
    atOpen.colliders.length < atStart.colliders.length,
  `${atStart.colliders.length} → ${atOpen.colliders.length} colliders`
);
expect(
  'cell machinery contributes only the two cradles',
  atStart.cellColliders === 2,
  `${atStart.cellColliders} colliders from carryables`
);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\ndeadend: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\ndeadend: OK — the walkable floor is one mutually reachable piece in every gate state');
