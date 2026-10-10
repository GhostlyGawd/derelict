import path from 'node:path';
import sharp from 'sharp';

import { chartPoint } from '../../../src/house/charts.js';

/**
 * Keeping what the model paints in the painting's colours (9.3, the owner's
 * painting as a source). A diffusion model drifts: left to itself it paints a
 * damp wall lighter and greener than the painting round it. So what it
 * paints is held to the painting's own colour on that surface, by matching
 * each channel's mean and spread to the paint the painter saw there. Pure
 * arithmetic, so the pipeline does it, byte for byte.
 */

/**
 * The painting's colour on a surface: each channel's mean and spread over
 * the pixels kept from the painting, leaving out anything warmer than the
 * damp green (the rug), which is not the surface.
 */
export function keptStats(u) {
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < u.w * u.h; i++) {
    if (u.mask[i] || !u.kept[i]) continue;
    const r = u.rgb[i * 3];
    const g = u.rgb[i * 3 + 1];
    if (g < r * 0.95) continue;
    for (let k = 0; k < 3; k++) {
      const v = u.rgb[i * 3 + k];
      sum[k] += v;
      sq[k] += v * v;
    }
    n++;
  }
  if (n < 200) return null;
  const mean = sum.map((s) => s / n);
  return { mean, sd: sq.map((s, k) => Math.sqrt(Math.max(1, s / n - mean[k] ** 2))), n };
}

/** The statistics each chart is held to: its own, or the best-seen chart of its kind's when the painter barely saw it. */
export function targets(unwrapped) {
  const own = new Map(unwrapped.map((u) => [u.chart.id, keptStats(u)]));
  const out = new Map();
  for (const u of unwrapped) {
    let t = u.seen >= 0.1 ? own.get(u.chart.id) : null;
    if (!t) {
      const donor = unwrapped.filter((v) => v.chart.kind === u.chart.kind && own.get(v.chart.id)).sort((a, b) => b.seen - a.seen)[0];
      t = donor ? own.get(donor.chart.id) : [...own.values()].find(Boolean);
    }
    out.set(u.chart.id, t);
  }
  return out;
}

/** Each channel of the masked pixels of `rgb`, moved to the target's mean and spread. */
export function matchMasked(rgb, u, target) {
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < u.w * u.h; i++) {
    if (!u.mask[i]) continue;
    for (let k = 0; k < 3; k++) {
      sum[k] += rgb[i * 3 + k];
      sq[k] += rgb[i * 3 + k] ** 2;
    }
    n++;
  }
  if (!n || !target) return rgb;
  const mean = sum.map((s) => s / n);
  const sd = sq.map((s, k) => Math.sqrt(Math.max(1, s / n - mean[k] ** 2)));
  // The spread is matched only so far: the painting's spread on a surface is
  // mostly its light falling across it, and a surface's own texture
  // stretched to that much reads as blotches, not paint.
  const gain = sd.map((s, k) => Math.min(1.6, Math.max(0.5, target.sd[k] / s)));
  const out = Uint8Array.from(rgb);
  for (let i = 0; i < u.w * u.h; i++) {
    if (!u.mask[i]) continue;
    for (let k = 0; k < 3; k++) {
      const v = (rgb[i * 3 + k] - mean[k]) * gain[k] + target.mean[k];
      out[i * 3 + k] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

/**
 * The seed under a chart's mask: the house's own generated surface for its
 * kind, laid at its size in the house, in the painting's colours. The model
 * repaints it; the seed decides that a floor is boards and a wall is plaster.
 */
export async function seedChart(u, textureDir, textureId, tile, target) {
  const { data, info } = await sharp(path.join(textureDir, `${textureId}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = Uint8Array.from(u.rgb);
  const c = u.chart;
  for (let y = 0; y < u.h; y++) {
    for (let x = 0; x < u.w; x++) {
      const i = y * u.w + x;
      if (!u.mask[i]) continue;
      const sc = ((x + 0.5) / u.w) * c.width;
      const tc = (1 - (y + 0.5) / u.h) * c.height;
      const p = chartPoint(c, sc, tc);
      // As the game lays a surface (worldUV): plan for a floor or ceiling, along the wall for a wall.
      const [a, b] = c.kind === 'wall' ? [Math.abs(c.u[0]) > 0.5 ? p[0] : p[2], p[1] - c.floorY] : [p[0], p[2]];
      const tx = Math.floor((((a / tile) % 1) + 1) % 1 * info.width);
      const ty = Math.floor((1 - ((((b / tile) % 1) + 1) % 1)) * info.height) % info.height;
      for (let k = 0; k < 3; k++) rgb[i * 3 + k] = data[(ty * info.width + tx) * 3 + k];
    }
  }
  return matchMasked(rgb, u, target);
}
