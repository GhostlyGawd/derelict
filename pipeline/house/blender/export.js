import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';

import { chartSize, chartsFor, skin } from '../../../src/house/charts.js';
import { dressHouse } from '../../../src/house/dress.js';
import { SPACES, spaceAt } from '../../../src/house/layout.js';
import { buildHouse } from '../../../src/house/level.js';
import { buildThings } from '../../../src/house/things.js';

/**
 * The house as Blender lights it (9.4.4, Blender and a tuner): every static
 * surface with the colour light picks up from it, the windows as the night
 * that shines in, the lamps, and the charts to bake. Built by the same code
 * that builds the game, so Blender lights the house the player walks.
 *
 * The scene is plain data: `scene.json` names the parts, `scene.bin` holds
 * their triangles as float32. Both are deterministic, and their hash is what
 * a committed light map is checked against.
 */

/** The rooms whose surfaces Blender lights: every space in the house. */
export const LIT_ROOMS = SPACES.map((s) => s.id);

/**
 * Every lamp in the house, from the lights the game itself builds
 * (src/house/dress.js and rooms.js), with the room it hangs in. three.js
 * gives a light's intensity in candela; a Cycles point or spot of power P
 * watts has an intensity of P / 4π, so P = 4π × intensity. Every spot in the
 * house points straight down, as Blender's does unturned.
 */
function lamps(lights) {
  const out = [];
  for (const l of lights) {
    if (!l.isSpotLight && !l.isPointLight) continue;
    const p = l.position;
    const room = spaceAt(p.x, p.z, p.y - 1)?.id ?? null;
    const c = l.color;
    const lamp = { kind: l.isSpotLight ? 'spot' : 'point', room, pos: [p.x, p.y, p.z], colour: [c.r, c.g, c.b], power: 4 * Math.PI * l.intensity };
    if (l.isSpotLight) {
      const t = l.target.position;
      if (Math.abs(t.x - p.x) > 1e-6 || Math.abs(t.z - p.z) > 1e-6 || t.y >= p.y) throw new Error(`a spot at ${p.toArray()} does not point straight down`);
      Object.assign(lamp, { angle: l.angle, blend: l.penumbra, radius: 0.08 });
    } else lamp.radius = 0.05;
    out.push(lamp);
  }
  return out;
}

/**
 * The light layers a chart is baked in, each weighed by the look afterwards:
 * its own room's lamps as cones and as glows, the light that spills in from
 * every other room, and the night through the windows. Light adds.
 */
export const LAYERS = ['cone', 'glow', 'others', 'night'];
export const layerOf = (lamp, room) => (lamp.room !== room ? 'others' : lamp.kind === 'spot' ? 'cone' : 'glow');

/** Which generated surface each material shows, and what it is tinted. */
const SOURCE = {
  wall: ['plaster'], floor: ['floor'], ceiling: ['ceiling'], wood: ['wood'], door: ['door'], rug: ['rug'], hallRug: ['rug'],
  tile: ['tile'], curtain: ['curtain'], paper: ['paper'], picture: ['picture'], night: ['night'],
  iron: ['wood', 0x34363a], enamel: ['paper', 0xe4e8d6],
  knob: [null, 0xa08a50], black: [null, 0x060706], mirror: [null, 0x2a3832],
  shade: [null, 0xf2f4e6], lampshade: [null, 0xc8c088],
};
/** What gives light rather than taking it, and how strongly, as Cycles emission. */
const EMIT = { night: 1.0, shade: 0, lampshade: 0.6 };
/** Which light layer each glowing material bakes into. */
const EMIT_LAYER = { night: 'night', lampshade: 'others' };

async function meanColour(textureDir, id) {
  const { data, info } = await sharp(path.join(textureDir, `${id}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) sum[k] += new THREE.Color().setRGB(data[i + k] / 255, 0, 0, THREE.SRGBColorSpace).r;
  const n = info.width * info.height;
  return sum.map((v) => v / n);
}

export async function exportScene(textureDir) {
  const mats = new Proxy({}, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (!t[k]) t[k] = new THREE.MeshBasicMaterial({ name: k });
      return t[k];
    },
  });
  const root = new THREE.Group();
  root.add(buildHouse(mats).group);
  const dressing = dressHouse(mats);
  root.add(dressing.group);
  const things = buildThings(mats);
  root.add(things.group);
  // Doors stand open in play, and light the hall through; a baked door would be a fixed one.
  const moving = new Set();
  for (const d of things.doors) for (const m of d.meshes) m.traverse((o) => moving.add(o));
  root.updateMatrixWorld(true);

  const means = new Map();
  const albedo = async (name, colour) => {
    const [src, tintHex] = SOURCE[name] || [null, 0x808080];
    let base = [1, 1, 1];
    if (src) {
      if (!means.has(src)) means.set(src, await meanColour(textureDir, src));
      base = means.get(src);
    }
    const t = new THREE.Color(tintHex ?? 0xffffff);
    return base.map((v, k) => v * [t.r, t.g, t.b][k] * [colour.r, colour.g, colour.b][k]);
  };

  // Group triangles by material and colour.
  const groups = new Map();
  const meshes = [];
  root.traverse((o) => o.isMesh && !moving.has(o) && !o.material.transparent && meshes.push(o));
  for (const o of meshes) {
    const m = o.material;
    const key = `${m.name}:${m.color.getHexString()}`;
    if (!groups.has(key)) groups.set(key, { name: m.name, colour: m.color.clone(), tris: [] });
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      groups.get(key).tris.push(v.x, v.y, v.z);
    }
  }

  const parts = [];
  const floats = [];
  const materials = [];
  for (const [key, g] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    materials.push({ key, name: g.name, albedo: await albedo(g.name, g.colour), emit: EMIT[g.name] ?? 0, layer: EMIT_LAYER[g.name] ?? null });
    parts.push({ material: materials.length - 1, offset: floats.length, count: g.tris.length / 9 });
    for (const x of g.tris) floats.push(Math.round(x * 1e5) / 1e5);
  }

  // The charts, each a mesh with its own UVs, baked into its own map.
  const charts = [];
  for (const room of LIT_ROOMS) {
    for (const c of chartsFor(room)) {
      const geo = skin(c, null).geometry.toNonIndexed();
      const p = geo.attributes.position;
      const uv = geo.attributes.uv;
      const offset = floats.length;
      for (let i = 0; i < p.count; i++) floats.push(...[p.getX(i), p.getY(i), p.getZ(i), uv.getX(i), uv.getY(i)].map((x) => Math.round(x * 1e5) / 1e5));
      const kind = c.kind === 'wall' ? 'wall' : c.kind;
      charts.push({ id: c.id, room, kind, ...chartSize(c), offset, count: p.count / 3, material: kind === 'wall' ? 'wall' : kind, normal: c.normal });
    }
  }

  const scene = { units: 'metres, y up', materials, parts, charts, lamps: lamps(dressing.lights), layers: LAYERS };
  const json = JSON.stringify(scene);
  const bin = Buffer.from(new Float32Array(floats).buffer);
  return { scene, json, bin, hash: sourceHash() };
}

/**
 * The source files the light is baked from: the house's shape, its lamps, its
 * surfaces' colours, and the bake itself. A light map is stale when any of
 * them changes. Hashed as committed bytes, never as the numbers they compute:
 * Vercel's build machines computed the house's floats a hair differently from
 * every other machine, so a hash of the exported scene called a fresh light
 * map stale there and nowhere else.
 */
export const LIGHT_SOURCES = [
  'src/house/layout.js', 'src/house/level.js', 'src/house/dress.js', 'src/house/rooms.js',
  'src/house/things.js', 'src/house/furniture.js', 'src/house/charts.js', 'src/house/surfaces.js',
  'pipeline/house/textures.js', 'pipeline/house/style.js', 'pipeline/lib/paint.js', 'pipeline/lib/raster.js',
  'pipeline/house/blender/export.js', 'pipeline/house/blender/bake.py',
];

export function sourceHash() {
  const root = new URL('../../../', import.meta.url);
  const h = createHash('sha256');
  for (const file of LIGHT_SOURCES) h.update(file).update('\0').update(readFileSync(new URL(file, root))).update('\0');
  return h.digest('hex');
}
