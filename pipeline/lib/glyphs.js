/**
 * Parametric industrial stencil letterforms, drawn in code.
 *
 * There is no font to reach for — Amendment 1's rule is that the generators
 * produce everything, and a shipped typeface is a third-party asset. So each
 * glyph is a skeleton of strokes in a normalised box, rasterised at whatever
 * cell size the atlas wants, with the characteristic stencil bridges punched
 * back out of the closed counters afterwards.
 *
 * Coordinates are 0..1 across the glyph's own advance width and 0..1 up from
 * the baseline to the cap height. Stroke weight is a fraction of cap height, so
 * the whole alphabet scales as one.
 *
 * Legibility at 8–12 px of cap height is the entire point, which drives three
 * choices that would look wrong at display sizes:
 *
 *   - No curves. Every round letter is cut from straight strokes, because a
 *     two-pixel-tall arc is indistinguishable from a corner anyway and costs
 *     contrast to antialias.
 *   - Condensed but not narrow. Around 0.72 of cap height, not the 0.5 a true
 *     stencil would use: at 0.5 the counters close up as soon as the stroke is
 *     heavy enough to survive a downsample.
 *   - Bridges are placed away from the stroke ends, where they read as stencil
 *     rather than as a broken glyph.
 */

/** Stroke primitives. `v` vertical, `h` horizontal, `d` diagonal. */
const v = (x, y0, y1) => ({ t: 'v', x, y0, y1 });
const h = (y, x0, x1) => ({ t: 'h', y, x0, x1 });
const d = (x0, y0, x1, y1) => ({ t: 'd', x0, y0, x1, y1 });
/** A bridge: a gap cut back out of whatever strokes cross it. */
const gap = (x0, y0, x1, y1) => ({ t: 'gap', x0, y0, x1, y1 });

/**
 * Common rails, as fractions of the glyph's own advance width. Cap height is 1
 * and the baseline is 0.
 *
 * The rails are pulled in from the advance edges so a stem's ink stays inside
 * its own advance — otherwise tracking has to absorb the overhang and adjacent
 * letters touch, which is the first thing that went wrong here.
 */
const L = 0.16;
const R = 0.84;
const MID = 0.52;
/** Where a stencil bridge crosses the left stem of a closed letter. */
const BR = [0.44, 0.6];

/**
 * The alphabet. `w` is the advance width as a multiple of cap height; `s` is
 * the stroke list. Anything not listed here renders as a blank of `w` 0.5.
 */
export const GLYPHS = {
  A: { w: 0.76, s: [d(0.5, 1, 0.04, 0), d(0.5, 1, 0.96, 0), h(0.3, 0.22, 0.78), gap(0.4, 0.24, 0.6, 0.36)] },
  // The bridge sits in the upper bowl rather than at BR, which would land on
  // the middle bar and read as two stacked marks instead of a B.
  B: { w: 0.72, s: [v(L, 0, 1), h(1, L, 0.74), h(MID, L, 0.74), h(0, L, 0.8), v(0.8, 0, MID), v(0.74, MID, 1), gap(L - 0.1, 0.66, L + 0.1, 0.82)] },
  C: { w: 0.72, s: [h(1, 0.2, R), h(0, 0.2, R), v(L, 0.14, 0.86), d(L, 0.86, 0.2, 1), d(L, 0.14, 0.2, 0)] },
  D: { w: 0.74, s: [v(L, 0, 1), h(1, L, 0.7), h(0, L, 0.7), v(R, 0.16, 0.84), d(0.7, 1, R, 0.84), d(0.7, 0, R, 0.16), gap(L - 0.1, BR[0], L + 0.1, BR[1])] },
  E: { w: 0.66, s: [v(L, 0, 1), h(1, L, R), h(MID, L, 0.76), h(0, L, R)] },
  F: { w: 0.64, s: [v(L, 0, 1), h(1, L, R), h(MID, L, 0.76)] },
  G: { w: 0.76, s: [h(1, 0.2, 0.8), h(0, 0.2, 0.8), v(L, 0.14, 0.86), v(R, 0.14, 0.44), h(0.44, 0.54, R), d(L, 0.86, 0.2, 1), d(L, 0.14, 0.2, 0), d(R, 0.14, 0.8, 0)] },
  H: { w: 0.74, s: [v(L, 0, 1), v(R, 0, 1), h(MID, L, R)] },
  I: { w: 0.32, s: [v(0.5, 0, 1)] },
  J: { w: 0.62, s: [v(0.7, 0.18, 1), h(0, 0.28, 0.7), v(0.18, 0, 0.34), d(0.18, 0.34, 0.28, 0)] },
  K: { w: 0.72, s: [v(L, 0, 1), d(L + 0.06, 0.46, R, 1), d(L + 0.06, 0.46, R, 0)] },
  L: { w: 0.62, s: [v(L, 0, 1), h(0, L, R)] },
  M: { w: 0.9, s: [v(0.12, 0, 1), v(0.88, 0, 1), d(0.12, 1, 0.5, 0.32), d(0.88, 1, 0.5, 0.32)] },
  N: { w: 0.76, s: [v(L, 0, 1), v(R, 0, 1), d(L, 1, R, 0.06)] },
  O: { w: 0.78, s: [h(1, 0.2, 0.8), h(0, 0.2, 0.8), v(L, 0.14, 0.86), v(R, 0.14, 0.86), d(L, 0.86, 0.2, 1), d(R, 0.86, 0.8, 1), d(L, 0.14, 0.2, 0), d(R, 0.14, 0.8, 0), gap(L - 0.09, BR[0], L + 0.09, BR[1])] },
  P: { w: 0.7, s: [v(L, 0, 1), h(1, L, 0.76), h(0.42, L, 0.76), v(0.8, 0.42, 1), gap(L - 0.1, 0.58, L + 0.1, 0.74)] },
  Q: { w: 0.78, s: [h(1, 0.2, 0.8), h(0.14, 0.2, 0.66), v(L, 0.14, 0.86), v(R, 0.26, 0.86), d(L, 0.86, 0.2, 1), d(R, 0.86, 0.8, 1), d(L, 0.14, 0.2, 0.14), d(R, 0.26, 0.66, 0.14), d(0.56, 0.3, 0.96, -0.06), gap(L - 0.09, BR[0], L + 0.09, BR[1])] },
  R: { w: 0.74, s: [v(L, 0, 1), h(1, L, 0.74), h(0.42, L, 0.74), v(0.78, 0.42, 1), d(0.42, 0.42, R, 0), gap(L - 0.1, 0.58, L + 0.1, 0.74)] },
  S: { w: 0.7, s: [h(1, 0.22, 0.84), h(MID, 0.2, 0.8), h(0, 0.16, 0.78), v(L, MID, 0.86), v(R, 0.14, MID), d(L, 0.86, 0.22, 1), d(R, 0.14, 0.78, 0)] },
  T: { w: 0.7, s: [h(1, 0.04, 0.96), v(0.5, 0, 1)] },
  U: { w: 0.74, s: [v(L, 0.14, 1), v(R, 0.14, 1), h(0, 0.2, 0.8), d(L, 0.14, 0.2, 0), d(R, 0.14, 0.8, 0)] },
  V: { w: 0.74, s: [d(0.04, 1, 0.5, 0), d(0.96, 1, 0.5, 0)] },
  W: { w: 1.0, s: [d(0.04, 1, 0.26, 0), d(0.5, 0.7, 0.26, 0), d(0.5, 0.7, 0.74, 0), d(0.96, 1, 0.74, 0)] },
  X: { w: 0.74, s: [d(0.06, 1, 0.94, 0), d(0.94, 1, 0.06, 0)] },
  Y: { w: 0.72, s: [d(0.06, 1, 0.5, 0.44), d(0.94, 1, 0.5, 0.44), v(0.5, 0, 0.48)] },
  Z: { w: 0.7, s: [h(1, L, R), h(0, L, R), d(R, 1, L, 0)] },

  // A slashed zero, and the slash is also what breaks the counter — so unlike
  // O it carries no left-stem bridge. Without this the two are the same glyph,
  // which matters the moment a compartment is numbered.
  0: { w: 0.72, s: [h(1, 0.22, 0.78), h(0, 0.22, 0.78), v(L, 0.14, 0.86), v(R, 0.14, 0.86), d(L, 0.86, 0.22, 1), d(R, 0.86, 0.78, 1), d(L, 0.14, 0.22, 0), d(R, 0.14, 0.78, 0), d(0.26, 0.24, 0.74, 0.76)] },
  1: { w: 0.44, s: [v(0.6, 0, 1), d(0.6, 1, 0.14, 0.7)] },
  2: { w: 0.7, s: [h(1, 0.2, 0.8), v(R, 0.5, 0.86), h(0, L, R), d(R, 0.5, L, 0.08), d(R, 0.86, 0.8, 1)] },
  3: { w: 0.7, s: [h(1, 0.2, 0.8), h(MID, 0.34, 0.8), h(0, 0.2, 0.8), v(R, 0.14, 0.86), d(R, 0.86, 0.8, 1), d(R, 0.14, 0.8, 0)] },
  4: { w: 0.74, s: [v(0.7, 0, 1), d(0.7, 1, 0.08, 0.3), h(0.3, 0.08, 0.94)] },
  5: { w: 0.7, s: [h(1, L, 0.84), v(L, 0.5, 1), h(0.5, L, 0.78), v(R, 0.14, 0.5), h(0, 0.16, 0.8), d(R, 0.14, 0.8, 0)] },
  6: { w: 0.72, s: [h(1, 0.26, 0.8), v(L, 0.14, 0.84), h(0.46, 0.2, 0.78), h(0, 0.22, 0.78), v(R, 0.14, 0.46), d(L, 0.84, 0.26, 1), d(L, 0.14, 0.22, 0), d(R, 0.14, 0.78, 0), gap(L - 0.1, 0.16, L + 0.1, 0.32)] },
  7: { w: 0.68, s: [h(1, 0.06, 0.94), d(0.86, 1, 0.3, 0)] },
  8: { w: 0.72, s: [h(1, 0.22, 0.78), h(MID, 0.22, 0.78), h(0, 0.22, 0.78), v(L, 0.14, 0.86), v(R, 0.14, 0.86), d(L, 0.86, 0.22, 1), d(R, 0.86, 0.78, 1), d(L, 0.14, 0.22, 0), d(R, 0.14, 0.78, 0), gap(L - 0.1, 0.62, L + 0.1, 0.78)] },
  9: { w: 0.72, s: [h(1, 0.22, 0.78), h(0.42, 0.2, 0.78), h(0, 0.2, 0.74), v(L, 0.42, 0.86), v(R, 0.14, 0.86), d(L, 0.86, 0.22, 1), d(R, 0.86, 0.78, 1), d(R, 0.14, 0.74, 0), gap(L - 0.1, 0.56, L + 0.1, 0.72)] },

  '-': { w: 0.5, s: [h(0.46, 0.1, 0.9)] },
  '.': { w: 0.3, s: [h(0.05, 0.28, 0.72), h(0.15, 0.28, 0.72)] },
  ':': { w: 0.3, s: [h(0.2, 0.28, 0.72), h(0.3, 0.28, 0.72), h(0.66, 0.28, 0.72), h(0.76, 0.28, 0.72)] },
  '/': { w: 0.56, s: [d(0.86, 1.04, 0.14, -0.04)] },
  '(': { w: 0.4, s: [v(0.62, 0.14, 0.86), d(0.62, 0.86, 0.86, 1.04), d(0.62, 0.14, 0.86, -0.04)] },
  ')': { w: 0.4, s: [v(0.38, 0.14, 0.86), d(0.38, 0.86, 0.14, 1.04), d(0.38, 0.14, 0.14, -0.04)] },
  ' ': { w: 0.42, s: [] },
};

export const CHARSET = Object.keys(GLYPHS);

/**
 * Rasterises one glyph into a coverage mask.
 *
 * Returns `{ w, h, data }` where data is a Float32Array of 0..1 coverage. The
 * mask is one glyph wide plus the stroke weight either side, so a stem sitting
 * on the advance edge is not clipped.
 */
export function rasteriseGlyph(char, capPx, { weight = 0.17, jitter = 0, random = () => 0.5 } = {}) {
  const glyph = GLYPHS[char] || GLYPHS[' '];
  const stroke = Math.max(1.4, weight * capPx);
  const half = stroke / 2;
  const pad = Math.ceil(half) + 1;

  const w = Math.ceil(glyph.w * capPx) + pad * 2;
  const h = Math.ceil(capPx) + pad * 2;
  const data = new Float32Array(w * h);

  // Glyph space → mask space. x is a fraction of this glyph's own advance, not
  // of the cap height — scaling it by capPx draws every letter wider than its
  // advance and marches it into its neighbour. y is flipped: y = 0 is the
  // baseline, at the bottom of the mask.
  const advance = glyph.w * capPx;
  const sx = (gx) => pad + gx * advance;
  const sy = (gy) => pad + (1 - gy) * capPx;

  // A per-glyph shove, so a line of type is not mechanically even. Kept well
  // under a pixel at the sizes that matter, or it reads as a mistake.
  const ox = jitter ? (random() - 0.5) * jitter * capPx : 0;
  const oy = jitter ? (random() - 0.5) * jitter * capPx : 0;

  const cover = (x, y, amount) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (amount > data[i]) data[i] = amount;
  };

  /** Antialiased thick segment, via distance to the segment. */
  const segment = (x0, y0, x1, y1) => {
    const ax = sx(x0) + ox;
    const ay = sy(y0) + oy;
    const bx = sx(x1) + ox;
    const by = sy(y1) + oy;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + half + 1));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - half - 1));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by) + half + 1));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + t * dx - px;
        const qy = ay + t * dy - py;
        const dist = Math.hypot(qx, qy);
        // Square-ended strokes read heavier at small sizes than round ones, so
        // the falloff is deliberately tight rather than a soft radial.
        cover(x, y, clamp01((half + 0.5 - dist) / 1.0));
      }
    }
  };

  for (const p of glyph.s) {
    if (p.t === 'v') segment(p.x, p.y0, p.x, p.y1);
    else if (p.t === 'h') segment(p.x0, p.y, p.x1, p.y);
    else if (p.t === 'd') segment(p.x0, p.y0, p.x1, p.y1);
  }

  // Stencil bridges last, cut back out of whatever crossed them.
  for (const p of glyph.s) {
    if (p.t !== 'gap') continue;
    const x0 = Math.floor(sx(p.x0) + ox);
    const x1 = Math.ceil(sx(p.x1) + ox);
    const y1 = Math.ceil(sy(p.y0) + oy);
    const y0 = Math.floor(sy(p.y1) + oy);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        data[y * w + x] = 0;
      }
    }
  }

  return { w, h, data, pad, advance };
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
