#!/usr/bin/env node
import path from 'node:path';

import { MODELS, SOUNDS, TEXTURES } from './manifest.js';
import { STYLE_BIBLE } from './style-bible.js';
import { ASSETS, bytes, rel, writeJson } from './lib/io.js';
import { log } from './lib/log.js';
import { runAudio } from './stages/audio.js';
import { runModels } from './stages/models.js';
import { runTextures } from './stages/textures.js';

/**
 * DERELICT asset pipeline.
 *
 *   node pipeline/run.js [all|textures|models|audio|manifest] [--force]
 *
 * Every asset in the game is produced here, from the manifest and the shared
 * style bible, by generators in `offline/`. No network, no credentials, no
 * third-party services — which is also why the whole thing can run as part of
 * a deploy build rather than only on a workstation.
 */

const STAGES = ['textures', 'models', 'audio', 'manifest'];

async function main() {
  const [, , stageArg = 'all', ...flags] = process.argv;
  const force = flags.includes('--force');

  const stages = stageArg === 'all' ? STAGES : [stageArg];
  for (const stage of stages) {
    if (!STAGES.includes(stage)) {
      log.fail(`unknown stage "${stage}" — expected one of ${STAGES.join(', ')} or all`);
      process.exit(1);
    }
  }

  log.stage('style bible');
  log.note(STYLE_BIBLE);
  log.step(
    `manifest: ${TEXTURES.length} textures, ${MODELS.length} models, ${SOUNDS.length} sounds`
  );

  const collected = {};
  const run = async (name, stage) => {
    const requested = stages.includes(name);
    // The manifest has to describe what is actually on disk, so stages that
    // were not asked for still get walked — with `force` off they only read
    // back what a previous run left behind.
    if (!requested && !stages.includes('manifest')) return;
    collected[name] = await stage({ force: requested && force });
  };

  await run('textures', runTextures);
  await run('models', runModels);
  await run('audio', runAudio);

  if (stages.includes('manifest')) await writeManifest(collected);
}

async function writeManifest(collected) {
  log.stage('manifest');

  const total = ['textures', 'models', 'audio'].reduce(
    (sum, kind) => sum + Object.values(collected[kind]).reduce((s, e) => s + (e.bytes || 0), 0),
    0
  );

  const manifest = {
    generator: 'derelict pipeline',
    generatedAt: new Date().toISOString(),
    styleBible: STYLE_BIBLE,
    totals: {
      textures: Object.keys(collected.textures).length,
      models: Object.keys(collected.models).length,
      audio: Object.keys(collected.audio).length,
      bytes: total,
    },
    textures: collected.textures,
    models: collected.models,
    audio: collected.audio,
  };

  const file = path.join(ASSETS, 'manifest.json');
  await writeJson(file, manifest);
  log.done(
    `${manifest.totals.textures} textures, ${manifest.totals.models} models, ` +
      `${manifest.totals.audio} sounds — ${bytes(total)} total → ${rel(file)}`
  );

  const missing = [
    ...TEXTURES.filter((t) => !collected.textures[t.id]).map((t) => `texture ${t.id}`),
    ...MODELS.filter((m) => !collected.models[m.id]).map((m) => `model ${m.id}`),
    ...SOUNDS.filter((s) => !collected.audio[s.id]).map((s) => `sound ${s.id}`),
  ];
  if (missing.length) {
    log.fail(`missing assets: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else {
    log.done('every asset in the manifest is present');
  }
}

main().catch((err) => {
  log.fail(err.stack || err.message);
  process.exit(1);
});
