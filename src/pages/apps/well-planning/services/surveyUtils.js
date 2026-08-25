// Actual-survey logic for Well Design Studio (WD3): azimuth-reference
// conversion, the definitive composite rule, plan-vs-actual deltas and
// the project-ahead solve. Pure functions over the drilling engine —
// everything here works in METRES with GRID azimuths (the registry
// convention); the UI converts at the boundary.

import {
  computeWellPath, computeSurveyTable, stationAtMd, toGridAzimuths,
  wrapDeltaDeg,
} from '../engine/surveyMath';
import { solveContinuousBuild } from '../engine/profileDesign';

/**
 * Degrees to ADD to an azimuth expressed in `reference` to obtain a
 * grid azimuth, per the validated engine convention (toGridAzimuths):
 * grid 0, true +convergence, magnetic +declination +convergence.
 * Throws when the wellbore is missing the needed cached angles.
 */
export function gridAzimuthDelta(reference, wellbore) {
  const ref = reference || wellbore?.azimuth_reference || 'grid';
  const conv = wellbore?.grid_convergence_deg;
  const dec = wellbore?.mag_declination_deg;
  const probe = toGridAzimuths([{ azi: 0 }], {
    azimuthRef: ref,
    convergenceDeg: ref === 'grid' ? 0 : Number(conv),
    declinationDeg: ref === 'magnetic' ? Number(dec) : 0,
  });
  return probe[0].azi > 180 ? probe[0].azi - 360 : probe[0].azi;
}

/** Raw survey stations (md metres, azi in the run's reference) to grid
 *  azimuths using the wellbore's cached convergence/declination. */
export function toGridSurvey(stations, reference, wellbore) {
  const ref = reference || 'grid';
  return toGridAzimuths(stations, {
    azimuthRef: ref,
    convergenceDeg: ref === 'grid' ? 0 : Number(wellbore?.grid_convergence_deg),
    declinationDeg: ref === 'magnetic' ? Number(wellbore?.mag_declination_deg) : 0,
  });
}

/**
 * Definitive composite survey from the runs flagged is_in_definitive
 * (industry rule: the deeper run wins from its tie-on down). Runs are
 * ordered by their first-station MD; each successive run truncates the
 * shallower composite at its own tie-on. Stations must already be in
 * metres/grid ({md, inc, azi}).
 *
 * @param {Array<{stations: Array}>} runs
 * @returns {Array<{md, inc, azi}>}
 */
export function compositeStations(runs) {
  const usable = (runs || [])
    .filter((r) => Array.isArray(r.stations) && r.stations.length >= 2)
    .slice()
    .sort((a, b) => a.stations[0].md - b.stations[0].md);
  let out = [];
  for (const run of usable) {
    const tieMd = run.stations[0].md;
    out = out.filter((s) => s.md < tieMd - 1e-9);
    out = out.concat(run.stations.map((s) => ({ md: s.md, inc: s.inc, azi: s.azi })));
  }
  return out;
}

/** Survey listing for a set of grid-metre stations, wellhead-relative
 *  (surface at 0,0), in metres. */
export function computeActualTable(stations, { kbM = 0, vsAzimuthDeg = null } = {}) {
  if (!Array.isArray(stations) || stations.length < 2) return null;
  return computeSurveyTable(stations, {
    surfaceX: 0, surfaceY: 0, kb: kbM, mdUnit: 'm', vsAzimuthDeg,
  });
}

/**
 * Plan-vs-actual delta rows: the plan interpolated (exact arc slerp)
 * at every actual station MD inside the plan's MD range. Both inputs
 * are metres/grid stations from the same wellhead. Returns rows:
 * {md, actual: {inc, azi, tvd, n, e}, plan: {...}, dInc, dAzi, dTvd,
 *  dN, dE, sep2d, sep3d}
 */
export function planVsActual(planStations, actualStations) {
  if (!Array.isArray(planStations) || planStations.length < 2) return [];
  if (!Array.isArray(actualStations) || actualStations.length < 2) return [];
  const planPath = computeWellPath(planStations, { surfaceX: 0, surfaceY: 0, kb: 0 });
  const actPath = computeWellPath(actualStations, { surfaceX: 0, surfaceY: 0, kb: 0 });
  const rows = [];
  for (let i = 0; i < actualStations.length; i++) {
    const a = actualStations[i];
    const ap = actPath[i];
    const plan = stationAtMd(planStations, planPath, a.md);
    if (!plan) continue;
    const dN = ap.y - plan.y;
    const dE = ap.x - plan.x;
    const dTvd = ap.tvd - plan.tvd;
    rows.push({
      md: a.md,
      actual: { inc: a.inc, azi: a.azi, tvd: ap.tvd, n: ap.y, e: ap.x },
      plan: { inc: plan.inc, azi: plan.azi, tvd: plan.tvd, n: plan.y, e: plan.x },
      dInc: a.inc - plan.inc,
      dAzi: wrapDeltaDeg(plan.azi, a.azi),
      dTvd,
      dN,
      dE,
      sep2d: Math.hypot(dN, dE),
      sep3d: Math.hypot(dN, dE, dTvd),
    });
  }
  return rows;
}

/**
 * Project-ahead: one continuous-build arc (exact, WD2 solver) from the
 * last actual station to a target. All values in the caller's depth
 * unit, wellhead-relative ({n, e, tvd below KB}); attitude in grid
 * azimuths. Returns the profileDesign result plus the landing point.
 */
export function projectAhead({ from, target, mdUnit = 'm', maxDls = null }) {
  if (!from || !target) return { feasible: false, error: 'Needs a survey station and a target.' };
  const sol = solveContinuousBuild({
    tieOn: { inc: from.inc, azi: from.azi },
    delta: {
      dN: target.n - from.n,
      dE: target.e - from.e,
      dTvd: target.tvd - from.tvd,
    },
    mdUnit,
    maxDls,
  });
  if (!sol.feasible) return sol;
  return {
    ...sol,
    landing: {
      md: from.md + sol.report.endMdDelta,
      n: target.n,
      e: target.e,
      tvd: target.tvd,
    },
  };
}

/** Parse pasted "md inc azi" rows (whitespace or comma separated).
 *  Enforces the wellImport domain rules loudly. */
export function parseManualStations(text) {
  const out = [];
  const lines = String(text || '').split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length && !l.startsWith('#'));
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/[\s,;]+/).map(Number);
    if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) {
      throw new Error(`Line ${i + 1}: expected "MD  inclination  azimuth".`);
    }
    const [md, inc, azi] = parts;
    if (inc < 0 || inc > 180) throw new Error(`Line ${i + 1}: inclination ${inc}° is outside 0–180°.`);
    if (out.length && !(md > out[out.length - 1].md)) {
      throw new Error(`Line ${i + 1}: MD ${md} does not increase.`);
    }
    out.push({ md, inc, azi });
  }
  if (out.length < 2) throw new Error('A survey needs at least 2 stations.');
  return out;
}
