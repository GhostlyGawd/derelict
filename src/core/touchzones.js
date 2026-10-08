/**
 * Phase 7 — where each thumb's touches belong (7.3.1).
 *
 * The table the input layer assigns touches by, and the one tools/mobile.mjs
 * judges it against — one copy, the way `layout.js` is the one copy of the
 * level. Fractions of the viewport, so a phone and a tablet get the same shape.
 *
 * Only the movement stick has a zone. Everything else that is not a button is
 * look, and a second touch while the stick is held is look wherever it lands.
 * Before this the screen was split at the midline: on a phone in portrait the
 * right half is about 195 px, the buttons fill the bottom of it, and a right
 * thumb looking just left of centre took the stick and walked — or, with the
 * stick already held, was dropped. That was the owner's report after phase 6.
 */
export const TOUCH_ZONES = {
  // The lower part of the left side: where a left thumb rests, and nowhere a
  // right thumb reaching across to look is likely to land.
  portrait: { stick: { x: [0, 0.44], y: [0.52, 1] } },
  // The left third, as 7.3.1 says. Landscape has the width to spare.
  landscape: { stick: { x: [0, 0.34], y: [0.2, 1] } },
};

/** The stick's zone in pixels for a viewport of `w` × `h`. */
export function stickZone(w, h) {
  const z = (h >= w ? TOUCH_ZONES.portrait : TOUCH_ZONES.landscape).stick;
  return { x0: z.x[0] * w, x1: z.x[1] * w, y0: z.y[0] * h, y1: z.y[1] * h };
}

export function inStickZone(x, y, w, h) {
  const z = stickZone(w, h);
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
}

/**
 * Phase 8 — the pad (8.3.4), in the same table so the code and the harness
 * read the same numbers. The standard mapping and only that: left stick moves,
 * right stick looks, A interacts, B held crouches, Start pauses.
 */
export const PAD = {
  /** Radial, on the left stick. Below it the stick is at rest. */
  moveDeadzone: 0.18,
  /** Radial, on the right stick. */
  lookDeadzone: 0.12,
  /** Radians per second at full deflection. */
  lookSpeed: 2.8,
  /** Above 1, small deflections turn slowly and full ones fast. */
  lookCurve: 1.7,
  /** Pitch is slower than yaw, as on every pad shooter. */
  pitchScale: 0.7,
  buttons: { interact: 0, crouch: 1, pause: 9 },
};

/** A stick's (x, y) with a radial dead zone, rescaled so the edge of the zone reads as zero. */
export function deadzone(x, y, zone) {
  const m = Math.hypot(x, y);
  if (m <= zone) return [0, 0];
  const k = Math.min(1, (m - zone) / (1 - zone)) / m;
  return [x * k, y * k];
}
