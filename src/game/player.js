import * as THREE from 'three';
import { PLAYER_EYE, PLAYER_HEIGHT, PLAYER_RADIUS } from './layout.js';

const WALK_SPEED = 3.05;
const ACCEL = 24;
const FRICTION = 16;
const PITCH_LIMIT = Math.PI / 2 - 0.06;

/**
 * First-person walker. No jumping, no crouching — the level never asks for it,
 * so collision is a 2D box slide against the axis-aligned colliders the level
 * and props hand over.
 */
export class Player {
  constructor(camera) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.bobPhase = 0;
    this.lastStep = 0;
    this.onFootstep = () => {};
    this.speed = 0;
  }

  reset(pos, yaw = 0) {
    this.position.set(pos[0], 0, pos[2]);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.bobPhase = 0;
    this.lastStep = 0;
    this.speed = 0;
    this.#syncCamera(0);
  }

  update(dt, input, colliders) {
    const look = input.takeLook();
    this.yaw -= look.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.dy, -PITCH_LIMIT, PITCH_LIMIT);

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // yaw 0 looks down -Z.
    const wishX = input.move.x * cos - input.move.y * sin;
    const wishZ = -input.move.x * sin - input.move.y * cos;
    const wishLen = Math.hypot(wishX, wishZ);

    const targetX = wishLen > 0 ? (wishX / wishLen) * WALK_SPEED * Math.min(1, wishLen) : 0;
    const targetZ = wishLen > 0 ? (wishZ / wishLen) * WALK_SPEED * Math.min(1, wishLen) : 0;

    const rate = wishLen > 0 ? ACCEL : FRICTION;
    this.velocity.x = approach(this.velocity.x, targetX, rate * dt);
    this.velocity.z = approach(this.velocity.z, targetZ, rate * dt);

    this.position.x += this.velocity.x * dt;
    resolve(this.position, colliders, 'x');
    this.position.z += this.velocity.z * dt;
    resolve(this.position, colliders, 'z');

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.#syncCamera(dt);
  }

  #syncCamera(dt) {
    if (dt > 0 && this.speed > 0.35) {
      this.bobPhase += (this.speed / WALK_SPEED) * dt * 8.4;
      const step = Math.floor(this.bobPhase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.onFootstep();
      }
    } else {
      this.bobPhase += dt * 1.1;
    }

    const amount = Math.min(1, this.speed / WALK_SPEED);
    const bob = Math.sin(this.bobPhase) * 0.042 * amount;
    const sway = Math.sin(this.bobPhase * 0.5) * 0.028 * amount;

    this.camera.position.set(this.position.x, PLAYER_EYE + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, sway * 0.12);
  }
}

function approach(current, target, maxDelta) {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/**
 * Pushes the player box out of anything it overlaps along one axis. Bounded
 * iteration so a pinch between two colliders can never spin.
 */
function resolve(position, colliders, axis) {
  for (let pass = 0; pass < 4; pass++) {
    const minX = position.x - PLAYER_RADIUS;
    const maxX = position.x + PLAYER_RADIUS;
    const minZ = position.z - PLAYER_RADIUS;
    const maxZ = position.z + PLAYER_RADIUS;
    let hit = false;

    for (const c of colliders) {
      if (c.minY >= PLAYER_HEIGHT || c.maxY <= 0.05) continue;
      if (maxX <= c.minX || minX >= c.maxX) continue;
      if (maxZ <= c.minZ || minZ >= c.maxZ) continue;

      if (axis === 'x') {
        const pushOut = c.maxX - minX;
        const pushIn = maxX - c.minX;
        position.x += pushOut < pushIn ? pushOut : -pushIn;
      } else {
        const pushOut = c.maxZ - minZ;
        const pushIn = maxZ - c.minZ;
        position.z += pushOut < pushIn ? pushOut : -pushIn;
      }
      hit = true;
      break;
    }

    if (!hit) return;
  }
}
