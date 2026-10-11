import * as THREE from 'three';

import { SPACES, STAIRWELL, WALLS, WALL_THICKNESS } from './layout.js';
import { dressRooms } from './rooms.js';
import { tagged } from './inventory.js';
import { useModels, want } from './models.js';
import { worldUV } from './surfaces.js';

const T = WALL_THICKNESS;

/**
 * Dressing (phase 9, 9.4.4): what makes the shell a house. The entry hall is
 * dressed to the reference picture from where the player starts. Casings and
 * skirting go round every opening and wall in the house, and the rest of the
 * rooms are dressed in milestone 4.
 *
 * Everything here is built in engine from the generated surfaces, as the
 * ship's socket was (phase 2). Anything a player could walk into returns a
 * collider, and the dead-end proof sees it like any wall.
 */
export function dressHouse(mat, models = {}) {
  useModels(models);
  const group = new THREE.Group();
  group.name = 'dressing';
  const colliders = [];
  const lights = [];

  const box = (material, x0, x1, y0, y1, z0, z1, { solid = false, tile = 1 } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    worldUV(mesh, { tile });
    group.add(mesh);
    if (solid) colliders.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
    return mesh;
  };

  casings(group, mat, models);
  arches(group, mat, models);
  windows(group, mat, models);
  hall(box, group, mat, colliders, lights, models);
  const rooms = dressRooms(mat);
  group.add(rooms.group);
  colliders.push(...rooms.colliders);
  lights.push(...rooms.lights);

  return { group, colliders, lights };
}

/**
 * A frame round every door and arch, on both faces of its wall: an
 * architrave, a broad flat board with a rounded back band on its outer edge,
 * as the painting's doors have (joinery.js). It stands out from the wall, so
 * the lamp leaves a shadow line round every door.
 */
function casings(group, mat, models) {
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind === 'window') continue;
      // Blender's frame, both faces of the wall, at the opening's middle. The
      // front door has a slim stop round it, not a broad architrave: the
      // painting's door fills its frame.
      // A broad architrave is 13.5 cm wide; where a wall meets this one
      // closer to the opening than that, it would run into it, so the door
      // there has the slim stop instead (the models harness, pieces behind a
      // skin, found two that did).
      const room = roomBeside(w, o);
      // The stair door fills its wall from side to side: there is no wall
      // either side of it for a frame to stand on.
      if (room < 0.012) continue;
      const slim = o.casing === 'slim' || room < 0.15;
      // Where even the slim stop (5 cm) would run into the wall, it is made
      // as narrow as the room there allows.
      const fit = room < 0.055 ? Math.max(0.012, Math.round((room - 0.003) * 1000) / 1000) : null;
      const params = { w: o.width, h: o.height, shape: o.kind, T, ...(slim ? { profile: 'slim' } : {}), ...(fit ? { fit } : {}) };
      const pos = w.axis === 'x' ? [w.at, w.y, o.center] : [o.center, w.y, w.at];
      const piece = want(models, 'casing', params, mat, { tag: `casing:${o.id}`, pos, turn: w.axis === 'x' ? Math.PI / 2 : 0 });
      if (piece) group.add(piece);
    }
  }
}

/** The room either side of an opening along its wall, to the nearest face of a wall that meets it. */
function roomBeside(w, o) {
  const lo = o.center - o.width / 2;
  const hi = o.center + o.width / 2;
  let room = Infinity;
  for (const v of WALLS) {
    if (v.axis === w.axis || v.y !== w.y) continue;
    // A wall across this one: its line along this wall's run, and its run across this wall's line.
    if (w.at < v.from - T / 2 || w.at > v.to + T / 2) continue;
    for (const face of [v.at - T / 2, v.at + T / 2]) {
      if (face <= lo) room = Math.min(room, lo - face);
      if (face >= hi) room = Math.min(room, face - hi);
    }
  }
  return room;
}

/** Fills each arch's top corners so the opening is round, as the reference's is: Blender's, its soffit curved (models.py). */
function arches(group, mat, models) {
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind !== 'arch') continue;
      const r = o.width / 2;
      const springing = w.y + o.height - r;
      const pos = w.axis === 'z' ? [o.center, springing, w.at] : [w.at, springing, o.center];
      const fill = want(models, 'arch-fill', { r, T }, mat, { tag: `arch:${o.id}`, pos, turn: w.axis === 'z' ? 0 : Math.PI / 2 });
      if (fill) group.add(fill);
    }
  }
}

/** Rooms whose windows are left bare: a kitchen and a bathroom want the light. */
const BARE = new Set(['kitchen-window', 'bathroom-window']);

/**
 * Every window onto the night: the pane, a frame and glazing bars on the
 * inside face, a sill, and curtains. The inside is whichever side a room is on.
 */
function windows(group, mat, models) {
  for (const w of WALLS) {
    for (const o of w.openings || []) {
      if (o.kind !== 'window') continue;
      const inRoom = (sign) => {
        const x = w.axis === 'x' ? w.at + sign * 0.4 : o.center;
        const z = w.axis === 'x' ? o.center : w.at + sign * 0.4;
        return SPACES.some((s) => s.y === w.y && x > s.x[0] && x < s.x[1] && z > s.z[0] && z < s.z[1]);
      };
      const sign = inRoom(1) ? 1 : -1;
      // Blender's window stands with the room on its +z: turned to face it.
      const turn = w.axis === 'x' ? (sign * Math.PI) / 2 : sign > 0 ? 0 : Math.PI;
      const pos = w.axis === 'x' ? [w.at, w.y + o.sill, o.center] : [o.center, w.y + o.sill, w.at];
      const size = { w: o.width, h: o.height, T };
      const frame = want(models, 'window', size, mat, { tag: `window:${o.id}`, pos, turn });
      if (frame) group.add(frame);
      if (BARE.has(o.id)) continue;
      // The curtains: the hall's window has only a valance, a pale cloth hung
      // high over its top, as the painting's has; the others a valance and a
      // fall at one side, or both if the window is wide.
      const curtains = o.valance ? 'valance' : o.width > 0.9 ? 'both' : 'one';
      const cloth = want(models, 'curtains', { ...size, curtains }, mat, { tag: `curtain:${o.id}`, pos, turn });
      if (cloth) group.add(cloth);
    }
  }
}

/**
 * The hall's one lamp, a white shade on a cord over the middle of the rug.
 * Its lights are data here because the pipeline bakes the hall's walls, floor
 * and ceiling from the same lamp the game lights the furniture with.
 */
export const HALL_LAMP = {
  at: [0.36, 2.5, 1.55],
  colour: 0xe6f0c4,
  // The shade sends the light down: a cone onto the rug and the walls, and
  // only a little glow up, so the ceiling stays dark as in the reference.
  down: { intensity: 54, distance: 12, angle: 1.38, penumbra: 0.8, decay: 2, drop: 0.08 },
  glow: { intensity: 3.5, distance: 7, decay: 2, drop: 0.05 },
};

/** The little night that comes in everywhere: a cool fill in the shadows. */
export const NIGHT_FILL = { sky: 0x4a5a78, ground: 0x0a0c08, intensity: 0.32 };

/** The entry hall, to the reference. */
function hall(box, group, mat, colliders, lights, models) {
  // ---- The one lamp: Blender's enamel shade (models.py) on a cord ----
  const LAMP = HALL_LAMP.at;
  tagged(group, 'lamp', () => {
    // The shade on its flex, up to a rose on the ceiling, all Blender's.
    const shade = want(models, 'lamp', { cord: Math.round((2.8 - LAMP[1] - 0.2) * 1000) / 1000 }, mat, { tag: 'lamp', pos: LAMP });
    if (shade) group.add(shade);
    const { down: d, glow: gl, colour } = HALL_LAMP;
    const down = new THREE.SpotLight(colour, d.intensity, d.distance, d.angle, d.penumbra, d.decay);
    down.position.set(LAMP[0], LAMP[1] - d.drop, LAMP[2]);
    down.target.position.set(LAMP[0], 0, LAMP[2]);
    lights.push(down, down.target);
    const glow = new THREE.PointLight(colour, gl.intensity, gl.distance, gl.decay);
    glow.position.set(LAMP[0], LAMP[1] - gl.drop, LAMP[2]);
    lights.push(glow);
  });

  // ---- Heavy joists across the ceiling, as the painting's: Blender's, hewn,
  // their lower arrises chamfered (models.py). Short ones stop at the stair slot ----
  tagged(group, 'beams', () => {
    for (const z of [0.45, 1.05, 1.65, 2.25, 2.85, 3.45, 4.05]) {
      const long = z > STAIRWELL.z[1];
      const [x0, x1] = [-2.57, long ? 2.3 : STAIRWELL.x[0]];
      const beam = want(models, 'joist', { length: Math.round((x1 - x0) * 1000) / 1000 }, mat, { tag: 'beams', pos: [(x0 + x1) / 2, 2.8, z] });
      if (beam) group.add(beam);
    }
  });

  // ---- Skirting round the hall: a moulded board, standing off each wall ----
  // Blender's skirting runs along its +x with its face to its +z: turned so
  // its run lies along the wall and its face toward the room.
  const skirt = (from, to, out) => {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const len = Math.round(Math.hypot(dx, dz) * 1000) / 1000;
    let turn = Math.atan2(-dz, dx);
    let start = from;
    // Its face is at (sin, 0, cos) of the turn; if that is away from the room, run it from the other end.
    if (Math.sin(turn) * out[0] + Math.cos(turn) * out[2] < 0) {
      turn = Math.atan2(dz, -dx);
      start = to;
    }
    const run = want(models, 'skirting', { length: len }, mat, { tag: 'skirting', pos: start, turn });
    if (run) group.add(run);
  };
  tagged(group, 'skirting', () => {
    skirt([-2.57, 0, 0.1], [-2.57, 0, 4.5], [1, 0, 0]);
    skirt([-2.57, 0, 4.5], [2.3, 0, 4.5], [0, 0, -1]);
    skirt([2.3, 0, 1.92], [2.3, 0, 4.5], [-1, 0, 0]);
    skirt([-2.57, 0, 0.1], [-1.92, 0, 0.1], [0, 0, 1]);
    skirt([-0.8, 0, 0.1], [-0.38, 0, 0.1], [0, 0, 1]);
    skirt([0.995, 0, 0.1], [1.2, 0, 0.1], [0, 0, 1]);
  });

  // ---- The runner, from near the door to the arch ----
  tagged(group, 'rug', () => {
    // As wide as the runner the painting shows, and one repeat of its pattern
    // every 1.26 m along it: the patch it was cut from (model/hall.json).
    // Blender's, with a bound edge and a fringe (models.py).
    const [from, to] = [4.45, 0.74];
    const rug = want(models, 'rug', { w: 1.72, l: Math.round((from - to) * 1000) / 1000, hall: true }, mat, { tag: 'rug', pos: [0.3, 0, (from + to) / 2] });
    if (rug) group.add(rug);
  });

  // ---- The painting's left side, from the window toward the viewer: the
  // low cabinet with a clock and a vase on it, and nearer, a chest under a
  // white cloth. All Blender's (models.py), each with its front to the room ----
  const put = (kind, params, pos, turn = 0, tag = kind) => {
    const m = want(models, kind, params, mat, { tag, pos, turn });
    if (m) group.add(m);
    return m;
  };
  // The cabinet stands under the window, as deep as the painting shows its
  // front standing off the wall; the clock at its near end, the vase behind.
  put('cabinet', { size: [0.6, 0.65, 0.74] }, [(-2.57 - 1.92) / 2, 0, 1.2], Math.PI / 2);
  colliders.push({ minX: -2.57, maxX: -1.92, minY: 0, maxY: 0.74, minZ: 0.9, maxZ: 1.5 });
  put('clock', { radius: 0.065 }, [-2.24, 0.74, 1.4], Math.PI / 2);
  put('vase', { scale: 0.9 }, [-2.45, 0.74, 1.2]);
  // The chest stands end-on to the wall, nearer the viewer, its cloth over it.
  put('chest', {}, [-2.11, 0, 1.85]);
  colliders.push({ minX: -2.57, maxX: -1.74, minY: 0, maxY: 0.55, minZ: 1.6, maxZ: 2.1 });

  // ---- A small hard chair against the back wall, under the bag ----
  put('chair', {}, [-2.05, 0, 0.36]);
  colliders.push({ minX: -2.26, maxX: -1.84, minY: 0, maxY: 0.92, minZ: 0.15, maxZ: 0.57 });

  // ---- A picture on the right-hand wall, over the foot of the stairs ----
  {
    // Blender's frame faces its +z: turned to face the room, off the wall's face at x = 2.3.
    // Clear of the front door's frame (the models harness): the door is wider
    // than the painting draws it, so a player fits, and the picture hung where
    // the painting has it overlapped the door's frame. Off the wall's skin.
    const frame = want(models, 'picture', { w: 0.24, h: 0.6, frame: 0.05 }, mat, { tag: 'picture', pos: [2.282, 1.98, 0.74], turn: -Math.PI / 2 });
    if (frame) group.add(frame);
  }

  // ---- The woven bag on its crossed straps, hung on the back wall; a bell
  // push by the parlour door; and a rag dropped on the floor by the arch ----
  // As big as the painting shows it on the back wall: 0.43 m across, a metre with its loop.
  put('bag', { tall: 1.4 }, [-2.29, 1.45, 0.1 + 0.075]);
  put('fixture', { scale: 2.4 }, [-0.55, 1.45, 0.1], 0, 'wall-fixture');
  put('rag', {}, [0.87, 0, 0.38], 0.6, 'floor-thing');
}
