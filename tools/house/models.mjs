/**
 * The models harness (everything modelled by Blender, 9.3).
 *
 * Every piece of the house is Blender's. This fails:
 * - for anything in the house still drawn by code, apart from what is not a
 *   piece (the baked skins, the shadows under things, a note's paper);
 * - for any piece the house asks for that is not modelled;
 * - for the pitfalls met on the way, each held here so it is not met twice:
 *   a material slot the game does not know (the lost names that put wood on
 *   the lamp), a closed mesh whose faces point inward, a piece not the size
 *   it was asked for (the cloth that blew off the chest), and anything below
 *   the floor it stands on.
 *
 * It also writes tools/shots/models.jpg: every model alone, from two sides,
 * under the game's own materials, for Claude to look at before every push and
 * for the owner. The sheet is not a gate.
 *
 *   node tools/house/models.mjs [baseUrl] [--sheet]
 */
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const SHEET = process.argv.includes('--sheet');

/** The size each kind of piece is asked to be, [x, y, z] in metres, where its request says. */
const EXPECT = {
  door: (p) => [p.w, p.h, null],
  cabinet: (p) => [p.size[0] + 0.05, p.size[2], null],
  joist: (p) => [p.length, null, null],
  newel: (p) => [null, p.height + 0.05, null],
  baluster: (p) => [null, p.height, null],
  // The chest is 0.82 × 0.5 × 0.48 under its cloth; a cloth that blew off or slid off is far bigger.
  chest: () => [0.88, 0.52, 0.54],
};
/** How far a piece may be from the size it was asked for. */
const TOLERANCE = 0.12;
/** Kinds as big as the house, which a cloth that blew away is not. */
const HOUSE_SIZED = new Set(['shell']);
/** Kinds that hang or stand on something else, so their origin is not the floor. */
const OFF_THE_FLOOR = new Set(['lamp', 'bag', 'fixture', 'clock', 'vase', 'joist', 'window', 'curtains', 'picture', 'pendant', 'clock-hand', 'note', 'sconce']);

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 }, serviceWorkers: 'block' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(new URL('house/', ROOT).href);
await page.waitForFunction(() => window.__house?.phase === 'title', null, { timeout: 120000 });

let failures = 0;
const say = (ok, text) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${text}`);
  if (!ok) failures++;
};

const { asked, loaded, drawn, facts } = await page.evaluate(() => {
  const i = window.__house.inventory;
  return { asked: i.asked(), loaded: i.loaded(), drawn: i.codeDrawn(), facts: i.modelFacts() };
});

console.log('Everything in the house modelled by Blender:');
const have = new Set(loaded);
const missing = asked.filter((p) => !have.has(p.id));
say(!missing.length, `${asked.length - missing.length} of ${asked.length} pieces the house asks for are modelled${missing.length ? `; missing: ${missing.map((p) => p.id).join(', ')}` : ''}`);
const total = drawn.reduce((a, [, n]) => a + n, 0);
say(!total, total ? `${total} meshes are still drawn by code` : 'nothing in the house is drawn by code');
for (const [what, n] of drawn) console.log(`          ${String(n).padStart(4)}  ${what}`);

console.log('\nEvery model, against the pitfalls met so far:');
let clean = 0;
for (const p of asked) {
  const f = facts[p.id];
  if (!f) continue;
  const bad = [];
  if (f.unknown.length) bad.push(`material slots the game does not know: ${f.unknown.join(', ')}`);
  if (f.inward.length) bad.push(`faces pointing inward: ${f.inward.join(', ')}`);
  const want = EXPECT[p.kind]?.(p);
  if (want) {
    want.forEach((v, k) => {
      if (v == null) return;
      const got = f.size[k];
      if (Math.abs(got - v) / v > TOLERANCE) bad.push(`${'xyz'[k]} is ${got.toFixed(3)} m, asked for ${v.toFixed(3)} m`);
    });
  }
  if (!HOUSE_SIZED.has(p.kind) && Math.max(...f.size) > 6) bad.push(`it is ${Math.max(...f.size).toFixed(1)} m across`);
  if (!OFF_THE_FLOOR.has(p.kind) && f.min[1] < -0.02) bad.push(`it reaches ${(-f.min[1] * 100).toFixed(0)} cm below the floor`);
  if (bad.length) say(false, `${p.id}: ${bad.join('; ')}`);
  else clean++;
}
console.log(`  ok    ${clean} of ${asked.filter((p) => facts[p.id]).length} models clean`);

console.log('\nEvery piece where it can be seen:');
const { covered, under, hungOver } = await page.evaluate(() => ({ covered: window.__house.inventory.skinsOverOpenings(), under: window.__house.inventory.underSkins(), hungOver: window.__house.inventory.hungOverFrames() }));
say(!covered.length, covered.length ? `a baked skin stands across ${covered.length} doorway view(s): ${covered.join('; ')}` : 'no baked skin stands across a doorway or an arch');
say(!under.length, under.length ? `${under.length} piece(s) lie at or behind a baked skin, hidden by it or fighting it: ${under.join('; ')}` : 'nothing lies at or behind a baked skin');
say(!hungOver.length, hungOver.length ? `${hungOver.length} thing(s) hung over a door's or an arch's frame: ${hungOver.join('; ')}` : "nothing hung on a wall overlaps a door's or an arch's frame");

if (SHEET) {
  const T = 240;
  const tiles = [];
  for (const p of asked.filter((p) => facts[p.id])) {
    const views = [];
    for (const turn of [0, 0.9]) {
      const b64 = await page.evaluate(([id, turn, T]) => window.__house.inventory.shootModel(id, turn, T, T), [p.id, turn, T]);
      const raw = Buffer.from(b64, 'base64');
      // Rendered linear, rows bottom first: brought to sRGB and turned upright.
      const rgb = Buffer.alloc(T * T * 3);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) for (let k = 0; k < 3; k++) {
        const v = raw[((T - 1 - y) * T + x) * 4 + k] / 255;
        rgb[(y * T + x) * 3 + k] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
      }
      views.push(await sharp(rgb, { raw: { width: T, height: T, channels: 3 } }).png().toBuffer());
    }
    tiles.push({ label: `${p.id} (${p.kind})`, views });
  }
  const cols = 3;
  const W = cols * 2 * T;
  const rowH = T + 22;
  const rows = Math.ceil(tiles.length / cols);
  const composites = [];
  tiles.forEach((t, i) => {
    const x = (i % cols) * 2 * T;
    const y = Math.floor(i / cols) * rowH;
    composites.push({ input: Buffer.from(`<svg width="${2 * T}" height="22"><rect width="100%" height="100%" fill="#0c0c0c"/><text x="5" y="16" font-family="sans-serif" font-size="13" fill="#ddd">${t.label}</text></svg>`), left: x, top: y });
    t.views.forEach((v, k) => composites.push({ input: v, left: x + k * T, top: y + 22 }));
  });
  await sharp({ create: { width: W, height: rows * rowH, channels: 3, background: '#000' } })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toFile(path.resolve('tools/shots/models.jpg'));
  console.log('\nwrote tools/shots/models.jpg');
}

await browser.close();
if (errors.length) {
  console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
  failures++;
}
if (failures) {
  console.log(`\nmodels: ${failures} failing`);
  process.exit(1);
}
console.log('\nmodels: OK — everything in the house is Blender\'s, and every model is clean');
