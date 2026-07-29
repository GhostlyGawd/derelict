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

node pipeline/run.js all --force              # regenerate everything
node pipeline/run.js models --backend=offline # force a specific backend
```

## What the stages do

| Stage | Input | Output |
|---|---|---|
| **style bible** | `style-bible.js` | one prompt block prepended to every generation |
| **textures** | `manifest.js` | generate → downscale to 256–512 px → `assets/textures/*.png` |
| **models** | `manifest.js` | concept image → image→3D → post-process → `assets/models/*.glb` |
| **audio** | `manifest.js` | generate → loudness-normalise → `assets/audio/*.mp3` / `*.wav` |
| **manifest** | all of the above | `assets/manifest.json`, which is what the game loads |

The model post-process (`lib/glb.js`) is the same for both backends: move the
origin to floor-centre, scale to the real-world size in the manifest, decimate
to the triangle budget with meshoptimizer, and crunch every texture to 256 px.

`manifest.js` is the single source of truth. Adding an asset means adding a row
there — the stages, the runtime manifest and the game's loader all follow.

## Two backends

`--backend=auto` (the default) uses the generation providers when their
credentials are present, and the offline synthesiser when they are not.

**`provider`** — the pipeline as the spec describes it:

| Role | Service | Key |
|---|---|---|
| text→image | fal.ai, Replicate, or OpenAI | `FAL_KEY` / `REPLICATE_API_TOKEN` / `OPENAI_API_KEY` |
| image→3D | Meshy | `MESHY_API_KEY` |
| text→SFX | ElevenLabs | `ELEVENLABS_API_KEY` |

Copy `.env.example` to `.env` and fill in whichever set you have, then:

```bash
set -a && source .env && set +a
npm run pipeline -- --backend=provider --force
```

Generated images, concept images and raw meshes are cached under
`pipeline/.cache` keyed by prompt hash, so re-running the post-process never
re-bills a generation. Delete the cache to force fresh generations.

**`offline`** — a deterministic procedural synthesiser: tileable raster
synthesis for textures, parametric block geometry for models, and DSP for
sound. It exists so the pipeline always produces a complete, coherent asset set
without credentials, and so the greybox → integration path can be exercised
end to end.

> **The assets committed in this repo were produced by the `offline` backend.**
> The build environment had no image, image→3D or sound-generation credentials,
> so the provider path could not be executed. Procedural synthesis is not AI
> generation — `manifest.json` records `"backend": "offline"` so the
> distinction is visible at runtime, not just here. Supply the keys above and
> run `npm run pipeline -- --backend=provider --force` to regenerate the whole
> set through the generation services instead.

## Layout

```
pipeline/
  run.js              CLI and stage sequencing
  style-bible.js      the shared prompt block, suffixes and palette
  manifest.js         every asset, with prompt, size and budget
  stages/             textures, models, audio
  providers/          fal / replicate / openai, meshy, elevenlabs
  offline/            procedural texture, model and sound synthesis
  lib/                raster, mesh, glb, image, audio, http, io helpers
  .cache/             generation cache and contact sheets (gitignored)
```

## Checking a run

Both backends write `pipeline/.cache/textures-contact.png`, a contact sheet of
the seven surfaces. The models stage reports triangle counts against budget and
warns if anything overshoots. `tools/smoke.mjs` then drives the built game
through the whole route in a headless browser and asserts that every sound
decoded and every asset loaded.
