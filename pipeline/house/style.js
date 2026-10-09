/**
 * The house's style target (phase 9, 9.4.5): the look as numbers, not only as
 * prose. Measured from the owner's reference as statistics only. Nothing in
 * the image is copied, sampled or committed.
 *
 * The generators read the palette. The colour grade is derived from `grade`.
 * The style harness (tools/house/style.mjs) holds rendered frames of the
 * house to `target` within the tolerances it states.
 */

export const STYLE_BIBLE_HOUSE =
  'A damp house at night, late-1990s first-person adventure. Stained, peeling green plaster, dark worn wood, ' +
  'a patterned runner rug, one pendant lamp, blue night through small panes. Everything carries a damp green cast. ' +
  'Painted rather than photographed: brush strokes, blooms of damp with tide lines, grain that flows round knots.';

/** Measured from the reference at 448 × 299. */
export const TARGET = {
  meanSrgb: [35, 46, 27],
  luminance: { p5: 0.006, p50: 0.015, p95: 0.159 },
  greenDominant: 0.96,
  saturation: 0.45,
  detail: 10.0,
  colours15: 763,
};

/** The surface palette every house generator draws from. sRGB, 0–255. */
export const PALETTE = {
  // From yellow-green where the paint holds the light, through olive, to the
  // grey-blue of plaster gone cold: the reference's walls are never one green.
  plaster: [[112, 126, 94], [92, 108, 76], [124, 132, 102], [76, 92, 62], [104, 114, 84], [134, 140, 110], [146, 142, 98], [88, 104, 100], [66, 76, 50], [158, 160, 126]],
  plasterBase: [100, 114, 84],
  damp: [26, 34, 20],
  tide: [14, 20, 10],
  flakeUnder: [64, 62, 46],
  floor: [[76, 86, 66], [64, 74, 56], [86, 94, 72], [58, 66, 50]],
  floorBase: [72, 82, 62],
  ceilingLight: [34, 32, 24],
  ceilingDark: [16, 16, 12],
  doorLight: [78, 64, 42],
  doorDark: [32, 26, 16],
  woodLight: [70, 54, 36],
  woodDark: [28, 22, 14],
  rug: [[44, 32, 20], [158, 116, 56], [124, 72, 36], [96, 94, 48], [22, 18, 12]],
  curtain: [150, 156, 136],
  nightTop: [52, 60, 128],
  nightBottom: [24, 28, 70],
  branch: [8, 10, 18],
  paper: [184, 174, 142],
  ink: [52, 46, 36],
};

/**
 * The colour grade, as a function of the frame's own colour: luminance is
 * mapped onto a damp green ramp, and `keep` of the original colour survives
 * on top of it, so the rug stays ochre and the window stays blue under the
 * green. Quantised to 15-bit with an ordered dither in the renderer, which is
 * where the reference's slightly painted banding comes from.
 */
export const GRADE = {
  ramp: [
    [0.0, [4, 7, 3]],
    [0.12, [20, 30, 14]],
    [0.35, [58, 76, 42]],
    [0.65, [132, 156, 100]],
    [1.0, [228, 238, 196]],
  ],
  keep: 0.55,
  lift: 1.2,
};
