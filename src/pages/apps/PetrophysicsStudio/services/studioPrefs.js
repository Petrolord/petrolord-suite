// Per-user Studio preferences (Petrophysics Studio PT11b, 2026-09-10):
// one JSON blob per user id in localStorage, the useReservoirSettings
// pattern, wrapped in try/catch for private mode. Per user ON THIS
// BROWSER; a cross-device store would be a petro_user_prefs table (owner
// decision, recorded in the PT11 plan). The first key is the Split view
// divider; later display preferences share the file.

import { useCallback, useEffect, useState } from 'react';

export const PREFS_VERSION = 1;
export const DEFAULT_PREFS = Object.freeze({ splitPercent: 60 });
export const SPLIT_DEFAULT = 60;
export const SPLIT_MIN_PERCENT = 25;

export const prefsKey = (userId) => `petrophysicsstudio.prefs.${userId || 'anon'}.v${PREFS_VERSION}`;

const storageOf = (storage) => {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
};

/** The stored preferences for this user, defaults filled in; a corrupt blob is the defaults. */
export function readPrefs(userId, storage = null) {
  const st = storageOf(storage);
  if (!st) return { ...DEFAULT_PREFS };
  try {
    const raw = st.getItem(prefsKey(userId));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_PREFS };
    const out = { ...DEFAULT_PREFS, ...parsed };
    if (!Number.isFinite(out.splitPercent) || out.splitPercent < SPLIT_MIN_PERCENT || out.splitPercent > 100 - SPLIT_MIN_PERCENT) out.splitPercent = SPLIT_DEFAULT;
    return out;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Merge a patch into this user's preferences; returns the new object. */
export function writePrefs(userId, patch, storage = null) {
  const next = { ...readPrefs(userId, storage), ...patch };
  const st = storageOf(storage);
  if (st) {
    try { st.setItem(prefsKey(userId), JSON.stringify(next)); } catch { /* private mode */ }
  }
  return next;
}

/** React hook: prefs for the signed-in user (backend.whoAmI), with a setter that persists. */
export function useStudioPrefs(backend) {
  const [userId, setUserId] = useState(null);
  const [prefs, setPrefs] = useState(() => readPrefs(null));
  useEffect(() => {
    let alive = true;
    (async () => {
      let id = null;
      try { id = backend?.whoAmI ? await backend.whoAmI() : null; } catch { id = null; }
      if (!alive) return;
      setUserId(id);
      setPrefs(readPrefs(id));
    })();
    return () => { alive = false; };
  }, [backend]);
  const setPref = useCallback((patch) => {
    setPrefs(writePrefs(userId, patch));
  }, [userId]);
  return [prefs, setPref];
}
