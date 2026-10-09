import * as THREE from 'three';

import { worldUV } from './surfaces.js';

/**
 * The furniture kit (phase 9, 9.4.4): parametric pieces built in engine from
 * the generated surfaces, as the ship's socket was. Every piece is built in
 * its own frame, standing on the floor with its back to a wall at z = 0 and
 * its front toward +z, and placed with `place()`, which turns it to face the
 * room and returns its colliders in the house's frame.
 *
 * Two rules came from the owner's look at milestone 3, when the first drawers
 * read as boxes hanging in the air. A piece stands on legs or a plinth that
 * meet the floor, and it casts a soft shadow onto the floor under it, because
 * nothing else in a dark room says where a thing touches the ground.
 */

/** A soft dark patch on the floor, darkest in the middle. */
export function contactShadow(w, d, strength = 0.6) {
  const geo = new THREE.PlaneGeometry(w + 0.3, d + 0.3, 4, 4);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.abs(pos.getX(i)) / ((w + 0.3) / 2);
    const v = Math.abs(pos.getZ(i)) / ((d + 0.3) / 2);
    const edge = Math.max(u, v);
    colours[i * 4 + 3] = edge >= 0.999 ? 0 : strength * (1 - edge * edge * 0.55);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  const mesh = new THREE.Mesh(geo, SHADOW);
  mesh.renderOrder = -1;
  return mesh;
}
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** Colour variants of a material, for things that are the same stuff in other paint. */
const tinted = new Map();
export function tint(material, hex) {
  const key = `${material.uuid}:${hex}`;
  if (!tinted.has(key)) {
    const m = material.clone();
    m.color = new THREE.Color(hex);
    tinted.set(key, m);
  }
  return tinted.get(key);
}

/**
 * A builder for one piece, in its own frame. `b()` adds a box; `solid` marks
 * the footprint the player collides with, which is usually the whole piece.
 */
export function piece() {
  const group = new THREE.Group();
  const solids = [];
  const b = (material, x0, x1, y0, y1, z0, z1, { tile = 1, solid = false } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    worldUV(mesh, { tile });
    group.add(mesh);
    if (solid) solids.push({ x0, x1, y0, y1, z0, z1 });
    return mesh;
  };
  const cyl = (material, r0, r1, h, x, y, z, seg = 10) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), material);
    mesh.position.set(x, y + h / 2, z);
    group.add(mesh);
    return mesh;
  };
  const shadow = (x0, x1, z0, z1, strength) => {
    const s = contactShadow(x1 - x0, z1 - z0, strength);
    s.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    group.add(s);
  };
  const solid = (x0, x1, y0, y1, z0, z1) => solids.push({ x0, x1, y0, y1, z0, z1 });
  return { group, b, cyl, shadow, solid, solids };
}

/**
 * Puts a piece in the house: its back-centre at (x, y, z), turned to `face`
 * (a yaw; 0 faces +z). Faces are quarter turns, so every collider stays a box.
 */
export function place(parent, colliders, p, x, y, z, face) {
  p.group.position.set(x, y, z);
  p.group.rotation.y = face;
  parent.add(p.group);
  const c = Math.round(Math.cos(face));
  const s = Math.round(Math.sin(face));
  for (const k of p.solids) {
    const xs = [];
    const zs = [];
    for (const lx of [k.x0, k.x1]) {
      for (const lz of [k.z0, k.z1]) {
        xs.push(x + lx * c + lz * s);
        zs.push(z - lx * s + lz * c);
      }
    }
    colliders.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: y + k.y0, maxY: y + k.y1, minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  }
  return p.group;
}

// ---- Pieces --------------------------------------------------------------------

/**
 * A chest of drawers on a plinth, back to the wall. Returns the piece and
 * its drawer fronts, top first, so a container can slide one.
 */
export function chest(mat, { w = 0.9, h = 0.9, d = 0.45, drawers = 3 } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.b(mat.wood, -w / 2 + 0.03, w / 2 - 0.03, 0, 0.08, 0.02, d - 0.03);
  p.b(mat.wood, -w / 2, w / 2, 0.08, h - 0.03, 0, d - 0.02);
  p.b(mat.wood, -w / 2 - 0.02, w / 2 + 0.02, h - 0.03, h, 0, d + 0.02);
  p.solid(-w / 2, w / 2, 0, h, 0, d);
  const fronts = [];
  const span = h - 0.2;
  for (let i = 0; i < drawers; i++) {
    const top = h - 0.06 - (span / drawers) * i;
    const bot = top - span / drawers + 0.03;
    const front = p.b(tint(mat.door, 0xd8ccb8), -w / 2 + 0.05, w / 2 - 0.05, bot, top, d - 0.02, d + 0.005);
    for (const kx of [-w / 4, w / 4]) p.b(mat.knob, kx - 0.02, kx + 0.02, (top + bot) / 2 - 0.015, (top + bot) / 2 + 0.015, d + 0.005, d + 0.03);
    fronts.push(front);
  }
  return { piece: p, fronts };
}

/** A table on four legs, centred on its origin rather than backed on a wall. */
export function table(mat, { w = 1.2, d = 0.7, h = 0.76, material = mat.wood, solid = true } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, -d / 2, d / 2, 0.55);
  p.b(material, -w / 2, w / 2, h - 0.04, h, -d / 2, d / 2);
  p.b(material, -w / 2 + 0.05, w / 2 - 0.05, h - 0.13, h - 0.04, -d / 2 + 0.05, d / 2 - 0.05);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (w / 2 - 0.08);
    const z = sz * (d / 2 - 0.08);
    p.b(material, x - 0.03, x + 0.03, 0, h - 0.04, z - 0.03, z + 0.03);
  }
  if (solid) p.solid(-w / 2, w / 2, 0, h, -d / 2, d / 2);
  return p;
}

/** A hard chair, its seat centred on the origin and its back toward -z. */
export function chair(mat, { solid = true, material = mat.wood } = {}) {
  const p = piece();
  const s = 0.21;
  p.shadow(-s, s, -s, s, 0.45);
  p.b(material, -s, s, 0.43, 0.47, -s, s);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = dx * (s - 0.03);
    const z = dz * (s - 0.03);
    p.b(material, x - 0.02, x + 0.02, 0, 0.43, z - 0.02, z + 0.02);
  }
  p.b(material, -s, -s + 0.04, 0.47, 0.95, -s, -s + 0.04);
  p.b(material, s - 0.04, s, 0.47, 0.95, -s, -s + 0.04);
  p.b(material, -s, s, 0.8, 0.92, -s, -s + 0.03);
  if (solid) p.solid(-s, s, 0, 0.95, -s, s);
  return p;
}

/** A bed, head to the wall. `made` turns the cover down square or leaves it pulled back. */
export function bed(mat, { w = 1.4, l = 2.0, made = true, cover = 0x9aa088 } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, 0, l, 0.65);
  p.b(mat.wood, -w / 2, w / 2, 0, 1.1, 0, 0.06);
  p.b(mat.wood, -w / 2, w / 2, 0, 0.55, l - 0.06, l);
  p.b(mat.wood, -w / 2, -w / 2 + 0.05, 0.15, 0.38, 0.06, l - 0.06);
  p.b(mat.wood, w / 2 - 0.05, w / 2, 0.15, 0.38, 0.06, l - 0.06);
  p.b(tint(mat.curtain, 0xc8ccb4), -w / 2 + 0.04, w / 2 - 0.04, 0.3, 0.5, 0.06, l - 0.06);
  for (const x of w > 1 ? [-w / 4, w / 4] : [0]) p.b(tint(mat.curtain, 0xe0e2d0), x - 0.25, x + 0.25, 0.5, 0.6, 0.12, 0.45);
  const fold = made ? 0.55 : 1.2;
  p.b(tint(mat.curtain, cover), -w / 2 + 0.02, w / 2 - 0.02, 0.5, 0.56, fold, l - 0.04);
  if (made) p.b(tint(mat.curtain, cover), -w / 2 + 0.02, w / 2 - 0.02, 0.2, 0.56, l - 0.06, l - 0.02);
  p.solid(-w / 2, w / 2, 0, 1.1, 0, l);
  return p;
}

/** A wardrobe, back to the wall: two doors and a cornice. */
export function wardrobe(mat, { w = 1.1, h = 2.0, d = 0.55 } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.b(mat.wood, -w / 2, w / 2, 0, h, 0, d - 0.02);
  p.b(mat.wood, -w / 2 - 0.03, w / 2 + 0.03, h, h + 0.08, -0.01, d + 0.03);
  for (const sx of [-1, 1]) {
    p.b(tint(mat.door, 0xc8bca8), sx > 0 ? 0.01 : -w / 2 + 0.04, sx > 0 ? w / 2 - 0.04 : -0.01, 0.1, h - 0.06, d - 0.02, d + 0.005);
    p.b(mat.knob, sx * 0.05 - 0.015, sx * 0.05 + 0.015, h * 0.5, h * 0.5 + 0.06, d + 0.005, d + 0.03);
  }
  p.solid(-w / 2, w / 2, 0, h + 0.08, 0, d);
  return p;
}

/** Shelves of books, back to the wall. Spines are seeded, so every build is the same. */
export function bookcase(mat, { w = 1.0, h = 2.0, d = 0.32, seed = 7, gaps = 0.2 } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.b(mat.wood, -w / 2, -w / 2 + 0.04, 0, h, 0, d);
  p.b(mat.wood, w / 2 - 0.04, w / 2, 0, h, 0, d);
  p.b(mat.wood, -w / 2, w / 2, 0, 0.08, 0, d);
  p.b(mat.wood, -w / 2, w / 2, h - 0.04, h, 0, d + 0.02);
  p.b(tint(mat.wood, 0x605848), -w / 2 + 0.04, w / 2 - 0.04, 0.08, h - 0.04, 0, 0.02);
  const shelves = 4;
  const spines = [0x6a4a38, 0x3a4a38, 0x7a6a50, 0x4a3a40, 0x8a7a5a, 0x50503a];
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < shelves; i++) {
    const y = 0.08 + ((h - 0.12) / shelves) * i;
    p.b(mat.wood, -w / 2 + 0.04, w / 2 - 0.04, y, y + 0.025, 0, d);
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.1) {
      const bw = 0.025 + rnd() * 0.035;
      if (rnd() < gaps) {
        x += bw * 2;
        continue;
      }
      const bh = 0.2 + rnd() * 0.14;
      const lean = rnd() < 0.08;
      p.b(tint(mat.paper, spines[Math.floor(rnd() * spines.length)]), x, x + bw, y + 0.025, y + 0.025 + (lean ? bh * 0.8 : bh), 0.04, d - 0.03 - rnd() * 0.04);
      x += bw + 0.003;
    }
  }
  p.solid(-w / 2, w / 2, 0, h, 0, d);
  return p;
}

/** A fireplace gone cold, against a wall: the breast, a surround, a mantel and a black grate. */
export function fireplace(mat, { w = 1.5, h = 2.8, d = 0.45 } = {}) {
  const p = piece();
  p.b(mat.wall, -w / 2, w / 2, 0, h, 0, d, { tile: 2.8 });
  p.b(mat.black, -0.4, 0.4, 0.05, 0.85, d - 0.3, d + 0.002);
  p.b(mat.wood, -0.62, -0.4, 0, 1.05, d, d + 0.05);
  p.b(mat.wood, 0.4, 0.62, 0, 1.05, d, d + 0.05);
  p.b(mat.wood, -0.62, 0.62, 0.85, 1.05, d, d + 0.05);
  p.b(mat.wood, -0.72, 0.72, 1.05, 1.11, d - 0.02, d + 0.14);
  p.b(tint(mat.ceiling, 0x8a8a7a), -0.7, 0.7, 0, 0.03, d, d + 0.5);
  // The grate, and what is left in it.
  p.b(mat.iron, -0.25, 0.25, 0.05, 0.22, d - 0.2, d - 0.05);
  p.b(tint(mat.ceiling, 0x5a5a50), -0.2, 0.2, 0.22, 0.27, d - 0.18, d - 0.07);
  p.solid(-w / 2, w / 2, 0, h, 0, d + 0.05);
  p.solid(-0.7, 0.7, 0, 0.03, d, d + 0.5);
  return p;
}

/** A kitchen range: black iron, an oven door, two hot plates and a flue to the ceiling. */
export function range(mat, { w = 0.9, d = 0.6, ceiling = 2.8 } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.b(mat.iron, -w / 2, w / 2, 0.06, 0.88, 0, d);
  p.b(mat.iron, -w / 2 + 0.03, w / 2 - 0.03, 0, 0.06, 0.03, d - 0.03);
  p.b(tint(mat.iron, 0x6a6a60), -w / 2 + 0.06, -0.03, 0.15, 0.7, d, d + 0.02);
  p.b(tint(mat.iron, 0x6a6a60), 0.03, w / 2 - 0.06, 0.15, 0.7, d, d + 0.02);
  for (const x of [-w / 4, w / 4]) p.cyl(tint(mat.iron, 0x3a3a34), 0.12, 0.12, 0.02, x, 0.88, d / 2, 12);
  p.b(mat.iron, -w / 2, w / 2, 0.88, 1.3, 0, 0.05);
  p.cyl(mat.iron, 0.07, 0.07, ceiling - 1.0, 0, 0.88, 0.15, 10);
  // A kettle left on the plate.
  p.cyl(tint(mat.iron, 0x7a7a6a), 0.08, 0.1, 0.16, -w / 4, 0.9, d / 2, 10);
  p.solid(-w / 2, w / 2, 0, 1.3, 0, d);
  return p;
}

/** Cupboards under a worktop, with a sink let into it. */
export function dresserBase(mat, { w = 1.6, d = 0.6, sink = true } = {}) {
  const p = piece();
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.b(mat.wood, -w / 2, w / 2, 0.08, 0.86, 0, d - 0.03);
  p.b(mat.black, -w / 2 + 0.03, w / 2 - 0.03, 0, 0.08, 0, d - 0.06);
  p.b(tint(mat.wood, 0xb0a890), -w / 2 - 0.02, w / 2 + 0.02, 0.86, 0.9, 0, d + 0.02);
  const doors = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i < doors; i++) {
    const x0 = -w / 2 + 0.04 + ((w - 0.08) / doors) * i;
    const x1 = x0 + (w - 0.08) / doors - 0.02;
    p.b(tint(mat.door, 0xc8bca8), x0, x1, 0.12, 0.8, d - 0.03, d - 0.01);
    p.b(mat.knob, (x0 + x1) / 2 - 0.015, (x0 + x1) / 2 + 0.015, 0.68, 0.72, d - 0.01, d + 0.015);
  }
  if (sink) {
    p.b(mat.enamel, -0.3, 0.3, 0.7, 0.92, 0.08, d - 0.06);
    p.b(mat.black, -0.25, 0.25, 0.75, 0.925, 0.12, d - 0.1);
    p.cyl(mat.iron, 0.012, 0.012, 0.25, 0, 0.9, 0.06, 6);
  }
  p.solid(-w / 2, w / 2, 0, 0.92, 0, d);
  return p;
}

/** A plate rack or shelf on a wall, with plates and jars along it. */
export function shelf(mat, { w = 1.2, y = 1.5, d = 0.22, items = 5, seed = 3 } = {}) {
  const p = piece();
  p.b(mat.wood, -w / 2, w / 2, y, y + 0.03, 0, d);
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) p.b(mat.wood, x - 0.015, x + 0.015, y - 0.18, y, 0, d * 0.7);
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < items; i++) {
    const x = -w / 2 + 0.12 + ((w - 0.24) / Math.max(1, items - 1)) * i;
    if (rnd() < 0.5) p.cyl(mat.enamel, 0.05, 0.05, 0.12 + rnd() * 0.08, x, y + 0.03, d / 2, 8);
    else {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 14), mat.enamel);
      plate.rotation.x = Math.PI / 2 - 0.15;
      plate.position.set(x, y + 0.14, 0.05);
      p.group.add(plate);
    }
  }
  return p;
}

/** A roll-top bath on a plinth, back to the wall. */
export function bath(mat, { l = 1.7, w = 0.75 } = {}) {
  const p = piece();
  p.shadow(-l / 2, l / 2, 0, w, 0.7);
  p.b(mat.enamel, -l / 2, l / 2, 0.12, 0.62, 0.02, w);
  p.b(mat.iron, -l / 2 + 0.06, l / 2 - 0.06, 0, 0.12, 0.08, w - 0.06);
  p.b(tint(mat.enamel, 0x46524a), -l / 2 + 0.07, l / 2 - 0.07, 0.3, 0.625, 0.09, w - 0.07);
  p.b(tint(mat.enamel, 0x5a6a5a), -l / 2 + 0.07, l / 2 - 0.07, 0.4, 0.42, 0.09, w - 0.07);
  p.cyl(mat.iron, 0.015, 0.015, 0.3, -l / 2 + 0.12, 0.62, 0.06, 6);
  p.solid(-l / 2, l / 2, 0, 0.62, 0, w);
  return p;
}

/** A basin on a pedestal, with a mirror over it. `cracked` breaks the mirror. */
export function basin(mat, { cracked = true } = {}) {
  const p = piece();
  p.shadow(-0.25, 0.25, 0, 0.45, 0.6);
  p.b(mat.enamel, -0.1, 0.1, 0, 0.78, 0.12, 0.3);
  p.b(mat.enamel, -0.3, 0.3, 0.78, 0.88, 0, 0.45);
  p.b(tint(mat.enamel, 0x48544a), -0.24, 0.24, 0.8, 0.885, 0.06, 0.39);
  p.b(mat.wood, -0.33, 0.33, 1.15, 1.85, 0, 0.03);
  const glass = p.b(mat.mirror, -0.29, 0.29, 1.19, 1.81, 0.03, 0.035);
  if (cracked) {
    const crack = tint(mat.black, 0x101410);
    const lines = [[-0.05, 1.62, 0.22, 0.6], [0.04, 1.58, 0.16, -0.9], [-0.02, 1.48, 0.25, 2.2], [0.06, 1.66, 0.12, 0.2], [-0.08, 1.55, 0.2, -2.5]];
    for (const [x, y, len, a] of lines) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.008, 0.004), crack);
      m.position.set(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, 0.038);
      m.rotation.z = a;
      p.group.add(m);
    }
  }
  p.solid(-0.3, 0.3, 0, 0.88, 0, 0.45);
  glass.userData.mirror = true;
  return p;
}

/** A pendant shade on a flex from the ceiling, lit from inside. */
export function pendant(mat, { drop = 0.45, r = 0.2 } = {}) {
  const p = piece();
  const cord = new THREE.Mesh(new THREE.BoxGeometry(0.012, drop, 0.012), mat.wood);
  cord.position.set(0, -drop / 2, 0);
  p.group.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.38, 14, 1, true), mat.shade);
  shade.position.set(0, -drop, 0);
  p.group.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 5), mat.shade);
  bulb.position.set(0, -drop - 0.04, 0);
  p.group.add(bulb);
  return p;
}

/** A table lamp: a base, a stem and a pleated shade, for a lamp that stands on something. */
export function tableLamp(mat) {
  const p = piece();
  p.cyl(mat.iron, 0.07, 0.08, 0.04, 0, 0, 0, 10);
  p.cyl(mat.iron, 0.012, 0.012, 0.3, 0, 0.04, 0, 6);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.18, 12, 1, true), mat.lampshade);
  shade.position.set(0, 0.38, 0);
  p.group.add(shade);
  return p;
}

/** A door that is not a way through: a leaf on the wall, barred or simply locked for good. */
export function deadDoor(mat, { w = 0.95, h = 2.1, barred = true } = {}) {
  const p = piece();
  p.b(mat.wood, -w / 2 - 0.09, -w / 2, 0, h + 0.09, 0, 0.05);
  p.b(mat.wood, w / 2, w / 2 + 0.09, 0, h + 0.09, 0, 0.05);
  p.b(mat.wood, -w / 2 - 0.09, w / 2 + 0.09, h, h + 0.09, 0, 0.05);
  p.b(mat.door, -w / 2, w / 2, 0, h, 0, 0.04);
  p.b(mat.knob, w / 2 - 0.12, w / 2 - 0.07, 1.0, 1.05, 0.04, 0.09);
  if (barred) {
    for (const [y, a] of [[0.7, 0.08], [1.45, -0.06]]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.14, 0.04), mat.wood);
      plank.position.set(0, y, 0.08);
      plank.rotation.z = a;
      worldUV(plank, { tile: 1 });
      p.group.add(plank);
    }
  }
  return p;
}

/** A framed picture on a wall, its back on z = 0. `empty` leaves the frame with nothing in it. */
export function picture(mat, { w = 0.45, h = 0.6, empty = false } = {}) {
  const p = piece();
  p.b(mat.wood, -w / 2 - 0.05, w / 2 + 0.05, -h / 2 - 0.05, h / 2 + 0.05, 0, 0.03);
  const inner = empty ? tint(mat.wall, 0x7a8a6a) : mat.picture;
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), inner);
  art.position.set(0, 0, 0.032);
  p.group.add(art);
  return p;
}

/** A small rug laid flat, centred on its origin. */
export function rug(mat, { w = 1.6, l = 2.2, repeat = 1.9 } = {}) {
  const p = piece();
  const geo = new THREE.PlaneGeometry(w, l);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (l / repeat));
  const m = new THREE.Mesh(geo, mat.rug);
  m.position.y = 0.006;
  p.group.add(m);
  return p;
}

/** An armchair, its seat on the origin and its back toward -z. */
export function armchair(mat, { cover = 0x6a7058 } = {}) {
  const p = piece();
  const cloth = tint(mat.curtain, cover);
  p.shadow(-0.45, 0.45, -0.45, 0.45, 0.55);
  p.b(cloth, -0.42, 0.42, 0.1, 0.45, -0.38, 0.4);
  p.b(cloth, -0.42, 0.42, 0.45, 1.05, -0.42, -0.24);
  for (const sx of [-1, 1]) p.b(cloth, sx * 0.42 - 0.12, sx * 0.42, 0.45, 0.68, -0.38, 0.4);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.b(mat.wood, dx * 0.36 - 0.025, dx * 0.36 + 0.025, 0, 0.1, dz * 0.33 - 0.025, dz * 0.33 + 0.025);
  p.solid(-0.42, 0.42, 0, 1.05, -0.42, 0.4);
  return p;
}
