import * as THREE from 'three';

import { SPACES, STAIRWELL, WALLS, WALL_THICKNESS } from './layout.js';
import { dressRooms } from './rooms.js';
import { ARCHITRAVE, SKIRTING, folds, panelDoor, placeRun, soft, turned } from './joinery.js';
import { tint } from './furniture.js';
import { worldUV } from './surfaces.js';

const T = WALL_THICKNESS;

/**
 * Dressing (phase 9, 9.4.4): what makes the shell a house. The entry hall is
 * dressed to the reference picture from where the player starts. Casings and
 * skirting go round every opening and wall in the house, and the rest of the
 * rooms are dressed in milestone 4.
 *
 * Everything here is built in engine from the generated surfaces, as the
 * ship's socket was (phase 2). Anything a player could walk into returns a
 * collider, and the dead-end proof sees it like any wall.
 */
export function dressHouse(mat) {
  const group = new THREE.Group();
  group.name = 'dressing';
  const colliders = [];
  const lights = [];

  const box = (material, x0, x1, y0, y1, z0, z1, { solid = false, tile = 1 } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    worldUV(mesh, { tile });
    group.add(mesh);
    if (solid) colliders.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
    return mesh;
  };

  casings(group, mat);
  arches(group, mat);
  windows(box, group, mat);
  hall(box, group, mat, colliders, lights);
  const rooms = dressRooms(mat);
  group.add(rooms.group);
  colliders.push(...rooms.colliders);
  lights.push(...rooms.lights);

  return { group, colliders, lights };
}

/**
 * A frame round every door and arch, on both faces of its wall: an
 * architrave, a broad flat board with a rounded back band on its outer edge,
 * as the painting's doors have (joinery.js). It stands out from the wall, so
 * the lamp leaves a shadow line round every door.
 */
function casings(group, mat) {
  const W = ARCHITRAVE.at(-1)[0];
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind === 'window') continue;
      const a = o.center - o.width / 2;
      const b = o.center + o.width / 2;
      const top = w.y + o.height;
      const jambTop = o.kind === 'door' ? top + W : top - o.width / 2;
      for (const side of [-1, 1]) {
        const face = w.at + side * (T / 2);
        // In the wall's own terms: t along it, n out of this face.
        const at = (t, y) => (w.axis === 'x' ? [face, y, t] : [t, y, face]);
        const along = w.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
        const out = w.axis === 'x' ? [side, 0, 0] : [0, 0, side];
        const back = along.map((v) => -v);
        // The profile's back band is at its start: each run starts at the
        // frame's outer edge and runs in toward the opening.
        group.add(placeRun(mat.wood, ARCHITRAVE, jambTop - w.y, at(a - W, w.y), [0, 1, 0], along, out));
        group.add(placeRun(mat.wood, ARCHITRAVE, jambTop - w.y, at(b + W, w.y), [0, 1, 0], back, out));
        if (o.kind === 'door') group.add(placeRun(mat.wood, ARCHITRAVE, b - a + 2 * W, at(a - W, top + W), along, [0, -1, 0], out));
      }
    }
  }
}

/** Fills each arch's top corners so the opening is round, as the reference's is. */
function arches(group, mat) {
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind !== 'arch') continue;
      const r = o.width / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-r, 0);
      shape.lineTo(-r, r);
      shape.lineTo(r, r);
      shape.lineTo(r, 0);
      shape.absarc(0, 0, r, 0, Math.PI, false);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 10 });
      geo.translate(0, 0, -T / 2);
      const mesh = new THREE.Mesh(geo, mat.wall);
      const springing = w.y + o.height - r;
      if (w.axis === 'z') mesh.position.set(o.center, springing, w.at);
      else {
        mesh.position.set(w.at, springing, o.center);
        mesh.rotation.y = Math.PI / 2;
      }
      worldUV(mesh, { tile: 2.8, tileV: 2.8 });
      group.add(mesh);
    }
  }
}

/** Rooms whose windows are left bare: a kitchen and a bathroom want the light. */
const BARE = new Set(['kitchen-window', 'bathroom-window']);

/**
 * Every window onto the night: the pane, a frame and glazing bars on the
 * inside face, a sill, and curtains. The inside is whichever side a room is on.
 */
function windows(box, group, mat) {
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind !== 'window') continue;
      const inRoom = (sign) => {
        const x = w.axis === 'x' ? w.at + sign * 0.4 : o.center;
        const z = w.axis === 'x' ? o.center : w.at + sign * 0.4;
        return SPACES.some((s) => s.y === w.y && x > s.x[0] && x < s.x[1] && z > s.z[0] && z < s.z[1]);
      };
      const sign = inRoom(1) ? 1 : -1;
      const t0 = o.center - o.width / 2;
      const t1 = o.center + o.width / 2;
      const y0 = w.y + o.sill;
      const y1 = y0 + o.height;
      const face = w.at + sign * (T / 2);
      // A box given in (along the wall, up, out from the inside face).
      const put = (a, b, ya, yb, n0, n1, material = mat.wood) => {
        const na = face + sign * n0;
        const nb = face + sign * n1;
        return w.axis === 'x' ? box(material, Math.min(na, nb), Math.max(na, nb), ya, yb, a, b) : box(material, a, b, ya, yb, Math.min(na, nb), Math.max(na, nb));
      };
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), mat.night);
      if (w.axis === 'x') {
        pane.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        pane.position.set(w.at, (y0 + y1) / 2, o.center);
      } else {
        pane.rotation.y = sign > 0 ? 0 : Math.PI;
        pane.position.set(o.center, (y0 + y1) / 2, w.at);
      }
      group.add(pane);
      // Frame, sill and glazing bars.
      put(t0 - 0.06, t1 + 0.06, y0 - 0.05, y0, -0.02, 0.05);
      put(t0 - 0.06, t1 + 0.06, y1, y1 + 0.06, -0.02, 0.03);
      put(t0 - 0.06, t0, y0, y1, -0.02, 0.03);
      put(t1, t1 + 0.06, y0, y1, -0.02, 0.03);
      put(o.center - 0.02, o.center + 0.02, y0, y1, -T / 2 - 0.02, -T / 2 + 0.02);
      put(t0, t1, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, -T / 2 - 0.02, -T / 2 + 0.02);
      if (BARE.has(o.id)) continue;
      // The curtain: a pale valance across the top, and a fall down each side.
      const cloth = (a, b, ya, yb, n) => {
        // Cloth hangs in folds, deeper toward the hem (joinery.js).
        const m = folds(mat.curtain, b - a, yb - ya, { count: Math.max(3, Math.round((b - a) / 0.09)), depth: 0.025, seed: a * 7 + ya });
        const nn = face + sign * n;
        if (w.axis === 'x') {
          m.rotation.y = Math.PI / 2;
          m.position.set(nn, (ya + yb) / 2, (a + b) / 2);
        } else m.position.set((a + b) / 2, (ya + yb) / 2, nn);
        group.add(m);
      };
      cloth(t0 - 0.15, t1 + 0.15, y1 - 0.33, y1 + 0.12, 0.06);
      cloth(t1 - 0.2, t1 + 0.14, y0 - 0.3, y1, 0.07);
      if (o.width > 0.9) cloth(t0 - 0.14, t0 + 0.12, y0 - 0.25, y1, 0.07);
    }
  }
}

/**
 * The hall's one lamp, a white shade on a cord over the middle of the rug.
 * Its lights are data here because the pipeline bakes the hall's walls, floor
 * and ceiling from the same lamp the game lights the furniture with.
 */
export const HALL_LAMP = {
  at: [0.36, 2.5, 1.55],
  colour: 0xe6f0c4,
  // The shade sends the light down: a cone onto the rug and the walls, and
  // only a little glow up, so the ceiling stays dark as in the reference.
  down: { intensity: 54, distance: 12, angle: 1.38, penumbra: 0.8, decay: 2, drop: 0.08 },
  glow: { intensity: 3.5, distance: 7, decay: 2, drop: 0.05 },
};

/** The little night that comes in everywhere: a cool fill in the shadows. */
export const NIGHT_FILL = { sky: 0x4a5a78, ground: 0x0a0c08, intensity: 0.32 };

/** The entry hall, to the reference. */
function hall(box, group, mat, colliders, lights) {
  // ---- The one lamp ----
  const LAMP = HALL_LAMP.at;
  {
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.015, 2.8 - LAMP[1] - 0.08, 0.015), mat.wood);
    cord.position.set(LAMP[0], (2.8 + LAMP[1] + 0.08) / 2, LAMP[2]);
    group.add(cord);
    // A coolie shade, the size the painting has it: wide and shallow, lit
    // white underneath, with a small cap where the cord meets it and the bulb
    // hanging just inside its rim.
    // Turned: a shallow dome to a flared rim, enamel outside and lit white
    // inside, the way the painting's hangs.
    const profile = [[0.035, 0.085], [0.07, 0.075], [0.13, 0.04], [0.2, -0.02], [0.245, -0.06], [0.258, -0.075], [0.262, -0.082]];
    const outer = turned(mat.enamel, profile, 24);
    outer.position.set(LAMP[0], LAMP[1], LAMP[2]);
    group.add(outer);
    const inside = turned(mat.shade, profile.map(([r, y]) => [r * 0.975, y - 0.004]), 24);
    inside.position.copy(outer.position);
    group.add(inside);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 10), mat.wood);
    cap.position.set(LAMP[0], LAMP[1] + 0.1, LAMP[2]);
    group.add(cap);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6), mat.shade);
    bulb.position.set(LAMP[0], LAMP[1] - 0.06, LAMP[2]);
    group.add(bulb);
    const { down: d, glow: gl, colour } = HALL_LAMP;
    const down = new THREE.SpotLight(colour, d.intensity, d.distance, d.angle, d.penumbra, d.decay);
    down.position.set(LAMP[0], LAMP[1] - d.drop, LAMP[2]);
    down.target.position.set(LAMP[0], 0, LAMP[2]);
    lights.push(down, down.target);
    const glow = new THREE.PointLight(colour, gl.intensity, gl.distance, gl.decay);
    glow.position.set(LAMP[0], LAMP[1] - gl.drop, LAMP[2]);
    lights.push(glow);
  }

  // ---- Joists across the ceiling, stopping at the stair slot: shallow, so
  // the ceiling reads as dark boards over the hall, not as a beam in the view ----
  for (const z of [0.55, 1.75, 2.95, 4.15]) box(mat.wood, -2.57, z > STAIRWELL.z[1] ? 2.3 : STAIRWELL.x[0], 2.72, 2.8, z - 0.06, z + 0.06);

  // ---- Skirting round the hall: a moulded board, standing off each wall ----
  const skirt = (from, to, out) => {
    const along = [to[0] - from[0], 0, to[2] - from[2]];
    const len = Math.hypot(along[0], along[2]);
    group.add(placeRun(mat.wood, SKIRTING, len, from, along.map((v) => v / len), [0, 1, 0], out));
  };
  skirt([-2.57, 0, 0.1], [-2.57, 0, 4.5], [1, 0, 0]);
  skirt([-2.57, 0, 4.5], [2.3, 0, 4.5], [0, 0, -1]);
  skirt([2.3, 0, 2.08], [2.3, 0, 4.5], [-1, 0, 0]);
  skirt([-2.57, 0, 0.1], [-1.92, 0, 0.1], [0, 0, 1]);
  skirt([-0.8, 0, 0.1], [-0.38, 0, 0.1], [0, 0, 1]);
  skirt([0.98, 0, 0.1], [1.15, 0, 0.1], [0, 0, 1]);

  // ---- The runner, from near the door to the arch ----
  {
    const width = 2.2;
    const from = 4.45;
    const to = 0.74;
    const len = from - to;
    const geo = new THREE.PlaneGeometry(width, len);
    geo.rotateX(-Math.PI / 2);
    // One repeat of the pattern per 1.4 m along it, the whole width across:
    // the length of the runner the painting shows (its swatch, model/hall.json).
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 1.4));
    const rug = new THREE.Mesh(geo, mat.hallRug ?? mat.rug);
    rug.position.set(0.3, 0.006, (from + to) / 2);
    group.add(rug);
  }

  // ---- The sideboard against the left wall, short of the window, where the painting has it ----
  {
    const x0 = -2.57;
    const x1 = -1.9;
    const z0 = 0.95;
    const z1 = 2.4;
    // A carcass on a recessed plinth, under a moulded top that overhangs it,
    // with two drawers over two panelled doors in its front, as the
    // painting's cabinet has.
    box(mat.wood, x0, x1 - 0.06, 0, 0.09, z0 + 0.04, z1 - 0.04, { solid: true });
    group.add(soft(mat.wood, x0, x1 - 0.03, 0.09, 0.71, z0 + 0.02, z1 - 0.02, 0.008));
    colliders.push({ minX: x0, maxX: x1, minY: 0, maxY: 0.76, minZ: z0, maxZ: z1 });
    group.add(soft(mat.wood, x0, x1 + 0.02, 0.71, 0.745, z0 - 0.02, z1 + 0.02, 0.012));
    group.add(soft(mat.wood, x0, x1, 0.7, 0.715, z0, z1, 0.004));
    const front = x1 - 0.03;
    const half = (z1 - z0 - 0.08) / 2;
    for (const [k, zc] of [[0, z0 + 0.04 + half / 2], [1, z1 - 0.04 - half / 2]]) {
      // A drawer: a front with a knob.
      group.add(soft(mat.door, front, front + 0.022, 0.53, 0.68, zc - half / 2 + 0.01, zc + half / 2 - 0.01, 0.006));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat.knob);
      knob.position.set(front + 0.035, 0.605, zc);
      group.add(knob);
      // A panelled door under it, turned to face the room.
      const door = panelDoor(mat.door, { w: half - 0.02, h: 0.4, t: 0.024, rows: [{ f: 1 }], stile: 0.07, top: 0.06, bottom: 0.06 });
      door.rotation.y = Math.PI / 2;
      door.position.set(front + 0.012, 0.11, zc);
      group.add(door);
      const pull = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat.knob);
      pull.position.set(front + 0.04, 0.33, zc + (k ? -1 : 1) * (half / 2 - 0.06));
      group.add(pull);
    }
    // On top: a mantel clock and a jug, as the painting's has things on it.
    const clock = soft(mat.wood, -2.42, -2.24, 0.745, 0.98, 1.08, 1.32, 0.03);
    group.add(clock);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), mat.enamel);
    face.rotation.y = Math.PI / 2;
    face.position.set(-2.235, 0.87, 1.2);
    group.add(face);
    const jug = turned(mat.iron, [[0.0, 0], [0.07, 0.0], [0.085, 0.05], [0.08, 0.13], [0.05, 0.19], [0.045, 0.23], [0.055, 0.25]], 14);
    jug.position.set(-2.35, 0.745, 1.75);
    group.add(jug);
  }

  // ---- The chair in the corner beside the left door, under the hanging ----
  {
    const cx = -2.22;
    const cz = 0.36;
    const s = 0.21;
    // A hard chair: four legs joined by stretchers, a board seat with its
    // edges rounded, and a back of two posts carrying two rails.
    group.add(soft(mat.wood, cx - s, cx + s, 0.42, 0.455, cz - s, cz + s, 0.01));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = cx + dx * (s - 0.03);
      const lz = cz + dz * (s - 0.03);
      group.add(soft(mat.wood, lx - 0.018, lx + 0.018, 0, dz < 0 ? 0.95 : 0.42, lz - 0.018, lz + 0.018, 0.006));
    }
    for (const y of [0.14]) {
      group.add(soft(mat.wood, cx - s + 0.03, cx + s - 0.03, y, y + 0.025, cz - s + 0.02, cz - s + 0.04, 0.004));
      group.add(soft(mat.wood, cx - s + 0.03, cx + s - 0.03, y, y + 0.025, cz + s - 0.04, cz + s - 0.02, 0.004));
    }
    group.add(soft(mat.wood, cx - s + 0.02, cx + s - 0.02, 0.86, 0.93, cz - s + 0.012, cz - s + 0.04, 0.008));
    group.add(soft(mat.wood, cx - s + 0.02, cx + s - 0.02, 0.66, 0.71, cz - s + 0.015, cz - s + 0.037, 0.008));
    colliders.push({ minX: cx - s, maxX: cx + s, minY: 0, maxY: 0.92, minZ: cz - s, maxZ: cz + s });
  }

  // ---- A picture on the right-hand wall, over the foot of the stairs ----
  {
    const x = 2.29;
    const y = 1.98;
    const z = 1.05;
    box(mat.wood, x - 0.03, x, y - 0.38, y + 0.38, z - 0.19, z + 0.19);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.64), mat.picture);
    art.rotation.y = -Math.PI / 2;
    art.position.set(x - 0.032, y, z);
    group.add(art);
  }

  // ---- A leather bag hung on a peg in the corner beside the left door, as in the painting ----
  {
    const leather = tint(mat.wood, 0x6a5232);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), leather);
    bag.scale.set(0.2, 0.3, 0.075);
    bag.position.set(-2.3, 1.5, 0.19);
    group.add(bag);
    // Its flap, over the top half, and the strap up to the peg.
    group.add(soft(leather, -2.48, -2.12, 1.52, 1.8, 0.22, 0.25, 0.02));
    group.add(soft(leather, -2.32, -2.28, 1.78, 2.0, 0.13, 0.15, 0.004));
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), mat.wood);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(-2.3, 2.0, 0.14);
    group.add(peg);
  }
}
