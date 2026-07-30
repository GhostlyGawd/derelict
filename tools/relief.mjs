/**
 * Relief checks — the phase 4 done-bar that a normal map exists *and* is bound.
 *
 * The failure this exists to catch has already shipped twice on this project: a
 * generated asset that is produced correctly, listed correctly, and then never
 * sampled. Both times it rendered perfectly and was invisible. So asserting
 * that six files exist would be worth almost nothing on its own.
 *
 * What it does instead is move a lamp and look:
 *
 *   1. Point the camera at a flat bulkhead and take control of the lighting,
 *      leaving one movable lamp.
 *   2. Photograph the wall lit hard from the left, then hard from the right.
 *   3. Do it again with the normal maps replaced by a single flat texel.
 *   4. Measure how much the fine detail re-shaded in each case.
 *
 * Three things had to be got right for that measurement to mean anything, and
 * every one of them was a wrong answer first:
 *
 *   - The metric is local contrast *relative to local brightness*, not plain
 *     high-pass. Texture detail scales with how brightly a patch is lit, so
 *     moving a lamp changes the high-frequency content of a perfectly flat
 *     wall — the first version scored 0.58 on a flat control and would have
 *     passed a map that was never sampled. Dividing by the local mean cancels
 *     it: for a flat Lambertian surface the image is albedo × smooth
 *     illumination, so detail-over-mean depends only on the albedo.
 *   - Specular is off during the measurement, on both runs. It is additive and
 *     albedo-independent, which is exactly the term the ratio cannot cancel —
 *     it dilutes contrast wherever the highlight lands, and the highlight moves
 *     with the lamp. Leaving it on held the control at 0.50.
 *   - All four shots share one mask, and dark texels are excluded from it.
 *     `rel` divides by local brightness, so where the wall is dim an 8-bit
 *     quantisation step is a several-percent swing; and letting each run pick
 *     its own bright texels compares two different patches of wall.
 *
 * With those, a flat surface scores near zero and relief scores near one.
 *
 *   node tools/relief.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

/** A patch of bare bulkhead, clear of the viewmodel and the crosshair. */
const CLIP = { x: 232, y: 90, width: 560, height: 330 };
/** Removes anything smoother than this, in pixels. */
const HIGHPASS_SIGMA = 4;
/** Texels this dim carry more quantisation noise than contrast. */
const DARK_FLOOR = Number(process.env.DARK_FLOOR || 40);
/** The measurement needs enough wall to be a measurement. */
const MIN_TEXELS = 20000;
/**
 * Relief has to re-shade the fine detail by this fraction of its own
 * magnitude. Measured at ~0.92 bound against ~0.15 flat.
 */
const FLOOR = 0.4;
/**
 * And it has to beat the flat control by this much, which is the real claim.
 *
 * Reads 6.6× on a workstation. The bar sits well under that because the control
 * is the noisy half — it is trying to measure approximately nothing, so any
 * instability in the renderer inflates it, and a software rasteriser on a
 * shared CI box is not a quiet instrument. 2.5× is still a claim no unsampled
 * map could make.
 */
const OVER_CONTROL = 2.5;

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
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
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

console.log(`relief: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(900);

// Pin the internal render scale before measuring anything.
//
// The frame-time watchdog steps it down over the first seconds on a host that
// cannot hold the target, and a resolution change between two shots is a total
// change of image — every texel edge lands somewhere else. That is what made
// CI's flat control read 0.671 against 0.156 here, while the actual signal
// matched to within 0.01. Pinned to the minimum because that is where a
// software rasteriser ends up anyway, so CI and a workstation measure the same
// picture.
await page.evaluate(() => {
  window.__derelict.view.setScale(0.5);
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(400);

// ---- Structural: the manifest declares relief, and the scene binds it -------
console.log('\n  binding');
const bound = await page.evaluate(() => {
  const g = window.__derelict;
  const declared = Object.entries(g.assets.manifest?.textures || {})
    .filter(([, e]) => e.normal)
    .map(([id]) => id);

  const inScene = [];
  g.scene.traverse((o) => {
    if (!o.isMesh || !o.name.startsWith('level:')) return;
    inScene.push({
      id: o.name.slice(6),
      type: o.material.type,
      hasNormal: Boolean(o.material.normalMap),
      // NoColorSpace serialises as the empty string. sRGB here would run a
      // vector field through a transfer curve meant for pictures.
      normalIsLinear: o.material.normalMap ? o.material.normalMap.colorSpace === '' : null,
      nearest: o.material.normalMap ? o.material.normalMap.magFilter === 1003 : null,
    });
  });
  return { declared, inScene, loaded: [...g.assets.normals.keys()] };
});

expect(
  'the manifest declares relief for six tiling surfaces',
  bound.declared.length === 6,
  `${bound.declared.length} declared: ${bound.declared.join(', ')}`
);
expect(
  'every declared normal map actually loaded',
  bound.declared.every((id) => bound.loaded.includes(id)),
  `loaded ${bound.loaded.join(', ')}`
);

for (const id of bound.declared) {
  const m = bound.inScene.find((x) => x.id === id);
  if (!m) continue; // not every surface is used by the level shell
  expect(
    `${id.padEnd(14)} bound as ${m.type}`,
    m.hasNormal && m.type === 'MeshPhongMaterial',
    m.hasNormal ? `material is ${m.type}, not Phong` : 'the mesh has no normalMap'
  );
  expect(
    `${id.padEnd(14)} sampled linear and nearest`,
    m.normalIsLinear && m.nearest,
    `linear=${m.normalIsLinear} nearest=${m.nearest}`
  );
}

// ---- Behavioural: move a lamp and see whether the surface answers -----------
// Every zone is powered first. A powered, settled zone is the one state the
// lighting loop leaves entirely alone, so the harness can own the lamps without
// the game fighting it for them every frame.
await page.evaluate(() => {
  const g = window.__derelict;
  for (const id of ['bay', 'corrA', 'hold', 'corrB', 'annex', 'shortcut', 'chamber']) {
    g.lighting.setPowered(id, true);
  }
  // Face the Bay's north bulkhead: a long run of wall_panel_a with no opening.
  g.player.position.set(0, 0, 5.2);
  g.player.yaw = Math.PI;
  g.player.pitch = 0;
  g.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.specular) o.material.specular.setRGB(0, 0, 0);
  });
});
await page.waitForTimeout(2200);

/** Leaves exactly one lamp alight, at `x`, and photographs the bulkhead. */
async function shotFromSide(x) {
  await page.evaluate((lx) => {
    const g = window.__derelict;
    const lamps = [];
    g.scene.traverse((o) => o.isPointLight && lamps.push(o));
    for (const l of lamps) l.intensity = 0;
    const probe = lamps[0];
    probe.position.set(lx, 1.62, 6.1);
    probe.color.setRGB(1, 1, 1);
    probe.intensity = 13;
    probe.distance = 16;
  }, x);
  await page.waitForTimeout(400);
  return page.screenshot({ clip: CLIP });
}

async function decompose(buffer) {
  return {
    flat: await sharp(buffer).greyscale().raw().toBuffer(),
    soft: await sharp(buffer).greyscale().blur(HIGHPASS_SIGMA).raw().toBuffer(),
  };
}

/**
 * Waits until the picture stops moving.
 *
 * The lighting surge takes about a second to settle and a slow host takes
 * longer, so a fixed delay is again a measurement of the renderer rather than
 * of the scene. Two shots that agree mean nothing is still animating and the
 * pair about to be taken are comparable.
 */
async function settle(maxMs = 25000) {
  let prev = await sharp(await page.screenshot({ clip: CLIP })).greyscale().raw().toBuffer();
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await page.waitForTimeout(350);
    const next = await sharp(await page.screenshot({ clip: CLIP })).greyscale().raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < next.length; i++) sum += Math.abs(next[i] - prev[i]);
    if (sum / next.length < 0.5) return true;
    prev = next;
  }
  return false;
}

const bothSides = async () => {
  await shotFromSide(-1.45);
  await settle();
  const left = await decompose(await page.screenshot({ clip: CLIP }));
  await shotFromSide(1.45);
  await settle();
  const right = await decompose(await page.screenshot({ clip: CLIP }));
  return { left, right };
};

console.log('\n  moving the lamp');
const relief = await bothSides();

// The control: same wall, same lamps, same material, same shader program — the
// normal map replaced by a single flat texel rather than removed. Detaching it
// outright was the first attempt and is not a fair control, because three.js
// recompiles to a different program without one and drops the per-texel
// specular path with it, so that comparison moved two things at once.
await page.evaluate(() => {
  const g = window.__derelict;
  let flatNormal = null;
  g.scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.normalMap) return;
    if (!flatNormal) {
      const like = o.material.normalMap;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgb(128,128,255)';
      ctx.fillRect(0, 0, 1, 1);
      flatNormal = new like.constructor(canvas);
      flatNormal.colorSpace = like.colorSpace;
      flatNormal.wrapS = like.wrapS;
      flatNormal.wrapT = like.wrapT;
      flatNormal.magFilter = like.magFilter;
      flatNormal.minFilter = like.magFilter;
      flatNormal.generateMipmaps = false;
      flatNormal.needsUpdate = true;
    }
    o.material.normalMap = flatNormal;
    o.material.needsUpdate = true;
  });
});
await page.waitForTimeout(500);
const control = await bothSides();

const n = relief.left.flat.length;
const mask = new Uint8Array(n);
let judged = 0;
for (let i = 0; i < n; i++) {
  const lit =
    relief.left.soft[i] >= DARK_FLOOR &&
    relief.right.soft[i] >= DARK_FLOOR &&
    control.left.soft[i] >= DARK_FLOOR &&
    control.right.soft[i] >= DARK_FLOOR;
  mask[i] = lit ? 1 : 0;
  judged += mask[i];
}

const relative = ({ flat, soft }) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) out[i] = (flat[i] - soft[i]) / soft[i];
  return out;
};

const rms = (a) => {
  let sum = 0;
  for (let i = 0; i < n; i++) if (mask[i]) sum += a[i] * a[i];
  return judged ? Math.sqrt(sum / judged) : 0;
};

const rmsDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const d = a[i] - b[i];
    sum += d * d;
  }
  return judged ? Math.sqrt(sum / judged) : 0;
};

function score(pair, label) {
  const a = relative(pair.left);
  const b = relative(pair.right);
  const detail = Math.max(rms(a), rms(b));
  const change = rmsDiff(a, b);
  const ratio = detail > 0 ? change / detail : 0;
  console.log(
    `  ${label.padEnd(22)} detail ${detail.toFixed(4)}  change ${change.toFixed(4)}  ratio ${ratio.toFixed(3)}`
  );
  return { detail, ratio };
}

console.log(`  ${judged.toLocaleString()} texels judged, lit in all four shots\n`);
const withRelief = score(relief, 'normal maps bound');
const flat = score(control, 'normals flattened');

expect(
  'the bulkhead has enough lit detail to measure',
  judged >= MIN_TEXELS && withRelief.detail > 0.02,
  `${judged} texels at RMS ${withRelief.detail.toFixed(4)} — the crop may not be on a lit wall`
);
expect(
  `moving the lamp re-shades the surface (ratio ${withRelief.ratio.toFixed(3)} ≥ ${FLOOR})`,
  withRelief.ratio >= FLOOR,
  `${withRelief.ratio.toFixed(3)} — the maps are generated but the lighting is not reading them`
);
expect(
  `and it is the normal map doing it (${(withRelief.ratio / Math.max(flat.ratio, 1e-6)).toFixed(1)}× the flat control)`,
  withRelief.ratio >= flat.ratio * OVER_CONTROL,
  `flat control measured ${flat.ratio.toFixed(3)} against ${withRelief.ratio.toFixed(3)} with relief — ` +
    'flattening the normals barely changed anything, so they were not being sampled'
);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nrelief: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nrelief: OK — every tiling surface has relief, and the lighting reads it');
