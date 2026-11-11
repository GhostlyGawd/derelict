/**
 * Nothing compiles after the title — phase 9, spec 9.4.7.
 *
 * Phase 8's profiler read the owner's phone and found the first real hitch the
 * project had measured: one 195 ms frame in the Annex as its lamps struck. On
 * a phone, a shader program compiling for the first time is a stall, and so is
 * a large texture or buffer upload. The game used to build those lazily, the
 * first time each thing was drawn, which is in the middle of play.
 *
 * Since phase 9 the game draws everything once while it loads (`#warmUp` in
 * src/main.js). This holds it to that: it reads the renderer's own counts of
 * programs, textures and geometries when the run starts, then plays the whole
 * chain through to the threshold, looking round every compartment in every
 * state, carrying and not, with the sky in view, and requires that none of
 * the three counts has gone up. A new feature that adds a material and forgets
 * nothing else fails here, not on the owner's phone.
 *
 * Before the warm-up existed, this run went from 10 programs to 15 and from 42
 * geometries to 127 after the title.
 *
 *   node tools/warm.mjs [baseUrl]
 */
import { boot, deviceFor, launch } from './lib/replayer.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

const errors = [];
const browser = await launch();

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

console.log(`warm: ${BASE}`);
for (const device of [
  { name: 'desktop', viewport: { w: 1024, h: 640, dpr: 1 }, touch: false },
  { name: 'portrait phone', viewport: { w: 390, h: 844, dpr: 1 }, touch: true },
]) {
  const { context, page } = await deviceFor(browser, device, errors);
  await boot(page, BASE);
  await page.evaluate(() => {
    window.__derelict.manualClockOnStart = true;
    document.getElementById('start').click();
  });
  await page.waitForFunction(() => window.__derelict?.phase === 'playing' && window.__derelict.manualClock, null, {
    timeout: 15000,
  });
  const log = await page.evaluate(() => {
    const g = window.__derelict;
    const r = g.view.renderer;
    const counts = () => ({
      programs: r.info.programs.length,
      textures: r.info.memory.textures,
      geometries: r.info.memory.geometries,
    });
    const steps = [];
    const frames = (n) => {
      for (let i = 0; i < n; i++) g.stepForTest(1 / 60);
    };
    // Every compartment, all four ways and up at the ceiling, drawn for real.
    const lookRound = (label) => {
      for (const s of g.spaces) {
        for (let k = 0; k < 4; k++) {
          g.player.position.set((s.x[0] + s.x[1]) / 2, 0, (s.z[0] + s.z[1]) / 2);
          g.player.yaw = (k * Math.PI) / 2;
          g.player.pitch = k === 0 ? 0.6 : 0;
          frames(1);
        }
      }
      steps.push([label, counts()]);
    };
    frames(1);
    const start = counts();
    const sw = (id) => g.switches.find((s) => s.id === id);
    const c = g.carryables;
    lookRound('on emergency power');
    g.pressInteractForTest(sw('switch1'));
    frames(30);
    lookRound('Hold struck');
    g.pressInteractForTest(c.cell('cell1'));
    lookRound('carrying cell 1');
    g.pressInteractForTest(c.sockets[0]);
    frames(30);
    lookRound('cell 1 seated');
    g.pressInteractForTest(sw('switch2'));
    frames(30);
    lookRound('Annex struck');
    g.pressInteractForTest(c.cell('cell2'));
    g.pressInteractForTest(c.sockets[1]);
    frames(30);
    lookRound('both seated');
    // Out: into the chamber, the outer door, the sky.
    g.player.position.set(0, 0, -9.5);
    g.player.yaw = 0;
    frames(400);
    g.player.position.set(0, 0, -13.6);
    for (let k = 0; k < 4; k++) {
      g.player.yaw = (k * Math.PI) / 2;
      frames(2);
    }
    steps.push(['outside, under the sky', counts()]);
    return { start, steps, phase: g.phase };
  });
  await context.close();

  console.log(`\n  ${device.name}: ${log.start.programs} programs, ${log.start.textures} textures, ${log.start.geometries} geometries when the run starts`);
  for (const [label, n] of log.steps) {
    const grew = ['programs', 'textures', 'geometries'].filter((k) => n[k] > log.start[k]);
    expect(
      `${label}: nothing new built`,
      grew.length === 0,
      grew.map((k) => `${k} ${log.start[k]} → ${n[k]}`).join(', ')
    );
  }
  expect(`${device.name}: the run reached the outside (${log.phase})`, log.phase === 'leaving' || log.phase === 'ending', `phase ${log.phase}`);
}

await browser.close();
if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nwarm: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nwarm: OK — nothing compiles or uploads after the title');
