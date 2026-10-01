// Registry curve preparation for the geomechanics workstation: mnemonic
// mapping + SI conversion (reusing the PP Studio prep helpers, the single
// source) and the pp-1.0.0 published-curve pickers. This file may use
// aliases; gmRun stays pure.

import { mapLogs, slownessToUsPerM, densityToKgM3 } from '../../PorePressureStudio/services/prep';
import { PIPELINE_MAJOR } from '../../PorePressureStudio/services/publish';
import { ppfgUnit, unreadableUnitReason } from '../../../../lib/ppfgUnits';

export { mapLogs, slownessToUsPerM, densityToKgM3 };

export const PP_PIPELINE = 'pp-1.0.0';

// Latest Pore Pressure Studio curve per mnemonic (rows arrive created_at
// ascending). PP-U1-006: any pp-1.x pipeline (pp-1.1.0 writes the same
// MPa curves on their own MD grid), not only pp-1.0.0.
export function pickPublishedPpfg(logs) {
  const out = {};
  for (const log of logs || []) {
    if (!PIPELINE_MAJOR.test(String(log.provenance?.pipeline_version || ''))) continue;
    const m = (log.mnemonic || '').toUpperCase();
    if (['PP', 'FP', 'OBG'].includes(m)) out[m] = log;
  }
  return out;
}

export function logGrid(log) {
  const out = new Array(log.n_samples);
  for (let i = 0; i < log.n_samples; i += 1) out[i] = log.start_md_m + i * log.step_m;
  return out;
}

// Published PP/OBG curves (MPA) → the base-profile arrays gmRun expects.
export function publishedToBase({ ppLog, obgLog, ppData, obgData }) {
  if (!ppLog || !obgLog) return null;
  const tvdM = logGrid(ppLog);
  const grid2 = logGrid(obgLog);
  if (tvdM.length !== grid2.length || Math.abs(tvdM[0] - grid2[0]) > 1e-6) {
    throw new Error('Published PP and OBG curves are on different grids; republish from Pore Pressure Studio.');
  }
  // PP-U1-006: by the declared unit (a pressure), never an assumed MPa
  const toPaFor = (log) => {
    const conv = ppfgUnit(log.unit);
    if (!conv) throw new Error(unreadableUnitReason(log));
    if (conv.needsTvd) throw new Error(`${log.mnemonic} is a ${conv.kind === 'emw' ? 'mud weight' : 'gradient'} (${log.unit}); publish it as a pressure from Pore Pressure Studio.`);
    return (v) => (Number.isFinite(v) ? conv.toMpa(v) * 1e6 : null);
  };
  return {
    tvdM,
    ppPa: Array.from(ppData, toPaFor(ppLog)),
    obgPa: Array.from(obgData, toPaFor(obgLog)),
  };
}

/**
 * PP-U1-007: a curve on its own depth vector sampled at the published
 * grid's depths (linear between neighbours, null outside or across a
 * gap), so the UCS correlation's DT lines up with the published PP/OBG.
 */
export function alignToGrid(srcDepth, values, targetDepth) {
  const n = srcDepth?.length || 0;
  return targetDepth.map((z) => {
    if (!n || !(z >= srcDepth[0]) || !(z <= srcDepth[n - 1])) return null;
    let lo = 0; let hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (srcDepth[mid] <= z) lo = mid; else hi = mid; }
    const a = values[lo]; const b = values[hi];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) && srcDepth[lo] === z ? a : null;
    const span = srcDepth[hi] - srcDepth[lo];
    return span > 0 ? a + ((z - srcDepth[lo]) / span) * (b - a) : a;
  });
}

// Raw DEPT/DT/RHOB curves → the logs shape gmRun expects (SI).
export function curvesToLogs({ deptData, dtLog, dtData, rhobLog, rhobData }) {
  const depthM = Array.from(deptData);
  const dtUsPerM = Array.from(dtData, (v) => (Number.isFinite(v) ? slownessToUsPerM(v, dtLog?.unit) : null));
  const rhoKgM3 = rhobData
    ? Array.from(rhobData, (v) => (Number.isFinite(v) ? densityToKgM3(v, rhobLog?.unit) : null))
    : null;
  return { depthM, dtUsPerM, rhoKgM3 };
}
