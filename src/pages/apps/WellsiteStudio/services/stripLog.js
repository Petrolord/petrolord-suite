// Strip log tracks (upgrades U2-001 and U2-006): the well's records turned
// into the plain track data the drawing takes. Every number comes from a
// record or from a service that calls an engine; this file only arranges
// them. Curves are in the display units of the view. Pure.

import { displayUnit } from './mudlogImport';
import { resolveLithology } from '@/lib/wellsite/descriptionVocabulary';
import { abbreviate, descriptionOf, mergeProfile } from './describe';
import { bitHistoryOf } from './samples';
import { GAS_SUBTYPE } from './gas';
import { showAbbrev } from './shows';
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

// ---- U2-001: the composite log ------------------------------------------------


const FT_M = 0.3048;
const showText = (payload) => { try { const t = showAbbrev(payload || {}); return typeof t === 'string' ? t : (t && t.text) || ''; } catch { return ''; } };
const UNKNOWN_LITH = '#cbd5e1';

/** ROP from the bit depth log when no ROP curve was imported: one value per interval that made hole, at its base. */
export function ropFromBits(bitDepths, events = []) {
  const h = bitHistoryOf(bitDepths, events);
  const out = [];
  for (let i = 1; i < h.length; i += 1) {
    const dMd = h[i].mdM - h[i - 1].mdM; const dHr = (h[i].utcMs - h[i - 1].utcMs) / 3600000;
    if (dMd > 0 && dHr > 0) { out.push({ mdM: h[i - 1].mdM, v: dMd / dHr }); out.push({ mdM: h[i].mdM, v: dMd / dHr }); }
  }
  return out;
}

/** Lithology intervals from the current cuttings descriptions: the percentage column a mud log draws. */
export function lithologyIntervals(descriptions) {
  return (descriptions || []).filter((r) => Number.isFinite(r.md_calc_m) && Number.isFinite(r.md2_calc_m) && r.md2_calc_m > r.md_calc_m).map((r) => {
    const comps = ((r.payload && r.payload.components) || []).filter((c) => c.lithology && c.percent > 0);
    const total = comps.reduce((a, c) => a + c.percent, 0) || 1;
    const parts = comps.map((c) => { const l = resolveLithology(c.lithology); return { code: l ? l.code : c.lithology, name: l ? l.name : c.lithology, color: (l && l.colour) || UNKNOWN_LITH, fraction: c.percent / total, percent: c.percent }; });
    const dom = [...parts].sort((a, b) => b.fraction - a.fraction)[0] || null;
    return { id: r.id, topM: r.md_calc_m, baseM: r.md2_calc_m, code: dom ? dom.code : 'none', color: dom ? dom.color : UNKNOWN_LITH, parts: parts.length ? parts : [{ color: UNKNOWN_LITH, fraction: 1 }], label: parts.map((p) => `${p.name} ${p.percent}%`).join(', ') };
  }).sort((a, b) => a.topM - b.topM);
}

/** Gas in ppm against depth: typed total gas and chromatograph readings merged with the imported curves. */
export function gasSeries({ observations = [], points = [] }) {
  const series = { total: [], c1: [], c2: [], c3: [], c4: [], c5: [], units: [] };
  const push = (k, mdM, v) => { if (Number.isFinite(mdM) && v > 0) series[k].push({ mdM, v }); };
  for (const r of observations) {
    const pl = r.payload || {};
    if (r.subtype === 'total_gas') {
      if (pl.unit === '%') push('total', r.md_calc_m, pl.value * 10000); else if (pl.unit === 'ppm') push('total', r.md_calc_m, pl.value); else push('units', r.md_calc_m, pl.value);
    } else if (r.subtype === GAS_SUBTYPE && pl.ppm) {
      const c = pl.ppm;
      push('c1', r.md_calc_m, c.c1); push('c2', r.md_calc_m, c.c2); push('c3', r.md_calc_m, c.c3);
      push('c4', r.md_calc_m, (c.ic4 || 0) + (c.nc4 || 0) + (c.c4 || 0)); push('c5', r.md_calc_m, (c.ic5 || 0) + (c.nc5 || 0) + (c.c5 || 0));
    }
  }
  for (const p of points) {
    const v = p.values;
    if (Number.isFinite(v.total_gas)) push('total', p.mdM, v.total_gas * 10000);
    if (Number.isFinite(v.total_gas_units)) push('units', p.mdM, v.total_gas_units);
    push('c1', p.mdM, v.c1); push('c2', p.mdM, v.c2); push('c3', p.mdM, v.c3);
    push('c4', p.mdM, (v.ic4 || 0) + (v.nc4 || 0)); push('c5', p.mdM, (v.ic5 || 0) + (v.nc5 || 0));
  }
  for (const k of Object.keys(series)) series[k].sort((a, b) => a.mdM - b.mdM);
  return series;
}

/**
 * The composite log model: the depth window, the tracks and the markers.
 * @param {Object} p { well, unit, pressureUnit, mudlog, bitDepths, events, descriptions, shows, observations, topsBoard, prognosis, rigConfig, dxc, latestBitMdM }
 */
export function buildStripLog({ well, unit = 'm', mudlog, bitDepths = [], events = [], descriptions = [], shows = [], observations = [], topsBoard = null, rigConfig = null, dxc = null, pressure = null }) {
  const points = (mudlog && mudlog.points) || [];
  const profile = mergeProfile(well && well.settings && well.settings.abbreviation_profile ? well.settings.abbreviation_profile : null);
  const liths = lithologyIntervals(descriptions);
  const gas = gasSeries({ observations, points });
  const rows = (topsBoard && topsBoard.rows) || [];
  const markers = [];
  for (const r of rows) {
    if (r.call && r.call.status !== 'withdrawn') markers.push({ id: `call-${r.key}`, kind: 'top', mdM: r.call.md_calc_m, label: `${r.name} (${r.call.status})`, color: '#0f172a' });
    if (r.prognosis && Number.isFinite(r.prognosis.md_m)) markers.push({ id: `prog-${r.key}`, kind: 'prognosis', mdM: r.prognosis.md_m, label: `${r.name} prognosis`, color: '#64748b', dashed: true });
  }
  for (const s of ((rigConfig && rigConfig.hole_sections) || []).filter((x) => x.cased && x.to_md_m > 0)) markers.push({ id: `shoe-${s.to_md_m}`, kind: 'casing', mdM: s.to_md_m, label: `${s.description || 'casing'} shoe`, color: '#b45309' });
  const bitMdM = bitDepths.length ? bitDepths[bitDepths.length - 1].md_calc_m : null;
  const win = depthWindow({ points, bitMdM, extraMds: [...liths.flatMap((l) => [l.topM, l.baseM]), ...rows.filter((r) => r.call).map((r) => r.call.md_calc_m), ...Object.values(gas).flat().map((p) => p.mdM), ...bitDepths.map((b) => b.md_calc_m), ...shows.map((s) => s.md_calc_m)] });
  if (!win) return { win: null, tracks: [], markers: [], notes: [], legend: [] };

  const notes = [];
  const tracks = [depthTrack(unit)];
  // ROP
  const imported = quantitySeries(points, 'rop', unit);
  const fromBits = ropFromBits(bitDepths, events).map((p) => ({ mdM: p.mdM, v: unit === 'ft' ? p.v / FT_M : p.v }));
  const ropPts = imported.points.length ? imported.points : fromBits;
  if (ropPts.length) {
    tracks.push({ id: 'rop', type: 'curve', title: 'ROP', unit: `${unit}/hr`, width: 120, scale: { min: 0, max: niceMax(Math.max(...ropPts.map((p) => p.v))), log: false }, series: [{ id: 'rop', label: imported.points.length ? 'imported' : 'bit depths', color: SERIES_COLORS.rop, points: ropPts }] });
    if (!imported.points.length) notes.push('ROP is taken from the recorded bit depths over drilling time; import the mudlogging data for the continuous curve.');
  }
  // lithology
  if (liths.length) tracks.push({ id: 'lith', type: 'lith', title: 'Lithology', unit: '% of cuttings', width: 90, intervals: liths });
  // gas
  const gasDefs = [['total', 'TG', SERIES_COLORS.gas], ['c1', 'C1', SERIES_COLORS.c1], ['c2', 'C2', SERIES_COLORS.c2], ['c3', 'C3', SERIES_COLORS.c3], ['c4', 'C4', SERIES_COLORS.c4], ['c5', 'C5', SERIES_COLORS.c5]].filter(([k]) => gas[k].length);
  if (gasDefs.length) {
    tracks.push({ id: 'gas', type: 'curve', title: 'Gas', unit: 'ppm, log scale', width: 190, scale: { ...logRange(gasDefs.flatMap(([k]) => gas[k].map((p) => p.v))), log: true }, series: gasDefs.map(([k, label, color]) => ({ id: k, label, color, points: gas[k], markers: gas[k].length < 3 })) });
  }
  if (gas.units.length) {
    tracks.push({ id: 'gasunits', type: 'curve', title: 'Total gas', unit: 'units, uncalibrated', width: 100, scale: { min: 0, max: niceMax(Math.max(...gas.units.map((p) => p.v))), log: false }, series: [{ id: 'units', label: 'TG', color: SERIES_COLORS.gas, points: gas.units, markers: gas.units.length < 3 }] });
    notes.push('Total gas recorded in chromatograph units is drawn on its own track: it has no calibration to ppm.');
  }
  // d-exponent
  if (dxc && dxc.rows.length) tracks.push(dExponentTrack(dxc));
  // U2-008: the pore pressure prognosis as equivalent mud weight with the mud weight in use
  if (pressure && (pressure.pp.length || pressure.fp.length)) {
    const [mwUnit, mwConv] = displayUnit('mw', unit);
    const conv = (arr) => arr.map((p) => ({ mdM: p.mdM, v: mwConv(p.v) }));
    const mw = points.filter((p) => Number.isFinite(p.values.ecd) || Number.isFinite(p.values.mw)).map((p) => ({ mdM: p.mdM, v: mwConv(Number.isFinite(p.values.ecd) ? p.values.ecd : p.values.mw) }));
    const all = [...pressure.pp, ...pressure.fp].map((p) => mwConv(p.v)).concat(mw.map((p) => p.v));
    const lo = Math.floor(Math.min(...all) * (unit === 'ft' ? 1 : 10)) / (unit === 'ft' ? 1 : 10);
    const hi = Math.ceil(Math.max(...all) * (unit === 'ft' ? 1 : 10)) / (unit === 'ft' ? 1 : 10);
    tracks.push({ id: 'pressure', type: 'curve', title: 'Pressure prognosis', unit: `${mwUnit} equivalent mud weight`, width: 170, scale: { min: lo, max: hi > lo ? hi : lo + 1, log: false },
      series: [{ id: 'pp', label: 'pore', color: '#2563eb', points: conv(pressure.pp) }, { id: 'fp', label: 'fracture', color: '#b91c1c', points: conv(pressure.fp) }, ...(mw.length ? [{ id: 'mw', label: 'mud', color: SERIES_COLORS.mw, points: mw, markers: mw.length < 40, gapM: 200 }] : [])] });
  }
  // the labels of tops, prognosis and casing shoes get a track of their own so they never sit on a curve or a description
  if (markers.length) tracks.push({ id: 'tops', type: 'markers', title: 'Tops and casing', unit: 'called, prognosis, shoe', width: 210 });
  // descriptions and shows
  const items = [
    ...descriptions.filter((r) => Number.isFinite(r.md_calc_m)).map((r) => ({ id: r.id, mdM: r.md_calc_m, text: abbreviate(descriptionOf(r), profile).text })),
    ...shows.filter((r) => Number.isFinite(r.md_calc_m)).map((r) => ({ id: r.id, mdM: r.md_calc_m, text: `SHOW ${showText(r.payload)}`.trim(), color: '#b91c1c' })),
  ].sort((a, b) => a.mdM - b.mdM);
  if (items.length) tracks.push({ id: 'desc', type: 'text', title: 'Descriptions and shows', unit: 'at the top of each interval', width: 300, maxChars: 56, items });
  const legend = [];
  for (const l of liths) for (const p of l.parts) if (p.name && !legend.some((x) => x.name === p.name)) legend.push({ name: p.name, color: p.color });
  return { win, tracks, markers: markers.sort((a, b) => a.mdM - b.mdM), notes, legend };
}
