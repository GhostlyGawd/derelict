import * as THREE from 'three';
import { DOORS, POWER_PANEL, SWITCHES } from './layout.js';
import { resolveParts } from './props.js';

/**
 * Stateful set pieces: the two power switches, the three powered doors, and
 * the airlock's 0/2 readout.
 */

// The highlight brightens the switch rather than adding light to it: a strong
// emissive tint flattens the surface and fights the colour of the room, which
// is the whole point of the lighting states.
const HIGHLIGHT_GAIN = 2.1;
const HIGHLIGHT_GLOW = new THREE.Color(0x0a0e0b);
const OFF = new THREE.Color(0x000000);

function instantiate(parts) {
  return parts.map(({ geometry, material }) => new THREE.Mesh(geometry, material.clone()));
}

function fitToBox(parts, size) {
  const bounds = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    bounds.union(tmp.copy(geometry.boundingBox));
  }
  const span = new THREE.Vector3();
  const centre = new THREE.Vector3();
  bounds.getSize(span);
  bounds.getCenter(centre);

  const matrix = new THREE.Matrix4()
    .makeScale(
      size[0] / Math.max(span.x, 1e-4),
      size[1] / Math.max(span.y, 1e-4),
      size[2] / Math.max(span.z, 1e-4)
    )
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));

  return parts.map(({ geometry, material }) => {
    const geo = geometry.clone();
    geo.applyMatrix4(matrix);
    return new THREE.Mesh(geo, material.clone());
  });
}

function boundsOf(objects) {
  const box = new THREE.Box3();
  for (const o of objects) box.expandByObject(o);
  return box;
}

// ------------------------------------------------------------- switches ---

export function buildSwitches(assets, cache) {
  return SWITCHES.map((def) => {
    const group = new THREE.Group();
    group.name = `switch:${def.id}`;
    group.position.set(...def.pos);
    group.rotation.y = Math.atan2(def.facing[0], def.facing[2]);

    const body = new THREE.Group();
    const meshes = instantiate(resolveParts('power_switch', assets, cache));
    const baseColours = meshes.map((m) => m.material.color.clone());
    for (const m of meshes) body.add(m);
    // The model's origin is at floor-centre; recentre it on the mount height.
    const size = new THREE.Vector3();
    boundsOf(meshes).getSize(size);
    body.position.y = -size.y / 2;
    group.add(body);

    // A chunky throw lever seated in the model's lever slot, built in engine
    // so the flip itself is unmistakable.
    const pivot = new THREE.Group();
    pivot.position.set(0, size.y * 0.37, 0.2);
    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.3, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xb0442a })
    );
    lever.position.y = 0.15;
    const knob = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.07, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x3b3f3a })
    );
    knob.position.y = 0.3;
    pivot.add(lever, knob);
    pivot.rotation.x = -0.75;
    body.add(pivot);

    const indicator = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xff2a18, toneMapped: false, fog: true })
    );
    indicator.position.set(0, size.y * 0.86, 0.16);
    body.add(indicator);

    const state = {
      id: def.id,
      kind: 'switch',
      zone: def.zone,
      label: def.label,
      prompt: 'Restore Power',
      object: group,
      meshes,
      point: new THREE.Vector3(...def.pos),
      used: false,
      recoil: 0,
      leverT: 0,
      body,
      pivot,
      indicator,
      canUse: () => !state.used,
      highlight(on) {
        const lit = on && !state.used;
        meshes.forEach((m, i) => {
          m.material.color.copy(baseColours[i]).multiplyScalar(lit ? HIGHLIGHT_GAIN : 1);
          m.material.emissive.copy(lit ? HIGHLIGHT_GLOW : OFF);
        });
      },
      activate() {
        if (state.used) return false;
        state.used = true;
        state.recoil = 1;
        indicator.material.color.setHex(0x7bff9a);
        state.highlight(false);
        return true;
      },
      update(dt) {
        if (state.recoil > 0) {
          state.recoil = Math.max(0, state.recoil - dt * 7);
          body.position.z = -0.035 * Math.sin((1 - state.recoil) * Math.PI);
        }
        const target = state.used ? 1 : 0;
        if (state.leverT !== target) {
          state.leverT = THREE.MathUtils.damp(state.leverT, target, 14, dt);
          if (Math.abs(state.leverT - target) < 0.002) state.leverT = target;
          pivot.rotation.x = -0.75 + state.leverT * 1.5;
        }
      },
    };

    return state;
  });
}

// ---------------------------------------------------------------- doors ---

export function buildDoors(assets, cache) {
  return DOORS.map((def) => {
    const group = new THREE.Group();
    group.name = `door:${def.id}`;

    const leaves = def.leaves.map((leaf) => {
      const holder = new THREE.Group();
      for (const mesh of fitToBox(resolveParts(def.model, assets, cache), leaf.size)) {
        holder.add(mesh);
      }
      holder.position.set(...leaf.pos);
      holder.rotation.y = leaf.rotY || 0;
      group.add(holder);

      // Footprint of the closed leaf, with `rotY` folded in.
      const c = Math.abs(Math.cos(leaf.rotY || 0));
      const s = Math.abs(Math.sin(leaf.rotY || 0));
      return {
        holder,
        base: holder.position.clone(),
        slide: new THREE.Vector3(...leaf.slide),
        extent: [
          (leaf.size[0] * c + leaf.size[2] * s) / 2,
          leaf.size[1],
          (leaf.size[0] * s + leaf.size[2] * c) / 2,
        ],
      };
    });

    const state = {
      id: def.id,
      kind: def.kind,
      object: group,
      t: 0,
      opening: false,
      get open() {
        return state.t > 0.985;
      },
      /** Colliders vanish as soon as the leaf has cleared the doorway. */
      colliders() {
        if (state.t > 0.55) return [];
        return leaves.map(({ base, extent }) => ({
          minX: base.x - extent[0] - 0.05,
          maxX: base.x + extent[0] + 0.05,
          minY: 0,
          maxY: extent[1],
          minZ: base.z - extent[2] - 0.05,
          maxZ: base.z + extent[2] + 0.05,
        }));
      },
      cycle() {
        if (state.opening) return false;
        state.opening = true;
        return true;
      },
      reset() {
        state.opening = false;
        state.t = 0;
        for (const leaf of leaves) leaf.holder.position.copy(leaf.base);
      },
      update(dt) {
        if (!state.opening || state.t >= 1) return;
        state.t = Math.min(1, state.t + dt / def.duration);
        // Heavy machinery: slow to start, slow to settle.
        const e = state.t * state.t * (3 - 2 * state.t);
        for (const leaf of leaves) {
          leaf.holder.position.copy(leaf.base).addScaledVector(leaf.slide, e);
        }
      },
    };

    return state;
  });
}

// ---------------------------------------------------------- power panel ---

/** Seated is seated: a filled pip is green whether or not the door is live. */
const PIP_LIVE = '#7bff9a';

export function buildPowerPanel(materials) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const group = new THREE.Group();
  group.name = 'power-panel';
  group.position.set(...POWER_PANEL.pos);
  group.rotation.y = Math.atan2(POWER_PANEL.facing[0], POWER_PANEL.facing[2]);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(POWER_PANEL.size[0] + 0.14, POWER_PANEL.size[1] + 0.14, 0.12),
    materials.surface('greeble_panel')
  );
  frame.position.z = -0.05;
  group.add(frame);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(...POWER_PANEL.size),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: true })
  );
  screen.position.z = 0.02;
  group.add(screen);

  let drawn = -1;
  function draw(count) {
    ctx.fillStyle = '#060b08';
    ctx.fillRect(0, 0, 320, 200);

    // The count stays red until the door is live, because until then it is
    // still saying "this airlock is dead". A pip is a different statement — it
    // reports one socket, and a cell that is seated is done. Red there put the
    // colour that means "not yet" on the one thing the player had just
    // finished, which is the single place the ship's colour language
    // contradicted itself. Phase 3, spec 3.3.
    const lit = count >= 2 ? PIP_LIVE : '#ff5a3c';
    ctx.strokeStyle = 'rgba(120,160,132,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 304, 184);

    ctx.fillStyle = 'rgba(150,190,164,0.75)';
    ctx.font = '600 24px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AIRLOCK POWER', 160, 48);

    ctx.fillStyle = lit;
    ctx.font = '600 78px ui-monospace, Menlo, monospace';
    ctx.fillText(`${count}/2`, 160, 128);

    for (let i = 0; i < 2; i++) {
      const x = 100 + i * 84;
      ctx.fillStyle = i < count ? PIP_LIVE : '#20302a';
      ctx.fillRect(x, 150, 56, 20);
      ctx.strokeStyle = 'rgba(140,180,155,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, 150, 56, 20);
    }
    texture.needsUpdate = true;
  }

  function setCount(count) {
    if (count === drawn) return;
    drawn = count;
    draw(count);
  }

  setCount(0);
  return { group, setCount };
}
