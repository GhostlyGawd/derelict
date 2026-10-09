/**
 * The statistics the house's look is held to (9.4.5), for the style harness
 * and the tuner alike: over a whole frame, and over a grid of regions of it.
 * Both take sRGB bytes at the reference's measuring size, 448 × 299.
 */

/** The regions: four across and three down. */
export const GRID = { cols: 4, rows: 3 };

/**
 * The corners the reference's interface panels cover, and the handheld
 * covers in ours, as fractions of the frame. Left out of every region on
 * both sides, so a region compares room with room.
 */
export const HUD = [
  { x0: 0, x1: 0.16, y0: 0.84, y1: 1 },
  { x0: 0.83, x1: 1, y0: 0.76, y1: 1 },
];

const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function stats(rgb, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  let green = 0;
  let sat = 0;
  let mean = [0, 0, 0];
  const colours = new Set();
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    mean[0] += r;
    mean[1] += g;
    mean[2] += b;
    lum[i] = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    if (g >= r && g >= b) green++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0;
    colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const sorted = Float32Array.from(lum).sort();
  const pct = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  // Fine detail: mean absolute Laplacian of the grey image, 0–255.
  let detail = 0;
  const grey = (x, y) => {
    const i = (y * w + x) * 3;
    return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      detail += Math.abs(4 * grey(x, y) - grey(x - 1, y) - grey(x + 1, y) - grey(x, y - 1) - grey(x, y + 1));
    }
  }
  return {
    meanSrgb: mean.map((v) => Math.round(v / n)),
    p5: pct(0.05),
    p50: pct(0.5),
    p95: pct(0.95),
    greenDominant: green / n,
    saturation: sat / n,
    detail: detail / ((w - 2) * (h - 2)),
    colours15: colours.size,
  };
}

/** Per region: mean linear luminance, its median, mean saturation and fine detail. */
export function regions(rgb, w, h) {
  const out = [];
  const grey = (x, y) => {
    const i = (y * w + x) * 3;
    return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  };
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const x0 = Math.floor((c * w) / GRID.cols);
      const x1 = Math.floor(((c + 1) * w) / GRID.cols);
      const y0 = Math.floor((r * h) / GRID.rows);
      const y1 = Math.floor(((r + 1) * h) / GRID.rows);
      const lums = [];
      let sat = 0;
      let detail = 0;
      let nd = 0;
      const mean = [0, 0, 0];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (HUD.some((b) => x / w >= b.x0 && x / w < b.x1 && y / h >= b.y0 && y / h < b.y1)) continue;
          const i = (y * w + x) * 3;
          const [R, G, B] = [rgb[i], rgb[i + 1], rgb[i + 2]];
          lums.push(0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B));
          mean[0] += R;
          mean[1] += G;
          mean[2] += B;
          const mx = Math.max(R, G, B);
          sat += mx ? (mx - Math.min(R, G, B)) / mx : 0;
          if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
            detail += Math.abs(4 * grey(x, y) - grey(x - 1, y) - grey(x + 1, y) - grey(x, y - 1) - grey(x, y + 1));
            nd++;
          }
        }
      }
      const n = lums.length;
      lums.sort((a, b) => a - b);
      out.push({
        mean: lums.reduce((a, b) => a + b, 0) / n,
        p50: lums[n >> 1],
        saturation: sat / n,
        detail: detail / nd,
        meanSrgb: mean.map((v) => Math.round(v / n)),
      });
    }
  }
  return out;
}
