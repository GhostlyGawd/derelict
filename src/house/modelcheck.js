import * as THREE from 'three';

import { inventoryOf } from './inventory.js';
import { KNOWN_SLOTS, place } from './models.js';

/**
 * The models harness's instruments (tools/house/models.mjs; everything
 * modelled by Blender). Each check is a pitfall met while building the house,
 * held by a tool so it is not met twice.
 */

/** Whether an object is drawn by Blender, or is not a piece at all. */
function origin(o) {
  for (let p = o; p; p = p.parent) {
    if (p.userData?.modelled) return { modelled: p.userData.modelled };
    if (p.userData?.notAPiece) return { exempt: p.userData.notAPiece };
  }
  return {};
}

/** Every mesh in the scene still drawn by code, counted by what it is. */
export function codeDrawn(scene) {
  const out = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.blending === THREE.AdditiveBlending) return;
    const where = origin(o);
    if (where.modelled || where.exempt) return;
    const what = inventoryOf(o) || o.parent?.name || 'the shell';
    out.set(what, (out.get(what) || 0) + 1);
  });
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * The facts about every model the checks hold it to: its material slots, its
 * size, and for each closed mesh in it whether its faces point outward (the
 * signed volume they enclose is positive).
 */
export function modelFacts(models) {
  const out = {};
  for (const [id, root] of Object.entries(models)) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const slots = new Set();
    const inward = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      slots.add((o.material?.name || '').replace(/\.\d+$/, '').split('#')[0]);
      const g = o.geometry;
      const idx = g.index;
      const pos = g.attributes.position;
      if (!idx) return;
      // Closed when every edge is shared by exactly two faces, by position.
      const key = (i) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
      const edges = new Map();
      let vol = 0;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let t = 0; t < idx.count; t += 3) {
        const [i0, i1, i2] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c.fromBufferAttribute(pos, i2);
        vol += a.dot(b.clone().cross(c)) / 6;
        for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) {
          const [kp, kq] = [key(p), key(q)];
          const e = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
          edges.set(e, (edges.get(e) || 0) + 1);
        }
      }
      const closed = [...edges.values()].every((n) => n === 2);
      if (closed && vol < -1e-9) inward.push(o.name || 'mesh');
    });
    out[id] = { size: box.getSize(new THREE.Vector3()).toArray(), min: box.min.toArray(), slots: [...slots], unknown: [...slots].filter((s) => !KNOWN_SLOTS.has(s)), inward };
  }
  return out;
}

/** One model alone, from the front and from round its side, under the house's materials, for the sheet. */
export function shootModel(renderer, mat, models, id, turn, w, h) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  const piece = place(models, id, mat, { turn });
  scene.add(piece);
  scene.add(new THREE.HemisphereLight(0xc8d0d8, 0x202018, 1.4));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const box = new THREE.Box3().setFromObject(piece);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 50);
  camera.position.copy(centre).add(new THREE.Vector3(0.35, 0.3, 1).normalize().multiplyScalar(size * 1.7));
  camera.lookAt(centre);
  const target = new THREE.WebGLRenderTarget(w, h);
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x14161a, 1);
  renderer.clear();
  renderer.render(scene, camera);
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  renderer.setRenderTarget(null);
  target.dispose();
  return px;
}
