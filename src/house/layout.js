/**
 * The house — level layout (phase 9, 9.3).
 *
 * Pure data, the same contract as the ship's layout.js: geometry, colliders,
 * floors and lighting are derived from these tables, so the house is reshaped
 * here and nowhere else.
 *
 * Units are metres. +X is east, -Z is north (into the house). The front door
 * is on the south face at z = +5, and the player starts inside it looking in.
 *
 *   GROUND (y = 0)                      UPPER (y = 3.0)
 *   ┌────────┬────────┬────────┐  z=-4  ┌────────┬────────┬────────┐
 *   │ DINING │  BACK  │KITCHEN │        │ CHILD'S│        │BATHROOM│
 *   │        │PASSAGE │        │        │  ROOM  │        │        │
 *   ├────────┼──arch──┼────────┤  z=-1  │        │LANDING ├────────┤ z=1
 *   │PARLOUR │ ENTRY  ║ STUDY  │        ├────────┤        │ (shut) │
 *   │        │  HALL  ║(locked)│        │BEDROOM │    ║   │        │
 *   └────────┴──door──┴────────┘  z=+5  └────────┴────────┴────────┘
 *    x=-6    x=-2    x=2     x=6               ║ = the stairs
 *
 * The stairs climb the hall's east wall from the front toward the back, from
 * the hall floor at z = 4.6 to the landing at z = 0.4.
 */

export const WALL_THICKNESS = 0.2;

/** Floor levels. The upper floor's slab is 0.2 m thick under it. */
export const GROUND = 0;
export const UPPER = 3.0;

/**
 * How high a floor may be above the feet and still be stepped onto. Stairs
 * are a ramp, so this only ever has to cover the change over one frame's
 * stride, plus the lip at the top and bottom.
 */
export const STEP_UP = 0.45;

export const SPACES = [
  // ---- Ground ----
  { id: 'hall', name: 'Entry Hall', floor: 0, x: [-2, 2], z: [-1, 5], y: GROUND, h: 2.8 },
  { id: 'parlour', name: 'Parlour', floor: 0, x: [-6, -2], z: [1, 5], y: GROUND, h: 2.8 },
  { id: 'study', name: 'Study', floor: 0, x: [2, 6], z: [1, 5], y: GROUND, h: 2.8 },
  { id: 'dining', name: 'Dining Room', floor: 0, x: [-6, -2], z: [-4, 1], y: GROUND, h: 2.8 },
  { id: 'passage', name: 'Back Passage', floor: 0, x: [-2, 2], z: [-4, -1], y: GROUND, h: 2.8 },
  { id: 'kitchen', name: 'Kitchen', floor: 0, x: [2, 6], z: [-4, 1], y: GROUND, h: 2.8 },
  // ---- Upper ----
  { id: 'landing', name: 'Landing', floor: 1, x: [-2, 2], z: [-4, 5], y: UPPER, h: 2.6 },
  { id: 'bedroom', name: 'Bedroom', floor: 1, x: [-6, -2], z: [1, 5], y: UPPER, h: 2.6 },
  { id: 'child', name: "Child's Room", floor: 1, x: [-6, -2], z: [-4, 1], y: UPPER, h: 2.6 },
  { id: 'bathroom', name: 'Bathroom', floor: 1, x: [2, 6], z: [-4, 1], y: UPPER, h: 2.6 },
];

/**
 * The stairs: a ramp of floor, rising along -Z. Climbed, never jumped — there
 * is no jump — and the only way between the floors.
 */
export const STAIRS = { x: [0.85, 1.95], z: [0.4, 4.6], bottom: GROUND, top: UPPER };

/**
 * The hole in the upper floor the stairs come up through. No landing floor
 * here, and the banister keeps anyone on the landing from walking into it.
 */
export const STAIRWELL = { x: [0.8, 2], z: [0.4, 5] };

/**
 * Wall lines, per floor. `axis: 'x'` is a wall at constant x running in z from
 * `from` to `to`; `axis: 'z'` runs in x. `y` is the floor it stands on and `h`
 * its height. Openings are cut out and capped above. `kind` names what fills
 * the opening in a later milestone; in greybox every opening is open.
 */
export const WALLS = [
  // ===== Ground floor =====
  // Outer shell
  { y: GROUND, h: 2.8, axis: 'z', at: 5, from: -6, to: 6, openings: [{ center: 0, width: 1.1, height: 2.2, id: 'front-door', kind: 'door' }] },
  { y: GROUND, h: 2.8, axis: 'z', at: -4, from: -6, to: 6, openings: [] },
  { y: GROUND, h: 2.8, axis: 'x', at: -6, from: -4, to: 5, openings: [] },
  { y: GROUND, h: 2.8, axis: 'x', at: 6, from: -4, to: 5, openings: [] },
  // Hall west (parlour), hall east (study, behind the stairs: solid)
  { y: GROUND, h: 2.8, axis: 'x', at: -2, from: -1, to: 5, openings: [{ center: 3, width: 1.0, height: 2.15, id: 'parlour-door', kind: 'door' }] },
  { y: GROUND, h: 2.8, axis: 'x', at: 2, from: -1, to: 5, openings: [] },
  // Hall to back passage: the arch
  { y: GROUND, h: 2.8, axis: 'z', at: -1, from: -2, to: 2, openings: [{ center: -0.45, width: 1.5, height: 2.35, id: 'arch', kind: 'arch' }] },
  // Parlour / dining, and study / kitchen
  { y: GROUND, h: 2.8, axis: 'z', at: 1, from: -6, to: -2, openings: [] },
  { y: GROUND, h: 2.8, axis: 'z', at: 1, from: 2, to: 6, openings: [{ center: 4, width: 1.0, height: 2.15, id: 'study-door', kind: 'door' }] },
  // Back passage to dining and kitchen
  { y: GROUND, h: 2.8, axis: 'x', at: -2, from: -4, to: -1, openings: [{ center: -2.5, width: 1.0, height: 2.15, id: 'dining-door', kind: 'door' }] },
  { y: GROUND, h: 2.8, axis: 'x', at: 2, from: -4, to: -1, openings: [{ center: -2.5, width: 1.0, height: 2.15, id: 'kitchen-door', kind: 'door' }] },

  // ===== Upper floor =====
  { y: UPPER, h: 2.6, axis: 'z', at: 5, from: -6, to: 6, openings: [] },
  { y: UPPER, h: 2.6, axis: 'z', at: -4, from: -6, to: 6, openings: [] },
  { y: UPPER, h: 2.6, axis: 'x', at: -6, from: -4, to: 5, openings: [] },
  { y: UPPER, h: 2.6, axis: 'x', at: 6, from: -4, to: 5, openings: [] },
  { y: UPPER, h: 2.6, axis: 'x', at: -2, from: -4, to: 5, openings: [
    { center: 3, width: 1.0, height: 2.1, id: 'bedroom-door', kind: 'door' },
    { center: -1.5, width: 1.0, height: 2.1, id: 'child-door', kind: 'door' },
  ] },
  { y: UPPER, h: 2.6, axis: 'x', at: 2, from: -4, to: 5, openings: [{ center: -1.5, width: 1.0, height: 2.1, id: 'bathroom-door', kind: 'door' }] },
  { y: UPPER, h: 2.6, axis: 'z', at: 1, from: -6, to: -2, openings: [] },
  { y: UPPER, h: 2.6, axis: 'z', at: 1, from: 2, to: 6, openings: [] },
];

/**
 * Solid things that are not walls: the banister, and the stairs' own side.
 * Boxes, in metres, with a floor and a ceiling each.
 */
export const BLOCKERS = [
  // The banister and the panelled side of the stairs, along their open west
  // side, from where the treads are knee-high to the top, and on up past the
  // landing's floor so nobody on the landing walks into the stairwell.
  { x: [0.75, 0.85], z: [0.4, 3.9], y: [0, UPPER + 1.0] },
  // The banister carries on along the landing above the bottom of the stairs.
  { x: [0.75, 0.85], z: [3.9, 5], y: [UPPER, UPPER + 1.0] },
];

/** Where the player starts: just inside the front door, facing in. */
export const SPAWN = { pos: [0, GROUND, 4.2], yaw: 0 };

/**
 * The floor under (x, z), for a player whose feet are at `y`: the highest
 * floor that is at or below a step's height above them. Rooms are flat, the
 * stairs are a ramp, and the landing has a hole where the stairs come up. A
 * point with no floor at all (outside the house) returns null.
 */
export function floorAt(x, z, y = GROUND) {
  let best = null;
  const consider = (h) => {
    if (h <= y + STEP_UP && (best === null || h > best)) best = h;
  };
  for (const s of SPACES) {
    if (x < s.x[0] || x > s.x[1] || z < s.z[0] || z > s.z[1]) continue;
    if (s.floor === 1 && inside(STAIRWELL, x, z)) continue;
    consider(s.y);
  }
  if (inside(STAIRS, x, z)) consider(stairHeight(z));
  return best;
}

/** The stairs' surface at depth z. */
export function stairHeight(z) {
  const t = (STAIRS.z[1] - z) / (STAIRS.z[1] - STAIRS.z[0]);
  return STAIRS.bottom + Math.min(1, Math.max(0, t)) * (STAIRS.top - STAIRS.bottom);
}

/** The space at a point on a given floor, or null. */
export function spaceAt(x, z, y = GROUND) {
  const level = y >= UPPER - STEP_UP ? 1 : 0;
  return SPACES.find((s) => s.floor === level && x >= s.x[0] && x <= s.x[1] && z >= s.z[0] && z <= s.z[1]) || null;
}

function inside(r, x, z) {
  return x >= r.x[0] && x <= r.x[1] && z >= r.z[0] && z <= r.z[1];
}

export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.72;
export const PLAYER_EYE = 1.62;
