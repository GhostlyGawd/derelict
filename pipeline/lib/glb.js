import { Document, NodeIO } from '@gltf-transform/core';
import {
  dedup,
  flatten,
  getBounds,
  join,
  prune,
  simplify,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

import { crunchModelTexture } from './image.js';

/**
 * GLB authoring and post-processing.
 *
 * `postprocess` is the spec's model post-process, and it runs over whatever
 * produced the mesh — an image→3D service or the offline synthesiser:
 *   origin to floor-centre → scale to real size → decimate to budget →
 *   crunch textures to 256 px.
 */

const io = new NodeIO();

export async function buildGlb({ id, geometry, texture }) {
  const doc = new Document();
  doc.createBuffer();

  const accessor = (array, type) => doc.createAccessor().setType(type).setArray(array);

  const material = doc
    .createMaterial(`${id}_material`)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setDoubleSided(false);

  if (texture) {
    material.setBaseColorTexture(
      doc.createTexture(`${id}_albedo`).setMimeType('image/png').setImage(texture)
    );
  }

  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor(geometry.position, 'VEC3'))
    .setAttribute('NORMAL', accessor(geometry.normal, 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(geometry.uv, 'VEC2'))
    .setIndices(accessor(geometry.index, 'SCALAR'))
    .setMaterial(material);

  if (geometry.color?.length) {
    primitive.setAttribute('COLOR_0', accessor(geometry.color, 'VEC3'));
  }

  const mesh = doc.createMesh(id).addPrimitive(primitive);
  const node = doc.createNode(id).setMesh(mesh);
  doc.createScene(id).addChild(node);

  return Buffer.from(await io.writeBinary(doc));
}

export async function postprocess(glb, { id, size, fit = 'height', tris, textureSize = 256 }) {
  const doc = await io.readBinary(new Uint8Array(glb));

  await MeshoptSimplifier.ready;
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }));

  const before = countTriangles(doc);
  if (tris && before > tris) {
    await doc.transform(
      weld({ tolerance: 0.0001 }),
      simplify({ simplifier: MeshoptSimplifier, ratio: tris / before, error: 0.005, lockBorder: false })
    );
  }
  await doc.transform(prune());

  // ---- origin to floor-centre, scaled to the real-world size --------------
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const bounds = getBounds(scene);
  const span = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const reference = fit === 'longest' ? Math.max(...span) : span[1];
  const scale = reference > 1e-6 ? size / reference : 1;

  const centre = [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) / 2,
  ];

  const matrix = [
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    -centre[0] * scale, -centre[1] * scale, -centre[2] * scale, 1,
  ];

  for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, matrix);
  for (const node of scene.listChildren()) {
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }

  // ---- crunch every texture the model carries -----------------------------
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const crunched = await crunchModelTexture(Buffer.from(image), textureSize);
    texture.setImage(crunched).setMimeType('image/png');
  }

  const after = countTriangles(doc);
  const buffer = Buffer.from(await io.writeBinary(doc));

  return {
    buffer,
    stats: {
      trianglesBefore: before,
      triangles: after,
      scale: Number(scale.toFixed(4)),
      sizeMetres: Number((reference * scale).toFixed(3)),
      textures: doc.getRoot().listTextures().length,
    },
  };
}

function countTriangles(doc) {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : primitive.getAttribute('POSITION')?.getCount() || 0;
      total += count / 3;
    }
  }
  return Math.round(total);
}
