import sharp from 'sharp';
import * as THREE from 'three';

import { chartPoint, chartsFor } from '../../../src/house/charts.js';
import { FACING, paintingCamera } from '../../../src/house/painter.js';
import { houseBVH } from '../bake.js';

/**
 * The owner's painting, unwrapped onto the hall's walls, floor and ceiling
 * (9.3, the owner's painting as a source).
 *
 * Every texel of every hall chart is a point in the house. Seen from the
 * painter's eye, inside the painting's frame, square enough on and with
 * nothing in the way, it takes the painting's colour there, exactly as the
 * projector in the game gives it (src/house/projection.js). Everything else
 * is marked for the model to paint (fill.py), so the hall has the painting's
 * own surfaces on its sides, behind the player and under the furniture.
 */

/** Texels per metre of the hall's painted charts: about the painting's own, on the back wall. */
export const PAINT_DENSITY = 128;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export async function unwrapHall(paintingFile) {
  const { data: img, info } = await sharp(paintingFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const sample = (u, v) => {
    // Bilinear, in the painting's own pixels, v up as the camera has it.
    const x = Math.min(W - 1.001, Math.max(0, u * W - 0.5));
    const y = Math.min(H - 1.001, Math.max(0, (1 - v) * H - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const out = [0, 0, 0];
    for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const i = ((y0 + dy) * W + x0 + dx) * 3;
      for (let k = 0; k < 3; k++) out[k] += img[i + k] * wt;
    }
    return out;
  };

  const camera = paintingCamera();
  const eye = camera.position.clone();
  // The painter's view is blocked by everything solid, the lamp's shade included: only the night lets it through.
  const bvh = houseBVH({ clear: new Set(['night']) });
  const ray = new THREE.Ray();
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  const out = [];
  for (const c of chartsFor('hall')) {
    const w = Math.max(8, Math.round(c.width * PAINT_DENSITY));
    const h = Math.max(8, Math.round(c.height * PAINT_DENSITY));
    const rgb = new Uint8Array(w * h * 3);
    const mask = new Uint8Array(w * h);
    const kept = new Uint8Array(w * h);
    const lift = c.kind === 'wall' ? 0.014 : 0.004;
    const n = new THREE.Vector3(...c.normal);
    let seen = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sc = ((x + 0.5) / w) * c.width;
        const tc = (1 - (y + 0.5) / h) * c.height;
        // An opening has nothing to paint.
        if (c.holes.some((o) => sc > o.s0 && sc < o.s1 && tc > o.t0 && tc < o.t1)) {
          mask[y * w + x] = 0;
          continue;
        }
        p.fromArray(chartPoint(c, sc, tc)).addScaledVector(n, lift);
        const toEye = v.copy(eye).sub(p);
        const dist = toEye.length();
        toEye.divideScalar(dist);
        const facing = Math.abs(toEye.dot(n));
        let weight = 0;
        const ndc = p.clone().project(camera);
        if (ndc.z < 1 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && facing > FACING[0]) {
          // Nothing between the painter and the point (a hair short of it, for its own surface).
          ray.origin.copy(eye);
          ray.direction.copy(toEye).negate();
          const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
          if (!hit || hit.distance > dist - 0.03) weight = smooth(FACING[0], FACING[1], facing);
        }
        const i = y * w + x;
        if (weight > 0) {
          const col = sample(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
          for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.round(col[k]);
        }
        // What the painting gives firmly is kept; the rest is the model's to paint.
        mask[i] = weight > 0.6 ? 0 : 255;
        if (weight > 0.6) {
          kept[i] = 1;
          seen++;
        }
      }
    }
    out.push({ chart: c, w, h, rgb, mask, kept, seen: seen / (w * h) });
  }
  return out;
}
