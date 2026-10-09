import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { chartPoint, chartSize, chartsFor } from '../../src/house/charts.js';
import { NIGHT_FILL, dressHouse } from '../../src/house/dress.js';
import { LININGS } from '../../src/house/rooms.js';
import { SPACES, SPAWN, STAIRS, WALLS, spaceAt } from '../../src/house/layout.js';
import { buildHouse } from '../../src/house/level.js';
import { buildThings } from '../../src/house/things.js';
import { fbm, noise2, rng } from '../lib/raster.js';
import { checkLight, readLight } from './blender/run.js';

/**
 * Baked surfaces (phase 9, 9.4.4): each wall, floor and ceiling of a room,
 * lit, dirtied and painted at build time, as the games of the reference's
 * era carried their light and grime in every surface.
 *
 * For every texel of a chart (src/house/charts.js):
 *
 *   1. its colour, from the generated surface the game tiles there;
 *   2. grime, placed by the house's geometry: damp rising from the floor with
 *      a tide line, streaks under sills and down from the ceiling, dirt where
 *      light cannot reach, hand marks round door openings, and boards worn
 *      pale along the walks between doors;
 *   3. light: Blender's path-traced bake of the room's lamps and windows
 *      (pipeline/house/blender), committed beside the pipeline, and the
 *      night's cool fill scaled by ambient occlusion traced here
 *      (three-mesh-bvh). Lamp power is converted so a baked wall agrees with
 *      the furniture the same lamp lights live in front of it;
 *   4. then the whole texture is painted over: a Kuwahara filter, and brush
 *      strokes laid along its contours.
 *
 * How strong each part is lives in look.json, which the tuner turns
 * (tools/house/tune.mjs). Every random choice is seeded, and the sample
 * patterns are fixed, so a clean checkout bakes the same bytes.
 */

/** The rooms baked so far. The hall first, as the look was proved there first. */
export const BAKED_ROOMS = SPACES.map((s) => s.id);

/** Where each room's lamps hang, from the lights the game builds: soot gathers on the ceiling over them. */
const LAMPS_BY_ROOM = (() => {
  const mats = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? (t[k] ??= new THREE.MeshBasicMaterial({ name: k })) : undefined) });
  const out = new Map();
  for (const l of dressHouse(mats).lights) {
    if (!l.isSpotLight && !l.isPointLight) continue;
    const room = spaceAt(l.position.x, l.position.z, l.position.y - 1)?.id;
    if (!out.has(room)) out.set(room, []);
    out.get(room).push([l.position.x, l.position.y, l.position.z]);
  }
  return out;
})();

// ---- The house, as something to trace rays against ----------------------------

/** Every static surface of the house: shell, dressing, furniture. Not the doors, which open. */
function houseBVH() {
  const mats = new Proxy({}, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (!t[k]) t[k] = new THREE.MeshBasicMaterial({ name: k });
      return t[k];
    },
  });
  const root = new THREE.Group();
  root.add(buildHouse(mats).group);
  root.add(dressHouse(mats).group);
  const things = buildThings(mats);
  root.add(things.group);
  const moving = new Set();
  for (const d of things.doors) for (const m of d.meshes) m.traverse((o) => moving.add(o));
  // Things that give light or let it through do not block it.
  const clear = new Set(['shade', 'lampshade', 'night', 'paper']);
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || moving.has(o)) return;
    const m = o.material;
    if (m.transparent || clear.has(m.name)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  const merged = mergeGeometries(parts, false);
  return new MeshBVH(merged);
}

// ---- Surfaces --------------------------------------------------------------------

async function readTexture(dir, id) {
  const load = async (file) => {
    const { data, info } = await sharp(path.join(dir, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  };
  return { colour: await load(`${id}.png`), normal: await load(`${id}_n.png`) };
}

const toLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (c) => {
  c = Math.max(0, Math.min(1, c));
  return (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
};
const LIN = new Float32Array(256).map((_, i) => toLinear(i));

/** A tiled texture's texel at (u, v), as three samples it: repeat-wrapped, row 0 at the top. */
function texel(img, u, v) {
  const x = Math.floor((u - Math.floor(u)) * img.w);
  const y = Math.floor((1 - (v - Math.floor(v))) * img.h);
  const i = (Math.min(img.h - 1, y) * img.w + Math.min(img.w - 1, x)) * 3;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/**
 * Where a chart samples its generated surface, and the directions its texture
 * runs in the house, as `worldUV` in src/house/surfaces.js lays them out.
 */
function surfaceFor(c) {
  const linear = (hex) => {
    const col = new THREE.Color(hex);
    return [col.r, col.g, col.b];
  };
  const space = SPACES.find((s) => s.id === c.space);
  if (c.kind === 'wall') {
    const alongZ = c.u[2] !== 0;
    const along = (p) => (alongZ ? p[2] : p[0]);
    // A room's paint over the plaster, and its wainscot or tiled dado below,
    // exactly as src/house/rooms.js lines the walls the skin lies over.
    const lining = LININGS[c.space];
    const paint = lining ? linear(lining.paint) : [1, 1, 1];
    return {
      ids: lining?.under ? ['plaster', lining.under] : ['plaster'],
      tangent: alongZ ? [0, 0, 1] : [1, 0, 0],
      bitangent: [0, 1, 0],
      at: (p) =>
        lining?.dado && p[1] - c.floorY < lining.dado
          ? { id: lining.under, uv: [along(p), p[1]], tint: [1, 1, 1] }
          : { id: 'plaster', uv: [along(p) / 2.8, (p[1] - c.floorY) / 2.8], tint: paint },
    };
  }
  const id = c.kind === 'ceiling' ? 'ceiling' : space.surface === 'tile' ? 'tile' : 'floor';
  const tile = id === 'tile' ? 1 : 2;
  return { ids: [id], tangent: [1, 0, 0], bitangent: [0, 0, 1], at: (p) => ({ id, uv: [p[0] / tile, p[2] / tile], tint: [1, 1, 1] }) };
}

// ---- Light -----------------------------------------------------------------------

const ray = new THREE.Ray();
const n3 = new THREE.Vector3();

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ambient occlusion: the share of a cosine-weighted hemisphere open within `reach` metres. */
const AO_DIRS = (() => {
  const out = [];
  const count = 24;
  for (let i = 0; i < count; i++) {
    // Hammersley points, cosine-weighted.
    let bits = i;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / count;
    const w = bits / 4294967296;
    const r = Math.sqrt(u);
    const phi = 2 * Math.PI * w;
    out.push([r * Math.cos(phi), Math.sqrt(1 - u), r * Math.sin(phi)]);
  }
  return out;
})();

function occlusion(bvh, p, n, spin, reach = 0.7) {
  // A frame round the normal, turned by `spin` so neighbouring texels sample differently.
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const b1 = new THREE.Vector3(...t).cross(n3.set(...n)).normalize();
  const b2 = n3.clone().cross(b1);
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  let open = 0;
  for (const [x, y, z] of AO_DIRS) {
    const rx = x * cs - z * sn;
    const rz = x * sn + z * cs;
    const dir = b1.clone().multiplyScalar(rx).addScaledVector(n3, y).addScaledVector(b2, rz);
    ray.origin.set(p[0] + n[0] * 0.01, p[1] + n[1] * 0.01, p[2] + n[2] * 0.01);
    ray.direction.copy(dir);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, reach);
    open += hit ? hit.distance / reach : 1;
  }
  return open / AO_DIRS.length;
}

// ---- Grime -----------------------------------------------------------------------

/** Where people walked: between every doorway of the room, the stairs' foot and where the player starts. */
function walksFor(space) {
  const points = [];
  for (const w of WALLS) {
    if (w.y !== space.y) continue;
    for (const o of w.openings || []) {
      if (o.kind === 'window') continue;
      const p = w.axis === 'x' ? [w.at, o.center] : [o.center, w.at];
      const inside = (x, z) => x > space.x[0] - 0.01 && x < space.x[1] + 0.01 && z > space.z[0] - 0.01 && z < space.z[1] + 0.01;
      if (!inside(p[0], p[1])) continue;
      // A step into the room from the doorway.
      const cx = (space.x[0] + space.x[1]) / 2;
      const cz = (space.z[0] + space.z[1]) / 2;
      points.push(w.axis === 'x' ? [p[0] + Math.sign(cx - p[0]) * 0.4, p[1]] : [p[0], p[1] + Math.sign(cz - p[1]) * 0.4]);
    }
  }
  if (space.id === 'hall') {
    points.push([SPAWN.pos[0], SPAWN.pos[2]]);
    points.push([(STAIRS.x[0] + STAIRS.x[1]) / 2, STAIRS.z[1] + 0.3]);
  }
  // Each doorway to the middle of the room, as people cross a room: a star,
  // not every pair, which wore the whole floor pale.
  const mid = [(space.x[0] + space.x[1]) / 2, (space.z[0] + space.z[1]) / 2];
  const lines = points.map((p) => [p, mid]);
  return lines;
}

function distanceToSegment(x, z, [a, b]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

/**
 * The grime at a point, as a colour to move toward and how far. Every mask
 * is a fact about the house (height above the floor, a sill above, a door
 * beside, a walk across) broken up by seeded noise.
 */
function grime(c, sc, tc, p, ao, walks) {
  const out = { dirt: 0, damp: 0, tide: 0, wear: 0, soot: 0, mottle: 1 };
  // Patchy plaster and boards: a mid-sized light-and-dark mottle over every surface,
  // so it reads as old paint and old wood at a glance and not as one flat colour.
  out.mottle = 0.6 + fbm(sc / 1.1, tc / 1.1, 10, 4, 1001) * 0.55 + (noise2(sc * 2.7, tc * 2.7, 64, 1002) - 0.5) * 0.3;
  const n1 = noise2(sc / 3, tc / 3, 6, 101);
  const n2 = fbm(sc / 4, tc / 4, 8, 3, 202);
  if (c.kind === 'wall') {
    const h = tc;
    // Damp rising from the floor, its front wavering, and the tide line it left.
    const front = 0.75 + (n2 - 0.5) * 0.55 + noise2(sc / 7, 0, 7, 303) * 0.25;
    out.damp = smoothstep(front + 0.05, front - 0.45, h) * 0.95;
    out.tide = Math.max(0, 1 - Math.abs(h - front) / 0.03) * 0.8;
    // Big stains where water got in behind the plaster, soft-edged.
    const stain = smoothstep(0.44, 0.7, fbm(sc / 2.5, tc / 2.5, 8, 4, 909));
    out.damp = Math.max(out.damp, stain * 0.85);
    // Water that came in at a sill or the ceiling and ran.
    for (const hole of c.holes) {
      if (hole.kind !== 'window') continue;
      if (sc < hole.s0 - 0.08 || sc > hole.s1 + 0.08 || h > hole.t0) continue;
      const len = 0.25 + noise2(sc * 1.7, 0.3, 16, 404) * 0.9;
      const below = hole.t0 - h;
      if (below < len) out.damp = Math.max(out.damp, (1 - below / len) * 0.75 * smoothstep(0.35, 0.65, noise2(sc * 3.1, 0.7, 32, 505)));
    }
    const fromTop = c.height - h;
    const run = 0.4 + noise2(sc * 0.9, 0.1, 8, 606) * 1.4;
    if (fromTop < run) out.damp = Math.max(out.damp, (1 - fromTop / run) * 0.85 * smoothstep(0.45, 0.75, noise2(sc * 2.3, 0.2, 32, 707)));
    // Hands at the doors: either side of each opening, at the height a hand goes.
    for (const hole of c.holes) {
      if (hole.kind === 'window') continue;
      const d = Math.min(Math.abs(sc - hole.s0), Math.abs(sc - hole.s1));
      if (d < 0.35 && h > 0.7 && h < 1.6) out.dirt = Math.max(out.dirt, (1 - d / 0.35) * smoothstep(0.7, 1.0, h) * smoothstep(1.6, 1.25, h) * 0.55);
    }
  }
  if (c.kind === 'floor') {
    let near = Infinity;
    for (const line of walks) near = Math.min(near, distanceToSegment(p[0], p[2], line));
    out.wear = Math.exp(-((near / 0.32) ** 2)) * (0.7 + n1 * 0.3);
    // Off the track the boards are dark with old wet: blotches of it, thickest at the walls.
    const blot = smoothstep(0.36, 0.72, fbm(sc / 2.6, tc / 2.6, 8, 4, 808));
    const puddle = smoothstep(0.56, 0.74, fbm(sc / 1.4, tc / 1.4, 12, 4, 818));
    out.damp = Math.max(out.damp, (1 - out.wear) * (0.15 + blot * 0.7), puddle * 0.7);
  }
  if (c.kind === 'ceiling') {
    // Soot above the lamp, and damp blooming in from the corners.
    for (const lamp of LAMPS_BY_ROOM.get(c.space) || []) out.soot = Math.max(out.soot, Math.max(0, 1 - Math.hypot(p[0] - lamp[0], p[2] - lamp[2]) / 0.55) * 0.8);
    out.damp = smoothstep(0.85, 0.45, ao) * 0.6 * (0.6 + n2 * 0.6);
  }
  // Dirt gathers where light and air do not reach: corners, under things, along the skirting.
  out.dirt = Math.max(out.dirt, smoothstep(0.95, 0.45, ao) * 0.9);
  return out;
}

// ---- Paint -----------------------------------------------------------------------

/** A Kuwahara filter: each texel takes the mean of whichever of its four squares varies least. */
function kuwahara(src, w, h, r) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let mean = [0, 0, 0];
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const sum = [0, 0, 0];
        let sq = 0;
        let n = 0;
        for (let j = 0; j <= r; j++) {
          for (let i = 0; i <= r; i++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx * i));
            const yy = Math.min(h - 1, Math.max(0, y + dy * j));
            const k = (yy * w + xx) * 3;
            const l = src[k] * 0.3 + src[k + 1] * 0.59 + src[k + 2] * 0.11;
            sum[0] += src[k];
            sum[1] += src[k + 1];
            sum[2] += src[k + 2];
            sq += l * l;
            n++;
          }
        }
        const lm = (sum[0] * 0.3 + sum[1] * 0.59 + sum[2] * 0.11) / n;
        const variance = sq / n - lm * lm;
        if (variance < best) {
          best = variance;
          mean = [sum[0] / n, sum[1] / n, sum[2] / n];
        }
      }
      const k = (y * w + x) * 3;
      out[k] = mean[0];
      out[k + 1] = mean[1];
      out[k + 2] = mean[2];
    }
  }
  return out;
}

/**
 * Brush strokes, after Hertzmann (1998): on a grid, a short stroke of the
 * colour under its start, laid across the local gradient so it follows the
 * contours of what is painted rather than cutting across them. Coarse first,
 * then finer.
 */
function strokes(img, w, h, seed, strength = 1) {
  const rand = rng(seed);
  const lum = (x, y) => {
    const k = (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3;
    return img[k] * 0.3 + img[k + 1] * 0.59 + img[k + 2] * 0.11;
  };
  for (const [step, len, width, alpha] of [[4, 7, 2, 0.5], [2, 4, 1, 0.4]]) {
    for (let gy = 0; gy < h; gy += step) {
      for (let gx = 0; gx < w; gx += step) {
        const x = Math.floor(gx + rand() * step);
        const y = Math.floor(gy + rand() * step);
        if (x >= w || y >= h) continue;
        const gxv = lum(x + 1, y) - lum(x - 1, y);
        const gyv = lum(x, y + 1) - lum(x, y - 1);
        // Along the contour: perpendicular to the gradient, or a hand's slant where there is none.
        let ax = -gyv;
        let ay = gxv;
        const m = Math.hypot(ax, ay);
        if (m < 1e-4) {
          const a = 1.2 + rand() * 0.5;
          ax = Math.cos(a);
          ay = Math.sin(a);
        } else {
          ax /= m;
          ay /= m;
        }
        const k0 = (y * w + x) * 3;
        const colour = [img[k0], img[k0 + 1], img[k0 + 2]];
        for (let t = -len / 2; t <= len / 2; t++) {
          for (let o = -Math.floor(width / 2); o <= Math.floor(width / 2); o++) {
            const px = Math.round(x + ax * t - ay * o);
            const py = Math.round(y + ay * t + ax * o);
            if (px < 0 || py < 0 || px >= w || py >= h) continue;
            const k = (py * w + px) * 3;
            const fade = Math.min(1, alpha * strength) * (1 - Math.abs(t) / (len / 2 + 1));
            for (let ch = 0; ch < 3; ch++) img[k + ch] += (colour[ch] - img[k + ch]) * fade;
          }
        }
      }
    }
  }
}

// ---- The bake --------------------------------------------------------------------

/** The knobs that make the look (9.4.4): what the tuner turns, and the pipeline reads. */
export const LOOK_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'look.json');
export function readLook() {
  return JSON.parse(readFileSync(LOOK_FILE, 'utf8'));
}

/**
 * Everything about a chart that does not depend on the look: its surface's
 * colour and relief texel by texel, the grime masks, its occlusion and the
 * light Blender baked onto it. Slow (the occlusion is traced), so the tuner
 * computes it once and composes many times.
 */
export async function chartFields(textureDir, log = () => {}, rooms = BAKED_ROOMS) {
  const bvh = houseBVH();
  const cache = new Map();
  const surface = async (id) => {
    if (!cache.has(id)) cache.set(id, await readTexture(textureDir, id));
    return cache.get(id);
  };
  const out = [];
  for (const room of rooms) {
    const space = SPACES.find((s) => s.id === room);
    const walks = walksFor(space);
    for (const c of chartsFor(room)) {
      const { w, h } = chartSize(c);
      const tex = surfaceFor(c);
      const imgs = {};
      for (const id of tex.ids) imgs[id] = await surface(id);
      const light = await readLight(c.id);
      if (light.w !== w || light.h !== h) throw new Error(`${c.id}: its light is ${light.w}×${light.h}, the chart is ${w}×${h}`);
      const n = w * h;
      const f = {
        chart: c, w, h, light: light.layers,
        albedo: new Float32Array(n * 3), up: new Float32Array(n), ao: new Float32Array(n),
        dirt: new Float32Array(n), damp: new Float32Array(n), tide: new Float32Array(n),
        wear: new Float32Array(n), soot: new Float32Array(n), mottle: new Float32Array(n),
      };
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const o = j * w + i;
          const sc = ((i + 0.5) / w) * c.width;
          const tc = (1 - (j + 0.5) / h) * c.height;
          const p = chartPoint(c, sc, tc);
          // The surface's colour, averaged over the texel's footprint.
          for (let sy = -1; sy <= 1; sy++) {
            for (let sx = -1; sx <= 1; sx++) {
              const q = chartPoint(c, sc + (sx * c.width) / w / 3, tc + (sy * c.height) / h / 3);
              const at = tex.at(q);
              const t = texel(imgs[at.id].colour, at.uv[0], at.uv[1]);
              for (let k = 0; k < 3; k++) f.albedo[o * 3 + k] += (LIN[t[k]] * at.tint[k]) / 9;
            }
          }
          // The surface's relief, turning the normal the night's fill sees.
          const here = tex.at(p);
          const nm = texel(imgs[here.id].normal, here.uv[0], here.uv[1]);
          const nn = [0, 1, 2].map((k) => tex.tangent[k] * ((nm[0] / 255) * 2 - 1) * 0.8 + tex.bitangent[k] * ((nm[1] / 255) * 2 - 1) * 0.8 + c.normal[k] * ((nm[2] / 255) * 2 - 1));
          f.up[o] = (nn[1] / Math.hypot(...nn)) * 0.5 + 0.5;
          const ao = occlusion(bvh, p, c.normal, (noise2(i, j, 1, 1) * 2 + ((i * 7 + j * 13) % 11) / 11) * Math.PI);
          f.ao[o] = ao;
          const g = grime(c, sc, tc, p, ao, walks);
          for (const k of ['dirt', 'damp', 'tide', 'wear', 'soot', 'mottle']) f[k][o] = g[k];
        }
      }
      out.push(f);
      log(c, w, h);
    }
  }
  return out;
}

/** One chart composed under a look: surface, grime, light, then paint. Fast. */
export function compose(f, look, index) {
  const { w, h } = f;
  const sky = new THREE.Color(NIGHT_FILL.sky);
  const ground = new THREE.Color(NIGHT_FILL.ground);
  const G = look.grime;
  const R = look.rooms[f.chart.space] ?? look.rooms.default;
  const linear = new Float32Array(w * h * 3);
  const albedo = [0, 0, 0];
  const mix = (col, t) => {
    for (let k = 0; k < 3; k++) albedo[k] += (col[k] - albedo[k]) * Math.min(1, Math.max(0, t));
  };
  for (let o = 0; o < w * h; o++) {
    for (let k = 0; k < 3; k++) albedo[k] = f.albedo[o * 3 + k] * (1 + (f.mottle[o] - 1) * G.mottle);
    mix(G.dirtColour, f.dirt[o] * G.dirt);
    mix(G.dampColour, f.damp[o] * G.damp);
    mix(G.tideColour, f.tide[o] * G.tide);
    mix(G.sootColour, f.soot[o] * G.soot);
    if (f.wear[o] > 0) mix([albedo[0] * 1.6 + 0.02, albedo[1] * 1.55 + 0.02, albedo[2] * 1.5 + 0.015], f.wear[o] * G.wear);
    // Light: Blender's, which already carries the shadows, the bounce and the
    // windows; then the night's cool fill, as the game's hemisphere light gives it.
    const up = f.up[o];
    for (let k = 0; k < 3; k++) {
      const hemi = ([ground.r, ground.g, ground.b][k] * (1 - up) + [sky.r, sky.g, sky.b][k] * up) * NIGHT_FILL.intensity * R.fill;
      let baked = 0;
      for (const [layer, gain] of Object.entries(R.light)) baked += f.light[layer][o * 3 + k] * gain;
      const lit = albedo[k] * (baked + (hemi * f.ao[o]) / Math.PI);
      linear[o * 3 + k] = toSrgb(lit * R.exposure);
    }
  }
  const painted = look.paint.kuwahara > 0 ? kuwahara(linear, w, h, look.paint.kuwahara) : linear;
  if (look.paint.strokes > 0) strokes(painted, w, h, 900 + index, look.paint.strokes);
  const bytes = Buffer.alloc(w * h * 3);
  for (let k = 0; k < bytes.length; k++) bytes[k] = Math.max(0, Math.min(255, Math.round(painted[k])));
  return bytes;
}

export async function encode(f, bytes) {
  return sharp(bytes, { raw: { width: f.w, height: f.h, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
}

export async function bakeRooms(textureDir, log = () => {}) {
  checkLight();
  const look = readLook();
  const fields = await chartFields(textureDir);
  const out = [];
  for (const [i, f] of fields.entries()) {
    const png = await encode(f, compose(f, look, i));
    out.push({ id: f.chart.id, png, w: f.w, h: f.h });
    log(f.chart, f.w, f.h, png.length);
  }
  return out;
}
