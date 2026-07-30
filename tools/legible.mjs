/**
 * Signage checks — the two phase 3 done-bars that can be decided mechanically.
 *
 *   1. Every space is named, once, correctly. One label per SPACES entry, each
 *      carrying that entry's own name, none duplicated or missing.
 *   2. Labels are big enough to read where they matter. Cap height is measured
 *      in *backbuffer* pixels, not CSS pixels, on the worst configuration the
 *      game ships: a portrait phone at the mobile internal render scale.
 *
 * What bar 2 is and is not. It fixes a reading distance and asks how many real
 * pixels the letterforms get at that distance — which catches the regression
 * where a label silently stops being readable because the render scale, the
 * atlas cap height, the texture crunch or a placement moved. It cannot tell
 * anyone whether the type is any good. That is the owner's bar and is marked as
 * such in the spec.
 *
 *   node tools/legible.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

/**
 * Where a player stands when they stop to read a bulkhead. Fixed rather than
 * derived, because "from the doorway" differs per room and a moving reference
 * would make the floor unfalsifiable.
 */
const READING_DISTANCE = 4;
/** Backbuffer pixels of cap height a compartment label must clear. */
const FLOOR = 8;
/** A plate is read from arm's length, so it is measured closer and held lower. */
const PLACARD_DISTANCE = 1.6;
const PLACARD_FLOOR = 6;

const errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
// A portrait phone: the narrowest frame and the lowest internal scale we ship.
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

console.log(`legible: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(900);

const state = await page.evaluate(() => {
  const g = window.__derelict;
  return {
    spaces: g.spaces.map((s) => ({ id: s.id, name: s.name })),
    labels: g.signage.labels,
    hasAtlas: Boolean(g.signage.metrics),
    buffer: g.view.size,
    scale: g.view.scale,
    fov: g.camera.fov,
  };
});

expect('the glyph atlas loaded', state.hasAtlas, 'signage has no metrics — atlas missing from the manifest');
if (!state.hasAtlas) {
  await browser.close();
  process.exit(1);
}

console.log(
  `\n  phone frame 390×844, internal ${state.buffer.width}×${state.buffer.height} ` +
    `at ${state.scale.toFixed(2)}×, vfov ${state.fov.toFixed(1)}°`
);

// ---- Bar 1: every space named, once, correctly -----------------------------
console.log('\n  naming');
const bySpace = new Map();
for (const l of state.labels) {
  if (bySpace.has(l.space)) {
    failures++;
    console.log(`  FAIL  ${l.space} is labelled more than once`);
  }
  bySpace.set(l.space, l);
}
for (const space of state.spaces) {
  const label = bySpace.get(space.id);
  expect(
    `${space.id} is named "${space.name}"`,
    label && label.text === space.name.toUpperCase(),
    label ? `label reads "${label.text}"` : 'no label for this space'
  );
}
for (const l of state.labels) {
  if (!state.spaces.some((s) => s.id === l.space)) {
    failures++;
    console.log(`  FAIL  label "${l.text}" names "${l.space}", which is not a space`);
  }
}

// ---- Bar 2: cap height in backbuffer pixels --------------------------------
// On-axis measurement: with the label centred in view, its subtended fraction
// of the frame is cap / (2 d tan(vfov/2)), and the backbuffer height converts
// that to real pixels.
const vfov = (state.fov * Math.PI) / 180;
const frameAt = (d) => 2 * d * Math.tan(vfov / 2);
const capPixels = (cap, d) => (cap / frameAt(d)) * state.buffer.height;

console.log(`\n  cap height at ${READING_DISTANCE} m, floor ${FLOOR} px`);
for (const l of state.labels) {
  const px = capPixels(l.cap, READING_DISTANCE);
  expect(
    `${l.text.padEnd(16)} ${px.toFixed(1)} px`,
    px >= FLOOR,
    `${px.toFixed(1)} px is under the ${FLOOR} px floor`
  );
}

const placards = await page.evaluate(() => window.__derelict.signage.placards || []);
if (placards.length) {
  console.log(`\n  placards at ${PLACARD_DISTANCE} m, floor ${PLACARD_FLOOR} px`);
  for (const p of placards) {
    const px = capPixels(p.cap, PLACARD_DISTANCE);
    expect(
      `${p.text.padEnd(16)} ${px.toFixed(1)} px`,
      px >= PLACARD_FLOOR,
      `${px.toFixed(1)} px is under the ${PLACARD_FLOOR} px floor`
    );
  }
}

// ---- No marking runs off the wall it is painted on -------------------------
// The Engine Annex label sat above the main opening, where only 2.3 m of solid
// bulkhead separates it from the shortcut hatch — and it is 2.2 m wide, so its
// tail hung over the hatch. That was caught by eye, which is exactly the kind
// of thing that should be an assertion: every opening is declared in WALLS.
console.log('\n  overhang');
const overhung = await page.evaluate(() => {
  const g = window.__derelict;
  const marks = [...g.signage.labels, ...g.signage.placards].filter((m) => m.width);
  const out = [];
  for (const m of marks) {
    // facing ±Z sits on a z-wall and runs along x; facing ±X runs along z.
    const onZ = Math.abs(m.facing[2]) > 0.5;
    const at = onZ ? m.pos[2] : m.pos[0];
    const centre = onZ ? m.pos[0] : m.pos[2];
    const half = m.width / 2;
    // Matched on the run as well as the plane: two walls share z = -1.3 (one
    // per corridor) and two share z = -9, so the plane alone picks the wrong
    // one and reports a false overhang.
    const wall = g.walls.find(
      (w) =>
        (onZ ? w.axis === 'z' : w.axis === 'x') &&
        Math.abs(w.at - at) < 0.45 &&
        centre >= w.from &&
        centre <= w.to
    );
    if (!wall) {
      out.push({ text: m.text, why: 'not mounted on any declared wall' });
      continue;
    }
    // Off the end of the run entirely.
    if (centre - half < wall.from || centre + half > wall.to) {
      out.push({ text: m.text, why: `runs past the end of the wall at ${wall.axis}=${wall.at}` });
      continue;
    }
    for (const o of wall.openings || []) {
      const lo = o.center - o.width / 2;
      const hi = o.center + o.width / 2;
      // Only an overlap that is also below the opening's lintel is a hole.
      const overlaps = centre - half < hi && centre + half > lo;
      if (overlaps && m.pos[1] < o.height) {
        out.push({ text: m.text, why: `overhangs the ${o.id || 'doorway'} opening` });
        break;
      }
    }
  }
  return out;
});
expect(
  'no marking overhangs an opening or runs off its wall',
  overhung.length === 0,
  overhung.map((o) => `${o.text}: ${o.why}`).join('; ')
);

// ---- Every label is actually in front of the wall it is painted on ---------
// A marking sunk into its own bulkhead renders perfectly and is invisible from
// every position a player can occupy, which is how two of these shipped once.
console.log('\n  placement');
const buried = await page.evaluate(() => {
  const g = window.__derelict;
  const out = [];
  for (const mesh of g.signage.group.children) {
    mesh.updateMatrixWorld();
    const origin = mesh.getWorldPosition(new mesh.position.constructor());
    // Step a little along the label's own normal and check nothing solid is
    // between that point and the surface.
    const n = { x: Math.sin(mesh.rotation.y), z: Math.cos(mesh.rotation.y) };
    const probe = { x: origin.x + n.x * 0.06, z: origin.z + n.z * 0.06 };
    const hit = g.staticColliders.find(
      (c) =>
        probe.x > c.minX && probe.x < c.maxX && probe.z > c.minZ && probe.z < c.maxZ &&
        origin.y > c.minY && origin.y < c.maxY
    );
    if (hit) out.push({ at: [+origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2)] });
  }
  return out;
});
expect(
  'no marking is buried inside its own bulkhead',
  buried.length === 0,
  `${buried.length} sunk into geometry, e.g. ${JSON.stringify(buried[0]?.at)}`
);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nlegible: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nlegible: OK — every space named once, and every marking clears the pixel floor');
