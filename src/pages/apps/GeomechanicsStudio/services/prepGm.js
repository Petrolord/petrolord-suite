// Registry curve preparation for the geomechanics workstation: mnemonic
// mapping + SI conversion (reusing the PP Studio prep helpers, the single
// source) and the pp-1.0.0 published-curve pickers. This file may use
// aliases; gmRun stays pure.

import { mapLogs, slownessToUsPerM, densityToKgM3 } from '../../PorePressureStudio/services/prep';

export { mapLogs, slownessToUsPerM, densityToKgM3 };

export const PP_PIPELINE = 'pp-1.0.0';

// Latest pp-1.0.0 curve per mnemonic (rows arrive created_at ascending).
export function pickPublishedPpfg(logs) {
  const out = {};
  for (const log of logs || []) {
    if (log.provenance?.pipeline_version !== PP_PIPELINE) continue;
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
  const toPa = (v) => (Number.isFinite(v) ? v * 1e6 : null);
  return {
    tvdM,
    ppPa: Array.from(ppData, toPa),
    obgPa: Array.from(obgData, toPa),
  };
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
