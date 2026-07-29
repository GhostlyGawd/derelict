
# DERELICT — Final Spec (v1.0)

**Status: LOCKED.** Every item below was decided or approved by you on July 25, 2026. Nothing here is a suggestion. If we change anything during the build, we change this document first.

---

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

