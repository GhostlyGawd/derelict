import path from 'node:path';

import { MODELS } from '../manifest.js';
import { synthesiseModel } from '../offline/models.js';
import { buildGlb, postprocess } from '../lib/glb.js';
import { ASSETS, CACHE, bytes, ensureDir, exists, readJson, rel, write, writeJson } from '../lib/io.js';
import { log } from '../lib/log.js';

/**
 * Stage 3 — models.
 *
 * Parametric geometry + a generated texture → GLB → post-process. The file
 * that lands in /public/assets has its origin at floor-centre, is scaled to
 * its real-world size, sits inside its triangle budget and carries a 256 px
 * texture.
 */
export async function runModels({ force = false }) {
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

    const { geometry, texture } = await synthesiseModel(spec);
    const raw = await buildGlb({ id: spec.id, geometry, texture });

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



