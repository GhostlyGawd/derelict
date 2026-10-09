import { brushStrokes, damp, falloff, flake, mixRgb, runs, weave, woodPlanks } from '../lib/paint.js';
import { Raster, fbm, noise2, rng } from '../lib/raster.js';
import { GRADE, PALETTE as P } from './style.js';

/**
 * The house's surfaces (phase 9, 9.4.4), drawn with the style engine in
 * pipeline/lib/paint.js. Each is a function of a size and a seed, tileable
 * across where it repeats in the house, and reproducible byte-for-byte.
 *
 * Rows run top to bottom: row 0 is the top of a wall.
 */

export const HOUSE_TEXTURES = [
  { id: 'plaster', size: 512, draw: plaster, note: 'damp plaster, one wall height per tile' },
  { id: 'floor', size: 512, draw: floor, note: 'worn, damp floor, two metres per tile' },
  { id: 'ceiling', size: 256, draw: ceiling, note: 'dark boarded ceiling' },
  { id: 'door', size: 256, draw: door, note: 'a panelled door leaf' },
  { id: 'wood', size: 256, draw: wood, note: 'dark wood for stairs, rails and furniture' },
  { id: 'rug', size: 256, draw: rug, note: 'the runner, one repeat of its pattern' },
  { id: 'curtain', size: 128, draw: curtain, note: 'thin cloth' },
  { id: 'night', size: 256, draw: night, note: 'the night outside: sky, rain, branches' },
  { id: 'paper', size: 128, draw: paper, note: 'a notice, written but not legible' },
  { id: 'picture', size: 128, draw: picture, note: 'a dark painting' },
];

function plaster(s, seed) {
  const r = new Raster(s, seed);
  r.fill(P.plasterBase);
  // Light and dark at the scale of a person: walls are never one tone.
  r.mottle({ frequency: 2, octaves: 3, amount: 0.38 });
  brushStrokes(r, { palette: P.plaster, count: (s * s) / 200, length: s / 26, width: s / 36, flow: 1.5, alpha: 0.34, vertical: 0.55, seed: seed + 1 });
  r.mottle({ frequency: 7, amount: 0.14 });
  // Rising damp from the floor, and blooms higher up where water got in.
  damp(r, {
    source: (u, v) => Math.max(0, (v - 0.72) / 0.28) ** 1.5 + (fbm(u, v, 3, 3, seed + 9) > 0.72 ? 0.8 : 0),
    spread: 5,
    radius: Math.max(2, s / 96),
    stain: P.damp,
    tideColour: P.tide,
    strength: 0.78,
    tides: 3,
    seed: seed + 2,
  });
  runs(r, { count: 80, colour: [30, 38, 22], alpha: 0.3, seed: seed + 3 });
  flake(r, { under: [118, 124, 98], threshold: 0.8, frequency: 14, edge: [60, 66, 46], seed: seed + 4 });
  r.grime({ frequency: 4, octaves: 4, amount: 0.35, colour: [24, 30, 18] });
  falloff(r, { top: 0.82, bottom: 0.7 });
  return r;
}

function floor(s, seed) {
  const r = new Raster(s, seed);
  r.fill(P.floorBase);
  brushStrokes(r, { palette: P.floor, count: (s * s) / 300, length: s / 22, width: s / 36, flow: 1.2, alpha: 0.24, seed: seed + 1 });
  r.mottle({ frequency: 5, amount: 0.16 });
  damp(r, {
    source: (u, v) => (fbm(u, v, 3, 4, seed + 6) > 0.64 ? 1 : 0),
    spread: 4,
    radius: Math.max(2, s / 128),
    stain: [34, 42, 28],
    tideColour: [22, 28, 16],
    strength: 0.6,
    tides: 2,
    seed: seed + 2,
  });
  // Flags: faint joints a metre apart.
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < s; i++) {
      r.set(i, (k * s) / 2, [34, 40, 28], 0.5);
      r.set((k * s) / 2 + 0.37 * s * (k ? 1 : 0), i, [34, 40, 28], 0.4);
    }
  }
  r.scratches({ count: 50, bright: [120, 128, 104] });
  r.grime({ frequency: 3, octaves: 4, amount: 0.3, colour: [26, 30, 20] });
  return r;
}

function ceiling(s, seed) {
  const r = new Raster(s, seed);
  woodPlanks(r, { light: P.ceilingLight, dark: P.ceilingDark, plankWidth: s / 6, rings: 6, knots: 2, gap: 2, contrast: 0.3, seed: seed + 1 });
  damp(r, { source: (u, v) => (fbm(u, v, 2, 3, seed + 5) > 0.7 ? 1 : 0), spread: 3, radius: 3, stain: [10, 12, 8], strength: 0.7, tides: 2, seed: seed + 2 });
  r.grime({ amount: 0.4, colour: [12, 14, 10] });
  return r;
}

function door(s, seed) {
  const r = new Raster(s, seed);
  woodPlanks(r, { light: P.doorLight, dark: P.doorDark, plankWidth: s / 5, rings: 7, knots: 2, gap: 1, contrast: 0.35, seed: seed + 1 });
  // Two recessed panels, upper and lower, inside a frame of stiles and rails.
  const panel = (x0, y0, x1, y1) => {
    const [a, b, c, d] = [x0 * s, y0 * s, x1 * s, y1 * s].map(Math.round);
    r.shadeRect(a, b, c - a, d - b, 0.72);
    r.raiseRect(a, b, c - a, d - b, -2);
    r.bevel(a, b, c - a, d - b, 1.2, Math.max(2, s / 64));
  };
  panel(0.16, 0.07, 0.84, 0.44);
  panel(0.16, 0.52, 0.84, 0.93);
  runs(r, { count: 18, colour: [18, 16, 10], alpha: 0.3, seed: seed + 3 });
  r.grime({ amount: 0.35, colour: [18, 16, 10] });
  falloff(r, { top: 0.95, bottom: 0.78 });
  return r;
}

function wood(s, seed) {
  const r = new Raster(s, seed);
  woodPlanks(r, { light: P.woodLight, dark: P.woodDark, plankWidth: s / 3, rings: 8, knots: 3, gap: 0, contrast: 0.3, seed: seed + 1 });
  r.scratches({ count: 30, bright: [110, 92, 64] });
  r.grime({ amount: 0.3, colour: [16, 14, 8] });
  return r;
}

function rug(s, seed) {
  const r = new Raster(s, seed);
  const frac = (x) => x - Math.floor(x);
  weave(r, {
    palette: P.rug,
    cells: 64,
    motif: (u, v) => {
      if (u < 0.06 || u > 0.94) return 0;
      if (u < 0.1 || u > 0.9) return 2;
      if (u < 0.13 || u > 0.87) return 4;
      // Concentric diamonds, two to a repeat, each ring a different thread.
      const du = Math.abs(u - 0.5) / 0.37;
      const dv = Math.abs(frac(v * 2) - 0.5) * 2;
      const d = du + dv;
      const ring = Math.floor(d * 5);
      return [4, 1, 0, 2, 1, 3, 0, 1, 0, 0][Math.min(9, ring)];
    },
    // Worn down the middle, where feet went.
    wear: (u) => Math.max(0, 0.55 - Math.abs(u - 0.5) * 2.2),
    fade: [120, 112, 84],
    seed: seed + 1,
  });
  r.grime({ amount: 0.28, colour: [26, 22, 14] });
  return r;
}

function curtain(s, seed) {
  const r = new Raster(s, seed);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const fold = 0.8 + 0.2 * Math.sin((x / s) * Math.PI * 2 * 6 + fbm(x / s, y / s, 2, 2, seed) * 3);
      const c = P.curtain.map((v) => v * fold);
      r.set(x, y, c);
    }
  }
  damp(r, { source: (u, v) => Math.max(0, (v - 0.8) / 0.2), spread: 2, radius: 2, stain: [70, 74, 58], strength: 0.6, tides: 2, seed: seed + 2 });
  r.grime({ amount: 0.25, colour: [60, 64, 50] });
  return r;
}

function night(s, seed) {
  const r = new Raster(s, seed);
  const rand = rng(seed + 1);
  for (let y = 0; y < s; y++) {
    const c = mixRgb(P.nightTop, P.nightBottom, y / s);
    for (let x = 0; x < s; x++) {
      const cloud = fbm(x / s, y / s, 3, 4, seed + 2);
      r.set(x, y, mixRgb(c, [70, 80, 140], Math.max(0, cloud - 0.55) * 1.4));
    }
  }
  // Branches: grown from the bottom corners and the edges, forking as they go.
  const grow = (x, y, angle, len, w, depth) => {
    for (let t = 0; t < len; t++) {
      x += Math.cos(angle);
      y += Math.sin(angle);
      angle += (rand() - 0.5) * 0.18;
      for (let k = -w / 2; k <= w / 2; k++) r.set(x + k, y, P.branch);
      if (depth < 5 && rand() < 0.035) grow(x, y, angle + (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.6), len * 0.6, Math.max(1, w * 0.6), depth + 1);
    }
  };
  for (let i = 0; i < 4; i++) grow(rand() * s, s - 1, -Math.PI / 2 + (rand() - 0.5) * 1.2, s * (0.5 + rand() * 0.5), 4 + rand() * 3, 0);
  // Rain on the glass.
  for (let i = 0; i < 160; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const len = 4 + rand() * 14;
    for (let t = 0; t < len; t++) r.set(x + t * 0.15, y + t, [150, 160, 200], 0.16);
  }
  return r;
}

function paper(s, seed) {
  const r = new Raster(s, seed);
  r.fill(P.paper);
  r.mottle({ frequency: 5, amount: 0.12 });
  damp(r, { source: (u, v) => (u < 0.12 || v > 0.86 ? 1 : 0), spread: 2, radius: 2, stain: [120, 110, 80], strength: 0.5, tides: 2, seed: seed + 2 });
  // Lines of handwriting that never resolve into words.
  const rand = rng(seed + 3);
  for (let line = 0; line < 13; line++) {
    const y = s * 0.12 + line * s * 0.062;
    let x = s * 0.12 + rand() * 6;
    const end = s * (0.75 + rand() * 0.15);
    while (x < end) {
      const w = 3 + rand() * 9;
      for (let t = 0; t < w; t++) r.set(x + t, y + Math.sin((x + t) * 1.7) * 1.2, P.ink, 0.75);
      x += w + 2 + rand() * 3;
    }
  }
  return r;
}

function picture(s, seed) {
  const r = new Raster(s, seed);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s - 0.5;
      const v = y / s - 0.5;
      const vignette = Math.max(0, 1 - (u * u + v * v) * 3.2);
      const base = mixRgb([24, 28, 20], [92, 96, 70], vignette * 0.8 * fbm(x / s, y / s, 3, 3, seed));
      r.set(x, y, base);
    }
  }
  // A figure, or the place one was: a darker shape in the middle.
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = (x / s - 0.5) / 0.16;
      const v = (y / s - 0.45) / 0.3;
      if (u * u + v * v < 1 + noise2(x / s, y / s, 12, seed) * 0.4) r.set(x, y, [20, 22, 16], 0.7);
    }
  }
  r.grime({ amount: 0.4, colour: [14, 16, 10] });
  return r;
}

/**
 * The colour grade as a 2D lookup table: 16 × 16 × 16, laid out as sixteen
 * 16 × 16 tiles side by side, blue choosing the tile. sRGB in, sRGB out.
 */
export function gradeLut() {
  const N = 16;
  const data = new Uint8ClampedArray(N * N * N * 3);
  const ramp = (L) => {
    const stops = GRADE.ramp;
    for (let i = 1; i < stops.length; i++) {
      if (L <= stops[i][0]) {
        const [l0, c0] = stops[i - 1];
        const [l1, c1] = stops[i];
        return mixRgb(c0, c1, (L - l0) / (l1 - l0));
      }
    }
    return stops[stops.length - 1][1];
  };
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let rr = 0; rr < N; rr++) {
        const rgb = [rr, g, b].map((v) => (v / (N - 1)) * 255);
        const L = Math.min(1, (0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])) ** (1 / 2.2) * GRADE.lift);
        const out = mixRgb(ramp(L), rgb, GRADE.keep);
        const i = (g * N * N + b * N + rr) * 3;
        data[i] = out[0];
        data[i + 1] = out[1];
        data[i + 2] = out[2];
      }
    }
  }
  return { width: N * N, height: N, data };
}
