import { audioPrompt, modelPrompt, texturePrompt } from './style-bible.js';

/**
 * The asset manifest from section 7 of the spec, as data.
 *
 * Every stage of the pipeline reads this, and the game reads the manifest.json
 * the pipeline writes out of it — so this table is the only place an asset is
 * declared.
 */

/** Tileable surfaces, crunched to 256–512 px. */
export const TEXTURES = [
  {
    id: 'wall_panel_a',
    size: 512,
    synth: 'wall',
    variant: 0,
    prompt: texturePrompt(
      'Riveted steel wall panel section of a spaceship corridor, large bolted plates with recessed seams, weld scars, streaks of grime running down from the joints.'
    ),
  },
  {
    id: 'wall_panel_b',
    size: 512,
    synth: 'wall',
    variant: 1,
    prompt: texturePrompt(
      'Olive drab painted bulkhead panel, chipped paint over bare steel, stencilled hazard blocks worn away, heavy rivet rows, oil staining.'
    ),
  },
  {
    id: 'floor_plate',
    size: 512,
    synth: 'floor',
    prompt: texturePrompt(
      'Industrial diamond tread deck plating, worn tread pattern polished smooth in the walk lines, bolt heads at the plate corners, dirt in the grooves.'
    ),
  },
  {
    id: 'ceiling_plate',
    size: 256,
    synth: 'ceiling',
    prompt: texturePrompt(
      'Overhead ceiling panel of a spaceship, perforated vent grille sections between flat ribbed metal panels, dust and condensation staining.'
    ),
  },
  {
    id: 'greeble_panel',
    size: 512,
    synth: 'greeble',
    prompt: texturePrompt(
      'Dense machinery greeble panel, cable looms, cooling fins, valve blocks, small dead indicator lamps, exposed conduit, packed technical detail.'
    ),
  },
  {
    id: 'door_trim',
    size: 256,
    synth: 'trim',
    prompt: texturePrompt(
      'Heavy door-frame trim moulding of a blast door, diagonal caution striping worn to bare metal, thick bolted flange, scuffed edges.'
    ),
  },
  {
    id: 'conduit_strip',
    size: 256,
    synth: 'conduit',
    emissive: true,
    prompt: texturePrompt(
      'Narrow power conduit strip with a glowing sickly green light channel running down the centre, dark metal housing either side, bolted brackets.'
    ),
  },
];

/**
 * Props built by image→3D. `size`/`fit` are the real-world scale the
 * post-process normalises to; `tris` is the decimation budget.
 */
export const MODELS = [
  {
    id: 'scanner',
    size: 0.35,
    fit: 'longest',
    tris: 8000,
    synth: 'scanner',
    prompt: modelPrompt(
      'A handheld industrial scanner multitool, chunky rubberised grip, small green readout screen, stubby antenna and a sensor head, scuffed olive and gunmetal casing.'
    ),
  },
  {
    id: 'power_switch',
    size: 1.4,
    fit: 'height',
    tris: 3000,
    synth: 'power_switch',
    prompt: modelPrompt(
      'A wall-mounted industrial power breaker unit, tall armoured box with a big red throw lever, warning plate, small indicator lamps, bolted mounting flange.'
    ),
  },
  {
    id: 'airlock_door',
    size: 2.4,
    fit: 'height',
    tris: 5000,
    synth: 'airlock_door',
    prompt: modelPrompt(
      'A heavy spaceship airlock blast door, thick armoured slab with a reinforced central rib, recessed bolt rows, small viewport, caution striping along the bottom edge.'
    ),
  },
  {
    id: 'cargo_crate',
    size: 0.8,
    fit: 'height',
    tris: 3000,
    synth: 'cargo_crate',
    prompt: modelPrompt(
      'A battered cubic cargo crate, ribbed metal sides, corner reinforcement brackets, latched lid, stencil marks worn off, dented and grimy.'
    ),
  },
  {
    id: 'canister',
    size: 1.2,
    fit: 'height',
    tris: 3000,
    synth: 'canister',
    prompt: modelPrompt(
      'A tall pressurised gas canister, cylindrical steel body with banding rings, valve assembly and pressure gauge on top, scratched olive paint.'
    ),
  },
  {
    id: 'wall_console',
    size: 1.6,
    fit: 'height',
    tris: 3000,
    synth: 'wall_console',
    prompt: modelPrompt(
      'A dead wall-mounted control console terminal, angled screen bezel, chunky keypad, cable ducts running out of the base, dark unlit display.'
    ),
  },
  {
    id: 'pipe_cluster',
    size: 2.0,
    fit: 'height',
    tris: 3000,
    synth: 'pipe_cluster',
    prompt: modelPrompt(
      'A vertical cluster of industrial pipes and cable bundles running up a bulkhead, mixed diameters, mounting brackets, valve wheels, insulation wrap peeling.'
    ),
  },
  {
    id: 'floor_debris',
    size: 0.9,
    fit: 'longest',
    tris: 2000,
    synth: 'floor_debris',
    prompt: modelPrompt(
      'A pile of collapsed ceiling debris, buckled metal floor panels, twisted strut fragments and broken plating lying in a heap.'
    ),
  },

  // ---- Phase 2 -----------------------------------------------------------
  // Authored at the exact heights src/game/layout.js expects: the cell body has
  // to straddle the player's eye line, and the cradle shelf has to land on
  // CELL_MOUNT.y so it does.
  {
    id: 'power_cell',
    size: 0.4,
    fit: 'height',
    tris: 2000,
    synth: 'power_cell',
    prompt: modelPrompt(
      'A portable fusion power cell, chunky armoured battery block with corner ribs and a carry handle across the top, heavy contact pins underneath, a small charge readout and a sickly green glow strip down the front.'
    ),
  },
  {
    id: 'cell_cradle',
    size: 1.6,
    fit: 'height',
    tris: 3000,
    synth: 'cell_cradle',
    prompt: modelPrompt(
      'A wall-mounted charging cradle for a power cell, armoured pedestal with a shelf that presents the cell at eye level, two sprung clamp arms either side of the cell bay, a status lamp strip on the front and a thick conduit running down into the deck.'
    ),
  },
];

/** The ten sounds, all generated. Eight from v1, two added by phase 2. */
export const SOUNDS = [
  {
    id: 'ambient_hum',
    seconds: 30,
    loop: true,
    gain: 0.5,
    synth: 'ambient',
    prompt: audioPrompt(
      'Low continuous ship ambience: deep engine hum, distant metal groans, faint air handling, a derelict vessel running on emergency power.'
    ),
  },
  {
    id: 'switch_clunk',
    seconds: 1.4,
    gain: 0.95,
    synth: 'clunk',
    prompt: audioPrompt('A heavy industrial breaker lever being thrown, solid metal clunk with a short ringing tail.'),
  },
  {
    id: 'power_surge',
    seconds: 2.4,
    gain: 0.8,
    synth: 'surge',
    prompt: audioPrompt('Electrical power surging back into a circuit, rising hum, capacitor whine, lights flickering on with a snap.'),
  },
  {
    id: 'door_motor',
    seconds: 3.4,
    gain: 0.85,
    synth: 'motor',
    prompt: audioPrompt('A heavy blast door cycling open, servo motor whine under a grinding metal rumble, ending in a locking clunk.'),
  },
  {
    id: 'footstep_1',
    seconds: 0.45,
    gain: 0.7,
    synth: 'footstep',
    variant: 0,
    prompt: audioPrompt('A single boot step on a hollow metal deck plate, dull thud with a faint metallic ring.'),
  },
  {
    id: 'footstep_2',
    seconds: 0.45,
    gain: 0.7,
    synth: 'footstep',
    variant: 1,
    prompt: audioPrompt('A single boot step on a metal deck grating, slightly sharper, small grit scrape.'),
  },
  {
    id: 'footstep_3',
    seconds: 0.45,
    gain: 0.7,
    synth: 'footstep',
    variant: 2,
    prompt: audioPrompt('A single boot step on a loose deck panel, softer thud with a rattle.'),
  },
  {
    id: 'end_sting',
    seconds: 3.6,
    gain: 0.9,
    synth: 'sting',
    prompt: audioPrompt('A short cinematic resolution sting, low synth drone opening into a clean rising fifth, cold and hopeful.'),
  },

  // ---- Phase 2 -----------------------------------------------------------
  {
    id: 'cell_lift',
    seconds: 1.0,
    gain: 0.9,
    synth: 'lift',
    prompt: audioPrompt(
      'A heavy power cell being pulled out of its charging cradle: magnetic clamps releasing with a short servo whir, contacts parting with a soft electrical pop, then the dull weight of it coming free.'
    ),
  },
  {
    id: 'cell_seat',
    seconds: 1.6,
    gain: 0.95,
    synth: 'seat',
    prompt: audioPrompt(
      'A power cell sliding home into a socket: metal guide rails, a solid latching clunk, then contacts engaging and the circuit coming alive with a rising hum.'
    ),
  },
];

export const ALL = { TEXTURES, MODELS, SOUNDS };
