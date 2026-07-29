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

const REST = new THREE.Vector3(0.31, -0.225, -0.72);
const REST_ROT = new THREE.Euler(0.05, -0.38, 0.08);
const TOOL_LENGTH = 0.3;

export function buildViewmodel(assets) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 4);

  const key = new THREE.DirectionalLight(0xffd9c8, 2.2);
  key.position.set(0.6, 0.8, 0.9);
  scene.add(key);
  const fill = new THREE.AmbientLight(0x2e3532, 1.1);
  scene.add(fill);

  const holder = new THREE.Group();
  scene.add(holder);

  const model = assets.model('scanner') || placeholderModel('scanner');
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

  holder.position.copy(REST);
  holder.rotation.copy(REST_ROT);

  const sway = new THREE.Vector2();
  const swayTarget = new THREE.Vector2();
  let pulse = 0;
  let bob = 0;

  return {
    scene,
    camera,

    resize(aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },

    /** Fires the short animation the spec asks for on every interaction. */
    play() {
      pulse = 1;
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
