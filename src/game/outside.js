import * as THREE from 'three';
import { applyPlaneUVs } from '../core/materials.js';
import { THRESHOLD, WALLS } from './layout.js';

/**
 * Phase 6 — the outside (6.3.1).
 *
 * Two things: the sky, and the side of the hull you see when you turn round on
 * the threshold.
 *
 * The sky is a mesh rather than `scene.background`, so it is a drawn object
 * with a material that the consumption gate can find bound like any other
 * texture on the ship. It uses three's own background-cube shader — the same
 * one `scene.background` would have used — on a unit box that follows the
 * camera and is drawn first, behind everything. It is the only material on
 * the ship with fog off (6.3.1), and it carries no light: space is not lit by
 * the ship's lamps.
 *
 * Nothing inside the hull can see it, because every compartment is a closed
 * box and the outer door is the only opening onto it (6.4).
 */
export function buildOutside(assets, materials) {
  const group = new THREE.Group();
  group.name = 'outside';

  const cube = assets.sky();
  let sky = null;
  if (cube) {
    const shader = THREE.ShaderLib.backgroundCube;
    const material = new THREE.ShaderMaterial({
      name: 'sky',
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    material.defines = { ENVMAP_TYPE_CUBE: '' };
    material.uniforms.envMap.value = cube;
    // A CubeTexture is sampled x-flipped; three applies the same correction
    // to its own background, and the generator draws for it.
    material.uniforms.flipEnvMap.value = -1;
    material.uniforms.backgroundIntensity.value = 1;
    // Read by tools/consume.mjs, which finds textures by what a material binds.
    material.envMap = cube;

    sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    sky.name = 'sky';
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    sky.onBeforeRender = function (renderer, scene, camera) {
      this.matrixWorld.copyPosition(camera.matrixWorld);
    };
    group.add(sky);
  }

  group.add(buildHull(materials));
  return { group, sky };
}

/**
 * The hull's outside face: one flank of plating around the outer door, so that
 * turning round on the threshold shows the skin of a ship rather than the backs
 * of seven boxes. Wide and tall enough to fill the view from anywhere on the
 * threshold, and set just proud of the chamber's far bulkhead so the door's own
 * trim still frames the opening.
 *
 * It sits entirely north of every compartment, so from inside the hull it is
 * behind a wall in every direction — the only way to see it is to be outside.
 */
function buildHull(materials) {
  const outer = WALLS.find((w) => w.openings?.some((o) => o.id === 'airlock-outer'));
  const door = outer.openings.find((o) => o.id === 'airlock-outer');
  const z = outer.at - 0.21;

  const span = { x: [-26, 26], y: [-9, 12] };
  const hole = {
    x: [door.center - door.width / 2, door.center + door.width / 2],
    y: [0, door.height],
  };

  const geos = [];
  const panel = (x0, x1, y0, y1) => {
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const geo = applyPlaneUVs(new THREE.PlaneGeometry(w, h), w, h, 2);
    // Faces -Z, toward the threshold.
    geo.rotateY(Math.PI);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    geos.push(geo);
  };
  panel(span.x[0], hole.x[0], span.y[0], span.y[1]);
  panel(hole.x[1], span.x[1], span.y[0], span.y[1]);
  panel(hole.x[0], hole.x[1], hole.y[1], span.y[1]);
  // Below the deck line the opening is closed — the threshold is bolted on at
  // the sill, and under it is more hull.
  panel(hole.x[0], hole.x[1], span.y[0], hole.y[0]);

  const group = new THREE.Group();
  group.name = 'hull';
  for (const geo of geos) {
    const mesh = new THREE.Mesh(geo, materials.surface('wall_panel_a'));
    mesh.name = 'hull:wall_panel_a';
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // The threshold's underside. From the deck you can look over the kerb, and
  // a plate with nothing under it is a plate hanging in a void.
  const w = THRESHOLD.x[1] - THRESHOLD.x[0];
  const d = THRESHOLD.z[1] - THRESHOLD.z[0];
  const under = applyPlaneUVs(new THREE.PlaneGeometry(w, d), w, d, 2);
  under.rotateX(Math.PI / 2);
  under.translate((THRESHOLD.x[0] + THRESHOLD.x[1]) / 2, -0.12, (THRESHOLD.z[0] + THRESHOLD.z[1]) / 2);
  const belly = new THREE.Mesh(under, materials.surface('greeble_panel'));
  belly.name = 'hull:greeble_panel';
  belly.matrixAutoUpdate = false;
  group.add(belly);

  return group;
}
