/**
 * The camera match (9.3, the owner's painting as a source): renders the hall
 * from where the player starts, at the painting's size, and lays the
 * painting's edges over it, so the hall can be re-laid until its lines are
 * the painting's lines. A tool for the build, not a gate.
 *
 *   node tools/house/match.mjs [baseUrl] [out.png] [--pos x,y,z] [--yaw a] [--pitch a] [--fov f]
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ROOT = process.argv.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:4173/';
const OUT = process.argv.find((a) => a.endsWith('.png')) || 'match.png';
const W = 1344;
const H = 896;

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' })).newPage();
page.on('pageerror', (e) => console.error(e));
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
const view = await page.evaluate(
  ([pos, yaw, pitch, fov, plain]) => {
    const g = window.__house;
    // For the overlay, the hall's own geometry: the painting is switched off.
    if (!plain && g.projection) g.projection.uniforms.pMatrix.value.multiplyScalar(0);
    const render = g.grade.render.bind(g.grade);
    g.grade.render = (s, c) => render(s, c, null);
    if (fov) {
      g.fovOverride = Number(fov);
    }
    const spawn = g.layout.SPAWN;
    const p = pos ? pos.split(',').map(Number) : [spawn.pos[0], spawn.pos[1], spawn.pos[2]];
    g.player.position.set(p[0], p[1], p[2]);
    g.player.velocity.set(0, 0, 0);
    g.player.yaw = yaw !== undefined ? Number(yaw) : spawn.yaw;
    g.player.pitch = pitch !== undefined ? Number(pitch) : spawn.pitch ?? 0;
    for (let i = 0; i < 3; i++) g.stepForTest(1 / 60);
    if (fov) {
      g.camera.fov = Number(fov);
      g.camera.updateProjectionMatrix();
      g.stepForTest(1 / 60);
    }
    // The painting's own camera: level, its lens shifted to put the horizon
    // where the painting has it (PAINTING in layout.js).
    const P = g.layout.PAINTING;
    if (P && !pitch) {
      g.player.yaw = P.yaw;
      g.player.pitch = 0;
      g.stepForTest(1 / 60);
      const w = innerWidth;
      const h = innerHeight;
      g.camera.setViewOffset(w, h, (0.5 - P.axis[0]) * w, (0.5 - P.axis[1]) * h, w, h);
      g.stepForTest(1 / 60);
    }
    const c = g.camera;
    return { pos: c.position.toArray(), fov: c.fov, yaw: g.player.yaw, pitch: g.player.pitch };
  },
  [arg('--pos'), arg('--yaw'), arg('--pitch'), arg('--fov'), process.argv.includes('--plain')]
);
console.log(JSON.stringify(view));
const shot = await page.screenshot();
await browser.close();

// The painting's edges, in magenta, over the hall.
const paint = await sharp(new URL('../../pipeline/house/concept/hall.jpg', import.meta.url).pathname).resize(W, H).greyscale().raw().toBuffer();
const edge = new Uint8Array(W * H);
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = paint[i + 1 - W] + 2 * paint[i + 1] + paint[i + 1 + W] - paint[i - 1 - W] - 2 * paint[i - 1] - paint[i - 1 + W];
    const gy = paint[i + W - 1] + 2 * paint[i + W] + paint[i + W + 1] - paint[i - W - 1] - 2 * paint[i - W] - paint[i - W + 1];
    edge[i] = Math.hypot(gx, gy) > 70 ? 255 : 0;
  }
if (process.argv.includes('--plain')) {
  await sharp(shot).resize(W, H).png().toFile(OUT);
  process.exit(0);
}
const { data } = await sharp(shot).resize(W, H).removeAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < W * H; i++) {
  // Lift the render so its own lines show, and draw the painting's on top.
  for (let k = 0; k < 3; k++) data[i * 3 + k] = Math.min(255, data[i * 3 + k] * 1.8 + 20);
  if (edge[i]) data.set([255, 0, 255], i * 3);
}
await sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT);
