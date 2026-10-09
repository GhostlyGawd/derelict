import * as THREE from 'three';

/**
 * The house's generated surfaces (phase 9, 9.4.4), loaded from the house's
 * own manifest and turned into materials. Point-sampled and unmipmapped, like
 * every texture on the ship: the chunky look is the filtering as much as the
 * pixels.
 */
export async function loadSurfaces(base = '/assets/house/manifest.json') {
  const manifest = await (await fetch(base)).json();
  const loader = new THREE.TextureLoader();
  const tex = {};
  const point = (t, colour) => {
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  await Promise.all(
    Object.entries(manifest.textures).map(async ([id, entry]) => {
      tex[id] = point(await loader.loadAsync(entry.file), true);
      tex[`${id}_n`] = point(await loader.loadAsync(entry.normal), false);
    })
  );
  // The grade is a lookup table, read between its cells, so it alone is
  // filtered linearly. It is data, not a picture: no colour-space decode.
  const grade = await loader.loadAsync(manifest.grade.file);
  grade.colorSpace = THREE.NoColorSpace;
  grade.magFilter = THREE.LinearFilter;
  grade.minFilter = THREE.LinearFilter;
  grade.generateMipmaps = false;
  return { manifest, tex, grade, materials: materials(tex) };
}

function materials(tex) {
  // Phong with a dark, low specular, as on the ship (4.3.1): enough that a
  // worn board or a wet patch catches the lamp, and no more.
  const phong = (id, { shininess = 8, specular = 0x0c0e0a, normalScale = 0.8, ...rest } = {}) =>
    new THREE.MeshPhongMaterial({
      map: tex[id],
      normalMap: tex[`${id}_n`],
      normalScale: new THREE.Vector2(normalScale, normalScale),
      shininess,
      specular,
      ...rest,
    });
  return {
    wall: phong('plaster', { shininess: 6 }),
    floor: phong('floor', { shininess: 14, specular: 0x14180f }),
    ceiling: phong('ceiling', { shininess: 2 }),
    wood: phong('wood', { shininess: 12 }),
    door: phong('door', { shininess: 10 }),
    rug: phong('rug', { shininess: 2, normalScale: 0.4 }),
    curtain: new THREE.MeshLambertMaterial({ map: tex.curtain, side: THREE.DoubleSide }),
    paper: new THREE.MeshLambertMaterial({ map: tex.paper, side: THREE.DoubleSide }),
    picture: new THREE.MeshLambertMaterial({ map: tex.picture }),
    // The night is light from outside, not lit by the hall: unlit, and clear of
    // the fog, which belongs to the inside.
    night: new THREE.MeshBasicMaterial({ map: tex.night, fog: false }),
    // Seen from below, from inside the cone: both faces are drawn.
    shade: new THREE.MeshBasicMaterial({ color: 0xf2f4e6, side: THREE.DoubleSide }),
  };
}

/**
 * Rewrites a mesh's UVs from where its vertices are in the world, so a
 * surface tiles at its real size whatever the box it is on. Each face is
 * projected along its own axis: walls by their run and height, floors and
 * ceilings by plan. `tile` is metres per repeat across, `tileV` up, and
 * `baseY` the floor a wall's height is measured from.
 */
export function worldUV(mesh, { tile = 2, tileV = tile, baseY = 0 } = {}) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const p = mesh.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + p.x;
    const y = pos.getY(i) + p.y;
    const z = pos.getZ(i) + p.z;
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, z / tile, (y - baseY) / tileV);
    else uv.setXY(i, x / tile, (y - baseY) / tileV);
  }
  uv.needsUpdate = true;
  return mesh;
}
