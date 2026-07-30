import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyPlaneUVs, applyWorldUVs } from '../core/materials.js';
import { BLOCKERS, SPACES, WALLS, WALL_THICKNESS } from './layout.js';

const T = WALL_THICKNESS;
const TRIM = 0.14;
const TRIM_DEPTH = T + 0.12;

/**
 * Builds the static shell of the ship: floors, ceilings, walls with cut door
 * openings, and door-frame trim. Everything is merged per material so the
 * whole level costs a handful of draw calls.
 */
export function buildLevel(materials) {
  const group = new THREE.Group();
  group.name = 'level';

  const buckets = new Map(); // material id -> geometry[]
  const colliders = [];

  const push = (matId, geo) => {
    if (!buckets.has(matId)) buckets.set(matId, []);
    buckets.get(matId).push(geo);
  };

  const box = (matId, w, h, d, x, y, z, tile = 2, solid = true) => {
    const geo = applyWorldUVs(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
    geo.translate(x, y, z);
    push(matId, geo);
    if (solid) {
      colliders.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y - h / 2,
        maxY: y + h / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    }
    return geo;
  };

  // ------------------------------------------------------ floors + ceilings
  for (const space of SPACES) {
    const w = space.x[1] - space.x[0];
    const d = space.z[1] - space.z[0];
    const cx = (space.x[0] + space.x[1]) / 2;
    const cz = (space.z[0] + space.z[1]) / 2;

    const floor = applyPlaneUVs(new THREE.PlaneGeometry(w, d, 1, 1), w, d, 2);
    floor.rotateX(-Math.PI / 2);
    floor.translate(cx, 0, cz);
    push('floor_plate', floor);

    const ceil = applyPlaneUVs(new THREE.PlaneGeometry(w, d, 1, 1), w, d, 2.5);
    ceil.rotateX(Math.PI / 2);
    ceil.translate(cx, space.h, cz);
    push('ceiling_plate', ceil);
  }

  // ----------------------------------------------------------------- walls
  for (const wall of WALLS) {
    const isCorridor = wall.h <= 2.7;
    const matId = isCorridor ? 'wall_panel_b' : 'wall_panel_a';
    const openings = [...(wall.openings || [])].sort((a, b) => a.center - b.center);

    let cursor = wall.from;
    const runs = [];
    for (const o of openings) {
      const a = o.center - o.width / 2;
      const b = o.center + o.width / 2;
      if (a > cursor + 1e-4) runs.push([cursor, a]);
      cursor = b;
    }
    if (wall.to > cursor + 1e-4) runs.push([cursor, wall.to]);

    for (const [a, b] of runs) {
      const len = b - a;
      const mid = (a + b) / 2;
      if (wall.axis === 'x') box(matId, T, wall.h, len, wall.at, wall.h / 2, mid);
      else box(matId, len, wall.h, T, mid, wall.h / 2, wall.at);
    }

    for (const o of openings) {
      // Lintel above the opening — greeble panelling reads as machinery
      // packed into the bulkhead over each door.
      const lh = wall.h - o.height;
      if (lh > 0.02) {
        const ly = o.height + lh / 2;
        if (wall.axis === 'x') box('greeble_panel', T, lh, o.width, wall.at, ly, o.center, 1.4);
        else box('greeble_panel', o.width, lh, T, o.center, ly, wall.at, 1.4);
      }
      addTrim(box, wall, o);
    }
  }

  // ------------------------------------------------------- extra blockers
  for (const b of BLOCKERS) {
    const [floor, ceiling] = b.y ?? [0, b.h];
    colliders.push({
      minX: b.x[0],
      maxX: b.x[1],
      minY: floor,
      maxY: ceiling,
      minZ: b.z[0],
      maxZ: b.z[1],
    });
  }

  // ---------------------------------------------------------------- merge
  for (const [matId, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials.surface(matId));
    mesh.name = `level:${matId}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return { group, colliders };
}

function addTrim(box, wall, o) {
  const half = o.width / 2;
  const postCenterA = o.center - half - TRIM / 2;
  const postCenterB = o.center + half + TRIM / 2;
  const headerY = o.height + TRIM / 2;
  const headerLen = o.width + TRIM * 2;

  if (wall.axis === 'x') {
    box('door_trim', TRIM_DEPTH, o.height + TRIM, TRIM, wall.at, (o.height + TRIM) / 2, postCenterA, 1, false);
    box('door_trim', TRIM_DEPTH, o.height + TRIM, TRIM, wall.at, (o.height + TRIM) / 2, postCenterB, 1, false);
    box('door_trim', TRIM_DEPTH, TRIM, headerLen, wall.at, headerY, o.center, 1, false);
  } else {
    box('door_trim', TRIM, o.height + TRIM, TRIM_DEPTH, postCenterA, (o.height + TRIM) / 2, wall.at, 1, false);
    box('door_trim', TRIM, o.height + TRIM, TRIM_DEPTH, postCenterB, (o.height + TRIM) / 2, wall.at, 1, false);
    box('door_trim', headerLen, TRIM, TRIM_DEPTH, o.center, headerY, wall.at, 1, false);
  }
}
