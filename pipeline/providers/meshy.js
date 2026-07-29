import { log } from '../lib/log.js';
import { poll, requestBuffer, requestJson } from '../lib/http.js';

/**
 * Meshy image→3D.
 *
 * Submit the concept image, poll the task, download the GLB. The post-process
 * in lib/glb.js is what actually makes the result usable in the game — this
 * module only has to get the mesh out of the service.
 */

const BASE = process.env.MESHY_BASE_URL || 'https://api.meshy.ai/openapi/v1';

export function meshyStatus() {
  return {
    name: 'meshy',
    ready: Boolean(process.env.MESHY_API_KEY),
    hint: 'set MESHY_API_KEY',
  };
}

export async function imageTo3D(imageBuffer, { name = 'prop', topology = 'triangle', targetPolycount } = {}) {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error('MESHY_API_KEY is not set');

  const headers = { Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const body = {
    image_url: `data:image/png;base64,${imageBuffer.toString('base64')}`,
    ai_model: process.env.MESHY_MODEL || 'meshy-4',
    enable_pbr: false,
    should_remesh: true,
    should_texture: true,
    topology,
  };
  if (targetPolycount) body.target_polycount = targetPolycount;

  const created = await requestJson(
    `${BASE}/image-to-3d`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    { label: `meshy submit ${name}` }
  );

  const taskId = created?.result || created?.id || created?.task_id;
  if (!taskId) throw new Error(`meshy did not return a task id: ${JSON.stringify(created).slice(0, 300)}`);
  log.note(`meshy task ${taskId} for ${name}`);

  const task = await poll(
    async () => {
      const status = await requestJson(
        `${BASE}/image-to-3d/${taskId}`,
        { headers: { Authorization: `Bearer ${key}` } },
        { label: `meshy poll ${name}` }
      );
      const state = String(status?.status || '').toUpperCase();
      if (state === 'SUCCEEDED') return { done: true, value: status };
      if (state === 'FAILED' || state === 'CANCELED') {
        throw new Error(`meshy task ${taskId} ${state}: ${status?.task_error?.message || ''}`);
      }
      return { done: false, status: `${state} ${status?.progress ?? 0}%` };
    },
    { label: `meshy ${name}`, intervalMs: 6000, timeoutMs: 20 * 60 * 1000 }
  );

  const url = task?.model_urls?.glb || task?.model_url || task?.model_urls?.gltf;
  if (!url) throw new Error(`meshy task ${taskId} produced no GLB`);
  return requestBuffer(url, {}, { label: `meshy download ${name}` });
}
