import { log } from './log.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch with bounded retry. Generation endpoints rate-limit and occasionally
 * 5xx under load, and a pipeline run is long enough that giving up on the
 * first hiccup would be miserable.
 */
export async function request(url, options = {}, { retries = 4, label = url } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = 2 ** attempt * 1000;
      log.note(`retry ${attempt}/${retries} in ${wait / 1000}s — ${label}`);
      await sleep(wait);
    }
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      lastError = new Error(`${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
      // Client errors other than rate limiting will not fix themselves.
      if (res.status !== 429 && res.status < 500) throw lastError;
    } catch (err) {
      lastError = err;
      if (err.message?.startsWith('4') && !err.message.startsWith('429')) throw err;
    }
  }
  throw new Error(`${label}: ${lastError?.message || 'request failed'}`);
}

export async function requestJson(url, options, meta) {
  const res = await request(url, options, meta);
  return res.json();
}

export async function requestBuffer(url, options, meta) {
  const res = await request(url, options, meta);
  return Buffer.from(await res.arrayBuffer());
}

export async function poll(fn, { intervalMs = 5000, timeoutMs = 15 * 60 * 1000, label = 'task' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let ticks = 0;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result.done) return result.value;
    if (++ticks % 4 === 0) log.note(`${label}: ${result.status || 'working'}…`);
    await sleep(intervalMs);
  }
  throw new Error(`${label}: timed out after ${Math.round(timeoutMs / 1000)}s`);
}

export { sleep };
