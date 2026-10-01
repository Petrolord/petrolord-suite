// Saved pp_projects rows as each release wrote them (AppUpgrade PL5). The
// harness opens one with `?saved=<key>`; jest opens every one. The well id
// HARNESS_WELL stands for the harness's seeded well.
//
// p3 (2026-07-14, P3/P4): params without mudlineMdM; source without wellId.
// pp0 (2026-09-06, PP0): mudline MD 0 on an offshore well (the old default),
//   source with the well id.
// t1 (2026-09-26, T1): two calibration points typed in MPa, Bowers unloading.
// u1 (2026-10-01, this upgrade): mudline MD set, NCT fitted on the well.

export const HARNESS_WELL = '__harness_well__';

const NCT = { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 };

export const SAVED_PROJECTS = Object.freeze({
  p3: {
    id: 'pp-saved-p3', name: 'Default project', schema_version: undefined,
    params: { waterDepthM: 100, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, nct: NCT, method: 'eaton', eatonN: 3, bowers: { A: 10, B: 0.75 }, nu: 0.4 },
    picks: [], calibration: [], source: { kind: 'well' },
  },
  pp0: {
    id: 'pp-saved-pp0', name: 'Default project',
    params: { waterDepthM: 100, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 0, nct: NCT, method: 'eaton', eatonN: 3, bowers: { A: 10, B: 0.75 }, nu: 0.4 },
    picks: [{ z: 500, dt: 520.7 }, { z: 1500, dt: 405.2 }], calibration: [], source: { kind: 'well', wellId: HARNESS_WELL },
  },
  t1: {
    id: 'pp-saved-t1', name: 'Default project',
    params: { waterDepthM: 100, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 130, nct: NCT, method: 'bowers', eatonN: 3, bowers: { A: 10, B: 0.75, U: 3, sigmaMaxPa: 30e6 }, nu: 0.4 },
    picks: [], calibration: [{ z: 3000, pMpa: 34.5 }, { z: 3600, pMpa: 45.2 }], source: { kind: 'well', wellId: HARNESS_WELL },
  },
  u1: {
    id: 'pp-saved-u1', name: 'Default project',
    params: { waterDepthM: 100, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 130, nct: NCT, method: 'eaton', eatonN: 3, bowers: { A: 10, B: 0.75 }, nu: 0.4 },
    picks: [{ z: 500, dt: 520.7 }], calibration: [{ z: 3500, pMpa: 40 }], source: { kind: 'well', wellId: HARNESS_WELL, nctFittedFor: HARNESS_WELL },
  },
});

/** A fixture with the placeholder well id bound to a real one. */
export function bindSaved(key, wellId) {
  const f = SAVED_PROJECTS[key];
  if (!f) return null;
  const sub = (v) => (v === HARNESS_WELL ? wellId : v);
  return { ...f, source: { ...f.source, wellId: sub(f.source.wellId), nctFittedFor: sub(f.source.nctFittedFor) } };
}
