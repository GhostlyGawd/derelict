import sharp from 'sharp';

/**
 * The painting's structure (9.3, the owner's look at the modelled hall): how
 * far a frame's light and dark, and its edges, fall where the painting's do,
 * region by region, four across and three down. Each region's score is the
 * mean of two correlations, of the two pictures' luminance and of their edge
 * strength, at the scale of the room's shapes rather than its brushwork. A
 * flat or random frame scores 0, the painting itself 1.
 */
export const SW = 168;
export const SH = 112;

export async function luminance(input) {
  return new Float32Array(await sharp(input).resize(SW, SH, { fit: 'fill' }).greyscale().blur(1).raw().toBuffer());
}

function gradient(a) {
  const g = new Float32Array(SW * SH);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x;
    g[i] = Math.hypot(a[i + 1] - a[i - 1], a[i + SW] - a[i - SW]);
  }
  return g;
}

function correlation(a, b, rx, ry) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = Math.floor((ry * SH) / 3) + 1; y < Math.floor(((ry + 1) * SH) / 3) - 1; y++) {
    for (let x = Math.floor((rx * SW) / 4) + 1; x < Math.floor(((rx + 1) * SW) / 4) - 1; x++) {
      const p = a[y * SW + x];
      const q = b[y * SW + x];
      n++;
      sa += p;
      sb += q;
      saa += p * p;
      sbb += q * q;
      sab += p * q;
    }
  }
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  if (va < 1e-6 || vb < 1e-6) return 0;
  return (sab / n - (sa * sb) / n / n) / Math.sqrt(va * vb);
}

/** The twelve regions' scores, top row first, of frame `b` against painting `a` (both from `luminance`). */
export function structure(a, b) {
  const ga = gradient(a);
  const gb = gradient(b);
  const out = [];
  for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 4; rx++) out.push((correlation(a, b, rx, ry) + correlation(ga, gb, rx, ry)) / 2);
  return out;
}

export const REGION_NAMES = [0, 1, 2].flatMap((ry) => [0, 1, 2, 3].map((rx) => `${['top', 'middle', 'bottom'][ry]} ${['left', 'centre-left', 'centre-right', 'right'][rx]}`));
