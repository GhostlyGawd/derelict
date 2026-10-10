import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { worldUV } from './surfaces.js';

/**
 * Joinery (9.3, the hall modelled to the owner's painting): the shapes a
 * carpenter makes, built as geometry rather than painted on a box. A door is
 * stiles and rails round raised panels in a moulded edge, a frame is a board
 * with a back band, a stair is a nosed tread over a riser, a baluster and a
 * newel are posts with their edges taken off, and a shade is turned. The
 * painting's dark is mostly the shadow in these: a flat box has nowhere to
 * keep it.
 *
 * Every builder works in its own frame and returns meshes in a group. Edges
 * are softened with a small radius, so a lamp catches them as it would worn
 * wood. Nothing here collides; the colliders stay the boxes in layout.js.
 */

/** A box with its edges taken off, from (x0, y0, z0) to (x1, y1, z1). */
export function soft(material, x0, x1, y0, y1, z0, z1, radius = 0.006, tile = 1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const geo = r > 0.0005 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  worldUV(mesh, { tile });
  return mesh;
}

/**
 * A panelled door leaf, centred on x across its width `w`, standing from y = 0
 * to `h`, its faces at z = ±t/2. `rows` lists the panels from the bottom, as
 * fractions of the height between the rails: the painting's doors have two
 * tall panels, the lower a little shorter. A row may be `glass` (glazing bars
 * over the night) or `boards` (upright boards in the frame, as the front door's
 * lower half is).
 */
export function panelDoor(mat, { w, h, t = 0.045, rows = [{ f: 0.42 }, { f: 0.58 }], stile = 0.11, top = 0.11, mid = 0.15, bottom = 0.2, night = null, panes = [2, 2] }) {
  const group = new THREE.Group();
  const add = (m) => (group.add(m), m);
  const x0 = -w / 2;
  const x1 = w / 2;
  // The frame: two stiles the full height, and the rails between them.
  add(soft(mat, x0, x0 + stile, 0, h, -t / 2, t / 2, 0.005));
  add(soft(mat, x1 - stile, x1, 0, h, -t / 2, t / 2, 0.005));
  add(soft(mat, x0 + stile, x1 - stile, 0, bottom, -t / 2, t / 2, 0.005));
  add(soft(mat, x0 + stile, x1 - stile, h - top, h, -t / 2, t / 2, 0.005));
  const free = h - top - bottom - mid * (rows.length - 1);
  let y = bottom;
  rows.forEach((row, i) => {
    const ph = free * row.f;
    const px0 = x0 + stile;
    const px1 = x1 - stile;
    if (row.glass && night) {
      // A pane of the night, held by a thin moulding and crossed by bars.
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(px1 - px0, ph), night);
      pane.position.set(0, y + ph / 2, 0);
      add(pane);
      const back = pane.clone();
      back.rotation.y = Math.PI;
      add(back);
      const [cols, rws] = panes;
      for (let c = 1; c < cols; c++) {
        const bx = px0 + ((px1 - px0) * c) / cols;
        add(soft(mat, bx - 0.012, bx + 0.012, y, y + ph, -0.014, 0.014, 0.004));
      }
      for (let r = 1; r < rws; r++) {
        const by = y + (ph * r) / rws;
        add(soft(mat, px0, px1, by - 0.012, by + 0.012, -0.014, 0.014, 0.004));
      }
      for (const s of [-1, 1]) bead(add, mat, px0, px1, y, y + ph, s * (t / 2), s);
    } else if (row.boards) {
      // Upright boards, each with its edges taken off, so the joints read as
      // dark lines between them.
      const n = Math.max(3, Math.round((px1 - px0) / 0.11));
      const bw = (px1 - px0) / n;
      for (let k = 0; k < n; k++) add(soft(mat, px0 + k * bw + 0.002, px0 + (k + 1) * bw - 0.002, y, y + ph, -t / 2 + 0.012, t / 2 - 0.012, 0.008));
    } else {
      // A fielded panel: a thin board set back in the frame, its field raised
      // in the middle with bevelled edges, and a moulding round it on both faces.
      add(soft(mat, px0, px1, y, y + ph, -t / 2 + 0.014, t / 2 - 0.014, 0.002));
      const inset = Math.min(0.05, (px1 - px0) / 6);
      for (const s of [-1, 1]) {
        const z0 = s * (t / 2 - 0.016);
        const z1 = s * (t / 2 - 0.004);
        add(soft(mat, px0 + inset, px1 - inset, y + inset, y + ph - inset, Math.min(z0, z1), Math.max(z0, z1), 0.009));
        bead(add, mat, px0, px1, y, y + ph, s * (t / 2), s);
      }
    }
    y += ph;
    if (i < rows.length - 1) {
      add(soft(mat, x0 + stile, x1 - stile, y, y + mid, -t / 2, t / 2, 0.005));
      y += mid;
    }
  });
  return group;
}

/** A small rounded moulding round a panel's opening, standing proud of the face on side `s`. */
function bead(add, mat, a, b, y0, y1, face, s) {
  const k = 0.016;
  const z0 = face;
  const z1 = face + s * 0.008;
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  add(soft(mat, a - k, b + k, y0 - k, y0, lo, hi, 0.004));
  add(soft(mat, a - k, b + k, y1, y1 + k, lo, hi, 0.004));
  add(soft(mat, a - k, a, y0, y1, lo, hi, 0.004));
  add(soft(mat, b, b + k, y0, y1, lo, hi, 0.004));
}

/**
 * A run of moulding: a flat profile, given as (across, out) points with `out`
 * the distance proud of the wall, extruded `length` along +x. Its back is on
 * z = 0 and its face toward +z.
 */
export function moulding(material, profile, length) {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], 0);
  for (const [a, o] of profile) shape.lineTo(a, o);
  shape.lineTo(profile.at(-1)[0], 0);
  shape.lineTo(profile[0][0], 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 6 });
  // The shape is (across, out) and the extrusion runs along its z. Turn it so
  // the run is +x, across is up (+y) and out is +z: (x, y, z) ← (z, x, y).
  geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  worldUV(mesh, { tile: 1 });
  return mesh;
}

/** An architrave: a broad flat board with a rounded back band on its outer edge, as the painting's door frames are. */
export const ARCHITRAVE = [
  [0, 0.034],
  [0.02, 0.04],
  [0.03, 0.036],
  [0.036, 0.022],
  [0.12, 0.018],
  [0.13, 0.012],
  [0.135, 0.0],
];
/** A skirting board: tall and plain, with a rounded top. */
export const SKIRTING = [
  [0, 0.02],
  [0.15, 0.02],
  [0.165, 0.026],
  [0.175, 0.02],
  [0.185, 0.01],
  [0.19, 0],
];
/** A handrail: round on top, flat underneath. */
export const HANDRAIL = (() => {
  const out = [];
  const r = 0.035;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    out.push([0.035 + Math.cos(a) * r, 0.02 + Math.sin(a) * r * 0.9]);
  }
  return out;
})();

/**
 * A square post with its arrises taken off and a cap on top: the painting's
 * newel and balusters are plain square timbers.
 */
export function post(material, w, h, { cap = 0, capH = 0.05 } = {}) {
  const group = new THREE.Group();
  group.add(soft(material, -w / 2, w / 2, 0, h, -w / 2, w / 2, Math.min(0.012, w / 6)));
  if (cap) {
    group.add(soft(material, -cap / 2, cap / 2, h, h + capH, -cap / 2, cap / 2, 0.01));
    // A shallow pyramid on the cap, as a newel's has.
    const top = new THREE.Mesh(new THREE.ConeGeometry(cap * 0.62, capH * 0.9, 4, 1), material);
    top.rotation.y = Math.PI / 4;
    top.position.y = h + capH + capH * 0.45;
    group.add(top);
  }
  return group;
}

/** A turned shape, from (radius, height) points, about +y. */
export function turned(material, profile, segments = 18) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  return new THREE.Mesh(geo, material);
}

/**
 * Cloth that hangs in folds: a sheet `w` wide and `h` tall in x and y, its
 * folds pushed out along +z, deeper toward the hem, as a curtain falls.
 */
export function folds(material, w, h, { count = 7, depth = 0.04, seed = 1 } = {}) {
  const geo = new THREE.PlaneGeometry(w, h, Math.max(8, count * 6), 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const down = 0.55 + 0.45 * (0.5 - y / h);
    const phase = seed * 1.7 + Math.sin(seed * 3.1) * 0.6;
    const z = Math.sin((x / w) * count * Math.PI * 2 + phase) * depth * down + Math.sin((x / w) * count * 5.3 + phase) * depth * 0.25;
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  return mesh;
}

/**
 * A run of moulding set into the house: `length` along `along` from `origin`,
 * its profile's width running along `across` and standing out along `out`
 * (unit vectors). A left-handed frame is turned round end for end, so the
 * moulding's faces always face out.
 */
export function placeRun(material, profile, length, origin, along, across, out) {
  let a = new THREE.Vector3(...along);
  const c = new THREE.Vector3(...across);
  const n = new THREE.Vector3(...out);
  const o = new THREE.Vector3(...origin);
  if (new THREE.Vector3().crossVectors(a, c).dot(n) < 0) {
    o.addScaledVector(a, length);
    a = a.negate();
  }
  const mesh = moulding(material, profile, length);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(a, c, n).setPosition(o);
  mesh.matrixWorldNeedsUpdate = true;
  // Its texture runs with it, at its real size.
  return mesh;
}
