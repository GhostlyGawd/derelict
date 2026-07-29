/**
 * A tiny seeded raster canvas with wrapping draw operations.
 *
 * Everything here wraps at the edges, and the noise is lattice-periodic, so
 * every surface the offline synthesiser produces is genuinely tileable.
 */

export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on a lattice of `frequency` cells across the unit square. */
export function noise2(u, v, frequency, seed) {
  const x = u * frequency;
  const y = v * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const xa = mod(x0, frequency);
  const xb = mod(x0 + 1, frequency);
  const ya = mod(y0, frequency);
  const yb = mod(y0 + 1, frequency);
  return lerp(
    lerp(hash(xa, ya, seed), hash(xb, ya, seed), tx),
    lerp(hash(xa, yb, seed), hash(xb, yb, seed), tx),
    ty
  );
}

/** Fractal sum of `octaves` doublings — still tiles, because each layer does. */
export function fbm(u, v, frequency, octaves, seed) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(u, v, frequency << i, seed + i * 977) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  return sum / total;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export class Raster {
  constructor(size, seed = 1) {
    this.size = size;
    this.data = new Uint8ClampedArray(size * size * 3);
    this.random = rng(seed);
    this.seed = seed;
  }

  index(x, y) {
    const s = this.size;
    return (mod(y | 0, s) * s + mod(x | 0, s)) * 3;
  }

  fill(rgb) {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = rgb[0];
      this.data[i + 1] = rgb[1];
      this.data[i + 2] = rgb[2];
    }
    return this;
  }

  set(x, y, rgb, alpha = 1) {
    const i = this.index(x, y);
    if (alpha >= 1) {
      this.data[i] = rgb[0];
      this.data[i + 1] = rgb[1];
      this.data[i + 2] = rgb[2];
      return;
    }
    if (alpha <= 0) return;
    this.data[i] = clamp255(this.data[i] + (rgb[0] - this.data[i]) * alpha);
    this.data[i + 1] = clamp255(this.data[i + 1] + (rgb[1] - this.data[i + 1]) * alpha);
    this.data[i + 2] = clamp255(this.data[i + 2] + (rgb[2] - this.data[i + 2]) * alpha);
  }

  get(x, y) {
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /** Multiplies a pixel's brightness — the workhorse for wear and shading. */
  shade(x, y, factor) {
    const i = this.index(x, y);
    this.data[i] = clamp255(this.data[i] * factor);
    this.data[i + 1] = clamp255(this.data[i + 1] * factor);
    this.data[i + 2] = clamp255(this.data[i + 2] * factor);
  }

  rect(x, y, w, h, rgb, alpha = 1) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.set(x + i, y + j, rgb, alpha);
    }
    return this;
  }

  shadeRect(x, y, w, h, factor) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.shade(x + i, y + j, factor);
    }
    return this;
  }

  /** Raised-panel shading: light on the top/left, shadow bottom/right. */
  bevel(x, y, w, h, weight = 1, thickness = 2) {
    for (let t = 0; t < thickness; t++) {
      const light = 1 + 0.34 * weight * (1 - t / thickness);
      const dark = 1 - 0.36 * weight * (1 - t / thickness);
      for (let i = 0; i < w; i++) {
        this.shade(x + i, y + t, light);
        this.shade(x + i, y + h - 1 - t, dark);
      }
      for (let j = 0; j < h; j++) {
        this.shade(x + t, y + j, light);
        this.shade(x + w - 1 - t, y + j, dark);
      }
    }
    return this;
  }

  outline(x, y, w, h, rgb, alpha = 1, thickness = 1) {
    for (let t = 0; t < thickness; t++) {
      for (let i = 0; i < w; i++) {
        this.set(x + i, y + t, rgb, alpha);
        this.set(x + i, y + h - 1 - t, rgb, alpha);
      }
      for (let j = 0; j < h; j++) {
        this.set(x + t, y + j, rgb, alpha);
        this.set(x + w - 1 - t, y + j, rgb, alpha);
      }
    }
    return this;
  }

  disc(cx, cy, r, rgb, alpha = 1) {
    const r2 = r * r;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (i * i + j * j <= r2) this.set(cx + i, cy + j, rgb, alpha);
      }
    }
    return this;
  }

  /** A domed bolt head with a highlight and a contact shadow. */
  rivet(cx, cy, r, base) {
    const r2 = r * r;
    for (let j = -r - 1; j <= r + 1; j++) {
      for (let i = -r - 1; i <= r + 1; i++) {
        const d2 = i * i + j * j;
        if (d2 > (r + 1) * (r + 1)) continue;
        if (d2 > r2) {
          this.shade(cx + i, cy + j, 0.62);
          continue;
        }
        const nx = i / r;
        const ny = j / r;
        const light = Math.max(0, 1 - (nx * 0.7 + ny * 0.7));
        const k = 0.68 + 0.6 * light;
        this.set(cx + i, cy + j, [
          clamp255(base[0] * k),
          clamp255(base[1] * k),
          clamp255(base[2] * k),
        ]);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, rgb, alpha = 1, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = Math.round(lerp(x0, x1, t));
      const y = Math.round(lerp(y0, y1, t));
      if (width <= 1) this.set(x, y, rgb, alpha);
      else this.disc(x, y, width / 2, rgb, alpha);
    }
    return this;
  }

  /** Per-pixel callback in normalised coordinates. */
  each(fn) {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) fn(x, y, x / s, y / s, this);
    }
    return this;
  }

  /** Broadband mottling so flat fills never read as flat. */
  mottle({ frequency = 8, octaves = 4, amount = 0.18, seed = this.seed + 11 } = {}) {
    return this.each((x, y, u, v) => {
      const n = fbm(u, v, frequency, octaves, seed);
      this.shade(x, y, 1 + (n - 0.5) * 2 * amount);
    });
  }

  /** Dark accumulation in the low-lying parts of the surface. */
  grime({ frequency = 4, octaves = 5, amount = 0.55, colour = [26, 28, 24], seed = this.seed + 29 } = {}) {
    return this.each((x, y, u, v) => {
      const n = fbm(u, v, frequency, octaves, seed);
      const k = Math.max(0, n - 0.5) * 2;
      this.set(x, y, colour, k * amount);
    });
  }

  /** Vertical drip staining below a given row band. */
  streaks({ count = 26, colour = [30, 30, 26], seed = this.seed + 47, maxLength = 0.5 } = {}) {
    const random = rng(seed);
    for (let i = 0; i < count; i++) {
      const x = (random() * this.size) | 0;
      const y = (random() * this.size) | 0;
      const length = (random() * maxLength * this.size) | 0;
      const width = 1 + ((random() * 3) | 0);
      const strength = 0.12 + random() * 0.22;
      for (let j = 0; j < length; j++) {
        const fade = 1 - j / length;
        for (let w = 0; w < width; w++) this.set(x + w, y + j, colour, strength * fade);
      }
    }
    return this;
  }

  scratches({ count = 40, seed = this.seed + 71, bright = [190, 196, 188] } = {}) {
    const random = rng(seed);
    for (let i = 0; i < count; i++) {
      const x = random() * this.size;
      const y = random() * this.size;
      const angle = random() * Math.PI * 2;
      const length = 6 + random() * this.size * 0.22;
      this.line(
        x,
        y,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
        bright,
        0.1 + random() * 0.18
      );
    }
    return this;
  }

  /** Flakes of paint knocked off to reveal the metal beneath. */
  chip({ under, frequency = 12, octaves = 4, threshold = 0.62, seed = this.seed + 91 } = {}) {
    return this.each((x, y, u, v) => {
      const n = fbm(u, v, frequency, octaves, seed);
      if (n > threshold) {
        const k = Math.min(1, (n - threshold) / 0.16);
        this.set(x, y, under, k);
        if (n > threshold + 0.02 && n < threshold + 0.05) this.shade(x, y, 0.7);
      }
    });
  }

  toBuffer() {
    return Buffer.from(this.data.buffer, this.data.byteOffset, this.data.length);
  }
}

export const tint = (rgb, k) => [clamp255(rgb[0] * k), clamp255(rgb[1] * k), clamp255(rgb[2] * k)];
export const mix = (a, b, t) => [
  clamp255(lerp(a[0], b[0], t)),
  clamp255(lerp(a[1], b[1], t)),
  clamp255(lerp(a[2], b[2], t)),
];
