
# DERELICT — Spec

**How to read this document.** Phase 2 (v1.1) is the active spec and is still a
draft. Amendment 1 and the v1.0 sections below it are ratified and shipped.
Where they disagree, the later section wins. Nothing here is a suggestion — if
we change something during a build, we change this document first.

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

# Phase 2 — v1.1

**Status: LOCKED.** Ratified 29 July 2026 by merging PR #12, following the
interview of the same day. On the same terms as v1: nothing here is a
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
| **No unwinnable states.** No sequence of player actions leaves the game uncompletable. A cell can always be recovered and every socket can always be reached. | Claude — an adversarial harness that searches action sequences for dead ends, run in CI |
| **Real dependency depth.** The critical path is six ordered steps and no step can be completed before its predecessor. | Claude — a harness that drives each interaction directly, with aim taken out, and asserts every step refuses to work before its predecessor |
| **Still a short vignette.** A player who knows the route finishes inside five minutes. | Claude — the on-foot walkthrough harness reports game-clock duration |
| **Solvable without hints.** A player finishes cold, with no tutorial text and no instruction beyond the existing controls card. | **The owner.** Claude cannot verify this and must not claim to |

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

