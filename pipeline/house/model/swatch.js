import sharp from 'sharp';
import * as THREE from 'three';

import { paintingCamera } from '../../../src/house/painter.js';

/**
 * Swatches cut from the owner's painting (9.3: its materials, the right way
 * up and at their real size). A swatch is a rectangle on a flat surface of
 * the hall, given in the house's metres, and is read out of the painting as
 * if the painter had stood square in front of it: every texel is the point
 * on that rectangle, seen through the painter's camera. So a patch of plaster
 * or boards comes out flat, without the painting's perspective.
 *
 * `plane` is { origin, u, v } (u along the swatch's width, v up its height,
 * in metres per unit), and `size` its [width, height] in metres.
 */
export async function rectify(paintingFile, { origin, u, v, size }, perMetre) {
  const { data, info } = await sharp(paintingFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const camera = paintingCamera();
  const w = Math.round(size[0] * perMetre);
  const h = Math.round(size[1] * perMetre);
  const rgb = new Uint8Array(w * h * 3);
  const p = new THREE.Vector3();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = ((x + 0.5) / w) * size[0];
      const b = (1 - (y + 0.5) / h) * size[1];
      p.set(origin[0] + u[0] * a + v[0] * b, origin[1] + u[1] * a + v[1] * b, origin[2] + u[2] * a + v[2] * b).project(camera);
      // Bilinear in the painting's own pixels.
      const fx = Math.min(W - 1.001, Math.max(0, (p.x * 0.5 + 0.5) * W - 0.5));
      const fy = Math.min(H - 1.001, Math.max(0, (0.5 - p.y * 0.5) * H - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      for (let k = 0; k < 3; k++) {
        const at = (xx, yy) => data[(yy * W + xx) * 3 + k];
        const val = at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
        rgb[(y * w + x) * 3 + k] = Math.round(val);
      }
    }
  }
  return { rgb, w, h };
}
