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

const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const SHOTS = process.argv.includes('--shots');
const { TARGET } = await import(new URL('../../pipeline/house/style.js', import.meta.url).href);

/**
 * The views, and what each is held to. The hall from where the player starts
 * is the reference's own view; the others are the hall's other ways of being
 * seen.
 */
const VIEWS = [
  { name: 'hall, from the door (the reference view)', pos: [0.05, 4.1], yaw: 0, pitch: -0.06 },
  { name: 'hall, toward the stairs', pos: [-1.2, 3.2], yaw: -0.55, pitch: 0.05 },
  { name: 'hall, back toward the window', pos: [0.6, 0.9], yaw: 2.4, pitch: -0.05 },
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
};

function stats(rgb, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  let green = 0;
  let sat = 0;
  let mean = [0, 0, 0];
  const colours = new Set();
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    mean[0] += r;
    mean[1] += g;
    mean[2] += b;
    lum[i] = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    if (g >= r && g >= b) green++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0;
    colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const sorted = Float32Array.from(lum).sort();
  const pct = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  // Fine detail: mean absolute Laplacian of the grey image, 0–255.
  let detail = 0;
  const grey = (x, y) => {
    const i = (y * w + x) * 3;
    return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      detail += Math.abs(4 * grey(x, y) - grey(x - 1, y) - grey(x + 1, y) - grey(x, y - 1) - grey(x, y + 1));
    }
  }
  return {
    meanSrgb: mean.map((v) => Math.round(v / n)),
    p5: pct(0.05),
    p50: pct(0.5),
    p95: pct(0.95),
    greenDominant: green / n,
    saturation: sat / n,
    detail: detail / ((w - 2) * (h - 2)),
    colours15: colours.size,
  };
}

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
    g.player.position.set(v.pos[0], 0, v.pos[1]);
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
