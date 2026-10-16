import { readFileSync } from 'node:fs';

import { loadModels } from '../../src/house/models.js';
import { checkModels } from './blender/models.js';

/**
 * The house's Blender models, loaded in Node, for the parts of the pipeline
 * that build the house as the game does (the light's export, the grime's
 * occlusion). Fails, naming the remedy, if they are stale.
 */
const files = checkModels();
export const MODELS = await loadModels(
  Object.fromEntries(Object.entries(files).map(([id, file]) => [id, { file }])),
  async (file) => {
    const b = readFileSync(file);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
);
