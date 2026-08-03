/**
 * The frame budget — phase 5, spec 5.3.2.
 *
 * Phase 4 added relief and convolution, the owner reported the game felt "a
 * touch less responsive", and the build could not say by how much. The
 * software rasteriser in CI cannot separate Phong-plus-a-normal-map from
 * Lambert in absolute terms — a targeted probe returned four variants within
 * noise and out of order — and the frame-time watchdog bottoms out at its floor
 * there regardless. Neither instrument said anything.
 *
 * So this one measures a *ratio*, never a frame rate. Same scene, same
 * geometry, same draw calls, same pinned internal resolution, same pinned
 * camera stations; the only thing that changes is whether the six tiling
 * surfaces are the shipped Phong-with-relief or a stripped Lambert twin. A
 * ratio survives a slow host. An absolute number is a fact about the runner.
 *
 * Three things make the number mean something:
 *
 *   - `gl.finish()` after every draw. WebGL commands are queued, so timing a
 *     `render()` call without a sync measures how fast the driver accepts work.
 *     It slows the game down identically in both configurations, which is
 *     exactly what a ratio is allowed to do.
 *   - The two configurations are interleaved, not run in blocks. A host that
 *     drifts — thermally, or because something else woke up — biases whichever
 *     half ran later, and ABAB cancels it where AAABBB banks it.
 *   - The median, not the mean. One 400 ms hitch from a garbage collection is
 *     worth more than every other frame put together to a mean.
 *
 *   node tools/framecost.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

/** Frames per timed burst. One is enough once the sync below is honest. */
const BURST = 2;
/** Timed bursts kept per station, per configuration, per repetition. */
const BATCHES = 4;
/** ABAB repetitions. */
const REPS = 3;

/**
 * What relief is allowed to cost.
 *
 * A ceiling on the ratio, never on any number of milliseconds — the whole point
 * is that milliseconds here belong to the CI box.
 *
 * The bar is well above the measurement, and deliberately. Interleaving makes
 * the two passes within a run agree to a fraction of a percent, but the ratio
 * itself moves with what else the host is doing: measured at 1.24× and 1.27×
 * on a quiet machine and 1.50× on one that was already running a full test
 * suite. That is not noise in the instrument, it is a real effect — SwiftShader
 * is multithreaded, and under contention the heavier shader loses more than the
 * lighter one, so the gap widens exactly when the box is busy. A budget set
 * against the quiet number would fail honest builds on a loaded runner.
 *
 * 1.9× still catches the thing this exists to catch: a phase that doubles the
 * cost of a frame and does not notice.
 */
const CEILING = 1.9;

/**
 * How closely the two independent passes have to agree, as a fraction of their
 * mean. An instrument whose readings disagree by more than this is not
 * reporting a budget, it is reporting weather. Both passes run under the same
 * conditions in the same process, so this is a check on the instrument and not
 * on the host.
 */
const AGREEMENT = 0.15;

/** Pinned camera stations: two corridors' worth of cheap, two rooms of dear. */
const STATIONS = [
  { name: 'bay/airlock', pos: [0, 4.4], yaw: 0 },
  { name: 'corridor A', pos: [-12.5, 0], yaw: Math.PI / 2 },
  { name: 'storage hold', pos: [-21.5, 0], yaw: Math.PI / 2 },
  { name: 'engine annex', pos: [21.5, 0], yaw: -Math.PI / 2 },
];

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

console.log(`framecost: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(1200);

const setUp = await page.evaluate(
  ([burst, batches]) => {
    const g = window.__derelict;

    // Pin the picture. The watchdog steps the internal scale down on a host
    // that cannot hold the target, and a resolution change part-way through
    // would change the pixel count under one configuration and not the other.
    g.view.setScale(0.5);
    window.dispatchEvent(new Event('resize'));

    // Pin the lighting. Every zone powered is the expensive state and the one
    // the watchdog was latching too early to ever see; it is also the only
    // state that is identical from one run to the next without playing the game
    // to reach it.
    for (const id of ['bay', 'corrA', 'hold', 'corrB', 'annex', 'shortcut', 'chamber']) {
      g.lighting.setPowered(id, true);
    }

    // The Lambert constructor is borrowed off a material already in the scene
    // rather than imported. The build is a bundle with no global three.js on
    // it, and the props, the jaws and every un-relieved surface are Lambert
    // already — so the control is built with the same class the game itself
    // uses for exactly this, which is a stronger guarantee than an import.
    let Lambert = null;
    g.scene.traverse((node) => {
      if (!Lambert && node.isMesh && node.material && node.material.isMeshLambertMaterial) {
        Lambert = node.material.constructor;
      }
    });
    if (!Lambert) return { swapped: 0, why: 'no Lambert material in the scene to build a control from' };

    // Build the stripped twin once, per mesh. Same map, same colour, same
    // geometry, same draw call — Lambert instead of Phong, and no relief. That
    // is exactly the pair of things phase 4 added to these surfaces, so the
    // ratio is the price of 4.3.1 and nothing else.
    const swaps = [];
    g.scene.traverse((node) => {
      if (!node.isMesh || !node.material || !node.material.isMeshPhongMaterial) return;
      if (!node.material.normalMap) return;
      const shipped = node.material;
      swaps.push({
        node,
        shipped,
        stripped: new Lambert({
          map: shipped.map,
          color: shipped.color.clone(),
          fog: shipped.fog,
          side: shipped.side,
        }),
      });
    });

    const view = g.view;
    const gl = view.renderer.getContext();
    const original = view.render.bind(view);
    const state = { swaps, burst, batches, owning: false };

    // While a measurement is in flight the game's own loop draws nothing. It
    // still runs — the player still updates, the camera still syncs — but the
    // only GL work in the process is this harness's, so a batch cannot be part
    // of somebody else's frame.
    view.render = (scene, camera, viewmodel) => {
      if (!state.owning) original(scene, camera, viewmodel);
    };

    state.wear = (config) => {
      for (const s of state.swaps) s.node.material = config === 'shipped' ? s.shipped : s.stripped;
    };

    /**
     * Renders `burst` frames back to back and returns the mean ms per frame.
     *
     * The sync is a one-pixel `readPixels`, and it has to be. `gl.finish()` is
     * the obvious call and it does not work here: under SwiftShader it returned
     * in a few tenths of a millisecond while the frame it was supposedly
     * waiting for took eighty, because the raster work is queued out of process
     * and Finish only waits for submission. Timing against it reported a whole
     * scene rendering in 1.1 ms and, worse, produced stations where stripping
     * the relief made the frame *slower* — noise, dressed as a result. It also
     * silently piled up hundreds of queued frames, which is why the first
     * version of this harness took twenty minutes to say nothing.
     *
     * `readPixels` cannot be answered without the pipeline actually finishing,
     * so it is the sync. With it, one render measures the same 85 ms whether it
     * is timed alone or eight at a time — which is what an instrument agreeing
     * with itself looks like.
     */
    const pixel = new Uint8Array(4);
    const timeBurst = () => {
      const g2 = window.__derelict;
      const t0 = performance.now();
      for (let i = 0; i < state.burst; i++) original(g2.scene, g2.camera, g2.viewmodel);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return (performance.now() - t0) / state.burst;
    };

    const frames = (n) =>
      new Promise((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });

    /** Sits at a station in one configuration and returns `batches` readings. */
    state.run = async (station, config) => {
      const g2 = window.__derelict;
      g2.player.position.set(station.pos[0], 0, station.pos[1]);
      g2.player.yaw = station.yaw;
      g2.player.pitch = 0;
      state.wear(config);
      // Let the game's loop carry the camera to where the player now is, and
      // let three.js compile whatever the swap invalidated, before timing.
      await frames(3);

      state.owning = true;
      timeBurst(); // discarded: program compiles and first-use texture uploads
      const samples = [];
      for (let i = 0; i < state.batches; i++) samples.push(timeBurst());
      state.owning = false;
      return samples;
    };

    window.__cost = state;
    return { swapped: swaps.length };
  },
  [BURST, BATCHES]
);

if (!setUp.swapped) {
  throw new Error(
    setUp.why || 'no Phong surface with relief in the scene — nothing to weigh against anything'
  );
}
console.log(`  ${setUp.swapped} surfaces carry relief; stripping them is the control\n`);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** One complete interleaved pass over every station. Returns the ratio. */
async function pass(label) {
  const shipped = [];
  const stripped = [];
  const rows = [];

  for (const station of STATIONS) {
    const here = { shipped: [], stripped: [] };
    for (let rep = 0; rep < REPS; rep++) {
      // Order flips every repetition, so neither configuration is always the
      // one that runs on a colder cache.
      const order = rep % 2 ? ['stripped', 'shipped'] : ['shipped', 'stripped'];
      for (const config of order) {
        const samples = await page.evaluate(
          ([st, cfg]) => window.__cost.run(st, cfg),
          [station, config]
        );
        here[config].push(...samples);
      }
    }
    shipped.push(...here.shipped);
    stripped.push(...here.stripped);
    rows.push([station.name, median(here.shipped), median(here.stripped)]);
  }

  const ms = median(shipped);
  const mc = median(stripped);
  const ratio = mc > 0 ? ms / mc : Infinity;

  console.log(`  ${label}`);
  console.log(`    ${'station'.padEnd(16)} ${'shipped'.padStart(9)} ${'stripped'.padStart(9)}  ratio`);
  for (const [name, a, b] of rows) {
    console.log(
      `    ${name.padEnd(16)} ${a.toFixed(2).padStart(7)}ms ${b.toFixed(2).padStart(7)}ms  ${(a / b).toFixed(3)}`
    );
  }
  console.log(
    `    ${'ALL'.padEnd(16)} ${ms.toFixed(2).padStart(7)}ms ${mc.toFixed(2).padStart(7)}ms  ${ratio.toFixed(3)}\n`
  );
  return ratio;
}

const first = await pass('pass 1');
const second = await pass('pass 2');

const spread = Math.abs(first - second) / ((first + second) / 2);
expect(
  `the instrument repeats (${first.toFixed(3)} then ${second.toFixed(3)}, ${(spread * 100).toFixed(1)}% apart)`,
  spread <= AGREEMENT,
  `two passes over the same scene disagree by ${(spread * 100).toFixed(1)}% — this is not yet a budget`
);

const ratio = (first + second) / 2;
expect(
  `relief costs ${ratio.toFixed(3)}× a stripped frame (budget ${CEILING}×)`,
  ratio <= CEILING,
  `${ratio.toFixed(3)}× is over the budget in tools/framecost.mjs — either the frame got dearer or the budget is wrong, and one of the two has to change on purpose`
);

console.log(`  frame budget: relief costs ${ratio.toFixed(3)}× a stripped frame`);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nframecost: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nframecost: OK');
