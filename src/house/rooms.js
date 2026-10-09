import * as THREE from 'three';

import { armchair, basin, bath, bed, bookcase, chair, chest, deadDoor, dresserBase, fireplace, pendant, picture, piece, place, range, rug, shelf, table, tableLamp, tint, wardrobe } from './furniture.js';
import { SPACES, UPPER, WALLS, WALL_THICKNESS } from './layout.js';
import { worldUV } from './surfaces.js';

/**
 * Every room past the hall, dressed (phase 9, milestone 4). Furniture from
 * the kit in furniture.js, placed against the layout. Placing is where the
 * proofs bite: everything solid returns a collider, and the dead-end proof,
 * the chain harness and the monkey all walk round it. Every doorway, drawer,
 * note and the clock stays reachable by a player of the real size.
 *
 * Each room has one lamp at most (9.4.3), and its light comes from something
 * that can be seen: a shade, a lamp on a table, or a window. The child's room
 * has no lamp at all; what light it has comes in from the night.
 *
 * Walls are 0.2 m thick, so a wall on the line x = a has its faces at a ± 0.1.
 * A piece is placed with its back on a face, and turned to face the room:
 * 0 faces +z, π faces −z, π/2 faces +x and −π/2 faces −x.
 */
const N = 0; // faces +z
const S = Math.PI; // faces −z
const E = Math.PI / 2; // faces +x
const W = -Math.PI / 2; // faces −x

export function dressRooms(mat) {
  const group = new THREE.Group();
  group.name = 'rooms';
  const colliders = [];
  const lights = [];
  const put = (p, x, y, z, face) => place(group, colliders, p, x, y, z, face);
  // A lamp: a light where its fitting is.
  // Lit by the same falloff as the hall's lamp, so a room under its lamp is
  // as bright as the hall under its own (the style harness holds them to it).
  const light = (x, y, z, { colour = 0xe4d8a4, intensity = 9, range = 10 } = {}) => {
    const l = new THREE.PointLight(colour, intensity, range, 2);
    l.position.set(x, y, z);
    lights.push(l);
  };
  // A hanging lamp lights as the hall's does: a cone down from the shade,
  // so the room has a pool of light and dark corners rather than one even
  // dimness. The first lamps lit every room flat, and the style harness
  // found them short of highlights and of tones.
  const hang = (x, ceiling, z, opts = {}) => {
    const drop = opts.drop ?? 0.45;
    put(pendant(mat, { drop, r: opts.r ?? 0.18 }), x, ceiling, z, 0);
    const y = ceiling - drop - 0.06;
    const down = new THREE.SpotLight(opts.colour ?? 0xe4d8a4, (opts.intensity ?? 9) * 4, 12, opts.angle ?? 1.25, 0.85, 2);
    down.position.set(x, y, z);
    down.target.position.set(x, y - 3, z);
    lights.push(down, down.target);
  };

  // Each room's walls, in its own paint, with a wainscot or a tiled dado
  // where the room has one. All are the generated plaster, wood and tile under
  // other colours: a room is told apart by its paint as much as its furniture.
  const linings = {
    parlour: { paint: 0xfff0d4 },
    dining: { paint: 0xe4ecd0, dado: 1.0, under: mat.wood },
    kitchen: { paint: 0xe8f0dc, dado: 1.25, under: mat.tile },
    study: { paint: 0xf4e8cc, dado: 0.9, under: mat.wood },
    bedroom: { paint: 0xffe2c8 },
    child: { paint: 0xd4ecec },
    bathroom: { paint: 0xe4f0e4, dado: 1.4, under: mat.tile },
  };
  for (const s of SPACES) if (linings[s.id]) line(group, mat, s, linings[s.id]);

  parlour(mat, put, hang);
  dining(mat, put, hang, group);
  kitchen(mat, put, hang);
  study(mat, put, light);
  passage(mat, put, hang);
  landing(mat, put, hang);
  gallery(mat, put, hang);
  bedroom(mat, put, light);
  childsRoom(mat, put, light);
  bathroom(mat, put, hang);

  return { group, colliders, lights };
}

/**
 * Lines a room's walls: a skin of paint over the plaster, set a few
 * millimetres in front of each wall face inside the room, cut round every
 * door and arch and round each window's glass. Below `dado`, `under` instead
 * (panelled wood or tile), with a rail along its top.
 */
function line(group, mat, s, { paint, dado = 0, under = null }) {
  const T = WALL_THICKNESS;
  const skin = tint(mat.wall, paint);
  const add = (material, x0, x1, y0, y1, z0, z1, tile) => {
    if (x1 - x0 < 0.01 && z1 - z0 < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.004, x1 - x0), y1 - y0, Math.max(0.004, z1 - z0)), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    worldUV(m, tile);
    group.add(m);
  };
  for (const w of WALLS) {
    if (w.y !== s.y) continue;
    const lo = w.axis === 'x' ? s.x : s.z;
    const run = w.axis === 'x' ? s.z : s.x;
    const side = Math.abs(w.at - lo[0]) < 0.01 ? 1 : Math.abs(w.at - lo[1]) < 0.01 ? -1 : 0;
    if (!side) continue;
    const a = Math.max(w.from, run[0]) + T / 2;
    const b = Math.min(w.to, run[1]) - T / 2;
    if (b - a < 0.05) continue;
    const face = w.at + side * (T / 2);
    const n0 = face + side * 0.004;
    const n1 = face + side * 0.012;
    // The spans of wall between openings, and what to leave round each window.
    const cuts = (w.openings || []).map((o) => ({ ...o, a: o.center - o.width / 2 - 0.06, b: o.center + o.width / 2 + 0.06 }));
    const piece = (t0, t1, y0, y1) => {
      if (t1 - t0 < 0.02 || y1 - y0 < 0.02) return;
      const segs = [];
      if (dado > 0 && y0 < s.y + dado) segs.push([y0, Math.min(y1, s.y + dado), under, { tile: 1 }]);
      if (y1 > s.y + dado) segs.push([Math.max(y0, s.y + dado), y1, skin, { tile: 2.8, tileV: 2.8, baseY: s.y }]);
      for (const [ya, yb, m, tile] of segs) {
        if (w.axis === 'x') add(m, Math.min(n0, n1), Math.max(n0, n1), ya, yb, t0, t1, tile);
        else add(m, t0, t1, ya, yb, Math.min(n0, n1), Math.max(n0, n1), tile);
      }
    };
    let cursor = a;
    for (const c of cuts.sort((p, q) => p.a - q.a)) {
      if (c.b <= a || c.a >= b) continue;
      piece(cursor, Math.max(cursor, c.a), s.y, s.y + s.h);
      if (c.kind === 'window') {
        piece(Math.max(a, c.a), Math.min(b, c.b), s.y, s.y + c.sill - 0.05);
        piece(Math.max(a, c.a), Math.min(b, c.b), s.y + c.sill + c.height + 0.06, s.y + s.h);
      } else {
        piece(Math.max(a, c.a), Math.min(b, c.b), s.y + c.height + 0.09, s.y + s.h);
      }
      cursor = Math.min(b, c.b);
    }
    piece(cursor, b, s.y, s.y + s.h);
    // The rail on top of the dado, proud of everything under it.
    if (dado > 0) {
      const r0 = face + side * 0.004;
      const r1 = face + side * 0.04;
      let at = a;
      for (const c of cuts.sort((p, q) => p.a - q.a)) {
        if (c.b <= a || c.a >= b) continue;
        if (c.kind === 'window' && c.sill > dado + 0.05) continue;
        if (c.a > at) {
          if (w.axis === 'x') add(mat.wood, Math.min(r0, r1), Math.max(r0, r1), s.y + dado - 0.03, s.y + dado + 0.03, at, c.a, { tile: 1 });
          else add(mat.wood, at, c.a, s.y + dado - 0.03, s.y + dado + 0.03, Math.min(r0, r1), Math.max(r0, r1), { tile: 1 });
        }
        at = c.b;
      }
      if (b > at) {
        if (w.axis === 'x') add(mat.wood, Math.min(r0, r1), Math.max(r0, r1), s.y + dado - 0.03, s.y + dado + 0.03, at, b, { tile: 1 });
        else add(mat.wood, at, b, s.y + dado - 0.03, s.y + dado + 0.03, Math.min(r0, r1), Math.max(r0, r1), { tile: 1 });
      }
    }
  }
}

// ---- Ground ------------------------------------------------------------------

/** The parlour: a fireplace gone cold, a chair drawn up to it, and the table the note is on. */
function parlour(mat, put, hang) {
  put(fireplace(mat), -6.3, 0, -1.5, E);
  put(picture(mat, { w: 0.6, h: 0.45 }), -5.81, 1.75, -1.5, E);
  put(armchair(mat), -4.6, 0, -1.0, W);
  put(rug(mat, { w: 1.6, l: 2.2 }), -4.6, 0, -1.4, E);
  put(bookcase(mat, { w: 1.0, seed: 11 }), -1.5, 0, -2.9, N);
  put(picture(mat, { w: 0.35, h: 0.45 }), -5.4, 1.6, -2.9, N);
  hang(-3.65, 2.8, -1.5);
}

/** The dining room: a table laid for people who did not come, and the clock. */
function dining(mat, put, hang, group) {
  const [cx, cz] = [-3.8, -4.2];
  put(table(mat, { w: 1.6, d: 0.8, h: 0.76 }), cx, 0, cz, 0);
  // A cloth over it, hanging a little over each edge.
  const cloth = tint(mat.curtain, 0xd0d4bc);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.01, 0.86), cloth);
  top.position.set(cx, 0.765, cz);
  group.add(top);
  for (const sz of [-1, 1]) {
    const drop = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.18, 0.01), cloth);
    drop.position.set(cx, 0.68, cz + sz * 0.43);
    group.add(drop);
  }
  // Four places laid.
  const places = [[-4.2, -3.95], [-3.4, -3.95], [-4.2, -4.45], [-3.4, -4.45]];
  for (const [x, z] of places) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.015, 14), mat.enamel);
    plate.position.set(x, 0.775, z);
    group.add(plate);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.1, 8), tint(mat.mirror, 0x506058));
    glass.position.set(x + 0.13, 0.82, z + (z < cz ? 0.1 : -0.1));
    group.add(glass);
  }
  for (const x of [-4.0, -3.6]) {
    const p = piece();
    p.cyl(mat.knob, 0.05, 0.06, 0.03, 0, 0, 0, 8);
    p.cyl(mat.knob, 0.015, 0.015, 0.22, 0, 0.03, 0, 6);
    p.cyl(mat.enamel, 0.012, 0.012, 0.12, 0, 0.25, 0, 6);
    put(p, x, 0.77, cz, 0);
  }
  put(chair(mat), -4.2, 0, -3.35, S);
  put(chair(mat), -3.4, 0, -3.35, S);
  // The fourth chair is missing: its place is the way to the clock.
  put(chair(mat), -4.2, 0, -5.05, N);
  // The sideboard under the window, and what is on it.
  put(chest(mat, { w: 1.6, h: 0.9, d: 0.5, drawers: 2 }).piece, -6.3, 0, -4.3, E);
  put(shelf(mat, { w: 1.4, y: 0.9, d: 0.45, items: 4, seed: 9 }), -6.3, 0, -4.3, E);
  put(picture(mat, { w: 0.5, h: 0.35 }), -2.2, 1.6, -3.1, S);
  hang(cx, 2.8, cz, { drop: 0.7 });
}

/** The kitchen: the range, the sink under the window, a table, and the back door barred. */
function kitchen(mat, put, hang) {
  put(deadDoor(mat, { barred: true }), 2.9, 0, -5.9, N);
  put(range(mat), 4.0, 0, -5.9, N);
  put(dresserBase(mat, { w: 1.2 }), 5.2, 0, -5.9, N);
  put(shelf(mat, { w: 1.1, y: 1.5, items: 5, seed: 4 }), 6.3, 0, -4.5, W);
  put(shelf(mat, { w: 0.9, y: 1.8, items: 4, seed: 5 }), 2.1, 0, -3.1, S);
  // The table stands against the north wall, so the middle of the kitchen
  // is clear from the passage door to the drawers and the study door.
  put(table(mat, { w: 1.1, d: 0.7 }), 2.2, 0, -3.5, 0);
  put(chair(mat), 3.0, 0, -3.5, W);
  // A bucket, and a broom against the wall.
  const p = piece();
  p.cyl(mat.iron, 0.13, 0.11, 0.28, 0, 0, 0, 10);
  put(p, 6.0, 0, -5.6, 0);
  hang(3.75, 2.8, -4.5, { intensity: 3 });
}

/** The study: the desk, the books, and the table the last note is on. */
function study(mat, put, light) {
  put(chair(mat), 4.6, 0, -1.25, N);
  put(bookcase(mat, { w: 1.0, seed: 21, gaps: 0.1 }), 6.3, 0, -1.2, W);
  put(rug(mat, { w: 1.4, l: 1.6 }), 4.4, 0, -1.7, E);
  put(picture(mat, { w: 0.4, h: 0.55 }), 2.5, 1.6, -2.1, E);
  // The lamp on the desk is the study's one light.
  put(tableLamp(mat), 5.05, 0.78, -0.35, 0);
  light(5.05, 1.2, -0.45, { colour: 0xe0d098, intensity: 9, range: 8 });
}

/** The back passage: the cellar door, coats on their hooks, and a bare bulb. */
function passage(mat, put, hang) {
  put(deadDoor(mat, { barred: false }), 0.1, 0, -5.9, N);
  // Coats on hooks, on the wall opposite.
  const p = piece();
  p.b(mat.wood, -0.6, 0.6, 1.62, 1.7, 0, 0.03);
  for (const [x, c, l] of [[-0.38, 0x8a9078, 1.0], [0.0, 0xa09070, 0.8], [0.38, 0x707a68, 1.1]]) {
    p.b(tint(mat.curtain, c), x - 0.13, x + 0.13, 1.65 - l, 1.65, 0.03, 0.12);
  }
  put(p, 1.0, 0, -1.6, W);
  put(rug(mat, { w: 0.8, l: 4.6 }), 0.1, 0, -3.0, 0);
  hang(0.1, 2.8, -3.0, { r: 0.0001, drop: 0.25, intensity: 11 });
}

// ---- Upper -------------------------------------------------------------------

/** The landing: a table with a vase, a picture, and a runner. */
function landing(mat, put, hang) {
  const y = UPPER;
  put(table(mat, { w: 0.8, d: 0.4, h: 0.8 }), 0.75, y, -5.68, 0);
  const vase = piece();
  vase.cyl(tint(mat.enamel, 0x8a9a80), 0.06, 0.08, 0.26, 0, 0, 0, 10);
  put(vase, 0.75, y + 0.8, -5.68, 0);
  put(picture(mat, { w: 0.5, h: 0.65 }), 0.75, y + 1.6, -5.9, N);
  put(rug(mat, { w: 0.9, l: 2.4 }), 0.6, y, -4.5, 0);
  hang(0.75, y + 2.6, -4.45, { drop: 0.35, intensity: 11, angle: 1.4 });
}

/** The gallery beside the stairwell: pictures and a runner. */
function gallery(mat, put, hang) {
  const y = UPPER;
  put(picture(mat, { w: 0.4, h: 0.5 }), 1.15, y + 1.55, -1.0, W);
  put(picture(mat, { w: 0.4, h: 0.5, empty: true }), 1.15, y + 1.55, -2.0, W);
  put(rug(mat, { w: 0.8, l: 2.4 }), 0.15, y, -1.5, 0);
  hang(0.15, y + 2.6, -1.45, { drop: 0.3, intensity: 12, angle: 1.4 });
}

/** The parents' room: the bed, made on one side; the wardrobe; the drawers the study key is in. */
function bedroom(mat, put, light) {
  const y = UPPER;
  // The bed's head is under the window, so the room is open from the door
  // to the drawers on the north wall.
  put(bed(mat, { w: 1.3, l: 2.0, made: false, cover: 0x8a9278 }), -6.3, y, -2.1, E);
  const night = chest(mat, { w: 0.42, h: 0.6, d: 0.4, drawers: 2 });
  put(night.piece, -6.3, y, -1.15, E);
  put(tableLamp(mat), -6.1, y + 0.6, -1.15, 0);
  light(-6.0, y + 1.05, -1.15, { colour: 0xe0d098, intensity: 22, range: 10 });
  put(wardrobe(mat, { w: 0.85 }), -1.0, y, -2.45, W);
  put(rug(mat, { w: 1.2, l: 1.8 }), -3.4, y, -1.9, E);
  put(picture(mat, { w: 0.55, h: 0.4 }), -3.0, y + 1.7, -0.1, S);
}

/** The child's room: a small bed, made, waiting. A toy box, a rocking horse, an empty frame. No lamp. */
function childsRoom(mat, put, light) {
  const y = UPPER;
  put(bed(mat, { w: 0.9, l: 1.6, made: true, cover: 0xa0a888 }), -6.3, y, -3.9, E);
  // A rocking horse, from boxes.
  const h = piece();
  const paint = tint(mat.door, 0xb8b098);
  h.shadow(-0.4, 0.4, -0.15, 0.15, 0.5);
  for (const sz of [-1, 1]) {
    const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.02, 4, 20, 0.9), mat.wood);
    rocker.rotation.z = Math.PI / 2 - 0.45 + Math.PI;
    rocker.position.set(0, 0.92, sz * 0.12);
    h.group.add(rocker);
  }
  for (const [x, z] of [[-0.25, -0.1], [0.25, -0.1], [-0.25, 0.1], [0.25, 0.1]]) h.b(paint, x - 0.025, x + 0.025, 0.08, 0.42, z - 0.025, z + 0.025);
  h.b(paint, -0.32, 0.32, 0.42, 0.6, -0.1, 0.1);
  h.b(paint, 0.24, 0.36, 0.55, 0.85, -0.07, 0.07);
  h.b(paint, 0.3, 0.5, 0.75, 0.86, -0.06, 0.06);
  h.solid(-0.45, 0.5, 0, 0.86, -0.15, 0.15);
  put(h, -2.6, y, -5.35, 0);
  put(picture(mat, { w: 0.35, h: 0.45, empty: true }), -1.0, y + 1.5, -3.6, W);
  put(rug(mat, { w: 1.4, l: 1.4 }), -3.8, y, -4.4, 0);
  // The night through the window is the only light.
  light(-3.0, y + 1.6, -5.4, { colour: 0x7088b0, intensity: 13, range: 9 });
}

/** The bathroom: tile, the bath under the window, a cracked mirror over the basin. */
function bathroom(mat, put, hang) {
  const y = UPPER;
  put(bath(mat), 4.6, y, -5.9, N);
  put(basin(mat, { cracked: true }), 4.6, y, -3.0, S);
  // A towel on a rail.
  const p = piece();
  p.b(mat.knob, -0.3, 0.3, 1.2, 1.22, 0.05, 0.07);
  p.b(tint(mat.curtain, 0xb8bca8), -0.22, 0.22, 0.8, 1.22, 0.07, 0.09);
  put(p, 2.5, y, -3.6, E);
  hang(4.4, y + 2.6, -4.45, { drop: 0.3, intensity: 6, angle: 1.4 });
}
