/**
 * The look tuner (9.4.4, Blender and a tuner).
 *
 * Turns the knobs in pipeline/house/look.json to bring the hall closer to the
 * reference, as numbers: the whole-frame statistics of 9.4.5 on the hall's
 * three views, and the regional statistics on its reference view
 * (TARGET.regions). It never compares pixels, and nothing of the picture is
 * read here: the target is the numbers committed in pipeline/house/style.js.
 *
 * The slow part of a bake (occlusion, grime, Blender's light) is computed
 * once. Each trial composes the hall's surfaces and the grade under a look,
 * swaps them into the running game and photographs it. A coordinate search
 * with shrinking steps keeps whatever lowers the score, and the best look is
 * written back to look.json, for the pipeline to bake from.
 *
 *   node tools/house/tune.mjs [baseUrl] [--evals N] [--dry]
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

import { LOOK_FILE, chartFields, compose, encode, readLook } from '../../pipeline/house/bake.js';
import { TARGET } from '../../pipeline/house/style.js';
import { gradeLut } from '../../pipeline/house/textures.js';
import { regions, stats } from '../lib/stylestats.js';

const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const at = process.argv.indexOf('--evals');
const MAX_EVALS = at > 0 ? Number(process.argv[at + 1]) : 160;
const DRY = process.argv.includes('--dry');

const VIEWS = [
  { name: 'reference view', pos: [0.05, 4.1], yaw: 0, pitch: -0.06, regions: true },
  { name: 'toward the stairs', pos: [-1.2, 3.2], yaw: -0.55, pitch: 0.05 },
  { name: 'back toward the window', pos: [0.6, 0.9], yaw: 2.4, pitch: -0.05 },
];

/** The knobs, where they live in the look, and how far each may go. */
const KNOBS = [
  { path: ['exposure'], lo: 0.4, hi: 8, log: true },
  { path: ['light', 'cone'], lo: 0.2, hi: 4, log: true },
  { path: ['light', 'glow'], lo: 0.2, hi: 12, log: true },
  { path: ['light', 'night'], lo: 0, hi: 20 },
  { path: ['fill'], lo: 0, hi: 16 },
  { path: ['live', 'rug'], lo: 0.35, hi: 1.2 },
  // The paint is the look the owner asked for: the tuner may weaken it, never remove it.
  { path: ['grime', 'mottle'], lo: 0.5, hi: 2.5 },
  { path: ['grime', 'dirt'], lo: 0, hi: 1.5 },
  { path: ['grime', 'damp'], lo: 0, hi: 1.2 },
  { path: ['grime', 'wear'], lo: 0, hi: 1 },
  { path: ['paint', 'strokes'], lo: 0.6, hi: 2 },
  // Not the grade: it lies over every room's frame, so the hall alone may not
  // turn it. Tuned on the hall, it took four other rooms out of their target.
];
const get = (o, p) => p.reduce((a, k) => a[k], o);
const set = (o, p, v) => {
  p.slice(0, -1).reduce((a, k) => a[k], o)[p.at(-1)] = v;
};

/** How far a frame is from the target: squared errors, each in units of a sensible step. */
const lr = (v, t) => Math.log(Math.max(v, 1e-6) / t);
function globalScore(s) {
  const t = TARGET;
  return (
    (lr(s.p50, t.luminance.p50) / 0.4) ** 2 +
    (lr(s.p95, t.luminance.p95) / 0.4) ** 2 +
    ((s.greenDominant - t.greenDominant) / 0.04) ** 2 +
    ((s.saturation - t.saturation) / 0.05) ** 2 +
    (lr(s.detail, t.detail) / 0.3) ** 2 +
    (lr(s.colours15, t.colours15) / 0.5) ** 2
  );
}
function regionScore(r) {
  let sum = 0;
  r.forEach((c, i) => {
    const t = TARGET.regions[i];
    sum += (lr(c.mean, t.mean) / 0.5) ** 2 + (lr(c.p50, t.p50) / 0.5) ** 2 + ((c.saturation - t.saturation) / 0.06) ** 2 + (lr(c.detail, t.detail) / 0.4) ** 2;
  });
  return sum / 4;
}

console.log('tune: the slow part of the bake, once …');
const fields = await chartFields('public/assets/house/textures');

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 1344, height: 896 }, serviceWorkers: 'block' })).newPage();
await page.goto(new URL('house/', ROOT).href);
await page.waitForFunction(() => window.__house?.phase === 'title', null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__house;
  g.canvas.requestPointerLock = () => Promise.resolve();
  g.manualClockOnStart = true;
  document.getElementById('start').click();
});
await page.waitForFunction(() => window.__house.phase === 'playing');
await page.addStyleTag({ content: '#hud, #ring, #touch { display: none !important; }' });

const url = (png) => `data:image/png;base64,${png.toString('base64')}`;
let evals = 0;
async function score(look) {
  evals++;
  const charts = [];
  for (const [i, f] of fields.entries()) charts.push([f.chart.id, url(await encode(f, compose(f, look, i)))]);
  const lut = gradeLut(look.grade);
  const grade = url(await sharp(Buffer.from(lut.data.buffer), { raw: { width: lut.width, height: lut.height, channels: 3 } }).png().toBuffer());
  await page.evaluate(
    async ([charts, grade, live]) => {
      const g = window.__house;
      const load = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      for (const [id, src] of charts) {
        const t = g.surfaces.tex[`baked:${id}`];
        t.image = await load(src);
        t.needsUpdate = true;
      }
      g.surfaces.grade.image = await load(grade);
      g.surfaces.grade.needsUpdate = true;
      g.surfaces.materials.hallRug.color.setScalar(live.rug);
    },
    [charts, grade, look.live]
  );
  let total = 0;
  const parts = [];
  for (const v of VIEWS) {
    await page.evaluate((v) => {
      const g = window.__house;
      g.player.position.set(v.pos[0], 0, v.pos[1]);
      g.player.velocity.set(0, 0, 0);
      g.player.yaw = v.yaw;
      g.player.pitch = v.pitch;
      for (let i = 0; i < 3; i++) g.stepForTest(1 / 60);
    }, v);
    const shot = await page.screenshot();
    const { data, info } = await sharp(shot).resize(448, 299, { fit: 'fill', kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const g = globalScore(stats(data, info.width, info.height));
    total += g;
    parts.push(g.toFixed(1));
    if (v.regions) {
      const r = regionScore(regions(data, info.width, info.height));
      total += r;
      parts.push(`regions ${r.toFixed(1)}`);
    }
  }
  return { total, parts };
}

let best = readLook();
let bestScore = await score(best);
console.log(`start: ${bestScore.total.toFixed(2)} (${bestScore.parts.join(', ')})`);
const steps = KNOBS.map((k) => (k.log ? 0.35 : (k.hi - k.lo) * 0.2));
while (evals < MAX_EVALS && steps.some((s, i) => s > (KNOBS[i].log ? 0.02 : (KNOBS[i].hi - KNOBS[i].lo) * 0.01))) {
  let improved = false;
  for (const [i, k] of KNOBS.entries()) {
    if (evals >= MAX_EVALS) break;
    for (const dir of [1, -1]) {
      const cur = get(best, k.path);
      let next = k.log ? cur * Math.exp(dir * steps[i]) : cur + dir * steps[i];
      next = Math.round(Math.min(k.hi, Math.max(k.lo, next)) * 1000) / 1000;
      if (next === cur) continue;
      const trial = structuredClone(best);
      set(trial, k.path, next);
      const s = await score(trial);
      if (s.total < bestScore.total - 1e-3) {
        best = trial;
        bestScore = s;
        improved = true;
        console.log(`  ${String(evals).padStart(3)}  ${k.path.join('.')} → ${next}: ${s.total.toFixed(2)} (${s.parts.join(', ')})`);
        break;
      }
    }
  }
  if (!improved) for (let i = 0; i < steps.length; i++) steps[i] /= 2;
}
await browser.close();
console.log(`\ntune: ${bestScore.total.toFixed(2)} after ${evals} looks`);
if (!DRY) {
  writeFileSync(LOOK_FILE, JSON.stringify(best, null, 2) + '\n');
  console.log(`written to ${LOOK_FILE}; run the pipeline to bake from it`);
} else console.log(JSON.stringify(best, null, 2));
