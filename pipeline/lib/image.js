import sharp from 'sharp';

/**
 * Image post-processing shared by both backends.
 *
 * Whatever produced the pixels — a generation API or the offline synthesiser —
 * every texture leaves here downscaled into the 256–512 px band and quantised
 * to a small palette, which is most of what sells the low-resolution
 * game-texture look the style bible asks for.
 */

export function encodeRaster(raster) {
  return sharp(raster.toBuffer(), {
    raw: { width: raster.size, height: raster.size, channels: 3 },
  })
    .png()
    .toBuffer();
}

/**
 * Lossless PNG for a coverage mask, with every encoder knob pinned.
 *
 * sharp's `.png()` defaults are not a stable contract across libvips builds:
 * the glyph atlas reproduced one byte differently on CI than locally, which is
 * enough to fail the determinism gate. Every other texture already passes
 * explicit options, which is why only this one drifted.
 *
 * `palette: false` deliberately: this is a greyscale coverage ramp, and
 * quantising it would cost contrast inside the letterforms.
 */
export function encodeMask(raster) {
  return sharp(raster.toBuffer(), {
    raw: { width: raster.size, height: raster.size, channels: 3 },
  })
    .png({ compressionLevel: 9, effort: 10, palette: false, adaptiveFiltering: false })
    .toBuffer();
}

export async function crunchTexture(input, targetSize, { colours = 160 } = {}) {
  return sharp(input)
    .resize(targetSize, targetSize, { kernel: 'mitchell', fit: 'fill' })
    .png({ compressionLevel: 9, palette: true, colours, dither: 0.4, effort: 8 })
    .toBuffer();
}

/** Model textures get crunched harder — 256 px, per the spec's post-process. */
export async function crunchModelTexture(input, targetSize = 256) {
  return sharp(input)
    .resize(targetSize, targetSize, { kernel: 'mitchell', fit: 'fill' })
    .png({ compressionLevel: 9, palette: true, colours: 128, dither: 0.35, effort: 8 })
    .toBuffer();
}

/** Concept images go to the image→3D service as a square PNG. */
export async function normaliseConcept(input, size = 1024) {
  return sharp(input)
    .resize(size, size, { kernel: 'lanczos3', fit: 'cover' })
    .png()
    .toBuffer();
}

export async function describe(buffer) {
  const meta = await sharp(buffer).metadata();
  return `${meta.width}×${meta.height} ${meta.format}`;
}

/** Contact sheet of every generated texture, for eyeballing a pipeline run. */
export async function contactSheet(entries, columns = 4, cellSize = 256) {
  const rows = Math.ceil(entries.length / columns);
  const tiles = await Promise.all(
    entries.map(async (entry, i) => ({
      input: await sharp(entry.buffer)
        .resize(cellSize, cellSize, { kernel: 'nearest', fit: 'fill' })
        .toBuffer(),
      left: (i % columns) * cellSize,
      top: Math.floor(i / columns) * cellSize,
    }))
  );
  return sharp({
    create: {
      width: columns * cellSize,
      height: rows * cellSize,
      channels: 3,
      background: { r: 8, g: 10, b: 9 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();
}
