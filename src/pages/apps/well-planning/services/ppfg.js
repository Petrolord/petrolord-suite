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

import { listLogs, downloadCurve, listWells, listAllLogMeta } from '@/lib/wellsRegistry';
import { readWellDatum } from '@/lib/wellDatum';
import { ppfgUnit, unreadableUnitReason, KG_M3_PER_PPG } from '@/lib/ppfgUnits';
import { computeWellPath, positionAtMd } from '../engine/surveyMath';
import { casingSeatsBottomUp, lineAt } from '../../PorePressureStudio/engine/casingSeats';

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
  return mudWindowRows(stations, { kbElevM, stepM }, (key, md, pos) => {
    const c = curves[key];
    if (!c) return null;
    const v = sampleCurve(c.md, c.values, md);
    if (v == null || !c.toMpa) return v;
    const mpa = c.toMpa(v, pos.tvd);
    return Number.isFinite(mpa) ? mpa : null;
  });
}

/** The rows both readers share: walk the trajectory at `stepM`, ask
 *  `at(key, md, pos)` for each curve in MPa, keep rows with any data. */
function mudWindowRows(stations, { kbElevM = 0, stepM = 25 } = {}, at) {
  if (!Array.isArray(stations) || stations.length < 2) return [];
  const path = computeWellPath(stations, { surfaceX: 0, surfaceY: 0, kb: kbElevM });
  const mdMin = stations[0].md;
  const mdMax = stations[stations.length - 1].md;
  const rows = [];
  for (let md = Math.ceil(mdMin / stepM) * stepM; md <= mdMax + 1e-9; md += stepM) {
    const pos = positionAtMd(stations, path, md);
    if (!pos || !(pos.tvd > 0)) continue;
    const pp = at('PP', md, pos);
    const fp = at('FP', md, pos);
    const obg = at('OBG', md, pos);
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

// ---- 2026-10-13: the prognosis of an offset well, by TVDSS ----------------
// A planned well has no logs, so Pore Pressure Studio cannot run on it. The
// mud window can take the prognosis another registry well carries and apply
// it at equal subsea depth: pressure is a property of the depth in the
// rock, so the offset's PP at a TVDSS is this well's PP at that TVDSS (the
// usual pre-drill assumption; laterally the offset is the nearest evidence).
// The offset's curves go MD -> TVDSS through its own deviation and depth
// reference, a mud weight or gradient converts to MPa at the offset's own
// TVD, and this trajectory's EMW is then taken at its own TVD below KB, so a
// KB difference between the wells is honoured.

/**
 * The offset well's path for its curves: its deviation (or a vertical hole
 * to its TD or the deepest curve sample) from its own datum.
 * @returns {{stations, path, datum}|{error: string}}
 */
export function offsetPathFor(well, { mdMax = 0 } = {}) {
  const datum = readWellDatum(well);
  if (!datum.tvdssOk) return { error: datum.tvdssReason };
  const dev = Array.isArray(well?.deviation) && well.deviation.length >= 2
    ? well.deviation.map((s) => ({ md: Number(s.md), inc: Number(s.inc), azi: Number(s.azi) }))
    : [{ md: 0, inc: 0, azi: 0 }, { md: Math.max(Number(well?.td_md_m) || 0, mdMax, 1), inc: 0, azi: 0 }];
  const path = computeWellPath(dev, { surfaceX: 0, surfaceY: 0, kb: datum.refElevM });
  return { stations: dev, path, datum };
}

/**
 * Curves (readyCurve shape, on the offset's MD) re-indexed on the offset's
 * TVDSS, values in MPa. Samples outside the surveyed MD, non-finite, or
 * not deeper than the last kept sample (a hole going up) are dropped.
 * @returns {{curves: Object<string, {tvdss: number[], mpa: number[], log, unit}>, error?: string}}
 */
export function curvesByTvdss(curves, well) {
  const mdMax = Math.max(0, ...Object.values(curves || {}).map((c) => c.md[c.md.length - 1] || 0));
  const op = offsetPathFor(well, { mdMax });
  if (op.error) return { curves: {}, error: op.error };
  const out = {};
  for (const [key, c] of Object.entries(curves || {})) {
    const tvdss = [];
    const mpa = [];
    for (let i = 0; i < c.md.length; i++) {
      const v = c.values[i];
      if (!Number.isFinite(v)) continue;
      const pos = positionAtMd(op.stations, op.path, c.md[i]);
      if (!pos) continue;
      const p = c.toMpa ? c.toMpa(v, pos.tvd) : v;
      if (!Number.isFinite(p)) continue;
      if (tvdss.length && pos.tvdss <= tvdss[tvdss.length - 1]) continue;
      tvdss.push(pos.tvdss);
      mpa.push(p);
    }
    if (tvdss.length >= 2) out[key] = { tvdss, mpa, log: c.log, unit: c.unit };
  }
  return { curves: out };
}

/**
 * Mud-window rows on this trajectory from an offset's curves by TVDSS
 * (curvesByTvdss output). Same row shape as buildMudWindow; EMW at this
 * trajectory's TVD below its KB.
 */
export function buildMudWindowByTvdss(tvdssCurves, stations, { kbElevM = 0, stepM = 25 } = {}) {
  if (!tvdssCurves || (!tvdssCurves.PP && !tvdssCurves.FP)) return [];
  return mudWindowRows(stations, { kbElevM, stepM }, (key, md, pos) => {
    const c = tvdssCurves[key];
    return c ? sampleCurve(c.tvdss, c.mpa, pos.tvdss) : null;
  });
}

/**
 * Registry wells that carry readable PP or FP curves, as choices for the
 * mud window: the bridged well first, then the others nearest first.
 * @param {object[]} wells geo_wells rows
 * @param {object[]} logMeta geo_wells_logs metadata (no samples)
 * @param {{bridgedId?: string, siteCrs?: string, wellhead?: {x:number,y:number}}} opts
 * @returns {Array<{id, name, bridged: boolean, distanceM: ?number, curves: string[]}>}
 */
export function ppfgSourceCandidates(wells, logMeta, { bridgedId = null, siteCrs = null, wellhead = null } = {}) {
  const byWell = new Map();
  for (const l of logMeta || []) {
    const m = String(l.mnemonic || '').toUpperCase();
    if (!PPFG_MNEMONICS.includes(m) || !ppfgUnit(l.unit)) continue;
    if (!byWell.has(l.well_id)) byWell.set(l.well_id, new Set());
    byWell.get(l.well_id).add(m);
  }
  const out = [];
  for (const w of wells || []) {
    const set = byWell.get(w.id);
    if (!set || !(set.has('PP') || set.has('FP'))) continue;
    const bridged = w.id === bridgedId;
    if (!bridged && siteCrs && (w.crs || null) !== siteCrs) continue;
    const distanceM = wellhead && Number.isFinite(w.surface_x) && Number.isFinite(w.surface_y)
      ? Math.hypot(w.surface_x - wellhead.x, w.surface_y - wellhead.y) : null;
    out.push({ id: w.id, name: w.name, bridged, distanceM, curves: PPFG_MNEMONICS.filter((m) => set.has(m)), well: w });
  }
  return out.sort((a, b) => (b.bridged - a.bridged) || ((a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)) || String(a.name).localeCompare(String(b.name)));
}

/** Registry reads for ppfgSourceCandidates (two queries, never one per well). */
export async function loadPpfgSourceCandidates(opts) {
  const [wells, meta] = await Promise.all([listWells(), listAllLogMeta()]);
  return ppfgSourceCandidates(wells, meta, opts);
}

/**
 * The tightest drilling window below a top cut-off (2026-10-14: the panel
 * summary takes it below SEATS_BELOW_TOP_M, where the seats are picked, so
 * the conductor section's converging lines do not win), in ppg EMW, g/cc
 * EMW and MPa at that row.
 * @returns {null|{tvd: number, md: number, ppg: number, gcc: number, mpa: number}}
 */
export function tightestWindowBelow(rows, { fromTvdM = 0 } = {}) {
  let best = null;
  for (const r of rows || []) {
    if (!(r.tvd >= fromTvdM) || r.ppPpg == null || r.fpPpg == null) continue;
    const ppg = r.fpPpg - r.ppPpg;
    if (!best || ppg < best.ppg) {
      best = { tvd: r.tvd, md: r.md, ppg, gcc: r.fpEmw != null && r.ppEmw != null ? r.fpEmw - r.ppEmw : null, mpa: r.windowMpa };
    }
  }
  return best;
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
export function ppfgSourceLine(curves, { offsetName = null } = {}) {
  const parts = PPFG_MNEMONICS.filter((m) => curves?.[m]).map((m) => {
    const c = curves[m];
    const prov = c.log?.provenance || {};
    const who = prov.engine === 'pore-pressure-studio' ? `Pore Pressure Studio ${prov.pipeline_version || ''}`.trim() : (c.log?.source_file || 'imported');
    return `${m} ${c.unit} (${who})`;
  });
  const line = parts.join(', ');
  return offsetName && line ? `${line} from ${offsetName} (offset, by TVDSS)` : line;
}

// ---- U2-003 (Pore Pressure Studio): kick and trip margins, casing seats ----
// The bottom-up casing-seat selection on this window, through the engine the
// Pore Pressure app uses (engines/porepressure/casingSeats.js, gated on the
// published Applied Drilling Engineering example). Rows are on the design
// trajectory, so the seats come out in TVD and are carried to MD on the
// same rows. EMW in ppg (exact g, as the rows are).

// the conductor section, where PP and FG converge on the seawater gradient,
// is left out of the seat selection (the Pore Pressure Studio convention)
export const SEATS_BELOW_TOP_M = 300;
export const DEFAULT_TRIP_PPG = 0.5;
export const DEFAULT_KICK_PPG = 0.5;

/**
 * @param {Array} rows buildMudWindow rows
 * @param {{tripPpg?: number, kickPpg?: number, fromTvdM?: number}} opts
 * @returns {null|{error: string}|{seats: {tvd: number, md: number, mudBelowPpg: number}[],
 *   sections: {topTvd, baseTvd, mudPpg, marginPpg}[], closedAtTvd: ?number, rows: Array}}
 */
export function casingSeatsOnWindow(rows, { tripPpg = DEFAULT_TRIP_PPG, kickPpg = DEFAULT_KICK_PPG, fromTvdM = 0 } = {}) {
  const use = (rows || []).filter((r) => r.ppPpg != null && r.fpPpg != null && r.tvd >= fromTvdM);
  const pts = [];
  for (const r of use) if (!pts.length || r.tvd > pts[pts.length - 1].tvd) pts.push(r);
  if (pts.length < 2) return null;
  const depths = pts.map((r) => r.tvd);
  try {
    const r = casingSeatsBottomUp({
      depths, ppEmw: pts.map((p) => p.ppPpg), fgEmw: pts.map((p) => p.fpPpg), tripMargin: tripPpg, kickMargin: kickPpg,
    });
    const mds = pts.map((p) => p.md);
    return {
      seats: r.seats.map((s) => ({ tvd: s.depth, md: lineAt(depths, mds, s.depth), mudBelowPpg: s.mudBelow })),
      sections: r.sections.map((s) => ({ topTvd: s.top, baseTvd: s.base, mudPpg: s.mud, marginPpg: s.margin })),
      closedAtTvd: r.closedAt,
      rows: pts.map((p, i) => ({ tvd: p.tvd, mudPpg: r.mud[i], designFgPpg: r.designFg[i] })),
    };
  } catch (e) {
    return { error: e.message };
  }
}
