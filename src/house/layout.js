/**
 * The house — level layout (phase 9, 9.3).
 *
 * Pure data, the same contract as the ship's layout.js: geometry, colliders,
 * floors and lighting are derived from these tables, so the house is reshaped
 * here and nowhere else.
 *
 * Units are metres. +X is east, -Z is north (into the house).
 *
 * The entry hall is the reference picture, laid out to be seen from where the
 * player starts: at the hall's south end, looking north. In front of them,
 * the hall's back wall has a panelled door on the left and an arch in the
 * middle onto a passage. The stairs climb away up the right-hand side, into a
 * slot in the ceiling. The front door, with its small panes, is in the right
 * wall near the player; a curtained window is in the left wall. The hall is
 * the front of the house and stands out from it, so both its side walls are
 * outside walls, and the rest of the house is behind it.
 *
 *   GROUND (y = 0)                                 UPPER (y = 3.0)
 *   x=-6.4      -0.7  1.1          6.4      z      x=-6.4      -0.9     2.4   6.4
 *   ┌───────────┬─────┬──────────────┐  -6        ┌───────────┬────────┬─────┐
 *   │  DINING   │BACK │   KITCHEN    │            │  CHILD'S  │        │BATH │
 *   │ (locked)  │PASS-│              │            │   ROOM    │LANDING │     │
 *   ├───────────┤ AGE ├────door──────┤  -3        ├───────────┤        ├─────┤
 *   │  PARLOUR  │     │    STUDY     │            │  BEDROOM  │        │     │
 *   │           │     │   (locked)   │            │           │        │     │
 *   └──┬─door───┴arch─┴──┬───────────┘   0        └───────────┴──door──┴─────┘
 *      │    ENTRY HALL ║ │                                       ║ stairhead
 *      │ window        ║ │                                       ║
 *      │      stairs → ║ door (front)                            ║ (stairs)
 *      └───────────────┘    4.6
 *       x=-2.67       2.4
 *
 * The hall is laid to the owner's painting, from where it was painted (the
 * spawn, and PAINTING below): its doors, arch, window, stairs and furniture
 * stand where the painting shows them. The passage's west wall stands at
 * x = -0.7 downstairs, east of the one above it, so the parlour door, where
 * the painting has it, swings clear of it.
 *
 * The stairs climb the hall's east side from z = 1.15, through the line of
 * the back wall and on up to the stairhead at z = -2.3, where the door the
 * clock unlatches waits in the landing's south wall. A gallery beside the
 * stairwell, over the back passage, leads to the bedroom.
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
  { id: 'hall', name: 'Entry Hall', floor: 0, x: [-2.67, 2.4], z: [0, 4.6], y: GROUND, h: 2.8 },
  { id: 'parlour', name: 'Parlour', floor: 0, x: [-6.4, -0.7], z: [-3, 0], y: GROUND, h: 2.8 },
  { id: 'passage', name: 'Back Passage', floor: 0, x: [-0.7, 1.1], z: [-6, 0], y: GROUND, h: 2.8 },
  { id: 'study', name: 'Study', floor: 0, x: [2.4, 6.4], z: [-3, 0], y: GROUND, h: 2.8 },
  { id: 'dining', name: 'Dining Room', floor: 0, x: [-6.4, -0.7], z: [-6, -3], y: GROUND, h: 2.8 },
  { id: 'kitchen', name: 'Kitchen', surface: 'tile', floor: 0, x: [1.1, 6.4], z: [-6, -3], y: GROUND, h: 2.8 },
  // ---- Upper ----
  { id: 'stairhead', name: 'Stairhead', floor: 1, x: [1.2, 2.4], z: [-2.9, -2.3], y: UPPER, h: 2.6 },
  { id: 'landing', name: 'Landing', floor: 1, x: [-0.9, 2.4], z: [-6, -2.9], y: UPPER, h: 2.6 },
  // The landing runs on south as a gallery beside the stairwell, over the
  // back passage, to the bedroom's door.
  { id: 'gallery', name: 'Gallery', floor: 1, x: [-0.9, 1.2], z: [-2.9, 0], y: UPPER, h: 2.6 },
  { id: 'bedroom', name: 'Bedroom', floor: 1, x: [-6.4, -0.9], z: [-3, 0], y: UPPER, h: 2.6 },
  { id: 'child', name: "Child's Room", floor: 1, x: [-6.4, -0.9], z: [-6, -3], y: UPPER, h: 2.6 },
  { id: 'bathroom', name: 'Bathroom', surface: 'tile', floor: 1, x: [2.4, 6.4], z: [-6, -2.9], y: UPPER, h: 2.6 },
];

/**
 * The stairs: a ramp of floor, rising along -Z, from the hall up through the
 * back wall's line to the stairhead. Climbed, never jumped — there is no jump
 * — and the only way between the floors.
 */
export const STAIRS = { x: [1.3, 2.3], z: [-2.3, 1.15], bottom: GROUND, top: UPPER };

/**
 * The slot the flight climbs through: a hole in the hall's ceiling, walled up
 * to the upper floor's ceiling, running back past the hall to the stairhead.
 * Its walls are colliders above the hall's ceiling, so nobody on the upper
 * part of the flight or the stairhead steps off it to either side.
 */
export const STAIRWELL = { x: [1.25, 2.4], z: [-2.9, 1.15] };

/**
 * Wall lines, per floor. `axis: 'x'` is a wall at constant x running in z from
 * `from` to `to`; `axis: 'z'` runs in x. `y` is the floor it stands on and `h`
 * its height. Openings are cut out and capped above; `kind` says what fills
 * one. A `window` is cut from the wall's look only, never from its collider.
 */
export const WALLS = [
  // ===== Ground floor =====
  // The hall's back wall, which runs on as the front of the house, broken
  // where the stairs pass through it.
  { y: GROUND, h: 2.8, axis: 'z', at: 0, from: -6.4, to: 1.25, openings: [
    { center: -1.36, width: 1.09, height: 2.42, id: 'parlour-door', kind: 'door' },
    { center: 0.3, width: 1.12, height: 2.45, id: 'arch', kind: 'arch' },
    { center: -4.4, width: 1.0, height: 1.4, sill: 0.9, id: 'parlour-window', kind: 'window' },
  ] },
  { y: GROUND, h: 2.8, axis: 'z', at: 0, from: 2.4, to: 6.4, openings: [{ center: 3.2, width: 0.9, height: 1.4, sill: 0.9, id: 'study-window', kind: 'window' }] },
  { y: GROUND, h: 2.8, axis: 'z', at: 4.6, from: -2.67, to: 2.4, openings: [] },
  { y: GROUND, h: 2.8, axis: 'x', at: -2.67, from: 0, to: 4.6, openings: [
    { center: 0.67, width: 0.62, height: 1.0, sill: 0.8, id: 'hall-window', kind: 'window' },
  ] },
  { y: GROUND, h: 2.8, axis: 'x', at: 2.4, from: 0, to: 4.6, openings: [
    { center: 1.59, width: 0.88, height: 2.38, id: 'front-door', kind: 'door' },
  ] },
  { y: GROUND, h: 2.8, axis: 'x', at: 2.4, from: -3, to: 0, openings: [] },
  // The back of the house
  { y: GROUND, h: 2.8, axis: 'z', at: -6, from: -6.4, to: 6.4, openings: [{ center: 5.2, width: 0.9, height: 1.0, sill: 1.15, id: 'kitchen-window', kind: 'window' }] },
  { y: GROUND, h: 2.8, axis: 'x', at: -6.4, from: -6, to: 0, openings: [{ center: -4.3, width: 0.9, height: 1.1, sill: 1.15, id: 'dining-window', kind: 'window' }] },
  { y: GROUND, h: 2.8, axis: 'x', at: 6.4, from: -6, to: 0, openings: [] },
  { y: GROUND, h: 2.8, axis: 'z', at: -3, from: -6.4, to: -0.7, openings: [] },
  { y: GROUND, h: 2.8, axis: 'z', at: -3, from: 1.1, to: 6.4, openings: [{ center: 4, width: 1.0, height: 2.15, id: 'study-door', kind: 'door' }] },
  { y: GROUND, h: 2.8, axis: 'x', at: -0.7, from: -6, to: 0, openings: [{ center: -4.5, width: 1.0, height: 2.15, id: 'dining-door', kind: 'door' }] },
  { y: GROUND, h: 2.8, axis: 'x', at: 1.1, from: -6, to: 0, openings: [{ center: -4.5, width: 1.0, height: 2.15, id: 'kitchen-door', kind: 'door' }] },

  // ===== Upper floor =====
  { y: UPPER, h: 2.6, axis: 'z', at: 0, from: -6.4, to: 1.2, openings: [] },
  // At the head of the stairs, the door the clock holds, onto the landing.
  { y: UPPER, h: 2.6, axis: 'z', at: -2.9, from: 1.2, to: 2.4, openings: [{ center: 1.8, width: 1.0, height: 2.1, id: 'stair-door', kind: 'door' }] },
  { y: UPPER, h: 2.6, axis: 'z', at: -6, from: -6.4, to: 6.4, openings: [
    { center: -3.0, width: 0.9, height: 1.2, sill: 0.9, id: 'child-window', kind: 'window' },
    { center: 4.6, width: 0.9, height: 0.9, sill: 1.15, id: 'bathroom-window', kind: 'window' },
  ] },
  { y: UPPER, h: 2.6, axis: 'x', at: -6.4, from: -6, to: 0, openings: [{ center: -2.45, width: 0.8, height: 1.2, sill: 1.0, id: 'bedroom-window', kind: 'window' }] },
  { y: UPPER, h: 2.6, axis: 'x', at: 6.4, from: -6, to: -2.9, openings: [] },
  { y: UPPER, h: 2.6, axis: 'x', at: -0.9, from: -6, to: 0, openings: [
    { center: -1.5, width: 1.0, height: 2.1, id: 'bedroom-door', kind: 'door' },
    { center: -4.5, width: 1.0, height: 2.1, id: 'child-door', kind: 'door' },
  ] },
  { y: UPPER, h: 2.6, axis: 'x', at: 2.4, from: -6, to: -2.9, openings: [{ center: -4.5, width: 1.0, height: 2.1, id: 'bathroom-door', kind: 'door' }] },
  { y: UPPER, h: 2.6, axis: 'z', at: -3, from: -6.4, to: -0.9, openings: [] },
  { y: UPPER, h: 2.6, axis: 'z', at: -2.9, from: 2.4, to: 6.4, openings: [] },
];

/**
 * Solid things that are not walls. Boxes, in metres, with a floor and a
 * ceiling each.
 */
export const BLOCKERS = [
  // The banister, down the flight's open west side from the stairhead to the
  // newel post at its foot, as in the reference: the stairs are climbed from
  // the front. Tall, so nobody steps off the stairs into the hall, and down to
  // the floor, so nobody walks in under the flight. What is drawn is a rail on
  // balusters (level.js), not this box.
  { x: [1.15, 1.25], z: [-2.9, 1.1], y: [0, UPPER + 1.0] },
];

/**
 * Where the player starts: where the owner's painting was painted from, eye
 * and all. Looking in and a little down, as the painting does: its horizon is
 * high in the frame. `PAINTING` is that camera, which projects the painting
 * onto the hall (src/house/projection.js).
 */
export const SPAWN = { pos: [0.33, GROUND, 3.54], yaw: -0.032, pitch: -0.31 };
/**
 * The painting's camera: the player's eye at the spawn, level, with an 80°
 * field of view, and its lens shifted so the axis (where straight ahead
 * lands) is at `axis` in the frame, as fractions across and down. The
 * painting keeps its verticals upright, which a level camera does and a
 * tilted one does not; the spawn's pitch is that shift, as near as a turn of
 * the head can make it.
 */
export const PAINTING = { pos: [0.33, 1.62, 3.54], yaw: 0, fov: 80, axis: [655 / 1344, 276 / 896], size: [1344, 896] };

/**
 * The floor under (x, z), for a player whose feet are at `y`: the highest
 * floor that is at or below a step's height above them. Rooms are flat and
 * the stairs are a ramp. A point with no floor at all (outside the house)
 * returns null.
 */
export function floorAt(x, z, y = GROUND) {
  let best = null;
  const consider = (h) => {
    if (h <= y + STEP_UP && (best === null || h > best)) best = h;
  };
  for (const s of SPACES) {
    if (x < s.x[0] || x > s.x[1] || z < s.z[0] || z > s.z[1]) continue;
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
  { id: 'front-door', hinge: -1, swing: 1, lock: ['front-key'], panes: [2, 3] },
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
 * item goes on the ring. `at` is the centre of the part that opens, on the
 * front face; `face` is the way it faces, as a yaw (0 faces +z). Each is a
 * piece of furniture standing in its room with its back to the wall.
 */
export const CONTAINERS = [
  { id: 'kitchen-drawer', name: 'Drawer', kind: 'chest', at: [5.85, 0.74, -4.5], face: -Math.PI / 2, holds: 'dining-key' },
  { id: 'bedroom-drawer', name: 'Drawer', kind: 'chest', at: [-3.0, UPPER + 0.74, -0.55], face: Math.PI, holds: 'study-key' },
  { id: 'child-box', name: 'Box', kind: 'box', at: [-4.6, UPPER + 0.45, -5.5], face: 0, holds: 'tin-key' },
  { id: 'study-desk', name: 'Desk Drawer', kind: 'desk', at: [4.6, 0.59, -0.7], face: Math.PI, holds: 'front-key' },
];

/**
 * The dining-room clock. It stopped at `stopped`, and turning the hands moves
 * it an hour. When it reads `hour` it unlatches the door at the head of the
 * stairs, and that stays unlatched whatever the clock does after.
 */
export const CLOCK = { at: [-3.6, 1.7, -5.85], face: 0, stopped: 7, hour: 3, opens: 'stair-door' };

/**
 * Notes, as placeholders. The text is written in milestone 5 and shown to the
 * owner before it is placed; these say only what the loop needs a note to
 * say, so the loop can be played and proved now.
 */
export const NOTES = [
  // Pinned to the hall's right-hand wall beside the front door, as in the reference.
  { id: 'notice', at: [2.28, 1.6, 2.3], face: -Math.PI / 2, title: 'NOTICE', text: '[Placeholder] A notice pinned by the door. Why someone left.' },
  { id: 'hour', at: [-3.6, 0.78, -2.6], face: 0, flat: true, title: 'A NOTE', text: '[Placeholder] Every clock in the house stopped at three.' },
  { id: 'bath-note', at: [6.28, UPPER + 1.5, -4.5], face: -Math.PI / 2, title: 'A NOTE', text: '[Placeholder] Written on the mirror, or near it.' },
  { id: 'study-note', at: [2.97, 0.78, -1.2], face: 0, flat: true, title: 'A NOTE', text: '[Placeholder] The last of the story, in the study.' },
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

/**
 * The way out: through the front door in the hall's east wall. `inside` and
 * `outside` are standing places either side of it, for the harnesses, and
 * `past` is the line beyond which the run is over. It is only a line beside the
 * hall, on the ground floor: the kitchen, the study and the
 * bathroom run east of it too, and are inside.
 */
export const EXIT = { door: 'front-door', inside: [1.75, 0, 1.59], outside: [3.6, 0, 1.59], past: 2.95 };
export const isOut = (p) => p.x > EXIT.past && p.z > 0 && p.y < 1;

/** The opening a door fills, from WALLS. */
export function openingFor(id) {
  for (const w of WALLS) {
    for (const o of w.openings || []) if (o.id === id) return { wall: w, opening: o };
  }
  return null;
}
