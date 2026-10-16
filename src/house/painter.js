import * as THREE from 'three';

import { PAINTING } from './layout.js';

/**
 * Where the owner's painting was painted from, and how (9.3): the one place
 * both the game's projector (projection.js) and the pipeline's unwrap
 * (pipeline/house/model/unwrap.js) read it, so the paint the pipeline puts on
 * a wall is the paint the projector throws there.
 */
export function paintingCamera() {
  const [W, H] = PAINTING.size;
  const camera = new THREE.PerspectiveCamera(PAINTING.fov, W / H, 0.05, 30);
  camera.position.fromArray(PAINTING.pos);
  camera.rotation.set(0, PAINTING.yaw, 0, 'YXZ');
  camera.setViewOffset(W, H, (0.5 - PAINTING.axis[0]) * W, (0.5 - PAINTING.axis[1]) * H, W, H);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** How much of a surface the painting gives it, by how squarely the painter saw it. */
export const FACING = [0.08, 0.25];
