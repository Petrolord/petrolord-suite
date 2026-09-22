// Build-stamp check behind the "new version" prompt (Seismolord tester
// note, 2026-09-22). Testers saw "A new version of the Suite is ready" come
// back after every refresh. With prompt semantics a new service worker
// waits; a plain refresh does not activate it (the reloading page overlaps
// the old one, and other Suite tabs hold it too), so the old worker serves
// the old shell again and workbox reports the same waiting worker on every
// load. The prompt was also shown on the worker's word alone, without
// asking whether the server really has a different build.
//
// So the prompt now asks the server. The build writes /version.json with
// the same stamp the running bundle carries (__PLATFORM_BUILD__); it is
// fetched with no-store, outside the service worker's caches, and:
//   - server build == running build: nothing to say; a waiting worker for
//     the same build is activated quietly;
//   - a waiting worker already present when the page loads: the person has
//     just opened or refreshed the page, so there is no work to lose; it is
//     activated and the page reloads once onto the new build (guarded per
//     build, so it can never loop);
//   - a new build found while the page is in use: the prompt, as before.
//     "Later" is remembered for that build in this tab.
// After an update lands, caches the current configuration does not own
// are deleted.

export const VERSION_URL = '/version.json';
const AUTO_KEY = 'pwa.autoActivated';
const LATER_KEY = 'pwa.laterFor';

/** Comparable identity of a build stamp: the sha, else the build time. */
export function buildKey(stamp) {
  if (!stamp || typeof stamp !== 'object') return null;
  if (typeof stamp.sha === 'string' && stamp.sha && stamp.sha !== 'unknown') return `sha:${stamp.sha}`;
  if (typeof stamp.builtAt === 'string' && stamp.builtAt) return `at:${stamp.builtAt}`;
  return null;
}

/** The server's build stamp, bypassing every cache, or null. */
export async function fetchServerBuild({ fetchImpl = typeof fetch !== 'undefined' ? fetch : null, now = Date.now } = {}) {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(`${VERSION_URL}?t=${now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    });
    if (!res || !res.ok) return null;
    const body = await res.json();
    return buildKey(body) ? body : null;
  } catch {
    return null;
  }
}

const readStore = (storage, key) => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
const writeStore = (storage, key, v) => { try { if (storage) storage.setItem(key, v); } catch { /* private mode */ } };

/**
 * What to do about a waiting service worker.
 * @param {Object} p
 * @param {Object} p.running  the running bundle's stamp (PLATFORM_BUILD)
 * @param {?Object} p.server  the server's stamp (fetchServerBuild), null if unknown
 * @param {boolean} p.atLoad  the waiting worker was already there when the page loaded
 * @param {Storage} [p.storage] sessionStorage
 * @returns {'none'|'activate-quietly'|'activate-and-reload'|'prompt'}
 */
export function decideUpdate({ running, server, atLoad, storage }) {
  const runKey = buildKey(running);
  const srvKey = buildKey(server);
  // The server cannot be asked (offline, dev, missing file): keep the old
  // behaviour and let the person decide.
  if (!srvKey || !runKey) return atLoad ? 'none' : 'prompt';
  if (srvKey === runKey) return 'activate-quietly';
  if (atLoad) {
    // Once per server build per tab: if the reload did not land on the new
    // build (another tab still holds the old worker) fall back to the prompt.
    if (readStore(storage, AUTO_KEY) === srvKey) return 'prompt';
    return 'activate-and-reload';
  }
  if (readStore(storage, LATER_KEY) === srvKey) return 'none';
  return 'prompt';
}

export function rememberAutoActivation(server, storage) {
  const k = buildKey(server);
  if (k) writeStore(storage, AUTO_KEY, k);
}

export function rememberLater(server, storage) {
  const k = buildKey(server);
  if (k) writeStore(storage, LATER_KEY, k);
}

/** Cache names this configuration owns (vite.config.js workbox). */
export const OWNED_CACHE_PATTERNS = [/^workbox-precache-v2-/, /^suite-assets$/, /^suite-fonts$/];

/**
 * Delete caches no current configuration owns (left by older service
 * worker set-ups), once the running build is the server's build.
 * @returns {Promise<string[]>} deleted names
 */
export async function clearStaleCaches({ cachesLike = typeof caches !== 'undefined' ? caches : null } = {}) {
  if (!cachesLike || typeof cachesLike.keys !== 'function') return [];
  try {
    const names = await cachesLike.keys();
    const stale = names.filter((n) => !OWNED_CACHE_PATTERNS.some((re) => re.test(n)));
    await Promise.all(stale.map((n) => cachesLike.delete(n)));
    return stale;
  } catch {
    return [];
  }
}
