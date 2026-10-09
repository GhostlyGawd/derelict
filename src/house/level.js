import * as THREE from 'three';
import { BLOCKERS, SPACES, STAIRS, STAIRWELL, UPPER, WALLS, WALL_THICKNESS } from './layout.js';
import { worldUV } from './surfaces.js';

const T = WALL_THICKNESS;

/**
 * The house's shell (phase 9): floors on both storeys, ceilings, walls with
 * their openings, the stairs and the banister, every one derived from
 * layout.js and dressed in the generated surfaces (surfaces.js). Every
 * surface tiles at its real size: a wall shows one wall's height of plaster,
 * a floor repeats every two metres.
 *
 * Colliders are boxes with a floor and a ceiling each, the same contract as
 * the ship's, so the player's collision code is the ship's.
 */
export function buildHouse(surfaces) {
  const group = new THREE.Group();
  group.name = 'level';
  const colliders = [];
  const mat = {
    floor: surfaces.floor,
    ceiling: surfaces.ceiling,
    wall: surfaces.wall,
    upperWall: surfaces.wall,
    stairs: surfaces.wood,
    banister: surfaces.wood,
  };
  const isWall = (m) => m === mat.wall;

  const box = (material, x0, x1, y0, y1, z0, z1, solid = true) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const baseY = y0 >= UPPER - 0.25 ? UPPER : 0;
    worldUV(mesh, isWall(material) ? { tile: 2.8, tileV: 2.8, baseY } : { tile: 1 });
    group.add(mesh);
    if (solid) colliders.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
    return mesh;
  };
  const plane = (material, x0, x1, z0, z1, y, up) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    worldUV(mesh, { tile: 2 });
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
    plane(mat.floor, s.x[0], s.x[1], s.z[0], s.z[1], s.y, true);
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
    const run = (a, b, y0, y1, solidity = true) => {
      if (w.axis === 'x') box(material, w.at - T / 2, w.at + T / 2, y0, y1, a, b, solidity);
      else box(material, a, b, y0, y1, w.at - T / 2, w.at + T / 2, solidity);
    };
    for (const [a, b] of solid) run(a, b, w.y, w.y + w.h);
    for (const o of openings) {
      const a = o.center - o.width / 2;
      const b = o.center + o.width / 2;
      run(a, b, w.y + (o.sill || 0) + o.height, w.y + w.h);
      if (o.kind === 'window') {
        // A window is cut from the wall's look and never from its collider:
        // the sill is drawn, and the opening stays solid to walk into.
        run(a, b, w.y, w.y + o.sill);
        if (w.axis === 'x') colliders.push({ minX: w.at - T / 2, maxX: w.at + T / 2, minY: w.y, maxY: w.y + w.h, minZ: a, maxZ: b });
        else colliders.push({ minX: a, maxX: b, minY: w.y, maxY: w.y + w.h, minZ: w.at - T / 2, maxZ: w.at + T / 2 });
      }
    }
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
    // A nosing on each tread, proud of the riser below it, so the flight reads
    // as steps under the lamp rather than as a stack of boxes.
    box(mat.banister, STAIRS.x[0] - 0.03, STAIRS.x[1], (i + 1) * rise - 0.035, (i + 1) * rise, z1 - run, z1 + 0.03, false);
  }
  // The string: a board up the open side, under the nosings, from the floor
  // at the foot to the stairhead.
  {
    const deep = 0.28;
    const len = Math.hypot(STAIRS.z[1] - STAIRS.z[0], STAIRS.top - STAIRS.bottom);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.04, deep, len + deep), mat.banister);
    string.position.set(STAIRS.x[0] - 0.02, (STAIRS.top + STAIRS.bottom) / 2 - deep / 2 + 0.05, (STAIRS.z[0] + STAIRS.z[1]) / 2);
    string.rotation.x = Math.atan2(STAIRS.top - STAIRS.bottom, STAIRS.z[1] - STAIRS.z[0]);
    group.add(string);
  }
  // The slot in the hall's ceiling the flight climbs through: its sides, from
  // the ceiling up to the upper floor's ceiling. They are colliders, so the
  // upper flight and the stairhead cannot be stepped off sideways.
  {
    const top = UPPER + 2.6;
    const hallTop = 2.8;
    // The west side stands on the banister's line and no further in: a player
    // climbing with a shoulder on the banister passes under its foot with their
    // head at the hall's ceiling height, and must not be inside it.
    box(mat.wall, STAIRWELL.x[0] - 0.1, STAIRWELL.x[0], hallTop, top, STAIRWELL.z[0], STAIRWELL.z[1]);
    box(mat.wall, STAIRWELL.x[0], STAIRWELL.x[1], hallTop, top, STAIRWELL.z[1] - 0.05, STAIRWELL.z[1] + 0.05, false);
    // The east side is flush with the hall's east wall below it, so coming
    // down the flight against it there is no ledge to drop into.
    box(mat.wall, STAIRWELL.x[1] - T / 2, STAIRWELL.x[1], hallTop, top, STAIRWELL.z[0], STAIRWELL.z[1]);
    // Its ceiling, sloping with the flight, is the underside of whatever is above.
    plane(mat.ceiling, STAIRWELL.x[0], STAIRWELL.x[1], STAIRWELL.z[0], STAIRWELL.z[1], top, false);
  }

  // ---- Blockers: the banister ----
  // Its colliders are tall, so nobody steps over it from either floor, but
  // they are not what is drawn. Drawn as a slab they read as a four-metre wall
  // standing in the hall. What is drawn is a banister: a handrail that follows
  // the stairs, on balusters, with a post at each end.
  for (const b of BLOCKERS) colliders.push({ minX: b.x[0], maxX: b.x[1], minY: b.y[0], maxY: b.y[1], minZ: b.z[0], maxZ: b.z[1] });
  const railX = (BLOCKERS[0].x[0] + BLOCKERS[0].x[1]) / 2;
  const RAIL = 0.9;
  const post = (z, y0, y1, w = 0.09) => box(mat.banister, railX - w / 2, railX + w / 2, y0, y1, z - w / 2, z + w / 2, false);
  // A turned baluster: a square block at the foot and a thinner shaft with a
  // swelling partway up, which is what reads as turned at this resolution.
  const baluster = (z, y0, y1) => {
    post(z, y0, y0 + 0.12, 0.055);
    post(z, y0 + 0.12, y1, 0.035);
    post(z, y0 + 0.24, y0 + 0.36, 0.05);
  };
  // Down the flight: a baluster on every other tread under a sloping rail,
  // with a newel post at the foot.
  const zFoot = BLOCKERS[0].z[1];
  const zHead = STAIRS.z[0];
  const stairY = (z) => Math.min(STAIRS.top, Math.max(0, ((STAIRS.z[1] - z) / (STAIRS.z[1] - STAIRS.z[0])) * (STAIRS.top - STAIRS.bottom)));
  for (let z = zFoot - 0.2; z >= zHead - 1e-6; z -= run) baluster(z, stairY(z), stairY(z) + RAIL);
  post(zFoot, 0, stairY(zFoot) + RAIL + 0.15, 0.11);
  post(zFoot, stairY(zFoot) + RAIL + 0.15, stairY(zFoot) + RAIL + 0.22, 0.15);
  {
    const y0 = stairY(zFoot) + RAIL;
    const y1 = stairY(zHead) + RAIL;
    const len = Math.hypot(zFoot - zHead, y1 - y0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, len), mat.banister);
    rail.position.set(railX, (y0 + y1) / 2, (zFoot + zHead) / 2);
    rail.rotation.x = Math.atan2(y1 - y0, zFoot - zHead);
    group.add(rail);
  }
  // Along the stairhead: level, at rail height off the upper floor.
  const zEnd = BLOCKERS[0].z[0];
  for (let z = zHead; z >= zEnd - 1e-6; z -= run) baluster(z, UPPER, UPPER + RAIL);
  box(mat.banister, railX - 0.04, railX + 0.04, UPPER + RAIL, UPPER + RAIL + 0.06, zEnd, zHead, false);
  post(zHead, UPPER - 0.3, UPPER + RAIL + 0.15, 0.11);

  return { group, colliders };
}
