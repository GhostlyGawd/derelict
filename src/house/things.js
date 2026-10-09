import * as THREE from 'three';

import { CLOCK, CONTAINERS, DOORS, GATE, ITEMS, NOTES, WALL_THICKNESS, openingFor } from './layout.js';

/**
 * The house's interactives in greybox (phase 9, milestone 2): doors on hinges,
 * drawers and boxes that hold an item, the dining-room clock, the gate it
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
function frame(wall) {
  return wall.axis === 'x' ? { u: [0, 1], n: [1, 0] } : { u: [1, 0], n: [0, 1] };
}

function makeDoor(def, group) {
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
  group.add(pivot);
  const material = new THREE.MeshLambertMaterial({ color: def.lock ? 0x5a3a28 : 0x6a5038 });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, LEAF), material);
  // The leaf's own frame: it runs along local -hinge·x from the pivot, so the
  // closed door spans the opening when the pivot is turned to the wall.
  leaf.position.set(-def.hinge * (w / 2), h / 2, 0);
  pivot.add(leaf);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), new THREE.MeshLambertMaterial({ color: 0xb09a60 }));
  knob.position.set(-def.hinge * (w - 0.1), 1.0, 0);
  pivot.add(knob);

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
    open: false,
    t: 0,
    meshes: [leaf, knob],
    point: mid,
    highlight: tint([leaf]),
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

function makeContainer(def, group) {
  const [x, y, z] = def.at;
  const body = new THREE.Group();
  body.position.set(x, 0, z);
  body.rotation.y = def.face;
  group.add(body);
  const floorY = y - (def.id === 'child-box' ? 0.6 : 0.8);
  const height = y - floorY + 0.1;
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, height, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x4a3c2c })
  );
  cabinet.position.set(0, floorY + height / 2, -0.25);
  body.add(cabinet);
  const drawer = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.16, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x7a6040 })
  );
  drawer.position.set(0, y, 0.01);
  body.add(drawer);

  // The cabinet's footprint, for the colliders: 0.9 wide, 0.5 deep, behind
  // the front face whichever way it faces.
  const footprint = () => {
    const c = Math.cos(def.face);
    const s = Math.sin(def.face);
    const corners = [[-0.45, -0.5], [0.45, -0.5], [-0.45, 0], [0.45, 0]].map(([lx, lz]) => [
      x + lx * c + lz * s,
      z - lx * s + lz * c,
    ]);
    const xs = corners.map((p) => p[0]);
    const zs = corners.map((p) => p[1]);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minZ: Math.min(...zs), maxZ: Math.max(...zs),
      minY: floorY, maxY: floorY + height,
    };
  };

  const state = {
    kind: 'container',
    id: def.id,
    holds: def.holds,
    opened: false,
    t: 0,
    meshes: [drawer, cabinet],
    point: new THREE.Vector3(x, y, z),
    get prompt() {
      return `Open ${def.name}`;
    },
    highlight: tint([drawer]),
    canUse: () => !state.opened,
    colliders: () => [footprint()],
    update(dt) {
      if (!state.opened || state.t >= 1) return;
      state.t = Math.min(1, state.t + dt / 0.3);
      drawer.position.z = 0.01 + 0.3 * state.t;
    },
  };
  return state;
}

function makeClock(group) {
  const [x, y, z] = CLOCK.at;
  const body = new THREE.Group();
  body.position.set(x, 0, z);
  body.rotation.y = CLOCK.face;
  group.add(body);
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.0, 0.3), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
  caseMesh.position.set(0, 1.0, -0.12);
  body.add(caseMesh);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshLambertMaterial({ color: 0xd8d0b8 }));
  face.position.set(0, y, 0.035);
  body.add(face);
  const hand = new THREE.Group();
  hand.position.set(0, y, 0.04);
  body.add(hand);
  const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.01), new THREE.MeshBasicMaterial({ color: 0x101010 }));
  handMesh.position.y = 0.075;
  hand.add(handMesh);

  const state = {
    kind: 'clock',
    id: 'clock',
    hour: CLOCK.stopped,
    shown: CLOCK.stopped,
    meshes: [face, caseMesh],
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

function makeGate(group) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(GATE.x[1] - GATE.x[0], GATE.y[1] - GATE.y[0], GATE.z[1] - GATE.z[0]),
    new THREE.MeshLambertMaterial({ color: 0x2c2c28 })
  );
  mesh.position.set((GATE.x[0] + GATE.x[1]) / 2, (GATE.y[0] + GATE.y[1]) / 2, (GATE.z[0] + GATE.z[1]) / 2);
  group.add(mesh);
  const state = {
    kind: 'gate',
    id: GATE.id,
    open: false,
    t: 0,
    colliders: () =>
      state.open ? [] : [{ minX: GATE.x[0], maxX: GATE.x[1], minY: GATE.y[0], maxY: GATE.y[1], minZ: GATE.z[0], maxZ: GATE.z[1] }],
    update(dt) {
      if (!state.open || state.t >= 1) return;
      state.t = Math.min(1, state.t + dt / 0.8);
      // It folds back against the stairwell wall, clear of the stairs' head.
      mesh.scale.x = 1 - 0.92 * state.t;
      mesh.position.x = GATE.x[1] - ((GATE.x[1] - GATE.x[0]) * mesh.scale.x) / 2;
    },
  };
  return state;
}

function makeNote(def, group) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshLambertMaterial({ color: 0xcfc8b0, side: THREE.DoubleSide }));
  const [x, y, z] = def.at;
  mesh.position.set(x, y, z);
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

/** Furniture a flat note lies on, so it is not floating. Greybox only. */
function tables(group) {
  const colliders = [];
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
  for (const n of NOTES) {
    if (!n.flat) continue;
    const [x, y, z] = n.at;
    const w = 0.9;
    const d = 0.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, y - 0.01, d), mat);
    mesh.position.set(x, (y - 0.01) / 2, z);
    group.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: y, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  return colliders;
}

export function buildThings() {
  const group = new THREE.Group();
  group.name = 'things';
  const doors = DOORS.map((d) => makeDoor(d, group));
  const containers = CONTAINERS.map((c) => makeContainer(c, group));
  const clock = makeClock(group);
  const gate = makeGate(group);
  const notes = NOTES.map((n) => makeNote(n, group));
  const furniture = tables(group);
  const all = [...doors, ...containers, clock, gate, ...notes];
  return {
    group,
    doors,
    containers,
    clock,
    gate,
    notes,
    all,
    targets: [...doors, ...containers, clock, ...notes],
    staticColliders: furniture,
    colliders: () => all.flatMap((t) => t.colliders()),
    items: ITEMS,
  };
}
