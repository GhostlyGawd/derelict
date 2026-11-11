import * as THREE from 'three';
import { measure } from '../core/meshutil.js';
import { placeholderModel } from './placeholders.js';

/**
 * The handheld scanner in the classic bottom-right FPS slot.
 *
 * It lives in its own scene rendered after a depth clear, so it can never
 * clip through a bulkhead the player walks up to. Its key light is tinted by
 * the power state of the room the player is standing in.
 */

const REST_DEPTH = -0.72;
const REST_ROT = new THREE.Euler(0.05, -0.38, 0.08);
const TOOL_LENGTH = 0.3;
const BASE_FOV = 58;

/** Widens the view on tall screens so a phone in portrait is not a letterbox. */
export function fovFor(base, aspect) {
  return THREE.MathUtils.clamp(base * Math.sqrt(Math.max(1, 1.25 / aspect)), base, base * 1.2);
}

export function buildViewmodel(assets) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.01, 4);
  // Anchored as a fraction of the visible frame rather than in world units, so
  // the tool stays in the bottom-right corner at any aspect ratio.
  const REST = new THREE.Vector3(0.31, -0.225, REST_DEPTH);

  const key = new THREE.DirectionalLight(0xffd9c8, 2.2);
  key.position.set(0.6, 0.8, 0.9);
  scene.add(key);
  const fill = new THREE.AmbientLight(0x2e3532, 1.1);
  scene.add(fill);

  const holder = new THREE.Group();
  scene.add(holder);

  const model = assets.model('scanner') || placeholderModel('scanner');
  // The one model that never enters the main scene, and so the one most easily
  // dropped without anything noticing. Stamped like every placed model so
  // tools/consume.mjs can find it in the viewmodel's own scene.
  model.traverse((node) => {
    if (node.isMesh) node.userData.model = 'scanner';
  });
  const { size, center } = measure(model);
  // Centre the model on the grip point and normalise it to a handheld tool.
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const scale = TOOL_LENGTH / longest;
  model.position.sub(center);
  const rig = new THREE.Group();
  rig.add(model);
  rig.scale.setScalar(scale);
  holder.add(rig);

  // In-engine readout, placed from the model's own bounds so it lands on the
  // upper face of whatever mesh the pipeline produced.
  const readoutMat = new THREE.MeshBasicMaterial({ color: 0x1d3a28, toneMapped: false });
  // Proportions of the tool's own bounds, so it lands on the upper deck of the
  // casing rather than on top of the antenna.
  const readout = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 0.42, size.z * 0.115),
    readoutMat
  );
  readout.position.set(0, size.y * 0.19, -size.z * 0.04);
  readout.rotation.set(-Math.PI / 2 + 0.28, 0, 0);
  rig.add(readout);

  // Phase 2: a carried cell replaces the scanner rather than sitting beside it,
  // so the HUD never has to say anything (v1 §4) and empty hands are the
  // difference between having the tool and not.
  const cellModel = assets.model('power_cell') || placeholderModel('power_cell');
  const cellBounds = measure(cellModel);
  cellModel.position.sub(cellBounds.center);
  const cellRig = new THREE.Group();
  cellRig.add(cellModel);
  // Same unlit charge strip the world cell carries, so the thing in your hands
  // is recognisably the thing you took off the cradle.
  const cellStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(cellBounds.size.x * 0.55, cellBounds.size.y * 0.045),
    new THREE.MeshBasicMaterial({ color: 0x3aa957, toneMapped: false })
  );
  cellStrip.position.set(0, -cellBounds.size.y * 0.13, cellBounds.size.z * 0.505);
  cellRig.add(cellStrip);
  const cellScale = 0.26 / (Math.max(cellBounds.size.x, cellBounds.size.y, cellBounds.size.z) || 1);
  cellRig.scale.setScalar(cellScale);
  cellRig.rotation.set(0.15, 0.5, -0.08);
  cellRig.visible = false;
  holder.add(cellRig);

  holder.position.copy(REST);
  holder.rotation.copy(REST_ROT);

  const sway = new THREE.Vector2();
  const swayTarget = new THREE.Vector2();
  let pulse = 0;
  let bob = 0;

  return {
    scene,
    camera,

    /**
     * `rightLimit`, when given, is the fraction of the screen's width the
     * tool's right edge must stay left of. On a touch layout that is the
     * column of buttons. Phase 7 tucked the buttons into the bottom-right
     * corner, which is exactly where the tool sits, and on a portrait phone
     * the two had overlapped ever since (9.4.7). The tool moves left until it
     * clears them, and nothing else about it changes.
     */
    resize(aspect, { rightLimit = null, leftLimit = null } = {}) {
      camera.fov = fovFor(BASE_FOV, aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      const halfHeight = Math.abs(REST_DEPTH) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      REST.set(halfHeight * aspect * 0.48, -halfHeight * 0.56, REST_DEPTH);

      // A narrow frame gives the tool proportionally more screen; pull it in so
      // a phone in portrait is not half scanner.
      const trim = THREE.MathUtils.clamp(aspect / 1.2, 0.68, 1);
      rig.scale.setScalar(scale * trim);
      cellRig.scale.setScalar(cellScale * trim);

      if (rightLimit !== null) {
        const left = leftLimit ?? 0;
        // Too wide for the gap between the stick and the buttons: smaller, but
        // never below 60% of itself.
        const width = () => {
          const r = this.screenRect(1, 1);
          return r.x1 - r.x0;
        };
        const room = rightLimit - left;
        if (width() > room) {
          const k = Math.max(0.6, room / width());
          rig.scale.multiplyScalar(k);
          cellRig.scale.multiplyScalar(k);
        }
        // The tool is tilted, so its projected edges do not move one for one
        // with its position; a few passes settle it.
        for (let pass = 0; pass < 6; pass++) {
          const r = this.screenRect(1, 1);
          let shift = 0;
          if (r.x1 > rightLimit) shift = rightLimit - r.x1;
          else if (r.x0 < left) shift = left - r.x0;
          if (Math.abs(shift) < 1e-4) break;
          REST.x += shift * 2 * halfHeight * aspect;
        }
      }
    },

    /**
     * The tool's on-screen bounds at rest, in CSS pixels for a viewport of
     * `w` × `h`, whichever of the scanner or the cell is in hand.
     */
    screenRect(w, h) {
      holder.position.copy(REST);
      holder.rotation.copy(REST_ROT);
      holder.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const part of [rig, cellRig]) {
        // Either may be in hand, so both are measured whichever is showing.
        const shown = part.visible;
        part.visible = true;
        box.expandByObject(part);
        part.visible = shown;
      }
      const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const v = new THREE.Vector3();
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            v.set(x, y, z).project(camera);
            const sx = ((v.x + 1) / 2) * w;
            const sy = ((1 - v.y) / 2) * h;
            r.x0 = Math.min(r.x0, sx);
            r.x1 = Math.max(r.x1, sx);
            r.y0 = Math.min(r.y0, sy);
            r.y1 = Math.max(r.y1, sy);
          }
        }
      }
      // Clipped to the screen: what is off the edge is not under anything.
      r.x0 = Math.max(0, r.x0);
      r.y0 = Math.max(0, r.y0);
      r.x1 = Math.min(w, r.x1);
      r.y1 = Math.min(h, r.y1);
      return r;
    },

    /** Fires the short animation the spec asks for on every interaction. */
    play() {
      pulse = 1;
    },

    /** Swaps the tool for a power cell. One or the other, never both. */
    setCarrying(carrying) {
      rig.visible = !carrying;
      readout.visible = !carrying;
      cellRig.visible = carrying;
    },

    /** Keeps the tool sitting in the same light as the room around it. */
    setTint(color, intensity) {
      key.color.copy(color);
      key.intensity = intensity;
      fill.color.copy(color).multiplyScalar(0.22).addScalar(0.06);
    },

    update(dt, { look, speed, powered }) {
      swayTarget.set(
        THREE.MathUtils.clamp(-look.dx * 6, -0.05, 0.05),
        THREE.MathUtils.clamp(-look.dy * 6, -0.05, 0.05)
      );
      sway.lerp(swayTarget, Math.min(1, dt * 9));

      bob += dt * speed * 8.4;
      const amount = Math.min(1, speed / 3.05);
      const bobX = Math.sin(bob * 0.5) * 0.012 * amount;
      const bobY = -Math.abs(Math.sin(bob)) * 0.014 * amount;

      let kickZ = 0;
      let kickRot = 0;
      if (pulse > 0) {
        pulse = Math.max(0, pulse - dt * 2.6);
        const p = 1 - pulse;
        const curve = Math.sin(Math.min(1, p * 1.35) * Math.PI);
        kickZ = curve * 0.075;
        kickRot = curve * 0.42;
        readoutMat.color.setRGB(0.18 + curve * 0.6, 0.9, 0.35 + curve * 0.4);
      } else {
        readoutMat.color.lerp(powered ? IDLE_ON : IDLE_OFF, Math.min(1, dt * 4));
      }

      holder.position.set(
        REST.x + sway.x + bobX,
        REST.y + sway.y + bobY,
        REST.z + kickZ
      );
      holder.rotation.set(
        REST_ROT.x - kickRot * 0.5 + sway.y * 1.2,
        REST_ROT.y + sway.x * 1.6,
        REST_ROT.z + kickRot * 0.25
      );
    },
  };
}

const IDLE_ON = new THREE.Color(0x2a7a48);
const IDLE_OFF = new THREE.Color(0x3a1410);
