import * as THREE from 'three';

import { SPACES, STAIRWELL, WALLS, WALL_THICKNESS } from './layout.js';
import { dressRooms } from './rooms.js';
import { ARCHITRAVE, SKIRTING, SLIM, folds, placeRun } from './joinery.js';
import { tagged } from './inventory.js';
import { place as model } from './models.js';
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
export function dressHouse(mat, models = {}) {
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
  hall(box, group, mat, colliders, lights, models);
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
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind === 'window') continue;
      // The front door has a deep lining and a slim stop round it, not a
      // broad architrave: the painting's door fills its frame.
      const profile = o.casing === 'slim' ? SLIM : ARCHITRAVE;
      const W = profile.at(-1)[0];
      const a = o.center - o.width / 2;
      const b = o.center + o.width / 2;
      const top = w.y + o.height;
      const jambTop = o.kind === 'door' ? top + W : top - o.width / 2;
      const n0 = group.children.length;
      for (const side of [-1, 1]) {
        const face = w.at + side * (T / 2);
        // In the wall's own terms: t along it, n out of this face.
        const at = (t, y) => (w.axis === 'x' ? [face, y, t] : [t, y, face]);
        const along = w.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
        const out = w.axis === 'x' ? [side, 0, 0] : [0, 0, side];
        const back = along.map((v) => -v);
        // The profile's back band is at its start: each run starts at the
        // frame's outer edge and runs in toward the opening.
        group.add(placeRun(mat.wood, profile, jambTop - w.y, at(a - W, w.y), [0, 1, 0], along, out));
        group.add(placeRun(mat.wood, profile, jambTop - w.y, at(b + W, w.y), [0, 1, 0], back, out));
        if (o.kind === 'door') group.add(placeRun(mat.wood, profile, b - a + 2 * W, at(a - W, top + W), along, [0, -1, 0], out));
      }
      for (let i = n0; i < group.children.length; i++) group.children[i].userData.inventory = `casing:${o.id}`;
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
      // The soffit takes its plaster along the curve, at its real size:
      // across the wall's thickness, and round the arch by arc length.
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(n.getZ(i)) > 0.5) continue;
        const x = p.getX(i);
        const y = p.getY(i);
        if (y < 1e-4 || Math.hypot(x, y) > r + 1e-3) continue;
        uv.setXY(i, (p.getZ(i) + T / 2) / 2.8, (r * Math.atan2(y, x)) / 2.8);
      }
      mesh.userData.inventory = `arch:${o.id}`;
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
      const n0 = group.children.length;
      group.add(pane);
      // Frame, sill and glazing bars.
      put(t0 - 0.06, t1 + 0.06, y0 - 0.05, y0, -0.02, 0.05);
      put(t0 - 0.06, t1 + 0.06, y1, y1 + 0.06, -0.02, 0.03);
      put(t0 - 0.06, t0, y0, y1, -0.02, 0.03);
      put(t1, t1 + 0.06, y0, y1, -0.02, 0.03);
      put(o.center - 0.02, o.center + 0.02, y0, y1, -T / 2 - 0.02, -T / 2 + 0.02);
      put(t0, t1, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, -T / 2 - 0.02, -T / 2 + 0.02);
      for (let i = n0; i < group.children.length; i++) group.children[i].userData.inventory = `window:${o.id}`;
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
        m.userData.inventory = `curtain:${o.id}`;
        group.add(m);
      };
      // The hall's window has only a valance, a pale cloth hung high over its
      // top, as the painting's has.
      if (o.valance) {
        cloth(t0 - 0.02, t1 + 0.08, y1 - 0.15, y1 + 0.4, 0.06);
        continue;
      }
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
function hall(box, group, mat, colliders, lights, models) {
  // ---- The one lamp: Blender's enamel shade (models.py) on a cord ----
  const LAMP = HALL_LAMP.at;
  tagged(group, 'lamp', () => {
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2.8 - LAMP[1] - 0.2, 0.012), mat.iron);
    cord.position.set(LAMP[0], (2.8 + LAMP[1] + 0.2) / 2, LAMP[2]);
    worldUV(cord, { tile: 1 });
    group.add(cord);
    const shade = model(models, 'lamp', mat, { tag: 'lamp', pos: LAMP });
    if (shade) group.add(shade);
    const { down: d, glow: gl, colour } = HALL_LAMP;
    const down = new THREE.SpotLight(colour, d.intensity, d.distance, d.angle, d.penumbra, d.decay);
    down.position.set(LAMP[0], LAMP[1] - d.drop, LAMP[2]);
    down.target.position.set(LAMP[0], 0, LAMP[2]);
    lights.push(down, down.target);
    const glow = new THREE.PointLight(colour, gl.intensity, gl.distance, gl.decay);
    glow.position.set(LAMP[0], LAMP[1] - gl.drop, LAMP[2]);
    lights.push(glow);
  });

  // ---- Heavy joists across the ceiling, as the painting's: Blender's, hewn,
  // their lower arrises chamfered (models.py). Short ones stop at the stair slot ----
  tagged(group, 'beams', () => {
    for (const z of [0.45, 1.05, 1.65, 2.25, 2.85, 3.45, 4.05]) {
      const long = z > STAIRWELL.z[1];
      const beam = model(models, long ? 'joist' : 'joist-short', mat, { tag: 'beams', pos: [long ? (-2.57 + 2.3) / 2 : (-2.57 + STAIRWELL.x[0]) / 2, 2.8, z] });
      if (beam) group.add(beam);
    }
  });

  // ---- Skirting round the hall: a moulded board, standing off each wall ----
  const skirt = (from, to, out) => {
    const along = [to[0] - from[0], 0, to[2] - from[2]];
    const len = Math.hypot(along[0], along[2]);
    group.add(placeRun(mat.wood, SKIRTING, len, from, along.map((v) => v / len), [0, 1, 0], out));
  };
  tagged(group, 'skirting', () => {
    skirt([-2.57, 0, 0.1], [-2.57, 0, 4.5], [1, 0, 0]);
    skirt([-2.57, 0, 4.5], [2.3, 0, 4.5], [0, 0, -1]);
    skirt([2.3, 0, 1.92], [2.3, 0, 4.5], [-1, 0, 0]);
    skirt([-2.57, 0, 0.1], [-1.92, 0, 0.1], [0, 0, 1]);
    skirt([-0.8, 0, 0.1], [-0.38, 0, 0.1], [0, 0, 1]);
    skirt([0.995, 0, 0.1], [1.2, 0, 0.1], [0, 0, 1]);
  });

  // ---- The runner, from near the door to the arch ----
  tagged(group, 'rug', () => {
    const width = 1.72;
    const from = 4.45;
    const to = 0.74;
    const len = from - to;
    const geo = new THREE.PlaneGeometry(width, len);
    geo.rotateX(-Math.PI / 2);
    // As wide as the runner the painting shows, and one repeat of its pattern
    // every 1.26 m along it: the patch it was cut from (model/hall.json).
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 1.26));
    const rug = new THREE.Mesh(geo, mat.hallRug ?? mat.rug);
    rug.position.set(0.3, 0.006, (from + to) / 2);
    group.add(rug);
  });

  // ---- The painting's left side, from the window toward the viewer: the
  // low cabinet with a clock and a vase on it, and nearer, a chest under a
  // white cloth. All Blender's (models.py), each with its front to the room ----
  const put = (id, pos, turn = 0, tag = id) => {
    const m = model(models, id, mat, { tag, pos, turn });
    if (m) group.add(m);
    return m;
  };
  // The cabinet stands under the window, as deep as the painting shows its
  // front standing off the wall; the clock at its near end, the vase behind.
  put('cabinet', [(-2.57 - 1.92) / 2, 0, 1.2], Math.PI / 2);
  colliders.push({ minX: -2.57, maxX: -1.92, minY: 0, maxY: 0.74, minZ: 0.9, maxZ: 1.5 });
  put('clock', [-2.24, 0.74, 1.4], Math.PI / 2);
  put('vase', [-2.45, 0.74, 1.2]);
  // The chest stands end-on to the wall, nearer the viewer, its cloth over it.
  put('chest', [-2.16, 0, 1.85]);
  colliders.push({ minX: -2.57, maxX: -1.74, minY: 0, maxY: 0.55, minZ: 1.6, maxZ: 2.1 });

  // ---- A small hard chair against the back wall, under the bag ----
  put('chair', [-2.05, 0, 0.36]);
  colliders.push({ minX: -2.26, maxX: -1.84, minY: 0, maxY: 0.92, minZ: 0.15, maxZ: 0.57 });

  // ---- A picture on the right-hand wall, over the foot of the stairs ----
  tagged(group, 'picture', () => {
    const x = 2.29;
    const y = 1.98;
    const z = 1.05;
    box(mat.wood, x - 0.03, x, y - 0.38, y + 0.38, z - 0.19, z + 0.19);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.64), mat.picture);
    art.rotation.y = -Math.PI / 2;
    art.position.set(x - 0.032, y, z);
    group.add(art);
  });

  // ---- The woven bag on its crossed straps, hung on the back wall; a bell
  // push by the parlour door; and a rag dropped on the floor by the arch ----
  put('bag', [-2.25, 1.45, 0.1 + 0.075]);
  put('fixture', [-0.55, 1.45, 0.1], 0, 'wall-fixture');
  put('rag', [0.87, 0, 0.38], 0.6, 'floor-thing');
}
