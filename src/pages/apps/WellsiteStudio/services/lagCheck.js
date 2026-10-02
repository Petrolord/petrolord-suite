// Lag check and washout (upgrade U2-004, closes WS-U1-019). The mudlogger
// drops carbide (or rice, or a paint marker) at a connection and counts the
// strokes to its return. The engine (lagCheck.js) takes the strokes spent
// going down the string off the count, compares the measured lag with the
// calculated one and gives the washout of the open hole. Two records carry
// it, both in ws_records so they are stored offline, queued, shared and
// packaged like every other record:
//
//   observation 'lag_check'  what was counted and what it gave (immutable)
//   decision    'washout'    the washout in force for the lag from now on,
//                            citing the check it rests on (a version chain;
//                            a version of 0 clears it)
//
// A check alone changes nothing: the geologist applies it. Pure.

import { carbideLagCheck, withWashout } from '@/lib/wellsite/lagCheck';
import { chainHeads } from '@/lib/wellsite/records';

export const LAG_CHECK_SUBTYPE = 'lag_check';
export const WASHOUT_SUBTYPE = 'washout';
export const TRACERS = Object.freeze([{ code: 'carbide', name: 'Carbide (acetylene)' }, { code: 'rice', name: 'Rice' }, { code: 'paint', name: 'Paint or dye' }, { code: 'other', name: 'Other tracer' }]);
export const M3_PER_BBL = 0.158987294928;
export const volumeToM3 = (v, unit) => (unit === 'bbl' ? v * M3_PER_BBL : v);
export const volumeFromM3 = (m3, unit) => (unit === 'bbl' ? m3 / M3_PER_BBL : m3);

/** Run the check on the lag in force (gauge geometry: the check measures the whole washout, never one on top of another). */
export function runLagCheck({ lag, totalStrokes, surfaceLineM3 = 0 }) {
  if (!lag || !lag.available) throw new Error('The lag check needs the rig geometry, the pump and a bit depth.');
  if (!(totalStrokes > 0)) throw new Error('Enter the strokes counted from the drop to the detection.');
  const gaugeCtx = lag.gaugeLagCtx || lag.lagCtx;
  return carbideLagCheck({ lagCtx: gaugeCtx, bitMdM: lag.bitMdM, totalStrokes, surfaceLineM3, spm: lag.spmNow, boosterSpm: lag.boosterSpmNow });
}

/** The observation recording a check. */
export function lagCheckParams({ result, tracer = 'carbide', note = null, bit = null }) {
  if (!TRACERS.some((t) => t.code === tracer)) throw new Error('Choose the tracer used.');
  const p = {
    kind: 'observation', subtype: LAG_CHECK_SUBTYPE,
    payload: {
      text: null, tracer, note, source: 'manual', bit_md_m: result.bitMdM, total_strokes: result.totalStrokes, surface_line_m3: result.surfaceLineM3,
      down_strokes: result.downStrokes, measured_lag_strokes: result.measuredLagStrokes, calculated_lag_strokes: result.calculatedLagStrokes,
      difference_strokes: result.differenceStrokes, excess_m3: result.excessM3, open_hole_gauge_m3: result.openHoleGaugeM3,
      washout_fraction: result.washoutFraction, diameter_factor: result.diameterFactor, applies: result.applies, engine_note: result.note || null,
    },
  };
  p.payload.text = lagCheckLabel(p);
  if (bit) p.depth = { value: bit.depth_value, unit: bit.depth_unit, reference: bit.depth_ref, datum: bit.depth_datum, kind: 'bit_depth' };
  return p;
}

/** The decision putting a washout in force (fraction of the gauge open hole volume; 0 clears it). */
export function washoutParams({ washoutFraction, basis, person, lagCheckId = null }) {
  if (!Number.isFinite(washoutFraction) || washoutFraction < 0) throw new Error('A washout is zero or more.');
  if (washoutFraction > 3) throw new Error('A washout above 300 percent of the gauge hole volume is not a washout; check the count and the pump output.');
  const pct = (washoutFraction * 100).toFixed(1);
  return {
    kind: 'decision', subtype: WASHOUT_SUBTYPE, evidenceIds: lagCheckId ? [lagCheckId] : [],
    payload: {
      washout_fraction: washoutFraction, lag_check_id: lagCheckId, person: person || null, communication: null,
      basis: basis || (lagCheckId ? 'Lag check' : 'Entered by hand'),
      statement: washoutFraction > 0 ? `Open hole washout ${pct} percent applied to the lag` : 'Open hole washout cleared; the lag uses the gauge hole',
    },
  };
}

/** The washout in force: the head of the washout decisions with the highest time, or none. */
export function currentWashout(decisionRecords) {
  const heads = chainHeads((decisionRecords || []).filter((r) => r.kind === 'decision' && r.subtype === WASHOUT_SUBTYPE));
  if (!heads.length) return null;
  const h = heads.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  const f = Number(h.payload && h.payload.washout_fraction);
  return { record: h, fraction: Number.isFinite(f) && f > 0 ? f : 0, atUtc: h.occurred_at, lagCheckId: (h.payload && h.payload.lag_check_id) || null };
}

/** The lag context with the washout in force applied (the same context when there is none). */
export function lagContextWithWashout(lagCtx, washout) {
  if (!lagCtx || !washout || !(washout.fraction > 0)) return lagCtx;
  return withWashout(lagCtx, washout.fraction);
}

/** One line for lists, the timeline and the report. */
export function lagCheckLabel(record) {
  const p = (record && record.payload) || {};
  const m = p.measured_lag_strokes > 0 ? `${p.measured_lag_strokes.toFixed(0)} stk measured` : 'no lag measured';
  const c = Number.isFinite(p.calculated_lag_strokes) ? `${p.calculated_lag_strokes.toFixed(0)} stk calculated` : '';
  const w = Number.isFinite(p.washout_fraction) ? `, washout ${(p.washout_fraction * 100).toFixed(1)} percent` : '';
  return `Lag check (${p.tracer || 'tracer'}): ${m}${c ? `, ${c}` : ''}${w}`;
}
