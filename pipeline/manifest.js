import { SPACES } from '../src/game/layout.js';
import { GLYPH_BIBLE, audioPrompt, iconPrompt, modelPrompt, skyPrompt, texturePrompt } from './style-bible.js';

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
    relief: true,
    variant: 0,
    prompt: texturePrompt(
      'Riveted steel wall panel section of a spaceship corridor, large bolted plates with recessed seams, weld scars, streaks of grime running down from the joints.'
    ),
  },
  {
    id: 'wall_panel_b',
    size: 512,
    synth: 'wall',
    relief: true,
    variant: 1,
    prompt: texturePrompt(
      'Olive drab painted bulkhead panel, chipped paint over bare steel, stencilled hazard blocks worn away, heavy rivet rows, oil staining.'
    ),
  },
  {
    id: 'floor_plate',
    size: 512,
    synth: 'floor',
    relief: true,
    prompt: texturePrompt(
      'Industrial diamond tread deck plating, worn tread pattern polished smooth in the walk lines, bolt heads at the plate corners, dirt in the grooves.'
    ),
  },
  {
    id: 'ceiling_plate',
    size: 256,
    synth: 'ceiling',
    relief: true,
    prompt: texturePrompt(
      'Overhead ceiling panel of a spaceship, perforated vent grille sections between flat ribbed metal panels, dust and condensation staining.'
    ),
  },
  {
    id: 'greeble_panel',
    size: 512,
    synth: 'greeble',
    relief: true,
    prompt: texturePrompt(
      'Dense machinery greeble panel, cable looms, cooling fins, valve blocks, small dead indicator lamps, exposed conduit, packed technical detail.'
    ),
  },
  {
    id: 'door_trim',
    size: 256,
    synth: 'trim',
    relief: true,
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

  // ---- Phase 3 -----------------------------------------------------------
  // Not tileable and not double-rendered: `atlas` marks the one texture that is
  // rasterised straight at its final size, because the downsample every other
  // surface benefits from is what would turn a stem into a smudge.
  {
    id: 'glyph_atlas',
    size: 256,
    synth: 'glyph_atlas',
    atlas: true,
    prompt: GLYPH_BIBLE,
  },
];

/**
 * Phase 6 — the outside. One cube map, six faces, drawn by asking what lies in
 * each texel's direction. It is the one texture on the ship that is not
 * tileable, not double-rendered and not lit: it is the view out of the outer
 * door and nothing else, and nothing inside the hull ever sees it (6.4).
 */
/**
 * Phase 8 — the icon, the one new asset class (8.3.6). What the game is on a
 * home screen and in a browser tab. Generated, like everything else.
 */
export const ICON = {
  id: 'icon',
  sizes: [192, 512],
  seed: 8,
  glyph: 'D',
  synth: 'icon',
  prompt: iconPrompt('The letter D for DERELICT, on a riveted gunmetal bulkhead plate.'),
};

export const SKY = {
  id: 'sky',
  size: 256,
  seed: 6,
  synth: 'sky',
  prompt: skyPrompt(
    'The view from the outer door of a derelict ship: deep black space thick with single-pixel stars, a faint band of unresolved starlight, the lit limb of a large banded gas giant filling the lower half of the view ahead, and one small hard white sun above and to the left of it.'
  ),
};

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

/**
 * Every sound, all generated. Eight from v1, two from phase 2, three from
 * phase 4, four from phase 6.
 */
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
  // Phase 4 — the second surface underfoot. Grating rings where deck plate
  // thuds, and it is what the two corridors and the Service Passage are made
  // of. `spaceAt` already knows which is beneath the player.
  {
    id: 'footstep_grate_1',
    seconds: 0.5,
    gain: 0.66,
    synth: 'footstep',
    variant: 0,
    surface: 'grate',
    prompt: audioPrompt('A single boot step on open steel grating, bright metallic clatter with a short ringing tail.'),
  },
  {
    id: 'footstep_grate_2',
    seconds: 0.5,
    gain: 0.66,
    synth: 'footstep',
    variant: 1,
    surface: 'grate',
    prompt: audioPrompt('A single boot step on open steel grating, bright metallic clatter with a short ringing tail.'),
  },
  {
    id: 'footstep_grate_3',
    seconds: 0.5,
    gain: 0.66,
    synth: 'footstep',
    variant: 2,
    surface: 'grate',
    prompt: audioPrompt('A single boot step on open steel grating, bright metallic clatter with a short ringing tail.'),
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

  // ---- Phase 6: the machinery you can see, heard -------------------------
  // One voice per thing that moves. Each is fired by the motion it belongs to
  // (6.3.2), so none of them is a loop with a clock of its own. The lamp's
  // buzz is the one steady tone, and it is WAV rather than MP3 so it can loop
  // without the codec's padding ticking once a cycle.
  {
    id: 'fan_pass',
    seconds: 0.62,
    gain: 0.75,
    synth: 'fan',
    prompt: audioPrompt('One blade of a slow, worn ceiling extractor fan passing its housing: a soft low push of air over a tired, slightly unsteady bearing whine.'),
  },
  {
    id: 'vent_breath',
    seconds: 2.4,
    gain: 0.7,
    synth: 'vent',
    prompt: audioPrompt('A wall vent drawing one breath of air through louvred slats, a hollow duct swell rising and falling, the slats knocking once as they open.'),
  },
  {
    id: 'lamp_buzz',
    seconds: 1,
    hz: 120,
    gain: 0.55,
    synth: 'buzz',
    wav: true,
    loop: true,
    prompt: audioPrompt('The steady electrical buzz of a failing fluorescent ballast, mains hum with harsh odd harmonics.'),
  },
  {
    id: 'spark_crackle',
    seconds: 0.55,
    gain: 0.8,
    synth: 'crackle',
    prompt: audioPrompt('A short burst of electrical sparks from a damaged live cable, hard irregular crackles and a brief zap.'),
  },
];


/**
 * Phase 4 — compartment acoustics.
 *
 * Derived from SPACES rather than restated. An impulse response is a function
 * of the box it is generated from, so the level table stays the only place a
 * room's size is written down, and resizing a compartment regenerates its
 * acoustic for free.
 *
 * Keyed by the dimensions that produce the response, so identical compartments
 * share one: Corridor A and Corridor B are the same 12 x 2.6 x 2.6 m box, and
 * the Hold and the Annex are the same 14 x 18 x 3.8 m box. Seven compartments,
 * five responses — which is correct rather than a shortcut, and is asserted in
 * tools/acoustics.mjs rather than assumed.
 */

/**
 * One absorption coefficient for the whole ship. Painted steel and bare plate
 * are both quite reflective; this is the single number the spec calls "a
 * chosen absorption", and it is what sets the 0.54 s to 1.38 s spread the
 * feature is betting on being audible.
 */
export const ABSORPTION = 0.15;

export const ACOUSTICS = buildAcoustics();

function buildAcoustics() {
  const byShape = new Map();
  for (const space of SPACES) {
    const w = round2(space.x[1] - space.x[0]);
    const d = round2(space.z[1] - space.z[0]);
    const h = round2(space.h);
    const key = `${w}x${d}x${h}`;
    if (!byShape.has(key)) {
      byShape.set(key, {
        id: `ir_${space.id}`,
        w,
        d,
        h,
        absorption: ABSORPTION,
        // Seeded off the dimensions, not off position in the list, so the
        // noise in a room's tail is a property of the room.
        seed: hash(key),
        spaces: [],
      });
    }
    byShape.get(key).spaces.push(space.id);
  }
  return [...byShape.values()];
}

/** Kills float noise like 1.9999999999999996 before it reaches a key. */
function round2(v) {
  return Math.round(v * 100) / 100;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const ALL = { TEXTURES, SKY, MODELS, SOUNDS, ACOUSTICS };
