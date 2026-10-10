import * as THREE from 'three';

import { SPACES, STAIRWELL, WALLS, WALL_THICKNESS } from './layout.js';

/**
 * Baked surfaces (phase 9, 9.4.4): every wall face, floor and ceiling of a
 * room as a chart, a flat rectangle in the house with its own texture. The
 * pipeline bakes each chart's texels with the room's light, shadow and grime
 * (pipeline/house/bake.js), and the game lays the result over that face as a
 * skin a few millimetres in front of it (`skin`). Both read the charts from
 * here, so a texel the pipeline lit is the texel the player sees.
 *
 * A chart runs `width` metres along `u` and `height` metres along `v` from
 * `origin`. Its `holes` are the openings in it (doors, arches, windows and
 * the stairwell), in the chart's own (s, t) metres.
 */
const T = WALL_THICKNESS;

/** Texels per metre of a baked surface. About what a phone's backbuffer shows of a wall across a room. */
export const BAKE_DENSITY = 64;

/** Every chart of one room. */
export function chartsFor(spaceId) {
  const s = SPACES.find((sp) => sp.id === spaceId);
  const charts = [];

  // ---- Walls: each wall line on the room's edge, its inside face ----
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
    const holes = [];
    for (const o of w.openings || []) {
      const o0 = o.center - o.width / 2;
      const o1 = o.center + o.width / 2;
      if (o1 <= a || o0 >= b) continue;
      const y0 = o.kind === 'window' ? o.sill : 0;
      holes.push({ kind: o.kind, s0: o0 - a, s1: o1 - a, t0: y0, t1: y0 + o.height });
    }
    const along = w.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
    charts.push({
      id: `${s.id}-${w.axis}${w.at}-${side > 0 ? 'p' : 'n'}`,
      space: s.id,
      kind: 'wall',
      origin: w.axis === 'x' ? [face, s.y, a] : [a, s.y, face],
      u: along,
      v: [0, 1, 0],
      normal: w.axis === 'x' ? [side, 0, 0] : [0, 0, side],
      width: b - a,
      height: s.h,
      floorY: s.y,
      holes,
    });
  }

  // ---- The floor, and the ceiling with the stairwell cut out of it ----
  const stair = (sign) => {
    const x0 = Math.max(s.x[0], STAIRWELL.x[0]);
    const x1 = Math.min(s.x[1], STAIRWELL.x[1]);
    const z0 = Math.max(s.z[0], STAIRWELL.z[0]);
    const z1 = Math.min(s.z[1], STAIRWELL.z[1]);
    return x0 < x1 && z0 < z1 && sign ? [{ kind: 'stairwell', s0: x0 - s.x[0], s1: x1 - s.x[0], t0: z0 - s.z[0], t1: z1 - s.z[0] }] : [];
  };
  const plan = { origin: [s.x[0], 0, s.z[0]], u: [1, 0, 0], v: [0, 0, 1], width: s.x[1] - s.x[0], height: s.z[1] - s.z[0], floorY: s.y };
  charts.push({ ...plan, id: `${s.id}-floor`, space: s.id, kind: 'floor', origin: [s.x[0], s.y, s.z[0]], normal: [0, 1, 0], holes: [] });
  charts.push({ ...plan, id: `${s.id}-ceiling`, space: s.id, kind: 'ceiling', origin: [s.x[0], s.y + s.h, s.z[0]], normal: [0, -1, 0], holes: stair(s.floor === 0) });
  return charts;
}

/** The point in the house at chart coordinates (s, t) metres. */
export function chartPoint(c, sc, tc) {
  return [0, 1, 2].map((k) => c.origin[k] + c.u[k] * sc + c.v[k] * tc);
}

/** Texture size of a chart's bake. */
export function chartSize(c) {
  return { w: Math.max(4, Math.round(c.width * BAKE_DENSITY)), h: Math.max(4, Math.round(c.height * BAKE_DENSITY)) };
}

/**
 * The skin: a chart drawn as one flat mesh, a few millimetres in front of the
 * surface it covers, with its openings cut out. An arch's hole is round at
 * the top, as the arch is.
 */
export function skin(c, material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(c.width, 0);
  shape.lineTo(c.width, c.height);
  shape.lineTo(0, c.height);
  shape.lineTo(0, 0);
  for (const h of c.holes) {
    const path = new THREE.Path();
    if (h.kind === 'arch') {
      const r = (h.s1 - h.s0) / 2;
      const mid = (h.s0 + h.s1) / 2;
      path.moveTo(h.s0, h.t0);
      path.lineTo(h.s1, h.t0);
      path.lineTo(h.s1, h.t1 - r);
      path.absarc(mid, h.t1 - r, r, 0, Math.PI, false);
      path.lineTo(h.s0, h.t0);
    } else {
      path.moveTo(h.s0, h.t0);
      path.lineTo(h.s1, h.t0);
      path.lineTo(h.s1, h.t1);
      path.lineTo(h.s0, h.t1);
      path.lineTo(h.s0, h.t0);
    }
    shape.holes.push(path);
  }
  const geo = new THREE.ShapeGeometry(shape, 12);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  // In front of the surface; a wall's skin also clears a room's paint and
  // dado (src/house/rooms.js), which stand up to 12 mm off the plaster.
  const lift = c.kind === 'wall' ? 0.014 : 0.004;
  for (let i = 0; i < pos.count; i++) {
    const sc = pos.getX(i);
    const tc = pos.getY(i);
    uv.setXY(i, sc / c.width, tc / c.height);
    const p = chartPoint(c, sc, tc);
    pos.setXYZ(i, p[0] + c.normal[0] * lift, p[1] + c.normal[1] * lift, p[2] + c.normal[2] * lift);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = `skin:${c.id}`;
  return mesh;
}
