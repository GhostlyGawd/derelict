import * as THREE from 'three';

import { chest, piece, place, table } from './furniture.js';
import { panelDoor } from './joinery.js';
import { useModels, want } from './models.js';
import { CLOCK, CONTAINERS, DOORS, GROUND, ITEMS, NOTES, UPPER, WALL_THICKNESS, openingFor } from './layout.js';

/**
 * The house's interactives in greybox (phase 9, milestone 2): doors on hinges,
 * drawers and boxes that hold an item, the dining-room clock, the door it
 * opens, and the notes. Built from layout.js the way the shell is, flat
 * colours only. Each is an interact target in the ship's sense — `meshes`,
 * `point`, `prompt`, `canUse()`, `highlight()` — so the ship's Interactor
 * picks them without knowing it is in a house.
 *
 * State changes on the press and the motion follows (4.3.3): a door is open,
 * and its collider has moved, on the frame it is pressed, and the leaf then
 * swings to catch up.
 */

const LEAF = 0.05;
const SWING_TIME = 0.6;
const LIT = 1.9;

function tint(meshes) {
  const base = meshes.map((m) => m.material.color.clone());
  return (on) => meshes.forEach((m, i) => m.material.color.copy(base[i]).multiplyScalar(on ? LIT : 1));
}

/** The wall's run direction and normal, as unit vectors in x and z. */
/** Every mesh under an object. */
function collect(obj) {
  const out = [];
  obj.traverse((o) => o.isMesh && out.push(o));
  return out;
}

function frame(wall) {
  return wall.axis === 'x' ? { u: [0, 1], n: [1, 0] } : { u: [1, 0], n: [0, 1] };
}

function makeDoor(def, group, mat, models = {}) {
  const { wall, opening } = openingFor(def.id);
  const { u, n } = frame(wall);
  const w = opening.width - 0.02;
  const h = opening.height - 0.01;
  // The hinge, on the wall's centre line at one end of the opening.
  const along = opening.center + def.hinge * (opening.width / 2 - 0.01);
  const hx = wall.axis === 'x' ? wall.at : along;
  const hz = wall.axis === 'x' ? along : wall.at;

  const pivot = new THREE.Group();
  pivot.position.set(hx, wall.y, hz);
  pivot.userData.inventory = `door:${def.id}`;
  group.add(pivot);
  const material = mat ? mat.door.clone() : new THREE.MeshLambertMaterial({ color: def.lock ? 0x5a3a28 : 0x6a5038 });
  // The leaf's own frame: it runs along local -hinge·x from the pivot, so the
  // closed door spans the opening when the pivot is turned to the wall. It is
  // a panelled door, as the painting's are (joinery.js): two tall fielded
  // panels, or for the front door upright boards below and glass above.
  // Blender's leaf, modelled at this opening's size, where there is one
  // (pipeline/house/blender/models.py); the code's panelled leaf where not.
  // Its knob on the side away from the hinge, in the model.
  const modelled = mat && want(models, 'door', { w: Math.round(w * 1000) / 1000, h: Math.round(h * 1000) / 1000, glazed: !!def.panes, knob: -def.hinge }, { ...mat, door: material }, { tag: `door:${def.id}` });
  const leaf = modelled
    ? modelled
    : mat
    ? panelDoor(material, {
        w,
        h,
        t: LEAF,
        night: mat.night,
        rows: def.panes ? [{ f: 0.52, boards: true }, { f: 0.48, glass: true }] : [{ f: 0.44 }, { f: 0.56 }],
        panes: def.panes ? [2, 2] : undefined,
      })
    : new THREE.Mesh(new THREE.BoxGeometry(w, h, LEAF), material);
  if (mat) leaf.position.set(-def.hinge * (w / 2), 0, 0);
  else leaf.position.set(-def.hinge * (w / 2), h / 2, 0);
  pivot.add(leaf);
  const leafMeshes = [];
  leaf.traverse((o) => o.isMesh && o.material === material && leafMeshes.push(o));
  // A brass knob on a round rose, both faces.
  const brass = new THREE.MeshLambertMaterial({ color: 0xb09a60 });
  const knob = new THREE.Group();
  for (const s of [-1, 1]) {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 12), brass);
    rose.rotation.x = Math.PI / 2;
    rose.position.z = s * (LEAF / 2 + 0.004);
    knob.add(rose);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), brass);
    ball.position.z = s * (LEAF / 2 + 0.05);
    knob.add(ball);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.045, 8), brass);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = s * (LEAF / 2 + 0.025);
    knob.add(neck);
  }
  knob.position.set(-def.hinge * (w - 0.075), 1.0, 0);
  // Blender's leaf carries its own knobs.
  if (!modelled) pivot.add(knob);
  const knobMeshes = knob.children;

  // Closed: local -hinge·x lies along the wall toward the opening's middle.
  // Open: it lies along swing·n, a quarter turn about the hinge.
  const yawFor = (dir) => {
    // Local direction (−hinge, 0) rotated by yaw θ about +y lands on
    // (−hinge·cosθ, hinge·sinθ) in (x, z). Solve for the world direction.
    const [dx, dz] = dir;
    return Math.atan2(def.hinge * dz, -def.hinge * dx);
  };
  const closedYaw = yawFor([-def.hinge * u[0], -def.hinge * u[1]]);
  const openYaw = yawFor([def.swing * n[0], def.swing * n[1]]);
  pivot.rotation.y = closedYaw;

  const half = WALL_THICKNESS / 2;
  const closedBox = () => {
    const a = opening.center - opening.width / 2;
    const b = opening.center + opening.width / 2;
    return wall.axis === 'x'
      ? { minX: wall.at - half, maxX: wall.at + half, minZ: a, maxZ: b }
      : { minX: a, maxX: b, minZ: wall.at - half, maxZ: wall.at + half };
  };
  const openBox = () => {
    // The open leaf, a thin slab standing out from the wall on its swing side,
    // behind the hinge line rather than in front of it. In front, it took 8 mm
    // off the doorway, and anyone cutting the corner caught on its edge and
    // was pushed straight back: the house's monkey stuck there for a whole run.
    const outward = def.hinge;
    const t0 = along;
    const t1 = along + outward * 0.07;
    const s0 = wall.at;
    const s1 = wall.at + def.swing * w;
    const [lo, hi] = [Math.min(t0, t1), Math.max(t0, t1)];
    const [nlo, nhi] = [Math.min(s0, s1), Math.max(s0, s1)];
    return wall.axis === 'x'
      ? { minX: nlo, maxX: nhi, minZ: lo, maxZ: hi }
      : { minX: lo, maxX: hi, minZ: nlo, maxZ: nhi };
  };
  const withY = (b) => ({ ...b, minY: wall.y, maxY: wall.y + opening.height });

  const mid = new THREE.Vector3(
    wall.axis === 'x' ? wall.at : opening.center,
    wall.y + 1.1,
    wall.axis === 'x' ? opening.center : wall.at
  );
  const state = {
    kind: 'door',
    id: def.id,
    lock: def.lock || [],
    heldBy: def.heldBy || null,
    open: false,
    t: 0,
    meshes: modelled ? collect(leaf) : mat ? [...leafMeshes, ...knobMeshes] : [leaf, ...knobMeshes],
    point: mid,
    highlight: tint(mat ? leafMeshes.slice(0, 1) : [leaf]),
    canUse: () => !state.open,
    colliders: () => [withY(state.open ? openBox() : closedBox())],
    update(dt) {
      const target = state.open ? 1 : 0;
      state.t += Math.sign(target - state.t) * Math.min(Math.abs(target - state.t), dt / SWING_TIME);
      const e = state.t * state.t * (3 - 2 * state.t);
      pivot.rotation.y = closedYaw + shortest(openYaw - closedYaw) * e;
    },
  };
  return state;
}

function shortest(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * A drawer, a box or a desk that holds an item: a piece of furniture standing
 * in its room, its front at `def.at`, with the one part that opens. The first
 * drawers were bare boxes pushed half into their walls, and on the owner's
 * phone they hung in the air.
 */
function makeContainer(def, group, mat) {
  const [x, y, z] = def.at;
  const floorY = y >= UPPER - 0.5 ? UPPER : GROUND;
  const sx = Math.round(Math.sin(def.face));
  const sz = Math.round(Math.cos(def.face));
  const colliders = [];
  let moving;
  let open;
  let meshes;
  if (!mat) {
    // No surfaces (a harness without assets): a plain block, as in greybox.
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, y - floorY + 0.1, 0.45), new THREE.MeshLambertMaterial({ color: 0x4a3c2c }));
    block.position.set(x - sx * 0.225, (y + floorY + 0.1) / 2, z - sz * 0.225);
    group.add(block);
    meshes = [block];
    moving = block;
    open = () => {};
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minY: floorY, maxY: y + 0.1, minZ: z - 0.45, maxZ: z + 0.45 });
  } else if (def.kind === 'box') {
    // A toy box with a lid that lifts on its hinges: Blender's box and lid (models.py).
    const d = 0.4;
    const p = piece(mat);
    p.shadow(-0.35, 0.35, 0, d, 0.65);
    p.model('toybox', { d });
    p.solid(-0.37, 0.37, 0, 0.5, 0, d);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.45, 0.01);
    p.group.add(hinge);
    p.model('toybox-lid', { d }, {}, hinge);
    place(group, colliders, p, x - sx * d, floorY, z - sz * d, def.face);
    meshes = collect(p.group);
    moving = collect(hinge);
    open = (t) => (hinge.rotation.x = -1.9 * t);
  } else {
    const desk = def.kind === 'desk';
    const d = desk ? 0.6 : 0.45;
    const { piece: p, drawers } = chest(mat, desk ? { w: 1.3, h: 0.78, d, drawers: 2 } : { d });
    place(group, colliders, p, x - sx * d, floorY, z - sz * d, def.face);
    meshes = collect(p.group);
    // The drawer's front and knobs light under the crosshair.
    moving = collect(drawers[0]).filter((m) => m.userData.slot !== 'wood' && m.userData.slot !== 'black');
    // The top drawer comes out most of its depth, and stays on its runners.
    open = (t) => (drawers[0].position.z = (d - 0.12) * t);
  }

  // Its own paint, so lighting it under the crosshair lights nothing else.
  if (!Array.isArray(moving)) moving = [moving];
  for (const m of moving) m.material = m.material.clone();
  const state = {
    kind: 'container',
    id: def.id,
    holds: def.holds,
    opened: false,
    t: 0,
    meshes,
    point: new THREE.Vector3(x, y, z),
    get prompt() {
      return `Open ${def.name}`;
    },
    highlight: tint(moving),
    canUse: () => !state.opened,
    colliders: () => colliders,
    update(dt) {
      if (!state.opened || state.t >= 1) return;
      state.t = Math.min(1, state.t + dt / 0.3);
      open(state.t);
    },
  };
  return state;
}

function makeClock(group, mat) {
  const [x, y, z] = CLOCK.at;
  const body = new THREE.Group();
  body.position.set(x, 0, z);
  body.rotation.y = CLOCK.face;
  group.add(body);
  const hand = new THREE.Group();
  hand.position.set(0, y, 0.037);
  body.add(hand);
  let face;
  let caseMeshes;
  // Blender's long-case clock and its hand (models.py), or a block and a disc
  // with no surfaces (a harness without assets).
  const clock = mat && want(null, 'longcase', { face: y }, mat, { tag: 'clock' });
  const handModel = mat && want(null, 'clock-hand', {}, mat, { tag: 'clock' });
  if (clock && handModel) {
    body.add(clock);
    hand.add(handModel);
    caseMeshes = collect(clock);
    face = caseMeshes.find((m) => m.userData.slot === 'paper');
  } else {
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.0, 0.3), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
    caseMesh.position.set(0, 1.0, -0.12);
    body.add(caseMesh);
    face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshLambertMaterial({ color: 0xd8d0b8 }));
    face.position.set(0, y, 0.035);
    body.add(face);
    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.01), new THREE.MeshBasicMaterial({ color: 0x101010 }));
    handMesh.position.y = 0.075;
    hand.add(handMesh);
    caseMeshes = [caseMesh, face];
  }
  // The dial lights under the crosshair, on its own paint.
  face.material = face.material.clone();

  const state = {
    kind: 'clock',
    id: 'clock',
    hour: CLOCK.stopped,
    /** Set once the hands have reached the hour. It never unsets. */
    set: false,
    shown: CLOCK.stopped,
    meshes: caseMeshes,
    point: new THREE.Vector3(x, y, z),
    prompt: 'Turn the Hands',
    highlight: tint([face]),
    canUse: () => true,
    colliders: () => [{ minX: x - 0.3, maxX: x + 0.3, minY: 0, maxY: 2.0, minZ: z - 0.3, maxZ: z + 0.05 }],
    turn() {
      state.hour = (state.hour % 12) + 1;
      return state.hour === CLOCK.hour;
    },
    update(dt) {
      // The hand catches up with the hour it was set to.
      const want = state.hour < state.shown ? state.hour + 12 : state.hour;
      state.shown = Math.min(want, state.shown + dt * 4);
      if (state.shown >= 12.999 && want >= 12) state.shown -= 12;
      hand.rotation.z = -(state.shown / 12) * Math.PI * 2;
    },
  };
  state.update(0);
  return state;
}

function makeNote(def, group, mat) {
  const paper = mat ? mat.paper.clone() : new THREE.MeshLambertMaterial({ color: 0xcfc8b0, side: THREE.DoubleSide });
  const [pw, ph] = def.size ?? (def.flat ? [0.21, 0.28] : [0.32, 0.44]);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), paper);
  const [x, y, z] = def.at;
  mesh.position.set(x, y, z);
  mesh.userData.inventory = `note:${def.id}`;
  // Not a piece: a sheet of paper (the models harness).
  mesh.userData.notAPiece = 'paper';
  if (def.flat) mesh.rotation.set(-Math.PI / 2, 0, def.face);
  else mesh.rotation.y = def.face;
  group.add(mesh);
  const state = {
    kind: 'note',
    id: def.id,
    title: def.title,
    text: def.text,
    read: false,
    meshes: [mesh],
    point: new THREE.Vector3(x, y, z),
    prompt: 'Read',
    highlight: tint([mesh]),
    canUse: () => true,
    colliders: () => [],
    update() {},
  };
  return state;
}

/** A table on legs under each note that lies flat, so it is not floating. */
function tables(group, surfaces) {
  const colliders = [];
  for (const n of NOTES) {
    if (!n.flat) continue;
    const [x, y, z] = n.at;
    if (!surfaces) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, y - 0.01, 0.6), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
      mesh.position.set(x, (y - 0.01) / 2, z);
      group.add(mesh);
      colliders.push({ minX: x - 0.45, maxX: x + 0.45, minY: 0, maxY: y, minZ: z - 0.3, maxZ: z + 0.3 });
      continue;
    }
    place(group, colliders, table(surfaces, { w: 0.9, d: 0.6, h: y - 0.005 }), x, y >= UPPER ? UPPER : GROUND, z, 0);
  }
  return colliders;
}

export function buildThings(mat = null, models = {}) {
  useModels(models);
  const group = new THREE.Group();
  group.name = 'things';
  const doors = DOORS.map((d) => makeDoor(d, group, mat, models));
  const containers = CONTAINERS.map((c) => makeContainer(c, group, mat));
  const clock = makeClock(group, mat);
  const notes = NOTES.map((n) => makeNote(n, group, mat));
  const furniture = tables(group, mat);
  const all = [...doors, ...containers, clock, ...notes];
  return {
    group,
    doors,
    containers,
    clock,
    notes,
    all,
    targets: [...doors, ...containers, clock, ...notes],
    staticColliders: furniture,
    colliders: () => all.flatMap((t) => t.colliders()),
    items: ITEMS,
  };
}
