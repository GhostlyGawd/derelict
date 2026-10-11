import * as THREE from 'three';

import { inventoryOf } from './inventory.js';
import { chartsFor } from './charts.js';
import { SPACES, WALLS } from './layout.js';
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

/**
 * Every doorway and arch, looked through at three heights from both sides:
 * nothing baked may stand across it. The stairhead's skin once did, and the
 * player at the head of the stairs met a painted wall where the door was.
 */
export function skinsOverOpenings(scene) {
  scene.updateMatrixWorld(true);
  const skins = [];
  scene.traverse((o) => o.isMesh && o.name.startsWith('skin:') && skins.push(o));
  const ray = new THREE.Raycaster();
  const out = [];
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind === 'window') continue;
      const n = w.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      for (const h of [0.3, 1.0, Math.min(1.8, o.height - 0.15)]) {
        for (const s of [1, -1]) {
          const mid = w.axis === 'x' ? new THREE.Vector3(w.at, w.y + h, o.center) : new THREE.Vector3(o.center, w.y + h, w.at);
          ray.set(mid.clone().addScaledVector(n, 0.5 * s), n.clone().multiplyScalar(-s));
          ray.far = 1.0;
          const hit = ray.intersectObjects(skins, false)[0];
          if (hit) out.push(`${o.id} at ${h.toFixed(1)} m: ${hit.object.name}`);
        }
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Every face of a piece that lies at or behind a baked skin: hidden by it, or
 * fighting it for the same depth. The hall's runner lay a few millimetres
 * over the floor's skin and the two flickered through each other, and a
 * picture's canvas sat behind the wall's skin with only its frame showing.
 * The shell is meant to be under its skins, and is passed.
 */
const UNDER = new Set(['shell', 'arch-fill']);
export function underSkins(scene) {
  scene.updateMatrixWorld(true);
  const planes = [];
  for (const sp of SPACES) {
    for (const c of chartsFor(sp.id)) {
      planes.push({
        c,
        o: new THREE.Vector3(...c.origin),
        u: new THREE.Vector3(...c.u),
        v: new THREE.Vector3(...c.v),
        n: new THREE.Vector3(...c.normal),
        lift: c.kind === 'wall' ? 0.014 : 0.004,
      });
    }
  }
  const out = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const cc = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const cen = new THREE.Vector3();
  const rel = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let piece = null;
    for (let p = o; p; p = p.parent) {
      if (p.userData?.notAPiece) return;
      if (p.userData?.modelled) {
        piece = p;
        break;
      }
    }
    if (!piece || UNDER.has(piece.userData.kind)) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const [i0, i1, i2] = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      cc.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      nrm.subVectors(b, a).cross(rel.subVectors(cc, a));
      const area = nrm.length() / 2;
      if (area < 1e-6) continue;
      nrm.normalize();
      cen.copy(a).add(b).add(cc).divideScalar(3);
      for (const P of planes) {
        if (nrm.dot(P.n) < 0.9) continue;
        rel.subVectors(cen, P.o);
        const d = rel.dot(P.n);
        if (d < -0.03 || d > P.lift + 0.005) continue;
        const s = rel.dot(P.u);
        const tt = rel.dot(P.v);
        if (s < 0 || s > P.c.width || tt < 0 || tt > P.c.height) continue;
        if (P.c.holes.some((h) => s > h.s0 && s < h.s1 && tt > h.t0 && tt < h.t1)) continue;
        const key = `${piece.userData.modelled} on ${P.c.id}`;
        out.set(key, (out.get(key) || 0) + area);
        break;
      }
    }
  });
  return [...out.entries()].filter(([, area]) => area > 1e-4).map(([k, area]) => `${k} (${(area * 1e4).toFixed(0)} cm²)`);
}

/**
 * Everything hung on a wall, against every door's and arch's frame: none may
 * overlap one. The hall's picture once hung half over the front door's frame.
 */
const HUNG = new Set(['picture', 'fixture', 'bag', 'shelf', 'coats', 'towel-rail', 'note']);
export function hungOverFrames(scene) {
  scene.updateMatrixWorld(true);
  const hung = [];
  const frames = [];
  scene.traverse((o) => {
    const k = o.userData?.kind;
    if (k === 'casing') frames.push(o);
    else if (HUNG.has(k) && o.rotation.x === 0) hung.push(o);
  });
  const out = [];
  for (const h of hung) {
    const a = new THREE.Box3().setFromObject(h).expandByScalar(-0.004);
    for (const f of frames) {
      if (a.intersectsBox(new THREE.Box3().setFromObject(f))) out.push(`${h.userData.modelled || h.userData.inventory} over ${f.userData.inventory}`);
    }
  }
  return out;
}
