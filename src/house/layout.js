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
  // The head of the stairs: a short partition across the top of the flight,
  // from the banister to the hall's east wall, with a door in it. The stairs
  // below are open; this door is what the clock unlatches (9.3, step 3).
  { y: UPPER, h: 2.6, axis: 'z', at: 0.3, from: 0.75, to: 1.9, openings: [{ center: 1.38, width: 1.0, height: 2.1, id: 'stair-door', kind: 'door' }] },
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

/**
 * The player's body is the one the movement code has: the ship's. The house
 * once kept its own radius of 0.30 m here while the player moved at 0.34 m,
 * so every proof in tools/house/ proved a thinner player than the one that
 * plays, and the gap let the owner past the gate at the top of the stairs.
 */
export { PLAYER_RADIUS, PLAYER_HEIGHT, PLAYER_EYE } from '../game/layout.js';

// =============================================================================
// Milestone 2 — the loop as data (9.3, 9.4.2)
// =============================================================================

/**
 * What the key ring can hold. Names are placeholders until the story is
 * written (milestone 5); the ids are what the tables below refer to.
 */
export const ITEMS = {
  'dining-key': { name: 'DINING KEY' },
  'study-key': { name: 'STUDY KEY' },
  'tin-key': { name: 'TIN KEY' },
  'front-key': { name: 'FRONT KEY' },
};

/** The ring never holds more than this (9.5). */
export const RING_SIZE = 4;

/**
 * Doors, one per door opening in WALLS. Each hangs on a hinge at one end of
 * its opening and swings through a quarter turn to one side of its wall:
 *
 *   hinge  -1 or +1 — which end of the opening, along the wall's run
 *   swing  -1 or +1 — which side it opens to, along the wall's normal (+x for
 *          a wall at constant x, +z for one at constant z)
 *   lock   the items it takes to open, all at once. They come off the ring
 *          when the door opens: a key is used at its door and is then spent.
 *
 * A door opens and stays open. Closing one is the house's to do (9.4.3), not
 * the player's, and arrives with the dread in milestone 6.
 */
export const DOORS = [
  { id: 'front-door', hinge: -1, swing: 1, lock: ['front-key'] },
  { id: 'parlour-door', hinge: 1, swing: -1 },
  { id: 'dining-door', hinge: -1, swing: -1, lock: ['dining-key'] },
  { id: 'kitchen-door', hinge: -1, swing: 1 },
  { id: 'study-door', hinge: 1, swing: 1, lock: ['study-key', 'tin-key'] },
  { id: 'bedroom-door', hinge: 1, swing: -1 },
  { id: 'child-door', hinge: -1, swing: -1 },
  { id: 'bathroom-door', hinge: -1, swing: 1 },
  // No key: the clock holds it. Opens away from the stairs, onto the landing.
  { id: 'stair-door', hinge: 1, swing: -1, heldBy: 'clock' },
];

/**
 * Things that hold an item: a drawer, a box, a desk. Opened once, and the
 * item goes on the ring. `at` is the front face's centre; `face` is the way
 * it faces, as a yaw (0 faces +z).
 */
export const CONTAINERS = [
  { id: 'kitchen-drawer', name: 'Drawer', at: [5.65, 0.8, -2.6], face: -Math.PI / 2, holds: 'dining-key' },
  { id: 'bedroom-drawer', name: 'Drawer', at: [-5.65, UPPER + 0.8, 3.6], face: Math.PI / 2, holds: 'study-key' },
  { id: 'child-box', name: 'Box', at: [-4.6, UPPER + 0.6, -3.65], face: 0, holds: 'tin-key' },
  { id: 'study-desk', name: 'Desk Drawer', at: [3.4, 0.8, 4.65], face: Math.PI, holds: 'front-key' },
];

/**
 * The dining-room clock. It stopped at `stopped`, and turning the hands moves
 * it an hour. When it reads `hour` it unlatches the door at the head of the
 * stairs, and that stays unlatched whatever the clock does after.
 */
export const CLOCK = { at: [-4, 1.7, -3.85], face: 0, stopped: 7, hour: 3, opens: 'stair-door' };

/**
 * Notes, as placeholders. The text is written in milestone 5 and shown to the
 * owner before it is placed; these say only what the loop needs a note to
 * say, so the loop can be played and proved now.
 */
export const NOTES = [
  { id: 'notice', at: [-1.88, 1.5, 4.2], face: Math.PI / 2, title: 'NOTICE', text: '[Placeholder] A notice pinned by the door. Why someone left.' },
  { id: 'hour', at: [-4, 0.78, 3.2], face: 0, flat: true, title: 'A NOTE', text: '[Placeholder] Every clock in the house stopped at three.' },
  { id: 'bath-note', at: [5.88, UPPER + 1.5, -1.5], face: -Math.PI / 2, title: 'A NOTE', text: '[Placeholder] Written on the mirror, or near it.' },
  { id: 'study-note', at: [4.6, 0.78, 4.4], face: 0, flat: true, title: 'A NOTE', text: '[Placeholder] The last of the story, in the study.' },
];

/**
 * The loop (9.3). Each row is one step the player has to take, names the
 * thing that takes it, and names the steps it `needs` first. Most of it is a
 * line; upstairs it forks, because the study key and the tin key can be found
 * in either order, and joins again at the study door. The chain harness proves
 * no step can be done before everything it needs, and that doing them all
 * reaches the door out. The house reads the same table.
 */
export const LOOP = [
  { id: 'dining-key', step: 'take the dining key', container: 'kitchen-drawer', needs: [] },
  { id: 'dining', step: 'open the dining room', door: 'dining-door', needs: ['dining-key'] },
  { id: 'clock', step: 'set the clock', clock: true, needs: ['dining'] },
  { id: 'study-key', step: 'take the study key', container: 'bedroom-drawer', needs: ['clock'] },
  { id: 'tin-key', step: 'take the tin key', container: 'child-box', needs: ['clock'] },
  { id: 'study', step: 'open the study', door: 'study-door', needs: ['study-key', 'tin-key'] },
  { id: 'front-key', step: 'take the front key', container: 'study-desk', needs: ['study'] },
  { id: 'out', step: 'open the front door', door: 'front-door', needs: ['front-key'] },
];

/** Past this line, out of the front door, the run is over. */
export const OUT_Z = 5.6;

/** The opening a door fills, from WALLS. */
export function openingFor(id) {
  for (const w of WALLS) {
    for (const o of w.openings || []) if (o.id === id) return { wall: w, opening: o };
  }
  return null;
}
