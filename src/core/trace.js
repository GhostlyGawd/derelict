/**
 * Phase 7 — the trace (7.3.2).
 *
 * With `?trace` in the URL, a run is recorded: every raw input event and the
 * time step of every frame, against the viewport it was played at. Raw, not
 * derived — touches as the browser delivered them, not the move and look values
 * the input layer made of them — because the bug this exists for lived in that
 * layer, and a recording of its output would have replayed the bug as correct
 * input.
 *
 * Nothing leaves the device. The end card offers the file, and that is all.
 * Without the flag none of this is constructed.
 *
 * Events are stamped with the frame they arrived before: an event stamped `n`
 * reached the page after frame n - 1 ran and before frame n did, which is
 * exactly when the game read it. tools/replay.mjs dispatches each one through
 * the real listeners at the same point and then steps the frame with the
 * recorded time step.
 *
 * Encoding, kept terse because a five-minute touch run is tens of thousands of
 * events:
 *
 *   ['k', frame, down, code, repeat]          key
 *   ['m', frame, movementX, movementY]        mouse look (pointer locked)
 *   ['b', frame, button]                      mouse button on the view
 *   ['t', frame, kind, target, [[id, x, y]]]  touches: kind s/m/e/c, target
 *                                             w (the view), i (interact), c (crouch)
 *   ['l', frame, locked]                      pointer lock gained or lost
 *   ['u', frame, id]                          an overlay button: resume, restart
 *   ['r', frame, scale]                       the render scale changed (not input;
 *                                             replay skips it, the profiler reads it)
 *
 * Format version 2 (phase 8, 8.3.2) adds what a frame-time report needs to be
 * read honestly: `intervals`, the raw time between frames in milliseconds
 * before the game clamps its step at 50 ms, and `device`, the GPU and the
 * render scale the run started at. Version 1 traces have neither, and replay
 * reads both.
 */

export const TRACE_FORMAT = 'derelict-trace';

/** Every this many frames the run's state is written down, to find a divergence. */
const CHECKPOINT_EVERY = 30;

export function traceRequested() {
  try {
    return new URLSearchParams(window.location.search).has('trace');
  } catch {
    return false;
  }
}

export class TraceRecorder {
  constructor(game, { inputVersion }) {
    this.game = game;
    this.inputVersion = inputVersion;
    this.recording = false;
    this.frame = 0;
    this.frames = [];
    this.intervals = [];
    this.events = [];
    this.checkpoints = [];
    this.final = null;
    this.#listen();
  }

  /** Called when a run starts. A restart starts a fresh trace. */
  begin() {
    this.recording = true;
    this.frame = 0;
    this.frames = [];
    this.intervals = [];
    this.events = [];
    this.checkpoints = [];
    this.final = null;
    this.device = { renderer: rendererName(this.game), scale: this.game.view?.scale ?? null };
    this.viewport = {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
  }

  /**
   * Called by the frame loop with the time step it is about to use, and the
   * raw interval it was clamped from, in milliseconds.
   */
  tick(dt, raw = dt * 1000) {
    if (!this.recording) return;
    // Called at the top of a frame, so what the game holds right now is the
    // state after `frame` updates. The checkpoint is taken here, before this
    // frame's update, and labelled with the count it reflects — the first
    // version labelled it one frame late and the round trip caught it.
    if (this.frame > 0 && this.frame % CHECKPOINT_EVERY === 0) {
      this.checkpoints.push(snapshot(this.game, this.frame));
    }
    this.frames.push(Math.round(dt * 1e6) / 1e6);
    this.intervals.push(Math.round(raw * 10) / 10);
    this.frame++;
  }

  /** Called when the end card goes up. */
  /** The render scale changed under the watchdog. */
  scaleChanged(scale) {
    if (this.recording) this.events.push(['r', this.frame, scale]);
  }

  end() {
    if (!this.recording) return;
    this.recording = false;
    this.final = snapshot(this.game, this.frame);
  }

  export() {
    return {
      format: TRACE_FORMAT,
      version: 2,
      input: this.inputVersion,
      recorded: new Date().toISOString(),
      viewport: this.viewport,
      device: this.device,
      touch: this.game.input.usingTouch,
      frames: this.frames,
      intervals: this.intervals,
      events: this.events,
      checkpoints: this.checkpoints,
      final: this.final,
    };
  }

  /**
   * Hands the file over. A share sheet where the phone has one — that is the
   * way off an iPhone that does not involve the Files app — and a plain
   * download everywhere else.
   */
  async save() {
    const name = `derelict-trace-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    const blob = new Blob([JSON.stringify(this.export())], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'DERELICT trace' });
        return;
      }
    } catch {
      /* fall through to a download */
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // Capture phase on the window: every event is seen before any handler runs,
  // including the buttons that stop propagation to keep their touches to
  // themselves.
  #listen() {
    const push = (e) => this.recording && this.events.push(e);
    const opts = { capture: true, passive: true };

    for (const type of ['keydown', 'keyup']) {
      window.addEventListener(
        type,
        (e) => push(['k', this.frame, type === 'keydown' ? 1 : 0, e.code, e.repeat ? 1 : 0]),
        opts
      );
    }
    window.addEventListener('mousemove', (e) => {
      if (e.movementX || e.movementY) push(['m', this.frame, e.movementX, e.movementY]);
    }, opts);
    window.addEventListener('mousedown', (e) => {
      if (e.target === this.game.canvas) push(['b', this.frame, e.button]);
    }, opts);

    const KIND = { touchstart: 's', touchmove: 'm', touchend: 'e', touchcancel: 'c' };
    for (const type of Object.keys(KIND)) {
      window.addEventListener(type, (e) => {
        const target = e.target?.closest?.('#touch-interact')
          ? 'i'
          : e.target?.closest?.('#touch-crouch')
            ? 'c'
            : 'w';
        const touches = [...e.changedTouches].map((t) => [
          t.identifier,
          Math.round(t.clientX * 10) / 10,
          Math.round(t.clientY * 10) / 10,
        ]);
        push(['t', this.frame, KIND[type], target, touches]);
      }, opts);
    }

    document.addEventListener('pointerlockchange', () => {
      push(['l', this.frame, document.pointerLockElement ? 1 : 0]);
    });
    for (const id of ['resume', 'restart']) {
      document.getElementById(id)?.addEventListener('click', () => push(['u', this.frame, id]), true);
    }
  }
}

/** The GPU, as the browser will name it. Some browsers only say the vendor. */
function rendererName(game) {
  try {
    const gl = game.view.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    return null;
  }
}

/** What a run looks like at one frame. Shared with tools/replay.mjs. */
export function snapshot(game, frame) {
  const p = game.player.position;
  return [
    frame,
    game.phase,
    game.cells,
    Math.round(p.x * 1e4) / 1e4,
    Math.round(p.z * 1e4) / 1e4,
    Math.round(game.player.yaw * 1e4) / 1e4,
  ];
}
