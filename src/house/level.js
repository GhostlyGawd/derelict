import * as THREE from 'three';
import { BLOCKERS, SPACES, STAIRS, STAIRWELL, UPPER, WALLS, WALL_THICKNESS } from './layout.js';
import { HANDRAIL, placeRun, post, soft } from './joinery.js';
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
  const plane = (material, x0, x1, z0, z1, y, up, tile = 2) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    worldUV(mesh, { tile });
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
    // Most floors are boards; the kitchen and the bathroom are tiled, a metre to a repeat.
    if (s.surface === 'tile') plane(surfaces.tile, s.x[0], s.x[1], s.z[0], s.z[1], s.y, true, 1);
    else plane(mat.floor, s.x[0], s.x[1], s.z[0], s.z[1], s.y, true);
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

  // ---- The stairs, as the painting has them: a nosed tread over a riser at
  // every step, with a closed string up the open side. Drawn, never collided
  // with: the floor under the player is the ramp in floorAt, and the treads
  // are what it looks like. The space under the flight is boxed in, as a
  // staircase against a wall is.
  const steps = 15;
  const rise = (STAIRS.top - STAIRS.bottom) / steps;
  const run = (STAIRS.z[1] - STAIRS.z[0]) / steps;
  const SX0 = STAIRS.x[0];
  const SX1 = STAIRS.x[1];
  for (let i = 0; i < steps; i++) {
    const z1 = STAIRS.z[1] - i * run;
    const top = (i + 1) * rise;
    // The riser, set back under the nosing.
    group.add(soft(mat.stairs, SX0, SX1, top - rise, top - 0.03, z1 - 0.025, z1 - 0.005, 0.003));
    // The tread, its nosing proud of the riser and rounded.
    group.add(soft(mat.banister, SX0 - 0.02, SX1, top - 0.03, top, z1 - run, z1 + 0.025, 0.012));
    // The boxed-in space under the step.
    box(mat.stairs, SX0, SX1, 0, top - rise, z1 - run, z1 - 0.005, false);
  }
  // The string: a deep board up the open side, the steps housed in it.
  {
    const deep = 0.32;
    const len = Math.hypot(STAIRS.z[1] - STAIRS.z[0], STAIRS.top - STAIRS.bottom);
    const string = soft(mat.banister, -0.025, 0.025, -deep / 2, deep / 2, -len / 2 - 0.15, len / 2 + 0.15, 0.008);
    string.position.set(SX0 - 0.03, (STAIRS.top + STAIRS.bottom) / 2 + 0.09, (STAIRS.z[0] + STAIRS.z[1]) / 2);
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
  // The open banister, as the painting's: plain square balusters standing on
  // the string, one to a tread, under a moulded handrail, from a tall square
  // newel post with a capped top at the foot of the flight to a half post
  // against the hall's back wall. Past that line the flight runs between
  // walls, and the rail there is a handrail on the wall. It once ran on up to
  // the stairhead, through the slot's wall, and came out of it into the
  // gallery upstairs.
  const zFoot = BLOCKERS[0].z[1];
  const zHead = STAIRS.z[0];
  const zBack = T / 2 + 0.05;
  const stairY = (z) => Math.min(STAIRS.top, Math.max(0, ((STAIRS.z[1] - z) / (STAIRS.z[1] - STAIRS.z[0])) * (STAIRS.top - STAIRS.bottom)));
  const stand = (obj, x, y, z) => {
    obj.position.set(x, y, z);
    group.add(obj);
    return obj;
  };
  for (let z = zFoot - 0.18; z > zBack + 0.06; z -= run) {
    const y0 = stairY(z) + 0.1;
    stand(post(mat.banister, 0.036, stairY(z) + RAIL - y0), railX, y0, z);
  }
  const newelTop = stairY(zFoot) + RAIL + 0.12;
  stand(post(mat.banister, 0.11, newelTop, { cap: 0.15, capH: 0.06 }), railX, 0, zFoot);
  stand(post(mat.banister, 0.09, stairY(zBack) + RAIL + 0.06), railX, 0, zBack);
  const sloped = (x, z0, z1, rise, profile) => {
    const y0 = stairY(z0) + rise;
    const y1 = stairY(z1) + rise;
    const len = Math.hypot(z0 - z1, y1 - y0);
    const dir = [0, (y1 - y0) / len, (z1 - z0) / len];
    // Across the rail is sideways; out from it is up, square to the slope.
    const up = [0, (z0 - z1) / len, (y1 - y0) / len].map((v) => -v);
    const w = profile.at(-1)[0];
    group.add(placeRun(mat.banister, profile, len, [x - w / 2, y0, z0], dir, [1, 0, 0], up));
  };
  sloped(railX, zFoot, zBack, RAIL, HANDRAIL);
  // The handrail on the wall, on brackets, from the back wall to the head.
  const wallX = STAIRS.x[0] - 0.02;
  sloped(wallX, -T / 2, zHead, RAIL - 0.05, HANDRAIL);
  for (let z = -0.4; z > zHead; z -= 0.9) box(mat.banister, STAIRWELL.x[0] - 0.05, wallX, stairY(z) + RAIL - 0.12, stairY(z) + RAIL - 0.04, z - 0.02, z + 0.02, false);

  return { group, colliders };
}
