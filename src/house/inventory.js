import * as THREE from 'three';

/**
 * What each piece of the house is, for the inventory check
 * (tools/house/inventory.mjs, 9.3: the owner's look at the modelled hall).
 * The painting's objects are listed in pipeline/house/concept/inventory.json;
 * here every piece of the house says which thing it is, so the check can ask
 * whether the painting's things are in the hall and where.
 */

/** Names everything `fn` adds to `group` as `id`, unless it already has a name. */
export function tagged(group, id, fn) {
  const n = group.children.length;
  const out = fn();
  for (let i = n; i < group.children.length; i++) group.children[i].userData.inventory ??= id;
  return out;
}

/** The name of the thing an object is part of, or '' for the house's shell. */
export function inventoryOf(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData?.inventory) return o.userData.inventory;
  return '';
}

/** Light that is drawn but is not a thing: an additive or faint transparent mesh. */
function isLight(material) {
  const m = Array.isArray(material) ? material[0] : material;
  return m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < 0.5);
}

/**
 * Renders the scene with every piece flat in a colour naming what it is, and
 * returns the names and, per pixel, the index of its name plus one (0 where
 * nothing was drawn). Rows run top to bottom.
 */
export function renderTags(renderer, scene, camera, w, h) {
  const tags = [];
  const index = new Map();
  const flat = [];
  const swapped = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (isLight(o.material)) {
      swapped.push([o, o.material, o.visible]);
      o.visible = false;
      return;
    }
    const tag = inventoryOf(o);
    let i = index.get(tag);
    if (i === undefined) {
      i = tags.length;
      tags.push(tag);
      index.set(tag, i);
      const c = new THREE.Color().setRGB(((i + 1) & 255) / 255, ((i + 1) >> 8) / 255, 0, THREE.LinearSRGBColorSpace);
      flat[i] = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: false });
    }
    swapped.push([o, o.material, o.visible]);
    o.material = flat[i];
  });
  const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
  const background = scene.background;
  scene.background = null;
  const clear = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);
  const rgba = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, rgba);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  scene.background = background;
  for (const [o, m, v] of swapped) {
    o.material = m;
    o.visible = v;
  }
  target.dispose();
  for (const m of flat) m.dispose();
  // GL reads bottom row first.
  const ids = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = ((h - 1 - y) * w + x) * 4;
    ids[y * w + x] = rgba[k] + (rgba[k + 1] << 8);
  }
  return { tags, ids };
}

/**
 * How big every tiling texture is drawn, against the size it was made for
 * (`metres` in the house's manifest): for each triangle of every mesh wearing
 * one, the metres one repeat of the texture covers along its u and along its
 * v. Returns, per mesh, the area that is within `tolerance` of its texture's
 * own size in both directions, and the area that is not.
 */
export function texelScale(scene, manifest, tolerance = 0.2) {
  const rows = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    const map = material.map;
    const entry = map && manifest.textures[map.name];
    if (!entry?.metres) return;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    if (!uv) return;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const [mu, mv] = entry.metres;
    const ru = map.repeat.x;
    const rv = map.repeat.y;
    let good = 0;
    let bad = 0;
    let worst = 1;
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t;
      const i1 = idx ? idx.getX(t + 1) : t + 1;
      const i2 = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      const area = e1.clone().cross(e2).length() / 2;
      if (area < 1e-7) continue;
      const du1 = (uv.getX(i1) - uv.getX(i0)) * ru;
      const dv1 = (uv.getY(i1) - uv.getY(i0)) * rv;
      const du2 = (uv.getX(i2) - uv.getX(i0)) * ru;
      const dv2 = (uv.getY(i2) - uv.getY(i0)) * rv;
      const det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-12) {
        // Every texel of the triangle is one texel: smeared, as badly as it can be.
        bad += area;
        worst = 0;
        continue;
      }
      // dP/du and dP/dv: the metres one whole repeat covers each way.
      T.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
      B.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
      const su = T.length() / mu;
      const sv = B.length() / mv;
      const off = Math.min(Math.min(su, 1 / su), Math.min(sv, 1 / sv));
      worst = Math.min(worst, off);
      if (off >= 1 - tolerance) good += area;
      else bad += area;
    }
    if (good + bad > 0) rows.push({ tag: inventoryOf(o) || o.parent?.name || '', texture: map.name, good, bad, worst });
  });
  return rows;
}

/**
 * Two close views of a thing, for the inventory's sheet: from the painter's
 * side of it and from forty degrees round, near enough that it fills the view.
 */
export function closeUps(scene, names, from, spaces = []) {
  const want = new Set(names);
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.isMesh && want.has(inventoryOf(o))) box.expandByObject(o);
  });
  if (box.isEmpty()) return [];
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // Near enough that the thing fills most of an 80° view.
  const d = Math.max(size.x, size.y, size.z) * 0.85 + 0.12;
  const dir = new THREE.Vector3(c.x - from[0], 0, c.z - from[2]).normalize();
  return [0, 0.7].map((turn) => {
    const v = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    // Kept inside the room the thing stands in, so a wall is never in the way.
    const room = spaces.find((r) => c.y >= r.y - 0.1 && c.y < r.y + r.h && c.x >= r.x[0] && c.x <= r.x[1] && c.z >= r.z[0] && c.z <= r.z[1]);
    let x = c.x - v.x * d;
    let z = c.z - v.z * d;
    if (room) {
      x = Math.min(Math.max(x, room.x[0] + 0.15), room.x[1] - 0.15);
      z = Math.min(Math.max(z, room.z[0] + 0.15), room.z[1] - 0.15);
    }
    const floor = room?.y ?? 0;
    return { pos: [x, Math.min(Math.max(c.y + 0.15, floor + 0.5), floor + 2.2), z], target: c.toArray() };
  });
}
