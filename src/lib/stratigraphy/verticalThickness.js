// Strat maps on vertical thickness (AppUpgrade STRAT-U2-011, 2026-09-30).
//
// The ST4 engine (stratMaps.thicknessPoints) measures the rock between two
// picks along the hole, which overstates every thickness on a deviated well
// (KETA-2: 95 m along hole is 88 m vertical). This wrapper takes each well's
// tops and lithology intervals through its survey (verticalDepthOf, the same
// door Send to Basin uses since STRAT-U1-008) before calling the engine, so
// gross and net thickness are TVD differences: the vertical isochore. A well
// with no survey is vertical and stays MD, and is named. True vertical
// thickness corrected for bed dip (TVT) needs dip and is not done here.
// Engine unchanged; the MD picks come back beside the TVD ones.

import { thicknessPoints } from './stratMaps';
import { verticalDepthOf } from '@/lib/basinHandoff';

/**
 * @param {Array} wells {id, name, surface_x, surface_y, tops, deviation?, kb_m?, td_md_m?}
 * @param {string} upperName
 * @param {string} lowerName
 * @param {{ intervalsByWell?: Object, measure?: string, codes?: string[] }} opts as thicknessPoints
 * @returns {{ points: Array, skipped: Array, measure, codes, basis: 'tvd'|'md'|'mixed', mdWells: string[] }}
 */
export function verticalThicknessPoints(wells, upperName, lowerName, opts = {}) {
  const byWell = opts.intervalsByWell || {};
  const conv = new Map();
  const mdWells = [];
  const vWells = (wells || []).map((w) => {
    const v = verticalDepthOf(w);
    conv.set(w.id, v);
    if (v.basis !== 'tvd') mdWells.push(w.name);
    return { ...w, tops: (w.tops || []).map((t) => ({ ...t, md_m: Number.isFinite(Number(t.md_m)) ? v.tvd(Number(t.md_m)) : t.md_m })) };
  });
  const vIntervals = Object.fromEntries(Object.entries(byWell).map(([id, rows]) => {
    const v = conv.get(id);
    return [id, v ? (rows || []).map((r) => ({ ...r, top_md_m: v.tvd(Number(r.top_md_m)), base_md_m: v.tvd(Number(r.base_md_m)) })) : rows];
  }));
  const r = thicknessPoints(vWells, upperName, lowerName, { ...opts, intervalsByWell: vIntervals });
  const mdOf = (name, which) => {
    const w = (wells || []).find((x) => x.name === name);
    const t = (w?.tops || []).find((x) => x.name === which);
    return t ? Number(t.md_m) : null;
  };
  const points = r.points.map((p) => ({
    ...p,
    top_tvd_m: p.top_md_m, base_tvd_m: p.base_md_m,
    top_md_m: mdOf(p.well, upperName), base_md_m: mdOf(p.well, lowerName),
    basis: mdWells.includes(p.well) ? 'md' : 'tvd',
  }));
  const used = points.map((p) => p.basis);
  const basis = !used.length || used.every((b) => b === 'tvd') ? 'tvd' : used.every((b) => b === 'md') ? 'md' : 'mixed';
  return { ...r, points, basis, mdWells: mdWells.filter((n) => points.some((p) => p.well === n)) };
}
