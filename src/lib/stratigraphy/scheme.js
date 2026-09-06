// Terminology display option (Stratigraphy Studio ST0, 2026-09-06).
//
// Owner decision 2026-09-06: Catuneanu is what gets stored; Exxon
// terminology is a display option. The option is a per-browser preference
// (localStorage `strat.scheme`), read by every painter and legend that
// shows a surface type, so a top typed MFS reads "Maximum flooding surface
// (MFS)" under Exxon and "Maximum flooding surface" under Catuneanu on
// every app at once. Nothing here touches stored codes.

import { useCallback, useEffect, useState } from 'react';
import { SCHEMES, DEFAULT_SCHEME, assertScheme } from './vocabulary';

export const SCHEME_KEY = 'strat.scheme';
const EVENT = 'strat-scheme-change';

export function getScheme() {
  try {
    const v = window.localStorage.getItem(SCHEME_KEY);
    return SCHEMES.includes(v) ? v : DEFAULT_SCHEME;
  } catch (e) {
    return DEFAULT_SCHEME;
  }
}

export function setScheme(scheme) {
  assertScheme(scheme);
  try { window.localStorage.setItem(SCHEME_KEY, scheme); } catch (e) { /* private mode: in-memory only */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: scheme })); } catch (e) { /* no window */ }
}

/** [scheme, setScheme]: follows changes made anywhere in the page and in other tabs. */
export function useScheme() {
  const [scheme, set] = useState(getScheme);
  useEffect(() => {
    const onLocal = (e) => set(e.detail);
    const onStorage = (e) => { if (e.key === SCHEME_KEY) set(getScheme()); };
    window.addEventListener(EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, onLocal); window.removeEventListener('storage', onStorage); };
  }, []);
  const update = useCallback((next) => { setScheme(next); set(next); }, []);
  return [scheme, update];
}
