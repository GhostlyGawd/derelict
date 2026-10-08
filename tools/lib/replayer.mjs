/**
 * Playing a trace back — shared by tools/replay.mjs, tools/profile.mjs and
 * tools/monkey.mjs, so the three can never disagree about what a replay is.
 *
 * A trace is raw input stamped with the frame it arrived before, plus the time
 * step of every frame (7.3.2). Replay boots the built game at the recorded
 * viewport, turns the browser's clock off, and for each frame dispatches that
 * frame's events through the real listeners and steps the game's own frame
 * body with the recorded step. It skips drawing, which is most of a frame's
 * cost under a software rasteriser; what drawing also did — bring every world
 * matrix up to date for the next frame's interaction ray — still happens.
 */
import { chromium } from 'playwright';

export async function launch() {
  return chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

/** A page shaped like the device the trace was recorded on. */
export async function deviceFor(browser, trace, errors = []) {
  const context = await browser.newContext({
    viewport: { width: Math.round(trace.viewport.w), height: Math.round(trace.viewport.h) },
    deviceScaleFactor: trace.viewport.dpr || 1,
    hasTouch: Boolean(trace.touch),
    isMobile: Boolean(trace.touch),
    // Phase 8 adds a service worker. Every replay measures the game, never
    // the cache, so none of them lets one register.
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { context, page };
}

export async function boot(page, base, query = '') {
  await page.goto(`${base}${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
}

/**
 * Plays a trace back in a fresh page and returns the replay's own checkpoints
 * and final state.
 *
 * `perFrame`, if given, is the source of a function `(g, frame) => value` run
 * in the page after every frame; the values come back as `samples`. A value of
 * `{ stop: reason }` ends the replay there — the monkey uses that to stop at
 * the first broken invariant. `after`, likewise, is run once at the end, and
 * may be async; its value comes back as `after`. `inject` is script source
 * added to the page once it has booted, before the run starts.
 */
export async function replay(browser, base, trace, { errors = [], perFrame = null, after = null, inject = [] } = {}) {
  const { context, page } = await deviceFor(browser, trace, errors);
  await boot(page, base);
  for (const content of inject) await page.addScriptTag({ content });
  await page.evaluate((desk) => {
    // Headless Chromium grants a real pointer lock, and its change events land
    // whenever the wall clock says: a replay once lost its lock on a pause the
    // recording had kept, and stopped being able to turn. Switched off before
    // the run starts, so the only lock changes are the ones the trace recorded.
    if (desk) window.__derelict.canvas.requestPointerLock = () => Promise.resolve();
    window.__derelict.manualClockOnStart = true;
    document.getElementById('start').click();
  }, !trace.touch);
  await page.waitForFunction(
    () => window.__derelict?.phase === 'playing' && window.__derelict.manualClock,
    null,
    { timeout: 15000 }
  );

  const result = await page.evaluate(
    async ({ t, perFrameSource, afterSource }) => {
      const g = window.__derelict;
      const probe = perFrameSource ? new Function(`return (${perFrameSource})`)() : null;
      const finish = afterSource ? new Function(`return (${afterSource})`)() : null;
      const canvas = g.canvas;
      const targets = {
        w: canvas,
        i: document.getElementById('touch-interact'),
        c: document.getElementById('touch-crouch'),
      };
      const TYPE = { s: 'touchstart', m: 'touchmove', e: 'touchend', c: 'touchcancel' };
      // Desktop traces were played with the pointer locked; headless Chromium
      // cannot take a real lock, so the input layer is told it has one, and any
      // recorded change of lock is applied as it happened.
      if (!t.touch) {
        g.input.locked = true;
      }

      const live = new Map(); // identifier -> [x, y], for the `touches` list
      const dispatch = (e) => {
        const [kind, , ...rest] = e;
        if (kind === 'k') {
          const [down, code, repeat] = rest;
          window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, repeat: Boolean(repeat), bubbles: true }));
        } else if (kind === 'm') {
          document.dispatchEvent(new MouseEvent('mousemove', { movementX: rest[0], movementY: rest[1], bubbles: true }));
        } else if (kind === 'b') {
          canvas.dispatchEvent(new MouseEvent('mousedown', { button: rest[0], bubbles: true }));
        } else if (kind === 't') {
          const [k, where, touches] = rest;
          const target = targets[where] || canvas;
          const changed = touches.map(
            ([identifier, clientX, clientY]) => new Touch({ identifier, target, clientX, clientY })
          );
          for (const [id, x, y] of touches) {
            if (k === 'e' || k === 'c') live.delete(id);
            else live.set(id, [x, y]);
          }
          const all = [...live.entries()].map(
            ([identifier, [clientX, clientY]]) => new Touch({ identifier, target, clientX, clientY })
          );
          target.dispatchEvent(
            new TouchEvent(TYPE[k], { changedTouches: changed, touches: all, bubbles: true, cancelable: true })
          );
        } else if (kind === 'p') {
          // A pad's state, as the browser reported it when it changed (8.3.4).
          g.input.setPadForTest?.(rest[0] === null ? null : { axes: rest[0], buttons: rest[1] });
        } else if (kind === 'l') {
          g.input.locked = Boolean(rest[0]);
          if (!rest[0]) g.input.onEscape();
        } else if (kind === 'u') {
          document.getElementById(rest[0])?.click();
        }
        // 'r' is the render scale changing; it is a record, not input.
      };

      const snap = (frame) => {
        const p = g.player.position;
        const r = (v) => Math.round(v * 1e4) / 1e4;
        return [frame, g.phase, g.cells, r(p.x), r(p.z), r(g.player.yaw)];
      };

      const checkpoints = [];
      const samples = [];
      let stopped = null;
      let next = 0;
      const events = t.events;
      let frame = 0;
      for (; frame < t.frames.length; frame++) {
        while (next < events.length && events[next][1] <= frame) dispatch(events[next++]);
        try {
          g.stepForTest(t.frames[frame], { render: false });
        } catch (err) {
          stopped = { frame, reason: `exception: ${err?.message || err}` };
          break;
        }
        if ((frame + 1) % 30 === 0) checkpoints.push(snap(frame + 1));
        if (probe) {
          const v = probe(g, frame);
          if (v && v.stop) {
            stopped = { frame, reason: v.stop };
            break;
          }
          samples.push(v);
        }
        // Let the page breathe now and then: timers the game set (a restart, the
        // end card) still run on the wall clock.
        if (frame % 500 === 499) await new Promise((r) => setTimeout(r, 0));
      }
      if (!stopped) while (next < events.length) dispatch(events[next++]);

      // The end card goes up on a wall-clock timer after the fade. A run that
      // reached the threshold should reach 'ended'; give it the time.
      if (!stopped && t.final?.[1] === 'ended') {
        for (let i = 0; i < 80 && g.phase !== 'ended'; i++) await new Promise((r) => setTimeout(r, 100));
      }
      const ended = snap(Math.min(frame, t.frames.length));
      const tail = !stopped && finish ? await finish(g) : null;
      return { checkpoints, final: ended, samples, stopped, after: tail };
    },
    { t: trace, perFrameSource: perFrame, afterSource: after }
  );

  await context.close();
  return result;
}
