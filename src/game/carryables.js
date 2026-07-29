import * as THREE from 'three';
import { CELL_MOUNT, CRADLES, SOCKETS } from './layout.js';
import { resolveParts } from './props.js';

/**
 * Phase 2 — power cells, the cradles that hold them and the sockets that take
 * them.
 *
 * A cell is only ever in one of four states, and the whole no-unwinnable-states
 * guarantee rests on that being exhaustive:
 *
 *   cradled → carried → loose ⇄ carried → seated
 *
 * `seated` is terminal by design: a socket never gives a cell back, which
 * deletes "I put it in the wrong place" as a failure rather than testing for
 * it. `loose` always sits on the floor where the player stood, which is why a
 * set-down cell can never leave a reachable position.
 */

const HIGHLIGHT_GAIN = 2.1;
const HIGHLIGHT_GLOW = new THREE.Color(0x0a0e0b);
const OFF = new THREE.Color(0x000000);

// A clamped cell offers no prompt and no highlight, because it cannot be taken
// — so the cradle's own lamp is the only thing that tells a player why. It uses
// the same red-until-done vocabulary as the wall switches, and it has to be
// bright enough to read across a room lit only by emergency light.
const LOCKED_CLAMP = new THREE.Color(0xd8261a);
const OPEN_CLAMP = new THREE.Color(0x3fbf63);
const CELL_GLOW = 0x3aa957;

function instantiate(parts) {
  return parts.map(({ geometry, material }) => new THREE.Mesh(geometry, material.clone()));
}

function highlighter(meshes, isLive) {
  const base = meshes.map((m) => m.material.color.clone());
  return (on) => {
    const lit = on && isLive();
    meshes.forEach((m, i) => {
      m.material.color.copy(base[i]).multiplyScalar(lit ? HIGHLIGHT_GAIN : 1);
      m.material.emissive.copy(lit ? HIGHLIGHT_GLOW : OFF);
    });
  };
}

/**
 * The socket, built in engine from the generated wall surfaces rather than as
 * its own model. Phase 2's box is two new models, and the socket is a shallow
 * wall fixture of the same kind as the airlock readout — which v1 already built
 * this way. Its mouth straddles the eye line; see SOCKETS in layout.js.
 */
function socketParts(materials) {
  // Cloned, not shared: the highlighter writes to material.color, and
  // materials.surface() hands back one cached instance per id — tinting it
  // would light up every greeble panel on the ship.
  const build = (size, pos, id, color) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      materials.surface(id, color ? { color } : undefined).clone()
    );
    mesh.position.set(...pos);
    return mesh;
  };
  return [
    build([0.4, 0.44, 0.2], [0, 0.2, 0.1], 'greeble_panel'),
    build([0.46, 0.07, 0.24], [0, 0.005, 0.11], 'door_trim'),
    build([0.3, 0.32, 0.08], [0, 0.22, 0.2], 'greeble_panel', 0x3a423c),
  ];
}

/**
 * `carry` is the single carry slot, shared by reference so interactives can
 * ask about it without the game wiring a callback into every one of them.
 */
export function buildCarryables(assets, cache, carry, materials) {
  const group = new THREE.Group();
  group.name = 'carryables';
  const colliders = [];
  const interactives = [];

  // ------------------------------------------------------------- cradles --
  const cradles = CRADLES.map((def) => {
    const holder = new THREE.Group();
    holder.position.set(...def.pos);
    holder.rotation.y = Math.atan2(def.facing[0], def.facing[2]);
    for (const mesh of instantiate(resolveParts('cell_cradle', assets, cache))) holder.add(mesh);

    // A status lamp on the cradle face: red while clamped, green once released.
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.06),
      new THREE.MeshBasicMaterial({ color: LOCKED_CLAMP, toneMapped: false, fog: true })
    );
    lamp.position.set(0, 0.95, 0.42);
    holder.add(lamp);
    group.add(holder);

    colliders.push({
      minX: def.pos[0] - 0.42,
      maxX: def.pos[0] + 0.42,
      minY: 0,
      maxY: 1.95,
      minZ: def.pos[2] - 0.3,
      maxZ: def.pos[2] + 0.5,
    });

    return {
      id: def.id,
      cellId: def.cell,
      needs: def.needs,
      released: false,
      mount: new THREE.Vector3(...CELL_MOUNT).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        holder.rotation.y
      ).add(new THREE.Vector3(...def.pos)),
      release() {
        this.released = true;
        lamp.material.color.copy(OPEN_CLAMP);
      },
      reset() {
        this.released = false;
        lamp.material.color.copy(LOCKED_CLAMP);
      },
    };
  });

  // ------------------------------------------------------------- sockets --
  const sockets = SOCKETS.map((def) => {
    const holder = new THREE.Group();
    holder.position.set(...def.pos);
    holder.rotation.y = Math.atan2(def.facing[0], def.facing[2]);
    const meshes = socketParts(materials);
    for (const mesh of meshes) holder.add(mesh);
    group.add(holder);

    const state = {
      id: def.id,
      kind: 'socket',
      prompt: 'Seat Power Cell',
      meshes,
      point: new THREE.Vector3(...def.pos).add(new THREE.Vector3(0, 0.2, 0)),
      filled: false,
      facing: holder.rotation.y,
      // Proud of the socket's front plate, not inside it: a seated cell is the
      // only evidence the player has that a step is done, so it has to be
      // visible from across the Bay rather than swallowed by the fixture.
      anchor: new THREE.Vector3(...def.pos).add(
        new THREE.Vector3(0, 0.06, 0.26).applyAxisAngle(new THREE.Vector3(0, 1, 0), holder.rotation.y)
      ),
      canUse: () => carry.held !== null && !state.filled,
      highlight: highlighter(meshes, () => carry.held !== null && !state.filled),
      reset() {
        state.filled = false;
        state.highlight(false);
      },
    };
    interactives.push(state);
    return state;
  });

  // --------------------------------------------------------------- cells --
  const cells = cradles.map((cradle) => {
    const holder = new THREE.Group();
    const meshes = instantiate(resolveParts('power_cell', assets, cache));
    for (const mesh of meshes) holder.add(mesh);
    group.add(holder);

    // The charge strip, unlit so it reads as a light source rather than as a
    // green-painted face. The model carries the housing; this is the glow in
    // it, the same split the scanner's readout and the conduit runs use.
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.018),
      materials.conduit(CELL_GLOW)
    );
    strip.position.set(0, 0.152, 0.142);
    holder.add(strip);

    const state = {
      id: cradle.cellId,
      kind: 'cell',
      prompt: 'Take Power Cell',
      meshes,
      holder,
      cradle,
      status: 'cradled',
      point: cradle.mount.clone(),
      /**
       * Radius within which the cell can be taken on proximity alone. Only a
       * cell lying on the deck: one in its cradle is presented across the eye
       * line and is aimed at like every other interactive.
       */
      get underfoot() {
        return state.status === 'loose' ? 0.95 : 0;
      },
      /** Takeable only when it is somewhere a player could pick it up from. */
      canUse: () =>
        carry.held === null &&
        (state.status === 'loose' || (state.status === 'cradled' && cradle.released)),
      highlight: highlighter(meshes, () => state.canUse()),
      placeAt(position, status) {
        state.status = status;
        state.point.copy(position);
        holder.position.copy(position);
        holder.visible = true;
      },
      take() {
        state.status = 'carried';
        holder.visible = false;
        state.highlight(false);
      },
      reset() {
        state.placeAt(cradle.mount, 'cradled');
        holder.rotation.y = 0;
        state.highlight(false);
      },
    };

    state.reset();
    interactives.push(state);
    return state;
  });

  const byId = new Map(cells.map((c) => [c.id, c]));

  return {
    group,
    colliders,
    interactives,
    cradles,
    sockets,
    cells,
    cell: (id) => byId.get(id),

    /**
     * Drops the held cell at the player's feet. The cell's origin is its own
     * floor-centre, so y = 0 puts it flat on the deck the player is standing
     * on — never thrown, never embedded, never anywhere they cannot walk back
     * to. That is what keeps the dead-end search tractable.
     */
    setDown(cell, playerPosition, yaw) {
      cell.placeAt(new THREE.Vector3(playerPosition.x, 0, playerPosition.z), 'loose');
      cell.holder.rotation.y = yaw;
    },

    /** One-way. A seated cell is spent and is never takeable again. */
    seat(cell, socket) {
      socket.filled = true;
      cell.placeAt(socket.anchor, 'seated');
      cell.holder.rotation.y = socket.facing;
      socket.highlight(false);
      cell.highlight(false);
    },

    reset() {
      for (const cradle of cradles) cradle.reset();
      for (const socket of sockets) socket.reset();
      for (const cell of cells) cell.reset();
    },
  };
}
