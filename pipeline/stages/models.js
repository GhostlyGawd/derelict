import fs from 'node:fs/promises';
import path from 'node:path';

import { MODELS } from '../manifest.js';
import { synthesiseModel } from '../offline/models.js';
import { buildGlb, postprocess } from '../lib/glb.js';
import { normaliseConcept } from '../lib/image.js';
import { ASSETS, CACHE, bytes, ensureDir, exists, readJson, rel, sha1, write, writeJson } from '../lib/io.js';
import { log } from '../lib/log.js';
import { generateImage } from '../providers/images.js';
import { imageTo3D } from '../providers/meshy.js';

/**
 * Stage 3 — models.
 *
 * Provider path, per the spec: concept image → image→3D → GLB → post-process.
 * Offline path: parametric geometry + generated texture → GLB → the same
 * post-process. Either way the file that lands in /public/assets has its
 * origin at floor-centre, is scaled to its real-world size, sits inside its
 * triangle budget and carries 256 px textures.
 */
export async function runModels({ backend, force = false }) {
  log.stage('models');
  const outDir = path.join(ASSETS, 'models');
  await ensureDir(outDir);

  const entries = {};
  const statsFile = path.join(CACHE, 'model-stats.json');
  const previous = (await readJson(statsFile)) || {};
  const stats = {};

  for (const spec of MODELS) {
    const file = path.join(outDir, `${spec.id}.glb`);
    if (!force && (await exists(file)) && previous[spec.id]) {
      log.step(`${spec.id} — up to date`);
      entries[spec.id] = { file: `models/${spec.id}.glb`, ...previous[spec.id] };
      stats[spec.id] = previous[spec.id];
      continue;
    }

    const raw =
      backend === 'provider' ? await viaImageTo3D(spec) : await viaSynthesiser(spec);

    const { buffer, stats: post } = await postprocess(raw, {
      id: spec.id,
      size: spec.size,
      fit: spec.fit,
      tris: spec.tris,
      textureSize: 256,
    });
    await write(file, buffer);

    const entry = {
      triangles: post.triangles,
      budget: spec.tris,
      metres: post.sizeMetres,
      fit: spec.fit,
      bytes: buffer.length,
    };
    entries[spec.id] = { file: `models/${spec.id}.glb`, ...entry };
    stats[spec.id] = entry;

    const decimated =
      post.trianglesBefore !== post.triangles ? ` (from ${post.trianglesBefore})` : '';
    log.done(
      `${spec.id} — ${post.triangles} tris${decimated} / budget ${spec.tris}, ` +
        `${post.sizeMetres} m, ${bytes(buffer.length)}`
    );
    if (post.triangles > spec.tris) log.warn(`${spec.id} is over its triangle budget`);
  }

  await writeJson(statsFile, stats);
  return entries;
}

async function viaSynthesiser(spec) {
  const { geometry, texture } = await synthesiseModel(spec);
  return buildGlb({ id: spec.id, geometry, texture });
}

async function viaImageTo3D(spec) {
  const concept = await conceptImage(spec);
  const key = sha1(`${spec.prompt}|meshy|${spec.tris}`);
  const cached = path.join(CACHE, 'meshes', `${spec.id}-${key}.glb`);
  if (await exists(cached)) {
    log.note(`cache hit ${rel(cached)}`);
    return fs.readFile(cached);
  }
  const glb = await imageTo3D(concept, { name: spec.id, targetPolycount: spec.tris * 3 });
  await write(cached, glb);
  return glb;
}

async function conceptImage(spec) {
  const key = sha1(`${spec.prompt}|concept|${process.env.IMAGE_PROVIDER || 'auto'}`);
  const cached = path.join(CACHE, 'concepts', `${spec.id}-${key}.png`);
  if (await exists(cached)) {
    log.note(`cache hit ${rel(cached)}`);
    return fs.readFile(cached);
  }
  const raw = await generateImage(spec.prompt, { width: 1024, height: 1024 });
  const png = await normaliseConcept(raw, 1024);
  await write(cached, png);
  return png;
}
