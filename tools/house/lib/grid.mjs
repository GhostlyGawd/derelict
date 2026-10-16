/**
 * The house's floor, as a graph (phase 9). Shared by the two-floor dead-end
 * proof and the chain harness, so the two can never disagree about what the
 * player can reach.
 *
 * A node is a 10 cm square of the plan and the height of the floor under it.
 * Its neighbours are the four squares next door, each at the floor the player
 * code would put the feet on — `floorAt(x, z, y)`, the highest floor no more
 * than a step above the feet. A move counts only when the union of the two
 * player boxes is clear at both heights, which can under-report reachability
 * and never over-report it.
 */
import { chromium } from 'playwright';

const layout = await import(new URL('../../../src/house/layout.js', import.meta.url).href);
export const { floorAt, SPACES, STAIRS, STAIRWELL, LOOP, PLAYER_RADIUS: R, PLAYER_HEIGHT: H, PLAYER_EYE: EYE } = layout;

/**
 * The floors, as slabs the interact ray cannot pass. The player stands on
 * floorAt rather than on colliders, so the floors are not in the collider
 * set, and a line of sight tested only against colliders would see through
 * them. The game's own ray is stopped by the floor meshes (the Interactor's
 * occluders); this is the same thing for the harness.
 */
const slabs = (() => {
  const out = [];
  for (const s of SPACES) {
    if (s.floor !== 1) continue;
    const add = (x, z) => out.push({ minX: x[0], maxX: x[1], minY: s.y - 0.2, maxY: s.y, minZ: z[0], maxZ: z[1] });
    // The upper floor, less the stairwell.
    const w = STAIRWELL;
    if (s.x[1] <= w.x[0] || s.x[0] >= w.x[1] || s.z[1] <= w.z[0] || s.z[0] >= w.z[1]) add(s.x, s.z);
    else {
      if (s.z[0] < w.z[0]) add(s.x, [s.z[0], w.z[0]]);
      if (s.z[1] > w.z[1]) add(s.x, [w.z[1], s.z[1]]);
      const z = [Math.max(s.z[0], w.z[0]), Math.min(s.z[1], w.z[1])];
      if (s.x[0] < w.x[0]) add([s.x[0], w.x[0]], z);
      if (s.x[1] > w.x[1]) add([w.x[1], s.x[1]], z);
    }
  }
  return out;
})();

export const STEP = 0.1;
/** How far the interact ray reaches from the eye (the Interactor's range, less a margin). */
export const REACH = 2.0;

export const x0 = Math.min(...SPACES.map((s) => s.x[0])) - 0.5;
export const x1 = Math.max(...SPACES.map((s) => s.x[1])) + 0.5;
export const z0 = Math.min(...SPACES.map((s) => s.z[0])) - 0.5;
export const z1 = Math.max(...SPACES.map((s) => s.z[1])) + 0.5;
const NX = Math.round((x1 - x0) / STEP) + 1;
const NZ = Math.round((z1 - z0) / STEP) + 1;
export const X = (i) => +(x0 + i * STEP).toFixed(3);
export const Z = (j) => +(z0 + j * STEP).toFixed(3);
export const key = (i, j, y) => `${i},${j},${y.toFixed(3)}`;

/** The player's box over [ax, bx] × [az, bz] with feet at y, against the colliders. */
function clear(colliders, ax, bx, az, bz, y) {
  for (const c of colliders) {
    if (c.minY >= y + H || c.maxY <= y + 0.05) continue;
    if (bx <= c.minX || ax >= c.maxX) continue;
    if (bz <= c.minZ || az >= c.maxZ) continue;
    return false;
  }
  return true;
}

export const onStairs = (x, z) => x >= STAIRS.x[0] && x <= STAIRS.x[1] && z >= STAIRS.z[0] && z <= STAIRS.z[1];

/** The edges out of a node, exactly as the movement code would take them. */
export function edges(colliders, i, j, y) {
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

/** Flood fill from a point. Returns the nodes reached, keyed. */
export function fill(colliders, from) {
  const si = Math.round((from[0] - x0) / STEP);
  const sj = Math.round((from[2] - z0) / STEP);
  const sy = floorAt(X(si), Z(sj), from[1]);
  const seen = new Map([[key(si, sj, sy), [si, sj, sy]]]);
  const queue = [[si, sj, sy]];
  while (queue.length) {
    const [i, j, y] = queue.shift();
    for (const [ni, nj, ny] of edges(colliders, i, j, y)) {
      const k = key(ni, nj, ny);
      if (!seen.has(k)) {
        seen.set(k, [ni, nj, ny]);
        queue.push([ni, nj, ny]);
      }
    }
  }
  return seen;
}

/** Does the segment a→b pass through a box? (slab test) */
function crosses(c, a, b) {
  let t0 = 0;
  let t1 = 1;
  for (const [lo, hi, p, q] of [[c.minX, c.maxX, a[0], b[0]], [c.minY, c.maxY, a[1], b[1]], [c.minZ, c.maxZ, a[2], b[2]]]) {
    const d = q - p;
    if (Math.abs(d) < 1e-9) {
      if (p <= lo || p >= hi) return false;
      continue;
    }
    let ta = (lo - p) / d;
    let tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * Can something at `point` be used from the reached set? Some reached place
 * puts the eye within REACH of it with nothing solid in between. The last
 * 25 cm of the line is not tested, because that is the thing itself.
 */
export function reachable(seen, colliders, point) {
  for (const [i, j, y] of seen.values()) {
    const eye = [X(i), y + EYE, Z(j)];
    const d = Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]);
    if (d > REACH) continue;
    const s = Math.max(0, (d - 0.25) / d);
    const end = [eye[0] + (point[0] - eye[0]) * s, eye[1] + (point[1] - eye[1]) * s, eye[2] + (point[2] - eye[2]) * s];
    if (!colliders.some((c) => crosses(c, eye, end)) && !slabs.some((c) => crosses(c, eye, end))) return true;
  }
  return false;
}

/** Opens the house in a browser and hands back a small driver for it. */
export async function openHouse(base) {
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // The proofs measure the game, never a cache of it.
  await page.route('**/sw.js', (r) => r.abort());
  await page.goto(new URL('house/', base).href);
  await page.waitForFunction(() => window.__house?.phase === 'title', null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__house;
    g.manualClockOnStart = true;
    document.getElementById('start').click();
  });
  await page.waitForFunction(() => window.__house.phase === 'playing');

  const driver = {
    page,
    errors,
    close: () => browser.close(),
    /** The live collider set, the targets and where they are, and the loop's state. */
    snapshot: () =>
      page.evaluate(() => {
        const g = window.__house;
        return {
          colliders: g.colliders(),
          spawn: [g.player.position.x, g.player.position.y, g.player.position.z],
          targets: g.things.targets.map((t) => ({ id: t.id, kind: t.kind, point: t.point.toArray(), lock: t.lock || null, heldBy: t.heldBy || null, open: t.open ?? null })),
          state: g.state(),
        };
      }),
    /** Press interact on a target, with the aim taken out, and let the frame run. */
    press: (id) =>
      page.evaluate((target) => {
        const g = window.__house;
        g.pressInteractForTest(target);
        g.stepForTest(1 / 60, { render: false });
        return g.state();
      }, id),
    /** Run the clock until the motion has caught up, so every leaf sits where its collider is. */
    settle: () =>
      page.evaluate(() => {
        const g = window.__house;
        for (let i = 0; i < 90; i++) g.stepForTest(1 / 60, { render: false });
      }),
  };
  return driver;
}

/**
 * Open every door that needs nothing and can be reached, until none is left.
 * A door with no lock is the player's to open whenever they get to it, so a
 * state of the loop is judged with all of those open, never with them shut.
 */
export async function openFreeDoors(driver) {
  for (;;) {
    const snap = await driver.snapshot();
    const seen = fill(snap.colliders, snap.spawn);
    const next = snap.targets.find(
      (t) =>
        t.kind === 'door' &&
        !t.open &&
        (!t.lock || !t.lock.length) &&
        !(t.heldBy === 'clock' && !snap.state.clockSet) &&
        reachable(seen, snap.colliders, t.point)
    );
    if (!next) return { snap, seen };
    await driver.press(next.id);
    await driver.settle();
  }
}

/** Take one step of the loop, through the same press the player makes. */
export async function takeStep(driver, row) {
  if (row.container) return driver.press(row.container);
  if (row.door) return driver.press(row.door);
  if (row.clock) {
    let state;
    for (let i = 0; i < 12; i++) {
      state = await driver.press('clock');
      if (state.clockSet) break;
    }
    return state;
  }
  throw new Error(`a loop row with nothing to do: ${row.step}`);
}
