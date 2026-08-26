// Pure T&D run orchestration: assemble engine inputs from a saved case +
// geometry + trajectory, and unit helpers for display. NO '@/' aliases here
// (e2e imports this file directly from the test process, the WDS precedent).
//
// Storage (jsonb, SI metres — the wp_* convention):
//   case.string      [{type, label, lengthM, weightKgM, odM, idM,
//                      tooljointOdM?, grade?, yieldPa?}] bottom-up
//   case.mud         {densityKgM3}
//   case.friction    {cased, open, overrides: [{fromMd, toMd, frictionFactor}]}
//   case.operations  {wobN, bitTorqueNm, tripSpeedMs, rpm, ops: [..],
//                     wear: {schedule: [{rpm, hours}], wearFactorMm3PerKNm,
//                            casingIndex}}
//   geometry.hole_sections [{from_md_m, to_md_m, hole_id_m, cased,
//                      casing_od_m, casing_id_m, casing_weight_kgm, grade,
//                      description}]

import { computeTorqueDrag, OPERATIONS } from '../engine/torqueDrag';
import { computeCasingWear } from '../engine/casingWear';

export const TD_ENGINE_VERSION = 'torqueDrag-1.0.0';

const KLBF = 4448.2216153;
const KFTLBF = 1355.8179483;
const FT = 0.3048;

// Display-unit helpers keyed by the wellbore depth_unit ('m' | 'ft').
export function forceLabel(depthUnit) { return depthUnit === 'ft' ? 'klbf' : 'kN'; }
export function torqueLabel(depthUnit) { return depthUnit === 'ft' ? 'kft-lbf' : 'kN-m'; }
export function depthLabel(depthUnit) { return depthUnit === 'ft' ? 'ft' : 'm'; }
export function forceOut(n, depthUnit) { return depthUnit === 'ft' ? n / KLBF : n / 1e3; }
export function torqueOut(nm, depthUnit) { return depthUnit === 'ft' ? nm / KFTLBF : nm / 1e3; }
export function depthOut(m, depthUnit) { return depthUnit === 'ft' ? m / FT : m; }
export function depthIn(v, depthUnit) { return depthUnit === 'ft' ? v * FT : v; }

// Engine geometry sections from stored hole sections + the friction config.
export function buildEngineGeometry(holeSections, friction = {}) {
  const cased = Number.isFinite(friction.cased) ? friction.cased : 0.25;
  const open = Number.isFinite(friction.open) ? friction.open : 0.35;
  const overrides = Array.isArray(friction.overrides) ? friction.overrides : [];
  return (holeSections || []).map((h) => {
    const mid = (h.from_md_m + h.to_md_m) / 2;
    const ov = overrides.find((o) => mid >= o.fromMd && mid <= o.toMd);
    return {
      fromMd: h.from_md_m,
      toMd: h.to_md_m,
      holeIdM: h.cased ? h.casing_id_m : h.hole_id_m,
      cased: !!h.cased,
      frictionFactor: ov ? ov.frictionFactor : (h.cased ? cased : open),
    };
  });
}

export function totalStringLengthM(string) {
  return (string || []).reduce((a, c) => a + (c.lengthM || 0), 0);
}

// Run every requested operation for a case. Returns {operation -> result}.
export function runCase({ stations, caseRow, geometryRow, stepM = 5 }) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('No trajectory: the wellbore needs a definitive design with saved stations.');
  }
  const string = caseRow.string || [];
  if (!string.length) throw new Error('The drillstring is empty.');
  const geometry = buildEngineGeometry(geometryRow?.hole_sections, caseRow.friction);
  if (!geometry.length) throw new Error('No hole sections defined for this wellbore.');
  const opsCfg = caseRow.operations || {};
  const ops = (opsCfg.ops && opsCfg.ops.length ? opsCfg.ops : ['trip_out', 'trip_in', 'rotate_on_bottom'])
    .filter((o) => OPERATIONS.includes(o));
  const params = {
    wobN: opsCfg.wobN ?? 0,
    bitTorqueNm: opsCfg.bitTorqueNm ?? 0,
    tripSpeedMs: opsCfg.tripSpeedMs ?? 0.3,
    rpm: opsCfg.rpm ?? 120,
    stepM,
  };
  const results = {};
  for (const op of ops) {
    results[op] = computeTorqueDrag({
      stations,
      string,
      geometry,
      mud: caseRow.mud || { densityKgM3: 1000 },
      operation: op,
      params,
    });
  }
  return { results, params, ops };
}

// Casing wear for the configured cased section, driven by a rotating-mode
// profile from runCase. Returns null when prerequisites are missing.
export function runWear({ results, caseRow, geometryRow }) {
  const wear = caseRow.operations?.wear;
  if (!wear || !Array.isArray(wear.schedule) || !wear.schedule.length) return null;
  const rotating = results.rotate_on_bottom || results.rotate_off_bottom || results.backream;
  if (!rotating) return null;
  const sections = geometryRow?.hole_sections || [];
  const casedSections = sections.filter((s) => s.cased && s.casing_id_m > 0);
  if (!casedSections.length) return null;
  const idx = Number.isFinite(wear.casingIndex) ? wear.casingIndex : 0;
  const target = casedSections[Math.min(idx, casedSections.length - 1)];
  const wallM = target.casing_od_m && target.casing_id_m
    ? (target.casing_od_m - target.casing_id_m) / 2
    : null;
  if (!wallM || wallM <= 0) return null;
  // The tool joints rubbing the casing belong to the pipe rotating inside it
  // (dp/hwdp) — BHA components live below the shoe. Fall back to the whole
  // string only when no pipe component exists.
  const pipe = (caseRow.string || []).filter((c) => c.type === 'dp' || c.type === 'hwdp');
  const pool = pipe.length ? pipe : (caseRow.string || []);
  const tjOds = pool.map((c) => c.tooljointOdM || c.odM).filter(Boolean);
  if (!tjOds.length) return null;
  const tjRadiusM = Math.max(...tjOds) / 2;
  if (tjRadiusM >= target.casing_id_m / 2) return null;
  return computeCasingWear({
    tdProfile: rotating.profile,
    casing: {
      idM: target.casing_id_m,
      wallM,
      fromMd: target.from_md_m,
      toMd: target.to_md_m,
      burstRatingPa: wear.burstRatingPa ?? null,
    },
    tjRadiusM,
    schedule: wear.schedule,
    wearFactorMm3PerKNm: wear.wearFactorMm3PerKNm ?? 1,
    intervalM: wear.intervalM ?? 30,
  });
}

// Friction-factor sensitivity sweep on one operation.
export function runSensitivity({ stations, caseRow, geometryRow, operation, casedValues, openValues, stepM = 10 }) {
  const rows = [];
  for (const c of casedValues) {
    for (const o of openValues) {
      const friction = { ...(caseRow.friction || {}), cased: c, open: o };
      const geometry = buildEngineGeometry(geometryRow?.hole_sections, friction);
      const res = computeTorqueDrag({
        stations,
        string: caseRow.string,
        geometry,
        mud: caseRow.mud || { densityKgM3: 1000 },
        operation,
        params: {
          wobN: caseRow.operations?.wobN ?? 0,
          bitTorqueNm: caseRow.operations?.bitTorqueNm ?? 0,
          tripSpeedMs: caseRow.operations?.tripSpeedMs ?? 0.3,
          rpm: caseRow.operations?.rpm ?? 120,
          stepM,
        },
      });
      rows.push({
        cased: c,
        open: o,
        hookloadN: res.summary.hookloadN,
        surfaceTorqueNm: res.summary.surfaceTorqueNm,
      });
    }
  }
  return rows;
}
