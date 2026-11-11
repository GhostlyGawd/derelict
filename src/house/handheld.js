import * as THREE from 'three';

import { fovFor } from '../game/viewmodel.js';

/**
 * The house's handheld (9.4.4): an old battery lantern held low in the right
 * hand, its face toward the player, as the device sits in the reference's
 * bottom-right corner. A speaker grille on the left of its face, a gauge on
 * the right, a carrying handle over the top.
 *
 * Built in engine from the generated surfaces, as the ship's socket was, and
 * drawn in its own scene after a depth clear, like the ship's scanner, so it
 * never clips into a wall. It keeps to the room between the stick and the
 * buttons on a phone by the same rule as the scanner (9.4.7).
 */
const DEPTH = -0.6;
const ROT = new THREE.Euler(0.22, -0.32, 0.04);
const BASE_FOV = 58;

export function buildHandheld(surfaces) {
  const { tex } = surfaces;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.01, 4);
  // The hall's light: dim, from above and ahead, and green.
  const key = new THREE.DirectionalLight(0xc8dcae, 2.6);
  key.position.set(-0.3, 1, 0.4);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x3c4c34, 1.8));

  const casing = new THREE.MeshLambertMaterial({ map: tex.door, color: 0xc4ccb0 });
  const metal = new THREE.MeshLambertMaterial({ map: tex.wood, color: 0x8a9478 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x0c100a });
  const dot = new THREE.MeshLambertMaterial({ color: 0x5c6a4c });
  const face = new THREE.MeshLambertMaterial({ map: tex.paper, color: 0xb8c49a });
  const needle = new THREE.MeshBasicMaterial({ color: 0x1a1a10 });

  const rig = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    rig.add(m);
    return m;
  };
  const W = 0.2;
  const H = 0.13;
  const D = 0.09;
  // The casing, with a lip round its face.
  add(new THREE.BoxGeometry(W, H, D), casing, 0, 0, 0);
  add(new THREE.BoxGeometry(W + 0.012, 0.012, D + 0.006), metal, 0, H / 2, 0);
  add(new THREE.BoxGeometry(W + 0.012, 0.012, D + 0.006), metal, 0, -H / 2, 0);
  // The grille: a dark well with a lattice of holes picked out across it.
  const gx = -0.045;
  const r = 0.042;
  const well = add(new THREE.CylinderGeometry(r, r, 0.006, 20), dark, gx, 0, D / 2);
  well.rotation.x = Math.PI / 2;
  const holes = new THREE.BoxGeometry(0.006, 0.006, 0.004);
  for (let i = -5; i <= 5; i++) {
    for (let j = -5; j <= 5; j++) {
      const x = i * 0.0072;
      const y = j * 0.0072;
      if (Math.hypot(x, y) > r - 0.006 || (i + j) % 2) continue;
      add(holes, dot, gx + x, y, D / 2 + 0.003);
    }
  }
  const rim = add(new THREE.TorusGeometry(r, 0.004, 4, 20), metal, gx, 0, D / 2 + 0.002);
  rim.rotation.z = Math.PI / 4;
  // The gauge: a pale dial behind a needle.
  const dx = 0.055;
  const dial = add(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 16), face, dx, 0.012, D / 2);
  dial.rotation.x = Math.PI / 2;
  const n = add(new THREE.BoxGeometry(0.003, 0.024, 0.003), needle, dx, 0.022, D / 2 + 0.005);
  n.rotation.z = -0.5;
  // A row of switches under the dial.
  for (const x of [dx - 0.02, dx, dx + 0.02]) add(new THREE.BoxGeometry(0.008, 0.012, 0.01), metal, x, -0.038, D / 2 + 0.004);
  // The handle over the top.
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) add(new THREE.BoxGeometry(0.012, 0.05, 0.02), metal, x, H / 2 + 0.025, 0);
  add(new THREE.BoxGeometry(W - 0.02, 0.014, 0.024), metal, 0, H / 2 + 0.05, 0);

  const holder = new THREE.Group();
  holder.add(rig);
  scene.add(holder);
  const REST = new THREE.Vector3();
  let scale = 1;
  let pulse = 0;

  const screenRect = () => {
    holder.position.copy(REST);
    holder.rotation.copy(ROT);
    holder.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig);
    const out = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const v = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          v.set(x, y, z).project(camera);
          out.x0 = Math.min(out.x0, (v.x + 1) / 2);
          out.x1 = Math.max(out.x1, (v.x + 1) / 2);
          out.y0 = Math.min(out.y0, (1 - v.y) / 2);
          out.y1 = Math.max(out.y1, (1 - v.y) / 2);
        }
      }
    }
    return { x0: Math.max(0, out.x0), x1: Math.min(1, out.x1), y0: Math.max(0, out.y0), y1: Math.min(1, out.y1) };
  };

  return {
    scene,
    camera,
    screenRect,

    /** As the ship's scanner: kept left of the buttons, and right of the stick. */
    resize(aspect, { rightLimit = null, leftLimit = null } = {}) {
      camera.fov = fovFor(BASE_FOV, aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const half = Math.abs(DEPTH) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      // Low in the corner, and partly off the bottom edge, as in the reference.
      REST.set(half * aspect * 0.7, -half * 0.8, DEPTH);
      scale = 0.62 * THREE.MathUtils.clamp(aspect / 1.2, 0.7, 1);
      rig.scale.setScalar(scale);
      if (rightLimit !== null) {
        const left = leftLimit ?? 0;
        const r = screenRect();
        const room = rightLimit - left;
        if (r.x1 - r.x0 > room) {
          scale *= Math.max(0.6, room / (r.x1 - r.x0));
          rig.scale.setScalar(scale);
        }
        for (let pass = 0; pass < 6; pass++) {
          const s = screenRect();
          let shift = 0;
          if (s.x1 > rightLimit) shift = rightLimit - s.x1;
          else if (s.x0 < left) shift = left - s.x0;
          if (Math.abs(shift) < 1e-4) break;
          REST.x += shift * 2 * half * aspect;
        }
      }
    },

    /** A small lift on every interaction. */
    play() {
      pulse = 1;
    },

    /** Follows the walk: the bob, and a kick that settles after a press. */
    update(dt, bobPhase, speed) {
      pulse = Math.max(0, pulse - dt * 4);
      const walk = Math.min(1, speed / 3);
      holder.position.set(
        REST.x + Math.sin(bobPhase) * 0.006 * walk,
        REST.y + Math.abs(Math.cos(bobPhase)) * 0.006 * walk + Math.sin(pulse * Math.PI) * 0.012,
        REST.z
      );
      holder.rotation.copy(ROT);
    },
  };
}
