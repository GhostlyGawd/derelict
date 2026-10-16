import * as THREE from 'three';

const CENTRE = new THREE.Vector2(0, 0);

/**
 * Centre-screen raycast against registered interactives, with a short-range
 * cone fallback so the switches stay easy to hit with a thumb on mobile.
 */
export class Interactor {
  constructor(camera, { range = 2.2, assistRange = 1.7, assistAngle = 0.45, occluders = [] } = {}) {
    this.camera = camera;
    this.range = range;
    this.assistRange = assistRange;
    this.assistCos = Math.cos(assistAngle);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = range;
    this.targets = [];
    this.meshes = [];
    this.current = null;
    this._forward = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    /**
     * Phase 9: solid things the ray cannot pass through. The ship passes none,
     * and every interactive on it is out of reach from any other room. The
     * house has two floors, and a box upstairs is within reach of an eye in
     * the room below it, through the ceiling. Occluders stop the ray there.
     */
    this.occluders = occluders;
    this._sight = new THREE.Raycaster();
  }

  register(target) {
    this.targets.push(target);
    for (const mesh of target.meshes) {
      mesh.userData.interactTarget = target;
      this.meshes.push(mesh);
    }
  }

  clear() {
    for (const t of this.targets) t.highlight(false);
    this.targets.length = 0;
    this.meshes.length = 0;
    this.current = null;
  }

  update() {
    const found = this.#pick();
    if (found !== this.current) {
      this.current?.highlight(false);
      found?.highlight(true);
      this.current = found;
    }
    return found;
  }

  #pick() {
    this.raycaster.setFromCamera(CENTRE, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.occluders.length ? this.meshes.concat(this.occluders) : this.meshes,
      false
    );
    for (const hit of hits) {
      const target = hit.object.userData.interactTarget;
      if (!target) break; // an occluder: nothing behind it can be used
      if (target.canUse()) return target;
    }

    // Fallback: anything close and roughly centred in view.
    this.camera.getWorldDirection(this._forward);
    let best = null;
    let bestDot = this.assistCos;
    for (const target of this.targets) {
      if (!target.canUse()) continue;
      this._toTarget.copy(target.point).sub(this.camera.position);
      const distance = this._toTarget.length();
      if (distance > this.assistRange) continue;
      const dot = this._toTarget.divideScalar(distance).dot(this._forward);
      if (dot > bestDot && this.#inSight(this._toTarget, distance)) {
        bestDot = dot;
        best = target;
      }
    }
    if (best) return best;

    // Last: anything the player is standing over. A cell set down at your feet
    // lands under the crosshair no matter which way you face, so aim cannot be
    // part of picking it back up — proximity has to be the whole test, or
    // "put it down and take it again" would mean staring at the deck.
    for (const target of this.targets) {
      if (!target.underfoot || !target.canUse()) continue;
      this._toTarget.copy(target.point).sub(this.camera.position).setY(0);
      if (this._toTarget.length() <= target.underfoot) return target;
    }
    return null;
  }

  /** Nothing solid between the eye and a point `distance` away along `dir`. */
  #inSight(dir, distance) {
    if (!this.occluders.length) return true;
    this._sight.set(this.camera.position, dir);
    this._sight.far = Math.max(0, distance - 0.25);
    return this._sight.intersectObjects(this.occluders, false).length === 0;
  }
}
