// Recovery from a stale shell after a deploy (2026-09-07). Production
// replaces every hashed chunk on each upload, and the service worker
// (prompt semantics, WS6) keeps the previous shell running until the user
// accepts the update. A lazy route opened from that old shell then asks
// for a chunk that no longer exists and Vite raises `vite:preloadError`
// ("Failed to fetch dynamically imported module"). This module turns that
// into one controlled repair: activate the waiting worker when there is
// one, then reload once. A guard stops it looping if the reload does not
// help. Pure helpers are exported for tests; `installPreloadRecovery`
// wires the listener.

export const RELOAD_GUARD_KEY = 'pwa.preloadReloadAt';
export const RELOAD_GUARD_MS = 60 * 1000;

/** Reload at most once per guard window (a second failure right after a reload means something else is wrong). */
export function shouldAttemptReload(storage, nowMs = Date.now(), guardMs = RELOAD_GUARD_MS) {
  try {
    const last = Number(storage?.getItem(RELOAD_GUARD_KEY));
    if (Number.isFinite(last) && last > 0 && nowMs - last < guardMs) return false;
    storage?.setItem(RELOAD_GUARD_KEY, String(nowMs));
    return true;
  } catch {
    return true;
  }
}

/** Is this the stale-chunk failure Vite reports (and not some other preload problem)? */
export function isStaleChunkError(err) {
  const msg = String((err && err.message) || err || '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch|Loading (CSS )?chunk/i.test(msg);
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

/** The repair: activate the waiting worker if any, then reload once. Returns what it did. */
export async function recoverFromStaleBuild({ windowLike, navigatorLike, storage, nowMs = Date.now() } = {}) {
  if (!shouldAttemptReload(storage, nowMs)) return { reloaded: false, reason: 'guard' };
  const activated = await activateWaitingWorker(navigatorLike);
  try { windowLike.location.reload(); } catch { return { reloaded: false, reason: 'no-location', activated }; }
  return { reloaded: true, activated };
}

/**
 * Wire the listener. Returns an unsubscribe function.
 * @param {Object} [p] { windowLike = window, navigatorLike = navigator, storage = sessionStorage }
 */
export function installPreloadRecovery(p = {}) {
  const windowLike = p.windowLike || (typeof window !== 'undefined' ? window : null);
  if (!windowLike || typeof windowLike.addEventListener !== 'function') return () => {};
  const navigatorLike = p.navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
  let storage = p.storage;
  if (storage === undefined) { try { storage = windowLike.sessionStorage; } catch { storage = null; } }
  const onError = (event) => {
    if (!isStaleChunkError(event && (event.payload || event.reason || event))) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault(); // Vite would rethrow otherwise
    recoverFromStaleBuild({ windowLike, navigatorLike, storage }).catch(() => {});
  };
  windowLike.addEventListener('vite:preloadError', onError);
  return () => windowLike.removeEventListener('vite:preloadError', onError);
}
