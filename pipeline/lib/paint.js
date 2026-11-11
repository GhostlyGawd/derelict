import { fbm, noise2, rng } from './raster.js';

/**
 * The style engine's techniques (phase 9, 9.4.5): ways of putting colour down
 * that read as painted, aged and made, rather than as noise. Shared generator
 * code, written for the house and available to the ship.
 *
 * Every operation works on a Raster and wraps at its edges, so anything built
 * from them still tiles. Every one is seeded, so a clean checkout reproduces
 * every byte.
 */

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Brush strokes stamped along a flow field. Each stroke is a soft, slightly
 * tapered smear of one colour from `palette`, laid down along the field's
 * direction at its start, so neighbouring strokes lean the same way and the
 * surface reads as worked by a hand rather than sprinkled.
 *
 *   count       how many strokes
 *   length      stroke length in pixels, and `width` its width
 *   flow        frequency of the flow field; low is long sweeps
 *   alpha       how much each stroke covers what is under it
 *   vertical    bias the flow towards vertical (0..1), for plaster laid on a wall
 */
export function brushStrokes(r, { palette, count = 2000, length = 18, width = 5, flow = 3, alpha = 0.22, vertical = 0, seed = 1 }) {
  const rand = rng(seed);
  const s = r.size;
  for (let n = 0; n < count; n++) {
    let x = rand() * s;
    let y = rand() * s;
    const colour = palette[(rand() * palette.length) | 0];
    const jitter = 0.85 + rand() * 0.3;
    const c = [colour[0] * jitter, colour[1] * jitter, colour[2] * jitter];
    const len = length * (0.5 + rand());
    const w = Math.max(1, width * (0.6 + rand() * 0.8));
    for (let t = 0; t < len; t++) {
      const angle = fbm(x / s, y / s, flow, 2, seed + 7) * TAU * 2;
      const dx = Math.cos(angle) * (1 - vertical);
      const dy = Math.sin(angle) * (1 - vertical) + vertical;
      const m = Math.hypot(dx, dy) || 1;
      // Tapered at both ends, heaviest in the middle.
      const taper = Math.sin((t / len) * Math.PI);
      const half = (w * taper) / 2;
      const nx = -dy / m;
      const ny = dx / m;
      for (let k = -half; k <= half; k += 0.7) {
        const edge = 1 - Math.abs(k) / (half + 0.5);
        r.set(x + nx * k, y + ny * k, c, alpha * edge * taper);
      }
      x += dx / m;
      y += dy / m;
    }
  }
  return r;
}

/** A blurred copy of a scalar field, wrapping — the diffusion step. */
function blur(field, s, radius) {
  // A fractional radius indexes the field between cells and reads undefined,
  // which turned a whole wall black once. Whole pixels only.
  radius = Math.max(1, Math.round(radius));
  const out = new Float32Array(field.length);
  const tmp = new Float32Array(field.length);
  const n = radius * 2 + 1;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += field[y * s + ((x + k + s) % s)];
      tmp[y * s + x] = sum / n;
    }
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[((y + k + s) % s) * s + x];
      out[y * s + x] = sum / n;
    }
  }
  return out;
}

/**
 * Damp that spreads. Water is seeded where `source(u, v)` says (a rising edge,
 * a corner, a leak), allowed to diffuse through the surface with noise
 * holding it back in places, and the result stains the surface by how wet it
 * got. Where the wet front stopped it leaves tide lines: thin darker rings at
 * the edges of the stain, which is what makes damp read as damp and not as
 * dirt.
 *
 *   source      (u, v) -> 0..1, where the water comes from
 *   spread      diffusion passes; more is further
 *   stain       colour of the wettest part, and `strength` how far towards it
 *   tides       number of tide lines
 */
export function damp(r, { source, spread = 6, radius = 6, stain = [20, 26, 16], strength = 0.75, tides = 3, tideColour = [14, 18, 10], seed = 1 }) {
  const s = r.size;
  let wet = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) wet[y * s + x] = source(x / s, y / s);
  const hold = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) hold[y * s + x] = fbm(x / s, y / s, 6, 4, seed + 3);
  for (let pass = 0; pass < spread; pass++) {
    const next = blur(wet, s, radius);
    for (let i = 0; i < next.length; i++) {
      // Wet spreads unevenly: where the plaster holds water it gets further.
      // The factor stays under one, so the front slows and stops rather than
      // growing every pass and soaking the whole surface.
      next[i] = Math.max(wet[i] * 0.97, Math.min(1, next[i] * (0.55 + hold[i] * 0.5)));
    }
    wet = next;
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const w = clamp01(wet[y * s + x]);
      if (w <= 0.001) continue;
      r.set(x, y, stain, w * strength);
      // Tide lines where the front came to rest, wobbled by the noise.
      const front = w * tides + hold[y * s + x] * 0.35;
      const band = Math.abs(front - Math.round(front));
      if (w > 0.06 && band < 0.06) r.set(x, y, tideColour, 0.55 * (1 - band / 0.06));
    }
  }
  return wet;
}

/**
 * Streaks: water that ran down a wall. Thin, wavering, darker at the top
 * where it started, fading as it goes.
 */
export function runs(r, { count = 40, colour = [16, 20, 12], alpha = 0.35, minLength = 0.15, maxLength = 0.6, width = [1, 3.5], fromTop = 1, seed = 1 }) {
  const rand = rng(seed);
  const s = r.size;
  for (let n = 0; n < count; n++) {
    let x = rand() * s;
    // `fromTop` of 1 starts a run anywhere; smaller starts them near the top,
    // where water comes in at the ceiling.
    const y0 = rand() * s * fromTop;
    const len = (minLength + rand() * (maxLength - minLength)) * s;
    const w = width[0] + rand() * (width[1] - width[0]);
    for (let t = 0; t < len; t++) {
      x += (noise2(x / s, (y0 + t) / s, 24, seed + n) - 0.5) * 0.6;
      const fade = 1 - t / len;
      // Soft at the sides: the middle of a wide run is wettest.
      for (let k = 0; k < w; k++) {
        const side = 1 - Math.abs((k + 0.5) / w - 0.5) * 2;
        r.set(x + k, y0 + t, colour, alpha * fade * (w > 4 ? 0.35 + 0.65 * side : 1));
      }
    }
  }
}

/**
 * Wood grown, then cut. A virtual log's rings are distorted by noise and by
 * knots, and the surface is cut from it as planks of `plankWidth` pixels that
 * run vertically, each from a different part of the log. Grain is then a
 * function of distance from the log's heart, which is what makes it flow
 * round knots instead of striping straight across them.
 */
export function woodPlanks(r, { light, dark, plankWidth = 32, rings = 26, knots = 3, gap = 1, gapColour = [10, 9, 7], contrast = 0.7, seed = 1 }) {
  const rand = rng(seed);
  const s = r.size;
  const planks = Math.max(1, Math.round(s / plankWidth));
  const pw = s / planks;
  for (let p = 0; p < planks; p++) {
    const heartX = (rand() - 0.5) * pw * 3;
    const offset = rand() * 100;
    const tone = 0.85 + rand() * 0.3;
    const ks = Array.from({ length: knots }, () => ({ y: rand() * s, x: rand() * pw, r: 3 + rand() * 6 }));
    for (let y = 0; y < s; y++) {
      for (let i = 0; i < Math.ceil(pw); i++) {
        const x = p * pw + i;
        if (x >= s) continue;
        let d = Math.abs(i - pw / 2 - heartX) + fbm(i / s, y / s, 3, 3, seed + p) * 14;
        for (const k of ks) {
          const dy = y - k.y;
          const dx = i - k.x;
          const dist = Math.hypot(dx, dy * 0.6);
          d += (k.r * 40) / (dist * dist + k.r * 6);
          if (dist < k.r * 0.6) d += 3;
        }
        const ring = 0.5 + 0.5 * Math.sin(((d + offset) / s) * rings * TAU);
        const streak = noise2(i / s, y / s, 48, seed + p * 3) * 0.25;
        // How strongly the rings show: old, stained wood barely shows them.
        const t = clamp01(0.5 + (ring - 0.5) * contrast + streak - 0.12);
        const c = mixRgb(light, dark, t);
        r.set(x, y, [c[0] * tone, c[1] * tone, c[2] * tone]);
      }
    }
    if (gap > 0) for (let y = 0; y < s; y++) for (let g = 0; g < gap; g++) {
      r.set(Math.round(p * pw) + g, y, gapColour);
      r.raise(Math.round(p * pw) + g, y, -1.5);
    }
  }
}

/**
 * Paint that has flaked. Where a noise field crosses `threshold` the top
 * coat is gone and `under` shows; the edge of each flake catches a little
 * light where it has lifted.
 */
export function flake(r, { under, threshold = 0.66, frequency = 10, edge = [210, 214, 196], seed = 1 }) {
  const s = r.size;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const v = fbm(x / s, y / s, frequency, 4, seed);
      if (v > threshold) {
        r.set(x, y, under, 0.9);
        r.raise(x, y, -0.8);
      } else if (v > threshold - 0.02) r.set(x, y, edge, 0.25);
    }
  }
}

/**
 * A woven textile. The motif is a function of the cell (u, v) in 0..1 that
 * names a palette index; it is woven at `cells` per side with a visible
 * warp-and-weft texture in every cell, then worn: faded and frayed where
 * `wear(u, v)` says feet went.
 */
export function weave(r, { motif, palette, cells = 64, wear = () => 0, fade = [150, 140, 110], seed = 1 }) {
  const s = r.size;
  const cell = s / cells;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s;
      const v = y / s;
      const cu = (Math.floor(x / cell) + 0.5) / cells;
      const cv = (Math.floor(y / cell) + 0.5) / cells;
      const base = palette[motif(cu, cv)];
      // The weave: alternate threads lighter and darker.
      const thread = (Math.floor(x / Math.max(1, cell / 2)) + Math.floor(y / Math.max(1, cell / 2))) % 2 ? 1.06 : 0.92;
      const w = clamp01(wear(u, v) + (fbm(u, v, 12, 3, seed) - 0.5) * 0.3);
      const c = mixRgb([base[0] * thread, base[1] * thread, base[2] * thread], fade, w * 0.55);
      r.set(x, y, c);
      if (w > 0.75 && fbm(u, v, 30, 2, seed + 5) > 0.6) r.set(x, y, [40, 34, 24], 0.7);
    }
  }
}

/** A vertical gradient laid over the whole surface: darker toward one end. */
export function falloff(r, { top = 1, bottom = 1 }) {
  const s = r.size;
  for (let y = 0; y < s; y++) {
    const k = lerp(top, bottom, y / (s - 1));
    for (let x = 0; x < s; x++) r.shade(x, y, k);
  }
}
