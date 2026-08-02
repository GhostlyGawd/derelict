
# DERELICT — Spec

**How to read this document.** Phase 5 (v1.4) is the active spec and is still a
draft. Phase 4, Phase 3, Phase 2, Amendment 1 and the v1.0 sections below them
are ratified and shipped. Where any two disagree, the later section wins.
Nothing here is a suggestion — if we change something during a build, we change
this document first.

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

# Phase 5 — v1.4

**Status: DRAFT.** Merging this section is the ratification, as with phases 2,
3 and 4. On the same terms: nothing here is a suggestion, and if we change
something during the build we change this document first.

Proposed rather than interviewed, as phase 4 was — see 5.8. Merging ratifies;
the pull request is where it gets argued.

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

## 5.6 Amendments to earlier sections

- **v1 §3, the player experience.** The ending is a sequence rather than a cut.
  The words "You escaped." and the restart button stay.
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

