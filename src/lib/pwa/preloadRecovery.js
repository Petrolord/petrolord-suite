// Recovery from a stale shell after a deploy (2026-09-07, widened 2026-09-08).
// Production replaces every hashed chunk on each upload, and the service
// worker (prompt semantics, WS6) keeps the previous shell running until the
// user accepts the update. A lazy route opened from that old shell then asks
// for a chunk that no longer exists and the browser reports "Failed to fetch
// dynamically imported module". This module turns that into a controlled
// repair instead of the red "Something went wrong" panel:
//
//   1. soft: activate the waiting worker when there is one, then reload once;
//   2. hard: if the very next attempt fails again (the reload served the same
//      cached shell), drop every service worker registration and cache, then
//      reload once more. This is what a manual "hard refresh" does;
//   3. give up: a third failure inside the guard window leaves the error
//      boundary to show a calm "reload" panel. Something else is wrong.
//
// Three entry points feed the same repair: Vite's `vite:preloadError` event
// (only raised for chunks that have dependency preloads), an unhandled
// rejection carrying the same message (dynamic imports outside React.lazy,
// and chunks Vite imports directly), and the ErrorBoundary, which receives
// what React.lazy rethrows. `ensureRecovery` deduplicates them. Pure helpers
// are exported for tests.

export const RELOAD_GUARD_KEY = 'pwa.preloadReloadAt';
export const HARD_RELOAD_GUARD_KEY = 'pwa.preloadHardReloadAt';
export const RELOAD_GUARD_MS = 60 * 1000;

/** Reload at most once per guard window per key (a second failure right after a reload means the reload did not help). */
export function shouldAttemptReload(storage, nowMs = Date.now(), guardMs = RELOAD_GUARD_MS, key = RELOAD_GUARD_KEY) {
  try {
    const last = Number(storage?.getItem(key));
    if (Number.isFinite(last) && last > 0 && nowMs - last < guardMs) return false;
    storage?.setItem(key, String(nowMs));
    return true;
  } catch {
    return true;
  }
}

/**
 * Is this the vanished-chunk failure browsers report (Chrome "Failed to fetch
 * dynamically imported module", Firefox "error loading dynamically imported
 * module", Safari "Importing a module script failed.")? Deliberately NOT a
 * bare "Failed to fetch": that is also what an ordinary network call says.
 */
export function isStaleChunkError(err) {
  const msg = String((err && err.message) || err || '');
  return /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk \S+ failed/i.test(msg);
}

/**
 * Ask a waiting service worker to take over, and resolve once it controls
 * the page (or after `timeoutMs`). Resolves false when there is no worker.
 */
export async function activateWaitingWorker(navigatorLike, { timeoutMs = 3000 } = {}) {
  const sw = navigatorLike && navigatorLike.serviceWorker;
  if (!sw || typeof sw.getRegistration !== 'function') return false;
  let reg = null;
  try { reg = await sw.getRegistration(); } catch { return false; }
  if (!reg) return false;
  try { await reg.update(); } catch { /* offline or a failed check: the reload below still helps when the server is reachable */ }
  const waiting = reg.waiting;
  if (!waiting) return false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const onChange = () => { sw.removeEventListener && sw.removeEventListener('controllerchange', onChange); finish(true); };
    sw.addEventListener && sw.addEventListener('controllerchange', onChange);
    try { waiting.postMessage({ type: 'SKIP_WAITING' }); } catch { finish(false); }
    setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * The hard-refresh equivalent: unregister every service worker and delete
 * every Cache Storage cache, so the next navigation fetches the live shell.
 * Never throws; reports what it managed to do.
 */
export async function dropWorkerAndCaches(navigatorLike, windowLike) {
  const out = { unregistered: 0, cachesDeleted: 0 };
  try {
    const sw = navigatorLike && navigatorLike.serviceWorker;
    if (sw && typeof sw.getRegistrations === 'function') {
      const regs = await sw.getRegistrations();
      for (const reg of regs || []) {
        try { if (await reg.unregister()) out.unregistered += 1; } catch { /* keep going */ }
      }
    }
  } catch { /* no service worker support */ }
  try {
    const cacheStorage = windowLike && windowLike.caches;
    if (cacheStorage && typeof cacheStorage.keys === 'function') {
      const keys = await cacheStorage.keys();
      for (const key of keys || []) {
        try { if (await cacheStorage.delete(key)) out.cachesDeleted += 1; } catch { /* keep going */ }
      }
    }
  } catch { /* no Cache Storage */ }
  return out;
}

function reloadPage(windowLike, result) {
  try { windowLike.location.reload(); } catch { return { ...result, reloaded: false, reason: 'no-location' }; }
  return result;
}

/**
 * The repair, escalating: soft reload first, hard reload when the soft one
 * did not help, then stop. Returns what it did.
 */
export async function recoverFromStaleBuild({ windowLike, navigatorLike, storage, nowMs = Date.now() } = {}) {
  if (shouldAttemptReload(storage, nowMs)) {
    const activated = await activateWaitingWorker(navigatorLike);
    return reloadPage(windowLike, { reloaded: true, mode: 'soft', activated });
  }
  if (shouldAttemptReload(storage, nowMs, RELOAD_GUARD_MS, HARD_RELOAD_GUARD_KEY)) {
    const dropped = await dropWorkerAndCaches(navigatorLike, windowLike);
    return reloadPage(windowLike, { reloaded: true, mode: 'hard', ...dropped });
  }
  return { reloaded: false, reason: 'guard' };
}

/** The user's own "Reload" after the automatic repair gave up: ignore the guards, hard-refresh. */
export async function hardReload({ windowLike, navigatorLike, storage } = defaultEnv()) {
  try { storage?.removeItem(RELOAD_GUARD_KEY); storage?.removeItem(HARD_RELOAD_GUARD_KEY); } catch { /* fine */ }
  const dropped = await dropWorkerAndCaches(navigatorLike, windowLike);
  return reloadPage(windowLike, { reloaded: true, mode: 'hard', ...dropped });
}

function defaultEnv() {
  const windowLike = typeof window !== 'undefined' ? window : null;
  const navigatorLike = typeof navigator !== 'undefined' ? navigator : null;
  let storage = null;
  try { storage = windowLike ? windowLike.sessionStorage : null; } catch { storage = null; }
  return { windowLike, navigatorLike, storage };
}

let inFlight = null;

/** True while a repair started by any entry point is still running (the ErrorBoundary uses this to stay calm). */
export function recoveryInFlight() { return inFlight !== null; }

/** Test hook. */
export function resetRecoveryState() { inFlight = null; }

/**
 * Start the repair unless one is already running; every caller gets the same
 * promise. A repair that did not reload (guard, no location) clears the flag
 * so the boundary can offer the manual reload.
 */
export function ensureRecovery(env) {
  if (inFlight) return inFlight;
  const p = recoverFromStaleBuild(env || defaultEnv())
    .catch(() => ({ reloaded: false, reason: 'error' }))
    .then((r) => { if (!r.reloaded) inFlight = null; return r; });
  inFlight = p;
  return p;
}

/**
 * Wire the listeners. Returns an unsubscribe function.
 * @param {Object} [p] { windowLike = window, navigatorLike = navigator, storage = sessionStorage }
 */
export function installPreloadRecovery(p = {}) {
  const windowLike = p.windowLike || (typeof window !== 'undefined' ? window : null);
  if (!windowLike || typeof windowLike.addEventListener !== 'function') return () => {};
  const navigatorLike = p.navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
  let storage = p.storage;
  if (storage === undefined) { try { storage = windowLike.sessionStorage; } catch { storage = null; } }
  const env = { windowLike, navigatorLike, storage };
  // Vite's event: start the repair early, but let Vite rethrow so React.lazy
  // hands the real error to the ErrorBoundary, which then shows the calm
  // "updating" panel instead of a red one.
  const onPreloadError = (event) => {
    if (!isStaleChunkError(event && (event.payload || event.reason || event))) return;
    ensureRecovery(env).catch(() => {});
  };
  // Dynamic imports outside React.lazy (an export button loading xlsx, say)
  // reject with nothing to catch them; the same repair applies.
  const onRejection = (event) => {
    if (!isStaleChunkError(event && event.reason)) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    ensureRecovery(env).catch(() => {});
  };
  windowLike.addEventListener('vite:preloadError', onPreloadError);
  windowLike.addEventListener('unhandledrejection', onRejection);
  return () => {
    windowLike.removeEventListener('vite:preloadError', onPreloadError);
    windowLike.removeEventListener('unhandledrejection', onRejection);
  };
}
