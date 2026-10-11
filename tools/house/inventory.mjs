/**
 * The inventory — phase 9, 9.6 "the hall has the painting's things" (the
 * owner's look at the modelled hall, 11 October 2026).
 *
 * Three checks the style harness cannot make, because it only ever measures a
 * frame's statistics:
 *
 * 1. The painting's things. Every object the painting shows is listed in
 *    pipeline/house/concept/inventory.json with the box it fills there. The
 *    hall is rendered from the painting's camera with every piece of the house
 *    drawn flat in a colour naming what it is (src/house/inventory.js), and
 *    each listed thing must be there, be that thing, and fill its box.
 * 2. Texture scale. Every textured surface in the house, triangle by triangle,
 *    must show its texture at the size it was made for (`metres` in the
 *    manifest), across and up. A stretched or squashed surface fails.
 * 3. The painting's structure. The painting's view is compared with the
 *    painting itself, region by region, by where its light and dark and its
 *    edges fall (the correlation of the two, not their colours).
 *
 * With --sheet it also writes tools/shots/inventory.jpg: every listed thing,
 * its crop of the painting beside two close views of the hall's, for Claude
 * to look at before every push and for the owner. That sheet is not a gate.
 *
 *   node tools/house/inventory.mjs [baseUrl] [--sheet]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const SHEET = process.argv.includes('--sheet');
const CONCEPT = new URL('../../pipeline/house/concept/', import.meta.url).pathname;
const { items } = JSON.parse(readFileSync(path.join(CONCEPT, 'inventory.json'), 'utf8'));
const W = 1344;
const H = 896;

/**
 * The bars, set on 11 October 2026 when the harness was built, recorded in the
 * spec, and not to be loosened to let a change through.
 */
export const BARS = {
  // A thing is where the painting has it when the box it fills overlaps the
  // painting's by half (intersection over union), the usual bar for "found".
  overlap: 0.5,
  // A surface may show its texture within a fifth of its own size, either way,
  // and up to 5% of a thing's area may be off: the rounded arrises of a
  // softened board take their texture from the face they are nearest, and are
  // about that share of a door.
  scale: 0.2,
  scaleArea: 0.05,
  // Each region of the painting's view, four across and three down, must be
  // structurally like the painting there: the mean of the correlations of
  // their light and dark and of their edges, at the scale of the room's
  // shapes. A flat or random frame scores 0, the painting blurred by 8 px
  // 0.97, and the painting moved 20 px sideways 0.46 to 0.99: half is a hall
  // whose shapes stand where the painting's do.
  structure: 0.5,
};

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(new URL('house/', ROOT).href);
await page.waitForFunction(() => window.__house?.phase === 'title', null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__house;
  g.canvas.requestPointerLock = () => Promise.resolve();
  g.manualClockOnStart = true;
  document.getElementById('start').click();
});
await page.waitForFunction(() => window.__house.phase === 'playing');
await page.addStyleTag({ content: '#hud, #ring, #touch { display: none !important; }' });

let failures = 0;
const say = (ok, text) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${text}`);
  if (!ok) failures++;
};

// ---- 1. The painting's things ----
const { tags, ids } = await page.evaluate(
  ([w, h]) => {
    const g = window.__house;
    const { tags, ids } = g.inventory.tags(g.inventory.paintingCamera(), w, h);
    // Two bytes a pixel, as text, so the page hands it over in one piece.
    let s = '';
    const bytes = new Uint8Array(ids.buffer);
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { tags, ids: btoa(s) };
  },
  [W, H]
);
const id = new Uint16Array(Buffer.from(ids, 'base64').buffer.slice(0));
const name = (v) => (v ? tags[v - 1] || 'the shell' : 'nothing');

console.log("The hall against the painting's inventory (from the painting's camera):");
for (const item of items) {
  const accept = new Set(item.is.map((t) => tags.indexOf(t) + 1).filter((v) => v > 0));
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  let count = 0;
  let inside = 0;
  const there = new Map();
  const [bx0, by0, bx1, by1] = item.box;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = id[y * W + x];
      const inBox = x >= bx0 && x < bx1 && y >= by0 && y < by1;
      if (inBox) there.set(v, (there.get(v) || 0) + 1);
      if (!accept.has(v)) continue;
      count++;
      if (inBox) inside++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  // What stands in the painting's box instead, if not this.
  const most = [...there.entries()].filter(([v]) => v && tags[v - 1] && !accept.has(v)).sort((a, b) => b[1] - a[1])[0];
  const area = (bx1 - bx0) * (by1 - by0);
  const instead = most && most[1] > area * 0.15 ? `; in its place: ${name(most[0])} (${((100 * most[1]) / area).toFixed(0)}%)` : '';
  if (!count) {
    say(false, `${item.id}: not in the hall — ${item.what}${instead}`);
    continue;
  }
  if (item.fill) {
    const f = inside / area;
    say(f >= item.fill, `${item.id}: covers ${(100 * f).toFixed(0)}% of its place in the painting (at least ${100 * item.fill}%)${instead}`);
    continue;
  }
  x1++;
  y1++;
  const ix = Math.max(0, Math.min(x1, bx1) - Math.max(x0, bx0));
  const iy = Math.max(0, Math.min(y1, by1) - Math.max(y0, by0));
  const inter = ix * iy;
  const iou = inter / ((x1 - x0) * (y1 - y0) + area - inter);
  say(iou >= BARS.overlap, `${item.id}: overlaps its place in the painting by ${iou.toFixed(2)} (at least ${BARS.overlap}); the hall has it at [${x0}, ${y0}, ${x1}, ${y1}], the painting at [${item.box.join(', ')}]${instead}`);
}

// ---- 2. Texture scale ----
console.log('\nEvery textured surface at the size its texture was made for:');
const rows = await page.evaluate(() => window.__house.inventory.texels());
const byThing = new Map();
for (const r of rows) {
  const key = `${r.tag || 'the shell'} (${r.texture})`;
  const t = byThing.get(key) || { good: 0, bad: 0, worst: 1 };
  t.good += r.good;
  t.bad += r.bad;
  t.worst = Math.min(t.worst, r.worst);
  byThing.set(key, t);
}
let scaleOk = 0;
for (const [key, t] of [...byThing.entries()].sort()) {
  const share = t.bad / (t.good + t.bad);
  if (share <= BARS.scaleArea) {
    scaleOk++;
    continue;
  }
  const worst = t.worst > 0 ? `${(1 / t.worst).toFixed(2)}× its size` : 'smeared to a single texel';
  say(false, `${key}: ${(100 * share).toFixed(0)}% of ${(t.good + t.bad).toFixed(2)} m² off its texture's size by more than a fifth, at worst ${worst}`);
}
console.log(`  ok    ${scaleOk} of ${byThing.size} things at their textures' size`);

// ---- 3. The painting's structure ----
console.log("\nThe painting's view against the painting, by structure:");
await page.evaluate(() => {
  const g = window.__house;
  const P = g.layout.PAINTING;
  g.player.position.set(P.pos[0], 0, P.pos[2]);
  g.player.velocity.set(0, 0, 0);
  g.player.yaw = P.yaw;
  g.player.pitch = 0;
  for (let i = 0; i < 4; i++) g.stepForTest(1 / 60);
  g.camera.setViewOffset(innerWidth, innerHeight, (0.5 - P.axis[0]) * innerWidth, (0.5 - P.axis[1]) * innerHeight, innerWidth, innerHeight);
  g.stepForTest(1 / 60);
});
const view = await page.screenshot();
const SW = 168;
const SH = 112;
// Light and dark at the scale of the room's shapes, not its brushwork.
const lum = async (input) => new Float32Array(await sharp(input).resize(SW, SH, { fit: 'fill' }).greyscale().blur(1).raw().toBuffer());
const painting = path.join(CONCEPT, 'hall.filled.jpg');
const A = await lum(painting);
const B = await lum(view);
const GA = gradient(A);
const GB = gradient(B);
for (let ry = 0; ry < 3; ry++) {
  for (let rx = 0; rx < 4; rx++) {
    // Where the light and dark fall, and where the edges fall: each the
    // correlation of the two pictures over the region (0 for a flat or a
    // random frame, 1 for the painting itself).
    const s = (correlation(A, B, rx, ry) + correlation(GA, GB, rx, ry)) / 2;
    const where = `${['top', 'middle', 'bottom'][ry]} ${['left', 'centre-left', 'centre-right', 'right'][rx]}`;
    say(s >= BARS.structure, `region ${where}: structure ${s.toFixed(2)} (at least ${BARS.structure})`);
  }
}

function gradient(a) {
  const g = new Float32Array(SW * SH);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x;
    g[i] = Math.hypot(a[i + 1] - a[i - 1], a[i + SW] - a[i - SW]);
  }
  return g;
}

function correlation(a, b, rx, ry) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = Math.floor((ry * SH) / 3) + 1; y < Math.floor(((ry + 1) * SH) / 3) - 1; y++) {
    for (let x = Math.floor((rx * SW) / 4) + 1; x < Math.floor(((rx + 1) * SW) / 4) - 1; x++) {
      const p = a[y * SW + x];
      const q = b[y * SW + x];
      n++;
      sa += p;
      sb += q;
      saa += p * p;
      sbb += q * q;
      sab += p * q;
    }
  }
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  if (va < 1e-6 || vb < 1e-6) return 0;
  return (sab / n - (sa * sb) / n / n) / Math.sqrt(va * vb);
}

// ---- The close-ups, for looking at: not a gate ----
if (SHEET) {
  const tiles = [];
  const T = 300;
  for (const item of items) {
    const [bx0, by0, bx1, by1] = item.box;
    const pad = 0.25;
    const cw = bx1 - bx0;
    const ch = by1 - by0;
    const crop = {
      left: Math.max(0, Math.round(bx0 - cw * pad)),
      top: Math.max(0, Math.round(by0 - ch * pad)),
    };
    crop.width = Math.min(W, Math.round(bx1 + cw * pad)) - crop.left;
    crop.height = Math.min(H, Math.round(by1 + ch * pad)) - crop.top;
    const fromPainting = await sharp(painting).extract(crop).resize(T, T, { fit: 'contain', background: '#111' }).toBuffer();
    const views = await page.evaluate((is) => window.__house.inventory.closeUps?.(is) ?? null, item.is);
    const near = [];
    for (const v of views || []) {
      await page.evaluate((v) => window.__house.inventory.shot(v), v);
      const shot = await page.screenshot({ clip: { x: (W - H) / 2, y: 0, width: H, height: H } });
      near.push(await sharp(shot).resize(T, T).toBuffer());
    }
    while (near.length < 2) near.push(await sharp({ create: { width: T, height: T, channels: 3, background: '#300' } }).png().toBuffer());
    const label = Buffer.from(
      `<svg width="${3 * T}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="6" y="19" font-family="sans-serif" font-size="15" fill="#ddd">${item.id} — ${item.what.replace(/&/g, '&amp;')}</text></svg>`
    );
    tiles.push({ label, row: [fromPainting, ...near.slice(0, 2)] });
  }
  const rowH = T + 28;
  const composites = [];
  tiles.forEach((t, i) => {
    composites.push({ input: t.label, left: 0, top: i * rowH });
    t.row.forEach((buf, k) => composites.push({ input: buf, left: k * T, top: i * rowH + 28 }));
  });
  await sharp({ create: { width: 3 * T, height: tiles.length * rowH, channels: 3, background: '#000' } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(path.resolve('tools/shots/inventory.jpg'));
  console.log('\nwrote tools/shots/inventory.jpg');
}

await browser.close();
if (errors.length) {
  console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
  failures++;
}
if (failures) {
  console.log(`\ninventory: ${failures} failing`);
  process.exit(1);
}
console.log('\ninventory: OK — the hall has the painting\'s things, at their size, in its structure');
