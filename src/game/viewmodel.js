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

const REST = new THREE.Vector3(0.33, -0.27, -0.72);
const REST_ROT = new THREE.Euler(0.05, -0.38, 0.08);
const TOOL_LENGTH = 0.3;

export function buildViewmodel(assets) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 4);

  const key = new THREE.DirectionalLight(0xffd9c8, 2.2);
  key.position.set(0.6, 0.8, 0.9);
  scene.add(key);
  const fill = new THREE.AmbientLight(0x5b6560, 1.4);
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

  // In-engine readout so the tool visibly reacts even if the generated mesh
  // has no screen of its own.
  const readoutMat = new THREE.MeshBasicMaterial({ color: 0x1d3a28, toneMapped: false });
  const readout = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.055), readoutMat);
  readout.position.set(0.0, 0.055, 0.035);
  readout.rotation.set(-0.9, 0, 0);
  holder.add(readout);

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

    setTint(color, intensity) {
      key.color.copy(color);
      key.intensity = intensity;
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
