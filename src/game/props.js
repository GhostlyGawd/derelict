import * as THREE from 'three';
import { batch, flattenModel } from '../core/meshutil.js';
import { PROPS } from './layout.js';
import { placeholderModel } from './placeholders.js';

/**
 * Static set dressing. Every placement of a given model is merged into a
 * single mesh, so the ~85 props in the level cost one draw call per model.
 */

/** [halfX, halfZ, height] used when a placement does not override it. */
const DEFAULT_COLLIDERS = {
  cargo_crate: [0.45, 0.45, 0.8],
  canister: [0.28, 0.28, 1.22],
  wall_console: [0.55, 0.3, 1.6],
  pipe_cluster: [0.5, 0.28, 2.0],
};

export function buildStaticProps(assets, sourceCache = new Map()) {
  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];

  const byModel = new Map();
  for (const prop of PROPS) {
    if (!byModel.has(prop.model)) byModel.set(prop.model, []);
    const scale = prop.scale ?? 1;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...prop.pos),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), prop.rotY || 0),
      new THREE.Vector3(scale, scale, scale)
    );
    byModel.get(prop.model).push(matrix);

    const spec = 'collide' in prop ? prop.collide : DEFAULT_COLLIDERS[prop.model];
    if (spec) colliders.push(colliderFor(prop, spec, scale));
  }

  for (const [modelId, transforms] of byModel) {
    const parts = resolveParts(modelId, assets, sourceCache);
    for (const mesh of batch(parts, transforms)) {
      mesh.name = `prop:${modelId}`;
      group.add(mesh);
    }
  }

  return { group, colliders };
}

/** Flattens a model once and caches it; falls back to the greybox stand-in. */
export function resolveParts(modelId, assets, cache = new Map()) {
  if (!cache.has(modelId)) {
    const source = assets.model(modelId) || placeholderModel(modelId);
    cache.set(modelId, flattenModel(source));
  }
  return cache.get(modelId);
}

function colliderFor(prop, [hx, hz, h], scale) {
  // Rotate the footprint and take its axis-aligned bound — close enough for
  // props that are all roughly square in plan.
  const rot = prop.rotY || 0;
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = (hx * c + hz * s) * scale;
  const ez = (hx * s + hz * c) * scale;
  const [x, y, z] = prop.pos;
  return {
    minX: x - ex,
    maxX: x + ex,
    minY: y,
    maxY: y + h * scale,
    minZ: z - ez,
    maxZ: z + ez,
  };
}
