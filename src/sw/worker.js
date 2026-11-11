/**
 * DERELICT's service worker — phase 8, spec 8.3.6. Built into dist/sw.js by
 * src/sw/precache.mjs, which fills in the three constants below.
 *
 * After the first visit the game, its script and every generated asset come
 * from the device. The precache list is the build's own file list, each entry
 * with a content hash, and that hash is what decides everything:
 *
 *   - A file is cached only once its bytes are checked against their hash. It
 *     is fetched from the HTTP cache first and from the network only if that
 *     copy is stale, so a deploy never caches yesterday's texture under
 *     today's name.
 *   - A file whose hash has not changed since the last build is copied across
 *     from the old cache and never fetched at all. The pipeline is
 *     byte-reproducible, so most of a deploy is that.
 *   - A new build installs beside the old one and takes over on the next visit
 *     after it has finished, so a page never runs half of one build and half
 *     of another. Then the old cache goes.
 *
 * Built with RETIRE set, this is the worker that removes itself: it clears
 * every cache it ever made, unregisters, and reloads any open page from the
 * network. Deploying it is how a broken worker is taken back.
 */
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const RETIRE = __RETIRE__;

const PREFIX = 'derelict-';
const CACHE = `${PREFIX}${BUILD}`;
const HASH = 'x-derelict-hash';

self.addEventListener('install', (event) => {
  if (RETIRE) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(fill());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && (RETIRE || k !== CACHE));
      await Promise.all(keys.map((k) => caches.delete(k)));
      if (!RETIRE) return;
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (RETIRE) return;
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The house (phase 9) is a page of its own and is not the ship's to cache:
  // it goes to the network untouched.
  if (url.pathname.startsWith('/house')) return;
  // Any other page load is the ship's one page, whatever its query (?trace).
  const key = request.mode === 'navigate' ? '/index.html' : url.pathname;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(key)) || fetch(request);
    })()
  );
});

async function fill() {
  const cache = await caches.open(CACHE);
  const older = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
  for (const { url, hash } of PRECACHE) {
    const have = await cache.match(url);
    if (have && have.headers.get(HASH) === hash) continue;
    let response = null;
    for (const name of older) {
      const old = await (await caches.open(name)).match(url);
      if (old && old.headers.get(HASH) === hash) {
        response = old;
        break;
      }
    }
    response ||= (await checked(url, hash, 'force-cache')) || (await checked(url, hash, 'reload'));
    // A file that will not match its hash fails the whole install, and the
    // build already in place carries on. Half a build is never served.
    if (!response) throw new Error(`${url} does not match the build it is listed in`);
    await cache.put(url, response);
  }
}

async function checked(url, hash, mode) {
  try {
    const res = await fetch(url, { cache: mode });
    if (!res.ok) return null;
    const body = await res.arrayBuffer();
    if ((await digest(body)) !== hash) return null;
    const headers = new Headers(res.headers);
    headers.set(HASH, hash);
    return new Response(body, { status: 200, statusText: 'OK', headers });
  } catch {
    return null;
  }
}

async function digest(body) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
