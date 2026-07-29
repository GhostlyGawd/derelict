# DERELICT asset pipeline

Every texture, model and sound the game loads is produced here and committed to
`/public/assets`. The deployed site is static files; this never runs in
production.

```bash
npm run pipeline              # all four stages
npm run pipeline:textures
npm run pipeline:models
npm run pipeline:audio
npm run pipeline:manifest     # rewrite manifest.json from what is on disk

node pipeline/run.js all --force   # regenerate everything
```

## What the stages do

| Stage | Input | Output |
|---|---|---|
| **style bible** | `style-bible.js` | one prompt block prepended to every generation |
| **textures** | `manifest.js` | synthesise at 2× → downscale to 256–512 px → `assets/textures/*.png` |
| **models** | `manifest.js` | parametric geometry + surface → post-process → `assets/models/*.glb` |
| **audio** | `manifest.js` | synthesise → loudness-normalise → `assets/audio/*.mp3` |
| **manifest** | all of the above | `assets/manifest.json`, which is what the game loads |

The model post-process (`lib/glb.js`): move the origin to floor-centre, scale to the real-world size in the manifest, decimate
to the triangle budget with meshoptimizer, and crunch every texture to 256 px.

`manifest.js` is the single source of truth. Adding an asset means adding a row
there — the stages, the runtime manifest and the game's loader all follow.

## No third parties

Everything is synthesised locally by `offline/`:

| | |
|---|---|
| textures | tileable raster synthesis — value-noise fbm, panel/rivet/tread construction, grime, chipping, scratch passes |
| models | parametric chamfered geometry plus a generated per-prop metal surface |
| audio | oscillators, filtered noise and modal resonators through envelopes |

No API keys, no network, no rate limits, and a clean checkout reproduces every
byte. That determinism is load-bearing: it lets the deploy build run
`npm run pipeline` itself rather than depending on generated files being
committed and kept in sync.

The prompts in `manifest.js` are still the brief for each asset, and
`style-bible.js` is still the single lever on the look — they describe what a
generator is aiming for, and keep the set coherent.

## Layout

```
pipeline/
  run.js              CLI and stage sequencing
  style-bible.js      the shared prompt block, suffixes and palette
  manifest.js         every asset, with prompt, size and budget
  stages/             textures, models, audio
  offline/            the generators: textures, models, sound
  lib/                raster, mesh, glb, image, audio, io helpers
  .cache/             contact sheets and model stats (gitignored)
```

## Checking a run

A run writes `pipeline/.cache/textures-contact.png`, a contact sheet of
the seven surfaces. The models stage reports triangle counts against budget and
warns if anything overshoots. `tools/smoke.mjs` then drives the built game
through the whole route in a headless browser and asserts that every sound
decoded and every asset loaded.
