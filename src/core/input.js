/**
 * Unified input for every control scheme described in the spec:
 *   desktop — pointer-lock mouse look, WASD, E to interact, C/Ctrl to crouch
 *   mobile  — a movement stick that starts in the lower-left zone, look from
 *             any other touch (a second touch while moving is always look),
 *             a context button and a held crouch button. See touchzones.js.
 *   pad     — the standard mapping, on either (phase 8, 8.3.4). See PAD.
 *
 * The rest of the game only reads `move`, `look`, `crouchHeld` and
 * `takeInteract()`, so it never has to care which scheme is live.
 */

import { PAD, deadzone, inStickZone, stickZone } from './touchzones.js';

/**
 * Phase 7. Goes up whenever the way raw input becomes `move` and `look` changes
 * on purpose. A trace replays only against the version that recorded it — a
 * deliberate change is supposed to make old traces diverge (7.3.2).
 *
 * Phase 8 added the pad without changing it: a new device changes nothing
 * about how a recorded touch or key is read, so the owner's traces still
 * replay (8.3.4).
 */
export const INPUT_VERSION = 2;

const LOOK_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.0042;
const STICK_RADIUS = 52;

export class Input {
  constructor({ canvas, stickEl, knobEl, interactBtn, crouchBtn }) {
    this.canvas = canvas;
    this.stickEl = stickEl;
    this.knobEl = knobEl;
    this.interactBtn = interactBtn;
    this.crouchBtn = crouchBtn;

    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.locked = false;
    this.enabled = false;
    this.onEscape = () => {};

    this.keys = new Set();
    this.interactQueued = false;

    this.touchCrouch = false;
    this.padCrouch = false;
    /**
     * The pad's raw state as the browser last reported it — `{ axes, buttons }`
     * or null — and the state it was in at the last frame, for edges. Raw, not
     * derived, because that is what a trace records (7.3.2).
     */
    this.pad = null;
    this.padBefore = null;
    this.padMoving = false;
    /** 'live' reads navigator.getGamepads(); 'replay' takes state only from setPadForTest. */
    this.padSource = 'live';
    /** Called with the new raw state whenever it changes, for the trace. */
    this.onPadChange = null;
    /** Start, pressed. The game decides whether that pauses or resumes. */
    this.onPadStart = () => {};
    /** Which hand last did something: 'keys', 'touch' or 'pad'. Names the prompt. */
    this.lastDevice = this.touch ? 'touch' : 'keys';

    this.stick = { id: null, ox: 0, oy: 0 };
    /** The stick's zone in pixels, for tools/mobile.mjs to judge against. */
    this.stickZone = stickZone;
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

  /**
   * Held, never toggled. A player who forgets they are crouched walks the rest
   * of the ship at half speed and reads it as the game being broken, which is
   * the whole reason 4.3.4 rejected a toggle.
   */
  get crouchHeld() {
    return (
      this.enabled && (this.touchCrouch || this.padCrouch || this.keys.has('KeyC') || this.keys.has('ControlLeft'))
    );
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
      this.touchCrouch = false;
      this.padCrouch = false;
      this.padMoving = false;
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

  // ----------------------------------------------------------------- pad

  /**
   * Reads the first standard-mapped pad the browser knows about and, if its
   * state has changed since the last frame, keeps it and reports it. Called at
   * the top of every frame, before the trace stamps the frame, so a recorded
   * change lands on the frame that used it.
   */
  pollPad() {
    if (this.padSource !== 'live') return;
    let raw = null;
    try {
      for (const p of navigator.getGamepads?.() || []) {
        if (p && p.connected && p.mapping === 'standard') {
          raw = {
            axes: p.axes.slice(0, 4).map((a) => Math.round(a * 1000) / 1000),
            buttons: p.buttons.slice(0, 16).map((b) => (b.pressed ? 1 : 0)),
          };
          break;
        }
      }
    } catch {
      /* no pad API: nothing to read */
    }
    if (samePad(raw, this.pad)) return;
    this.pad = raw;
    this.onPadChange?.(raw);
  }

  /** The pad's state from a trace, for tools/replay.mjs. From then on the real pad is ignored. */
  setPadForTest(raw) {
    this.padSource = 'replay';
    this.pad = raw;
  }

  /** Turns the pad's raw state into move, look, crouch and presses, for one frame of `dt`. */
  applyPad(dt) {
    const pad = this.pad;
    const before = this.padBefore;
    this.padBefore = pad;
    const pressed = (i) => Boolean(pad?.buttons[i]) && !before?.buttons[i];
    if (pad && pad !== before) this.lastDevice = 'pad';

    // Start works paused or not: it is how a pad player gets back in.
    if (pressed(PAD.buttons.pause)) this.onPadStart();
    if (!this.enabled) return;

    if (!pad) {
      this.padCrouch = false;
      if (this.padMoving) {
        this.padMoving = false;
        this.#syncKeyboardMove();
      }
      return;
    }
    const [mx, my] = deadzone(pad.axes[0] || 0, pad.axes[1] || 0, PAD.moveDeadzone);
    if (mx || my) {
      // A stick pushed up reads negative, as every pad reports it.
      this.move.x = mx;
      this.move.y = -my;
      this.padMoving = true;
    } else if (this.padMoving) {
      this.padMoving = false;
      this.move.x = 0;
      this.move.y = 0;
      this.#syncKeyboardMove();
    }
    const [lx, ly] = deadzone(pad.axes[2] || 0, pad.axes[3] || 0, PAD.lookDeadzone);
    const m = Math.hypot(lx, ly);
    if (m > 0) {
      const k = (m ** PAD.lookCurve / m) * PAD.lookSpeed * dt;
      this.look.dx += lx * k;
      this.look.dy += ly * k * PAD.pitchScale;
    }
    this.padCrouch = Boolean(pad.buttons[PAD.buttons.crouch]);
    if (pressed(PAD.buttons.interact)) this.interactQueued = true;
  }

  /** What the interact prompt should name: the key for whichever hand is in use, or nothing on touch. */
  get promptKey() {
    if (this.lastDevice === 'pad') return 'A';
    if (this.lastDevice === 'touch') return null;
    return 'E';
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
      this.lastDevice = 'keys';
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
    if (this.padMoving) return;
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
      if (e.movementX || e.movementY) this.lastDevice = 'keys';
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

  /**
   * Version 2 (phase 7). A touch starts the stick only inside the movement
   * zone, and only while no stick is held; any other touch that reaches here is
   * look. The buttons stop their own touches before they get this far. Version
   * 1 split the screen at the midline, which took a right thumb looking just
   * left of centre as movement and dropped it outright while the stick was
   * held.
   */
  #bindTouch() {
    const onStart = (e) => {
      this.lastDevice = 'touch';
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const inZone = inStickZone(t.clientX, t.clientY, window.innerWidth, window.innerHeight);
        if (inZone && this.stick.id === null) {
          this.stick.id = t.identifier;
          this.stick.ox = t.clientX;
          this.stick.oy = t.clientY;
          this.#placeStick(t.clientX, t.clientY);
        } else if (this.lookTouch.id === null) {
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
      this.lastDevice = 'touch';
      e.stopPropagation();
      e.preventDefault();
      if (this.enabled) this.interactQueued = true;
    }, opts);
    this.interactBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.enabled) this.interactQueued = true;
    });

    // Crouch is held on touch too. It stops propagation so the surrounding
    // right-half drag region does not also claim the finger as a look touch —
    // the same guard the interact button already needs.
    if (this.crouchBtn) {
      const set = (down) => (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.touchCrouch = down && this.enabled;
        this.crouchBtn.classList.toggle('held', this.touchCrouch);
      };
      this.crouchBtn.addEventListener('touchstart', set(true), opts);
      this.crouchBtn.addEventListener('touchend', set(false), opts);
      this.crouchBtn.addEventListener('touchcancel', set(false), opts);
    }
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

function samePad(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  for (let i = 0; i < a.axes.length; i++) if (a.axes[i] !== b.axes[i]) return false;
  for (let i = 0; i < a.buttons.length; i++) if (a.buttons[i] !== b.buttons[i]) return false;
  return a.axes.length === b.axes.length && a.buttons.length === b.buttons.length;
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
