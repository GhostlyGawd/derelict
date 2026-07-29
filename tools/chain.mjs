/**
 * Phase 2 chain check. Drives the six-step dependency chain and asserts that
 * every step refuses to work before its predecessor has been done.
 *
 * This is the harness for P6's "real dependency depth" bar: it does not care
 * whether the route is walkable — walkthrough.mjs covers that — only that the
 * ordering is enforced by the machinery rather than merely implied by level
 * design.
 *
 *   node tools/chain.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

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
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const read = () =>
  page.evaluate(() => {
    const g = window.__derelict;
    return {
      seated: g.cells,
      carrying: g.carry.held ? g.carry.held.id : null,
      cradles: Object.fromEntries(g.carryables.cradles.map((c) => [c.id, c.released])),
      cells: Object.fromEntries(g.carryables.cells.map((c) => [c.id, c.status])),
      sockets: g.carryables.sockets.map((s) => s.filled),
      switches: Object.fromEntries(g.switches.map((s) => [s.id, s.used])),
      airlockOpen: g.doorsById.get('airlock').open,
      phase: g.phase,
    };
  });

/** Drives an interaction directly, bypassing aim — ordering is the subject here. */
const act = (what, id) =>
  page.evaluate(
    ([kind, target]) => {
      const g = window.__derelict;
      const find = {
        switch: () => g.switches.find((s) => s.id === target),
        cell: () => g.carryables.cells.find((c) => c.id === target),
        socket: () => g.carryables.sockets.find((s) => s.id === target),
      }[kind]();
      if (!find) throw new Error(`no ${kind} named ${target}`);
      g.pressInteractForTest(find);
    },
    [what, id]
  );

/** An interact press with the crosshair on nothing — the set-down gesture. */
const setDown = () => page.evaluate(() => window.__derelict.pressInteractForTest(null));

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

console.log(`chain: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(800);

// ---- Nothing works before its predecessor ---------------------------------
let s = await read();
expect('cell 1 starts clamped', s.cradles.cradle1 === false, JSON.stringify(s.cradles));
expect('cell 2 starts clamped', s.cradles.cradle2 === false, JSON.stringify(s.cradles));

await act('cell', 'cell1');
s = await read();
expect('cannot take cell 1 before switch 1', s.carrying === null, `carrying ${s.carrying}`);

await act('socket', 'socket1');
s = await read();
expect('cannot seat with empty hands', s.seated === 0, `seated ${s.seated}`);

// ---- Step 1-3 --------------------------------------------------------------
await act('switch', 'switch1');
await page.waitForTimeout(200);
s = await read();
expect('switch 1 releases cradle 1', s.cradles.cradle1 === true, JSON.stringify(s.cradles));
expect('switch 1 does NOT release cradle 2', s.cradles.cradle2 === false, JSON.stringify(s.cradles));
expect('switch 1 no longer credits a cell', s.seated === 0, `seated ${s.seated}`);

await act('cell', 'cell1');
s = await read();
expect('cell 1 can now be taken', s.carrying === 'cell1', `carrying ${s.carrying}`);

await act('cell', 'cell2');
s = await read();
expect('cannot take a second cell while carrying', s.carrying === 'cell1', `carrying ${s.carrying}`);

await act('socket', 'socket1');
await page.waitForTimeout(200);
s = await read();
expect('seating cell 1 reads 1/2', s.seated === 1, `seated ${s.seated}`);
expect('hands are empty again', s.carrying === null, `carrying ${s.carrying}`);
expect('cell 1 is spent', s.cells.cell1 === 'seated', s.cells.cell1);

// ---- Step 4-6: both conditions required ------------------------------------
expect('bay live alone does NOT release cradle 2', s.cradles.cradle2 === false, JSON.stringify(s.cradles));

await act('cell', 'cell2');
s = await read();
expect('cell 2 still not takeable', s.carrying === null, `carrying ${s.carrying}`);

await act('switch', 'switch2');
await page.waitForTimeout(200);
s = await read();
expect('switch 2 plus bay live releases cradle 2', s.cradles.cradle2 === true, JSON.stringify(s.cradles));

await act('cell', 'cell2');
s = await read();
expect('cell 2 can now be taken', s.carrying === 'cell2', `carrying ${s.carrying}`);

// ---- Set down and recover --------------------------------------------------
await setDown();
s = await read();
expect('setting down empties the hands', s.carrying === null, `carrying ${s.carrying}`);
expect('a set-down cell is loose', s.cells.cell2 === 'loose', s.cells.cell2);

await act('cell', 'cell2');
s = await read();
expect('a loose cell can be picked up again', s.carrying === 'cell2', `carrying ${s.carrying}`);

// ---- Finish ----------------------------------------------------------------
await act('socket', 'socket2');
await page.waitForTimeout(300);
s = await read();
expect('seating cell 2 reads 2/2', s.seated === 2, `seated ${s.seated}`);

await page
  .waitForFunction(() => window.__derelict.doorsById.get('airlock').open, null, { timeout: 30000 })
  .catch(() => {
    failures++;
    console.log('  FAIL  airlock cycles at 2/2 — it never opened');
  });
console.log('  ok    airlock cycles at 2/2');

// ---- Sockets are one-way ---------------------------------------------------
await act('cell', 'cell1');
s = await read();
expect('a seated cell can never be retrieved', s.carrying === null, `carrying ${s.carrying}`);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nchain: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nchain: OK — every step refuses to work before its predecessor');
