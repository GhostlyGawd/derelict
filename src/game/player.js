import * as THREE from 'three';
import {
  PLAYER_CROUCH_EYE,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_EYE,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from './layout.js';

const WALK_SPEED = 3.05;
const CROUCH_SPEED = 1.5;
const ACCEL = 24;
const FRICTION = 16;
const PITCH_LIMIT = Math.PI / 2 - 0.06;

/**
 * Metres of ground per footstep. Standing is tuned to reproduce the cadence the
 * old bob-driven timer produced at full speed, so nothing about walking the ship
 * upright sounds different than it did.
 */
const STRIDE = 1.14;
const CROUCH_STRIDE = 0.72;

/** Stance blend rate, in units of "full change per second". */
const CROUCH_RATE = 7.5;

/**
 * First-person walker with two stances.
 *
 * Collision height is *discrete* — it is whichever stance the player is in, and
 * never a value in between. That matters: if the box grew smoothly back to full
 * height, a player standing up under the collapsed structure in Corridor B
 * would grow into it and get shoved sideways. Instead the stance only changes
 * to standing once `#canStand` says there is room, and the blend that follows is
 * cosmetic. The camera lerps; the box snaps.
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
    this.onFootstep = () => {};
    this.speed = 0;
    /** The collision stance. */
    this.crouching = false;
    /** 0 standing, 1 crouched — camera only. */
    this.crouchBlend = 0;
    /** True while the player is holding crouch but could not stand if they let go. */
    this.trapped = false;
    this.strideAccum = 0;
  }

  /** The collision box height for the current stance. */
  get height() {
    return this.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  reset(pos, yaw = 0) {
    this.position.set(pos[0], 0, pos[2]);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.bobPhase = 0;
    this.speed = 0;
    this.crouching = false;
    this.crouchBlend = 0;
    this.trapped = false;
    this.strideAccum = 0;
    this.#syncCamera(0);
  }

  update(dt, input, colliders) {
    const look = input.takeLook();
    this.yaw -= look.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.dy, -PITCH_LIMIT, PITCH_LIMIT);

    this.#updateStance(input.crouchHeld, colliders);

    const cap = this.crouching ? CROUCH_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // yaw 0 looks down -Z.
    const wishX = input.move.x * cos - input.move.y * sin;
    const wishZ = -input.move.x * sin - input.move.y * cos;
    const wishLen = Math.hypot(wishX, wishZ);

    const targetX = wishLen > 0 ? (wishX / wishLen) * cap * Math.min(1, wishLen) : 0;
    const targetZ = wishLen > 0 ? (wishZ / wishLen) * cap * Math.min(1, wishLen) : 0;

    const rate = wishLen > 0 ? ACCEL : FRICTION;
    this.velocity.x = approach(this.velocity.x, targetX, rate * dt);
    this.velocity.z = approach(this.velocity.z, targetZ, rate * dt);

    const height = this.height;
    this.position.x += this.velocity.x * dt;
    resolve(this.position, colliders, 'x', height);
    this.position.z += this.velocity.z * dt;
    resolve(this.position, colliders, 'z', height);

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.#stride(dt, cap);
    this.#syncCamera(dt);
  }

  /**
   * Crouching is instant and always allowed — the box only ever gets smaller.
   * Standing is a request, refused while anything is overhead. That refusal is
   * the only thing keeping crouch from being able to strand someone, and it is
   * safe by construction: the crouched walkable set contains the standing one,
   * so a player who crouched their way in can always crouch their way back out.
   */
  #updateStance(wantCrouch, colliders) {
    if (wantCrouch) {
      this.crouching = true;
      this.trapped = false;
    } else if (this.crouching) {
      if (this.#canStand(colliders)) {
        this.crouching = false;
        this.trapped = false;
      } else {
        this.trapped = true;
      }
    }
  }

  #canStand(colliders) {
    const minX = this.position.x - PLAYER_RADIUS;
    const maxX = this.position.x + PLAYER_RADIUS;
    const minZ = this.position.z - PLAYER_RADIUS;
    const maxZ = this.position.z + PLAYER_RADIUS;
    for (const c of colliders) {
      if (c.minY >= PLAYER_HEIGHT || c.maxY <= 0.05) continue;
      if (maxX <= c.minX || minX >= c.maxX) continue;
      if (maxZ <= c.minZ || minZ >= c.maxZ) continue;
      return false;
    }
    return true;
  }

  /**
   * Footsteps fire off ground covered rather than off the bob's phase. They used
   * to come from the bob, which made cadence a function of the animation instead
   * of the walk — inaudible at one speed and obviously wrong at two.
   */
  #stride(dt, cap) {
    const stride = this.crouching ? CROUCH_STRIDE : STRIDE;
    if (this.speed > 0.35) {
      this.strideAccum += this.speed * dt;
      if (this.strideAccum >= stride) {
        this.strideAccum -= stride;
        this.onFootstep();
      }
    } else {
      // Part-charged, so setting off again lands a step promptly rather than
      // after a full stride of silence.
      this.strideAccum = stride * 0.6;
    }
    // Keep the bob tied to the stance's own top speed, so a crouch walk bobs
    // like a crouch walk and not like a slow stroll.
    if (dt > 0 && this.speed > 0.35) this.bobPhase += (this.speed / cap) * dt * 8.4;
    else this.bobPhase += dt * 1.1;
  }

  #syncCamera(dt) {
    const cap = this.crouching ? CROUCH_SPEED : WALK_SPEED;
    const amount = Math.min(1, this.speed / cap);
    // Crouched, the head has less room to move and the walk is a shuffle.
    const damp = 1 - 0.45 * this.crouchBlend;
    const bob = Math.sin(this.bobPhase) * 0.042 * amount * damp;
    const sway = Math.sin(this.bobPhase * 0.5) * 0.028 * amount * damp;

    const target = this.crouching ? 1 : 0;
    this.crouchBlend = approach(this.crouchBlend, target, CROUCH_RATE * dt);
    const eye = PLAYER_EYE + (PLAYER_CROUCH_EYE - PLAYER_EYE) * this.crouchBlend;

    this.camera.position.set(this.position.x, eye + bob, this.position.z);
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
 *
 * `height` is the current stance's box height. Anything whose underside clears
 * it is simply not there — which is how the low structure in Corridor B blocks a
 * standing player and passes a crouched one.
 */
function resolve(position, colliders, axis, height = PLAYER_HEIGHT) {
  for (let pass = 0; pass < 4; pass++) {
    const minX = position.x - PLAYER_RADIUS;
    const maxX = position.x + PLAYER_RADIUS;
    const minZ = position.z - PLAYER_RADIUS;
    const maxZ = position.z + PLAYER_RADIUS;
    let hit = false;

    for (const c of colliders) {
      if (c.minY >= height || c.maxY <= 0.05) continue;
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
