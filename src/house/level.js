import * as THREE from 'three';
import { BLOCKERS, SPACES, STAIRS, STAIRWELL, UPPER, WALLS, WALL_THICKNESS } from './layout.js';

const T = WALL_THICKNESS;

/**
 * The house's shell in greybox (phase 9, milestone 1): floors on both
 * storeys, ceilings, walls with their openings, the stairs and the banister,
 * every one derived from layout.js. Flat colours only; milestone 3 dresses it.
 *
 * Colliders are boxes with a floor and a ceiling each, the same contract as
 * the ship's, so the player's collision code is the ship's.
 */
export function buildHouse() {
  const group = new THREE.Group();
  group.name = 'level';
  const colliders = [];
  const mat = {
    floor: new THREE.MeshLambertMaterial({ color: 0x5c5a50 }),
    ceiling: new THREE.MeshLambertMaterial({ color: 0x3e403a }),
    wall: new THREE.MeshLambertMaterial({ color: 0x6f7464 }),
    upperWall: new THREE.MeshLambertMaterial({ color: 0x647060 }),
    stairs: new THREE.MeshLambertMaterial({ color: 0x5a4a3a }),
    banister: new THREE.MeshLambertMaterial({ color: 0x3e2f22 }),
  };

  const box = (material, x0, x1, y0, y1, z0, z1, solid = true) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(mesh);
    if (solid) colliders.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
    return mesh;
  };
  const plane = (material, x0, x1, z0, z1, y, up) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    group.add(mesh);
  };
  /** A rectangle with another cut out of it, as up to four rectangles. */
  const minus = ([x0, x1], [z0, z1], hole) => {
    const out = [];
    const hx0 = Math.max(x0, hole.x[0]);
    const hx1 = Math.min(x1, hole.x[1]);
    const hz0 = Math.max(z0, hole.z[0]);
    const hz1 = Math.min(z1, hole.z[1]);
    if (hx0 >= hx1 || hz0 >= hz1) return [[[x0, x1], [z0, z1]]];
    if (hz0 > z0) out.push([[x0, x1], [z0, hz0]]);
    if (hz1 < z1) out.push([[x0, x1], [hz1, z1]]);
    if (hx0 > x0) out.push([[x0, hx0], [hz0, hz1]]);
    if (hx1 < x1) out.push([[hx1, x1], [hz0, hz1]]);
    return out;
  };

  // ---- Floors and ceilings ----
  for (const s of SPACES) {
    const parts = s.floor === 1 ? minus(s.x, s.z, STAIRWELL) : [[s.x, s.z]];
    for (const [x, z] of parts) plane(mat.floor, x[0], x[1], z[0], z[1], s.y, true);
    // Ground-floor ceilings stop where the stairwell opens above them.
    const roof = s.floor === 0 ? minus(s.x, s.z, STAIRWELL) : [[s.x, s.z]];
    for (const [x, z] of roof) plane(mat.ceiling, x[0], x[1], z[0], z[1], s.y + s.h, false);
  }

  // ---- Walls ----
  for (const w of WALLS) {
    const material = w.y > 0 ? mat.upperWall : mat.wall;
    const openings = [...(w.openings || [])].sort((a, b) => a.center - b.center);
    let cursor = w.from;
    const solid = [];
    for (const o of openings) {
      const a = o.center - o.width / 2;
      const b = o.center + o.width / 2;
      if (a > cursor) solid.push([cursor, a]);
      cursor = b;
    }
    if (w.to > cursor) solid.push([cursor, w.to]);
    const run = (a, b, y0, y1) => {
      if (w.axis === 'x') box(material, w.at - T / 2, w.at + T / 2, y0, y1, a, b);
      else box(material, a, b, y0, y1, w.at - T / 2, w.at + T / 2);
    };
    for (const [a, b] of solid) run(a, b, w.y, w.y + w.h);
    for (const o of openings) run(o.center - o.width / 2, o.center + o.width / 2, w.y + o.height, w.y + w.h);
  }

  // ---- The stairs: a ramp of treads, and the boxes under them ----
  const steps = 15;
  const rise = (STAIRS.top - STAIRS.bottom) / steps;
  const run = (STAIRS.z[1] - STAIRS.z[0]) / steps;
  for (let i = 0; i < steps; i++) {
    // Each tread is drawn, never collided with: the floor under the player is
    // the ramp in floorAt, and the treads are what it looks like.
    const z1 = STAIRS.z[1] - i * run;
    box(mat.stairs, STAIRS.x[0], STAIRS.x[1], 0, (i + 1) * rise, z1 - run, z1, false);
  }
  // Nothing can walk under the stairs from the back of the hall. Only as tall
  // as it has to be to stop someone on the hall floor: anyone this close to it
  // on the stairs is near the top, with their feet well above it.
  box(mat.wall, STAIRS.x[0], 2, 0, 2.0, STAIRS.z[0] - 0.05, STAIRS.z[0] + 0.05);

  // ---- Blockers: the banister ----
  // Its colliders are tall, so nobody steps over it from either floor, but
  // they are not what is drawn. Drawn as a slab they read as a four-metre wall
  // standing in the hall. What is drawn is a banister: a handrail that follows
  // the stairs, on balusters, with a post at each end.
  for (const b of BLOCKERS) colliders.push({ minX: b.x[0], maxX: b.x[1], minY: b.y[0], maxY: b.y[1], minZ: b.z[0], maxZ: b.z[1] });
  const railX = (BLOCKERS[0].x[0] + BLOCKERS[0].x[1]) / 2;
  const RAIL = 0.9;
  const post = (z, y0, y1, w = 0.09) => box(mat.banister, railX - w / 2, railX + w / 2, y0, y1, z - w / 2, z + w / 2, false);
  // Along the stairs: balusters standing on each tread, under a sloping rail.
  const zLow = BLOCKERS[0].z[1];
  const zHigh = STAIRS.z[0];
  const stairY = (z) => ((STAIRS.z[1] - z) / (STAIRS.z[1] - STAIRS.z[0])) * (STAIRS.top - STAIRS.bottom);
  for (let z = zLow; z >= zHigh - 1e-6; z -= 0.28) post(z, Math.max(0, stairY(z)), stairY(z) + RAIL, 0.04);
  post(zLow, 0, stairY(zLow) + RAIL + 0.15, 0.11);
  {
    const y0 = stairY(zLow) + RAIL;
    const y1 = stairY(zHigh) + RAIL;
    const len = Math.hypot(zLow - zHigh, y1 - y0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, len), mat.banister);
    rail.position.set(railX, (y0 + y1) / 2, (zLow + zHigh) / 2);
    rail.rotation.x = Math.atan2(y1 - y0, zLow - zHigh);
    group.add(rail);
  }
  // Along the landing above the hall: level, at rail height off the upper floor.
  const landing = BLOCKERS[1];
  for (let z = landing.z[0]; z <= landing.z[1] + 1e-6; z += 0.28) post(z, UPPER, UPPER + RAIL, 0.04);
  box(mat.banister, railX - 0.04, railX + 0.04, UPPER + RAIL, UPPER + RAIL + 0.06, zHigh, landing.z[1], false);
  post(zHigh, STAIRS.top - 0.2, UPPER + RAIL + 0.15, 0.11);

  return { group, colliders };
}
