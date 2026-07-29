# DERELICT

A 3–5 minute first-person vignette that runs in the browser. You wake on a dead
spaceship. The exit airlock needs two power cells, and each one is clamped in a
charging cradle that will not let go until you have restored power to the room
it sits in. Find them, carry them back, escape.

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

Airlock Bay, on emergency power, with a dead airlock reading **0/2** above two
empty cell sockets. Six steps, and none of them can be taken out of order:

1. West through Corridor A to the **Storage Hold**, and throw switch 1. Its room
   and corridor snap from emergency red to green-white, and the cradle in the
   corner releases its clamps.
2. Take cell 1.
3. Carry it back and seat it in a socket. That reads 1/2 and brings the Bay up
   on its own power.
4. East through Corridor B — half-blocked by collapsed debris, so you squeeze
   past — to the **Engine Annex**, and throw switch 2. The Annex lights, a
   shortcut hatch back to the Bay powers open, and cradle 2 releases. It needs
   both the Annex under power *and* the Bay live, so neither half opens it
   alone.
5. Take cell 2.
6. Seat it. At 2/2 the airlock cycles; walk into it to end the run.

You carry one cell at a time, and a carried cell replaces the scanner in your
hands. You can put one down anywhere — it lands on the deck at your feet, and
standing over it is enough to pick it back up. Sockets are one-way: a seated
cell is spent, which deletes "I put it in the wrong place" as a failure rather
than testing for it.

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
lights, conduits, prop placements, switch mounts, and the cradles and sockets
with their release conditions are all declared there; geometry, colliders and
lighting zones are derived from it. A cradle names the conditions that free its
cell, which is what makes the chain ordered by machinery rather than by level
design — `cradle2` needs `['switch2', 'bay-live']`, and dropping either half
makes the Annex switch skippable.

`public/assets/manifest.json` is written by the pipeline and is what the game
loads. Anything missing from it falls back to a procedural greybox stand-in, so
the game stays playable with no assets at all.

## Assets

```bash
npm run pipeline          # textures → models → audio → manifest
```

Seven tileable textures, ten props (normalised to real-world scale and
decimated to budget), ten sounds. 1.8 MB in total.

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
npm test            # all five harnesses
```

Individually, optionally with `--shots` to write screenshots to `tools/shots`:

```bash
npm run test:chain        # the six-step dependency chain
npm run test:deadend      # the walkable floor
npm run test:smoke        # systems
npm run test:walkthrough  # the route, on foot
npm run test:mobile       # touch controls
```

All five run in CI on every pull request, alongside a check that regenerating
`public/assets` reproduces exactly what is committed — so a generator cannot
change without its output changing with it, and vice versa.

**chain** drives each interaction directly, with aim taken out of it, and
asserts that every one of the six steps refuses to work before its predecessor.
It is about ordering only — whether a thing is reachable is walkthrough's job.

**deadend** does not play the game at all. It reads the collider set out of the
running build, grids the level at 10 cm, and floods from the spawn to establish
that the walkable floor is a single mutually reachable piece in every gate
state. That is what backs "a cell set down anywhere can always be recovered":
since a cell lands where the player is standing and adds no collider of its own,
the guarantee is a property of the floor rather than of the action order.

**smoke** drives the full sequence in headless Chromium, teleporting between
rooms to get at each system quickly. It fails on any console error, on a switch
or door not firing, on any of the ten sounds failing to decode, or on a
restart leaving state behind.

**walkthrough** does not teleport. It walks the whole route with held movement
keys and mouse look, so collision, doorway widths and the debris squeeze are
genuinely exercised — this is what backs the no-soft-locks claim. Any leg that
stalls fails the run with the coordinates it got stuck at. It also asserts that
walking straight into the corridor B blockage *stops* you, since a blockage you
can stroll through is not a blockage.

**mobile** drives synthetic touch streams in an emulated phone: the left stick
walks the player, a right-side drag turns the camera, the context button throws
a switch, takes a cell, puts it down, picks it back up and seats it. The
set-down is the part worth testing there, because it is the one action with
nothing in the crosshair to light the context button.

Every assertion is written against a condition, never against a stopwatch, and
where a stall has to be detected it is measured against the game clock rather
than the wall clock. Movement and door animations advance in game time with a
clamped delta, so a slow renderer covers less ground per real second — a burst
count, a per-poll distance and a wall-clock deadline are all really
measurements of the renderer, under which a walking player looks identical to a
stuck one.
