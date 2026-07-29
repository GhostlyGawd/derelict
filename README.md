# DERELICT

A 3–5 minute first-person vignette that runs in the browser. You wake on a dead
spaceship. Two power switches, hidden in different rooms, energise the exit
airlock. Find them, flip them, escape.

Every texture, prop, the scanner in your hands and every sound is produced by a
build-time pipeline and committed to `public/assets` — the deployed site is
static files.

The locked spec is in [`CLAUDE.md`](CLAUDE.md).

## Play

```bash
npm install
npm run dev
```

**Desktop** — mouse look (click to capture the pointer), `WASD` to move, `E` to
interact, `Esc` to pause.
**Mobile** — left thumb anywhere on the left half is the movement stick, drag on
the right half to look, tap the context button to interact.

## The route

Airlock Bay, on emergency power, with a dead airlock reading **0/2**. West
through Corridor A is the **Storage Hold** and the first switch. East through
Corridor B — half-blocked by collapsed debris, so you squeeze past — is the
**Engine Annex** and the second. Flipping a switch snaps its room and corridor
from emergency red to green-white and steps the airlock panel. The second one
also powers open a shortcut hatch back to the bay, so the walk home is not a
retrace. At 2/2 the airlock cycles; walk into it to end the run.

## Layout

```
src/
  core/       renderer, input, audio, asset loading, materials, HUD
  game/       layout data, level and prop builders, player, interaction,
              lighting, fixtures, viewmodel
pipeline/     asset generation — see pipeline/README.md
public/assets generated textures, models, sounds and the manifest
tools/        headless playtest
```

`src/game/layout.js` is the level. Spaces, wall lines with their door openings,
lights, conduits, prop placements and switch mounts are all declared there;
geometry, colliders and lighting zones are derived from it.

`public/assets/manifest.json` is written by the pipeline and is what the game
loads. Anything missing from it falls back to a procedural greybox stand-in, so
the game stays playable with no assets at all.

## Assets

```bash
npm run pipeline          # textures → models → audio → manifest
```

Seven tileable textures, eight props (normalised to real-world scale and
decimated to budget), eight sounds. 2.2 MB in total.

The pipeline has two backends. `provider` is the pipeline the spec describes:
text→image for textures and model concepts, Meshy for image→3D, ElevenLabs for
sound. `offline` is a deterministic procedural synthesiser that fills every slot
without credentials.

> **The assets committed here came from the `offline` backend** — the build
> environment had no generation credentials, so the provider path could not be
> run. Procedural synthesis is not AI generation, and `manifest.json` records
> `"backend": "offline"` so that is visible at runtime rather than only in the
> docs. Add keys to `.env` (see `.env.example`) and run
> `npm run pipeline -- --backend=provider --force` to regenerate the set through
> the generation services.

## Rendering

Late-90s treatment throughout: the scene renders into a backbuffer at 0.5–0.66×
the viewport and is point-upscaled by the compositor, antialiasing is off,
textures are nearest-filtered, and distance fog closes the draw. A frame-time
watchdog steps the internal resolution down if the device cannot hold the
target. The whole ship is merged into roughly a dozen draw calls, and the
point-light count is fixed for the life of the scene — Three.js recompiles every
material when it changes, which would otherwise stall the frame at exactly the
moment a player flips a switch.

## Checks

```bash
npm run build
npm run preview

node tools/smoke.mjs       http://127.0.0.1:4173/ --shots  # systems
node tools/walkthrough.mjs http://127.0.0.1:4173/ --shots  # the route, on foot
node tools/mobile.mjs      http://127.0.0.1:4173/ --shots  # touch controls
```

**smoke** drives the full sequence in headless Chromium, teleporting between
rooms to get at each system quickly. It fails on any console error, on a switch
or door not firing, on any of the eight sounds failing to decode, or on a
restart leaving state behind.

**walkthrough** does not teleport. It walks the whole route with held movement
keys and mouse look, so collision, doorway widths and the debris squeeze are
genuinely exercised — this is what backs the no-soft-locks claim. Any leg that
stalls fails the run with the coordinates it got stuck at. It also asserts that
walking straight into the corridor B blockage *stops* you, since a blockage you
can stroll through is not a blockage.

**mobile** drives synthetic touch streams in an emulated phone: the left stick
walks the player, a right-side drag turns the camera, the context button flips
a switch.

`--shots` writes screenshots to `tools/shots`.
