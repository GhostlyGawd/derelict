/**
 * DERELICT — level layout.
 *
 * Pure data. Everything downstream (geometry, colliders, lighting, props,
 * navigation) is derived from the tables in this file, so the level can be
 * reshaped here without touching the builders.
 *
 * Units are metres. The floor of every space is y = 0. +X is east, -Z is north.
 * The player spawns in the Airlock Bay looking north at the dead airlock.
 *
 *                    ┌───── airlock chamber ─────┐
 *                    │        (the exit)         │
 *   ┌────────────┐   ├───────────────────────────┤   ┌────────────┐
 *   │  STORAGE   ├─A─┤        AIRLOCK BAY        ├─B─┤   ENGINE   │
 *   │    HOLD    │   │                           │   │   ANNEX    │
 *   │ [switch 1] │   │                           ├─S─┤ [switch 2] │
 *   └────────────┘   └───────────────────────────┘   └────────────┘
 *                                     A = corridor A, B = corridor B (squeeze),
 *                                     S = shortcut passage (hatch, opens at 2/2)
 */

export const WALL_THICKNESS = 0.4;
export const PLAYER_RADIUS = 0.34;
export const PLAYER_HEIGHT = 1.72;
export const PLAYER_EYE = 1.62;

/** Every enclosed space: floor + ceiling rectangle and its ceiling height. */
export const SPACES = [
  { id: 'bay', name: 'Airlock Bay', x: [-7, 7], z: [-7, 7], h: 3.6 },
  { id: 'corrA', name: 'Corridor A', x: [-19, -7], z: [-1.3, 1.3], h: 2.6 },
  { id: 'hold', name: 'Storage Hold', x: [-33, -19], z: [-9, 9], h: 3.8 },
  { id: 'corrB', name: 'Corridor B', x: [7, 19], z: [-1.3, 1.3], h: 2.6 },
  { id: 'annex', name: 'Engine Annex', x: [19, 33], z: [-9, 9], h: 3.8 },
  { id: 'shortcut', name: 'Shortcut Passage', x: [7, 19], z: [3.6, 5.6], h: 2.4 },
  { id: 'chamber', name: 'Airlock', x: [-2.2, 2.2], z: [-11.4, -7], h: 2.8 },
];

/**
 * Wall lines. `axis: 'x'` is a plane at constant x spanning z from `from` to
 * `to`; `axis: 'z'` is a plane at constant z spanning x. Openings are cut out
 * of the run and capped with a lintel above.
 */
export const WALLS = [
  // ---- Airlock Bay ----
  {
    axis: 'z',
    at: -7,
    from: -7,
    to: 7,
    h: 3.6,
    openings: [{ center: 0, width: 2.4, height: 2.7, id: 'airlock' }],
  },
  { axis: 'z', at: 7, from: -7, to: 7, h: 3.6, openings: [] },
  {
    axis: 'x',
    at: -7,
    from: -7,
    to: 7,
    h: 3.6,
    openings: [{ center: 0, width: 2.6, height: 2.5 }],
  },
  {
    axis: 'x',
    at: 7,
    from: -7,
    to: 7,
    h: 3.6,
    openings: [
      { center: 0, width: 2.6, height: 2.5 },
      { center: 4.6, width: 2.0, height: 2.3, id: 'hatch-bay' },
    ],
  },

  // ---- Corridor A ----
  { axis: 'z', at: -1.3, from: -19, to: -7, h: 2.6, openings: [] },
  { axis: 'z', at: 1.3, from: -19, to: -7, h: 2.6, openings: [] },

  // ---- Storage Hold ----
  {
    axis: 'x',
    at: -19,
    from: -9,
    to: 9,
    h: 3.8,
    openings: [{ center: 0, width: 2.6, height: 2.5 }],
  },
  { axis: 'x', at: -33, from: -9, to: 9, h: 3.8, openings: [] },
  { axis: 'z', at: -9, from: -33, to: -19, h: 3.8, openings: [] },
  { axis: 'z', at: 9, from: -33, to: -19, h: 3.8, openings: [] },

  // ---- Corridor B ----
  { axis: 'z', at: -1.3, from: 7, to: 19, h: 2.6, openings: [] },
  { axis: 'z', at: 1.3, from: 7, to: 19, h: 2.6, openings: [] },

  // ---- Shortcut passage ----
  { axis: 'z', at: 3.6, from: 7, to: 19, h: 2.4, openings: [] },
  { axis: 'z', at: 5.6, from: 7, to: 19, h: 2.4, openings: [] },

  // ---- Engine Annex ----
  {
    axis: 'x',
    at: 19,
    from: -9,
    to: 9,
    h: 3.8,
    openings: [
      { center: 0, width: 2.6, height: 2.5 },
      { center: 4.6, width: 2.0, height: 2.3, id: 'hatch-annex' },
    ],
  },
  { axis: 'x', at: 33, from: -9, to: 9, h: 3.8, openings: [] },
  { axis: 'z', at: -9, from: 19, to: 33, h: 3.8, openings: [] },
  { axis: 'z', at: 9, from: 19, to: 33, h: 3.8, openings: [] },

  // ---- Airlock chamber (beyond the airlock door) ----
  { axis: 'x', at: -2.2, from: -11.4, to: -7, h: 2.8, openings: [] },
  { axis: 'x', at: 2.2, from: -11.4, to: -7, h: 2.8, openings: [] },
  { axis: 'z', at: -11.4, from: -2.2, to: 2.2, h: 2.8, openings: [] },
];

/**
 * Lighting zones. Every zone starts on dim red emergency power; flipping the
 * switch listed in `poweredBy` snaps it to green-white. `bay` and `chamber`
 * come up when both cells are in.
 */
export const ZONE_POWER = {
  bay: 'both',
  chamber: 'both',
  corrA: 'switch1',
  hold: 'switch1',
  corrB: 'switch2',
  annex: 'switch2',
  shortcut: 'switch2',
};

/**
 * Static point lights. Count is deliberately small and fixed — Three.js
 * recompiles materials when the light count changes, so lights are never added
 * or removed at runtime, only re-coloured and dimmed.
 */
export const LIGHTS = [
  { zone: 'bay', pos: [0, 3.15, -3.2], distance: 20 },
  { zone: 'bay', pos: [0, 3.15, 3.4], distance: 20 },
  { zone: 'corrA', pos: [-10.6, 2.3, 0], distance: 15 },
  { zone: 'corrA', pos: [-16.4, 2.3, 0], distance: 15 },
  { zone: 'hold', pos: [-26, 3.35, -4.5], distance: 22 },
  { zone: 'hold', pos: [-26, 3.35, 4.5], distance: 22 },
  { zone: 'corrB', pos: [9.4, 2.3, 0], distance: 15 },
  { zone: 'corrB', pos: [16.6, 2.3, 0], distance: 15 },
  { zone: 'annex', pos: [26, 3.35, -4.5], distance: 22 },
  { zone: 'annex', pos: [26, 3.35, 4.5], distance: 22 },
  { zone: 'shortcut', pos: [13, 2.1, 4.6], distance: 16 },
  { zone: 'chamber', pos: [0, 2.4, -9.6], distance: 14 },
];

/**
 * Point lights use inverse-square falloff, so intensity is tuned against a
 * mid-grey albedo at the ~3 m distance from a ceiling lamp to the deck: dim
 * red pools on emergency power, a clear green-white wash once energised.
 */
export const EMERGENCY = { color: 0xff3a22, intensity: 5.2 };
export const POWERED = { color: 0xd8ffe4, intensity: 16.0 };
/** The airlock chamber floods white once the outer door cycles. */
export const ESCAPE_LIGHT = { color: 0xffffff, intensity: 46.0 };

/** Ceiling light-shaft cones, only shown once their zone is powered. */
export const SHAFTS = LIGHTS.filter((l) => l.zone !== 'chamber').map((l) => ({
  zone: l.zone,
  pos: l.pos,
  radius: l.zone === 'corrA' || l.zone === 'corrB' || l.zone === 'shortcut' ? 1.0 : 1.7,
}));

/**
 * Emissive conduit strips: unlit runs of the generated conduit texture that
 * read red on emergency power and green once energised.
 */
export const CONDUITS = [
  { zone: 'bay', axis: 'z', at: -6.72, from: -6.6, to: 6.6, y: 2.55, side: 1 },
  { zone: 'bay', axis: 'z', at: 6.72, from: -6.6, to: 6.6, y: 2.55, side: -1 },
  { zone: 'corrA', axis: 'z', at: -1.22, from: -18.6, to: -7.2, y: 2.15, side: 1 },
  { zone: 'corrA', axis: 'z', at: 1.22, from: -18.6, to: -7.2, y: 2.15, side: -1 },
  { zone: 'hold', axis: 'x', at: -32.72, from: -8.6, to: 8.6, y: 2.7, side: 1 },
  { zone: 'hold', axis: 'z', at: -8.72, from: -32.6, to: -19.4, y: 2.7, side: 1 },
  { zone: 'corrB', axis: 'z', at: -1.22, from: 7.2, to: 18.6, y: 2.15, side: 1 },
  { zone: 'corrB', axis: 'z', at: 1.22, from: 7.2, to: 18.6, y: 2.15, side: -1 },
  { zone: 'annex', axis: 'x', at: 32.72, from: -8.6, to: 8.6, y: 2.7, side: -1 },
  { zone: 'annex', axis: 'z', at: -8.72, from: 19.4, to: 32.6, y: 2.7, side: 1 },
  { zone: 'shortcut', axis: 'z', at: 3.72, from: 7.2, to: 18.6, y: 1.95, side: 1 },
  { zone: 'shortcut', axis: 'z', at: 5.72, from: 7.2, to: 18.6, y: 1.95, side: -1 },
];

/** Where the player wakes up, and which way they are facing (radians, 0 = -Z). */
export const SPAWN = { pos: [0, 0, 4.6], yaw: 0 };

/** Walking into this box ends the run. */
export const ESCAPE_TRIGGER = { x: [-2.0, 2.0], z: [-11.2, -8.6] };

/**
 * Doors. Every leaf retracts straight down into the deck: the floor planes on
 * both sides occlude it once it clears y = 0, so no pocket geometry is needed
 * and each door can use the generated model at its authored proportions.
 */
export const DOORS = [
  {
    id: 'airlock',
    kind: 'airlock',
    model: 'airlock_door',
    leaves: [{ size: [2.36, 2.72, 0.22], pos: [0, 1.36, -7], slide: [0, -2.95, 0] }],
    duration: 3.2,
  },
  {
    id: 'hatch-bay',
    kind: 'hatch',
    model: 'airlock_door',
    // `size` is in the model's own frame; rotY turns the leaf into the wall.
    leaves: [{ size: [1.96, 2.3, 0.2], rotY: Math.PI / 2, pos: [7, 1.15, 4.6], slide: [0, -2.5, 0] }],
    duration: 1.9,
  },
  {
    id: 'hatch-annex',
    kind: 'hatch',
    model: 'airlock_door',
    leaves: [{ size: [1.96, 2.3, 0.2], rotY: Math.PI / 2, pos: [19, 1.15, 4.6], slide: [0, -2.5, 0] }],
    duration: 1.9,
  },
];

/** Wall-mounted power switches. `facing` is the outward normal of the mount. */
export const SWITCHES = [
  {
    id: 'switch1',
    zone: 'hold',
    pos: [-32.72, 1.4, -3.4],
    facing: [1, 0, 0],
    label: 'Power Cell 1',
  },
  {
    id: 'switch2',
    zone: 'annex',
    pos: [32.72, 1.4, 1.6],
    facing: [-1, 0, 0],
    label: 'Power Cell 2',
  },
];

/** The 0/2 readout beside the airlock. */
export const POWER_PANEL = { pos: [2.15, 1.55, -6.74], facing: [0, 0, 1], size: [1.5, 0.95] };

const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Static prop placements: `{ model, pos:[x,y,z], rotY, scale?, collide? }`.
 * `collide` is a half-extent [hx, hz] plus height, used to build a box collider.
 */
export const PROPS = [
  // ================================================================ BAY ====
  { model: 'wall_console', pos: [-4.4, 0, -6.7], rotY: 0 },
  { model: 'pipe_cluster', pos: [-6.6, 0, -2.4], rotY: rad(90) },
  { model: 'pipe_cluster', pos: [-6.6, 0, 1.2], rotY: rad(90) },
  { model: 'pipe_cluster', pos: [6.6, 0, -3.6], rotY: rad(-90) },
  { model: 'floor_debris', pos: [-3.1, 0, 1.4], rotY: rad(24) },
  { model: 'floor_debris', pos: [2.6, 0, -2.2], rotY: rad(-70), scale: 1.2 },
  { model: 'floor_debris', pos: [4.4, 0, 3.1], rotY: rad(140) },
  { model: 'floor_debris', pos: [-5.2, 0, 5.0], rotY: rad(200), scale: 0.85 },
  { model: 'cargo_crate', pos: [-5.5, 0, 3.4], rotY: rad(12), collide: [0.45, 0.45, 0.8] },
  { model: 'canister', pos: [5.6, 0, 5.4], rotY: rad(-30), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [4.9, 0, 5.9], rotY: rad(80), collide: [0.28, 0.28, 1.2] },

  // =========================================================== CORRIDOR A ==
  { model: 'pipe_cluster', pos: [-9.4, 0, -1.15], rotY: 0 },
  { model: 'pipe_cluster', pos: [-13.2, 0, -1.15], rotY: 0 },
  { model: 'pipe_cluster', pos: [-16.6, 0, 1.15], rotY: rad(180) },
  { model: 'floor_debris', pos: [-11.4, 0, 0.5], rotY: rad(52), scale: 0.8 },
  { model: 'floor_debris', pos: [-15.1, 0, -0.4], rotY: rad(-15), scale: 0.7 },

  // ========================================================= STORAGE HOLD ==
  // Crate stacks. Switch 1 sits in the gap at z ≈ -3.4 on the west wall.
  { model: 'cargo_crate', pos: [-31.6, 0, -6.4], rotY: rad(4), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-31.6, 0.8, -6.4], rotY: rad(-9), collide: null },
  { model: 'cargo_crate', pos: [-30.7, 0, -6.2], rotY: rad(-16), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-31.5, 0, -1.5], rotY: rad(-6), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-31.5, 0.8, -1.5], rotY: rad(21), collide: null },
  { model: 'cargo_crate', pos: [-31.5, 1.6, -1.5], rotY: rad(-3), collide: null },
  { model: 'cargo_crate', pos: [-30.6, 0, -1.2], rotY: rad(30), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-27.4, 0, 6.8], rotY: rad(15), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-26.5, 0, 6.9], rotY: rad(-24), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-27.0, 0.8, 6.85], rotY: rad(6), collide: null },
  { model: 'cargo_crate', pos: [-21.4, 0, -7.3], rotY: rad(-40), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-22.3, 0, -7.5], rotY: rad(8), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [-24.8, 0, 2.6], rotY: rad(37), collide: [0.45, 0.45, 0.8] },
  { model: 'canister', pos: [-32.3, 0, -4.9], rotY: rad(0), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [-32.3, 0, -2.1], rotY: rad(45), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [-29.9, 0, 4.4], rotY: rad(20), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [-29.3, 0, 4.9], rotY: rad(-60), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [-20.6, 0, 5.2], rotY: rad(10), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [-24.2, 0, -8.3], rotY: rad(-20), collide: [0.28, 0.28, 1.2] },
  { model: 'pipe_cluster', pos: [-19.4, 0, -6.2], rotY: rad(-90) },
  { model: 'pipe_cluster', pos: [-19.4, 0, 4.8], rotY: rad(-90) },
  { model: 'pipe_cluster', pos: [-27.0, 0, -8.6], rotY: 0 },
  { model: 'wall_console', pos: [-23.0, 0, -8.7], rotY: 0 },
  { model: 'floor_debris', pos: [-25.6, 0, -2.4], rotY: rad(88) },
  { model: 'floor_debris', pos: [-28.4, 0, 1.1], rotY: rad(-33), scale: 1.15 },
  { model: 'floor_debris', pos: [-22.2, 0, 3.4], rotY: rad(160), scale: 0.9 },

  // =========================================================== CORRIDOR B ==
  // The collapsed blockage: heavy debris across the north half of the run,
  // leaving a ~0.95 m squeeze along the south wall.
  { model: 'floor_debris', pos: [12.1, 0, -0.95], rotY: rad(18), scale: 1.9 },
  { model: 'floor_debris', pos: [12.9, 0, -0.55], rotY: rad(-42), scale: 1.7 },
  { model: 'floor_debris', pos: [12.5, 0.72, -0.85], rotY: rad(70), scale: 1.5 },
  { model: 'floor_debris', pos: [12.2, 1.25, -1.0], rotY: rad(-12), scale: 1.2 },
  { model: 'cargo_crate', pos: [13.05, 0, -1.05], rotY: rad(28) },
  { model: 'cargo_crate', pos: [12.0, 0.78, -0.6], rotY: rad(-18) },
  { model: 'canister', pos: [11.6, 0, -0.9], rotY: rad(96) },
  { model: 'pipe_cluster', pos: [9.0, 0, 1.15], rotY: rad(180) },
  { model: 'pipe_cluster', pos: [16.4, 0, -1.15], rotY: 0 },
  { model: 'floor_debris', pos: [15.2, 0, 0.4], rotY: rad(-64), scale: 0.75 },
  { model: 'floor_debris', pos: [8.4, 0, -0.6], rotY: rad(120), scale: 0.7 },

  // ========================================================= ENGINE ANNEX ==
  { model: 'wall_console', pos: [32.6, 0, -1.6], rotY: rad(-90) },
  { model: 'wall_console', pos: [32.6, 0, -3.6], rotY: rad(-90) },
  { model: 'wall_console', pos: [32.6, 0, 3.9], rotY: rad(-90) },
  { model: 'wall_console', pos: [24.0, 0, -8.7], rotY: 0 },
  { model: 'wall_console', pos: [26.2, 0, -8.7], rotY: 0 },
  { model: 'pipe_cluster', pos: [21.2, 0, -8.6], rotY: 0 },
  { model: 'pipe_cluster', pos: [29.4, 0, -8.6], rotY: 0 },
  { model: 'pipe_cluster', pos: [23.4, 0, 8.6], rotY: rad(180) },
  { model: 'pipe_cluster', pos: [28.8, 0, 8.6], rotY: rad(180) },
  { model: 'pipe_cluster', pos: [19.4, 0, -5.4], rotY: rad(90) },
  { model: 'cargo_crate', pos: [22.4, 0, 5.2], rotY: rad(-14), collide: [0.45, 0.45, 0.8] },
  { model: 'cargo_crate', pos: [22.4, 0.8, 5.2], rotY: rad(22), collide: null },
  { model: 'cargo_crate', pos: [23.3, 0, 5.5], rotY: rad(41), collide: [0.45, 0.45, 0.8] },
  { model: 'canister', pos: [30.6, 0, 7.6], rotY: rad(-10), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [31.3, 0, 7.2], rotY: rad(60), collide: [0.28, 0.28, 1.2] },
  { model: 'canister', pos: [20.4, 0, 2.2], rotY: rad(30), collide: [0.28, 0.28, 1.2] },
  { model: 'floor_debris', pos: [27.0, 0, 1.2], rotY: rad(-50) },
  { model: 'floor_debris', pos: [24.6, 0, -5.0], rotY: rad(130), scale: 1.1 },
  { model: 'floor_debris', pos: [29.8, 0, -6.4], rotY: rad(15), scale: 0.85 },

  // ====================================================== SHORTCUT / EXIT ==
  { model: 'pipe_cluster', pos: [10.2, 0, 5.5], rotY: rad(180), scale: 0.85 },
  { model: 'pipe_cluster', pos: [15.6, 0, 3.7], rotY: 0, scale: 0.85 },
  { model: 'floor_debris', pos: [1.0, 0, -9.6], rotY: rad(60), scale: 0.7 },
];

/**
 * Extra colliders that are not tied to a prop — used for the corridor B
 * blockage, which must be solid as a mass rather than as individual pieces.
 */
export const BLOCKERS = [
  // Leaves a ~0.9 m gap against the south wall (clear span there is z ≤ 1.1).
  { x: [11.3, 13.6], z: [-1.4, 0.2], h: 2.1 },
];

/** Point-in-space lookup, used for footsteps, ambience and objective text. */
export function spaceAt(x, z) {
  for (const s of SPACES) {
    if (x >= s.x[0] && x <= s.x[1] && z >= s.z[0] && z <= s.z[1]) return s;
  }
  return null;
}
