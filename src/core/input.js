/**
 * Unified input for both control schemes described in the spec:
 *   desktop — pointer-lock mouse look, WASD, E to interact
 *   mobile  — left virtual joystick, right-side drag to look, context button
 *
 * The rest of the game only reads `move`, `look` and `takeInteract()`, so it
 * never has to care which scheme is live.
 */

const LOOK_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.0042;
const STICK_RADIUS = 52;

export class Input {
  constructor({ canvas, stickEl, knobEl, interactBtn }) {
    this.canvas = canvas;
    this.stickEl = stickEl;
    this.knobEl = knobEl;
    this.interactBtn = interactBtn;

    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.locked = false;
    this.enabled = false;
    this.onEscape = () => {};

    this.keys = new Set();
    this.interactQueued = false;

    this.stick = { id: null, ox: 0, oy: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };

    this.#bindKeyboard();
    this.#bindPointer();
    if (this.touch) this.#bindTouch();
  }

  get usingTouch() {
    return this.touch;
  }

  /** True once per press. */
  takeInteract() {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  /** Consumes the accumulated look delta for this frame. */
  takeLook() {
    const out = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0;
    this.look.dy = 0;
    return out;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.interactQueued = false;
      this.move.x = 0;
      this.move.y = 0;
      this.look.dx = 0;
      this.look.dy = 0;
      this.stick.id = null;
      this.lookTouch.id = null;
      this.#drawKnob(0, 0);
    }
  }

  /**
   * Pointer lock is best-effort. Safari can refuse it outright and Chrome
   * refuses a re-request made too soon after an exit — neither is fatal, since
   * movement still works and clicking the view asks again.
   */
  requestPointerLock() {
    if (this.touch) return;
    try {
      this.canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch {
      /* unavailable — play continues without mouse look until the next click */
    }
  }

  releasePointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  // ------------------------------------------------------------ keyboard

  #bindKeyboard() {
    const held = (code, down) => {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      this.#syncKeyboardMove();
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        this.onEscape();
        return;
      }
      if (!this.enabled) return;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        this.interactQueued = true;
        e.preventDefault();
        return;
      }
      held(e.code, true);
      if (MOVE_CODES.has(e.code)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => held(e.code, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.#syncKeyboardMove();
    });
  }

  #syncKeyboardMove() {
    if (this.touch && this.stick.id !== null) return;
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(fwd, str) || 1;
    this.move.y = fwd / len;
    this.move.x = str / len;
  }

  // ------------------------------------------------------------- pointer

  #bindPointer() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.onEscape();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.look.dx += e.movementX * LOOK_SENSITIVITY;
      this.look.dy += e.movementY * LOOK_SENSITIVITY;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.touch || !this.enabled || e.button !== 0) return;
      // Clicking the view re-acquires a lock that was refused or dropped,
      // rather than leaving the player without mouse look.
      if (this.locked) this.interactQueued = true;
      else this.requestPointerLock();
    });
  }

  // --------------------------------------------------------------- touch

  #bindTouch() {
    const half = () => window.innerWidth * 0.5;

    const onStart = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX < half() && this.stick.id === null) {
          this.stick.id = t.identifier;
          this.stick.ox = t.clientX;
          this.stick.oy = t.clientY;
          this.#placeStick(t.clientX, t.clientY);
        } else if (t.clientX >= half() && this.lookTouch.id === null) {
          this.lookTouch.id = t.identifier;
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    };

    const onMove = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          const dx = t.clientX - this.stick.ox;
          const dy = t.clientY - this.stick.oy;
          const dist = Math.hypot(dx, dy);
          const clamped = Math.min(dist, STICK_RADIUS);
          const nx = dist > 0 ? (dx / dist) * clamped : 0;
          const ny = dist > 0 ? (dy / dist) * clamped : 0;
          this.#drawKnob(nx, ny);
          const deadzone = 6;
          const mag = Math.max(0, clamped - deadzone) / (STICK_RADIUS - deadzone);
          const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
          this.move.x = dir.x * mag;
          this.move.y = -dir.y * mag;
        } else if (t.identifier === this.lookTouch.id) {
          this.look.dx += (t.clientX - this.lookTouch.x) * TOUCH_LOOK_SENSITIVITY;
          this.look.dy += (t.clientY - this.lookTouch.y) * TOUCH_LOOK_SENSITIVITY;
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
      e.preventDefault();
    };

    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.id = null;
          this.move.x = 0;
          this.move.y = 0;
          this.#drawKnob(0, 0);
          this.#syncKeyboardMove();
        } else if (t.identifier === this.lookTouch.id) {
          this.lookTouch.id = null;
        }
      }
    };

    const opts = { passive: false };
    window.addEventListener('touchstart', onStart, opts);
    window.addEventListener('touchmove', onMove, opts);
    window.addEventListener('touchend', onEnd, opts);
    window.addEventListener('touchcancel', onEnd, opts);

    this.interactBtn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.enabled) this.interactQueued = true;
    }, opts);
    this.interactBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.enabled) this.interactQueued = true;
    });
  }

  #placeStick(x, y) {
    const size = this.stickEl.offsetWidth || 132;
    this.stickEl.style.left = `${x - size / 2}px`;
    this.stickEl.style.top = `${y - size / 2}px`;
    this.stickEl.style.bottom = 'auto';
  }

  #drawKnob(x, y) {
    this.knobEl.style.transform = `translate(${x}px, ${y}px)`;
  }
}

const MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);
