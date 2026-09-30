// Per-app adoption of the Suite unit profile.
//
// An app declares the unit choices it shows, each tied to a registry
// family and the app's own list of units:
//
//   const u = useAppUnits('pp', {
//     depth: { family: 'depth', allowed: ['m', 'ft'] },
//     pressure: { family: 'pressure', allowed: ['MPa', 'psi', 'ppg', 'sg'] },
//   }, { fallback: { depth: 'ft', pressure: 'MPa' }, legacyKeys: ['pp.units'] });
//
// Rules (owner brief, 2026-09-30):
//  - the initial unit comes from the profile;
//  - the in-app toggle stays, as a this-session view override kept in
//    sessionStorage; choosing the profile's unit again drops the override;
//  - an older per-app remembered choice in localStorage (legacyKeys) no
//    longer silently beats the profile: it is removed once, on first use
//    with a provider mounted;
//  - `differs` lists the choices where the view differs from the profile,
//    so the UI can say so and offer a reset.
// Without a provider (unit tests, isolated harnesses) the app's own
// `fallback` stands in for the profile and legacy keys are left alone.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUnitProfile } from './UnitProfileContext';
import { appUnitFor } from './vocabulary';

export const VIEW_PREFIX = 'petrolord.units.view.v1:';
export const MIGRATED_PREFIX = 'petrolord.units.migrated.v1:';

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const sess = () => safe(() => window.sessionStorage);
const loc = () => safe(() => window.localStorage);

export function readViewOverrides(app) {
  return safe(() => JSON.parse(sess()?.getItem(VIEW_PREFIX + app) || '{}'), {}) || {};
}
function writeViewOverrides(app, o) {
  safe(() => {
    if (Object.keys(o).length) sess()?.setItem(VIEW_PREFIX + app, JSON.stringify(o));
    else sess()?.removeItem(VIEW_PREFIX + app);
  });
}

/**
 * Remove an app's older remembered unit choices once, so they stop
 * beating the profile. Returns the keys that were removed.
 */
export function migrateLegacyKeys(app, keys = []) {
  const store = loc();
  if (!store || !keys.length) return [];
  if (safe(() => store.getItem(MIGRATED_PREFIX + app))) return [];
  const removed = [];
  for (const k of keys) {
    if (safe(() => store.getItem(k)) !== null) { safe(() => store.removeItem(k)); removed.push(k); }
  }
  safe(() => store.setItem(MIGRATED_PREFIX + app, new Date().toISOString()));
  return removed;
}

/** Pure: the profile's units expressed in the app's own words. */
export function profileUnitsFor(spec, profileUnits) {
  const units = {}; const exact = {};
  for (const [key, s] of Object.entries(spec)) {
    const r = appUnitFor(s.family, profileUnits?.[s.family], s.allowed);
    units[key] = r.unit; exact[key] = r.exact;
  }
  return { units, exact };
}

export function useAppUnits(app, spec, { fallback = {}, legacyKeys = [] } = {}) {
  const profile = useUnitProfile();
  const available = profile.available;
  const specKey = JSON.stringify(spec);

  const fromProfile = useMemo(() => {
    if (!available) {
      const exact = {};
      for (const k of Object.keys(spec)) exact[k] = true;
      return { units: { ...fallback }, exact };
    }
    return profileUnitsFor(spec, profile.units);
  }, [available, profile.units, specKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [overrides, setOverrides] = useState(() => readViewOverrides(app));

  useEffect(() => {
    if (available) migrateLegacyKeys(app, legacyKeys);
  }, [available, app]); // eslint-disable-line react-hooks/exhaustive-deps

  const units = useMemo(() => {
    const out = {};
    for (const [key, s] of Object.entries(spec)) {
      const o = overrides[key];
      out[key] = o !== undefined && (!s.allowed || s.allowed.includes(o)) ? o : fromProfile.units[key];
    }
    return out;
  }, [overrides, fromProfile, specKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setUnit = useCallback((key, value) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === fromProfile.units[key]) delete next[key]; else next[key] = value;
      writeViewOverrides(app, next);
      return next;
    });
  }, [app, fromProfile]);

  const resetToProfile = useCallback(() => {
    setOverrides({});
    writeViewOverrides(app, {});
  }, [app]);

  const differs = useMemo(
    () => Object.keys(spec).filter((k) => units[k] !== fromProfile.units[k]),
    [units, fromProfile, specKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sources = useMemo(() => {
    const out = {};
    for (const [key, s] of Object.entries(spec)) out[key] = available ? profile.sourceText(s.family) : 'this app';
    return out;
  }, [available, profile, specKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    units,
    setUnit,
    profileUnits: fromProfile.units,
    exact: fromProfile.exact,
    differs,
    resetToProfile,
    sources,
    available,
    ready: profile.ready,
  };
}
