import { CHARSET, rasteriseGlyph } from '../lib/glyphs.js';
import { Raster, rng } from '../lib/raster.js';

/**
 * Bakes the stencil alphabet into one bitmap sheet.
 *
 * The atlas is a coverage mask, not a picture: the glyphs are white on black
 * and the engine uses it as an alpha map, so a label can be sprayed in any
 * paint colour and still take the room's lighting. That is why it carries no
 * grime of its own — wear belongs to the surface underneath, and baking it in
 * would repeat identically on every sign.
 *
 * Unlike every other texture this one is rasterised straight at its final size
 * rather than at double and downsampled. The double-then-shrink path exists to
 * give noise real detail to resolve; run type through it and the downsample is
 * precisely what turns a stem into a grey smudge. The glyph rasteriser is
 * already antialiased, so it draws at 1:1 and nothing is thrown away.
 */

/** Cap height in atlas pixels. Sized so the widest glyph clears its cell. */
const CAP = 22;
const COLS = 8;
const ROWS = 6;

export function synthesiseGlyphAtlas(spec) {
  const size = spec.size;
  const cellW = Math.floor(size / COLS);
  const cellH = Math.floor(size / ROWS);
  if (CHARSET.length > COLS * ROWS) {
    throw new Error(`glyph atlas holds ${COLS * ROWS} cells, charset needs ${CHARSET.length}`);
  }

  const raster = new Raster(size, 0x9e11f);
  raster.fill([0, 0, 0]);

  // One shared stream, so the per-glyph irregularity is stable for a given
  // charset order and the atlas stays byte-reproducible.
  const random = rng(0x51a7c);
  const chars = {};

  CHARSET.forEach((char, i) => {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const mask = rasteriseGlyph(char, CAP, { jitter: 0.02, random });

    if (mask.w > cellW || mask.h > cellH) {
      throw new Error(`glyph "${char}" is ${mask.w}×${mask.h}, cell is ${cellW}×${cellH}`);
    }

    // Seated at the cell's top-left rather than centred, so the engine can
    // derive a glyph's box from its cell index without a per-glyph offset.
    const ox = col * cellW;
    const oy = row * cellH;
    for (let y = 0; y < mask.h; y++) {
      for (let x = 0; x < mask.w; x++) {
        const a = mask.data[y * mask.w + x];
        if (a <= 0.004) continue;
        const level = Math.round(255 * Math.min(1, a));
        raster.set(ox + x, oy + y, [level, level, level]);
      }
    }

    chars[char] = { cell: i, advance: round2(mask.advance), pad: mask.pad };
  });

  return {
    raster,
    metrics: {
      cell: [cellW, cellH],
      grid: [COLS, ROWS],
      cap: CAP,
      chars,
    },
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
