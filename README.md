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
**Mobile** — a touch in the lower-left of the screen (the left third in
landscape) is the movement stick; drag anywhere else to look, and a second
thumb is always look while you are moving. Tap the context button to interact,
and hold the crouch button to crouch.
**Pad** — any standard controller, on either: left stick to move, right stick
to look, `A` to interact, `B` held to crouch, `Start` to pause and resume. The
prompt names whichever button is in your hand.

**On a phone, the second time** — after the first visit the game is on the
device: it opens from there, with no network at all, and can be added to the
home screen to launch full screen. A new deploy is picked up on the visit after
it lands.

**Recording a run** — open the game with `?trace` on the end of the URL and
play. The end card offers the file: every raw input event and the time step of
every frame. Nothing is sent anywhere. Committed to `tools/traces/`, it becomes
a test that replays your run through the real input layer. Since phase 8 it
also carries the real time of every frame, so CI reports how the game ran on
the phone that recorded it.

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
   opening, every compartment behind you loses its power, the machinery winds
   down, and you walk out onto the deck outside the hull, under a sky you have
   not been able to see until now. You hold the camera the whole way — there
   is no cutscene in this game and there is not going to be one.

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
  sw/         the service worker, and the build step that lists its files
pipeline/     asset generation — see pipeline/README.md
public/assets generated textures, models, sounds and the manifest
tools/        headless playtest; tools/lib holds what the harnesses share
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
normal map; one sky, as six cube faces; ten props (normalised to real-world
scale and decimated to budget); seventeen sounds; and five impulse responses,
one per distinct compartment shape; and an icon, for a home screen, drawn from
the same stencil letterforms as the ship's signage. About 2.3 MB in total.

The sky is drawn by asking, for every texel of every face, what lies in that
direction: stars, a band of unresolved starlight, the banded limb of a gas giant
and one hard sun. That is why the faces meet at their seams without being drawn
to match. Nothing inside the hull can see it. The outer door is the only way
out, so the first look at the outside is the end of the game.

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

Power travels. When a switch is thrown or a cell is seated, each lamp in the
zone strikes after a delay set by its distance from that switch or socket, with
its own stutter. The conduit strips, coloured per vertex, fill green along their
runs from the same end. The zone counts as powered from the press itself. The
strike is something to watch, never something to wait for.

Every lit shaft has dust in it: a few dozen square motes with no texture, drawn
only inside the cone and only as bright as their lamp is on that frame, so the
strike stutters in the air too and the departure takes it out with the lights.

Dead and live never differ by hue alone. Red is still dead and green is still
live, but every pair also differs by at least 3:1 in brightness as rendered,
under normal vision and under protanopia, deuteranopia and tritanopia, so the
ship reads to a colour-blind player and in a greyscale photograph.

## Checks

```bash
npm run build
npm run preview     # in another shell
npm test            # all sixteen harnesses
```

Individually, optionally with `--shots` to write screenshots to `tools/shots`:

```bash
npm run test:chain        # the six-step dependency chain
npm run test:deadend      # the walkable floor, both stances
npm run test:acoustics    # the generated impulse responses, off disk
npm run test:relief       # normal maps are bound, and the lighting reads them
npm run test:legible      # every space named once, and readable
npm run test:colour       # state reads by brightness, not hue alone
npm run test:consume      # every generated asset is observed in use
npm run test:clock        # every idle sound on its motion's clock
npm run test:replay       # recorded runs replay to where they ended
npm run test:monkey       # hostile input can break nothing, and every run can be finished
npm run test:weight       # bytes to title, gated; time to title, reported; the second visit
npm run test:framecost    # what each feature costs, and the whole frame
npm run test:profile      # frame times on the owner's phone, from the traces
npm run test:smoke        # systems
npm run test:walkthrough  # the route, on foot
npm run test:mobile       # touch controls
```

All sixteen run in CI on every pull request, alongside a check that regenerating
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
or door not firing, on any of the seventeen sounds or five impulse responses
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

Since phase 6 it also covers the outside and the machinery. The sky has to be
bound on the drawn sky mesh, exempt from fog, and visible on the way out. It
also has to be invisible from 280 views inside the hull, taken with the sky
swapped for a flat marker colour. That check found a 2 cm crack down the outer
door's jamb on its first run. Each idle sound has to be placed where its moving
part is, louder in the nearer ear, and carried by its own compartment's
reverb.

**clock** exists because a sound on its own timer beside a motion passes every
other check: it is generated, consumed, panned and in the right room. So this
one records both sides frame by frame. What is seen is read off the scene: the
fan's angle, the vent's breath, the spark's burst and the failing lamp's
brownouts. What is heard is read off the mixer's entry points. It then requires
every visible event to have a sound within one frame, and every sound to have a
visible event. It was written before the sounds were wired, and failed all eight
of its checks until they were.

**framecost** reports a ratio and never a frame rate, because an absolute
number here is a fact about the CI runner. Same scene, same geometry, same
pinned internal resolution, same pinned camera stations. Each drawing feature
gets a row of its own, the same scene with only that feature stripped: relief
(Phong-with-relief against a Lambert twin) costs about 1.2–1.3×, and the sky
about 1.1× at the two stations that can see it. The budget is on the whole
frame, everything shipped against everything stripped. It reads about 1.45×
against a ceiling of 1.9×, and two independent passes have to agree before
the number is allowed to mean anything. The sync is a one-pixel `readPixels` — `gl.finish()` is the
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

**mobile** drives synthetic touch streams in an emulated phone: the stick walks
the player, a drag turns the camera, the context button throws a switch, takes
a cell, puts it down, picks it back up and seats it. The set-down is worth
testing there, because it is the one action with nothing in the crosshair to
light the context button. Since phase 7 it also drives two thumbs at once. The
left thumb walks while the right goes down left of centre and looks. A single
thumb reaching across to look must not walk. A sweep of nearly 600 touch-downs
across the screen is judged against the same zone table the game reads. The
first two reproduced the owner's report exactly before the fix.

**replay** plays recorded runs back. It first records two runs of its own, two
thumbs on a portrait phone and keys plus mouse on a desktop, and replays each
in a fresh page by stepping the game's own frame body with every recorded time
step. Both have to agree at every checkpoint. Its first run caught the recorder
labelling checkpoints one frame late. Then it replays every trace in
`tools/traces/` that was recorded on the current input layer. A trace recorded
on an older layer is kept as evidence rather than gated, because a deliberate
change to how touches are assigned is supposed to make it diverge. The harness
reports what the new layer would do differently with it.

**weight** counts every byte the page takes before the title appears, decoded,
so the count is the same whether or not the server compresses. It gates the
total at the phase 7 measurement, 3.37 MB, plus 15%. Time to title on a pinned
10 Mbit/s connection is reported and not gated, because part of it is the
runner's CPU. Since phase 8 it also serves a copy of the build itself, with
`vercel.json`'s own headers, and checks the service worker: nothing from the
network on the second visit, the title with the network cut, the old build
whole on the visit after a deploy and the new one on the visit after that,
with only the changed files fetched, and a retiring worker leaving nothing
behind. To retire a broken worker, build with `DERELICT_RETIRE_WORKER=1` and
deploy.

**profile** reads the frame times every owner trace carries and reports them by
compartment, during a power strike and during the departure. It takes the
player's position from replaying the trace, frame by frame. It is reported and
never gated: it is a fact about one phone on one day, and it sits beside the
frame budget, which is relative.

**monkey** plays twelve seeded runs on a desktop, two phones and a desktop with
a pad. An autopilot heads for the next step of the chain and is interrupted by
bursts of hostile input: mashing interact, flickering crouch, every key at
once, pausing mid-strike, dropping a cell somewhere awkward, storms of taps,
four thumbs, the OS cancelling every touch, a pad pulled out mid-stride. One
burst each lands under the slab, mid-strike, while carrying and while walking
out. Every frame it checks that nothing threw, the player is on the deck and
in no wall, both cells exist in exactly one place each, and nothing has gone
backwards. Then the autopilot has to finish the run. Every input is a real
event, so each run is a trace. A failing seed is shrunk and kept in
`tools/traces/monkey/`, and those replay first.

**colour** photographs every dead/live pair in both states, through the real
lights and textures, and simulates three colour-vision deficiencies on the
pixels. It also photographs every conduit run, because its first run found six
of them inside their walls, where they had been since the greybox.

Every assertion is written against a condition, never against a stopwatch, and
where a stall has to be detected it is measured against the game clock rather
than the wall clock. Movement and door animations advance in game time with a
clamped delta, so a slow renderer covers less ground per real second — a burst
count, a per-poll distance and a wall-clock deadline are all really
measurements of the renderer, under which a walking player looks identical to a
stuck one.
