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
      // A hall chart unwrapped from the owner's painting (9.3) is a picture,
      // not a texture: filtered as one, clear of the fog the painting already
      // has, and passed through the grade untouched (projection.js).
      const painted = !!surfaces.manifest.baked[c.id]?.painted;
      if (painted) {
        map.magFilter = THREE.LinearFilter;
        map.minFilter = THREE.LinearFilter;
        map.needsUpdate = true;
      }
      const material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, fog: !painted });
      material.userData.painted = painted;
      group.add(skin(c, material));
    }
  }
  return group;
}
