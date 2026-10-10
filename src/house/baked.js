import * as THREE from 'three';

import { chartsFor, skin } from './charts.js';
import { SPACES } from './layout.js';

/**
 * The baked surfaces (9.4.4) in the house: every chart the pipeline baked,
 * laid over its wall, floor or ceiling as a skin. The light is in the
 * texture, so the skin is unlit; the fog and the grade still pass over it.
 * The lamps still light the furniture and the doors live, as before.
 */
export function bakedSkins(surfaces) {
  const group = new THREE.Group();
  group.name = 'baked';
  for (const s of SPACES) {
    for (const c of chartsFor(s.id)) {
      const map = surfaces.tex[`baked:${c.id}`];
      if (!map) continue;
      const material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
      group.add(skin(c, material));
    }
  }
  return group;
}
