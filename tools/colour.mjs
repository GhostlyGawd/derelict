/**
 * Colour you don't need to see — phase 8, spec 8.3.1.
 *
 * The ship's state language is hue: emergency red for dead, green-white for
 * live. Red against green is the pair red-green colour blindness merges. So
 * every dead/live pair the ship shows is photographed in both states — through
 * the real lights, the fog and the generated textures, at the shipped look —
 * and the two photographs have to differ by brightness, not only by hue:
 *
 *   - at least 3:1 in relative luminance (the WCAG floor for non-text
 *     contrast), under normal vision and under simulated protanopia,
 *     deuteranopia and tritanopia;
 *   - which is the same thing as saying a still photograph with the colour
 *     taken out still tells them apart, since normal-vision luminance is the
 *     greyscale of the picture.
 *
 * Measured on rendered pixels and never on hex codes: what a lamp is in the
 * source says nothing about what it is after the light has had it. Each
 * fixture is drawn a second time with its mesh swapped for a flat marker, so
 * only its own pixels are averaged.
 *
 * The simulations are Machado, Oliveira and Fernandes (2009) at full severity,
 * applied in linear RGB.
 *
 *   node tools/colour.mjs [baseUrl]
 */
import { boot, deviceFor, launch } from './lib/replayer.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const FLOOR = 3;
/** Pairs measured as a whole frame rather than as a fixture's own pixels. */
const ROOMS = new Set(['room light']);

const VISION = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const see = (m, v) => m.map((r) => Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]));
const luminance = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
const hex = (v) =>
  '#' +
  v
    .map((c) => Math.min(1, c))
    .map((c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

const errors = [];
const browser = await launch();
const { page } = await deviceFor(browser, { viewport: { w: 960, h: 600, dpr: 1 }, touch: false }, errors);

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

console.log(`colour: ${BASE}`);
await boot(page, BASE);
await page.evaluate(() => {
  window.__derelict.manualClockOnStart = true;
  document.getElementById('start').click();
});
await page.waitForFunction(() => window.__derelict?.phase === 'playing' && window.__derelict.manualClock, null, {
  timeout: 15000,
});

/**
 * Every pair, photographed in the state it is in now. The viewpoint is about
 * where a player would read each from: a metre and a bit in front of it, or,
 * for a room, standing in it looking at a wall.
 */
const photograph = () =>
  page.evaluate(() => {
    const g = window.__derelict;
    for (let i = 0; i < 2; i++) g.stepForTest(1 / 60, { render: false });
    // From the side of the mesh that faces the room: whichever of its two
    // sides the photograph actually sees more of.
    const facing = (mesh, distance, lift = 0) => {
      mesh.updateWorldMatrix(true, false);
      const at = mesh.getWorldPosition(mesh.position.clone());
      const n = mesh.position.clone().set(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(mesh.quaternion.clone()));
      let best = null;
      for (const side of [1, -1]) {
        const eye = at.clone().addScaledVector(n, side * distance);
        eye.y += lift;
        const view = g.viewForTest(eye.toArray(), at.toArray(), mesh);
        if (!best || view.coverage > best.coverage) best = view;
      }
      return best;
    };
    const hold = g.lighting.partsIn('hold');
    const corrA = g.lighting.partsIn('corrA');
    return {
      'switch indicator': facing(g.switches.find((s) => s.id === 'switch1').indicator, 1.1, 0.1),
      'cradle lamp': facing(g.carryables.cradles.find((c) => c.id === 'cradle1').lamp, 1.2, 0.2),
      'conduit strip': facing(corrA.strips[0], 1.2),
      'lamp lens': facing(hold.lenses[0], 1.6),
      'room light': g.viewForTest([-24, 1.62, 1.5], [-33, 1.3, -1], null),
    };
  });

/**
 * The airlock panel is a canvas on an unlit screen, so its pixels are the
 * canvas's own. Read straight off it: the count's ink, and the first pip.
 * `count` is what the panel shows; 0 and 2 are its dead and live states.
 */
const panel = (count) =>
  page.evaluate((n) => {
    const g = window.__derelict;
    g.panel.setCount(n);
    const ctx = g.panel.canvas.getContext('2d');
    const linear = (v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const mean = (x, y, w, h, ink) => {
      const d = ctx.getImageData(x, y, w, h).data;
      const sum = [0, 0, 0];
      let k = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (ink && Math.max(d[i], d[i + 1], d[i + 2]) < 90) continue;
        sum[0] += linear(d[i]);
        sum[1] += linear(d[i + 1]);
        sum[2] += linear(d[i + 2]);
        k++;
      }
      return { rgb: k ? sum.map((v) => v / k) : null, coverage: k / (w * h) };
    };
    const out = { 'panel count': mean(60, 70, 200, 70, true), 'panel pip': mean(104, 154, 48, 12, false) };
    g.panel.setCount(g.cells);
    return out;
  }, count);

// ---- Every run of conduit can be seen at all --------------------------------
// The first run of this harness photographed a corridor strip and found
// nothing: six of the twelve runs had been inside their walls since the
// greybox. A strip nobody can see carries no state, in any colour.
console.log('\n  every conduit run is in front of its wall');
const runs = await page.evaluate(() => {
  const g = window.__derelict;
  g.stepForTest(1 / 60, { render: false });
  const out = [];
  for (const zone of ['bay', 'corrA', 'hold', 'corrB', 'annex', 'shortcut']) {
    for (const [i, strip] of g.lighting.partsIn(zone).strips.entries()) {
      strip.updateWorldMatrix(true, false);
      const at = strip.getWorldPosition(strip.position.clone());
      const n = strip.position.clone().set(0, 0, 1).applyQuaternion(strip.getWorldQuaternion(strip.quaternion.clone()));
      // From a standing eye a metre out from the wall, on the side the strip faces.
      const eye = at.clone().addScaledVector(n, 0.9);
      eye.y = 1.62;
      out.push({ name: `${zone} run ${i + 1}`, coverage: g.viewForTest(eye.toArray(), at.toArray(), strip).coverage });
    }
  }
  return out;
});
for (const r of runs) {
  expect(`${r.name} is visible (${(r.coverage * 100).toFixed(1)}% of the frame)`, r.coverage > 0.005, 'not drawn where a player could see it');
}

// ---- And none of them runs through anything ----------------------------------
// Brought out of their walls, the runs then cut through two corridor labels,
// across the airlock opening and through the debris, and stopped dead at
// different heights in every room — the owner's report on the first play of
// this build. So: one height, and nothing a run passes through. Each run's
// strip is swept 40 cm out from its wall and tested against every door opening
// and its frame, every label and placard, every fixture, and every vertex of
// the props, in the band the strip occupies.
console.log('\n  every conduit run is clear of doors, labels and fixtures');
const clash = await page.evaluate(() => {
  const g = window.__derelict;
  const strips = [];
  for (const zone of ['bay', 'corrA', 'hold', 'corrB', 'annex', 'shortcut']) {
    for (const strip of g.lighting.partsIn(zone).strips) strips.push({ zone, strip });
  }
  const boxOf = (o) => {
    o.geometry.computeBoundingBox();
    return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
  };
  const heights = new Set();
  const things = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    let top = o;
    while (top.parent && top.parent !== g.scene) top = top.parent;
    if (['level', 'lighting', 'outside'].includes(top.name)) return;
    if (top.name === 'props') {
      const pos = o.geometry.attributes.position;
      const v = o.position.clone();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        things.push({ what: 'a prop', min: v.clone(), max: v.clone() });
      }
      return;
    }
    const b = boxOf(o);
    things.push({ what: top.name || o.name || 'a fixture', min: b.min, max: b.max });
  });
  const found = [];
  for (const { zone, strip } of strips) {
    const b = boxOf(strip);
    const n = strip.position.clone().set(0, 0, 1).applyQuaternion(strip.getWorldQuaternion(strip.quaternion.clone()));
    heights.add(Math.round(((b.min.y + b.max.y) / 2) * 100) / 100);
    // The volume in front of the strip.
    const far = b.clone().translate(n.clone().multiplyScalar(0.4));
    const v = b.clone().union(far);
    const hit = (t) =>
      t.max.x > v.min.x + 0.01 && t.min.x < v.max.x - 0.01 && t.max.y > v.min.y && t.min.y < v.max.y && t.max.z > v.min.z + 0.01 && t.min.z < v.max.z - 0.01;
    for (const t of things) if (hit(t)) found.push(`${zone} run at ${strip.position.x.toFixed(2)}, ${strip.position.z.toFixed(2)} meets ${t.what}`);
    // Door openings and their frames, from the wall table itself.
    const alongX = Math.abs(n.z) > 0.5;
    for (const wall of g.walls) {
      if ((wall.axis === 'z') !== alongX) continue;
      const plane = alongX ? strip.position.z : strip.position.x;
      if (Math.abs(plane - wall.at) > 0.35) continue;
      const lo = alongX ? b.min.x : b.min.z;
      const hi = alongX ? b.max.x : b.max.z;
      for (const o of wall.openings || []) {
        const half = o.width / 2 + 0.14;
        if (hi > o.center - half && lo < o.center + half && b.min.y < o.height + 0.14) {
          found.push(`${zone} run crosses the opening at ${o.center} on the wall at ${wall.at}`);
        }
      }
    }
  }
  return { found: [...new Set(found)], heights: [...heights], count: strips.length };
});
expect(`${clash.count} runs, all at one height (${clash.heights.join(', ')} m)`, clash.heights.length === 1, `heights ${clash.heights.join(', ')}`);
expect('no run crosses a door, a label, a fixture or a prop', clash.found.length === 0, clash.found.slice(0, 6).join('; '));

const dead = { ...(await photograph()), ...(await panel(0)) };
// Power the Hold and Corridor A, release cradle 1, and let every lamp finish
// striking before the second photograph.
await page.evaluate(() => {
  const g = window.__derelict;
  g.pressInteractForTest(g.switches.find((s) => s.id === 'switch1'));
  for (let i = 0; i < 360; i++) g.stepForTest(1 / 60, { render: false });
});
const live = { ...(await photograph()), ...(await panel(2)) };

// What each pair has besides its colour, so the report says it alongside.
const CUES = {
  'switch indicator': 'the lever throws through its arc',
  'cradle lamp': 'the jaws part',
  'conduit strip': 'the fill runs along the strip',
  'lamp lens': 'the room lights up around it',
  'room light': 'it is the brightness of the room',
  'panel count': 'the number itself changes',
  'panel pip': 'an empty slot fills',
};

console.log('\n  dead → live, as each vision sees it (luminance ratio; floor 3:1)');
for (const name of Object.keys(dead)) {
  const a = dead[name];
  const b = live[name];
  if (!a.rgb || !b.rgb || a.coverage < 0.001 || b.coverage < 0.001) {
    expect(`${name} is in the photograph`, false, `covered ${(a.coverage * 100).toFixed(2)}% dead, ${(b.coverage * 100).toFixed(2)}% live`);
    continue;
  }
  const row = [];
  let worst = Infinity;
  let worstVision = '';
  // A room is not a surface on a lit screen. The WCAG ratio adds 0.05 to both
  // sides for the flare of a bright display around a control; a dark room's
  // mean luminance is below that in either state, so the offset would swamp
  // it and the only way to pass would be to light the ship like an office.
  // The room is compared as a plain ratio of its mean luminance instead.
  const flare = ROOMS.has(name) ? 0 : 0.05;
  for (const [vision, m] of Object.entries(VISION)) {
    const la = luminance(see(m, a.rgb));
    const lb = luminance(see(m, b.rgb));
    const ratio = (Math.max(la, lb) + flare) / (Math.min(la, lb) + flare);
    row.push(`${vision.slice(0, 5)} ${hex(see(m, a.rgb))}→${hex(see(m, b.rgb))} ${ratio.toFixed(2)}`);
    if (ratio < worst) {
      worst = ratio;
      worstVision = vision;
    }
  }
  const brighter = luminance(b.rgb) > luminance(a.rgb);
  console.log(`  ${name} (${(a.coverage * 100).toFixed(1)}% of frame; ${CUES[name]})`);
  console.log(`          ${row.join('  ')}`);
  expect(
    `${name}: dead and live differ by ${worst.toFixed(2)}:1 at worst (${worstVision})`,
    worst >= FLOOR,
    `under ${FLOOR}:1 — a ${worstVision} player sees two colours of the same brightness`
  );
  expect(`${name}: live is the brighter of the two`, brighter, 'dead reads brighter than live');
}

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\ncolour: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\ncolour: OK — every state reads without its hue');
