// d-exponent surveillance (upgrade U2-006, the first half of Pore Pressure
// U2-014). For every data row that has a rate of penetration, a rotary
// speed and a weight on bit (imported or typed, services/mudlogImport.js),
// the engine (dExponent.js) gives the d-exponent of Jorden and Shirley and,
// with the mud weight in use and a declared normal pore pressure gradient,
// the corrected d-exponent of Rehm and McClendon. The bit size comes from
// the row, else from the open hole section of the rig configuration at
// that depth. A row that cannot be computed says why and is counted.
//
// The normal trend is fitted (engine fitNormalTrend: a straight line of
// log dc against TVD) over the depth interval the interpreter declares as
// normally pressured. The view then marks where dc falls below it. That is
// an indication to weigh with gas, cavings and hole condition: no pore
// pressure is computed here (U2-015, with Pore Pressure Studio).
//
// The settings (normal gradient, trend interval) are a decision record
// ('dxc_settings', a version chain), so they are stored offline, shared and
// packaged, and the report can say who set them. Pure.

import { dExponent, correctedDExponent, fitNormalTrend, trendDeparture } from '@/lib/wellsite/dExponent';
import { mdToTvd } from '@/lib/wellsite/depth';
import { chainHeads } from '@/lib/wellsite/records';

export const DXC_SETTINGS_SUBTYPE = 'dxc_settings';
const G = 9.80665;
/** Units a normal pore pressure gradient can be declared in, each to kg/m3 of equivalent mud weight. */
export const NORMAL_UNITS = Object.freeze({
  ppg: (v) => v * 119.82642731689663,
  sg: (v) => v * 1000,
  'kg/m3': (v) => v,
  'psi/ft': (v) => (v * 6894.757293168361) / 0.3048 / G,
  'kPa/m': (v) => (v * 1000) / G,
});
export const normalFromKgM3 = (kg, unit) => {
  if (unit === 'ppg') return kg / 119.82642731689663;
  if (unit === 'sg') return kg / 1000;
  if (unit === 'psi/ft') return (kg * G * 0.3048) / 6894.757293168361;
  if (unit === 'kPa/m') return (kg * G) / 1000;
  return kg;
};

/** The bit size at a depth from the rig configuration: the open hole section holding it, else the deepest open hole above it. */
export function bitSizeAt(mdM, rigConfig) {
  const open = ((rigConfig && rigConfig.hole_sections) || []).filter((s) => !s.cased && s.hole_id_m > 0).sort((a, b) => a.from_md_m - b.from_md_m);
  if (!open.length) return null;
  const hit = open.find((s) => mdM >= s.from_md_m - 1e-6 && mdM <= s.to_md_m + 1e-6);
  if (hit) return hit.hole_id_m;
  const above = open.filter((s) => s.to_md_m < mdM);
  return above.length ? above[above.length - 1].hole_id_m : null;
}

/** The settings decision: the normal gradient as a mud weight and the trend interval. */
export function dxcSettingsParams({ normalValue, normalUnit, trendFromMdM = null, trendToMdM = null, person = null }) {
  if (!NORMAL_UNITS[normalUnit]) throw new Error(`Declare the unit of the normal pore pressure gradient: ${Object.keys(NORMAL_UNITS).join(', ')}.`);
  if (!(normalValue > 0)) throw new Error('The normal pore pressure gradient must be a positive number.');
  const kg = NORMAL_UNITS[normalUnit](normalValue);
  if (kg < 950 || kg > 1300) throw new Error(`A normal pore pressure gradient of ${normalValue} ${normalUnit} is ${(kg / 1000).toFixed(3)} sg, outside 0.95 to 1.30 sg (fresh water to saturated brine). Check the value and its unit.`);
  const hasFrom = Number.isFinite(trendFromMdM); const hasTo = Number.isFinite(trendToMdM);
  if (hasFrom !== hasTo) throw new Error('A normal trend interval needs both its top and its base.');
  if (hasFrom && !(trendToMdM > trendFromMdM)) throw new Error('The base of the normal trend interval must be below its top.');
  return {
    kind: 'decision', subtype: DXC_SETTINGS_SUBTYPE,
    payload: {
      normal_mw_kg_m3: kg, normal_value: normalValue, normal_unit: normalUnit, trend_from_md_m: hasFrom ? trendFromMdM : null, trend_to_md_m: hasTo ? trendToMdM : null,
      person, communication: null, basis: 'Corrected d-exponent settings',
      statement: `Normal pore pressure gradient ${normalValue} ${normalUnit}${hasFrom ? `; normal trend fitted from ${trendFromMdM.toFixed(1)} to ${trendToMdM.toFixed(1)} m MD` : '; no normal trend interval'}`,
    },
  };
}

/** The settings in force (head of the chain, latest), or null. */
export function currentDxcSettings(decisionRecords) {
  const heads = chainHeads((decisionRecords || []).filter((r) => r.kind === 'decision' && r.subtype === DXC_SETTINGS_SUBTYPE));
  if (!heads.length) return null;
  const h = heads.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  return { record: h, normalMwKgM3: h.payload.normal_mw_kg_m3, normalValue: h.payload.normal_value, normalUnit: h.payload.normal_unit, trendFromMdM: h.payload.trend_from_md_m, trendToMdM: h.payload.trend_to_md_m };
}

/**
 * d and dc for every data row.
 * @param {Object} p { points (mudlogSeries), rigConfig, ctx, settings (currentDxcSettings or null), tolerance }
 * @returns {{ rows, skipped: Object<string, number>, trend, departures, flagged, notes: string[] }}
 */
export function dExponentSeries({ points, rigConfig, ctx, settings = null, tolerance = 0.1 }) {
  const rows = []; const skipped = {}; const notes = [];
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  for (const p of points || []) {
    const v = p.values || {};
    if (!Number.isFinite(v.rop) || !Number.isFinite(v.rpm) || !Number.isFinite(v.wob)) { if (Number.isFinite(v.rop) || Number.isFinite(v.wob) || Number.isFinite(v.rpm)) skip('rate of penetration, rotary speed or weight on bit not read'); continue; }
    const bitM = Number.isFinite(v.bit_size) ? v.bit_size : bitSizeAt(p.mdM, rigConfig);
    if (!(bitM > 0)) { skip('no bit size in the row and no open hole section at that depth in Config'); continue; }
    const r = dExponent({ ropMPerHr: v.rop, rpm: v.rpm, wobN: v.wob * 1000, bitM });
    if (!r.ok) { skip(r.reason); continue; }
    const mw = Number.isFinite(v.ecd) ? v.ecd : (Number.isFinite(v.mw) ? v.mw : null);
    let dc = null;
    if (settings && mw != null) { const c = correctedDExponent({ d: r.d, normalMudWeight: settings.normalMwKgM3, mudWeight: mw }); if (c.ok) dc = c.dc; }
    const tvdM = ctx && Number.isFinite(ctx.kbElevM) ? mdToTvd(p.mdM, ctx).tvdM : p.mdM;
    rows.push({ mdM: p.mdM, tvdM, d: r.d, dc, mwKgM3: mw, mwSource: Number.isFinite(v.ecd) ? 'ECD' : (mw != null ? 'mud weight in' : null), bitM, bitSource: Number.isFinite(v.bit_size) ? 'row' : 'Config' });
  }
  if (!settings) notes.push('Declare the normal pore pressure gradient to correct the d-exponent for the mud weight.');
  else if (rows.length && !rows.some((x) => x.dc != null)) notes.push('No row carries a mud weight or an ECD, so the d-exponent cannot be corrected.');
  else if (rows.some((x) => x.mwSource === 'mud weight in')) notes.push('Rows without an ECD are corrected with the mud weight in, which understates the correction while circulating.');
  let trend = null; let departures = [];
  if (settings && Number.isFinite(settings.trendFromMdM) && Number.isFinite(settings.trendToMdM)) {
    const pts = rows.filter((x) => x.dc != null && x.mdM >= settings.trendFromMdM - 1e-3 && x.mdM <= settings.trendToMdM + 1e-3).map((x) => ({ depth: x.tvdM, dc: x.dc }));
    const fit = fitNormalTrend(pts);
    if (fit.ok) {
      trend = { slope: fit.slope, intercept: fit.intercept, n: fit.n, fromMdM: settings.trendFromMdM, toMdM: settings.trendToMdM };
      departures = trendDeparture(rows.filter((x) => x.dc != null).map((x) => ({ depth: x.tvdM, dc: x.dc })), trend, { tolerance });
      const byTvd = new Map(departures.map((x) => [`${x.depth}:${x.dc}`, x]));
      for (const x of rows) { const dep = x.dc != null ? byTvd.get(`${x.tvdM}:${x.dc}`) : null; if (dep) { x.normalDc = dep.normalDc; x.ratio = dep.ratio; x.below = dep.below; } }
    } else notes.push(`Normal trend: ${fit.reason}`);
  } else if (settings && rows.some((x) => x.dc != null)) notes.push('Choose the normally pressured interval to fit the normal trend.');
  const flagged = rows.filter((x) => x.below);
  return { rows, skipped, trend, departures, flagged, notes, tolerance };
}

/** One sentence on what the series shows, for the view and the report. */
export function dxcSummary(series, fmt = (m) => `${m.toFixed(1)} m`) {
  if (!series.rows.length) return 'No data row has a rate of penetration, a rotary speed and a weight on bit yet.';
  const n = series.rows.length; const c = series.rows.filter((x) => x.dc != null).length;
  let s = `${n} row(s) with a d-exponent, ${c} corrected for the mud weight.`;
  if (series.trend) {
    s += ` Normal trend fitted on ${series.trend.n} point(s) from ${fmt(series.trend.fromMdM)} to ${fmt(series.trend.toMdM)} MD.`;
    if (series.flagged.length) s += ` ${series.flagged.length} row(s) fall more than ${(series.tolerance * 100).toFixed(0)} percent below it, the shallowest at ${fmt(series.flagged[0].mdM)} MD: an indication to weigh with gas, cavings and hole condition.`;
    else s += ' No row falls more than 10 percent below it.';
  }
  return s;
}
