import * as THREE from 'three';

import { SPACES, STAIRWELL, WALLS, WALL_THICKNESS } from './layout.js';
import { dressRooms } from './rooms.js';
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

  casings(box, mat);
  arches(group, mat);
  windows(box, group, mat);
  hall(box, group, mat, colliders, lights);
  const rooms = dressRooms(mat);
  group.add(rooms.group);
  colliders.push(...rooms.colliders);
  lights.push(...rooms.lights);

  return { group, colliders, lights };
}

/** A frame round every door and arch, on both faces of its wall. */
function casings(box, mat) {
  const W = 0.09;
  const P = 0.035;
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind === 'window') continue;
      const a = o.center - o.width / 2;
      const b = o.center + o.width / 2;
      const top = w.y + o.height;
      for (const side of [-1, 1]) {
        const face = w.at + side * (T / 2);
        const n0 = Math.min(face, face + side * P);
        const n1 = Math.max(face, face + side * P);
        const piece = (t0, t1, y0, y1) =>
          w.axis === 'x' ? box(mat.wood, n0, n1, y0, y1, t0, t1) : box(mat.wood, t0, t1, y0, y1, n0, n1);
        if (o.kind === 'door') {
          piece(a - W, a, w.y, top + W);
          piece(b, b + W, w.y, top + W);
          piece(a - W, b + W, top, top + W);
        } else {
          // An arch gets a plain band round its sides only; its head is round.
          piece(a - W, a, w.y, top - o.width / 2);
          piece(b, b + W, w.y, top - o.width / 2);
        }
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
        const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, yb - ya), mat.curtain);
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
  at: [0.1, 2.5, 2.3],
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
    // A coolie shade: wide and shallow, lit white underneath, with a small cap
    // where the cord meets it and the bulb hanging just below its rim.
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.07, 16, 1, true), mat.shade);
    shade.position.set(LAMP[0], LAMP[1], LAMP[2]);
    group.add(shade);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 10), mat.wood);
    cap.position.set(LAMP[0], LAMP[1] + 0.06, LAMP[2]);
    group.add(cap);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6), mat.shade);
    bulb.position.set(LAMP[0], LAMP[1] - 0.05, LAMP[2]);
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
  for (const z of [0.55, 1.75, 2.95, 4.15]) box(mat.wood, -2.3, STAIRWELL.x[0], 2.72, 2.8, z - 0.06, z + 0.06);

  // ---- Skirting round the hall ----
  const SK = 0.13;
  box(mat.wood, -2.3, -2.27, 0, SK, 0.1, 4.5);
  box(mat.wood, -2.3, 2.3, 0, SK, 4.47, 4.5);
  box(mat.wood, 2.27, 2.3, 0, SK, 2.5, 4.5);
  box(mat.wood, -2.3, -2.13, 0, SK, 0.1, 0.13);
  box(mat.wood, -1.0, -0.6, 0, SK, 0.1, 0.13);
  box(mat.wood, 0.81, 1.15, 0, SK, 0.1, 0.13);

  // ---- The runner, from near the door to the arch ----
  {
    const width = 1.8;
    const from = 4.45;
    const to = 0.35;
    const len = from - to;
    const geo = new THREE.PlaneGeometry(width, len);
    geo.rotateX(-Math.PI / 2);
    // One repeat of the pattern per 1.9 m along it, the whole width across.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 1.9));
    const rug = new THREE.Mesh(geo, mat.rug);
    rug.position.set(0.1, 0.006, (from + to) / 2);
    group.add(rug);
  }

  // ---- The sideboard, under the window, nearest the player ----
  {
    const x0 = -2.3;
    const x1 = -1.82;
    const z0 = 3.15;
    const z1 = 4.4;
    box(mat.wood, x0, x1 - 0.02, 0, 0.82, z0 + 0.03, z1 - 0.03, { solid: true });
    box(mat.wood, x0, x1, 0.82, 0.86, z0, z1);
    // Two doors in its front, picked out by their edges.
    for (const z of [z0 + 0.06, (z0 + z1) / 2 + 0.01]) box(mat.door, x1 - 0.025, x1 - 0.005, 0.1, 0.74, z, z + (z1 - z0) / 2 - 0.08);
    // A jug on top.
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.24, 8), mat.wood);
    jug.position.set(-2.05, 0.98, 3.55);
    group.add(jug);
  }

  // ---- The chair beside the left door, its back to the wall, clear of the doorway ----
  {
    const cx = -2.05;
    const cz = 1.45;
    const s = 0.21;
    box(mat.wood, cx - s, cx + s, 0.42, 0.46, cz - s, cz + s);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      box(mat.wood, cx + dx * (s - 0.03) - 0.02, cx + dx * (s - 0.03) + 0.02, 0, 0.42, cz + dz * (s - 0.03) - 0.02, cz + dz * (s - 0.03) + 0.02);
    }
    box(mat.wood, cx - s, cx - s + 0.04, 0.46, 0.92, cz - s, cz + s);
    colliders.push({ minX: cx - s, maxX: cx + s, minY: 0, maxY: 0.92, minZ: cz - s, maxZ: cz + s });
  }

  // ---- A picture on the right-hand wall, over the foot of the stairs ----
  {
    const x = 2.29;
    const y = 2.05;
    const z = 1.1;
    box(mat.wood, x - 0.03, x, y - 0.36, y + 0.36, z - 0.27, z + 0.27);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.62), mat.picture);
    art.rotation.y = -Math.PI / 2;
    art.position.set(x - 0.032, y, z);
    group.add(art);
  }

  // ---- Something woven, hung on the left wall between the window and the door ----
  {
    const ornament = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.72), mat.rug);
    ornament.rotation.y = Math.PI / 2;
    ornament.position.set(-2.28, 1.55, 1.25);
    group.add(ornament);
    box(mat.wood, -2.29, -2.26, 1.92, 1.95, 1.0, 1.5);
  }
}
