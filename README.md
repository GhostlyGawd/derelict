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
interact, `C` or left `Ctrl` held to crouch, `Esc` to pause.
**Mobile** — left thumb anywhere on the left half is the movement stick, drag on
the right half to look, tap the context button to interact, hold the crouch
button to crouch.

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
6. Seat it. At 2/2 the inner airlock cycles. Step into the chamber and the
   outer door starts cycling with it: the chamber floods white through the
   opening, every compartment behind you loses its power, and you walk out onto
   the deck outside the hull. You hold the camera the whole way — there is no
   cutscene in this game and there is not going to be one.

Corridor B is hung with collapsed structure at 1.2 m, so the squeeze is a
squeeze: standing it is a wall, crouched it is a route. No collision code went
into that — `resolve()` already ignores any collider whose underside clears the
player's current stance.

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

Seven tileable textures plus a glyph atlas, six of them carrying a generated
normal map; ten props (normalised to real-world scale and decimated to budget);
thirteen sounds; and five impulse responses, one per distinct compartment shape.
2.6 MB in total.

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
textures are nearest-filtered, and distance fog closes the draw. The six tiling
surfaces are Phong with a nearest-filtered normal map derived from a height
channel the texture generators write alongside their colour, so a bolt answers
the lamp you are standing under instead of being lit from a direction decided
when the texture was drawn. No PBR — that is out permanently. A frame-time
watchdog steps the internal resolution down if the device cannot hold the
target. The whole ship is merged into roughly a dozen draw calls, and the
point-light count is fixed for the life of the scene — Three.js recompiles every
material when it changes, which would otherwise stall the frame at exactly the
moment a player flips a switch.

## Checks

```bash
npm run build
npm run preview     # in another shell
npm test            # all nine harnesses
```

Individually, optionally with `--shots` to write screenshots to `tools/shots`:

```bash
npm run test:chain        # the six-step dependency chain
npm run test:deadend      # the walkable floor, both stances
npm run test:acoustics    # the generated impulse responses, off disk
npm run test:relief       # normal maps are bound, and the lighting reads them
npm run test:legible      # every space named once, and readable
npm run test:consume      # every generated asset is observed in use
npm run test:framecost    # what the shipped frame costs over a stripped one
npm run test:smoke        # systems
npm run test:walkthrough  # the route, on foot
npm run test:mobile       # touch controls
```

All nine run in CI on every pull request, alongside a check that regenerating
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
or door not firing, on any of the thirteen sounds or five impulse responses
failing to decode, or on a restart leaving state behind.

**acoustics** needs no browser and no server. The claim is about the generated
data, so it reads the responses off disk and measures them: each one's decay
has to land within tolerance of the Sabine estimate for the box it was
generated from, compartments of different size have to differ measurably, and
compartments of identical size have to share one response rather than
coincidentally resemble each other.

**relief** moves a lamp. Six normal maps existing and being listed proves
nothing — the failure this exists to catch is a map that is generated
correctly, bound correctly and never sampled. So it photographs a bulkhead lit
hard from the left and then hard from the right, does it again with the normals
replaced by a single flat texel, and measures how much the fine detail
re-shaded in each case. Relief scores about 6.6× the flat control.

**consume** guards the class that **relief** guards one instance of. Twice this
project has shipped an asset that was generated correctly, listed correctly,
wired correctly, and never reached the thing meant to consume it — the normal
maps, and a reverb send that fed the convolvers almost nothing for a whole
phase. So this one plays the game and requires every manifest entry to be
*observed in use*: every texture bound on a mesh that is actually being drawn,
every model instantiated into a scene, every sound audible at the master bus
and played by the game during a complete run, and every impulse response
selected for its own compartment and audibly answering a footstep. It never
reads the source — static analysis would have passed both of the bugs it
exists to catch, because in each case the code referencing the asset was
present and correct. It found a third on its first run.

**framecost** reports a ratio and never a frame rate, because an absolute
number here is a fact about the CI runner. Same scene, same geometry, same
pinned internal resolution, same pinned camera stations; the only thing that
changes is whether the tiling surfaces are the shipped Phong-with-relief or a
stripped Lambert twin. Relief costs about 1.27× a stripped frame, and the two
independent passes have to agree with each other before the number is allowed
to mean anything. The sync is a one-pixel `readPixels` — `gl.finish()` is the
obvious call and it does not work under a software rasteriser, where it returns
in a few tenths of a millisecond while the frame it is supposedly waiting for
takes eighty.

**walkthrough** does not teleport. It walks the whole route with held movement
keys and mouse look, so collision, doorway widths and the debris squeeze are
genuinely exercised — this is what backs the no-soft-locks claim. Any leg that
stalls fails the run with the coordinates it got stuck at. It also asserts that
walking straight into the corridor B blockage *stops* you standing and passes
you crouched, since a blockage you can stroll through is not a blockage. It
owns the ending too: that stepping into the chamber starts the departure rather
than cutting to black, that the outer door cycles and the chamber floods
through it, that the ship behind goes dark, and that the camera is never taken
away — input stays live and look input still turns the player right up until
the end card. Whether the moment *lands* is the owner's call and this cannot
say.

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
