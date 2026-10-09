
# DERELICT — Spec

**How to read this document.** Phase 9 (v2.0) is the most recent section and
is a **draft** in flight; merging it ratifies it. It is the first phase that is
not about the ship: it adds a second, separate demo, the house, and lifts some
guardrails for the house only. Phase 8, Phase 7, Phase 6, Phase 5, Phase 4,
Phase 3, Phase 2, Amendment 1 and the v1.0 sections below them are shipped.
Where any two disagree, the later section wins. Nothing here is a suggestion —
if we change something during a build, we change this document first.

---

## Amendment 1 — 29 July 2026: no third-party generation services

Supersedes the parts of §1, §2, §7 and §8 that assume hosted generation
services. Decided during the build; the rest of the spec stands unchanged.

**What changed.** The asset pipeline no longer calls out to an image model,
Meshy, or a sound-effect service. Every texture, prop and sound is produced by
generators written for this project — tileable raster synthesis, parametric
chamfered geometry, and DSP — driven from the same asset manifest and the same
single style bible §8 already required.

**What that means for §1.** "AI-generated" now describes how the *generators*
were produced, not a diffusion model rendering pixels at build time. The
distinction is real and the repo should not blur it: an AI wrote the code that
draws the rivets, rather than an image model drawing them directly.

**What it buys.** No API keys, no per-run cost, no rate limits, no service
drift, and a clean checkout reproduces every asset byte-for-byte. That
determinism is load-bearing — it lets the deploy build run the pipeline itself
instead of depending on generated files staying in sync in git.

**§8 stage 3 now reads:** per prop — build parametric geometry at real-world
scale with chamfered edges and baked edge wear, generate its metal surface,
then the same post-process as before (origin to floor-centre, scale, decimate
to tri budget, crunch textures to 256 px).

---

# Phase 9 — v2.0, the house

**Status: DRAFT.** Proposed 8 October 2026. Merging this section ratifies it.
The build follows in milestones, each in its own pull request with its own
preview. On the same terms as everything below: nothing here is a suggestion,
and if we change something during the build we change this document first.

Settled in an interview before it was written, as phases 2 and 3 were (9.10).
The owner asked for something creative after two phases of instruments: *"a
resident evil style level matching this architecture and look … a model of
this house and the rooms and second story … a 10 minute tech demo with
interactivity and lore."* The reference is one image the owner supplied: a
damp entry hall at night, described in 9.3. It is not committed to the
repository. The entry hall is recreated from it as closely as code-made art
allows: its layout, proportions, props, palette and light, as seen from where
the player starts. The rest of the house is our own, built in the same manner.
Every surface is still drawn by code. Nothing in the image is traced, sampled
or imported. (The owner asked for the hall to be a 1:1 recreation on seeing
milestone 2; the draft had said the house would not copy the picture.)

**What the build changed in this section, and why.** Written as each
milestone lands, ahead of or with the code, as every phase has.

*Milestone 0, the backlog.* The 195 ms hitch was shaders compiling the first
time a room lit up. Everything is now drawn once, on the canvas, while the game
loads. A first attempt drew to an off-screen target, and its programs were a
different variant from the canvas's, so a few still compiled later.
`tools/warm.mjs` looks round every space in every chain state and fails if a
program, texture or geometry appears after the title: 15, 26 and 133 now, from
10, 42 and 127 growing in play before. The scanner is placed in the room
between the stick and the buttons, scaled down if it has to be, and
`tools/mobile.mjs` checks it on seven screens with both the scanner and a
carried cell.

*Milestone 1, two storeys.* The player stands on `floorAt`, colliders are
measured from the feet, and the ship leaves both at y = 0.
`tools/house/floors.mjs` went red with the landing's banister taken out, a fall
into the stairwell caught as a move with no way back, and green with it in.
The ship's service worker no longer answers `/house/` with the ship's page,
which it would have, and the house is not in the ship's precache.

*Milestone 2, the loop.* Four things the build found:

- **The interact ray went through walls.** The ship's ray tests only the
  things it can use, never the rooms. On the ship nothing usable is within
  reach of another room, so it never showed. In the house, the tin key's box
  upstairs could be opened from the dining room through the ceiling. The chain
  harness found it on its first run. The ray now stops at whatever it is given
  as solid. The house gives it its shell, and the ship gives it nothing and
  behaves as before.
- **Upstairs forks.** The study key and the tin key can be found in either
  order, which 9.3's step 4 always allowed. The loop table now names what each
  step `needs` rather than relying on its row order, and the chain harness
  proves each step against its needs.
- **A door leaf caught a shoulder.** An open door's leaf stood 8 mm into its
  own doorway on the hinge side. A player cutting the corner caught on its
  edge and was pushed straight back. The monkey's autopilot stuck there for a
  whole run. The leaf now sits behind the hinge line. The front door opens
  outward, because opening inward it swept the place the player starts.
- **The monkey's brain did not carry over.** Its input layer and its hostile
  bursts did, unchanged. Its planner knew one floor, two stances, cells and
  switches, and the house has its own (`tools/lib/monkey-house.js`). This is
  the kind of finding 9.2 asks to be recorded.

*The owner's first look at milestone 2, 9 October 2026.* It went badly, and
two of the reasons are bugs the instruments should have caught:

- **The owner walked past the gate.** The house kept its own player radius,
  0.30 m, while the player moves at the ship's 0.34 m. Every proof in
  `tools/house/` proved a thinner player than the one that plays. At the top
  of the stairs the real one rests against the gate and the banister at once.
  The collision code found a rounding error's overlap with the banister, and
  "resolved" it by the shorter way out, which was north through the gate, 78
  cm in one frame. That put the owner upstairs before the clock, and then
  stranded them there behind a gate that only opens from the other side.
  The house now takes the player's body from the ship, and in the house
  touching is not overlapping. `tools/house/chain.mjs` walks the gate and
  every locked door with 120 hostile tries each and requires nothing to get
  through. It is shown to fail with the fix turned off.
- **The gate at the top of the stairs made no sense.** It was a black slab
  in greybox. The owner chose to keep the stairs open, as they are in the
  picture, and to have the clock unlatch a door at the head of the stairs
  instead. 9.3 says so.
- **Grey was not what the owner expected to see.** The build order put the
  look at milestone 3. The owner's reading of milestone 2 was that "none of
  this looks anything like the concept art", and that they wanted the hall to
  be a 1:1 recreation of it. That is now the brief for milestone 3, and the
  header of this section says so.
- **The ship has the same latent push.** Removing it on the ship as well made
  both of the owner's recorded ship runs diverge in Corridor B's squeeze,
  where those runs went through with it happening. It is left as it is on the
  ship, because the ship is not to change in this phase, and recorded here
  as a finding for a later one.

*Milestone 3, the entry hall.* The hall was re-laid to the reference's
composition. The flight now runs on past the back wall's line into a slot in
the ceiling, the front door is in the right-hand wall just short of the stair
foot, and a gallery beside the stairwell reaches the bedroom. The field of
view is wider than the ship's (80° against 72°), because the reference shows
the window at the left edge and the front door at the right. The style
engine's first findings were its own bugs: a damp spread that grew on every
pass and soaked the wall black, and a fractional blur radius that read the
wetness field between cells. Both were caught by looking at the generated
plaster before it went on a wall. The lamp is a downward cone with a faint
glow up, because a bare bulb lit the ceiling brightest of anything, and the
reference's ceiling is nearly black.

Dressing the hall broke two proofs, and both were real. The hall's chair,
placed where the reference has it, stood in the parlour doorway, and the floor
proof found the parlour and its note unreachable. And the line past which the
run ends was a line across the whole plan, so walking to the kitchen stove
ended the game. The chain harness found that one by accident. Its hostile
walks at the study door start in the kitchen, and they ended the run on its
first pass, which left its second pass, the self-test, a house that no longer
moved. The line now holds only beside the hall, and the floor proof fails any
place inside the house that counts as out of it. It is shown to fail on the
old line. The self-test's walks now also turn back and lean on the door, as a
player trying to get through would.

The monkey then found three more, all from re-laying the house, and all now in
`tools/traces/monkey-house/` or fixed in the layout. With the study door open,
its leaf and the study's note table left a gap narrower than the player, so
the study could be entered and its desk never reached. The floor proof had
passed it, because the desk is within arm's reach of the doorway. And the slot
the stairs climb through had side walls a few centimetres proud of the
banister on one side and of the hall's wall on the other, so a player climbing
with a shoulder to either one had their head inside the slot's edge. The
banister now runs to a newel post at the foot of the flight, as in the
reference, and the stairs are climbed from the front. The handheld is the
battery lantern 9.4.4 asked for, held with its face to the player as the
device in the reference is: a grille, a gauge and a handle, built in engine
and kept clear of the touch buttons by the scanner's rule.

*The owner's look at milestone 3, 9 October 2026.* "The hall reads much
better." Three things did not. The drawers floated: each was a plain box
pushed half into its wall, with no legs, no plinth and nothing under it, so it
read as hanging in the air. The upstairs wall clipped: the flight's handrail
and balusters kept rising past the hall's ceiling, into the wall of the slot
the stairs climb through, and came out of it into the gallery. And the style
is not yet the picture, and nothing past the hall was dressed. The look bar
stays open. The open banister now runs from the newel post to the hall's back
wall, and above that a handrail runs on the wall. Every drawer and box is a
piece of furniture standing in its room. Milestone 4, dressing the rest of the
house, follows on in the same pull request, with the style pushed further in
the hall at the same time rather than signed first: the owner can judge the
hall better among dressed rooms than alone.

*Milestone 4, the rest of the house.* Every room is furnished from a kit of
parametric pieces (`src/house/furniture.js`): chests, tables, chairs, beds, a
wardrobe, bookcases, a fireplace, a range, a sink, a bath and a basin, lamps,
pictures and rugs. Each stands on legs or a plinth, and each casts a soft
shadow onto the floor, so it reads as touching the ground. The rooms are
placed in `src/house/rooms.js`. Every room has its own paint over the plaster.
The dining room and the study have a wooden wainscot, and the kitchen and the
bathroom are tiled to a dado. The tile is the tenth surface texture: the night
outside is its own asset class in 9.7, so the box holds. Every outside wall
that faces a room has a window onto the night.

Placing the furniture was where the proofs bit. The monkey's autopilot plans
with ten centimetres to spare round the player, and it could not get past the
kitchen table, round the dining table to the clock, or out of a corner the
parlour's bookcase made, all of which a player of the real size could. Each
was re-laid with room to spare rather than the planner's margin cut. The
bedroom was re-laid whole, with the bed's head under the window and its
drawers on the north wall. The monkey also found a fault in itself. Its
synthetic touches landed on fractional pixels, the recorder keeps a tenth of
one, and a replay's look drifted from the run it was recorded from. Its
touches now land on whole pixels, as a screen's do.

The style harness now looks at every room, thirteen views in all, and it made
the lighting. Its first verdict was that every room past the hall was far
darker than the target and short of highlights and tones. Each room had a dim
lamp that lit it flat, and lit its neighbours through the walls. Every hanging
lamp is now a cone down from its shade, as the hall's is, so a room has a pool
of light and dark corners. The night fills the shadows blue, the plaster's
palette runs from yellow-green to grey-blue as the reference's walls do, and
old tiles no longer all match. The frame gains a vignette, as the reference's
has. No tolerance was loosened.

*The owner's play of milestone 4, 9 October 2026.* The drawers still floated
when opened: a drawer was only its front, and pulled out it was a plank in the
air. Every drawer is now a box, with sides, a back, a bottom and a dark
inside, that slides out on its runners. The rooms were crowded and oddly
placed. A second armchair, three chairs, the passage table and a bookcase are
gone, the kitchen table stands against a wall, and the two notes that lay on
tables in the middle of rooms are on tables against a wall instead. The
textures still do not look like the reference, and the next step is the
owner's to choose. A paint filter over the whole frame (a Kuwahara filter, in
the grade pass) was tried and is left off: at a strength a phone can afford it
barely changes the frame.

*Baked surfaces, chosen by the owner on 9 October 2026.* Asked how to come
closer to the reference without an image model, the owner chose to bake light
and grime into each surface, after a look at prior art: games of the
reference's era carried their light, shadow and dirt in every surface, where a
tiled texture lit live carries none of it. Each wall, floor and ceiling of a
room gets its own texture, drawn by the pipeline from the surface generators
and then lit by a ray tracer (three-mesh-bvh, MIT, a build-time dependency
only) from the room's own lamp, with ambient occlusion in its corners. Grime
is placed by the house's own geometry: damp rising from the floor, streaks
under sills and from the ceiling, dirt along the skirting, hand marks round
door handles and boards worn pale along the paths between doors. Each texture
is then painted over at build time, with a Kuwahara filter and brush strokes
laid along its contours, which costs nothing at run time. It is proved on the
entry hall first, as the look was.

The first bake looked like nothing had changed, and for a while it seemed the
grime was too faint. It was the photograph: the style harness only rewrites
its pictures when it is asked to (`--shots`), and the picture being judged was
from before the bake. Its numbers had been taken from the new frame all along.
Once the frame was looked at, the grime was faint as well. The bake now gives
every surface a mid-sized mottle of lighter and darker paint and wood, larger
stains with harder edges on the walls, and wet patches on the boards off the
paths people walk. All thirteen views stay inside the target.

*The owner's first trace of the house, 9 October 2026,* committed as
`tools/traces/house/owner-2026-10-09-m4.json`. It is a whole run on the
phone: 115 s, out of the front door, 17 ms a frame at the median and 18 at the
95th percentile, with one frame of 62 ms. That is far short of ten minutes,
and it is not the bar: the owner knew the house, and there is no story in it
yet. It did not replay. It left its recording at frame 690, the first look
after the first note, because the note reader was put away by a DOM click,
which arrives on the wall clock and is not in a trace. Replay never put the
note away, so every touch after it was read as a reader's. The reader now lets
every touch and click through to the view, and a tap off the buttons is taken
on the next frame as an input. The same trace then replays at all 230
checkpoints and ends where the owner did. `tools/house/monkey.mjs` replays
every owner trace of the house and requires exactly that. They have their own
folder, because the ship's replay and profiler read every trace beside
them.

*Blender and a tuner, chosen by the owner on 9 October 2026.* The baked hall
lit better and still did not look like the picture. The owner asked whether
the look could be optimised mathematically, and whether a real tool such as
Blender could do the work. The gap is detail more than colour, and the
reference is a painted picture from one fixed camera, so exact parity is not
on offer. Two things close it, and the owner took both:

- **Blender, pinned, at build time only.** Blender 4.2 LTS, free, scripted
  and run without a window, bakes each surface's light with a path tracer:
  light that bounces, soft shadows and moonlight from the windows, where the
  first bake had direct light and an occlusion guess. It is still all code:
  the house is built by our generators and exported to Blender, and Blender
  is told by a script what to light and how. No image model is involved.
  Blender's output is not promised byte for byte across machines, so its
  light maps are committed as sources beside the pipeline, with a hash of
  everything that went into them. The pipeline composes them with the
  generated surfaces and grime, deterministically, and fails if a light map
  is stale against the source files it was baked from. Neither CI nor the deploy
  runs Blender. Each source is baked as its own layer (the lamp's cone, its
  glow, and the night through the windows), so the look can weigh them
  afterwards without baking again: light adds. If the light and the tuner
  leave the shell reading flat, Blender's scripted modelling, wear and
  bevels on the shell, is the next step, and it comes back to the owner
  first.

As built, the same day. Blender bakes the hall in about 90 s at 1024
samples. The light maps are kept as RGBE in ordinary PNGs (three 8-bit
mantissas and a shared exponent), because 16-bit PNGs did not survive the
image library round trip. The stale check is shown to fail: touching
`bake.py` without baking again stops the pipeline with the remedy. The tuner
ran three passes and taught three things:

- **The tuner will remove the look if it is allowed to.** On numbers alone
  it turned the brush strokes and the mottle to nothing and the damp up to
  hard-edged camouflage. The statistics were closer and the picture was
  worse. The paint knobs now have a floor: the tuner may weaken the painted
  look the owner asked for, and never remove it. The damp's edges were
  softened by hand.
- **The grade is not the hall's to turn.** Tuned on the hall, it took four
  other rooms out of their palette. It is no longer a knob.
- **Neither is every rug.** The rug knob darkened every rug in the house,
  so the hall's runner has its own material.

The score fell from 96 to 41. Every one of the thirteen views stays inside
9.4.5's target, and the hall's reference view is inside its regions as
well. The regions are still the farthest numbers. The reference's front-door
wall is lit far brighter than ours, and its rug far darker. Those come from
how the picture was painted, not from a knob, and are the owner's to judge.

*Every room baked, 9 October 2026.* The owner said to continue, so every
room was baked the same way: 67 walls, floors and ceilings across twelve
spaces. Blender bakes them in about eleven minutes, the light maps committed
as sources come to 14 MB, and the baked surfaces the game loads come to
2.0 MB. The pipeline's own part takes about five minutes, most of it the
occlusion traced for the grime. Three things changed to get there:

- **A room's paint and dado are in its bake.** The game paints a room's
  walls with a lining 4 to 12 mm in front of the plaster (`LININGS`, now
  shared by the game and the bake). A wall's baked skin stands 14 mm off the
  plaster, in front of it, and carries the paint, the wainscot or the tile
  in its colour. The dado's rail still stands proud of the skin.
- **Light is baked per room.** Each surface is baked in four layers: its own
  room's lamp cones, its own room's glows, the light that spills in from every
  other room, and the night through the windows. Every lamp comes from the
  lights the game itself builds.
- **Each room has its own look.** Baked at neutral settings, eight rooms
  were far darker than the target, and 24 checks failed. The tuner gained a
  room mode: it turns one room's light and exposure against that room's own
  view, and never the hall's shared knobs. Tuned room by room, every view is
  inside the target again. The kitchen needed its exposure ceiling raised:
  its walls stand outside its lamp's cone and get only the edge of it.

Two things read wrong in the rooms and are left for the owner's look. The
kitchen's and bathroom's tiled floors carry the same wet blotches as the
boards, and the walls' mottle reads heavy in places.

*The deploy that would not build, 9 October 2026.* Every Vercel preview from
the Blender commit on failed in about twenty seconds, while CI passed. The
owner fetched the log: the pipeline had called the light stale. The staleness
check hashed the exported scene, the house's triangles and colours as
numbers, and Vercel's build machines computed those numbers a hair
differently from every other machine tried (three Node versions here, and
CI). The check now hashes the committed source files the light is baked from
(`LIGHT_SOURCES` in `pipeline/house/blender/export.js`), which are the same
bytes everywhere. The committed light was confirmed to belong to the same
scene under the old hash before it was stamped with the new one, and the
check is shown to fail again when one of those files changes.
- **A tuner.** The knobs that make the look (exposure, grime, damp, wear,
  paint and the grade) live in one table, and a tool turns them to bring
  fixed views of the hall closer to the reference. It scores regions of the
  frame, a grid over the view, by the same statistics 9.4.5 already uses,
  and never by pixels: the target stays numbers measured from the picture,
  and nothing of the picture is committed. The style harness gains the
  regional target and judges it on the hall's reference view.

For now, doors open and stay open, and a key is spent at its door. On a
phone the key ring sits at the top left, because the stick holds the bottom
left.

**This phase does not touch the ship.** DERELICT stays exactly as signed:
the same level, the same chain, the same guardrails, the same harnesses and the
same traces. Everything this section lifts, it lifts for the house only.

## 9.1 The one-liner

A second, separate demo on the same engine and the same pipeline: a two-storey
house at night, about ten minutes long, with locked doors, keys and notes, and
a story the house tells about itself. There is no combat and nothing to fight,
and every asset is generated by code.

## 9.2 What phase 9 demonstrates

**That the foundation is a foundation.** Eight phases built one game. This
phase finds out how much of that work was an engine and how much was a ship.
The movement, the input layer, traces and replay, the pipeline, the
consumption gate, the dead-end proof, the monkey and the frame budget should
all carry a second game unchanged or nearly so. Wherever they cannot, that is
a finding, and it is recorded rather than worked around.

**That generated assets can do domestic and organic.** Everything on the ship
is steel, rivets and conduit, which suits code: hard edges, repeated panels,
wear on corners. The house is wood grain, damp plaster, peeling wallpaper, a
patterned rug, fabric and glass, lit by one lamp. That is the hardest brief
the generators have had, and Amendment 1 stands: no image model draws any of
it.

**That a story can be written and still be tested.** This is the first phase
in which the project writes anything to be read. The machine can prove that
every note can be reached, can be read on a phone, and can be read in an order
that makes sense. Only the owner can say whether it lands. The bars in 9.6
keep those two apart, the same way 3.5 kept "big enough" apart from
"readable".

Every tradeoff during the build is settled against those three sentences.

## 9.3 The house

**The look, from the reference.** It is night, and everything carries a damp
green cast. In the entry hall the plaster is stained and peeling above dark
wainscot, the doors are tall, panelled and wooden, and the floorboards are
worn pale where people walked. A patterned runner rug runs down the middle. One
pendant lamp with a white shade hangs from the ceiling and lights a pool. The
front door has small panes with blue night behind them. A curtained window, a
sideboard, a hard chair, a framed picture and a paper notice pinned to the
wall complete it. An arch opens onto a passage deeper in, and a staircase with
a turned banister climbs the right-hand wall. In the corners of the view sit a
handheld device and two small panels of dot-matrix light.

**The rooms.** About ten spaces over two storeys, at real-world scale, with
2.8 m ceilings downstairs and 2.6 m upstairs:

| Floor | Space | Role |
|---|---|---|
| Ground | **Entry hall** | Start. The reference room: front door, stairs, the notice on the wall |
| Ground | **Parlour** | First open room, first note, a fireplace gone cold |
| Ground | **Dining room** | A table laid for people who did not come; a clock |
| Ground | **Kitchen** | Drawers, a stove, the back door (barred) |
| Ground | **Study** | Locked. The house's last secret |
| Ground | **Back passage** | Behind the arch: links the kitchen, the study and the cellar door |
| Upper | **Landing** | Top of the stairs; the upstairs doors |
| Upper | **Bedroom** | The parents' room |
| Upper | **Child's room** | Small, and the clearest part of the story |
| Upper | **Bathroom** | Tile, a cracked mirror, a window |

The table is the draft. The build may merge or split a space if the loop needs
it, and it changes this table first if it does.

**The loop, roughly ten minutes cold.** It runs on the same idea as the ship's
chain: machines that hold state and gate each other, declared as data and
proved ordered. Here the machines are locks and the state is keys:

1. **The hall.** The front door locks behind you, and the notice says why
   someone left.
2. **Downstairs, open.** The parlour and the kitchen. A drawer gives the first
   key, which opens the dining room.
3. **The clock.** In the dining room a clock is stopped. A note elsewhere gives
   the hour, and setting it unlatches the door at the head of the stairs. The
   stairs themselves are open, as in the picture. You can climb them early
   and find that door shut, and that is the point of the climb.
4. **Upstairs.** The bedroom holds the study key. The child's room holds what
   the study's lock asks for.
5. **The study.** The last of the story, and the front door's key.
6. **Out.** Back down the stairs and out of the front door, into the night
   the windows showed all along.

Every step is a row in the house's own layout table, in the way `CRADLES`
names what frees a cell. The chain harness proves no step works before its
predecessor, as it does on the ship.

## 9.4 What gets built

### 9.4.1 Two storeys — the engine

**What is wrong now.** The player has always stood at y = 0. The floor is
flat, every collider is measured from the deck, and the dead-end proof is a
single grid. A house has stairs.

**What gets built.**

- **Floors at height.** The player stands on whatever floor is under them, and
  stairs are a ramp of floor height that the collision code reads. Nothing
  gets a jump; the only way up is the stairs.
- **The dead-end proof on two floors.** It keeps one grid per floor, with the
  stairs as the only edges between them, and the same rule as before: the
  reachable set only grows, and every place can be walked back from.
- **A second entry point.** The house is its own page (`/house/`) built from
  `src/house/` and the shared `src/core/`. It has its own layout table,
  manifest and service worker list, and its own budgets.

This is the riskiest part of the phase, so it is built first, red before
green, as crouch was in phase 4.

### 9.4.2 The house as data — doors, keys, drawers, notes

- **Doors that swing** on hinges and open toward you or away. **Locks** name
  what opens them, in the layout table.
- **A key ring, not an inventory.** It holds only keys and the few objects the
  loop asks for, never more than four. It is shown in the two dot-matrix
  panels at the bottom left of the screen, as in the reference. There is no
  combining, no menu and no dropping: using a key happens at the door.
- **Drawers, cupboards and the clock** are interactives with state, built in
  engine from generated surfaces, as the socket was in phase 2.
- **Notes you can read.** Picking up a note opens it full-screen on generated
  paper, set in the glyph atlas's type, and any button puts it away. This is
  the one new piece of interface, and it is why the HUD rule is lifted for the
  house (9.5).

### 9.4.3 Dread without a threat

There is nothing in the house that can hurt you. Dread comes from three
sources:

- **The house changes when you are not looking.** A door you left open is
  shut when you come back, a lamp is out, a chair has turned to face the
  window. Each change is tied to a step of the loop, and each happens only out
  of view. **Nothing moves while you are looking at it.** That rule is the
  difference between dread and a jump scare, and a harness enforces it (9.6).
- **Sound.** Floorboards answer your weight and the stairs answer your feet.
  Rain runs on the windows, the pipes knock, and a clock ticks somewhere you
  have not been yet. All of it is DSP in the existing generator, placed and
  fed to each room's own reverb, as on the ship.
- **Light.** One lamp per room at most, moonlight through the windows, and
  pools of dark between them.

Rejected: a stalker. It needs AI, chase states and a way to fail, which is
most of another game. The owner chose dread over it. Jump scares were also
rejected: a change that happens on screen is a cutscene in miniature, and 5.4
still holds.

### 9.4.4 The look — wood, plaster, fabric and a green grade

- **New surface generators** for floorboards, damp plaster, wallpaper,
  wainscot, panelled door wood, kitchen and bathroom tile, the patterned rug
  and paper. All are tileable, with the height channel and relief from phase
  4, crunched and nearest-filtered like the ship's.
- **New props as parametric geometry:** a panelled door, the staircase and
  banister, sideboard, chair, table, bed, wardrobe, pendant lamp, window frame
  with curtains, picture frame, clock, stove and a bath. They follow the same
  rules as the ship's props: real-world scale, chamfered edges, baked wear and
  tri budgets.
- **The green grade.** A colour grade over the whole frame, generated as a
  lookup table by the pipeline, with an ordered dither under it, so the
  picture gets the reference's damp green cast and its slightly painted
  banding. It is a step in the existing retro treatment, not a filter on top.
- **Night outside.** The windows look out on a generated night: dark sky,
  rain, the black shapes of trees. You see it from inside before you ever go
  out, which is why the views-out rule is lifted for the house (9.5).
- **Baked surfaces.** Each wall, floor and ceiling of a room carries its own
  texture with the room's light, shadow and grime baked in and painted over,
  drawn by the pipeline from the surface generators. Built and lit at build
  time, deterministic, and shown unlit at run time, as the era's games did.
  The furniture and doors stay lit live by the same lamp. The light is baked by
  Blender, pinned at 4.2 LTS and run only by `npm run bake:light`, and its
  maps are committed with a hash of their inputs; everything after the light
  is composed by the pipeline, byte for byte.
- **The handheld.** The bottom-right device in the reference becomes the
  house's viewmodel, an old battery lantern. That settles backlog item 1
  (9.4.7) in a new form: it is placed against the touch buttons and the
  owner's thumbs from the start, rather than corrected afterwards.

**Proved on one room first.** The entry hall is built and dressed to the
reference before any other room is dressed. If generated wood, plaster and
fabric cannot reach that look, it is found out there, and the phase is
rethought before nine more rooms are built the same way. Phase 3 did the same
by proving the letterforms first.

### 9.4.5 A style engine — art direction as code

**What is wrong now.** The ship's look comes from a style bible: one paragraph
of prose, plus generators that each interpret it in their own way. That
worked for steel, because rivets, panels and wear on edges are close to
geometry. It will not reach the reference: damp that blooms rather than
stains, wood that has grain rather than stripes, plaster that looks
brush-painted, and a frame whose colour is held in one narrow green band. At
the owner's request this phase treats art style as something to build and
measure, not as a sentence to interpret.

**What gets built.**

- **Painterly techniques as shared generator code**, used by every house
  surface and available to the ship:
  - brush-stroke stamping along a flow field, so surfaces look painted rather
    than noised;
  - damp that spreads from edges and corners by diffusion and leaves tide
    lines;
  - wood grain grown from rings and knots and then cut into planks, rather
    than striped noise;
  - flaking paint and wallpaper that tear along seams;
  - patterned textiles woven from a motif and then worn where feet go.
- **The style as numbers, not only prose.** The style bible gains a style
  target: a palette, a value distribution, a colour cast, a saturation and a
  level of fine detail. The generators read those numbers, and the colour
  grade in 9.4.4 is derived from them. Changing the look means changing the
  target.
- **A style harness.** It renders fixed views of the house through the real
  pipeline and scores each frame against the target: luminance percentiles,
  share of pixels in the green cast, mean saturation, fine-detail energy and
  palette size. It is gated within a stated tolerance, so a change to one
  generator that drags the whole house off its look fails CI. Like 3.5's pixel
  floor, it can show a frame is in the right family. Whether it looks right is
  the owner's bar.

**The target, measured from the reference** as statistics only. Nothing in
the image is copied or committed. At 448 × 299:

| | Reference |
|---|---|
| Mean colour (sRGB) | 35, 46, 27 |
| Luminance, 5th / 50th / 95th percentile | 0.006 / 0.015 / 0.159 |
| Share of pixels where green dominates | 96% |
| Mean saturation | 0.45 |
| Fine detail (mean absolute Laplacian, 0–255) | 10.0 |
| Distinct colours at 15-bit | 763 |

The house is held to these within tolerances the build sets on the entry hall
and records here before it dresses another room. Set on 9 October 2026, on
three views of the hall, and held since milestone 4 by every room, thirteen
views in all (`tools/house/style.mjs`):

| | Tolerance | Every view |
|---|---|---|
| Median luminance | ×0.4 to ×3 of the target | in |
| 95th-percentile luminance | ×0.5 to ×2 | in |
| Share where green dominates | ±0.12 | in |
| Mean saturation | ±0.15 | in |
| Fine detail | ×0.5 to ×2 | in |
| Distinct 15-bit colours | ×0.4 to ×2.5 | in |
| Each region's mean luminance, a 4 × 3 grid on the reference view (added with the tuner) | ×0.25 to ×4 | in |
| Each region's mean saturation, the same grid | ±0.2 | in |

The reference view's mean colour is 43, 48, 27 against the reference's
35, 46, 27. A tolerance is not loosened to let a change through. The numbers describe a look.
They are not a picture to match pixel for pixel, and the house's own rooms
will differ from the reference in every detail.

Rejected: an image model to paint the textures (the owner chose code), which
would lift Amendment 1 and end byte-for-byte builds. Sampling or tracing the
reference, which would make the house a copy. A style that lives only in
prose, which is how the ship's worked and why it would not stretch to this.

### 9.4.6 The story

- **The premise, chosen by the owner: the flood and the stopped clocks.** A
  family lived here by the river. On the night it rose, their daughter was
  lost, and her father stopped every clock in the house at that hour. The
  water went down and the damp never did. The house still keeps his hour, and
  the dining-room clock is the puzzle because of it. The notes are mostly his.
  The text is written in the build, and the full text is shown to the owner
  before it is placed in the house.
- **Twelve notes at most,** each short enough to read on a phone without
  scrolling. The rooms themselves carry the rest: what is on the table, which
  bed is made, what is missing from the picture frame.
- **No voice, no cutscene, no narrator.** The player keeps the camera from the
  first frame to the last, as on the ship.

### 9.4.7 The backlog, built alongside

The owner asked for this phase to be creative and for the outstanding work to
run underneath it. It does, in this order and without its own phase:

1. **The 195 ms hitch** that phase 8's profiler found in the Annex strike. It
   is investigated, fixed if it is a first-use compile, and gated: a check
   that no shader program compiles after the title, run on the ship and then
   on the house. It is built first, because the house's lamps are just as
   likely to hit the same thing.
2. **The scanner on a portrait phone.** It is settled against the owner's
   thumbs (phase 7's traces) and the touch buttons, with a check that the
   viewmodel never sits under a button. This lands on the ship, and the
   house's lantern is built to the same rule.
3. **The owner's open bars from phase 8:** the dust as cut back, the pad, and
   the home screen in airplane mode. These are a short list for the owner's
   next play, and no build is needed.

## 9.5 Scope guardrails

**For the ship: all unchanged.** Every permanent guardrail in this document
still applies to DERELICT exactly as written.

**For the house, lifted narrowly:**

- **Additional levels.** One: the house. It is a separate demo, not a second
  stage of the ship.
- **Narrative.** Lifted for the house: notes and the rooms themselves. Still
  out: voice, cutscenes, a narrator, and dialogue.
- **Views out before the end.** The house's windows show the night outside.
  The ship's rule is unchanged.
- **Inventory.** A key ring of at most four items, with no management. P5's
  single carry slot still governs the ship.
- **The HUD.** The house adds the note reader and the key-ring panels. There is
  still no map, no objective text, no markers and no health.

**Still out for the house as well:** combat, enemies or any visible threat,
saving (it is ten minutes long), settings menus, procedural generation,
physically-based rendering, cutscenes, and jump scares, which 9.4.3 defines.

**Every asset is still generated by code.** Amendment 1 holds for the house
without exception. That holds for the reference image too: nothing in it is
traced, sampled or imported.

## 9.6 Definition of done

| | Verified by |
|---|---|
| **The ship is untouched.** Every ship harness green, every ship trace still replaying exactly, the ship's bundle and budgets unchanged except for the backlog fixes in 9.4.6. | CI |
| **Two storeys hold.** Every floor position on both floors can be walked back from, the stairs are the only way between floors, and the reachable set only grows as doors open. | Claude — the dead-end proof, on two floors |
| **The loop is ordered.** No lock opens before its key, no step works before its predecessor, and the house can be finished. | Claude — the chain harness, on the house's table |
| **No monkey can break it.** The monkey's invariants on the house, with keys in place of cells, and every run finished by the autopilot. | Claude — `tools/monkey.mjs`, house seeds |
| **Nothing moves while you are looking.** Every change the house makes happens with its object outside the view frustum, on every frame of a full run. | Claude — a new check, run through the walkthrough and the monkey |
| **Every note can be reached and read.** Each note is on the critical path or reachable from it, and at the reader's size its type clears the pixel floor on a phone in portrait. | Claude — the chain harness and `tools/legible.mjs` |
| **Every asset is consumed.** Every generated texture, model, sound and the colour grade is observed in use during a full run of the house. | Claude — the consumption gate, on the house |
| **It fits its budgets.** The house's frame against its own stripped frame inside 1.9×, its bytes to title gated at its own measured figure plus 15%, and no shader compiles after the title. | Claude — `tools/framecost.mjs`, `tools/weight.mjs`, and the new compile check |
| **Still generated end to end.** A clean checkout reproduces every house asset byte-for-byte from the committed sources, Blender's light maps among them, and no light map is stale against the house it was baked from. | The existing determinism gate, and the pipeline's staleness check |
| **The house holds its style.** Fixed views of every room score within the stated tolerance of the style target in 9.4.5: value, cast, saturation, detail and palette. | Claude — the style harness, in CI |
| **The entry hall reads as the reference.** From where the player starts: the layout, the damp, the wood, the green and the one lamp, recreated. | **The owner**, at the first milestone |
| **The house is frightening without a monster.** | **The owner** |
| **The story lands.** | **The owner** |
| **About ten minutes, cold.** A first play without knowing the house runs eight to twelve minutes. | **The owner**, with a trace, which the profiler times |
| **It feels good on a phone.** | **The owner** |

## 9.7 The box

One new level, a separate demo of about ten spaces on two floors. At most ten
new surface textures, fourteen new models and twelve new sounds. Three new
asset classes: the colour grade, the night outside, and baked surfaces, one
per wall, floor and ceiling of a dressed room, drawn from those ten surfaces
(added in the build, 9 October 2026). The style engine is
generator code, not an asset, and the style harness is one new instrument. One new movement capability,
stairs, and no new movement verb. One new piece of interface, the note reader,
and one new HUD element, the key ring.

If the house wants an enemy, a voice, a third floor or a second level, that is
a change to this document first.

## 9.8 Build order

In milestones, each its own pull request with a preview for the owner:

0. **The backlog's instruments** (9.4.6): the compile check and the hitch,
   then the viewmodel-under-button check and the scanner fix. These land on
   the ship before the house exists.
1. **Two storeys in greybox.** The second entry point, floors at height,
   stairs, and the two-floor dead-end proof, red before green. The house is
   walkable in grey, and no asset is made yet.
2. **The loop in greybox.** Doors, locks, keys, drawers, the clock and the key
   ring, with placeholder notes. The chain harness and the monkey run on the
   house. It is playable start to finish, grey. **Preview to the owner.**
3. **The entry hall, dressed.** The style engine and its harness, red before
   green against the target in 9.4.5. Then the new surface generators, the
   props the hall needs, the green grade, the lamp and the night through the
   front door, in one room only. **The owner signs the look here, or the phase
   is rethought.**
4. **The rest of the house, dressed.**
5. **The story.** The owner approves the text, then the notes are placed and
   the environmental storytelling is dressed in.
6. **Dread.** The out-of-view changes and their harness, then the sound.
7. **Integration and ship.** The owner plays it cold and records a trace.

## 9.9 What the build asks of the owner

- **Approval of the story's text** before it is placed (the premise is
  settled: the flood and the stopped clocks).
- **A look at milestone 2** (is the house the right shape?) and **milestone 3**
  (is the entry hall the right look?).
- **A cold play at the end,** with `?trace`, to time the ten minutes.
- **Phase 8's open bars,** whenever convenient: the dust, the pad and the home
  screen.

## 9.10 Settled in the interview, 8 October 2026

- **A separate demo in the same repo.** Rejected: a second level after the
  ship, which would bend an ending the owner has already signed. Also
  rejected: replacing the ship, which would throw away eight phases.
- **First-person.** Rejected: Resident Evil's fixed camera angles, which need
  a player model, new controls and new framing tests, and would leave behind
  the input layer, the traces and the viewmodel. The Resident Evil feel comes
  from the house: locks, keys, backtracking and dread.
- **No combat; pure dread.** Rejected: a stalker to avoid, and Resident
  Evil-style combat, which would lift the oldest permanent rule in this
  document.
- **Art style as an engine, still all code.** Asked after the first draft:
  should this phase explore real art styles? The owner chose to build them
  into the generators and measure them. Rejected: an image model, and a
  comparison of the two on the same room, which would double milestone 3.
- **The flood and the stopped clocks,** as one premise. Chosen from three
  drafted in the pull request, combining the first two.
- **Notes plus the rooms themselves.** Rejected: rooms only, which is subtler
  and harder to make land on a first try. Also rejected: notes plus voice,
  which would be the hardest thing the pipeline had ever made, for the least
  certain gain.

---

# Phase 8 — v1.7

**Status: SHIPPED.** Proposed 8 October 2026 in PR #28 and approved by the
owner the same day; built the same day in PR #29, and shipped when the owner
had both merged that evening. Every bar Claude can verify was green at merge.
Of the owner's bars, two are signed: the ship still looks like itself, and the
owner's run on the new build is committed and replays. Three stay open and
carry forward unsigned: the dust after it was cut back, the pad (not yet
tried), and the home screen in airplane mode (not yet tried). A next phase
must not treat any of the three as reviewed. The scanner's placement on a
portrait phone, which the owner raised on the same play, is open too (see
below). On the same terms as
everything below: nothing here is a suggestion, and if we change something
during the build we change this document first.

**What the build changed in this section, and why.**

*The instruments found two real bugs, and neither was new.* The colour harness
photographed a corridor's conduit and found nothing there. Six of the twelve
runs, in both corridors and the Service Passage, had been 12 cm inside their
walls since the greybox. A wall is centred on its line, so a 2.6 m corridor's
faces are at ±1.1 m, and the runs were placed at ±1.22. Nobody had ever seen
them, including the corridor fill phase 6 built. They are in front of the wall
now, and the harness photographs every run. Building the second visit turned
up the other: `vercel.json` served the whole of `/assets` immutable for a year,
including generated assets and `manifest.json`, whose names never change. A
returning visitor could keep a texture, or a whole manifest, from a build that
no longer existed. The bundle moved to `/bundle` and is the only thing served
immutable, and the weight harness checks that every immutable file is named by
its content.

*The monkey found no bug in the game.* Twelve seeds on four devices, with a
burst each under the slab, mid-strike, carrying and walking out, broke no
invariant, and every run was played out. It found two bugs in itself first. Its
synthetic touches ended on whatever element they had wandered over, which a
real phone never does. And headless Chromium grants a real pointer lock whose
change events land on the wall clock, so a replay once lost its lock on a pause
the recording had kept, and could not turn. Replay now switches the real lock
off before a desktop run starts. To show the invariants can fail at all, the
harness breaks the game seven ways and requires each to be caught. The draft's
mid-run viewport resize was dropped (see 8.3.3).

*The colours, measured.* Every pair now clears 3:1 at its worst. Deuteranopia
is the worst case for each: switch indicator 3.60, cradle lamp 3.59, conduit
3.45, lamp lens 3.70, airlock count 3.33. Room light is 7.32 as a plain ratio
(see 8.3.1), and the airlock pip is 10.53. The changes are small. Dead is a
darker red and live a brighter green. The live conduit is driven past its
texture, because the strip's own texture darkens whatever colour it carries.
The emergency lens is darker than the light it throws.

*The phone, read.* Both owner traces report 17 ms at the median and 18 ms at
the 95th percentile in every compartment, with one frame over 33 ms in each
run, in the Bay. They are format 1, so the slow end is a floor (8.3.2).

*The owner's first play, and what changed for it.* The owner played the
build on 8 October 2026 and recorded it, committed as
`tools/traces/owner-2026-10-08-v2-phase8.json`. It replays exactly at all 256
checkpoints. The verdict: the ship still looks like itself, but the dust was
overdone and its particles too big. The scanner stayed red on the walk out to
the planet. And the light bars on the walls clipped and did not connect.
All three were right, and all three are fixed:

- *Dust.* The first motes were 2 cm, about four pixels across on the owner's
  phone, which read as squares. There were 36 of them per shaft at 0.55. They
  are now 7 mm, 20 per shaft, at 0.35.
- *The scanner off the ship.* Its tint came from the compartment underfoot,
  and on the threshold there is none, so it fell back to emergency red. This
  predates phase 8. Off the ship it now takes the powered tint, the light of
  the chamber behind and the sun ahead.
- *The conduits.* Bringing the buried runs out of their walls exposed how they
  had been placed. They sat at four heights (1.95, 2.15, 2.55 and 2.7 m), two
  cut through corridor labels, one crossed the airlock opening, one ran
  through the debris in Corridor B, and they ended mid-wall at corners. The
  table was rebuilt from the walls, door trims and wall-mounted things: one
  height of 2.2 m everywhere, broken only by a door frame, a label or a
  fixture, and meeting at every room corner. `tools/colour.mjs` now fails any
  run that is off that height or passes through any of those. Run against the
  old table it failed on the heights, the airlock opening and the debris.

The owner also said the scanner's motion and placement felt off. The viewmodel
code has not changed since phase 6. Phase 7 moved the touch buttons into the
bottom-right corner, which is where the scanner sits on a portrait phone, so
the two now overlap. That is the likely cause. It is put to the owner rather
than changed by guesswork.

The same trace is the first with raw frame intervals from real hardware, and it
shows the first real hitch the project has measured: one 195 ms frame in the
Annex during its power strike. That is otherwise 17 ms at the median and 18 ms
at the 95th percentile everywhere. It is reported here and not chased in this
phase.

*The rest, as built.* Dust, at its first size, cost 1.07× on its own, and the whole frame is
1.37× against the 1.9× budget. The game asks the browser to check for a new
worker on every visit. Left to itself, a browser may wait a day, and the
visit after a deploy has to fetch the new list. A pad's Start resumes as well
as pausing, since a pad has no Escape and no pointer for the Resume button.
Starting a run still takes a click or a tap, because browsers do not let a pad
button unlock audio. The controls card gains a pad line once a pad is
reported. The pad's action checks live in the systems smoke test rather than
in a fourth new harness, so the box in 8.7 holds.

The owner chose the shape: wide, per the rhythm 5.2 proposed, with all six of
the features Claude put forward (8.9). It is the widest phase so far. Phase 4
carried four features and phase 6 carried three. That breadth is the test, and
8.2 says what it is testing.

Supersedes part of v1 §2, §4, §7 and §11, and part of 7.3.2. See 8.6.
Everything in v1 and phases 2–7 not named here still stands, including
Amendment 1.

## 8.1 The one-liner

The ship reads without red and green, arrives without the network, answers a
controller, and shows the air in its light, and every one of those comes with
an instrument that would notice if it stopped being true.

## 8.2 What phase 8 demonstrates

**That the instruments can carry six features at once.** Phase 6 went wide with
the gate and the frame budget already watching, and they held: one real bug
found by machine and none by ear. This phase doubles the width. Three of its six
features are themselves instruments. They are built first, so they are watching
while the other three land.

**That the project can test for players who are not its owner.** Every bar
signed so far was judged by one person on one phone. Two of the failures this
phase targets are ones the owner may never meet: a state the owner sees as red
and green that a colour-blind player sees as two olives, and a stuck state that
only a sequence nobody would play reaches. Those can only be caught by a
machine, so each one gets a harness.

**That the owner's phone is a measuring device.** Phase 7 built the trace so the
owner's input could become a test. The same file has carried the owner's real
frame times since the first recording, and nothing has read them. This phase
reads them.

Every tradeoff during the build is settled against those three sentences.

## 8.3 What gets built

Six features. Each is judged on its own, and each can ship without the others.

### 8.3.1 Colour you don't need to see — accessibility

**What is wrong now.** The ship's whole state language is hue: emergency red
for dead and green-white for live, on the room lights, the conduit strips, the
switch indicators and the cradle lamps. Red against green is the pair that
red-green colour blindness merges, and that is about one man in twelve. Measured
from the shipped colours, through the standard simulations of the two common
forms:

| State pair | Luminance ratio | Seen with deuteranopia |
|---|---|---|
| Cradle lamp, clamped / released | 2.10 | olive / tan |
| Switch indicator, off / on | 2.97 | mustard / cream |
| Room light, emergency / powered | 3.29 | ochre / off-white |
| Conduit strip, dead / live | 3.84 | olive / pale yellow |

The cradle lamp is the worst of the four, and it is the one that says whether
the cell can be taken. The jaws parting (4.3.3) already carry that state by
shape, but the lamp is what a player reads from across the room.

**What gets built.**

- **Every state pair separates by brightness, not only by hue.** Under normal
  vision and under simulated protanopia, deuteranopia and tritanopia, the dead
  and live versions of each indicator differ by at least **3:1** in luminance.
  That is the WCAG floor for non-text contrast. The hues stay what they are.
  Red still means dead, and the fix makes dead darker and live brighter rather
  than repainting the ship.
- **Every state pair also has a cue that is not colour.** A dead indicator
  never looks like a live one in a still photograph with the colour taken
  out. The lever's throw, the jaws and the seated shutter already do this.
  Where an indicator has no such cue, it gets one inside the existing language:
  a dead lamp is a lens with nothing behind it, and a live lamp has the lit
  core it already has.
- **Measured on pixels, not on hex codes.** The harness renders each fixture in
  both states at the shipped render scale, through the real lighting, fog and
  palette crunch, and simulates the colour vision on the rendered pixels. A hex
  code says nothing about what a lamp looks like after the fog has had it.
- **A room is compared as a plain ratio.** The WCAG ratio adds 0.05 to both
  sides, which models the glare of a bright screen around a control. A dark
  room's average luminance is below 0.05 whether it is lit or not, so the
  offset would drown the difference, and the only way to pass would be to light
  the ship like an office. A whole room's brightness, dead against live, is
  held to 3:1 without the offset. Every fixture keeps the WCAG form. (Added in
  the build.)

Rejected: a colour-blind mode, which is a settings menu, and the settings-menu
guardrail stands. Repainting the language in blue and orange, which is the
textbook safe pair and would take away the emergency red that the opening
minute is built on. An icon on every indicator, which is HUD placed on props
and which v1 §4 does not allow.

### 8.3.2 Your phone as the profiler — performance

**What is wrong now.** The frame budget (5.3.2) measures relative cost on a
software rasteriser, because CI has no real GPU. That was the right call, and
it means the project has never had a single absolute number from real
hardware. Meanwhile both of the owner's committed traces record the time step
of every frame on the owner's own phone. Read for the first time while drafting
this: 6,588 and 5,903 frames at 440 × 760, 3× pixel density, median 17 ms, 95th
percentile 18 ms, 99th 21–23 ms, and one frame over 33 ms in each run. That is a
steady 60 fps, and it has sat unread in the repository since it was recorded.

**What gets built.**

- **`tools/profile.mjs` reads a trace's frame times** and reports the median,
  95th and 99th percentiles, and the long frames. It reports them for the whole
  run and broken down by where the player was standing and what was happening
  at the time: each compartment, each power strike, the departure. The
  position comes from replaying the trace rather than from the file, because
  replay already reproduces every frame exactly and the file only holds a
  checkpoint every 30.
- **The trace records what it needs to be read honestly.** The game clamps its
  time step at 50 ms, so the recorded step cannot show a frame longer than
  that. The trace format gains the raw interval beside the clamped step, plus
  the renderer string and the render scale, so a report says which GPU it
  measured. That is a format change (8.6), and replay reads both versions.
- **Reported, never gated.** It is a fact about one phone on one day. The
  report runs in CI over every committed owner trace and is printed next to the
  frame budget table, so the relative numbers and the absolute ones sit side by
  side.

Rejected: telemetry sent from players' phones, which needs a server and a
privacy story this project does not have (7.3.2 rejected the same thing).
Gating on the owner's numbers, which would turn a phone's bad day into a red
build.

### 8.3.3 Monkey runs — robustness

**What is wrong now.** The dead-end proof (P6, 4.3.4) is a static argument over
the floor. It is strong, and it is about where the player can stand. Nothing
tests what the player can *do*: interact in the middle of an animation, crouch
under the debris with a cell in hand, pause during a strike, rotate the phone
during the departure. Every harness drives the game the way a careful player
would. Nothing drives it the way a careless one does.

**What gets built.**

- **`tools/monkey.mjs` generates hostile traces.** A seeded generator writes
  traces in the phase 7 format from a grammar of hostile moves: mashing
  interact through animations, holding and releasing crouch under the slab,
  setting a cell down in every reachable place, pausing and resuming mid-strike,
  two thumbs and keys and a pad all at once. Each trace replays through the
  real input layer, exactly as an owner trace does. (The draft also listed
  resizing the viewport mid-run. A trace has no record of the viewport
  changing and replay cannot change it mid-run, so a resize would make a run
  that cannot be replayed. It was dropped in the build.)
- **Invariants checked on every frame.** No exception is thrown. The player
  never stands inside geometry and never falls through the floor. Exactly two
  cells exist at all times, each held, lying on the floor, in a cradle or
  seated. The chain only moves forward. The phase only moves forward.
- **Every monkey run can still be finished.** When the hostile trace ends, an
  autopilot takes over from wherever the run was left. It paths across the
  dead-end grid and must complete the run. This is the moving-player version of
  P6: the floor proof says every place can be walked back from, and this says
  every *state* can be played out from.
- **Seeded, fixed and shrunk.** CI runs a fixed set of seeds, so a red run is
  reproducible rather than flaky. A seed that fails is shrunk to the shortest
  trace that still fails and committed to `tools/traces/` as a regression trace,
  the same way an owner trace is.

Rejected: unseeded random runs in CI, which turn every failure into a
flake. An evolutionary search that hunts for failures, which is the right tool
for a much larger game and much more machinery than this one needs.

### 8.3.4 Gamepad — input

**What is wrong now.** The game takes keys and mouse on a desktop and touch on
a phone. A controller does nothing, on a desktop or on a phone with one paired.

**What gets built.**

- **The standard mapping, and only that.** Left stick moves and right stick
  looks. **A** interacts. **B** held crouches, matching the held crouch on every
  other device (4.3.4). **Start** pauses. Dead zones and look speed live in one
  table beside the touch zones, so the code and the harness read the same
  numbers.
- **The prompt names the device you are holding.** "[E] Interact" becomes
  "[A] Interact" while the pad is the last thing touched. That is a change of
  wording on the existing prompt, not a new HUD element.
- **Traced like every other input.** The Gamepad API is polled rather than
  evented, so the recorder writes the pad's state on each frame it changes. The
  pad is raw input in the 7.3.2 sense: the stick's position as the browser
  reported it, not the move the game made of it.
- **The input layer's version does not go up for this.** Phase 7 bound a trace
  to the input layer that recorded it, so that a deliberate change retires old
  traces from the gate. Adding a device changes nothing about how a recorded
  touch or key is read. The version goes up only when a recorded event would be
  interpreted differently, and the owner's two traces stay where they are.

Rejected: remapping, which is a settings menu. Rumble, which is haptics, and
7.9 already declined haptics on the grounds that iOS Safari cannot do them.
Aim assist, which would make the pad and the mouse play different games.

### 8.3.5 Air in the light — rendering

**What is wrong now.** The light shafts are additive cones (v1 §6). They read as
light from a distance and as plastic up close, because there is nothing in
them. Since phase 6 a lamp strikes, stutters and holds, and its shaft simply
switches on with it.

**What gets built.**

- **Dust in every shaft.** Slow, drifting motes that exist only inside the cone
  and are lit by its lamp. They are square points at the shipped render scale,
  nearest-sampled like everything else, with no texture. There is no new asset.
- **They strike with the lamp.** A mote takes its brightness from its lamp's
  intensity on the same frame, so the stutter in 6.3.3 shows in the dust as well.
  In a dead room the shafts are off, so the dust is invisible.
- **Deterministic.** Each mote's drift is a seeded function of time, not a
  simulation. Replay is unaffected, and no harness has to tolerate noise.
- **Weighed.** Dust gets its own row in the frame budget, and the whole frame
  stays inside 1.9× (6.4).

Rejected: a volumetric fog shader, which is real, expensive and modern, and is
the wrong century for the reason 4.4 gives for PBR. Sprites from a generated
texture, which would be a new asset for an effect that reads at four pixels
across.

### 8.3.6 Instant the second time — platform

**What is wrong now.** Every visit pays the full 3.37 MB (7.3.3), because
nothing persists between visits except whatever the browser's HTTP cache
happens to keep. The game cannot be played offline. It cannot be put on a home
screen as anything better than a bookmark.

**What gets built.**

- **A service worker caches the build.** After the first visit, the game, its
  script and every generated asset are served from the device. The precache
  list is the build's own file list, and every entry carries a content hash.
  The pipeline is byte-reproducible, so an unchanged asset keeps its hash and
  is never fetched twice.
- **A new build replaces the old one.** This is the part most likely to go
  wrong. A broken service worker can pin a player to an old build indefinitely.
  The rule is that the next visit after a deploy fetches the new list and
  serves the new build on the visit after that, and that a build can be retired
  by deploying a worker that removes itself.
- **A web app manifest and an icon.** The game can be added to a home screen and
  opens full screen. The icon is generated by the pipeline from the glyph atlas
  and the style bible, like everything else. It is this phase's one new asset
  class.
- **The weight harness gains a second visit.** Bytes on the second load are
  gated at zero from the network, apart from the worker's own update check. A
  load with the network cut must reach the title. A load after a simulated
  deploy must serve the new build.

Rejected: an install prompt or banner, which nags and is UI before the title.
Background sync and push, which need a server. Caching only the assets, which
saves most of the bytes and still leaves offline play broken.

**Unchanged:** the five spaces, the six-step chain, the route, crouch, the HUD
(the prompt changes its wording only), the viewmodel, the signage, the outside,
the machinery, the lighting sequence, the ending, the retro rendering
treatment, the asset budgets, and the touch controls.

## 8.4 Scope guardrails

Still permanently out, unchanged: **combat, enemies, saving, settings menus,
procedural generation, additional levels or rooms**, **narrative** (phase 3),
**physically-based rendering** (phase 4), **cutscenes** (phase 5), and **views
out before the end** (phase 6).

**Three of those, read narrowly.** A service worker is not saving. It caches the
game, never the state of a run, and a reload is a fresh run exactly as it is
today. Monkey runs are not procedural generation. They generate *input* for the
harness and never anything the player sees. The gamepad has no settings. It has
one mapping, and the dead zones are data, not a menu. If any of these ever
becomes the thing it is distinguished from here, that is a change to this
document first.

**Accessibility without a mode.** The colour fix is the only colour scheme
there is. A future phase that wants a toggle needs to lift the settings-menu
guardrail first.

## 8.5 Definition of done

| | Verified by |
|---|---|
| **State reads without hue.** Every dead/live pair separates by at least 3:1 in luminance on rendered pixels, under normal vision and simulated protanopia, deuteranopia and tritanopia, and has a cue that survives the colour being removed. | Claude — `tools/colour.mjs`, in CI |
| **The ship still looks like itself.** The emergency red still reads as emergency, and powering a room still reads as the room coming up. | **The owner** |
| **The owner's phone is a profiler.** Every committed owner trace gets a frame-time report by compartment and by event, in CI, next to the frame budget. | Claude — `tools/profile.mjs`, reported and not gated |
| **No monkey can break it.** A fixed set of seeded hostile traces holds every invariant on every frame, and each is then finished by the autopilot. Any failure found during the build is committed as a regression trace. | Claude — `tools/monkey.mjs`, in CI |
| **The pad plays the game.** Every action reachable from a pad, the prompt naming it, and a pad run recorded and replayed exactly. | Claude — a synthetic pad in the harness, and a pad round trip in `tools/replay.mjs` |
| **The pad feels right.** | **The owner**, with a controller. If there is no controller to hand, this bar stays unsigned and the phase ships without it, as 7.8 allowed |
| **Dust is in the light and inside the budget.** Motes drawn only inside lit shafts, brightness following the lamp, and their own row in the frame budget with the whole frame inside 1.9×. | Claude — the consumption gate and `tools/framecost.mjs` |
| **The dust reads as air.** Not snow, not noise, not a screensaver. | **The owner** |
| **The second visit is free, and offline works.** Zero network bytes to title on a second load, the title reached with the network cut, and a new deploy served after it lands. | Claude — `tools/weight.mjs`, extended |
| **It opens from the home screen, offline.** | **The owner**, on their phone, in airplane mode |
| **Still generated end to end.** The icon comes from the pipeline, and a clean checkout reproduces it byte-for-byte. | The existing determinism gate |
| **Nothing regresses.** All harnesses green, the owner's traces still replaying exactly, the six-step chain still solvable, the pipeline still byte-reproducible, the deployment still live. | CI |
| **The owner's run on the new build.** One recording on the phase 8 build, committed and replayed, and profiled against the phase 7 run. | **The owner** records it; Claude commits and runs it |

## 8.6 Amendments to earlier sections

- **v1 §2, "instant to load."** The first visit is measured, as 7.6 made it.
  Every visit after it is instant by construction and gated at zero bytes.
- **v1 §4, controls.** Gains a gamepad: left stick move, right stick look, A
  interact, B held crouch, Start pause and resume. The interact prompt names
  the device in use.
- **v1 §7, asset manifest.** Gains one icon, generated from the glyph atlas and
  the style bible.
- **v1 §11, definition of done.** Gains colour-vision contrast as a standing
  bar.
- **7.3.2, the trace.** The format gains the raw frame interval, the renderer
  string, the render scale and pad state. Replay reads both formats. The input
  layer's version goes up only when a recorded event would be read differently,
  not when a device is added.

## 8.7 The box

One new asset class (the icon). One new input device. Three new harnesses
(colour, profile, monkey), one extended (weight). **Zero new sounds, models,
rooms, interactive types or movement verbs.** Dust is drawn with no asset.

If the phase wants a second new asset class or a new sound, change this
document first instead of adding it.

## 8.8 Build order

Instruments first, so that they are watching while the features land.

1. **The profiler.** The cheapest feature, and it needs no production change
   beyond the trace format. It sets the real-phone baseline before dust adds
   any drawing.
2. **Monkey runs.** Red before green, and before anything else changes the
   input layer or the frame loop, so that the gamepad and the service worker
   land under it.
3. **Colour.** The harness first, red against the shipped colours as the table
   in 8.3.1 predicts, then the fix.
4. **Gamepad.** Added to the monkey's grammar as soon as it exists.
5. **Dust.** Weighed by the frame budget.
6. **Instant the second time.** Last, because a service worker changes how
   every harness loads the game. Every harness except the weight check runs
   with the worker blocked, so it keeps measuring the game rather than the
   cache.
7. **Integration and ship.**

**What the build asks of the owner.** One recording on the phase 8 build, as
in phase 7. A try with a controller, if there is one to hand. One launch from
the home screen in airplane mode.

## 8.9 Decisions taken in the draft

Claude proposed six candidates after phase 7 shipped and recommended four of
them: colour, the profiler, monkey runs and dust. The owner took all six.

- **Wide, and wider than before.** Rejected: the four-feature recommendation,
  which left out the gamepad because it needs a controller to sign and left out
  the service worker as a better fit for a narrow phase. The owner chose
  breadth. The cost is stated here instead: one owner bar that may stay
  unsigned, and a service worker built last under every other instrument.
- **Instruments before features.** Three of the six are harnesses, and the
  build order puts them first. That is the phase 6 lesson made into order.
- **Contrast, not a palette.** The fix brightens and darkens the existing hues
  rather than replacing them, because red for dead is the game's opening
  image.
- **Read the traces before adding to them.** The profiler needs no new
  recording to start. The owner's two runs already hold real frame times, which
  is how this draft could state 60 fps rather than guess it.

---

# Phase 7 — v1.6

**Status: SHIPPED.** Proposed 8 October 2026 in PR #24, approved and built
the same day in PR #25, and shipped when both merged that day.

**Signed by the owner, 8 October 2026,** after recording a run on each set of
controls: *"The after feels way better. The before ran into the same bugs."*
Every bar in 7.5 is met. It holds on the same
terms as everything below: nothing here is a suggestion, and if we change
something during the build we change this document first.

**What the build changed in this section, and why.**

*What an old trace can prove.* The draft said the owner would record a run on
the current controls "so the overlap they reported exists as a failing replay
before anything is changed." That cannot work. A trace replays the raw touches
through the input layer it is given. Replayed against the layer it was recorded
on, it reproduces the run exactly, overlap and all, and passes. Replayed against
a layer that has been deliberately changed, it is expected to diverge, and that
divergence is the change working rather than a regression. So every trace now
carries the version of the input layer that recorded it, and replay asserts only
against that version. The owner's trace on the current controls is evidence: it
records where the thumbs actually land. 7.3.1's zones and button placement are
settled against it, and the harness reports how many of its touches the new
layer would assign differently. The regression test is a second trace, recorded
by the owner after the fix. 7.5 and 7.8 say so.

*What the instruments found while being built.* The round trip failed on its
first run. Record and replay ended in exactly the same place but disagreed at
the one checkpoint in between: the recorder was writing each checkpoint at the
top of a frame and labelling it one frame late. The fix is in the recorder. The
round trips now cover two thumbs on a portrait phone (242 frames, 206 events)
and keys plus mouse on a desktop, and both agree exactly at every checkpoint.
The new touch checks reproduced the owner's report on the old layer before the
fix: a second thumb landing left of centre while moving was dropped.

*The weight, measured.* 3.37 MB to the title, decoded. Models are 32%,
textures 23%, script 19%, sounds 15% and responses 10%. On a pinned 10 Mbit/s,
40 ms connection the title takes 2.6 s, nearly all of it transfer. The sky and
the end sting are 2.6% of the bytes, about 0.07 s, so the deferral 7.3.3
allowed is not earned and nothing changes. The budget is 3.87 MB, the
measurement plus 15%.

*The owner's run.* Recorded on the new controls on 8 October 2026 and
committed as `tools/traces/owner-2026-10-08-v2.json`. It is a complete run on
a 440 × 760 portrait phone: 110 s of game time, 6,588 frames, about 4,000
touch events, both cells seated, and it ends on the threshold. Replay agrees at
all 219 checkpoints and ends 0.000 m from where the player stood, so the 7.5
bar "the owner's run replays in CI" is met. What it shows about real thumbs:
73 look touches, 65 of them started while the stick was held, and every one of
them landed in the lower half of the screen. That is the region the old button
column crowded, which is the case for tucking the buttons into the corner. None
started left of centre, so this run did not exercise the reach-across case.

*The owner's before-run, measured.* Recorded on the old controls the same day
and committed as `tools/traces/owner-2026-10-08-v1-before.json`: 98 s, both
cells, ending on the threshold. Built from the v1 branch, it replays exactly at
all 196 checkpoints, so the recording holds the bug as the owner met it. Run
through the zone table, its 64 touch-downs on the view show what changed. Version
1 gave 15 stick, 45 look and 4 dropped. The zone table gives 13 stick, 51 look
and none dropped. That is six touches assigned differently: two look touches
version 1 took as movement, and four it threw away. Those six are the owner's
report, counted.

The owner chose the shape: narrow, per the rhythm 5.2 proposed, built around
the one thing phase 6's play turned up, plus a second instrument the owner
asked to add (7.3.3).

Supersedes part of v1 §4, P5 and the v1 §11 definition of done. See 7.6.
Everything in v1 and phases 2–6 not named here still stands, including
Amendment 1.

## 7.1 The one-liner

Your thumbs go where you put them, your own play becomes a test, and the game
knows how heavy it is.

## 7.2 What phase 7 demonstrates

**That a person's report can become a machine's test.** The footstep ring, "a
touch less responsive", the dry footsteps and now the touch overlap were all
found by the owner playing, and none of them could be reproduced here until
after it was fixed. Phase 5 built instruments for the failures Claude can
imagine. This phase builds one for the failures only the owner meets: their own
input, recorded on their own phone, replayed in CI.

**That narrow still pays.** Phase 6 was wide and its instruments held: three
features, one real bug found by machine and none by ear. The owner's one note
was about the controls. A narrow phase is the right size for it.

## 7.3 What gets built

### 7.3.1 Two thumbs — the touch layout

**What is wrong now.** The owner's report after phase 6: *"the movement
controls kinda overlap where I want the look to be on vertical phone so I would
try to look and then it would move instead. Also would like to be able to look
with my right thumb while still moving with my left easier."*

The cause is in `Input.#bindTouch`. Every touch is assigned by which half of the
screen it lands in: left of `innerWidth / 2` is the stick, right of it is look.
On a phone in portrait the right half is about 195 px wide, and the interact and
crouch buttons fill its lower part, exactly where a right thumb rests. So a look
drag either starts above the buttons or lands just left of the midline. If it
lands left of the midline it takes the stick and the player walks. If the stick
is already held, a second touch on the left half is ignored outright. The touch
harness never saw this, because it drives one thumb at a time.

**What gets built.**

- **The stick claims a zone, not a half.** A touch starts the stick only if it
  lands in the lower-left movement zone. In portrait that zone is the lower part
  of the left side. In landscape it is the left third. Every other touch that is
  not on a button is look.
- **A second touch is always look.** While the stick is held, any further touch
  that is not on a button becomes the look touch, wherever it lands. The thumb
  that is already moving keeps moving.
- **The buttons stop crowding the look area.** Interact and crouch move so the
  right thumb has open screen where it naturally rests. The exact placement is
  settled against the owner's trace (7.3.2), not by guessing.
- **The zones are data.** They live in one table, the way `layout.js` holds the
  level, so the harness and the code read the same numbers.

Rejected: a draggable or configurable layout, which is a settings menu by
another name. A visible look pad, which spends screen on a control the right
thumb finds anyway. Gyro aiming, which is a new input verb and needs a
permission prompt on iOS.

### 7.3.2 The trace — your play, bottled

**What is wrong now.** Every report that has mattered in this project was a
feeling about a run that only the owner played. By the time a harness could
reproduce it, the fix was already written against a guess.

**What gets built.**

- **`?trace` records a run.** Opening the game with that URL flag records every
  raw input event (touches, keys, mouse deltas) and the frame clock, against the
  viewport size. It records raw touches, not the move and look values derived
  from them, so a bug in how touches are assigned is inside the recording. The
  end card offers a download. Nothing is sent anywhere, and without the flag
  nothing is recorded.
- **`tools/replay.mjs` plays a trace back.** It boots the built game at the
  recorded viewport, feeds each frame its recorded time step, and dispatches the
  recorded events through the real input layer. It then asserts the run ends
  where it ended for the player: the same phase, the same cells seated, and the
  player within tolerance of where they stood.
- **Traces are committed and run in CI.** `tools/traces/` holds them. One is
  generated by the harness itself, as a round-trip check that record and replay
  agree. One or more come from the owner's phone.
- **A trace is bound to the input layer that recorded it.** Each one carries
  that layer's version. Replay asserts only against the same version. When the
  layer changes on purpose, older traces are retired from the gate and kept as
  evidence, with the harness reporting what the new layer does differently with
  them.

**The cost, stated plainly.** Replay is only as good as the game is
deterministic. Movement, collision and the chain are driven by the time step
and input, and the time step is recorded. The randomness in the game today
(spark timing, footstep variants) touches nothing a replay asserts on. Making
the frame loop accept an injected time step is the one production change, and
it is the part most likely to be subtly wrong. That is why it is built first.

Rejected: recording the derived move and look values. That is cheaper, and it
would have replayed the touch bug as correct input. Uploading traces
automatically, which needs a server and a privacy story this project does not
have. A video capture, which a harness cannot assert against.

### 7.3.3 The weight — what it costs to arrive

**What is wrong now.** The build ships about 2.4 MB of generated assets and
0.65 MB of script (170 kB gzipped), and the asset total has grown in every
phase: 1.8 MB in v1, 2.15 MB after phase 4, 2.39 MB after phase 6. Nothing
measures it and nothing would notice if a phase doubled it. Everything loads
before the title appears, so every byte is paid for before the first frame.

**What gets built.**

- **A payload budget, in bytes.** `tools/weight.mjs` boots the built game and
  counts every byte transferred before the title is shown, by kind: script,
  textures, sky, models, sounds, responses. It fails over budget. Bytes are a
  fact about the game, not about the runner, so they gate the way the frame
  ratio does. The budget is set at the build's measured figure plus a stated
  headroom. A phase that wants more changes this document first.
- **Time to title, under a pinned network.** It is measured with a throttled
  connection profile fixed in the harness, reported in CI, and not gated. The
  transfer part depends on the throttle and the decode part depends on the
  runner's CPU. 5.3.2's reasoning holds: a number that is partly a fact about the
  runner is a report, not a budget.
- **One honest optimisation, if the measurement earns it.** If the breakdown
  shows that assets nobody needs until the end (the sky and the end sting) are a
  real share of time to title, they load after the title instead. If it does
  not, nothing changes and the report says so.

Rejected: a frames-to-interactive or Lighthouse score, which is a different
runner's opinion of a different page. A CDN or compression change on Vercel,
which is deployment rather than the game, and whose PNG and MP3 payload is
already compressed.

**Unchanged:** the five spaces, the six-step chain, the route, crouch, the HUD,
the viewmodel, the signage, the outside, the machinery, the lighting, the
ending, the retro rendering treatment, and the asset budgets.

## 7.4 Scope guardrails

Still permanently out, unchanged: **combat, enemies, saving, settings menus,
procedural generation, additional levels or rooms**, **narrative** (phase 3),
**physically-based rendering** (phase 4), **cutscenes** (phase 5), and **views
out before the end** (phase 6).

**Two of those, read narrowly, for 7.3.2.** `?trace` is not a settings menu. It
has no UI before the end card, is not discoverable in play, and changes nothing
about how the game behaves. A trace is not saving. It cannot be loaded back into
the game to resume a run. It exists only to be replayed by the harness. If
either ever becomes the thing it is distinguished from here, that is a change to
this document first.

**Zero new asset classes, sounds, models, rooms, interactive types or movement
verbs.**

## 7.5 Definition of done

| | Verified by |
|---|---|
| **Move and look at once, in portrait.** The left thumb holds the stick while the right thumb turns the camera, including a right thumb that starts left of centre. | Claude — the touch harness, extended to two simultaneous thumbs on a portrait phone |
| **A look touch is never taken as movement.** No touch outside the movement zone starts the stick, and a second touch is never ignored. | Claude — a sweep of touch-down points across the screen against the zone table |
| **Record and replay agree.** A run the harness records itself replays to the same phase, cells and position. | Claude — `tools/replay.mjs`, round trip |
| **The owner's run replays in CI.** At least one trace from the owner's phone, recorded on the new controls, is committed and green. | **The owner** records it; Claude commits and runs it |
| **The fix is measured against real thumbs.** The owner's trace on the old controls is replayed through the new zone table, and the touches it assigns differently are reported. | Claude — `tools/replay.mjs`, against the retired trace |
| **The weight is a number, and inside its budget.** Bytes to title by kind, gated; time to title reported. | Claude — `tools/weight.mjs`, in CI |
| **Nothing regresses.** All harnesses green, the six-step chain still solvable, the pipeline still byte-reproducible, the deployment still live. | CI |
| **The controls feel right on a phone.** Looking goes where the right thumb is, and moving does not happen by accident. | **The owner** |

## 7.6 Amendments to earlier sections

- **v1 §4, controls (mobile).** "Left virtual joystick = move, right side drag =
  look" becomes: a stick that starts only in the lower-left movement zone, and
  look from any other touch, including a second touch while moving.
- **P5 and the saving guardrail.** Read narrowly, as 7.4 states: a replay trace
  is not a save.
- **v1 §11, definition of done.** Gains a byte budget. "Instant to load" in v1
  §2 becomes a measured claim rather than an adjective.

## 7.7 The box

Zero new assets of any kind. One production change to the frame loop (an
injectable time step), one to the input layer (zones), and one URL flag. Two new
harnesses.

## 7.8 Build order

1. **The trace.** The injectable time step, the recorder, the replayer, and the
   self-recorded round trip, red before green. Once it ships to the preview, the
   owner records a run on the current controls. That run is the evidence of
   where their thumbs land, and the fix is settled against it.
2. **The weight.** Measured before the touch changes, so the controls work lands
   inside a known budget.
3. **Two thumbs.** The zone table, the reassignment rules, button placement, and
   the two-thumb harness, checked against the owner's trace. The input layer's
   version goes up, and the owner records a second run on the new controls as
   the regression trace.
4. **Integration and ship.**

**What the build asks of the owner.** Two recordings. Open the preview with
`?trace` on a phone, play, and download the file from the end card: once on the
current controls (evidence), and once after the fix (the regression trace). If
that is not convenient, the build goes ahead on the harness's own two-thumb
recordings, and the owner's traces are added when they arrive. The bars in 7.5
that need them stay unsigned until then.

## 7.9 Decisions taken in the draft

- **Narrow, with two instruments and one fix.** The owner chose this, from three
  options, and asked for 7.3.3 alongside. Rejected: going wide and folding the
  controls in, which would have broken the rhythm the moment it got its first
  real test.
- **Raw input over derived input.** The whole value of the trace is that it
  captures the layer that was wrong. A recording of move and look values would
  have replayed the bug as a correct run.
- **Bytes gate, time reports.** The same split as the frame budget: what is a
  fact about the game is a budget, and what is partly a fact about the runner is
  a report.
- **No haptics.** Proposed in passing and not taken up. It would need knowing
  the owner's phone, and vibration is not supported on iOS Safari.

---

# Phase 6 — v1.5

**Status: SHIPPED.** Proposed 8 October 2026 in PR #22 and approved by the
owner the same day; built the same day in PR #23, and shipped when both merged
that day.

**Signed by the owner after playing the build, 8 October 2026:** *"Feels great.
Everything worked."* That signs the outside, the machinery and power arriving.
The phone bar is signed with one finding. In portrait, the movement stick takes
touches meant for looking, and moving and looking at once is awkward. The owner
asked for that to go into the next phase rather than hold this one, and it is
7.3.1. It holds on the same terms as everything below: nothing
here is a suggestion, and if we change something during the build we change
this document first.

**What the build changed in this section, and why.**

*The scanner readout is cut.* 6.3.4 put two lines of glyph-atlas text on the
scanner's existing readout plane, and said that if two lines could not clear the
cap-height floor the name would keep the line alone. Measured before a glyph was
placed, the plane covers about 28 × 10 backbuffer pixels on desktop and 20 × 9 on
a phone in portrait. A name like STORAGE HOLD would get about two pixels per
letter, a third of the 6 px floor the placards are held to, so even the
fallback could not be legible. Enlarging the screen would at best be marginal on
a phone. Raising the tool to the eye would add motion to a viewmodel the owner
has already signed for feel. The owner chose the cut. 6.3.4 stays below, struck,
so the reasoning is not lost. The readout keeps the colour it has always shown.

*A crack in the outer door.* The interior check in 6.5 failed on its first run,
with stars showing through 0.03% of one view from the airlock chamber. The outer
leaf was 2.36 m wide in a 2.40 m opening, which left a 2 cm gap down each jamb.
That gap had been there since phase 5. Nobody saw it because what showed through
was the near-black clear colour. The leaf now runs 2 cm into each jamb.

*Where the instruments landed.* The consumption gate checks the sky three ways:
it is bound, it is visible on the way out, and it is invisible from 280
interior views. It also proves each idle sound is placed at its source, panned
toward it and carried by its own compartment's reverb. The frame budget is now
a table, with one row per drawing feature and the gate applied to the whole
frame. On this build relief costs about 1.22×, the sky about 1.10× at the two
stations that can see it, and the whole frame about 1.46× a fully stripped
one. That is inside the 1.9× budget. `tools/clock.mjs` was written before any
sound was wired and failed all eight of its checks. Wired, it pairs every one
of more than 300 visible events with a sound within one frame, in both
directions.

This was drafted after the owner signed all three of phase 5's open bars (see
5.5). It is the first phase to start with nothing owed, which is why it can
afford to be wide.

Supersedes part of v1 §3, §5 and §7. See 6.6.
Everything in v1 and phases 2–5 not named here still stands, including
Amendment 1.

## 6.1 The one-liner

The ship keeps going when you stop looking at it. Power arrives in a room
instead of being switched on, the machinery you can see you can also hear, and
outside the door there is finally something outside.

## 6.2 What phase 6 demonstrates

**That the instruments make breadth cheap to judge.** Phase 4 went wide and
produced two bugs that only a person could find. Phase 5 built the gate and the
budget so that the next wide phase would not repeat that. This is the next wide
phase, so it is the test of that claim. Every feature here produces something
the consumption gate must observe or the frame budget must weigh, and a bug of
the kind phase 4 shipped should now fail CI before the owner ever hears it.

**That the rhythm holds.** 5.2 proposed alternating between wide and narrow
phases. The owner chose wide for this one. If phase 7 should be narrow, this
phase must show where.

Every tradeoff during the build is settled against those two sentences.

## 6.3 What gets built

Four features in four domains were drafted. Each is judged on its own, and each
can ship without the others. Three shipped. The fourth, 6.3.4, was cut during
the build (see the status note above).

### 6.3.1 The outside — rendering

**What is wrong now.** The ending is signed: walking out reads as leaving. What
the player walks out *into* is `scene.background`, a flat `0x05070a`, under the
same fog as the inside of the ship. The threshold is a deck plate hanging in
grey-black. Four phases made the inside a place, and nothing has made the
outside one.

**What gets built.**

- **A generated sky, as a pipeline asset.** This is a new asset class, the
  first since the impulse responses. It is a cube map with six faces, drawn by
  a generator from the same style bible. It holds a seeded starfield, the lit
  limb of a nearby body with a banded atmosphere, and one hard point of sun. It
  is crunched and nearest-filtered like every other texture at 256 px per
  face, and it is deterministic and reproducible byte-for-byte.
- **Exempt from fog, and only from fog.** The sky is the one material on the
  ship with `fog: false`. Everything else keeps the v1 §6 treatment.
- **Never visible from inside.** There are no viewports, and the outer door is
  the only opening onto it. The first time a player sees outside is when that
  door cycles, so seeing it *is* the ending rather than scenery added to it.
- **The hull has an outside face.** Turn round on the threshold and you see
  the ship's skin around the door. It is built in engine from the existing
  wall surfaces, as the threshold already is.

Rejected: a viewport in the Bay. It is the obvious place for a window, and it
would spend the ending's one reveal on the opening minute. A procedural sky
computed in a shader is cheaper to ship and would be the first thing on the
ship that the pipeline did not produce. That is the argument that beat canvas
text in phase 3, hand-tuned reverb in phase 4, and hosted services in
Amendment 1. A lit planet that throws light onto the threshold was also
rejected: it would need a new light, and the light count is fixed for the
reason `LIGHTS` gives.

### 6.3.2 Machinery you can hear — audio

**What is wrong now.** Phase 4 gave the ship four pieces of idle life: the
Annex fan, the breathing Hold vent, the failing lamp in Corridor B, and the
sparks at the debris. All four move and none of them makes a sound. The ship
has a convolver per compartment, equal-power panning, and a gate that proves
every sound reaches the master bus, yet the most mechanical things on it are
mute.

**What gets built.**

- **Four generated sounds, one per source.** A slow blade-pass thump with a
  tired bearing under it for the fan. A filtered breath for the vent. A mains
  buzz for the lamp that drops out when the lamp does. Short crackle bursts
  for the sparks. All are DSP in the existing audio generator.
- **Each sound is played by the same clock as its motion.** The vent breathes
  in when the vent opens, the buzz cuts when the lamp gutters, and every
  crackle lands on a visible spark. A sound that runs on its own timer next to
  a motion is worse than silence: it is the plate reverb of mechanism.
- **Positional, and fed to the room.** The sounds go through the existing
  `PannerNode` and the reverb send, so the fan sounds like it is in the Annex
  because the Annex's own response carries it. This is the first time anything
  except footsteps and the surge excites the rooms continuously.
- **They die with the power.** At the departure, when every compartment behind
  the player goes dark, the fan spins down audibly rather than cutting, and the
  others stop where they are.
- **Below the footsteps.** These sounds are found by standing still. They are
  not announced. The rule 4.3.2 set for footsteps applies here as well: a
  difference loud enough to notice on first pass is too loud.

Rejected: a sound for every powered fixture (switches humming, consoles
chirping). That is more, and it is noise. The four sources are the four things
that visibly move. Looped room ambiences per compartment were also rejected,
because room tone already follows the player (4.3.2) and a second bed would
argue with it.

### 6.3.3 Power you can watch arrive — lighting

**What is wrong now.** v1 §3 says a switch makes "the Hold's lighting snap
from red to green-white", and it still snaps. Every lamp in the zone, every
conduit strip and every light shaft changes on the same frame. It is the
largest visual event in the game, and it happens three times. Phase 4's rule
was that state changes should have a visible moving part. That rule reached
the lever and stopped short of the lights the lever controls.

**What gets built.**

- **Lamps strike in sequence**, outward from the switch that powered them. Each
  one gets a short fluorescent stutter before it holds. The order is computed
  from distance along the zone's own lamps in `LIGHTS`, so it stays data-driven
  like everything else in the layout.
- **Conduit strips fill along their run** from the end nearest the source,
  rather than turning green all at once.
- **The surge plays under the sequence**, not before it. The existing
  `power_surge` sound is already the right length to carry it.
- **Animation never gates an interaction.** This is the 4.3.3 rule applied
  again. The zone is powered on the frame the switch is pressed. The cradle
  releases, the chain advances and `spaceAt` answers "powered" before the first
  lamp has struck. The sequence is something the player watches, never
  something they wait for.

Rejected: dynamic shadows from the striking lamps. They are real and
expensive, and every light on the ship is a fixed-count point light for the
reason `LIGHTS` gives. Changing the lamp *count* during a strike was also
rejected. The strike changes intensity and colour only, and never the number
of lights, because changing the count recompiles every material.

### 6.3.4 The scanner reads the room — interface (CUT)

**Cut during the build.** The readout plane is too small to carry legible type
at the shipped render scale. The status note above gives the measurement. The
draft follows unchanged, as the record of what was proposed.

**What is wrong now.** The scanner is in the player's hands for every second
of the run, and the only thing its readout has ever said is a colour. Phase 5
rejected making it *scan* something because that is a mechanic in disguise,
and that call stands. This feature is narrower than scanning.

**What gets built.**

- **The existing readout plane shows two lines in the glyph atlas:** the name
  of the compartment the player is standing in, read from `SPACES` exactly as
  the bulkhead labels are, and its power state. It uses the same colour
  language as everything else: red until the room is live, green after.
- **It reports only where the player is.** It never shows another
  compartment, a direction, the cell count, the next step, or where a cell is.
  The airlock panel shows 0/2 and the scanner must not repeat it, because a
  count you carry everywhere is an objective tracker. The no-hints bar was
  signed without any of this, and phase 3 already settled that labels name
  spaces and never direct traffic. The scanner is held to the same rule.
- **Off the ship it has nothing to name.** On the threshold `spaceAt` returns
  nothing, and the readout goes blank. That is correct for the same reason the
  reverb falls away there.
- **The interaction pulse stays.** The readout still flares on every press, as
  v1 §4 asked.

No new assets: the atlas already carries every letter in every space's name.

Rejected: the readout as a second HUD showing the objective, the count or a
compass. That is a HUD placed on a prop, and v1 §4 allows the crosshair and
the prompt and nothing else. Leaving the scanner as decoration was also
rejected. It is the one object the player looks at the whole time, and it has
said nothing for five phases.

**Unchanged:** the five spaces, the six-step chain, the route, crouch, the
HUD, the signage, the threshold, the ending sequence and its end card, the
retro rendering treatment, and the asset budgets.

## 6.4 Scope guardrails

Still permanently out, unchanged: **combat, enemies, saving, settings menus,
procedural generation, additional levels or rooms**, **narrative** (phase 3),
**physically-based rendering** (phase 4), and **cutscenes** (phase 5).

New for this phase, and permanent: **no views out before the end.** No
viewports, windows or exterior cameras. The outside is reached by walking out.
If a future phase wants a window, it changes this document first.

**Every new cost has a row.** The frame budget from 5.3.2 stays at 1.9×, and
each feature that adds drawing reports its own ratio against the same scene
without it. A feature that does not fit inside the budget does not ship. The
budget is not raised to make room for it.

## 6.5 Definition of done

| | Verified by |
|---|---|
| **The sky is generated, bound and unfogged.** It is in the manifest, observed bound on a drawn mesh during the departure, and not drawn at all from any station inside the hull. | Claude — the consumption gate, plus a check that the sky is out of frame from every interior station |
| **Every idle source is heard, from where it is.** Each of the four new sounds reaches the master bus during a full run, panned toward its source and present on the wet bus of that source's compartment. | Claude — the consumption gate, extended to assert the pan and the compartment |
| **Sound and motion share a clock.** Each idle sound's onsets line up with its source's visible events within one frame. | Claude — a harness that records both and compares the timestamps |
| **Power arrives without gating.** Every zone reads powered, and every downstream step of the chain succeeds, on the frame the switch is pressed and before the first lamp has struck. | Claude — the chain harness, unchanged in what it asserts, now under the strike sequence |
| **Every feature fits the budget.** Each drawing feature reports its own ratio, and the shipped frame is still inside 1.9×. | Claude — the frame-cost harness, gaining rows |
| **Still generated end to end.** The sky and the four sounds come from the pipeline, and a clean checkout reproduces them byte-for-byte. | The existing determinism gate |
| **Nothing regresses.** All harnesses green, the six-step chain still solvable, and the deployment still live. | CI |
| **Outside looks like outside.** The threshold reads as standing on a ship in space, not in front of a backdrop. | **The owner** |
| **The machinery sounds like it is there.** Standing still in the Annex, you hear the fan before you look for it. Nothing sounds like a loop. | **The owner**, on headphones |
| **Power arriving reads as power arriving.** The strike feels like a room coming up, not like a delay. | **The owner** |
| **It still feels good on a phone.** | **The owner** |

The clock bar exists because the failure it catches is silent. A sound running
on its own timer beside a motion passes every other check in this table: it is
generated, consumed, panned and in the right room. Only comparing timestamps
finds it, and once the owner hears it, it is already in the build.

## 6.6 Amendments to earlier sections

- **v1 §3, the player experience.** The lighting no longer *snaps*; it strikes.
  The ending also gains something to walk out into.
- **v1 §5, level.** The hull gains an exterior face around the outer door. It
  is still not a room, and `SPACES` does not change.
- **v1 §7, asset manifest.** Gains one sky: six faces at 256 px. Audio grows
  from thirteen sounds to seventeen.

## 6.7 The box

One new asset class, four new sounds, **zero new models, zero new rooms,
zero new interactive types, zero new movement verbs**.

If the phase needs a second new asset class or a fifth sound, change this
document first instead of adding it.

## 6.8 Build order

Ordered so the riskiest thing is proved first, and so each feature can ship
alone if the cycle runs long.

1. **The outside.** It is the only new asset class, and the one thing that can
   fail before it reaches the screen. A 256 px cube face under the palette
   crunch may band into stripes rather than read as sky. If it cannot be made
   to read, that is found out here, the same way phase 3 proved the
   letterforms before placing a label.
2. **Power arriving.** It touches the lighting that every other harness
   photographs, so it should land while there is still time to re-baseline
   them.
3. **Machinery you can hear**, with the clock harness built before the sounds
   are wired, red before green.
4. ~~**The scanner readout.**~~ Cut after measuring the plane (see status).
5. **Integration and ship.**

## 6.9 Decisions taken in the draft

The owner chose a wide phase and signed phase 5's three open bars before this
draft was written. The four features were chosen by Claude and are put up for
ratification as phase 4's were: propose, then argue in the pull request.

- **Four domains: rendering, audio, lighting, interface.** Rejected: viewmodel
  weight, because the scanner already has sway, bob and a press kick. Haptics
  were also rejected, because they cannot be reviewed on iOS Safari and the
  owner's phone is not known to be Android.
- **Each feature fills in something earlier phases already built.** Phase 4
  built the idle life and left it silent. Phase 5 built the threshold and left
  it facing a flat colour. v1 built the scanner readout and left it saying one
  colour. Phase 4's mechanism rule never reached the lights. This phase adds
  almost no new kinds of thing. It completes four that exist.
- **The scanner readout is the call most worth rejecting.** It is the closest
  thing in this phase to a hint, and it changes something the owner has
  already signed as solvable cold. If it reads as a HUD on a prop, cut it.
  The other three still form a phase. *It was cut during the build, for size
  rather than for hinting: see the status note.*
- **No viewport.** A permanent guardrail rather than a decision for this
  phase only. It keeps the outside as the ending's single reveal.

---

# Phase 5 — v1.4

**Status: SHIPPED.** Spec ratified 2 August 2026 by merging PR #20; built and
shipped the same day in PR #21. All three of its owner bars were signed on
8 October 2026. On the same terms as v1 and phases 2, 3 and 4: nothing
here is a suggestion, and if we change something during the build we change this
document first.

Proposed rather than interviewed, as phase 4 was — see 5.8. Merging ratified it;
the pull request was where it got argued.

**What the build changed in this section, and why.**

*The threshold.* 5.3.1 asked that walking out read as leaving rather than as a
screen wipe, and building it turned up something the draft had not settled:
there was nowhere to walk *to*. Beyond the outer door was the hull and then
nothing, so the ending was a player walking up to a bright doorway and stopping.
The level therefore gains a short run of deck outside the door, with a kerb
round its open edges — see 5.6. It is not a room and the guardrail against new
rooms stands: no ceiling, no lighting zone, no label, no props, no interactives,
not in `SPACES`, and nothing to do there. The dead-end proof does not count it
as floor and `spaceAt` returns nothing on it, which is why the reverb correctly
falls away as you step out of the hull.

*Two silent audio defects, both found by this phase's own instruments.* The
compartment crossfade could be left stranded part-way: the wet level stopped at
whatever value the fade was passing through and stayed there, so a compartment
convolved permanently quieter than the room it was modelling. It happens when a
second crossfade starts while the first is still in flight, which is what a
doorway is. `tools/consume.mjs` caught it holding the Hold at 0.602. Separately,
the ambient bed's scheduler died outright after a long main-thread stall — a
voice scheduled in the past throws, and the throw escaped before the timer that
keeps the bed alive was re-armed, so the ship's hum never came back for the rest
of the run. `tools/framecost.mjs` surfaced that one by being the first thing in
this project to stall the main thread hard on purpose. Both are exactly the
class 5.3.3 was built for: generated, decoded, playing, and then silently gone.

*What the consumption gate does not assert.* It reports each compartment's
crossfade level and does not gate on it. That number is read from
`AudioParam.value`, and the getter goes stale under automation on a loaded main
thread — one compartment reported 0.797 in one run and 1.000 in the next while
its measured wet output differed by under 2%. The gate asserts on the signal
instead, which is what the done-bar actually claims.

Supersedes part of v1 §3 and §11 — see 5.5. Everything in v1 and phases 2, 3
and 4 not named here still stands, including Amendment 1.

## 5.1 The one-liner

The last thirty seconds stop being a fade to black, and the two things phase 4
could not measure about itself become measurable.

## 5.2 What phase 5 demonstrates

**That a wide cycle can be followed by a narrow one.** Phase 4 carried four
features across four domains and proved breadth is affordable on this
foundation. It also left two specific debts and never touched the last thing a
player sees. This phase is deliberately the other shape: one feature the owner
reviews by playing, and two pieces of instrumentation that make the *next* wide
cycle cheaper to judge.

The rhythm is the point. Alternating breadth and consolidation is a proposal
about how this project runs, not just about what is in this phase — and it is
the first thing to reject if the answer is "keep going wide".

## 5.3 What gets built

### 5.3.1 The ending — the last thirty seconds

**What is wrong now.** v1 §3 ends the game like this: walk into the airlock,
fade to black, the words "You escaped.", a restart button. Four phases have
gone into the ninety seconds before that moment and none into the moment
itself. It is the weakest passage in the game and it is the one every player
finishes on.

Phase 4's §4.9 rejected a richer ending on the grounds that the owner could not
review it by playing. That was simply wrong: an ending is the one thing that
can *only* be reviewed by playing, and the reasoning is corrected here rather
than quietly dropped.

**What gets built.** The escape becomes a short sequence rather than a cut:

- **The outer door cycles for real.** The airlock already has moving geometry
  and a motor sound; the outer door does not. It opens onto the chamber's flood
  of light with the same machinery the inner one uses.
- **The ship falls away.** Not a cutscene and not a camera the player does not
  own — the fade takes long enough, and the light behind them changes enough,
  that walking out reads as leaving something rather than as a screen wipe.
- **The end card earns its line.** It reports the run in the ship's own
  language rather than the interface's: the compartments powered, the cells
  seated, the clock. The words "You escaped." stay.

**The rule this follows:** no cutscene, and the player keeps the camera
throughout. The moment they stop being the one moving is the moment it stops
being this game.

Rejected: a scripted camera pull-back, which is the obvious way to do this and
takes the one thing the whole game has been about away at the last second. A
score sting under it — the end sting already exists and a second piece of music
would be the first music in the game arriving in its final ten seconds.

### 5.3.2 The frame budget — an instrument, not an opinion

**What is wrong now.** Phase 4 added relief and convolution, the owner reported
the game felt "a touch less responsive", and the build could not say by how
much. The software rasteriser in CI cannot separate Phong-plus-a-normal-map
from Lambert — a targeted probe returned four variants within noise and out of
order — and the frame-time watchdog bottoms out at its floor there regardless.
Neither instrument says anything.

That is tolerable once. It is not tolerable as a standing condition, because
every phase from here adds cost and there is no scale to weigh it on.

**What gets built.** A frame-cost harness that measures *relative* cost between
configurations of the same scene, rather than absolute frames per second:
render N fixed frames at a pinned resolution with a pinned camera path, and
report the ratio between the shipped configuration and a stripped one. Ratios
survive a slow host; absolute numbers do not. The output is a table in CI and a
budget the next phase has to fit inside.

Rejected: asserting a frame rate, which is a measurement of the CI box.
Profiling on real hardware, which is not something CI has.

### 5.3.3 The consumption gate — generated is not the same as reaching

**What is wrong now.** Twice this project has shipped an asset that was
generated correctly, listed correctly, wired correctly, and never reached the
thing meant to consume it. The normal maps were the first — caught only because
phase 4 built `relief.mjs` specifically to look. The dry footsteps were the
second: the convolvers ran correctly for a whole phase with almost nothing fed
to them, `acoustics.mjs` proved the responses were right, and nothing proved
they were being used. The owner found it by ear.

`relief.mjs` guards one instance of that failure. Nothing guards the class.

**What gets built.** A harness that plays the game and asserts that every entry
in the manifest is *observed in use* — every texture bound to a material in the
scene, every model instantiated, every sound and every impulse response
actually reaching an audio destination during a full run. An asset the pipeline
produces and the game never touches is a failure, whether it is silent or
invisible.

Rejected: static analysis of the source, which would have passed both of the
bugs it exists to catch — in each case the code referencing the asset was
present and correct.

**Unchanged:** the five spaces, the six-step chain, the route, crouch, the
lighting states, the HUD, the viewmodel, the signage, the retro rendering
treatment, the asset budgets.

## 5.4 Scope guardrails

Still permanently out, unchanged: **combat, enemies, saving, settings menus,
procedural generation, additional levels or rooms**, **narrative** (phase 3),
and **physically-based rendering** (phase 4).

New for this phase, and permanent: **no cutscenes.** The player holds the
camera from the first frame to the last. If a future phase wants to take it
away, it changes this document first.

**Zero new asset classes.** This phase adds no new kind of generated data. If
it wants one, that is a signal that it has become a different phase.

## 5.5 Definition of done

| | Verified by |
|---|---|
| **The ending is a sequence, and the player holds the camera throughout.** | Claude — the walkthrough harness, which already finishes on foot |
| **The ending reads.** It feels like leaving rather than like a screen wipe. | **The owner.** Claude can assert the camera was never taken away and cannot judge whether the moment lands |
| **Frame cost is a number.** CI reports the shipped configuration's cost against a stripped one, as a ratio, stably enough to compare across runs. | Claude — the new harness, run twice and required to agree |
| **Every generated asset is observed in use.** Every manifest entry is bound, instantiated or heard during a full run. | Claude — the new harness, in CI |
| **Nothing regresses.** All harnesses green, the six-step chain still solvable, the deployment still live. | CI |
| **It still feels good on a phone.** | **The owner** |
| **It sounds like an inside.** Carried over from 4.5 unsigned — the first play's report was a bug, and nobody has listened since it was fixed. | **The owner**, on headphones |

**Signed since ship, 8 October 2026.** The owner has played v1.4 and signed
all three: the ending reads as leaving, it feels good on a phone, and it sounds
like an inside. The acoustics bar, open since phase 4, is closed.

**What was signed, at ship.** Every bar marked "Claude" is green in CI. The
frame budget's two passes repeat to within 1% of each other inside a run; the
ratio itself reads 1.24–1.27× on a quiet host and 1.50× on a loaded one, which
is a real effect rather than instrument noise and is why the budget is set at
1.9× rather than against the quiet number. The three bars that belong
to the owner — the ending reading as leaving, the phone, and the acoustics —
are **all unsigned**, and the acoustics one is now unsigned across two phases
rather than one. It should be the first thing listened to, and a phase 6 must
not treat any of the three as reviewed. That the crossfade was stranding
compartments part-way for the whole of phase 4 is a reason to re-listen, not a
reason to assume it is fixed by inspection.

## 5.6 Amendments to earlier sections

- **v1 §3, the player experience.** The ending is a sequence rather than a cut.
  The words "You escaped." and the restart button stay.
- **v1 §5, level.** The chamber's far bulkhead gains the outer door, and beyond
  it a **threshold**: 3.4 m of deck with a kerb round its three open edges. Not
  a compartment and not in `SPACES` — no ceiling, no lighting zone, no label,
  nothing to do — and reachable only in the last ten seconds of a run. It exists
  so that walking out is walking out. The five spaces are unchanged and the bar
  on additional rooms stands.
- **Phase 3 §3.3, signage.** The Airlock's compartment label moves from the far
  bulkhead to the side wall, because the far bulkhead is now a door. Still one
  label, still naming its own space, still the first thing read on the way in.
- **Phase 4 §4.9.** "A richer ending — real, and the owner cannot review it by
  playing" was wrong on its second clause, and 5.3.1 says so.

## 5.7 Build order

1. **The consumption gate** — first, because it is the one thing that would
   have caught two shipped bugs, and because it should be watching while the
   rest of this phase adds assets.
2. **The frame budget**, measured before the ending is built so the ending's
   own cost lands inside a known budget rather than beside one.
3. **The ending.**
4. **Integration and ship.**

## 5.8 Decisions taken in the draft

- **Narrow after wide.** Rejected: a second four-feature cycle. Phase 4 proved
  breadth is affordable and also produced two bugs that only a person could
  find. A cycle that makes those findable by machine is worth more right now
  than four more features would be.
- **The ending over the scanner.** Rejected: making the viewmodel scanner
  actually scan something, which is the other obviously thin thing a player
  touches. It is a mechanic in disguise, and the box has held at zero new
  interactive types for two phases.
- **Ratios over frame rates.** Rejected: a frames-per-second floor in CI, which
  is a fact about the runner and not about the game.
- **One reviewable feature, honestly counted.** This phase gives the owner less
  to review than phase 4 did. That is the trade, and it is stated here rather
  than discovered at the end of it.

---

# Phase 4 — v1.3

**Status: SHIPPED.** Spec ratified 30 July 2026 by merging PR #16; built and
shipped the same day in PR #17; corrected after the owner's first play in PR
#18. On the same terms as v1, phase 2 and phase 3: nothing here is a
suggestion, and if we change something during the build we change this document
first.

Unlike phases 2 and 3 this section was **not** settled in an interview first —
see 4.9. The reasoning is recorded there and the pull request was where it got
contested. Merging ratified it.

**What the build changed in this section, and why.** 4.3.2 originally described
the grating footstep as "brighter, with a ring". It was built to that
description and the ring was wrong — high-pitched enough to break immersion in
the two corridors the player crosses most. The line was rewritten before the
sound was. 4.3.1 said normal maps were derived "at the same 256 px"; the tiling
surfaces are 256 *and* 512, so it now says "the same size as that surface's own
diffuse" and records why the derivation order matters. Both changes went into
the document ahead of the code, which is the only rule this section has about
itself.

**Of the four done-bars in 4.5 that belong to the owner**, two are signed: the
squeeze and the controls feel right on a phone, and the corridors sound like a
floor again. "It sounds like an inside" is *not* signed — the first play
reported no audible difference between compartments, which turned out to be a
real bug rather than a judgement (footsteps bypassed the reverb send entirely,
so the convolvers had almost nothing to work on). It has not been listened to
again since that was fixed. A phase 5 should not treat the acoustics as
reviewed.

Supersedes part of v1 §4, §5, §6 and §7 — see 4.6. Everything in v1, phase 2 and
phase 3 not named here still stands, including Amendment 1.

## 4.1 The one-liner

The ship stops being a diorama. Its surfaces have depth that answers the lamp
you are standing under, its compartments sound like the sizes they are, its
machinery moves when you touch it, and the squeeze route is a squeeze.

## 4.2 What phase 4 demonstrates

Two things, one technical and one about pace.

**That the pipeline generates more than pictures.** Every asset so far has been
something the player looks at or listens to directly — a texture, a prop, a
sound, a letterform. Phase 4 generates the data a renderer and a mixer
*respond* to: relief that the lighting reads, and impulse responses that the
mixer convolves. Neither is visible on its own. Both change every frame and
every sound in the game.

**That a cycle can carry four features across four domains.** Phases 2 and 3
each proved one thesis and were sized accordingly. That is a good shape for
establishing a foundation and a slow one for building on it. This phase
deliberately runs wider — rendering, audio, animation and movement — without
the level growing by a single room. The wager is that the foundation is now
solid enough that breadth costs less than it did in v1, and there is more to
review at the end of it.

Every tradeoff during the build gets settled against those two sentences.

## 4.3 What gets built

Four features. Each has a domain to itself, each is judged on its own, and each
can ship without the other three.

### 4.3.1 Relief — surfaces that answer the light

**What is wrong now.** `pipeline/lib/raster.js` carries RGB and nothing else.
`rivet()` paints a highlight on one side of the bolt and a shadow on the other,
straight into the diffuse; `bevel()` does the same along an edge. So every
rivet, seam, rib and chip on the ship is lit from a direction that was decided
when the texture was drawn, and it stays lit that way when the only lamp in the
room is behind the player. The relief is a painting of relief, and it argues
with the lighting the same way the airlock readout argued with the colour
language in phase 3.

**What gets built.**

- `Raster` gains a **height channel** beside its RGB. The calls that already
  imply depth — `rivet`, `bevel`, `shadeRect` on a seam, `chip`, the ribs —
  write height as well as shade. Nothing changes about how the surfaces are
  composed or in what order.
- The pipeline derives a **tangent-space normal map** per tiling surface from
  that height field, at the same size as that surface's own diffuse — 256 or
  512 px, per v1 §7 — and writes it into the same manifest entry as a second
  map. Derived at the final size from a downsampled height field, not derived
  large and resized: averaging encoded normals denormalises them and flattens
  exactly the detail the map exists to carry.
- Tiling surfaces move from `MeshLambertMaterial` to `MeshPhongMaterial` with a
  low shininess and a dark specular — enough that a bolt catches a glint as you
  walk past it, and no more.
- **Nearest filtering stays on the normal map.** A nearest-sampled normal facets
  the lighting, which is the period-correct outcome and is what every other
  texture on the ship already does.

Six surfaces get relief: both wall panels, the floor plate, the ceiling plate,
the greeble panel and the door trim. The conduit strip is emissive and unlit, so
there is nothing for a normal to do; the glyph atlas is a coverage mask; model
textures are already 256 px across a whole prop and have no detail left to
resolve.

Rejected: deriving bump from the diffuse's own luminance — cheap, and wrong,
because the painted shadows would be read as geometry and the fake lighting
would double. `MeshStandardMaterial` with roughness and metalness — correct for
a modern look, wrong for this one, and it costs real frames at this render
scale. Separate normal-map generators written alongside the existing ones —
duplicates every generator and guarantees the two drift.

### 4.3.2 Acoustic space — an inside that sounds like an inside

**What is wrong now.** `AudioBus.playAt` computes `1 - d/26`, squares it, and
multiplies a gain. That is the whole of the ship's spatial audio. There is no
direction, so a clunk behind you and a clunk in front of you are the same
signal. There is no space, so the 2.4 m Service Passage and the 14 × 18 × 3.8 m
Storage Hold return identical sound. Five compartments, one acoustic.

**What gets built.**

- **A generated impulse response per distinct compartment acoustic.** A new
  asset class, the first since the glyph atlas. Synthesised from data already in
  `layout.js`: each space carries its x and z extents and its ceiling height, so
  the early reflections are the room's real wall distances and the tail's decay
  follows its own volume and surface area under a chosen absorption.
  Deterministic, and reproducible byte-for-byte like everything else.

  Keyed by the parameters that produce it, so identical boxes share one
  response — Corridor A and Corridor B are the same 12 × 2.6 × 2.6 m, and the
  Hold and the Annex are the same 14 × 18 × 3.8 m. Seven compartments, five
  responses. The Sabine estimates from the current tables run 0.54 s in the
  Service Passage to 1.38 s in the Hold, a ratio of 2.6× — which is the margin
  the whole feature is betting on being audible.
- **A convolver in the mixer**, with the listener's current compartment
  selecting the response. Two convolvers crossfading across a threshold rather
  than one switching, because a switch clicks.
- **Direction**, via `PannerNode` on `panningModel: 'equalpower'` — stereo
  placement with no HRTF, which is the right trade for a phone speaker and costs
  almost nothing. This replaces the amplitude hack rather than joining it.
- **Per-surface footsteps.** One new generated set, grating. It plays in the two
  corridors and the Service Passage; the existing deck-plate set stays in the
  rooms and the chamber. `spaceAt` already knows which is underfoot.

  This first read "brighter, with a ring", and the ring was wrong. Built to that
  description it came out high-pitched and broke immersion on the owner's first
  play — a worse sound than the deck plate it replaced, in the corridors the
  player crosses most. The set is a *variation* on the deck plate rather than a
  second instrument: slightly brighter, a little less body under the boot, a
  short loose tick instead of a pitched ring. A footstep is not supposed to be
  noticed, and any per-surface difference big enough to notice is too big.
- **Room tone that follows you** — the bed's level and filtering per zone, so
  the Hold booms and the Passage is close and dry.

**The cost, stated plainly.** A convolver with a short tail is affordable, but
two of them crossfading during a transition is the peak, and this is the one
feature in the phase that can cost frames on a phone. Tail length is the dial,
and short tails are correct for small metal rooms anyway.

Rejected: full occlusion by raycasting the colliders and filtering through walls
— real, but the level is seven convex boxes and doorway falloff already reads.
HRTF panning — costs more and is thrown away on a phone speaker. A reverb
hand-tuned per room in code out of delay taps and a filter — cheaper, and it
would make the acoustics the one thing on the ship the pipeline did not produce,
which is the argument that beat canvas text in phase 3.

### 4.3.3 Mechanism — machinery that moves when you touch it

**What is wrong now.** Flipping a switch plays a clunk and changes the lighting.
The switch itself does not move. A cradle releases its clamp by setting a flag.
A seated cell teleports into its socket. The only moving geometry on the ship is
the airlock and the hatch.

**What gets built**, all of it in engine on existing generated surfaces — the
phase 2 precedent that the socket "is the third interactive type but not a third
model", since `MeshBuilder` emits one flat mesh with no parts to animate:

- **The switch lever throws** through its arc, and the clunk lands at the end of
  the arc rather than on the button press.
- **The cradle clamp retracts** — two jaws that part when the room comes up,
  which is what makes "clamped" legible as the *reason* the cell could not be
  taken.
- **A seated cell travels** into its socket over a short beat and the shutter
  closes behind it. One-way is already the rule; now it looks one-way.
- **Idle life in four places:** a slow extractor fan in the Annex, a vent that
  breathes in the Hold, a failing lamp in Corridor B, and a spark at the
  collapsed debris. Fan and vent are parametric geometry; steam and sparks are
  additive sprites off surfaces the pipeline already produces.

**The rule this follows: animation never gates an interaction.** State changes on
the press; the motion is a consequence you watch, not a wait you serve. That is
the whole difference between feedback and latency, and it is the thing most
likely to be got wrong here.

Rejected: animated channels baked into the GLBs — the model generators would
have to emit rigs and keyframes, which is a large pipeline change to move four
things. Physics — a cell that tumbles is a cell that can come to rest somewhere
the dead-end proof never considered.

### 4.3.4 The body — a squeeze you have to duck through

**What is wrong now.** v1 §5 says Corridor B is "partially blocked by collapsed
debris, forcing a squeeze route." It forces nothing. The gap is 1.05 m wide, the
player is 1.72 m tall, and the route is walked upright at full speed. The word
has been in this document since v1 and has never once been true.

**What gets built.**

- **Crouch**, held rather than toggled: `C` or left `Ctrl` on desktop, a second
  button on the touch layout. Eye 1.62 → 1.05 m, collision height 1.72 →
  1.15 m, speed 3.05 → 1.5 m/s. **Standing back up is refused while something is
  overhead** — that is the only way crouch can strand a player, so it is the
  part to get right.
- **The squeeze becomes real.** `BLOCKERS` gains a floor to its box, and one new
  row hangs collapsed structure from 1.2 m over the existing gap. No new
  collision code: `resolve()` already skips any collider whose `minY` clears the
  player's current height, so a slab at 1.2 m stops a standing player and passes
  a crouched one for free.
- **Stride from distance, not from a phase.** Footsteps fire off `bobPhase`
  today, so cadence is a function of the bob rather than of ground covered.
  Crouched, that is audibly wrong. Step on accumulated distance, with a shorter
  crouched stride.

**What this costs, and it is the largest single cost in the phase.** The
no-unwinnable-states proof in P6 assumed one collision box. With two stances the
walkable set is a union and a stance change is an edge in the graph, so
`tools/deadend.mjs` grows a second grid and the mutual-reachability argument has
to hold across both. This is the most likely thing in phase 4 to be subtly
wrong, which is why it is built first and not last.

Rejected: toggled crouch — a player who forgets they are crouched walks the rest
of the ship at half speed and reads it as the game being broken. Prone, or
leaning — nothing in the level asks for either. Narrowing the gap instead of
lowering it — a horizontal squeeze is invisible until you are stuck in it, and
box-slide collision would make it feel like a bug rather than a route.

**Unchanged:** the five spaces, the six-step chain, the route, the lighting
states, the HUD, the viewmodel, the signage, the retro rendering treatment, the
asset budgets.

## 4.4 Scope guardrails

Lifted from v1 §4, narrowly: **crouch** — one held modifier, and no other
movement verb. No jump, no sprint, no lean, no prone.

Still permanently out, unchanged: **combat, enemies, saving, settings menus,
procedural generation, additional levels or rooms**, and **narrative** (phase 3).

New for this phase, and permanent: **no physically-based rendering.** The
lighting model stays Lambert or Phong. Late-1990s is the art direction and PBR
is the wrong century; if a future phase wants it, it changes this document first.

## 4.5 Definition of done

| | Verified by |
|---|---|
| **Every tiling surface has relief, and it is bound.** A normal map in the manifest for each of the six, and the shading of a bolt demonstrably changes when the light moves. | Claude — a harness that moves a lamp and compares the same pixels. A generated map that is never sampled is exactly the failure that has already shipped twice |
| **Every compartment has the acoustic of its own dimensions.** Each response's decay is within tolerance of the Sabine estimate from the box it was generated from, and compartments of different size differ measurably. Compartments of identical size share one response, which is correct and is asserted rather than assumed. | Claude — a check over the generated responses, run in CI |
| **It sounds like an inside.** The Hold sounds bigger than the Passage; nothing sounds like a plate reverb. | **The owner**, on headphones. Claude can compute a decay time and cannot judge whether reverb sounds right |
| **Every state change has a visible moving part, and none of them gate the press.** | Claude — the chain harness, extended: every interaction still succeeds on the frame it is pressed |
| **The squeeze must be crouched.** The Annex is unreachable standing and reachable crouched. | Claude — the walkthrough harness, on foot |
| **No unwinnable states, across both stances.** | Claude — the dead-end search over the union of both collision boxes, with stance changes as edges, and the reachable set still only growing |
| **Still a short vignette.** A player who knows the route finishes inside five minutes, crouch included. | Claude — the walkthrough reports game-clock duration |
| **Still generated end to end.** Normal maps and impulse responses come from the pipeline, and a clean checkout reproduces them byte-for-byte. | The existing determinism gate |
| **Nothing regresses.** All six harnesses green, the six-step chain still solvable, the deployment still live. | CI |
| **It still feels good on a phone.** | **The owner** |

The Sabine estimate is a reference for the generator, not a claim about the
real field — the compartments are coupled by open doorways and Sabine assumes a
closed box. It is in the table because it catches the failure where a response
is generated from the wrong room's numbers, which is silent and which no
listening test would localise.

## 4.6 Amendments to earlier sections

- **v1 §4, controls.** Adds crouch: hold `C` or left `Ctrl`; a second button on
  the touch layout. The controls card gains one line.
- **v1 §5, level.** "Partially blocked by collapsed debris, forcing a squeeze
  route" becomes true rather than aspirational. The level itself does not change.
- **v1 §6, retro rendering treatment.** Gains generated relief:
  nearest-filtered normal maps with a low Phong specular. Additive — the reduced
  internal resolution, the absent antialiasing and the distance fog all stand.
- **v1 §7, asset manifest.** Textures gain a normal map for each of the six
  tiling surfaces. Audio grows from ten sounds to thirteen — one new footstep
  set — and gains impulse responses, one per distinct compartment shape: five
  for the current seven compartments.

## 4.7 The box

Two new asset classes, one new sound set, **zero new models, zero new rooms,
zero new interactive types**, and one new movement verb.

If the phase wants a second movement verb or a third asset class, that is a
signal to change this document first — not to add it.

## 4.8 Build order

Ordered so the riskiest thing is proved first, and so each feature can ship
alone if the cycle runs long.

1. **The body**, and the dead-end proof across both stances — red before green.
   If two-stance reachability cannot be made to hold, that is discovered before
   any asset work, the same way phase 3 proved the letterforms before placing a
   label.
2. **Relief** — the height channel, the normal maps, Phong, and the harness that
   proves the maps are actually bound.
3. **Acoustic space** — the response generator, the convolver, panning, room
   tone, footsteps.
4. **Mechanism** — the four responsive parts and the four idle ones.
5. **Integration and ship.**

## 4.9 Decisions taken in the draft

Phases 2 and 3 were each settled in an interview before anything was written.
This one was written first: the ask was for breadth and pace, and a
five-question interview is the wrong instrument for "pick four things across
four domains." The reasoning is therefore recorded here rather than in an
interview transcript.

The four calls the draft was least sure of — the size of the phase, zero new
models, generated impulse responses over a reverb written in code, and whether
crouch was worth re-opening the reachability proof — were then put to the owner
against their alternatives, and every one was confirmed as drafted. So the
order was inverted rather than the step skipped: propose, then ratify.

- **Four domains, not one thesis.** Rejected: a fifth and sixth feature —
  performance work and a richer ending — both of which are real and neither of
  which the owner can review by playing. Every feature in this phase changes
  something a player can see, hear or feel, because "more to review" was the
  ask.
- **Zero new models.** Rejected: a vent unit and a fan unit through the model
  pipeline, on the phase 2 precedent. They would have been the easy thing to
  add and the least interesting: the phase's asset growth belongs in new *kinds*
  of data, not in more props. Everything that moves is built in engine, which is
  what the socket already proved is enough.
- **Phong, not Standard.** Rejected: PBR, which is the default answer in 2026
  and the wrong one here — it costs frames at 0.5× internal scale and it would
  make the ship look like a modern game wearing a low-resolution costume. Made
  permanent in 4.4 so it does not get reopened.
- **Crouch, despite the cost.** Rejected: leaving the squeeze as flavour. It
  re-opens the one proof in this document that was expensive to establish, which
  is a real argument against it. It is in anyway, because a spec that has
  claimed something for three phases without it being true is a spec that is
  drifting from the build, and this document's first rule is that those two do
  not drift.
- **Generated impulse responses over hand-tuned reverb.** Rejected: delay taps
  and a filter per room, which is cheaper, entirely adequate, and would put the
  acoustics outside the pipeline. Same argument that beat canvas text in phase 3
  and hosted services in Amendment 1.

---

# Phase 3 — v1.2

**Status: SHIPPED.** Spec ratified 30 July 2026 by merging PR #14, following the
interview of 29 July 2026; built and shipped the same day in PR #15. On the same
terms as v1 and phase 2: nothing here is a suggestion, and if we change
something during the build we change this document first.

Supersedes the "no text" clause of the v1 §8 style bible, narrowly — see 3.6.
Everything in v1 and phase 2 not named here still stands, including Amendment 1.

## 3.1 The one-liner

The ship starts telling you what it is. Not what happened to it and not who you
are — just that this is a real vessel with named compartments and labelled
machinery, rather than five well-lit boxes.

## 3.2 What phase 3 demonstrates

That the pipeline can generate **letterforms**, and that generated type survives
the retro treatment.

v1 proved a generated asset set assembles into a finished game. Phase 2 proved
the same foundation carries mechanics. Every asset so far has been abstract —
noise, wear, geometry — and abstract is forgiving. Type is not: it is either
legible or it is a smear, and 256 px textures under nearest-neighbour filtering
at a 0.5–0.66× internal render scale are the worst conditions to attempt it in.

There is also no font to reach for. Amendment 1's rule is that the generators
produce everything, and a shipped typeface is a third-party asset. So the
letterforms have to be **drawn in code** — which is the whole exercise, and the
sharpest test yet of "an AI wrote the code that draws the rivets" as a claim.

Every tradeoff during the build gets settled against that.

## 3.3 What gets built

**A glyph atlas, as a pipeline asset.** Parametric letterforms drawn at build
time into one bitmap sheet, crunched and nearest-filtered like every other
texture, listed in the manifest like every other asset. Uppercase, digits and a
few marks — enough for compartment labels and placards, and nothing more.

**Labels composed in engine from that atlas.** Each marking is quads textured
from the sheet, placed from `layout.js` the way the conduit strips already are.
One asset serves any number of markings, and rewording a sign costs nothing.
Rejected: a baked decal texture per sign, which gives per-sign chipping for free
but grows the manifest with every label and makes copy changes an asset
regeneration.

**Where markings go, and what they say:**

| Marking | Placement |
|---|---|
| **Compartment label** | One per space, on the bulkhead beside the opening you enter through. Names the space and nothing else. |
| **Fixture placard** | On the two switches, the airlock, and the two cradles — the fixtures that would carry one in reality. |

**Compartment labels name spaces; they never direct traffic.** No arrows, no
"this way to", nothing pointing at an objective. A label tells you the room you
are walking into, which is what real signage does; it does not tell you which
room to power first or where a cell is. The no-hints bar was proven without any
signage at all and phase 3 must not quietly convert it into a signposted level.

**Suggestive small print, baked into the tiling surfaces.** Text-shaped stencil
wear at a scale that reads as markings from across the room and never resolves
into words. This is what stops the readable labels looking like the only writing
on a ship that otherwise has none. It goes into the existing wall and trim
generators, not into new assets.

**The airlock readout stops contradicting itself.** It currently draws a *filled*
cell socket in red, because the whole readout stays red until 2/2. Red means
"not done" everywhere else on the ship — switch indicators, cradle lamps — so a
cell you have successfully seated lighting up red is the one place the colour
language argues with itself. Filled pips go green; the `n/2` count stays red
until the airlock is live, so the count still says "this door is dead" while the
pips say "this one is in." Found by reading, not by playing, and it belongs to
this phase because this phase is about the ship communicating clearly.

**Unchanged:** the five spaces, every mechanic, the route, the lighting states,
the HUD, the viewmodel, the retro rendering treatment, the asset budgets.

## 3.4 Scope guardrails

Still permanently out, unchanged: **combat, enemies, saving, settings menus,
procedural generation, additional levels or rooms.**

New for this phase, and permanent: **no narrative.** No logs, no dead crew, no
incident to piece together, no reason you are here. The ship names its own parts
and warns about its own hazards. That is the whole of what it says. If a future
phase wants a story it changes this document first.

**No new models and no new sounds.** One new asset, and it is the atlas.

## 3.5 Definition of done

| | Verified by |
|---|---|
| **Every space is named, once, correctly.** One label per space, each naming its own space, none duplicated or contradicting `SPACES`. | Claude — a check over the layout tables, run in CI |
| **Labels are big enough to read where they matter.** From the position a player first sees it, at the shipped internal render scale, a compartment label's cap height clears a pixel floor. | Claude — a harness that computes on-screen cap height per label. Big enough is necessary, not sufficient |
| **Labels are actually readable.** A player can read a compartment label from the doorway, on a phone, without stopping to squint. | **The owner.** Claude can measure pixels and cannot judge whether type reads, and must not claim to |
| **Still generated end to end.** The atlas comes from the pipeline, and a clean checkout reproduces it byte-for-byte. | The existing determinism gate |
| **Nothing regresses.** All five harnesses green, the six-step chain still solvable, the deployment still live. | CI |

The second and third bars are deliberately separate. A pixel floor catches the
failure where a label silently becomes unreadable because the render scale, the
texture crunch or the placement distance changed — which is exactly the kind of
regression nobody notices until a phone screenshot looks wrong. It cannot tell
you whether the letterforms are any good.

## 3.6 Amendment to the v1 §8 style bible

The bible currently ends "No text, no watermarks, no people." That clause was
right when every surface was tileable: text baked into a tiling texture repeats
down a fourteen-metre wall. It now reads:

> No legible text, no watermarks, no people.

applied to **textures and model concepts only**. Illegible stencil-shaped wear is
allowed and wanted on those. The glyph atlas is a new asset class and carries its
own line, since it is nothing but text:

> Uppercase industrial stencil lettering, the kind sprayed onto bulkheads and
> equipment plates. Heavy, condensed, slightly irregular. Legible at small size
> on a low-resolution screen.

## 3.7 The box

One new asset. One label per space, one placard per fixture that warrants one.
Zero new models, zero new sounds, zero new rooms, zero new interactive types.

If the phase wants a second new asset, that is a signal to change this document
first — not to add it.

## 3.8 Build order

1. **Glyph generator** — letterforms drawn in code, the atlas baked and crunched,
   proven legible on its own before a single label is placed. If type at this
   size cannot be made to read, that is discovered here and the phase is
   rethought rather than continued.
2. **Placement** — labels and placards declared in `layout.js`, composed in
   engine, plus the cap-height harness.
3. **Suggestive small print** — text-shaped wear into the existing wall and trim
   generators.
4. **The readout fix, integration and ship.**

## 3.9 Settled during the interview

Recorded so the reasoning is not lost:

- **Authenticity, not narrative.** Rejected: the ship's history in fragments
  (the option I recommended), the player's own identity, and both together. The
  ambition is that the ship reads as a real place, which keeps the phase a
  technical exercise about type rather than a writing exercise.
- **Mixed legibility.** Key markings readable, dense small print suggestive.
  Rejected: everything readable, which reads sparse because real bulkheads carry
  more markings than anyone writes copy for; and everything illegible, which is
  period-accurate but means nothing on the ship ever actually says anything.
- **Atlas over decals over canvas.** Rejected: a generated decal per sign, and
  in-engine canvas text like the HUD — the latter is cheapest and always legible
  but renders sharper than the rest of the ship and would make the signage the
  one thing the player sees that the pipeline did not produce.
- **Named spaces, no arrows.** Rejected: pure flavour with no room names, which
  is the least authentic option available; and full wayfinding, which is real
  but removes exploration the first play is made of.

---

# Phase 2 — v1.1

**Status: SHIPPED.** Spec ratified 29 July 2026 by merging PR #12, following the
interview of the same day; built and shipped the same day in PR #13. On the same terms as v1: nothing here is a
suggestion, and if we change something during the build we change this document
first.

Supersedes part of v1 §4. Everything in v1 not named here still stands,
including Amendment 1. Where the two disagree, this section wins.

## P1. The one-liner

The two power cells stop being a number on a panel and become objects. You find
them, carry them, and seat them — and neither one is reachable until the machine
holding it has been dealt with.

## P2. What phase 2 demonstrates

That the engine and the asset pipeline support **mechanics**, not just set
dressing.

v1 proved a generated asset set could assemble into a finished game. Every
interaction in it was the same interaction: walk up to a thing, press a button,
a counter goes up. Phase 2 proves the same foundation carries objects with
identity, machines with state, and an order that has to be respected — without
the level growing, without a second art style, and without giving up the
guarantee that the game cannot be broken.

Every tradeoff during the build gets settled against that sentence.

## P3. The revised loop

The ship, the five spaces and the route are unchanged. What changes is what the
switches actually do.

1. **Airlock Bay.** The panel reads 0/2 as before. Below it, two empty **cell
   sockets** — visibly waiting for something.
2. **Storage Hold.** Power Cell 1 sits in a **charging cradle**, clamped. The
   wall switch no longer credits a cell; it powers the Hold, which releases the
   clamp. Take the cell.
3. **Back to the Bay.** Seat the cell. The panel reads 1/2, and the Bay comes up
   on its own power.
4. **Engine Annex.** Cell 2's cradle needs two things: the Annex under power,
   and the Bay live. The Annex switch supplies the first and works as it does
   today, opening the shortcut hatch with it. Seating cell 1 supplies the
   second. Neither alone is enough, so the cell cannot be taken before step 3
   and the Annex switch cannot be skipped.
5. **Back through the shortcut.** Seat the second cell. 2/2, airlock cycles,
   walk out.

Six steps, none of which can be taken early. The route, the lighting states, the
squeeze and the shortcut all keep working as they do now.

## P4. What gets built

**Three new interactive types. No more.**

| Type | What it does |
|---|---|
| **Power cell** | Carryable. Two instances. One carry slot — you hold one or none. |
| **Cell socket** | Two, on the Bay's airlock panel. Accepts a cell. One-way: nothing comes back out. |
| **Charging cradle** | Two, one per objective room. Holds a cell until its release condition is met. |

**Carrying rules**, chosen to make the correctness bar provable rather than to
maximise freedom:

- One cell at a time.
- Interact with a cell to take it. While carrying: interact with a socket to
  seat it, interact with nothing to set it down. Every other interactive still
  behaves normally with your hands full — you can flip a switch while holding a
  cell, and you must be able to, because nothing in the chain guarantees you are
  empty-handed when you reach one.
- **A carried cell replaces the scanner in the viewmodel**, which stows while
  your hands are full. The HUD does not change — v1 §4 still holds. Carrying is
  therefore always visible without a HUD element, and the tool being unavailable
  while loaded is a consequence we keep rather than work around.
- Setting down places the cell on the floor at the player's feet. It is never
  thrown, never placed inside geometry, and never enters a room the player
  cannot re-enter.
- Sockets are one-way. Once a cell is seated it is spent. This deletes an entire
  class of failure rather than testing for it.

**Where fixtures are mounted.** Every fixture the crosshair has to find is
placed so its body straddles the player's eye line. The interact ray leaves the
eye travelling flat, so a fixture sitting entirely below eye height can be aimed
at only from a distance and stops being aimable at all as the player walks up to
it — exactly when they are trying to use it. Cradles present their cell across
the eye line; sockets are mounted at the same height and the airlock readout
moves up to sit above them. This is a rule about aiming, not decoration, and it
is why the readout is no longer at waist height.

The one thing that cannot obey that rule is a cell lying on the deck, which is
under the crosshair from every angle. So a set-down cell is taken by proximity
alone, with no aiming: standing over it is enough. Put down and pick back up is
therefore the same button pressed twice in the same spot, and never requires
staring at the floor.

Setting a cell down anywhere is the more expensive of the options considered,
and was chosen deliberately. It means the dead-end harness cannot simply assume
a cell is always in one of two places — it has to establish that every floor
position the player can stand on is a position they can return to. That search
is the main cost in P8 step 2, and it is the reason that step exists before any
asset work.

**New assets**, through the existing pipeline: `power_cell` and `cell_cradle`
models, and two sounds — cell lift and cell seat. Existing style bible, existing
budgets, existing post-process.

The socket is the third interactive type but not a third model. It is a shallow
wall fixture of the same kind as the airlock readout, which v1 already builds in
engine from the generated wall surfaces, and it is built the same way. Two new
models is the box, and it holds.

**Unchanged:** the five spaces, the two wall switches, the lighting states, the
airlock, the shortcut hatch, the retro rendering treatment, the HUD.

## P5. Scope guardrails

Lifted from v1 §4: **inventory**, narrowly — a single carry slot, no UI, no
management, no dropping at range.

Still permanently out, unchanged from v1: **combat, enemies, saving, settings
menus, procedural generation, additional levels or rooms.**

Depth comes from machines that hold state and gate each other, not from more
space and not from more verbs.

## P6. Definition of done

| | Verified by |
|---|---|
| **No unwinnable states.** No sequence of player actions leaves the game uncompletable. A cell can always be recovered and every socket can always be reached. | Claude — a harness that reasons over the whole walkable floor rather than over action sequences, run in CI. See below. |
| **Real dependency depth.** The critical path is six ordered steps and no step can be completed before its predecessor. | Claude — a harness that drives each interaction directly, with aim taken out, and asserts every step refuses to work before its predecessor |
| **Still a short vignette.** A player who knows the route finishes inside five minutes. | Claude — the on-foot walkthrough harness reports game-clock duration |
| **Solvable without hints.** A player finishes cold, with no tutorial text and no instruction beyond the existing controls card. | **The owner.** Claude cannot verify this and must not claim to |

**How the no-unwinnable-states bar is actually met.** Searching action
sequences turned out to be the wrong shape. The only action that can strand
anything is setting a cell down, the cell always lands where the player is
standing, and cells add no colliders — so the question is never "which order
did they do things in", it is "is every floor position the player can stand on
a position they can walk back from". That is a statement about the floor, and
it is decided directly:

- Grid the level at 10 cm and mark a square walkable when the player's real
  collision box, centred there, hits none of the real colliders read out of the
  running game.
- Flood fill from the spawn, allowing a step only when the union of the two
  player boxes is clear. That is stricter than testing the endpoints, so the
  fill can under-report reachability but never over-report it.
- The step relation is symmetric, so the filled component is mutually
  reachable — which is the guarantee. That symmetry is checked rather than
  assumed, by filling again from a socket and requiring an identical component.
- Repeat at every gate state and require that the reachable set only grows. A
  door that closed is the one way this level could trap someone.

Floor that is walkable but sealed behind a door that has not opened yet is
gated, not orphaned, so each state is judged against the final one.

Plus everything v1 §11 already required, which must not regress: the loop stays
playable start to finish, every harness stays green, every asset still comes
from the pipeline, and the Vercel deployment stays live.

## P7. The box

Three new interactive types, two new models, two new sounds, zero new rooms.

If the design wants a fourth type, that is a signal to change this document
first — not to add it.

## P8. Build order

1. **Mechanics greybox** — carrying, sockets, cradles and the gating chain, on
   the existing props. Fully playable before any new asset exists, as in v1.
2. **Dead-end harness** — the adversarial search, red before it is green.
3. **Assets** — the two models and two sounds through the pipeline.
4. **Integration and ship** — real assets, audio, deploy.

## P9. Settled during the interview

Recorded so the reasoning is not lost and neither gets reopened casually:

- **A carried cell replaces the scanner.** Rejected: a second viewmodel anchor
  on the left (costs its own aspect-ratio tuning, which was the fiddliest part
  of v1 on portrait phones), holding it low and centre (fights the crosshair),
  and showing nothing at all (a player can walk away having forgotten they are
  carrying it — the worst possible failure against the no-hints bar).
- **A cell can be set down at your feet.** Rejected: returning it to its cradle
  (recoverable by construction, but magical), and carry-until-seated (strictest,
  but sticky if you pick a cell up before finding where it goes). The chosen
  option keeps the player free and moves the cost into the harness.

---


---

# v1.0 — the shipped spec

Everything below is v1 as ratified on 25 July 2026 and shipped. It still
applies except where Amendment 1 or Phase 2 supersede it.

## 1. The one-liner

DERELICT is a 3–5 minute first-person vignette playable in the browser. You wake on a dead spaceship. Two power switches, hidden in different rooms, energize the exit airlock. Find them, flip them, escape. Every asset the player sees or hears — textures, 3D props, the scanner in your hands, every sound — is AI-generated.

## 2. What the prototype demonstrates

That a build-time AI pipeline (image generation → image-to-3D → sound generation) can produce a **complete, stylistically coherent asset set** that assembles into a finished, playable web game. The deliverable is twofold: the game at a public Vercel URL, and the repo showing exactly how every asset was made. The pipeline runs once on your machine; the deployed site is static files — instant to load, free to serve.

## 3. The player experience, start to finish

Fade in: Airlock Bay, lit only by dim red emergency light. A dead airlock door with a panel showing **0/2** power cells. The scanner sits at the bottom-right of the view. Two exits: Corridor A and Corridor B.

Corridor A leads to the **Storage Hold** — crate stacks, canisters, debris. Switch 1 is tucked among the crates. Flip it: heavy clunk, the scanner animates, the Hold's lighting snaps from red to green-white. Airlock panel now reads 1/2.

Corridor B is partially blocked by collapsed debris, forcing a squeeze route into the **Engine Annex** — consoles, pipe clusters, the works. Switch 2 sits beside the terminals. Flip it: same feedback, and a **shortcut hatch** from the Annex back to Airlock Bay powers open so the return isn't a retrace.

At 2/2 the airlock cycles open with light pouring through. Walk in → fade to black → **"You escaped."** → restart button.

## 4. Game definition

- **Core loop:** explore + light interaction. No combat, ever.
- **Controls — desktop:** pointer-lock mouse look, WASD movement, **E** to interact.
- **Controls — mobile:** left virtual joystick = move, right side drag = look, contextual tap button = interact.
- **Interaction system:** raycast from camera center, ~2 m range. Aimed-at interactives get a subtle highlight + "[E] Interact" prompt (context button on mobile).
- **HUD:** crosshair dot + the interact prompt. Nothing else.
- **Viewmodel:** handheld scanner/multitool in the classic bottom-right FPS position; plays a short animation on every interaction.
- **Ending:** airlock walk-through → fade → end card with title + restart.
- **Scope guardrails (permanently out):** combat, enemies, inventory, saving, settings menus, procedural generation, additional levels.

## 5. Level

Three rooms + two corridors:

| Space | Contents | Role |
|---|---|---|
| Airlock Bay | Dead airlock door w/ 0–2 power-cell panel, scattered debris | Start + goal |
| Corridor A | Pipe clusters, wall panels | Route to Hold |
| Storage Hold | Crate stacks, canisters, **Switch 1** | First objective |
| Corridor B | Debris blockage → squeeze route | Route to Annex |
| Engine Annex | Consoles/terminals, pipe clusters, **Switch 2**, shortcut hatch → Airlock Bay (opens at 2/2) | Second objective |

Lighting states: all rooms start dim emergency red; each flipped switch converts its room (and its corridor) to green-white powered lighting. Light-shaft cones appear in powered areas.

## 6. Art direction

Late-1990s shooter aesthetic per the reference screenshot: chunky low-resolution textures, dark gunmetal/olive industrial surfaces, rivets and grime, sickly-green energy glow accents, pooled moody lighting, visible light shafts.

**Retro rendering treatment:** reduced internal render resolution (0.5–0.66×, upscaled), nearest-neighbor texture filtering, antialiasing off, subtle distance fog, light shafts as additive transparent cones.

## 7. Asset manifest (all AI-generated)

**3D models — 7 types, via image→3D (instanced freely):**

| Model | Approx. real scale | Budget |
|---|---|---|
| Scanner (viewmodel) | 35 cm handheld | ≤8k tris |
| Power switch unit | 1.4 m wall-mounted | ≤3k |
| Airlock door | 2.4 m tall | ≤5k |
| Cargo crate + canister | 0.8 m / 1.2 m | ≤3k each |
| Wall console/terminal | 1.6 m | ≤3k |
| Pipe & cable cluster (segment) | ~2 m | ≤3k |
| Floor debris / broken panel pieces | 0.3–1 m | ≤2k each |

**Textures — tileable, crunched to 256–512 px:** wall panel (×2 variants), floor plate, ceiling, greeble/machinery panel, door-frame trim, glowing green conduit strip (emissive).

**Audio — 8 sounds via SFX generation:** ship-hum ambient loop (~30 s), switch clunk, power-surge (room lights on), door motor, footsteps ×3 variants, end-card sting.

**UI:** crosshair dot and prompt text rendered in-engine (no generated assets needed).

## 8. Pipeline (build-time, run locally)

**Stages:**
1. **Style bible** — one shared prompt block prepended to every generation (draft below; tune during production, but always one shared block).
2. **Textures** — generate → downscale to 256–512 px → save to assets.
3. **Models** — per prop: generate concept image (single object, plain dark-gray background, ¾ view) → send to Meshy image→3D → receive GLB → post-process: origin to floor-center, scale per the table above, decimate to tri budget, crunch textures to 256 px.
4. **Audio** — generate the 8 sounds → normalize loudness → save.
5. Commit everything to `/public/assets/`.

**Style bible — starting draft:**
> Late-1990s retro sci-fi FPS aesthetic. Derelict industrial spaceship interior. Dark gunmetal and olive metal, heavy rivets, scuffed grimy surfaces, utilitarian machinery. Sickly green energy glow from conduits and readouts. Low-resolution game-texture look, slightly desaturated, moody. No text, no watermarks, no people.

Suffix for textures: *"seamless tileable texture, flat frontal view, even lighting."*
Suffix for model concepts: *"single object centered on a plain dark gray background, three-quarter view, entire object visible, video game prop."*

## 9. Tech

- **Stack:** Vite + vanilla Three.js (no framework — smallest surface area for a game loop). Deployed as a static site on Vercel.
- **Repo:** `/pipeline` (generation scripts + style bible), `/public/assets` (committed generated outputs), `/src` (game code).

## 10. Build order

1. **Greybox** — level geometry, movement (desktop + mobile), interactions, door logic, all with placeholder materials. The game is fully playable, just gray.
2. **Pipeline** — scripts produce the complete asset set into `/public/assets`.
3. **Integration** — real assets in, lighting + light shafts, audio hooked up.
4. **Polish & ship** — retro rendering treatment, mobile control tuning, end card, deploy to Vercel.

## 11. Definition of done

- Complete loop playable start-to-finish in under 5 minutes with no soft-locks.
- Runs on desktop Chrome/Firefox/Safari and iOS Safari / Android Chrome at a smooth framerate on mid-range hardware.
- Every visible and audible asset produced by the pipeline; pipeline re-runnable via npm scripts.
- Live at a public Vercel URL.

---

