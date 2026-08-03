import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry plumbing shared by the level and prop builders.
 *
 * The pipeline emits single-material GLBs, which lets the game collapse every
 * placed instance of a prop into one merged mesh — the whole ship ends up in
 * roughly a dozen draw calls.
 */

// `color` is kept because the generated props carry per-part vertex tints.
const KEEP = ['position', 'normal', 'uv', 'color'];

/** Strips a geometry down to the attribute set that merges cleanly. */
export function normalizeGeometry(source) {
  const geo = source.index ? source.toNonIndexed() : source.clone();
  if (source.index) source.dispose?.();

  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    const count = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP.includes(name)) geo.deleteAttribute(name);
  }
  geo.morphAttributes = {};
  return geo;
}

/**
 * Collapses an Object3D hierarchy into `[{ geometry, material }]` in the
 * object's local space, one entry per distinct material.
 */
export function flattenModel(root) {
  root.updateMatrixWorld(true);
  const byMaterial = new Map();

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    const groups =
      node.geometry.groups && node.geometry.groups.length > 0 && mats.length > 1
        ? node.geometry.groups
        : [{ start: 0, count: Infinity, materialIndex: 0 }];

    for (const group of groups) {
      const material = mats[group.materialIndex ?? 0] || mats[0];
      const geo = normalizeGeometry(
        group.count === Infinity ? node.geometry : sliceGroup(node.geometry, group)
      );
      geo.applyMatrix4(node.matrixWorld);
      const key = material.uuid;
      if (!byMaterial.has(key)) byMaterial.set(key, { material, parts: [] });
      byMaterial.get(key).parts.push(geo);
    }
  });

  const out = [];
  for (const { material, parts } of byMaterial.values()) {
    const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (parts.length > 1) for (const p of parts) p.dispose();
    if (geometry) out.push({ geometry, material });
  }
  return out;
}

function sliceGroup(geometry, group) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const sliced = new THREE.BufferGeometry();
  for (const name of KEEP) {
    const attr = src.attributes[name];
    if (!attr) continue;
    const size = attr.itemSize;
    const start = group.start * size;
    const end = start + group.count * size;
    sliced.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(start, end), size));
  }
  return sliced;
}

/** Local-space bounding box of a whole hierarchy. */
export function measure(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { box, size, center };
}

/**
 * Batches many placements of the same source geometry into one mesh.
 * `transforms` are Matrix4s in world space.
 */
export function batch(parts, transforms) {
  const meshes = [];
  for (const { geometry, material, model } of parts) {
    const copies = transforms.map((m) => {
      const g = geometry.clone();
      g.applyMatrix4(m);
      return g;
    });
    const merged = copies.length === 1 ? copies[0] : mergeGeometries(copies, false);
    if (copies.length > 1) for (const c of copies) c.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    // Survives the merge, so the drawn mesh still names its manifest entry.
    if (model) mesh.userData.model = model;
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }
  return meshes;
}
