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
 * Phase 8 adds the second visit (8.3.6). The built site is copied somewhere
 * this harness can change it, served by a server here that applies
 * vercel.json's own headers and counts every byte it sends, and visited with
 * the service worker allowed:
 *
 *   - the second visit takes nothing from the network but the worker's own
 *     update check;
 *   - with the network cut, the game still reaches its title;
 *   - after a simulated deploy, the next visit is still the old build and the
 *     one after it is the new one, with only the changed files fetched;
 *   - deploying a worker that retires itself leaves no worker and no cache;
 *   - and nothing served immutable is a file whose name does not change when
 *     its content does.
 *
 *   node tools/weight.mjs [baseUrl]
 */
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

import { writePrecache } from '../src/sw/precache.mjs';

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

// ---- 8.3.6: the second visit, offline, a deploy, and a retirement ------------
console.log('\n  the second visit');
const DIST = path.resolve('dist');
const vercel = JSON.parse(readFileSync(path.resolve('vercel.json'), 'utf8'));
/** vercel.json's `source` patterns, close enough for the shapes this file uses. */
const ruleMatches = (source, url) => new RegExp(`^${source.replace(/\(\.\*\)/g, '.*')}$`).test(url);
const headersFor = (url) => {
  const out = { 'Cache-Control': 'public, max-age=0, must-revalidate' }; // Vercel's default for static files
  for (const rule of vercel.headers || []) {
    if (ruleMatches(rule.source, url)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
};

// Static: every file served immutable must be one whose name changes with its
// content. The generated assets keep their names from build to build.
{
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(`/${path.relative(DIST, full).split(path.sep).join('/')}`);
    }
  };
  walk(DIST);
  const pinned = files.filter((f) => /immutable/.test(headersFor(f)['Cache-Control'] || ''));
  const unhashed = pinned.filter((f) => !/-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(f));
  expect(
    `${pinned.length} files served immutable, every one named by its content`,
    pinned.length > 0 && unhashed.length === 0,
    `${unhashed.length} immutable files keep their name when their content changes: ${unhashed.slice(0, 4).join(', ')}`
  );
}

const SITE = mkdtempSync(path.join(tmpdir(), 'derelict-site-'));
cpSync(DIST, SITE, { recursive: true });
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
let served = [];
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(SITE, url === '/' ? 'index.html' : url);
  if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const body = readFileSync(file);
  served.push({ url, bytes: body.length });
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...headersFor(url) });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const sum = (list) => list.reduce((n, r) => n + r.bytes, 0);

const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 }, serviceWorkers: 'allow' });
const visit = async (page) => {
  await page.goto(`${ORIGIN}/?sw`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 120000 });
};
const settled = (page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 600 && (reg.installing || reg.waiting || reg.active?.state !== 'activated'); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return { state: reg.active?.state, controlled: Boolean(navigator.serviceWorker.controller) };
  });
const marker = (page) => page.evaluate(() => document.documentElement.dataset.build || null);

let page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await visit(page);
const first = await settled(page);
const firstBytes = sum(served);
console.log(`  first visit and install: ${(firstBytes / 1e6).toFixed(2)} MB from the network, worker ${first.state}`);
expect('the worker installs and activates on the first visit', first.state === 'activated', `worker ${first.state}`);

// The manifest a home screen reads, and the icons it names.
const app = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  const m = await (await fetch(link.href)).json();
  const icons = [];
  for (const icon of m.icons) {
    const img = new Image();
    img.src = icon.src;
    await img.decode();
    icons.push({ want: icon.sizes, got: `${img.naturalWidth}x${img.naturalHeight}` });
  }
  return { display: m.display, start: m.start_url, icons };
});
expect(
  `the web app manifest opens ${app.display} at ${app.start}, with ${app.icons.length} generated icons of the sizes it says`,
  app.display === 'fullscreen' && app.icons.length >= 2 && app.icons.every((i) => i.want === i.got),
  JSON.stringify(app.icons)
);

served = [];
await visit(page);
const second = served.filter((r) => r.url !== '/sw.js');
expect(
  `the second visit takes ${sum(second)} bytes from the network (the worker's own update check aside)`,
  second.length === 0 && (await settled(page)).controlled,
  `${second.length} requests: ${second.slice(0, 5).map((r) => r.url).join(', ')}`
);

await ctx.setOffline(true);
let offline = 'title';
try {
  await visit(page);
} catch (err) {
  offline = String(err.message || err).split('\n')[0];
}
await ctx.setOffline(false);
expect('with the network cut, the game reaches its title', offline === 'title', offline);

// A deploy: one texture and the page change, everything else does not.
const TEX = 'assets/textures/floor_plate.png';
writeFileSync(path.join(SITE, 'index.html'), readFileSync(path.join(SITE, 'index.html'), 'utf8').replace('<html lang="en">', '<html lang="en" data-build="next">'));
const swapped = readFileSync(path.join(SITE, 'assets/textures/ceiling_plate.png'));
writeFileSync(path.join(SITE, TEX), swapped);
const deploy = writePrecache(SITE);
served = [];
await visit(page);
const stillOld = (await marker(page)) === null;
await settled(page);
const fetched = [...new Set(served.map((r) => r.url))];
await page.close();
await new Promise((r) => setTimeout(r, 800));
page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await visit(page);
const nowNew = (await marker(page)) === 'next';
const texture = await page.evaluate(async (u) => new Uint8Array(await (await fetch(`/${u}`)).arrayBuffer()).length, TEX);
expect('the visit after a deploy is still the old build, whole', stillOld, 'the new page was served before its worker had finished installing');
expect(
  `the visit after that is the new build (${deploy.build}), new texture and all`,
  nowNew && texture === swapped.length,
  `marker ${await marker(page)}, texture ${texture} bytes against ${swapped.length}`
);
const unexpected = fetched.filter((u) => !['/sw.js', '/index.html', '/', `/${TEX}`].includes(u));
expect(
  `the deploy fetched only what changed (${fetched.join(', ')})`,
  unexpected.length === 0,
  `also fetched ${unexpected.slice(0, 6).join(', ')}`
);

// And taking it back: a worker that removes itself.
writePrecache(SITE, { retire: true });
await visit(page);
for (let i = 0; i < 50; i++) {
  const gone = await page
    .evaluate(async () => !(await navigator.serviceWorker.getRegistration()) && !(await caches.keys()).some((k) => k.startsWith('derelict-')))
    .catch(() => false);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 200));
}
const retired = await page
  .evaluate(async () => ({
    registered: Boolean(await navigator.serviceWorker.getRegistration()),
    caches: (await caches.keys()).filter((k) => k.startsWith('derelict-')).length,
  }))
  .catch((e) => ({ error: String(e) }));
expect(
  'a retiring worker leaves no worker and no cache behind',
  retired.registered === false && retired.caches === 0,
  JSON.stringify(retired)
);
await ctx.close();
server.close();
rmSync(SITE, { recursive: true, force: true });

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
