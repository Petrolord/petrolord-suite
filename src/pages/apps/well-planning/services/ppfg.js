// PPFG mud-window integration (WD5): read the pore-pressure prognosis
// that Pore Pressure Studio publishes into geo_wells_logs (PP / FP /
// OBG curves in MPa vs registry MD, pipeline pp-1.0.0) and hang it on
// the design trajectory as a TVD-referenced mud window for the section
// view. Pure math here is jest-tested; the loader is a thin registry
// adapter.

import { listLogs, downloadCurve } from '@/lib/wellsRegistry';
import { computeWellPath, positionAtMd } from '../engine/surveyMath';

export const PPFG_MNEMONICS = ['PP', 'FP', 'OBG'];
const G = 9.80665;

/** Regular MD grid of a geo_wells_logs row. */
export function curveMdGrid(log) {
  const out = new Array(log.n_samples);
  for (let i = 0; i < log.n_samples; i++) out[i] = log.start_md_m + i * log.step_m;
  return out;
}

/** Latest curve per PPFG mnemonic from a listLogs result (rows arrive
 *  created_at ascending, so the last wins — the republish contract). */
export function pickPpfgLogs(logs) {
  const out = {};
  for (const log of logs || []) {
    if (PPFG_MNEMONICS.includes(log.mnemonic) && (log.unit || '').toUpperCase() === 'MPA') {
      out[log.mnemonic] = log;
    }
  }
  return out;
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
    const at = (key) => (curves[key]
      ? sampleCurve(curves[key].md, curves[key].values, md) : null);
    const pp = at('PP');
    const fp = at('FP');
    const obg = at('OBG');
    if (pp == null && fp == null && obg == null) continue;
    const emw = (mpa) => (mpa == null ? null : (mpa * 1e6) / (G * pos.tvd) / 1000);
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
 * {PP?: {md, values, log}, ...} — empty object when none published.
 */
export async function loadPpfgCurves(geoWellId) {
  const logs = await listLogs(geoWellId);
  const picked = pickPpfgLogs(logs);
  const out = {};
  for (const [mnemonic, log] of Object.entries(picked)) {
    const values = await downloadCurve(log);
    out[mnemonic] = { md: curveMdGrid(log), values, log };
  }
  return out;
}
