// Last-known entitlements per user (Wellsite Studio WS6, plan section 4
// "Offline boot"). The auth context and the entitlements hook write the
// snapshot after every successful fetch and fall back to it when the
// fetch fails for a transient reason (no network, timeout), marking it
// stale; a genuine empty result still locks out. The key is per user so
// a shared rig laptop never shows one person another's licence.

export const ENTITLEMENT_CACHE_PREFIX = 'pl_entitlements_v2:';
export const STALE_LIMIT_MS = 30 * 24 * 3600 * 1000;

const storage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function readSnapshot(userId, store = storage()) {
  if (!userId || !store) return null;
  try {
    const raw = store.getItem(ENTITLEMENT_CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.stamp)) return null;
    return parsed;
  } catch { return null; }
}

export function writeSnapshot(userId, data, store = storage(), now = Date.now()) {
  if (!userId || !store) return;
  try { store.setItem(ENTITLEMENT_CACHE_PREFIX + userId, JSON.stringify({ stamp: now, data })); } catch { /* storage full or blocked */ }
}

export function clearSnapshot(userId, store = storage()) {
  if (!userId || !store) return;
  try { store.removeItem(ENTITLEMENT_CACHE_PREFIX + userId); } catch { /* ignore */ }
}

/** Was the failure the network's fault rather than the server's answer? */
export function isTransientError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((err && (err.message || err.error_description || err.details)) || err || '');
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|ECONN|ENOTFOUND|aborted/i.test(msg)) return true;
  const status = err ? [err.status, err.statusCode, err.context && err.context.status].find((v) => Number.isFinite(v)) : undefined;
  if (status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600)) return true;
  return false;
}

/** Usable snapshot: present and within the ceiling. Returns {data, stampedAt, expired}. */
export function usableSnapshot(userId, now = Date.now()) {
  const snap = readSnapshot(userId);
  if (!snap) return null;
  return { data: snap.data, stampedAt: snap.stamp, expired: now - snap.stamp > STALE_LIMIT_MS };
}
