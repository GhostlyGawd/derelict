import { rasteriseGlyph } from '../lib/glyphs.js';
import { Raster } from '../lib/raster.js';

/**
 * Phase 8 — the icon (8.3.6). What the game is on a home screen: one bulkhead
 * plate, riveted and worn like every wall on the ship, carrying the one
 * stencilled letter the ship would put on its own hull, lit in readout green
 * the way the panels are. The letter is drawn by the same parametric
 * letterforms as the glyph atlas, so it is the ship's own type and not a font.
 *
 * Drawn at 512 and downsampled for the smaller sizes, like every texture.
 */
export function synthesiseIcon(spec) {
  const size = 512;
  const r = new Raster(size, spec.seed);

  // The plate: dark gunmetal, mottled and grimed, with its edge bevelled.
  r.fill([52, 58, 52]);
  r.mottle({ frequency: 6, octaves: 4, amount: 0.22 });
  r.grime({ frequency: 3, octaves: 5, amount: 0.45 });
  r.streaks({ count: 18, maxLength: 0.35 });
  r.scratches({ count: 26 });
  r.bevel(18, 18, size - 36, size - 36, 1.4, 10);
  for (const [x, y] of [
    [48, 48],
    [size - 48, 48],
    [48, size - 48],
    [size - 48, size - 48],
  ]) {
    r.rivet(x, y, 9, [96, 102, 94]);
  }

  // A recessed readout behind the letter, the colour of a dead screen.
  const inset = 108;
  r.rect(inset, inset, size - inset * 2, size - inset * 2, [10, 16, 13]);
  r.outline(inset, inset, size - inset * 2, size - inset * 2, [24, 34, 28], 1, 4);

  // The letter, stencilled in the green the panels use for "live", with a soft
  // glow round it so it reads as lit rather than painted.
  const cap = 230;
  const glyph = rasteriseGlyph(spec.glyph, cap, { weight: 0.19 });
  const ox = Math.round((size - glyph.w) / 2);
  const oy = Math.round((size - glyph.h) / 2);
  const GREEN = [123, 255, 154];
  for (let pass = 0; pass < 2; pass++) {
    const spread = pass === 0 ? 7 : 0;
    for (let y = 0; y < glyph.h; y++) {
      for (let x = 0; x < glyph.w; x++) {
        const c = glyph.data[y * glyph.w + x];
        if (c <= 0) continue;
        if (pass === 0) {
          // Halo: a cheap box blur of coverage, stamped dim.
          for (let j = -spread; j <= spread; j += 3) {
            for (let i = -spread; i <= spread; i += 3) r.set(ox + x + i, oy + y + j, [40, 110, 62], c * 0.08);
          }
        } else {
          r.set(ox + x, oy + y, GREEN, c);
        }
      }
    }
  }
  return r;
}
