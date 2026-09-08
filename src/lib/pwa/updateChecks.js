// Proactive service-worker update checks (2026-09-08). With prompt
// semantics the browser only looks for a new sw.js on its own schedule, so
// a person who leaves a Suite tab open for hours and comes back is still on
// the old shell with no toast. Checking when the tab becomes visible again,
// when the connection returns and on a slow interval surfaces "A new version
// of the Suite is ready" before they click into a route whose chunk is gone.
// The check itself never swaps the build; the prompt still decides that.

export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Wire the checks for one registration. Returns an unsubscribe function.
 * @param {ServiceWorkerRegistration} registration
 * @param {Object} [p] { windowLike, documentLike, navigatorLike, intervalMs, timers: { setInterval, clearInterval } }
 */
export function installUpdateChecks(registration, p = {}) {
  if (!registration || typeof registration.update !== 'function') return () => {};
  const windowLike = p.windowLike || (typeof window !== 'undefined' ? window : null);
  const documentLike = p.documentLike || (typeof document !== 'undefined' ? document : null);
  const navigatorLike = p.navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
  const intervalMs = p.intervalMs || UPDATE_CHECK_INTERVAL_MS;
  const timers = p.timers || { setInterval, clearInterval };

  const check = () => {
    if (navigatorLike && navigatorLike.onLine === false) return false;
    try { Promise.resolve(registration.update()).catch(() => {}); } catch { /* a failed check is not an error worth surfacing */ }
    return true;
  };
  const onVisibility = () => {
    if (!documentLike || documentLike.visibilityState === 'visible') check();
  };

  const timer = timers.setInterval(check, intervalMs);
  if (documentLike && typeof documentLike.addEventListener === 'function') documentLike.addEventListener('visibilitychange', onVisibility);
  if (windowLike && typeof windowLike.addEventListener === 'function') windowLike.addEventListener('online', check);

  return () => {
    timers.clearInterval(timer);
    if (documentLike && typeof documentLike.removeEventListener === 'function') documentLike.removeEventListener('visibilitychange', onVisibility);
    if (windowLike && typeof windowLike.removeEventListener === 'function') windowLike.removeEventListener('online', check);
  };
}
