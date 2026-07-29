import * as THREE from 'three';

/**
 * Greybox stand-ins.
 *
 * Build order step 1 is "the game is fully playable, just gray" — these are
 * that gray. Each stand-in matches the real-world scale in the asset manifest
 * and puts its origin at floor-centre, exactly like the pipeline's output, so
 * swapping in generated models changes nothing about placement.
 */

const GREY = 0x777c74;
const DARK = 0x5c615a;

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function meshAt(geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

const BUILDERS = {
  cargo_crate() {
    const g = new THREE.Group();
    const body = mat(GREY);
    g.add(meshAt(new THREE.BoxGeometry(0.8, 0.78, 0.8), body, 0, 0.39, 0));
    const rib = mat(DARK);
    g.add(meshAt(new THREE.BoxGeometry(0.86, 0.09, 0.86), rib, 0, 0.12, 0));
    g.add(meshAt(new THREE.BoxGeometry(0.86, 0.09, 0.86), rib, 0, 0.66, 0));
    return g;
  },

  canister() {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.CylinderGeometry(0.23, 0.23, 1.1, 10), mat(GREY), 0, 0.58, 0));
    g.add(meshAt(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 10), mat(DARK), 0, 0.06, 0));
    g.add(meshAt(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 10), mat(DARK), 0, 1.18, 0));
    return g;
  },

  wall_console() {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.BoxGeometry(1.0, 1.5, 0.42), mat(GREY), 0, 0.75, 0.21));
    g.add(meshAt(new THREE.BoxGeometry(0.78, 0.5, 0.12), mat(DARK), 0, 1.12, 0.46, -0.28));
    g.add(meshAt(new THREE.BoxGeometry(1.08, 0.12, 0.5), mat(DARK), 0, 1.55, 0.22));
    return g;
  },

  pipe_cluster() {
    const g = new THREE.Group();
    const body = mat(GREY);
    const band = mat(DARK);
    const offsets = [-0.28, 0, 0.3];
    const radii = [0.11, 0.15, 0.09];
    offsets.forEach((ox, i) => {
      g.add(meshAt(new THREE.CylinderGeometry(radii[i], radii[i], 2.0, 8), body, ox, 1.0, 0.2));
    });
    g.add(meshAt(new THREE.BoxGeometry(0.86, 0.1, 0.42), band, 0, 0.5, 0.2));
    g.add(meshAt(new THREE.BoxGeometry(0.86, 0.1, 0.42), band, 0, 1.62, 0.2));
    return g;
  },

  floor_debris() {
    const g = new THREE.Group();
    const body = mat(DARK);
    g.add(meshAt(new THREE.BoxGeometry(0.9, 0.12, 0.62), body, 0, 0.07, 0, 0.12, 0.4, 0.06));
    g.add(meshAt(new THREE.BoxGeometry(0.5, 0.1, 0.44), body, 0.24, 0.2, 0.12, -0.3, 1.1, 0.2));
    g.add(meshAt(new THREE.BoxGeometry(0.34, 0.34, 0.2), mat(GREY), -0.3, 0.16, -0.14, 0, 0.8, 0.25));
    return g;
  },

  power_switch() {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.BoxGeometry(0.62, 1.34, 0.2), mat(GREY), 0, 0.67, 0.1));
    g.add(meshAt(new THREE.BoxGeometry(0.46, 0.44, 0.1), mat(DARK), 0, 0.92, 0.24));
    g.add(meshAt(new THREE.BoxGeometry(0.1, 0.34, 0.12), mat(DARK), 0, 0.42, 0.24, -0.35));
    return g;
  },

  airlock_door() {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.BoxGeometry(2.3, 2.6, 0.2), mat(GREY), 0, 1.3, 0));
    g.add(meshAt(new THREE.BoxGeometry(2.3, 0.16, 0.26), mat(DARK), 0, 1.3, 0));
    g.add(meshAt(new THREE.BoxGeometry(0.3, 2.5, 0.26), mat(DARK), -0.9, 1.3, 0));
    g.add(meshAt(new THREE.BoxGeometry(0.3, 2.5, 0.26), mat(DARK), 0.9, 1.3, 0));
    return g;
  },

  scanner() {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.BoxGeometry(0.13, 0.09, 0.26), mat(GREY), 0, 0, 0));
    g.add(meshAt(new THREE.BoxGeometry(0.1, 0.07, 0.1), mat(DARK), 0, 0.06, -0.09));
    g.add(meshAt(new THREE.BoxGeometry(0.06, 0.12, 0.06), mat(DARK), 0, -0.09, 0.06));
    return g;
  },
};

export function placeholderModel(id) {
  const build = BUILDERS[id];
  if (!build) {
    const g = new THREE.Group();
    g.add(meshAt(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(GREY), 0, 0.25, 0));
    return g;
  }
  return build();
}
