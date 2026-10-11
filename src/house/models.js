import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The house's pieces modelled by Blender (pipeline/house/blender/models.py),
 * loaded from the house's manifest. Each GLB names its material slots for the
 * house's own materials, and `place` puts the house's materials on a copy.
 */
export async function loadModels(entries = {}, fetchBytes = null) {
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(
    Object.entries(entries).map(async ([id, entry]) => {
      const gltf = fetchBytes ? await loader.parseAsync(await fetchBytes(entry.file), '') : await loader.loadAsync(entry.file);
      out[id] = gltf.scene;
    })
  );
  return out;
}

/**
 * The models the house is being built with, for pieces that are built deep
 * in a kit (furniture.js) rather than handed them: set once by whatever
 * builds the house, before it builds anything.
 */
let current = null;
export function useModels(models) {
  current = models;
}

/** Colour variants of a material, for things that are the same stuff in other paint. */
const tinted = new Map();
export function tint(material, hex) {
  const key = `${material.uuid}:${hex}`;
  if (!tinted.has(key)) {
    const m = material.clone();
    m.color = new THREE.Color(hex);
    tinted.set(key, m);
  }
  return tinted.get(key);
}

/** Which of the house's materials each slot in a model wears. */
const SLOTS = { brass: 'knob', glaze: 'glaze', cloth: 'cloth', wicker: 'wicker', leather: 'leather' };
/** Every slot a model may name: the models harness fails one that is not here. */
export const KNOWN_SLOTS = new Set(['wood', 'door', 'enamel', 'shade', 'lampshade', 'iron', 'night', 'paper', 'picture', 'curtain', 'rug', 'tile', 'wall', 'floor', 'ceiling', 'black', 'mirror', 'knob', 'hallRug', ...Object.keys(SLOTS)]);

/**
 * The registry (everything modelled by Blender): every piece of the house
 * asks for its model by kind and by the parameters it is built to, and the
 * model build collects the requests by building the house in Node
 * (pipeline/house/blender/models.js). A model's id is its kind and a short
 * hash of its parameters, so the same piece asked for twice is one model.
 */
const asked = new Map();
export function modelId(kind, params = {}) {
  const keys = Object.keys(params).sort();
  if (!keys.length) return kind;
  const text = JSON.stringify(keys.map((k) => [k, params[k]]));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `${kind}-${h.toString(16).padStart(8, '0')}`;
}
/** What the house asked for, since the module loaded. */
export function askedFor() {
  return [...asked.values()];
}
/**
 * A copy of the model of `kind` built to `params`, wearing the house's
 * materials, or null if it has not been modelled yet. The request is recorded
 * either way.
 */
export function want(models, kind, params, mat, opts = {}) {
  // A parameter named for the request's own fields would overwrite them: a
  // casing asked for with `kind: 'arch'` once went to Blender as an arch.
  for (const k of ['id', 'kind']) if (k in params) throw new Error(`want(${kind}): a parameter may not be called "${k}"`);
  const id = modelId(kind, params);
  asked.set(id, { id, kind, ...params });
  return place(models, id, mat, opts);
}

/**
 * A copy of model `id`, wearing the house's materials (`mat`), or null if the
 * model is not there. Every mesh in it says it is part of `tag` (inventory.js).
 */
export function place(models, id, mat, { tag = id, pos = [0, 0, 0], turn = 0 } = {}) {
  const src = (models && Object.keys(models).length ? models : current)?.[id];
  if (!src) return null;
  const copy = src.clone(true);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    // A slot may carry its own paint: `door#d8ccb8` is the door's wood in that colour.
    const [name, hex] = (o.material?.name || 'wood').replace(/\.\d+$/, '').split('#');
    const base = mat[SLOTS[name] ?? name] ?? mat.wood;
    o.material = hex ? tint(base, parseInt(hex, 16)) : base;
    o.userData.slot = name;
  });
  copy.userData.inventory = tag;
  // Drawn by Blender: the models harness passes every mesh under this.
  copy.userData.modelled = id;
  copy.position.fromArray(pos);
  copy.rotation.y = turn;
  return copy;
}
