// PPFG mud-window integration (WD5): read the pore-pressure prognosis
// that Pore Pressure Studio publishes into geo_wells_logs (PP / FP /
// OBG curves in MPa vs registry MD, pipeline pp-1.x) and hang it on
// the design trajectory as a TVD-referenced mud window for the section
// view. Pure math here is jest-tested; the loader is a thin registry
// adapter.
//
// PP-U1-005 (2026-10-01): curves are read by their declared unit through
// src/lib/ppfgUnits.js. Before, only a unit spelled MPA was read and any
// other PP/FP/OBG curve (a Drillworks LAS in ppg, a table in psi or kPa)
// was dropped with nothing said; a mud weight or gradient now converts at
// the trajectory's TVD below the rotary table, and a curve that is not a
// pressure is named with its reason.

import { listLogs, downloadCurve } from '@/lib/wellsRegistry';
import { ppfgUnit, unreadableUnitReason, KG_M3_PER_PPG } from '@/lib/ppfgUnits';
import { computeWellPath, positionAtMd } from '../engine/surveyMath';

export const PPFG_MNEMONICS = ['PP', 'FP', 'OBG'];
const G = 9.80665;

/** Regular MD grid of a geo_wells_logs row. */
export function curveMdGrid(log) {
  const out = new Array(log.n_samples);
  for (let i = 0; i < log.n_samples; i++) out[i] = log.start_md_m + i * log.step_m;
  return out;
}

/** Latest readable curve per PPFG mnemonic from a listLogs result (rows
 *  arrive created_at ascending, so the last wins — the republish
 *  contract). A curve whose unit is not a pressure, gradient or mud
 *  weight is left out and its reason pushed to `skipped`. */
export function pickPpfgLogs(logs, skipped = null) {
  const out = {};
  for (const log of logs || []) {
    const m = String(log.mnemonic || '').toUpperCase();
    if (!PPFG_MNEMONICS.includes(m)) continue;
    if (!ppfgUnit(log.unit)) { if (skipped) skipped.push(unreadableUnitReason(log)); continue; }
    out[m] = log;
  }
  return out;
}

/** A downloaded curve ready for buildMudWindow: pressures convert to MPa
 *  here; a mud weight or gradient keeps its values and converts per row
 *  at the trajectory TVD. */
export function readyCurve(log, values) {
  const conv = ppfgUnit(log?.unit);
  if (!conv) throw new Error(unreadableUnitReason(log));
  const md = curveMdGrid(log);
  if (!conv.needsTvd) {
    return { md, values: Array.from(values, (v) => (Number.isFinite(v) ? conv.toMpa(v) : NaN)), log, unit: conv.unit };
  }
  return { md, values: Array.from(values), log, unit: conv.unit, toMpa: conv.toMpa };
}

/** Linear interpolation of curve (md[], values[]) at target md; null
 *  outside the curve extent or on non-finite neighbours. */
export function sampleCurve(md, values, target) {
  const n = md.length;
  if (!n || target < md[0] || target > md[n - 1]) return null;
  let i = 1;
  while (i < n - 1 && md[i] < target) i += 1;
  const f = (target - md[i - 1]) / (md[i] - md[i - 1] || 1);
  const a = values[i - 1];
  const b = values[i];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + f * (b - a);
}

/**
 * Build mud-window rows on the design trajectory.
 *
 * curves: {PP?: {md, values}, FP?: {md, values}, OBG?: {md, values}}
 * (MD metres, values MPa). stations: grid-metre design stations.
 * Sampling walks the trajectory at `stepM` and keeps rows where at
 * least one curve has data. EMW in g/cc uses TVD below KB (the
 * drilling convention): EMW = P / (g · TVD).
 *
 * Returns [{md, tvd, tvdss, ppMpa, fpMpa, obgMpa, ppEmw, fpEmw,
 * obgEmw, windowMpa}] with nulls where a curve has no data.
 */
export function buildMudWindow(curves, stations, { kbElevM = 0, stepM = 25 } = {}) {
  if (!curves || (!curves.PP && !curves.FP)) return [];
  if (!Array.isArray(stations) || stations.length < 2) return [];
  const path = computeWellPath(stations, { surfaceX: 0, surfaceY: 0, kb: kbElevM });
  const mdMin = stations[0].md;
  const mdMax = stations[stations.length - 1].md;
  const rows = [];
  for (let md = Math.ceil(mdMin / stepM) * stepM; md <= mdMax + 1e-9; md += stepM) {
    const pos = positionAtMd(stations, path, md);
    if (!pos || !(pos.tvd > 0)) continue;
    const at = (key) => {
      const c = curves[key];
      if (!c) return null;
      const v = sampleCurve(c.md, c.values, md);
      if (v == null || !c.toMpa) return v;
      const mpa = c.toMpa(v, pos.tvd);
      return Number.isFinite(mpa) ? mpa : null;
    };
    const pp = at('PP');
    const fp = at('FP');
    const obg = at('OBG');
    if (pp == null && fp == null && obg == null) continue;
    const emw = (mpa) => (mpa == null ? null : (mpa * 1e6) / (G * pos.tvd) / 1000);
    const ppg = (mpa) => (mpa == null ? null : (mpa * 1e6) / (G * pos.tvd) / KG_M3_PER_PPG);
    rows.push({
      md,
      tvd: pos.tvd,
      tvdss: pos.tvdss,
      ppMpa: pp,
      fpMpa: fp,
      obgMpa: obg,
      ppEmw: emw(pp),
      fpEmw: emw(fp),
      obgEmw: emw(obg),
      ppPpg: ppg(pp),
      fpPpg: ppg(fp),
      obgPpg: ppg(obg),
      windowMpa: pp != null && fp != null ? fp - pp : null,
    });
  }
  return rows;
}

/** Summary for the panel header: depth extent + tightest window. */
export function mudWindowSummary(rows) {
  const windowed = rows.filter((r) => r.windowMpa != null);
  if (!windowed.length) return null;
  let tightest = windowed[0];
  for (const r of windowed) if (r.windowMpa < tightest.windowMpa) tightest = r;
  return {
    fromTvd: windowed[0].tvd,
    toTvd: windowed[windowed.length - 1].tvd,
    tightest: { tvd: tightest.tvd, windowMpa: tightest.windowMpa },
  };
}

/**
 * Load a geo_well's PPFG curves from the registry:
 * {PP?: {md, values, log, unit, toMpa?}, ...} — empty object when none
 * published. `skipped` (optional array) receives a sentence per curve that
 * could not be read.
 */
export async function loadPpfgCurves(geoWellId, { skipped = null } = {}) {
  const logs = await listLogs(geoWellId);
  const picked = pickPpfgLogs(logs, skipped);
  const out = {};
  for (const [mnemonic, log] of Object.entries(picked)) {
    const values = await downloadCurve(log);
    out[mnemonic] = readyCurve(log, values);
  }
  return out;
}

/** One line for the panel: where the curves came from and in what unit. */
export function ppfgSourceLine(curves) {
  const parts = PPFG_MNEMONICS.filter((m) => curves?.[m]).map((m) => {
    const c = curves[m];
    const prov = c.log?.provenance || {};
    const who = prov.engine === 'pore-pressure-studio' ? `Pore Pressure Studio ${prov.pipeline_version || ''}`.trim() : (c.log?.source_file || 'imported');
    return `${m} ${c.unit} (${who})`;
  });
  return parts.join(', ');
}
