import { Raster, rng } from '../lib/raster.js';

/**
 * Phase 6 — the outside.
 *
 * Six cube faces, each drawn by asking one question per texel: what is in that
 * direction? Faces drawn that way meet at their seams by construction, since
 * neighbouring texels on two faces are asking about neighbouring directions.
 * Drawing each face as a flat picture and hoping the edges agree is the
 * alternative, and it is the one that produces a visible box.
 *
 * Laid out for where the player is when they first see it: walking north (-Z)
 * out of the outer door. The lit limb of a large body fills the lower half of
 * the view ahead, the sun is one hard point up and to the left of it, and the
 * stars are everywhere else — including behind, where turning round shows the
 * hull blotting them out.
 *
 * Face order and orientation are the standard cube-map convention (+X, -X, +Y,
 * -Y, +Z, -Z, image rows top-down). three.js samples a CubeTexture with x
 * negated, so each texel asks about the world direction with x flipped back —
 * see `worldDirection`.
 */

export const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/** The body ahead and below. Distance is in units of its own radius. */
const PLANET = {
  dir: norm([0.18, -0.62, -1]),
  /** Angular radius, radians. ~36° — big enough to be a place, not a moon. */
  radius: 0.62,
  /** Polar axis, tilted so the bands run across the view rather than level. */
  axis: norm([0.22, 1, 0.34]),
};

const SUN = {
  dir: norm([-0.86, 0.34, -0.3]),
  /** Angular radius of the hard disc, radians (~1.1°). */
  disc: 0.019,
};

/** Banded cloud colours, from the style bible's palette rather than a photo. */
const BANDS = [
  [0x8e, 0x7c, 0x52],
  [0x5a, 0x58, 0x3a],
  [0xa0, 0x84, 0x58],
  [0x6e, 0x56, 0x3a],
  [0x86, 0x82, 0x5e],
  [0x4a, 0x46, 0x32],
];
const ATMOSPHERE = [0x8c, 0xc4, 0x9c];
const SPACE = [0x03, 0x04, 0x07];

export function synthesiseSky(spec) {
  const size = spec.size;
  const faces = {};
  for (let f = 0; f < 6; f++) {
    const raster = new Raster(size, spec.seed + f);
    const random = rng(spec.seed * 31 + f * 7919);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = worldDirection(f, x, y, size);
        raster.set(x, y, sample(d, random, spec.seed));
      }
    }
    faces[FACES[f]] = raster;
  }
  return faces;
}

/** The world direction a texel shows, after three.js's x-flip on cube maps. */
function worldDirection(face, x, y, size) {
  const s = (2 * (x + 0.5)) / size - 1;
  const t = (2 * (y + 0.5)) / size - 1;
  let c;
  switch (face) {
    case 0: c = [1, -t, -s]; break;
    case 1: c = [-1, -t, s]; break;
    case 2: c = [s, 1, t]; break;
    case 3: c = [s, -1, -t]; break;
    case 4: c = [s, -t, 1]; break;
    default: c = [-s, -t, -1]; break;
  }
  return norm([-c[0], c[1], c[2]]);
}

function sample(d, random, seed) {
  const planet = planetAt(d, seed);
  if (planet) return planet;

  // The atmosphere extends a little past the solid limb, brightest on the sun
  // side. It is the one soft thing in the picture, so it is kept thin.
  const ang = Math.acos(clamp(dot(d, PLANET.dir), -1, 1));
  const outside = ang - PLANET.radius;
  let rgb = SPACE.slice();

  // A faint band of unresolved stars, along a great circle well away from the
  // planet, so the dark is not one flat value.
  const band = Math.abs(dot(d, norm([0.3, 0.55, 0.78])));
  const dust = (1 - smoothstep(0, 0.32, band)) * (0.55 + 0.45 * noise3(d, 5, seed + 3));
  rgb = add(rgb, scale([0x1a, 0x1c, 0x22], dust * 0.7));

  if (outside < 0.07) {
    const k = 1 - outside / 0.07;
    const lit = clamp(dot(limbNormal(d), SUN.dir) * 0.8 + 0.35, 0, 1);
    rgb = add(rgb, scale(ATMOSPHERE, k * k * k * lit * 0.55));
  }

  // Stars: single texels, so they survive the crunch as points rather than
  // being averaged into the dark. The count is per texel, not per face, so it
  // does not depend on which face a direction landed on.
  const r = random();
  if (r < 0.0055 && outside > 0.01) {
    const m = Math.pow(random(), 2.4);
    const warm = random();
    const tint = warm < 0.2 ? [255, 214, 170] : warm > 0.85 ? [180, 210, 255] : [235, 240, 236];
    rgb = add(rgb, scale(tint, 0.18 + m * 0.82));
  }

  // The sun: one hard disc and a short falloff. Not a lens flare — there is no
  // lens, and nothing else in the game pretends there is one.
  const sunAng = Math.acos(clamp(dot(d, SUN.dir), -1, 1));
  if (sunAng < SUN.disc) return [255, 252, 240];
  const glow = Math.exp(-(sunAng - SUN.disc) / 0.035);
  rgb = add(rgb, scale([255, 236, 200], glow * 0.9));
  return rgb.map((v) => clamp(v, 0, 255) | 0);
}

/**
 * Where the direction hits the planet, the surface normal there, and the
 * shading. The planet is a sphere of radius 1 at distance 1 / sin(radius), so
 * its disc subtends exactly the angular radius above.
 */
function planetAt(d, seed) {
  const dist = 1 / Math.sin(PLANET.radius);
  const centre = scale(PLANET.dir, dist);
  const b = dot(d, centre);
  const c = dot(centre, centre) - 1;
  const disc = b * b - c;
  if (disc < 0) return null;
  const tHit = b - Math.sqrt(disc);
  if (tHit <= 0) return null;
  const n = norm(sub(scale(d, tHit), centre));

  const light = dot(n, SUN.dir);
  // A soft terminator, then black. The night side is not lit by anything.
  const day = smoothstep(-0.08, 0.35, light);

  // Latitude bands along the tilted axis, wobbled by noise so they read as
  // weather rather than as stripes.
  const lat = dot(n, PLANET.axis);
  const wobble = (noise3(n, 3, seed + 17) - 0.5) * 0.1 + (noise3(n, 11, seed + 23) - 0.5) * 0.035;
  const bandPos = (lat + wobble + 1) * 7.5;
  const i0 = Math.floor(bandPos);
  const tb = smoothstep(0.35, 0.65, bandPos - i0);
  const colour = mix(BANDS[((i0 % 6) + 6) % 6], BANDS[(((i0 + 1) % 6) + 6) % 6], tb);

  // Limb darkening on the disc, and a lift where the atmosphere is thick.
  const view = -dot(n, d);
  const limb = 0.55 + 0.45 * Math.pow(clamp(view, 0, 1), 0.6);
  let rgb = scale(colour, day * limb * 1.05);
  const rim = Math.pow(1 - clamp(view, 0, 1), 3);
  rgb = add(rgb, scale(ATMOSPHERE, rim * day * 0.5));
  // A trace of reflected light on the night side, so the disc is a disc against
  // the stars rather than a hole in them.
  rgb = add(rgb, scale([0x10, 0x12, 0x10], 1 - day));
  return rgb.map((v) => clamp(v, 0, 255) | 0);
}

function limbNormal(d) {
  // The nearest point on the limb, approximated by pushing the direction onto
  // the planet's apparent edge. Only used to decide which side of the
  // atmosphere is lit, so an approximation is enough.
  const toward = norm(sub(d, scale(PLANET.dir, dot(d, PLANET.dir))));
  return norm(add(scale(toward, 1), scale(PLANET.dir, -0.2)));
}

// ---------------------------------------------------------------- maths --

function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on directions. Seamless across faces because it never sees one. */
function noise3(p, frequency, seed) {
  const x = (p[0] + 1) * frequency;
  const y = (p[1] + 1) * frequency;
  const z = (p[2] + 1) * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const at = (i, j, k) => hash3(x0 + i, y0 + j, z0 + k, seed);
  const lx = (j, k) => lerp(at(0, j, k), at(1, j, k), tx);
  return lerp(lerp(lx(0, 0), lx(1, 0), ty), lerp(lx(0, 1), lx(1, 1), ty), tz);
}

const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, v) => fade(clamp((v - a) / (b - a), 0, 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
