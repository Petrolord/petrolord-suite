// Strip log tracks (upgrades U2-001 and U2-006): the well's records turned
// into the plain track data the drawing takes. Every number comes from a
// record or from a service that calls an engine; this file only arranges
// them. Curves are in the display units of the view. Pure.

import { displayUnit } from './mudlogImport';
import { niceMax, logRange } from '../components/striplog/geometry';

export const SERIES_COLORS = Object.freeze({ rop: '#059669', d: '#94a3b8', dc: '#2563eb', trend: '#d97706', gas: '#db2777', c1: '#b91c1c', c2: '#d97706', c3: '#059669', c4: '#2563eb', c5: '#7c3aed', wob: '#0891b2', mw: '#475569' });

/** The depth window that holds everything worth drawing (padded), or the bit when there is nothing else. */
export function depthWindow({ points = [], extraMds = [], bitMdM = null }) {
  const mds = [...points.map((p) => p.mdM), ...extraMds].filter(Number.isFinite);
  if (!mds.length) return Number.isFinite(bitMdM) ? { topM: Math.max(0, bitMdM - 100), baseM: bitMdM + 10 } : null;
  const lo = Math.min(...mds); const hi = Math.max(...mds, Number.isFinite(bitMdM) ? bitMdM : -Infinity);
  const pad = Math.max(2, (hi - lo) * 0.02);
  return { topM: Math.max(0, lo - pad), baseM: hi + pad };
}

export const depthTrack = (unit) => ({ id: 'depth', type: 'depth', title: 'Depth', unit: `${unit} MD`, width: 58 });

/** The d-exponent track: d (grey), dc (blue), the normal trend (dashed), rows below the trend marked. */
export function dExponentTrack(series) {
  const rows = series.rows;
  const dPts = rows.map((r) => ({ mdM: r.mdM, v: r.d }));
  const dcPts = rows.filter((r) => r.dc != null).map((r) => ({ mdM: r.mdM, v: r.dc, flag: !!r.below }));
  const trendPts = series.trend ? rows.filter((r) => Number.isFinite(r.normalDc)).map((r) => ({ mdM: r.mdM, v: r.normalDc })) : [];
  const scale = { ...logRange([...dPts, ...dcPts, ...trendPts].map((p) => p.v)), log: true };
  return {
    id: 'dxc', type: 'curve', title: 'd-exponent', unit: 'log scale', width: 170, scale,
    series: [
      { id: 'd', label: 'd', color: SERIES_COLORS.d, points: dPts, markerOnly: rows.length < 2 },
      { id: 'dc', label: 'dc', color: SERIES_COLORS.dc, points: dcPts, markers: true },
      ...(trendPts.length ? [{ id: 'trend', label: 'normal', color: SERIES_COLORS.trend, points: trendPts, dashed: true }] : []),
    ],
  };
}

/** A curve of one mudlog quantity in display units. */
export function quantitySeries(points, key, depthUnit, pressureUnit = null) {
  const [unit, conv] = displayUnit(key, depthUnit, pressureUnit);
  return { unit, points: points.filter((p) => Number.isFinite(p.values[key])).map((p) => ({ mdM: p.mdM, v: conv(p.values[key]) })) };
}

export { niceMax, logRange };
