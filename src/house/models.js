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

/** Which of the house's materials each slot in a model wears. */
const SLOTS = { brass: 'knob', glaze: 'glaze', cloth: 'cloth', wicker: 'wicker', leather: 'leather' };

/**
 * A copy of model `id`, wearing the house's materials (`mat`), or null if the
 * model is not there. Every mesh in it says it is part of `tag` (inventory.js).
 */
export function place(models, id, mat, { tag = id, pos = [0, 0, 0], turn = 0 } = {}) {
  const src = models?.[id];
  if (!src) return null;
  const copy = src.clone(true);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material?.name || 'wood').replace(/\.\d+$/, '');
    o.material = mat[SLOTS[name] ?? name] ?? mat.wood;
  });
  copy.userData.inventory = tag;
  copy.position.fromArray(pos);
  copy.rotation.y = turn;
  return copy;
}
