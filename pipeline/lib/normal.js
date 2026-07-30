import { Raster } from './raster.js';

/**
 * Tangent-space normal maps, derived from the height channel the texture
 * generators now compose alongside their colour.
 *
 * Two decisions worth stating, because both are easy to get subtly wrong and
 * neither shows up as an error:
 *
 * The map is derived at the *final* resolution, from a downsampled height
 * field — not derived at source resolution and then resized. Resampling an
 * encoded normal map averages unit vectors componentwise and denormalises
 * them, which flattens exactly the small features the map exists to carry.
 * Height averages correctly; normals do not.
 *
 * Row index grows downward, and V grows upward, so the row gradient's sign
 * flips on its way into green. This is the OpenGL convention three.js expects.
 */

const mod = (n, m) => ((n % m) + m) % m;

/**
 * @param source  a Raster carrying a composed height field
 * @param target  the edge length of the map to produce; must divide source.size
 * @param strength  slope multiplier — higher is more pronounced relief
 */
export function normalMapFrom(source, target, { strength = 1.35 } = {}) {
  const s = source.size;
  const k = Math.round(s / target);
  if (k < 1 || k * target !== s) {
    throw new Error(`normal map target ${target} does not divide source ${s}`);
  }

  // Box-downsample the height field, then convert displacement from source
  // pixels into target pixels so the gradient below is a true slope per texel.
  const h = new Float32Array(target * target);
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) sum += source.h[(y * k + j) * s + (x * k + i)];
      }
      h[y * target + x] = sum / (k * k) / k;
    }
  }

  const at = (x, y) => h[mod(y, target) * target + mod(x, target)];
  const out = new Raster(target, source.seed);

  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      const nx = -gx;
      const ny = gy;
      const nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      out.set(x, y, [
        Math.round((nx / len) * 127.5 + 127.5),
        Math.round((ny / len) * 127.5 + 127.5),
        Math.round((nz / len) * 127.5 + 127.5),
      ]);
    }
  }

  return out;
}

/**
 * How far the map departs from flat, as a fraction of texels whose normal is
 * meaningfully tilted. Reported by the pipeline so a generator that quietly
 * stops writing height shows up as a number going to zero rather than as a
 * surface that just looks a bit dull.
 */
export function reliefCoverage(normalRaster, threshold = 6) {
  let tilted = 0;
  const n = normalRaster.size * normalRaster.size;
  for (let i = 0; i < n; i++) {
    const r = normalRaster.data[i * 3];
    const g = normalRaster.data[i * 3 + 1];
    if (Math.abs(r - 128) > threshold || Math.abs(g - 128) > threshold) tilted++;
  }
  return tilted / n;
}
