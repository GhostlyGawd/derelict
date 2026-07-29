# DERELICT

A 3–5 minute first-person vignette that runs in the browser. You wake on a dead
spaceship. Two power switches, hidden in different rooms, energise the exit
airlock. Find them, flip them, escape.

Every texture, prop, the scanner in your hands and every sound is produced by a
build-time pipeline that runs with no network and no credentials — the deployed
site is static files.

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
decimated to budget), eight sounds. 1.6 MB in total.

Every asset is produced by generators in `pipeline/offline/` — tileable raster
synthesis for the surfaces, parametric chamfered geometry for the props, DSP
for the sound — all driven from one manifest and one shared style bible. There
are no API keys, no network calls and no third-party services: the whole thing
runs from a clean checkout in a few seconds, and reproduces every byte.

That last property is why the deployed site can build its own assets. The
generators are deterministic, so `npm run pipeline` is part of the build rather
than something that has to be run on a workstation and committed.

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
npm run preview     # in another shell
npm test            # all three harnesses
```

Individually, optionally with `--shots` to write screenshots to `tools/shots`:

```bash
npm run test:smoke        # systems
npm run test:walkthrough  # the route, on foot
npm run test:mobile       # touch controls
```

All three run in CI on every pull request, alongside a check that regenerating
`public/assets` reproduces exactly what is committed — so a generator cannot
change without its output changing with it, and vice versa.

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

Every assertion is written against a condition, never against a stopwatch:
movement and door animations advance in game time with a clamped delta, so a
slow renderer covers less ground per real second. Tests that measured elapsed
time were really measuring frame rate, and they failed the moment the browser
changed.
