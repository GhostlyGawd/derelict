/**
 * The style harness — phase 9, 9.4.5 and 9.6 "the house holds its style".
 *
 * Renders fixed views of the house through the real game (generated surfaces,
 * lighting, fog, the green grade and its dither), reduces each frame to the
 * reference's size, and scores it against the style target in
 * pipeline/house/style.js: luminance percentiles, the share of pixels where
 * green dominates, mean saturation, fine-detail energy and palette size.
 *
 * Like 3.5's pixel floor, this can show a frame is in the right family and
 * cannot say whether it looks right. That is the owner's bar.
 *
 *   node tools/house/style.mjs [baseUrl] [--shots]
 */
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { regions, stats } from '../lib/stylestats.js';

const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const SHOTS = process.argv.includes('--shots');
const { TARGET } = await import(new URL('../../pipeline/house/style.js', import.meta.url).href);

/**
 * The views, and what each is held to. The hall from where the player starts
 * is the reference's own view; the others are the hall's other ways of being
 * seen.
 */
const VIEWS = [
  { name: 'hall, from the door (the reference view)', pos: [0.05, 4.1], yaw: 0, pitch: -0.06, regions: true },
  { name: 'hall, toward the stairs', pos: [-1.2, 3.2], yaw: -0.55, pitch: 0.05 },
  { name: 'hall, back toward the window', pos: [0.6, 0.9], yaw: 2.4, pitch: -0.05 },
  // Every other room, from its doorway, as a player first sees it (9.6).
  { name: 'parlour, from its door', pos: [-1.6, -0.5], yaw: 1.25, pitch: -0.08 },
  { name: 'dining room, from its door', pos: [-1.3, -4.5], yaw: Math.PI / 2, pitch: -0.08 },
  { name: 'kitchen, from the passage', pos: [1.6, -4.5], yaw: -Math.PI / 2, pitch: -0.08 },
  { name: 'study, from its door', pos: [4.0, -2.6], yaw: Math.PI, pitch: -0.08 },
  { name: 'back passage, from the arch', pos: [0.1, -0.4], yaw: 0, pitch: -0.05 },
  { name: 'landing, from the stairs', pos: [1.6, -3.5], y: 3, yaw: 0.5, pitch: -0.05 },
  { name: 'gallery, from the landing', pos: [0.15, -2.6], y: 3, yaw: Math.PI, pitch: -0.05 },
  { name: 'bedroom, from its door', pos: [-1.3, -1.5], y: 3, yaw: Math.PI / 2, pitch: -0.08 },
  { name: "child's room, from its door", pos: [-1.3, -4.5], y: 3, yaw: Math.PI / 2, pitch: -0.08 },
  { name: 'bathroom, from its door', pos: [2.8, -4.5], y: 3, yaw: -Math.PI / 2, pitch: -0.08 },
];

/**
 * How far each statistic may sit from the target. Set on the entry hall,
 * recorded in the spec (9.4.5), and not to be loosened to let a change through.
 */
export const TOLERANCE = {
  p50: [0.4, 3.0], // a ratio of the target's median luminance
  p95: [0.5, 2.0],
  greenDominant: 0.12, // absolute
  saturation: 0.15,
  detail: [0.5, 2.0],
  colours15: [0.4, 2.5],
  // By region, on the reference view only (TARGET.regions): set on 9 October
  // 2026 after the first tuning, recorded in the spec, and not to be loosened.
  regionMean: [0.25, 4],
  regionSaturation: 0.2,
};

function judge(s) {
  const t = TARGET;
  const out = [];
  const ratio = (name, v, ref, [lo, hi]) => out.push({ name, ok: v >= ref * lo && v <= ref * hi, text: `${v.toFixed(4)} (target ${ref}, ×${lo}–×${hi})` });
  const abs = (name, v, ref, tol) => out.push({ name, ok: Math.abs(v - ref) <= tol, text: `${v.toFixed(3)} (target ${ref} ± ${tol})` });
  ratio('median luminance', s.p50, t.luminance.p50, TOLERANCE.p50);
  ratio('95th-percentile luminance', s.p95, t.luminance.p95, TOLERANCE.p95);
  abs('share where green dominates', s.greenDominant, t.greenDominant, TOLERANCE.greenDominant);
  abs('mean saturation', s.saturation, t.saturation, TOLERANCE.saturation);
  ratio('fine detail', s.detail, t.detail, TOLERANCE.detail);
  ratio('distinct 15-bit colours', s.colours15, t.colours15, TOLERANCE.colours15);
  return out;
}

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
// The reference is 3:2; so is the frame judged against it.
const context = await browser.newContext({ viewport: { width: 1344, height: 896 }, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(new URL('house/', ROOT).href);
await page.waitForFunction(() => window.__house?.phase === 'title', null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__house;
  g.canvas.requestPointerLock = () => Promise.resolve();
  g.manualClockOnStart = true;
  document.getElementById('start').click();
});
await page.waitForFunction(() => window.__house.phase === 'playing');
// The HUD is not the picture.
await page.addStyleTag({ content: '#hud, #ring, #touch { display: none !important; }' });

let failures = 0;
console.log('The house against its style target:');
for (const view of VIEWS) {
  await page.evaluate((v) => {
    const g = window.__house;
    g.player.position.set(v.pos[0], v.y || 0, v.pos[1]);
    g.player.velocity.set(0, 0, 0);
    g.player.yaw = v.yaw;
    g.player.pitch = v.pitch;
    for (let i = 0; i < 4; i++) g.stepForTest(1 / 60);
  }, view);
  const png = await page.screenshot();
  const { data, info } = await sharp(png).resize(448, 299, { fit: 'fill', kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = stats(data, info.width, info.height);
  console.log(`\n  ${view.name} — mean ${s.meanSrgb.join(', ')} (target ${TARGET.meanSrgb.join(', ')})`);
  for (const r of judge(s)) {
    console.log(`    ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}: ${r.text}`);
    if (!r.ok) failures++;
  }
  if (view.regions) {
    // The frame by region, four across and three down, against the picture's own regions.
    const [lo, hi] = TOLERANCE.regionMean;
    regions(data, info.width, info.height).forEach((c, i) => {
      const t = TARGET.regions[i];
      const ok = c.mean >= t.mean * lo && c.mean <= t.mean * hi && Math.abs(c.saturation - t.saturation) <= TOLERANCE.regionSaturation;
      const where = `${['top', 'middle', 'bottom'][Math.floor(i / 4)]} ${['left', 'centre-left', 'centre-right', 'right'][i % 4]}`;
      console.log(
        `    ${ok ? 'ok  ' : 'FAIL'}  region ${where}: luminance ${c.mean.toFixed(4)} (target ${t.mean}, ×${lo}–×${hi}), saturation ${c.saturation.toFixed(3)} (target ${t.saturation} ± ${TOLERANCE.regionSaturation})`
      );
      if (!ok) failures++;
    });
  }
  if (SHOTS) await sharp(png).toFile(path.resolve(`tools/shots/style-${VIEWS.indexOf(view)}.png`));
}
await browser.close();
if (errors.length) {
  console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
  failures++;
}
if (failures) {
  console.log(`\nstyle: ${failures} outside the target`);
  process.exit(1);
}
console.log('\nstyle: OK — every view is in the reference\'s family');
