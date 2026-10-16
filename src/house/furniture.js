import * as THREE from 'three';

import { tint, want } from './models.js';

/**
 * The furniture kit (phase 9, 9.4.4): parametric pieces built in engine from
 * the generated surfaces, as the ship's socket was. Every piece is built in
 * its own frame, standing on the floor with its back to a wall at z = 0 and
 * its front toward +z, and placed with `place()`, which turns it to face the
 * room and returns its colliders in the house's frame.
 *
 * Every piece is modelled by Blender (pipeline/house/blender/models.py, the
 * kit there), asked for here by its parameters (models.js, `want`); what
 * stays here is where it stands, what it collides with, and its shadow.
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
  // Not a piece: the dark under one (the models harness).
  mesh.userData.notAPiece = 'shadow';
  return mesh;
}
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export { tint };

/**
 * A builder for one piece, in its own frame. `b()` adds a box; `solid` marks
 * the footprint the player collides with, which is usually the whole piece.
 */
export function piece(mat) {
  const group = new THREE.Group();
  const solids = [];
  const shadow = (x0, x1, z0, z1, strength) => {
    const s = contactShadow(x1 - x0, z1 - z0, strength);
    s.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    group.add(s);
  };
  const solid = (x0, x1, y0, y1, z0, z1) => solids.push({ x0, x1, y0, y1, z0, z1 });
  /** Blender's model of `kind` built to `params`, added in the piece's own frame. */
  const model = (kind, params, opts = {}, into = group) => {
    const m = want(null, kind, round(params), mat, opts);
    if (m) into.add(m);
    return m;
  };
  return { group, shadow, solid, solids, model };
}

/** Parameters to the millimetre, so the same piece asked for twice is one model. */
function round(params) {
  const r = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : Array.isArray(v) ? v.map(r) : v);
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, r(v)]));
}

/** A colour as the six hex digits a model's slot carries. */
const hex = (c) => c.toString(16).padStart(6, '0');

/**
 * Puts a piece in the house: its back-centre at (x, y, z), turned to `face`
 * (a yaw; 0 faces +z). Faces are quarter turns, so every collider stays a box.
 */
/**
 * How far a piece stands off the face it is placed against: clear of the
 * baked skin over that face (charts.js, 14 mm off the plaster). Placed on
 * the plaster itself, a bookcase's back and a picture's canvas were behind
 * the skin, and the skin was drawn through the piece.
 */
export const OFF_THE_WALL = 0.018;

export function place(parent, colliders, p, x, y, z, face) {
  x += Math.sin(face) * OFF_THE_WALL;
  z += Math.cos(face) * OFF_THE_WALL;
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
 * A chest of drawers on a plinth, back to the wall. Returns the piece and its
 * drawers, top first, each a group that slides out on its runners: a whole
 * drawer, front, sides, back and bottom, with the dark inside it. The first
 * drawers were only a front, and opened they hung in the air like a plank.
 */
export function chest(mat, { w = 0.9, h = 0.9, d = 0.45, drawers: count = 3 } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.model('chest-carcass', { w, h, d, drawers: count });
  p.solid(-w / 2, w / 2, 0, h, 0, d);
  const drawers = [];
  const span = h - 0.2;
  for (let i = 0; i < count; i++) {
    const top = h - 0.06 - (span / count) * i;
    const bot = top - span / count + 0.03;
    const drawer = new THREE.Group();
    p.group.add(drawer);
    p.model('drawer', { w, d, bot, top }, {}, drawer);
    drawers.push(drawer);
  }
  return { piece: p, drawers };
}

/** A table on four legs, centred on its origin rather than backed on a wall. */
export function table(mat, { w = 1.2, d = 0.7, h = 0.76, solid = true } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, -d / 2, d / 2, 0.55);
  p.model('table', { w, d, h });
  if (solid) p.solid(-w / 2, w / 2, 0, h, -d / 2, d / 2);
  return p;
}

/** A hard chair, its seat centred on the origin and its back toward -z: the hall's chair. */
export function chair(mat, { solid = true } = {}) {
  const p = piece(mat);
  const s = 0.21;
  p.shadow(-s, s, -s, s, 0.45);
  p.model('chair', {});
  if (solid) p.solid(-s, s, 0, 0.95, -s, s);
  return p;
}

/** A bed, head to the wall. `made` turns the cover down square or leaves it pulled back. */
export function bed(mat, { w = 1.4, l = 2.0, made = true, cover = 0x9aa088 } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, 0, l, 0.65);
  p.model('bed', { w, l, made, cover: hex(cover) });
  p.solid(-w / 2, w / 2, 0, 1.1, 0, l);
  return p;
}

/** A wardrobe, back to the wall: two doors and a cornice. */
export function wardrobe(mat, { w = 1.1, h = 2.0, d = 0.55 } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.model('wardrobe', { w, h, d });
  p.solid(-w / 2, w / 2, 0, h + 0.08, 0, d);
  return p;
}

/** Shelves of books, back to the wall. Spines are seeded, so every build is the same. */
export function bookcase(mat, { w = 1.0, h = 2.0, d = 0.32, seed = 7, gaps = 0.2 } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.model('bookcase', { w, h, d, seed, gaps });
  p.solid(-w / 2, w / 2, 0, h, 0, d);
  return p;
}

/** A fireplace gone cold, against a wall: the breast, a surround, a mantel and a black grate. */
export function fireplace(mat, { w = 1.5, h = 2.8, d = 0.45 } = {}) {
  const p = piece(mat);
  p.model('fireplace', { w, h, d });
  p.solid(-w / 2, w / 2, 0, h, 0, d + 0.05);
  p.solid(-0.7, 0.7, 0, 0.03, d, d + 0.5);
  return p;
}

/** A kitchen range: black iron, an oven door, two hot plates and a flue to the ceiling. */
export function range(mat, { w = 0.9, d = 0.6, ceiling = 2.8 } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.model('range', { w, d, ceiling });
  p.solid(-w / 2, w / 2, 0, 1.3, 0, d);
  return p;
}

/** Cupboards under a worktop, with a sink let into it. */
export function dresserBase(mat, { w = 1.6, d = 0.6, sink = true } = {}) {
  const p = piece(mat);
  p.shadow(-w / 2, w / 2, 0, d, 0.7);
  p.model('dresser-base', { w, d, sink });
  p.solid(-w / 2, w / 2, 0, 0.92, 0, d);
  return p;
}

/** A plate rack or shelf on a wall, with plates and jars along it. */
export function shelf(mat, { w = 1.2, y = 1.5, d = 0.22, items = 5, seed = 3 } = {}) {
  const p = piece(mat);
  p.model('shelf', { w, y, d, items, seed });
  return p;
}

/** A roll-top bath on its feet, back to the wall. */
export function bath(mat, { l = 1.7, w = 0.75 } = {}) {
  const p = piece(mat);
  p.shadow(-l / 2, l / 2, 0, w, 0.7);
  p.model('bath', { l, w });
  p.solid(-l / 2, l / 2, 0, 0.62, 0, w);
  return p;
}

/** A basin on a pedestal, with a mirror over it. `cracked` breaks the mirror. */
export function basin(mat, { cracked = true } = {}) {
  const p = piece(mat);
  p.shadow(-0.25, 0.25, 0, 0.45, 0.6);
  p.model('basin', { cracked });
  p.solid(-0.3, 0.3, 0, 0.88, 0, 0.45);
  return p;
}

/** A pendant shade on a flex from the ceiling, lit from inside. */
export function pendant(mat, { drop = 0.45, r = 0.2 } = {}) {
  const p = piece(mat);
  p.model('pendant', { drop, r });
  return p;
}

/** A table lamp: a base, a stem and a pleated shade, for a lamp that stands on something. */
export function tableLamp(mat) {
  const p = piece(mat);
  p.model('table-lamp', {});
  return p;
}

/** A door that is not a way through: a leaf on the wall, barred or simply locked for good. */
export function deadDoor(mat, { w = 0.95, h = 2.1, barred = true } = {}) {
  const p = piece(mat);
  p.model('dead-door', { w, h, barred });
  return p;
}

/** A framed picture on a wall, its back on z = 0. `empty` leaves the frame with nothing in it. */
export function picture(mat, { w = 0.45, h = 0.6, empty = false } = {}) {
  const p = piece(mat);
  p.model('picture', { w, h, frame: 0.05, ...(empty ? { empty: true } : {}) });
  return p;
}

/**
 * A rug laid flat, centred on its origin, at the size the runner's pattern
 * was cut from the painting (its swatch, 1.72 m across and 1.26 m a repeat
 * along): a narrower rug shows the middle of it, never the whole of it
 * squeezed.
 */
export function rug(mat, { w = 1.6, l = 2.2 } = {}) {
  const p = piece(mat);
  p.model('rug', { w, l });
  return p;
}

/** An armchair, its seat on the origin and its back toward -z. */
export function armchair(mat, { cover = 0x6a7058 } = {}) {
  const p = piece(mat);
  p.shadow(-0.45, 0.45, -0.45, 0.45, 0.55);
  p.model('armchair', { cover: hex(cover) });
  p.solid(-0.42, 0.42, 0, 1.05, -0.42, 0.4);
  return p;
}

/** Anything else in the kit, by its kind: a piece with only a model. */
export function thing(mat, kind, params = {}) {
  const p = piece(mat);
  p.model(kind, params);
  return p;
}
