/**
 * The weight — phase 7, spec 7.3.3.
 *
 * The generated asset set has grown every phase — 1.8 MB in v1, 2.15 MB after
 * phase 4, 2.39 MB after phase 6 — and nothing measured it. Everything loads
 * before the title appears, so every byte is paid for before the first frame.
 *
 * Two numbers, split the way the frame budget splits them:
 *
 *   - **Bytes to title, by kind, gated.** Every response body the page takes
 *     before the title is shown, counted decoded, so it is the same whether
 *     the server compresses or not: a fact about the game, not about the host.
 *   - **Time to title under a pinned network, reported.** A throttled profile
 *     fixed below. The transfer part follows the throttle and the decode part
 *     follows the runner's CPU, so — 5.3.2's argument — it is a report and not
 *     a budget.
 *
 * It also reports what share of the bytes are things nobody needs until the
 * last ten seconds of a run. 7.3.3 allows one optimisation, deferring those,
 * only if that share is real.
 *
 *   node tools/weight.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

/**
 * Bytes to title, decoded. Set at the phase 7 build's measured 3.37 MB plus 15%
 * headroom — about one phase's worth of growth at the rate the last three
 * phases grew. A phase that needs more changes 7.3.3 and this number together,
 * on purpose.
 */
const BUDGET = 3_870_000;

/** A pinned, unremarkable phone connection: 10 Mbit/s down, 40 ms round trip. */
const NETWORK = {
  offline: false,
  latency: 40,
  downloadThroughput: (10 * 1024 * 1024) / 8,
  uploadThroughput: (5 * 1024 * 1024) / 8,
};

/** Only needed for the ending: the sky is behind the outer door, the sting plays on the card. */
const END_ONLY = [/\/assets\/sky\//, /end_sting\./];

function kindOf(url) {
  const u = new URL(url);
  const p = u.pathname;
  if (/\/assets\/textures\//.test(p)) return 'textures';
  if (/\/assets\/sky\//.test(p)) return 'sky';
  if (/\/assets\/models\//.test(p)) return 'models';
  if (/\/assets\/audio\/ir_/.test(p)) return 'responses';
  if (/\/assets\/audio\//.test(p)) return 'sounds';
  if (/manifest\.json$/.test(p)) return 'manifest';
  if (/\.js$/.test(p)) return 'script';
  if (/\.css$/.test(p)) return 'style';
  if (p === '/' || /\.html$/.test(p)) return 'page';
  return 'other';
}

const errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

/** One cold load to the title. Returns bytes per request and the time it took. */
async function load({ throttle }) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) await cdp.send('Network.emulateNetworkConditions', NETWORK);

  const urls = new Map();
  const bytes = new Map();
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
  // Decoded bytes, summed as they arrive — the same count whether or not the
  // server compressed the body on the way.
  cdp.on('Network.dataReceived', (e) => bytes.set(e.requestId, (bytes.get(e.requestId) || 0) + e.dataLength));

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 240000 });
  const ms = Date.now() - t0;

  const rows = [...bytes.entries()]
    .map(([id, n]) => ({ url: urls.get(id), bytes: n }))
    .filter((r) => r.url && !r.url.startsWith('data:'));
  await context.close();
  return { rows, ms };
}

console.log(`weight: ${BASE}`);

const cold = await load({ throttle: false });
const byKind = new Map();
for (const r of cold.rows) {
  const k = kindOf(r.url);
  byKind.set(k, (byKind.get(k) || 0) + r.bytes);
}
const total = cold.rows.reduce((s, r) => s + r.bytes, 0);
const endOnly = cold.rows.filter((r) => END_ONLY.some((re) => re.test(r.url))).reduce((s, r) => s + r.bytes, 0);

const kb = (n) => `${(n / 1024).toFixed(0).padStart(6)} kB`;
console.log('\n  bytes to title, decoded');
for (const k of ['page', 'script', 'style', 'manifest', 'textures', 'sky', 'models', 'sounds', 'responses', 'other']) {
  if (byKind.has(k)) console.log(`    ${k.padEnd(10)} ${kb(byKind.get(k))}  ${((byKind.get(k) / total) * 100).toFixed(1).padStart(5)}%`);
}
console.log(`    ${'TOTAL'.padEnd(10)} ${kb(total)}  (${cold.rows.length} requests)`);
console.log(`    end-only   ${kb(endOnly)}  ${((endOnly / total) * 100).toFixed(1).padStart(5)}% — the sky and the end sting`);

expect(
  `bytes to title ${(total / 1e6).toFixed(2)} MB inside the ${(BUDGET / 1e6).toFixed(2)} MB budget`,
  total <= BUDGET,
  `${((total / BUDGET - 1) * 100).toFixed(1)}% over — either the game got heavier or the budget is wrong, and one of them changes on purpose, in 7.3.3 first`
);
expect(
  'every generated asset was among them',
  ['textures', 'models', 'sounds', 'responses', 'sky'].every((k) => byKind.get(k) > 0),
  `kinds seen: ${[...byKind.keys()].join(', ')}`
);

// Reported, never gated.
const slow = await load({ throttle: true });
console.log(
  `\n  time to title on ${NETWORK.downloadThroughput / 131072} Mbit/s, ${NETWORK.latency} ms: ` +
    `${(slow.ms / 1000).toFixed(1)} s (reported, not gated — part of it is this runner's CPU)`
);
console.log(
  `  the transfer alone at that rate is about ${((total / NETWORK.downloadThroughput)).toFixed(1)} s; ` +
    `deferring the end-only assets would save about ${(endOnly / NETWORK.downloadThroughput).toFixed(2)} s of it`
);

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nweight: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nweight: OK');
