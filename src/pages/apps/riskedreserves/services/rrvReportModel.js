// The Risked Reserves Valuation report as rows (upgrade U1, 2026-10-02;
// reviewer lens RL1 to RL12). ONE builder: the Report tab on the screen and
// the PDF (rrvReportExport.js, on the shared Report Kit) print these rows,
// and the plots of both come from the series builders of rrvMath.js, so the
// screen, the report and the saved valuation are one model (RL12).
//
// What a reviewer needs on the page: who and what (identification), every
// input with its unit and where it came from, the handoff from ReservoirCalc
// Pro in full, the chance of success as the product of its factors, the
// volumes unrisked and risked, the expected monetary value in its parts
// with the formula, the plots, and the limits of the method. Pure; no I/O.

import { EMPTY_VALUE } from '@/lib/emptyValue';
import { thousands, fixed } from '@/lib/reportKit/format.js';
import { SERIES_RGB } from '@/lib/reportKit/theme.js';
import { VOLUME_UNITS } from '@/pages/apps/ReservoirCalcPro/services/prospectVolumes';
import {
  DEFAULT_ECONOMICS, ECON_KEYS, FACTOR_KEYS, PERCENTILE_CONVENTION, BOE_BASIS, engineInput, editedKeys, resolveEconomics,
} from './rrvStore';
import {
  ECON_ENGINE, ECON_MODEL_FIELDS, ECON_MODEL_DEFAULTS, npvOfSize, emvOnCurve, valueSizeCurves,
} from './rrvEconomics';
import { epePriceDeckLine, epeDiscountLine } from '@/pages/apps/epe/epeUnitValue';
import {
  emvParts, outcomes, volumeTable, volumeCurves, valueCurves, valueExceedance, emvSensitivity,
} from './rrvMath';

export const REPORT_TITLE = 'Risked Prospect Valuation Report';
export const REPORT_APP = 'Petrolord Risked Reserves Valuation';
export const EMV_FORMULA = 'EMV = Pg x [ u x E(V; V >= MEFS) - D x P(V >= MEFS) ] - W';

/** The source kinds this app's selector offers beside an input (lib/inputProvenance InputSourceControl). */
export const RRV_SOURCES = Object.freeze({
  '': 'Not stated',
  study: 'Technical study or report',
  analog: 'Analog field or prospect',
  economics: 'Economic model',
  assumed: 'Assumed',
});

// ---- one set of number formats for the screen and the report ----------------
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const F = Object.freeze({
  /** a volume or a $MM value: one decimal, thousands written out */
  n1: (v) => (finite(v) ? thousands(v, 1) : EMPTY_VALUE),
  n2: (v) => (finite(v) ? thousands(v, 2) : EMPTY_VALUE),
  /** a fraction as a percentage with one decimal */
  pct: (v) => (finite(v) ? `${(v * 100).toFixed(1)}%` : EMPTY_VALUE),
  /** a typed input as the user would write it */
  plain: (v) => (finite(v) ? String(parseFloat(v.toPrecision(6))) : EMPTY_VALUE),
  frac: (v) => (finite(v) ? fixed(v, 3) : EMPTY_VALUE),
});

const time = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};
const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const note = (meta) => (meta?.note && String(meta.note).trim() ? `. ${String(meta.note).trim()}` : '');

/** The words for a source the user chose in this app's selector, with the quality note. */
export function statedSource(meta) {
  const kind = meta?.source && RRV_SOURCES[meta.source] ? RRV_SOURCES[meta.source] : null;
  return `${kind || 'Entered, source not stated'}${note(meta)}`;
}

const FACTOR_LABEL = { trap: 'Trap', reservoir: 'Reservoir', charge: 'Charge', seal: 'Seal', other: 'Other' };
const INPUT_LABEL = {
  pg: 'Chance of geological success Pg',
  p90: 'Success-case volume P90 (low)', p50: 'Success-case volume P50 (best)', p10: 'Success-case volume P10 (high)',
  mefs: 'Minimum economic field size MEFS', unitValue: 'Value per barrel u (NPV of a developed barrel)',
  devCost: 'Development cost D', wellCost: 'Exploration well cost W',
};

/** Short names, for a list inside a sentence. */
export const SHORT_LABEL = Object.freeze({ pg: 'Pg', p90: 'P90', p50: 'P50', p10: 'P10', mefs: 'MEFS', unitValue: 'value per barrel', devCost: 'development cost', wellCost: 'exploration well cost' });

/** "ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC" */
export function handoffLine(p) {
  const h = p?.handoff;
  if (!h) return p?.source === 'rcp' ? 'ReservoirCalc Pro (imported before the source record was kept)' : 'Typed in this app';
  const at = time(h.recordUpdatedAt);
  return `${h.app} prospect "${h.recordName}"${at ? `, saved ${at}` : ''}`;
}

/** What the upstream check found, in one sentence (null when there is nothing to say). */
export function upstreamSentence(upstream, units) {
  if (!upstream) return null;
  const list = (upstream.changes || []).map((c) => {
    const conv = (x) => (x === null ? 'none' : F.plain(c.key === 'pg' ? x : units.show(c.key, x)));
    return `${SHORT_LABEL[c.key]} ${conv(c.from)} to ${conv(c.to)}`;
  });
  const at = time(upstream.row?.updated_at || upstream.row?.created_at);
  switch (upstream.state) {
    case 'changed': return `The source prospect changed in ReservoirCalc Pro${at ? ` on ${at}` : ''} after these inputs were received${list.length ? ` (${list.join('; ')})` : ' (its notes or factors; the valued inputs are the same)'}.`;
    case 'replaced': return `The source prospect was risked again in ReservoirCalc Pro as a new record${at ? `, saved ${at}` : ''}${list.length ? ` (${list.join('; ')})` : ''}.`;
    case 'missing': return 'The source prospect is no longer in the ReservoirCalc Pro inventory; the inputs are as last received.';
    case 'unrecorded': return 'This prospect was imported before the source record was kept with the valuation; refresh it to record the source.';
    case 'unknown': return 'The ReservoirCalc Pro inventory could not be read, so the source record was not checked.';
    default: return null;
  }
}

function volumeSource(p, key, units) {
  if (p.source !== 'rcp') return statedSource(p.inputMeta?.[key]);
  const sent = numOrNull(p.handoff?.values?.[key]);
  const edited = sent !== null && Number(p[key]) !== sent;
  if (edited) return `Edited on this screen (${p.handoff.app} sent ${F.plain(units.show(key, sent))} ${units.label(key)})${note(p.inputMeta?.[key])}`;
  return `${handoffLine(p)}${note(p.inputMeta?.[key])}`;
}

function pgSource(p) {
  if (p.source !== 'rcp') return statedSource(p.inputMeta?.pg);
  const sent = numOrNull(p.handoff?.values?.pg);
  if (sent !== null && Number(p.pg) !== sent) return `Entered on this screen as a total (${p.handoff.app} sent ${F.frac(sent)})${note(p.inputMeta?.pg)}`;
  const how = p.handoff?.pgMethod ? `: ${p.handoff.pgMethod}` : '';
  return `${handoffLine(p)}${how}${note(p.inputMeta?.pg)}`;
}

function econSource(p, key, units) {
  // U2-002: a derived input says what it was derived from
  if (key === 'mefs' && p.econ?.mefs === 'derived') {
    return p.econ.value === 'model'
      ? 'Derived: the smallest size whose net present value is at or above zero under the economic model below'
      : 'Derived: development cost over value per barrel (D / u), the size at which a discovery is worth zero';
  }
  if (key === 'unitValue' && p.econ?.value === 'model') return 'Derived from the economic model below: the slope of its net present value between the MEFS and the mean commercial size';
  if (key === 'devCost' && p.econ?.value === 'model') return 'Derived from the economic model below: the offset of that line, so that value = u x V - D';
  // U2-001: a Petroleum Economics Studio case, named only while it is the value in use
  const epe = p.econ?.epe;
  if ((key === 'unitValue' || key === 'devCost') && epe) {
    const sent = key === 'unitValue' ? epe.unitValue : epe.devCost;
    if (p.econ.value === 'epe') {
      const what = key === 'unitValue'
        ? (epe.split ? 'its NPV before development capex, per barrel' : 'its full-cycle NPV per barrel')
        : (epe.split ? 'the present value of its capex' : 'zero: the run carries no present value of capex, so the value per barrel is full cycle');
      return `${epeLine(epe)}: ${what}${note(p.inputMeta?.[key])}`;
    }
    return `Entered on this screen (${epe.app} run "${epe.runName}" sent ${F.plain(units.show(key, sent))} ${units.label(key)}, no longer in use)${note(p.inputMeta?.[key])}`;
  }
  const v = numOrNull(p[key]);
  const meta = p.inputMeta?.[key];
  const sent = numOrNull(p.handoff?.values?.[key]);
  if (sent !== null) {
    if (v === sent) {
      const eng = p.handoff.economics?.engine ? ` (${p.handoff.economics.engine})` : '';
      return `${p.handoff.app} success-case economics${eng}, sent with the prospect${note(meta)}`;
    }
    return `Entered on this screen (${p.handoff.app} sent ${F.plain(units.show(key, sent))} ${units.label(key)})${note(meta)}`;
  }
  if (!p.touched?.[key] && v === DEFAULT_ECONOMICS[key] && !meta?.source) {
    return `Assumed: the starting default of ${F.plain(units.show(key, DEFAULT_ECONOMICS[key]))} ${units.label(key)}, never changed on this screen${note(meta)}`;
  }
  return statedSource(meta);
}

/** The inputs table: every value the engine read, then what is recorded for the reader. */
export function inputRows(p, units) {
  const show = (key) => { const v = numOrNull(p[key]); return v === null ? EMPTY_VALUE : F.plain(key === 'pg' ? v : units.show(key, v)); };
  const rows = [];
  const src = p.handoff?.source;
  // what the recoverable volumes were made from, when ReservoirCalc Pro said
  if (src?.inPlace && finite(src.inPlace.mean)) {
    const ip = src.inPlace;
    const u = VOLUME_UNITS[ip.unit]?.label || ip.unit || '';
    const run = src.run?.ranAt ? `Monte Carlo run of ${time(src.run.ranAt)}${finite(src.run.seed) ? `, seed ${src.run.seed}` : ''}${finite(src.run.iterations) ? `, ${thousands(src.run.iterations)} realizations` : ''}` : 'run not recorded';
    const where = `${p.handoff.app}${src.projectName ? ` project "${src.projectName}"` : ''}${src.reservoirName ? `, reservoir "${src.reservoirName}"` : ''}: ${run}`;
    rows.push({ key: 'inPlace', label: `In-place volume ${ip.stream || ''} P90 / P50 / P10 / mean`.replace('  ', ' '), value: [ip.p90, ip.p50, ip.p10, ip.mean].map((x) => (finite(x) ? String(parseFloat(x.toPrecision(3))) : EMPTY_VALUE)).join(' / '), unit: u, source: `${where}. Recorded for the reader`, engine: false });
  }
  if (src?.recovery && (finite(src.recovery.input) || finite(src.recovery.effectiveMean))) {
    const r = src.recovery;
    rows.push({
      key: 'recovery', label: 'Recovery factor', unit: '%',
      value: finite(r.effectiveMean) ? F.plain(r.effectiveMean * 100) : F.plain(r.input),
      source: `${p.handoff.app}: ${finite(r.effectiveMean) ? `recoverable mean over in-place mean of the run${finite(r.input) ? ` (base input ${F.plain(r.input)}%${r.distributed ? ', sampled as a distribution' : ''})` : ''}` : 'the deterministic input'}. Recorded for the reader`,
      engine: false,
    });
  }
  for (const k of ['p90', 'p50', 'p10']) {
    const blankP50 = k === 'p50' && numOrNull(p.p50) === null;
    rows.push({
      key: k, label: INPUT_LABEL[k], value: show(k), unit: units.label(k), engine: true,
      source: blankP50 ? 'Not provided: the Swanson cross-check is left out' : volumeSource(p, k, units),
    });
  }
  // the chance factors behind Pg (RL2), then Pg, the input the engine reads
  if (p.pgFactors) {
    for (const k of FACTOR_KEYS) {
      if (!finite(p.pgFactors[k])) continue;
      const charge = k === 'charge' && p.handoff?.charge?.model
        ? `; basin model "${p.handoff.charge.model}"${finite(Number(p.handoff.charge.chargeMMboe)) ? ` (${F.plain(units.volume(Number(p.handoff.charge.chargeMMboe)))} ${units.volumeLabel} to the trap)` : ''}, suggested ${p.handoff.charge.suggestedFactor ?? 'none'}, used ${p.handoff.charge.appliedFactor ?? 'none'}`
        : '';
      rows.push({ key: `factor.${k}`, label: `Chance factor: ${FACTOR_LABEL[k].toLowerCase()}`, value: F.frac(p.pgFactors[k]), unit: 'fraction', source: `${handoffLine(p)}${charge}. Enters through Pg`, engine: false });
    }
  }
  rows.push({ key: 'pg', label: INPUT_LABEL.pg, value: numOrNull(p.pg) === null ? EMPTY_VALUE : F.frac(Number(p.pg)), unit: 'fraction', source: pgSource(p), engine: true });
  for (const k of ECON_KEYS) rows.push({ key: k, label: INPUT_LABEL[k], value: show(k), unit: units.label(k), source: econSource(p, k, units), engine: true });
  // U2-002: the economic model behind a derived MEFS and value line, one row per assumption
  if (p.econ?.value === 'model') rows.push(...modelRows(p, units));
  return rows;
}

/** The assumptions of the economic model as input rows (RL1), in the display unit. */
export function modelRows(p, units) {
  const m = p.econ?.model || {};
  const meta = p.inputMeta?.econModel;
  return ECON_MODEL_FIELDS.map(([k, label, unit, kind]) => {
    const v = numOrNull(m[k]);
    const perVolume = kind === 'perVolume';
    const dflt = ECON_MODEL_DEFAULTS[k];
    const untouched = !p.econ?.modelTouched?.[k] && v === dflt && !meta?.source;
    return {
      key: `model.${k}`, label: `Model: ${label.charAt(0).toLowerCase()}${label.slice(1)}`, engine: false, model: true,
      value: v === null ? EMPTY_VALUE : F.plain(perVolume ? units.unitValue(v) : v),
      unit: perVolume ? units.unitValueLabel : unit,
      source: untouched
        ? `Assumed: the starting screening default (${F.plain(perVolume ? units.unitValue(dflt) : dflt)} ${perVolume ? units.unitValueLabel : unit}), never changed on this screen${note(meta)}. Enters through the MEFS, u and D`
        : `${statedSource(meta)}. Enters through the MEFS, u and D`,
    };
  });
}

/** The economic model assumptions with no row in the inputs table (RL1: must be empty on a model basis). */
export const missingModelInputs = (rows, p) => (p.econ?.value === 'model' ? ECON_MODEL_FIELDS.map(([k]) => k).filter((k) => !rows.some((r) => r.key === `model.${k}`)) : []);

/** 'Petroleum Economics Studio run "Base" of case "Ekene North development", saved 2026-10-01 09:00 UTC' */
export function epeLine(epe) {
  const at = time(epe?.runSavedAt);
  return `${epe.app} run "${epe.runName}"${epe.caseName ? ` of case "${epe.caseName}"` : ''}${at ? `, saved ${at}` : ''}`;
}

/** What the check of the Petroleum Economics Studio run found, in one sentence (null when it is unchanged or there is none). */
export function epeSentence(state, units) {
  if (!state) return null;
  switch (state.state) {
    case 'changed': {
      const list = (state.changes || []).map((c) => {
        const show = (x) => (x === null ? 'none' : typeof x === 'number' ? F.plain(c.key === 'unitValue' || c.key === 'npvPerBoe' ? units.unitValue(x) : c.key === 'totalMMboe' ? units.volume(x) : x) : String(x));
        return `${c.label} ${show(c.from)} to ${show(c.to)}`;
      });
      return `The Petroleum Economics Studio run changed after its value was received${list.length ? ` (${list.join('; ')})` : ''}.`;
    }
    case 'missing': return 'The Petroleum Economics Studio run is no longer there, or can no longer be read by this account; the value is as last received.';
    case 'refused': return `The Petroleum Economics Studio run can no longer be sent: ${state.reason}`;
    case 'unknown': return 'The Petroleum Economics Studio run could not be read, so the value was not checked against it.';
    default: return null;
  }
}

/** The handoff from Petroleum Economics Studio, as label and value rows (RL11, RL7). Null when no case was received. */
export function epeHandoffRows(p, state, units) {
  const h = p?.econ?.epe;
  if (!h) return null;
  const inUse = p.econ.value === 'epe';
  const uv = (x) => `${F.plain(units.unitValue(x))} ${units.unitValueLabel}`;
  return [
    ['Source application', h.app],
    ['Source record', `Run "${h.runName}"${h.caseName ? ` of case "${h.caseName}"` : ''} (${h.table} ${h.runId})`],
    ['Run saved', time(h.runSavedAt) || EMPTY_VALUE],
    ['Results written', time(h.resultsAt) || EMPTY_VALUE],
    ['Engine build', h.engineVersion ? `Petroleum Economics Studio cash-flow engine ${h.engineVersion}` : EMPTY_VALUE],
    ['Sent by build', h.sentBuild || EMPTY_VALUE],
    ['Received here', `${time(h.receivedAt) || EMPTY_VALUE}${h.receivedBuild ? `, by ${h.receivedBuild}` : ''}`],
    ['Price deck', epePriceDeckLine(h)],
    ['Discount rate', epeDiscountLine(h)],
    ['Fiscal regime', [h.fiscalRegime, h.fiscalFramework && h.fiscalFramework !== h.fiscalRegime ? `(${h.fiscalFramework})` : null, finite(h.workingInterestPct) ? `working interest ${F.plain(h.workingInterestPct)}%` : null].filter(Boolean).join(' ') || EMPTY_VALUE],
    ['Case NPV and volume', `${F.n1(h.npvMM)} $MM over ${F.plain(units.volume(h.totalMMboe))} ${units.volumeLabel}`],
    ['NPV per barrel, full cycle', uv(h.npvPerBoe)],
    ['Present value of the case capex', h.split ? `${F.n1(h.pvCapexMM)} $MM` : 'Not recorded with the run'],
    ['Value per barrel sent (u)', `${uv(h.unitValue)}${h.split ? ': the case NPV before its capex, per barrel' : ': the full-cycle NPV per barrel'}`],
    ['Development cost sent (D)', `${F.plain(h.devCost)} $MM${h.split ? ': the present value of the case capex' : ''}`],
    ['How they are used', h.split
      ? `${LINE_FORMULA}: the case capex is taken as fixed and the rest of the case as proportional to volume. At the case's own size the line gives the case NPV back.`
      : `${LINE_FORMULA} with D = 0: every size is worth the case's full-cycle NPV per barrel.`],
    ['In use', inUse ? 'Yes: the value per barrel and development cost of this valuation are the ones sent' : 'No: the value per barrel or the development cost was changed here after the handoff. The case is recorded for the reader'],
    ['Source record now', state?.state === 'current' ? 'Unchanged since it was received' : (epeSentence(state, units) || 'Not checked')],
  ];
}

const SENS_SHORT = { pg: 'Pg', volumes: 'Volumes', unitValue: 'Value per barrel', devCost: 'Development cost', wellCost: 'Well cost', mefs: 'MEFS', 'factor.trap': 'Trap', 'factor.reservoir': 'Reservoir', 'factor.charge': 'Charge', 'factor.seal': 'Seal', 'factor.other': 'Other factor' };
const signed = (x) => `${x > 0 ? '+' : ''}${F.n1(Math.abs(x) < 0.05 ? 0 : x)}`;

/**
 * "Sensitivity of the EMV" (U2-003): the tornado as rows and as the series
 * of its figure. The screen chart and the PDF figure read these.
 */
export function sensitivityModel(p, e, units) {
  const s = emvSensitivity(e, { pgFactors: p.pgFactors, swing: p.sens?.swing, factorSwing: p.sens?.factorSwing });
  const show = (r, x) => {
    if (r.key === 'volumes') return `x ${F.plain(x)}`;
    if (r.key === 'pg' || r.key.startsWith('factor.')) return F.frac(x);
    return F.plain(units.show(r.key, x));
  };
  const unit = (r) => (r.key === 'volumes' ? 'of P90, P50, P10' : r.key === 'pg' || r.key.startsWith('factor.') ? 'fraction' : units.label(r.key));
  const ranges = `Pg, the volumes, the value per barrel, the costs and the MEFS by ${F.plain(s.swing)}% either way; each chance factor by ${F.plain(s.factorSwing)} in absolute chance either way (Pg follows in proportion); chances are kept between 0 and 1`;
  return {
    ...s,
    ranges,
    table: {
      head: ['Input', 'Unit', 'Base', 'Low case', 'EMV, low ($MM)', 'High case', 'EMV, high ($MM)', 'Swing ($MM)'],
      body: s.rows.map((r) => [r.label, unit(r), show(r, r.base), show(r, r.low.input), F.n1(r.low.emv), show(r, r.high.input), F.n1(r.high.emv), F.n1(r.range)]),
      note: `One input at a time is moved to its low and its high case and the others are held; the base EMV is ${F.n1(s.base)} $MM. Ranges: ${ranges}. The swing is the gap between the two cases. These are stated ranges, chosen by the analyst: they are not probabilities and the bars do not add.${p.econ?.mefs === 'derived' || p.econ?.value === 'model' ? ' The MEFS, the value per barrel and the development cost are moved one at a time here, so a derived MEFS does not follow the value per barrel in these cases.' : ''}${s.factorsNote ? ` ${s.factorsNote}` : ''}${s.leftOut.length ? ` Left out because the input is zero: ${s.leftOut.join(', ')}.` : ''}`,
    },
    categories: s.rows.map((r) => SENS_SHORT[r.key] || r.label),
    lowDelta: s.rows.map((r) => r.low.emv - s.base),
    highDelta: s.rows.map((r) => r.high.emv - s.base),
  };
}

const LINE_FORMULA = 'value(V) = u x V - D';
/** A value that rounds to zero at one decimal prints as 0.0, never as -0.0. */
const tidy = (x) => (Math.abs(x) < 0.05 ? 0 : x);

/**
 * "Economics: the MEFS and the value of a discovery" (U2-002): the basis of
 * each economic input, the value line the valuation reads, the engine NPV
 * at named sizes beside it, and the series of the value-by-size plot.
 */
export function economicsModel(p, e, v, units) {
  const r = resolveEconomics(p);
  const onModel = p.econ?.value === 'model';
  const a = onModel ? p.econ.model : null;
  const vol = (x) => units.volume(x);
  const derived = p.econ?.mefs === 'derived';
  const sizeThatPays = finite(r.derivedMefs) ? `${F.plain(vol(r.derivedMefs))} ${units.volumeLabel}` : 'none: no size pays';
  const basis = [
    ['Value of a discovery', onModel
      ? `Economic model of this valuation, on the canonical screening NPV: ${ECON_ENGINE}`
      : p.econ?.value === 'epe' ? `${epeLine(p.econ.epe)} (see the handoff from Petroleum Economics Studio)`
        : 'Entered value per barrel and development cost (see their rows in the inputs table)'],
    ['Value line read by the valuation', `${LINE_FORMULA} = ${F.plain(units.unitValue(e.unitValue))} ${units.unitValueLabel} x V - ${F.plain(e.devCost)} $MM`],
    ['MEFS', derived
      ? `${F.plain(vol(e.mefs))} ${units.volumeLabel}, derived: ${onModel ? 'the smallest size whose engine NPV is at or above zero' : 'D / u, the size at which the line is zero'}`
      : `${F.plain(vol(e.mefs))} ${units.volumeLabel}, typed. The size that pays under the stated value is ${sizeThatPays}`],
    ['Value at the MEFS', `${F.n1(tidy(e.unitValue * e.mefs - e.devCost))} $MM: what a discovery of exactly the MEFS is worth on the line`],
  ];
  if (v.meanIfCommercial != null) basis.push(['Mean commercial size and its value', `${F.n1(vol(v.meanIfCommercial))} ${units.volumeLabel}, ${F.n1(v.npvIfCommercial)} $MM before the exploration well`]);
  let crossCheck = null;
  if (onModel) {
    const onCurve = emvOnCurve(e, a);
    crossCheck = { onCurve, onLine: v.emv, gap: onCurve - v.emv };
    basis.push(['Cross-check of the line', `EMV with the value-by-size curve integrated over the success case: ${F.n1(onCurve)} $MM; on the line: ${F.n1(v.emv)} $MM (difference ${F.n1(tidy(onCurve - v.emv))})`]);
  }
  // named sizes, smallest first, each once
  const named = [
    ['MEFS', e.mefs], ['P90', v.successCase.p90], ['P50', v.successCase.p50], ['Mean', v.successCase.mean],
    ['Mean if commercial', v.meanIfCommercial], ['P10', v.successCase.p10],
    ...(p.econ?.value === 'epe' ? [['The case', p.econ.epe.totalMMboe]] : []),
  ].filter(([, x]) => finite(x) && x > 0).sort((x, y) => x[1] - y[1]);
  const lineAt = (x) => e.unitValue * x - e.devCost;
  const table = onModel
    ? {
      head: ['Field size', `Size (${units.volumeLabel})`, 'Engine NPV ($MM)', `Engine NPV per barrel (${units.unitValueLabel})`, 'Value on the line ($MM)', 'Line less engine ($MM)'],
      body: named.map(([label, x]) => { const n = npvOfSize(x, a); return [label, F.n1(vol(x)), F.n1(n), F.n2(units.unitValue(n / x)), F.n1(tidy(lineAt(x))), F.n1(tidy(lineAt(x) - n))]; }),
      note: `The engine NPV is the canonical screening NPV of a development of that size under the economic model; the value per barrel changes with size because part of the cost does not. The valuation reads the straight line ${LINE_FORMULA}, which meets the engine at the MEFS and at the mean commercial size. A size below the MEFS is not developed, so its row is for reading only.`,
    }
    : {
      head: ['Field size', `Size (${units.volumeLabel})`, 'Value on the line ($MM)', `Value per barrel, all in (${units.unitValueLabel})`],
      body: named.map(([label, x]) => [label, F.n1(vol(x)), F.n1(lineAt(x)), F.n2(units.unitValue(lineAt(x) / x))]),
      note: p.econ?.value === 'epe'
        ? `The value of a discovery is the straight line ${LINE_FORMULA} with the value per barrel and development cost of the Petroleum Economics Studio case. The row "The case" is the case's own size, where the line gives its NPV (${F.n1(p.econ.epe.npvMM)} $MM); every other size is that one case scaled, with its capex held fixed. A size below the MEFS is not developed.`
        : `The value of a discovery is the straight line ${LINE_FORMULA} at every size: one value per barrel and one development cost. No economic model stands behind it here, so there is no engine NPV to print beside it. A size below the MEFS is not developed.`,
    };
  // the plot: from zero to past the P10 (and past the MEFS)
  const caseSize = p.econ?.value === 'epe' ? p.econ.epe.totalMMboe : null;
  const hi = Math.max(v.successCase.p10 * 1.25, e.mefs * 1.6, 1);
  const series = valueSizeCurves(a, { unitValue: e.unitValue, devCost: e.devCost }, 0, hi);
  return { basis, table, series, hi, crossCheck, onModel, derived, derivedMefs: r.derivedMefs, caseSize };
}

/** The engine inputs that have no row in the inputs table (RL1: must be empty). */
export const missingEngineInputs = (rows, e) => Object.keys(e).filter((k) => !rows.some((r) => r.key === k && r.engine));

/** The handoff from ReservoirCalc Pro, as label and value rows (RL11). Null for a typed prospect. */
export function handoffRows(p, upstream, units) {
  const h = p?.handoff;
  if (!h) return null;
  const src = h.source || {};
  const edited = editedKeys(p);
  const rows = [
    ['Source application', h.app],
    ['Source record', `Prospect "${h.recordName}" (${h.table} ${h.recordId})`],
    ['Record saved', time(h.recordUpdatedAt) || EMPTY_VALUE],
    ['Saved by build', h.build || EMPTY_VALUE],
    ['Received here', time(h.receivedAt) || EMPTY_VALUE],
    ['Volumes sent in', h.unitLabel ? `${h.unitLabel}${h.conversion ? `, ${h.conversion}` : ''}` : 'Unit not stated by the record (read as MMSTB)'],
    ['Volume basis', h.basis === 'recoverable' ? 'Recoverable (prospective resources), success case' : h.basis === 'in-place' ? 'IN PLACE (STOIIP or GIIP): not a recoverable volume' : 'Not stated by the record: may be in place'],
    ['Percentile convention', h.percentiles || PERCENTILE_CONVENTION],
    ['Chance of success', h.pgMethod ? cap(h.pgMethod) : EMPTY_VALUE],
    ['Volumes method', src.volumesFrom === 'monte-carlo' ? `Monte Carlo in ReservoirCalc Pro${src.volumesEdited ? ', then edited in Prospect Risking' : ''}` : src.volumesFrom === 'entered' ? 'Entered in Prospect Risking' : 'Not stated by the record'],
    ['Source project and reservoir', src.projectName || src.reservoirName ? [src.projectName && `Project "${src.projectName}"`, src.reservoirName && `reservoir "${src.reservoirName}"`].filter(Boolean).join(', ') : EMPTY_VALUE],
    ['Monte Carlo run', src.run?.ranAt ? `${time(src.run.ranAt)}${finite(src.run.seed) ? `, seed ${src.run.seed}` : ''}${finite(src.run.iterations) ? `, ${thousands(src.run.iterations)} realizations` : ''}${src.run.grvMode ? `, ${src.run.grvMode === 'structural' ? 'GRV from the surface against sampled contacts' : 'area x thickness'}` : ''}` : EMPTY_VALUE],
    ['Volumetric method and fluid', src.method || src.fluidType ? [src.method, src.fluidType && (src.fluidType === 'oil_gas' ? 'oil with a gas cap' : src.fluidType)].filter(Boolean).join(', ') : EMPTY_VALUE],
    // RL7: the basis of a value per barrel that ReservoirCalc Pro sent
    ...(h.economics ? [['Economics sent with the prospect', economicsLine(h.economics)]] : []),
    ['Edited here after the handoff', edited.length ? edited.map((k) => `${SHORT_LABEL[k]} (sent ${F.plain(k === 'pg' ? Number(h.values[k]) : units.show(k, Number(h.values[k])))})`).join('; ') : 'Nothing: every handed-over input is as received'],
    ['Source record now', upstream?.state === 'current' ? 'Unchanged since it was received' : (upstreamSentence(upstream, units) || EMPTY_VALUE)],
  ];
  return rows;
}

const ECON_WORDS = { price: ['price', '$/boe'], discount: ['discount rate', '%'], life: ['producing life', 'years'], decline: ['decline', '%/yr'], capex: ['development', '$MM'], opexPerBoe: ['opex', '$/boe'], opexFixed: ['fixed opex', '$MM/yr'], royalty: ['royalty', '%'], tax: ['tax', '%'] };
/** "calculateEconomics (...): price 70 $/boe, discount rate 10 %, ..." from the economics block a prospect carries. */
export function economicsLine(econ) {
  const a = econ?.assumptions || {};
  const list = Object.entries(ECON_WORDS).filter(([k]) => finite(Number(a[k])) && a[k] !== '' && a[k] !== null).map(([k, [w, u]]) => `${w} ${F.plain(Number(a[k]))} ${u}`);
  return `${econ?.engine || 'Engine not stated'}${list.length ? `: ${list.join(', ')}` : ''}${finite(Number(econ?.npvMM)) ? `. Success-case NPV ${F.n1(Number(econ.npvMM))} $MM` : ''}`;
}

/** The chance of success as the product of its factors (RL2), or the reason it cannot be shown. */
export function chanceModel(p) {
  const pg = numOrNull(p.pg);
  const f = p.pgFactors;
  if (!f || !FACTOR_KEYS.some((k) => finite(f[k]))) {
    return { rows: null, statement: p.source === 'rcp' ? 'The source record carries only the total chance of success; no chance factors were handed over.' : 'Entered as a total: this prospect was typed with its chance of success and no chance factors.', product: null, closes: null };
  }
  const used = FACTOR_KEYS.filter((k) => finite(f[k]));
  const product = used.reduce((a, k) => a * f[k], 1);
  const closes = pg !== null && Math.abs(product - pg) < 5e-7;
  const rows = used.map((k) => [FACTOR_LABEL[k], F.frac(f[k]), F.pct(f[k])]);
  rows.push(['Product of the factors', F.frac(product), F.pct(product)]);
  rows.push(['Pg used in the valuation', pg === null ? EMPTY_VALUE : F.frac(pg), pg === null ? EMPTY_VALUE : F.pct(pg)]);
  return {
    rows, product, closes, used,
    note: closes
      ? `Pg = ${used.map((k) => FACTOR_LABEL[k].toLowerCase()).join(' x ')} = ${used.map((k) => F.frac(f[k])).join(' x ')} = ${F.frac(product)}. The factors are treated as independent.`
      : `The Pg used (${pg === null ? EMPTY_VALUE : F.frac(pg)}) is not the product of the factors (${F.frac(product)}): it was entered as a total after the handoff. The factors are printed as received.`,
  };
}

/**
 * The whole report as rows and figure specs.
 * @param {{p: object, v: ?object, problem?: ?string, units: object, upstream?: ?object,
 *   portfolio?: ?{rows: Array<{p, v}>, totals: object, leftOut: number}, savedWhere?: string,
 *   build?: string, company?: ?string}} a
 */
export function buildRrvReportModel({ p, v, problem = null, units, upstream = null, epe = null, portfolio = null, savedWhere = '', build = '', company = null }) {
  const e = engineInput(p);
  const ident = p.ident || {};
  const identification = [
    ['Company', (ident.company || '').trim() || company || ''],
    ['Prospect', p.name],
    ['Licence or block', ident.licence],
    ['Play', ident.play],
    ['Analyst', ident.analyst],
    ['Analysis type', 'Risked prospect valuation, closed form'],
    ['Volumes from', handoffLine(p)],
    ['Volume basis', p.source === 'rcp' ? (p.basis === 'recoverable' ? 'Recoverable, success case' : p.basis === 'in-place' ? 'In place (not recoverable)' : 'Not stated by the source') : 'Recoverable, success case, as typed'],
    ['Valuation saved', savedWhere],
    ['Build', build],
  ];
  const displayUnits = `${units.metric ? 'SI / metric' : 'Oilfield'} (${units.volumeLabel}, ${units.unitValueLabel}, $MM); gas at ${BOE_BASIS}`;
  const inputs = inputRows(p, units);
  const model = {
    title: REPORT_TITLE, appName: REPORT_APP, footer: `${REPORT_TITLE}, ${p.name}`,
    identification, displayUnits, e,
    inputs: {
      rows: inputs,
      note: 'Every input the valuation read is listed with its unit and its source. Rows marked "Recorded for the reader" or "Enters through Pg" did not enter the calculation directly. The lognormal success case is fitted to P90 and P10; the P50 enters only the Swanson cross-check. A derived input is computed here from the rows it names.',
    },
    handoff: handoffRows(p, upstream, units),
    epeHandoff: epeHandoffRows(p, epe, units),
    chance: chanceModel(p),
    problem,
  };
  if (!v) return { ...model, valued: false };

  const vol = (x) => (finite(x) ? units.volume(x) : null);
  const parts = emvParts(e);
  const out = outcomes(e, v);
  const table = volumeTable(e, v);
  model.valued = true;
  model.parts = parts;
  model.outcomesRaw = out;
  model.headline = {
    head: ['Quantity', 'Value', 'Unit', 'Basis'],
    body: [
      ['Chance of geological success Pg', F.pct(v.pg), '', 'Chance of a discovery of any size'],
      ['Commercial chance Pc', F.pct(v.pc), '', `Pg x chance of at least the MEFS (${F.pct(v.pCommercialGivenSuccess)})`],
      ['Unrisked mean volume', F.n1(vol(v.successCase.mean)), units.volumeLabel, 'Success case: given a discovery'],
      ['Risked mean volume', F.n1(vol(v.riskedMean)), units.volumeLabel, 'Pg x unrisked mean, the dry hole averaged in'],
      ['Unrisked value if commercial', F.n1(v.npvIfCommercial), '$MM', 'Mean commercial discovery, before the exploration well'],
      ['Expected monetary value EMV', F.n1(v.emv), '$MM', 'Risked, after the exploration well'],
      ['Break-even Pg', v.breakEvenPg != null ? F.pct(v.breakEvenPg) : 'not reachable', '', 'The Pg at which the EMV is zero'],
    ],
    note: `Volumes are ${p.source === 'rcp' && p.basis !== 'recoverable' ? 'AS RECEIVED, and their basis is not recoverable' : 'recoverable'} and oil equivalent. ${PERCENTILE_CONVENTION}.`,
  };
  model.volumes = {
    head: ['Case', `Entered (${units.volumeLabel})`, `Unrisked, fitted lognormal (${units.volumeLabel})`, `Risked (${units.volumeLabel})`],
    body: table.map((r) => [
      r.key === 'mean' ? 'Mean' : `${r.key.toUpperCase()} (exceeded with ${Math.round(r.exceed * 100)}%)`,
      r.key === 'mean' ? EMPTY_VALUE : (finite(r.entered) ? F.n1(vol(r.entered)) : EMPTY_VALUE),
      F.n1(vol(r.fitted)), F.n1(vol(r.risked)),
    ]).concat([
      ['Swanson mean (cross-check)', v.successCase.swansonMean != null ? F.n1(vol(v.successCase.swansonMean)) : EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE],
      ['Mean if commercial (at least the MEFS)', EMPTY_VALUE, v.meanIfCommercial != null ? F.n1(vol(v.meanIfCommercial)) : EMPTY_VALUE, EMPTY_VALUE],
    ]),
    note: `Unrisked volumes are the success case, the lognormal through the entered P90 and P10. Risked percentiles are read from the risked expectation curve: the volume exceeded with that probability over all outcomes, the dry hole included, so a risked percentile is zero whenever Pg (${F.pct(v.pg)}) is at or below its probability. Risked mean = Pg x unrisked mean = ${F.frac(v.pg)} x ${F.n1(vol(v.successCase.mean))} = ${F.n1(vol(v.riskedMean))} ${units.volumeLabel}. Swanson mean = 0.3 P90 + 0.4 P50 + 0.3 P10 on the entered values.`,
  };
  model.value = {
    head: ['Term', 'Value ($MM)', 'How'],
    body: [
      ['Chance-weighted value of the barrels', F.n1(parts.revenue), `Pg x u x E(V; V >= MEFS) = ${F.frac(v.pg)} x ${F.plain(units.unitValue(e.unitValue))} ${units.unitValueLabel} x ${F.n1(units.volume(parts.partialMean))} ${units.volumeLabel}`],
      ['Chance-weighted development cost', F.n1(-parts.development), `Pg x D x P(V >= MEFS) = ${F.frac(v.pg)} x ${F.plain(e.devCost)} x ${F.frac(parts.pCommercialGivenSuccess)}`],
      ['Exploration well', F.n1(-parts.well), 'W, spent in every outcome'],
      ['Expected monetary value EMV', F.n1(v.emv), 'The sum of the three terms'],
    ],
    note: `${EMV_FORMULA}, with u the value per barrel, V the success-case volume, D the development cost and W the exploration well cost. E(V; V >= MEFS) is the part of the mean volume that lies at or above the MEFS (${F.n1(units.volume(parts.partialMean))} ${units.volumeLabel} of ${F.n1(units.volume(v.successCase.mean))}).`,
  };
  model.outcomes = {
    head: ['Outcome', 'Chance', `Mean volume (${units.volumeLabel})`, 'Value ($MM)', 'Chance x value ($MM)'],
    body: out.rows.map((r) => [r.label, F.pct(r.chance), r.volume === null ? 'below the MEFS' : F.n1(vol(r.volume)), r.value === null ? EMPTY_VALUE : F.n1(r.value), r.value === null ? EMPTY_VALUE : F.n1(r.chance * r.value)])
      .concat([['All outcomes', F.pct(out.chance), F.n1(vol(v.riskedMean)), EMPTY_VALUE, F.n1(out.expected)]]),
    note: 'The risked value split into chance and unrisked value. The chances sum to 100% and the chance-weighted values to the EMV. A discovery below the MEFS is not developed, so it costs the well.',
  };
  model.economics = economicsModel(p, e, v, units);
  model.sensitivity = sensitivityModel(p, e, units);
  if (portfolio && portfolio.rows.length > 1) {
    model.portfolio = {
      head: ['Prospect', 'Pg', 'Pc', `Risked mean (${units.volumeLabel})`, 'EMV ($MM)'],
      body: portfolio.rows.map((r) => [r.p.name, F.pct(r.v.pg), F.pct(r.v.pc), F.n1(vol(r.v.riskedMean)), F.n1(r.v.emv)])
        .concat([[`Sum of ${portfolio.totals.count} prospects`, EMPTY_VALUE, EMPTY_VALUE, F.n1(vol(portfolio.totals.riskedMean)), F.n1(portfolio.totals.emv)]]),
      note: `For context: the analyst's other valued prospects, added as INDEPENDENT prospects (expected commercial discoveries ${F.n2(portfolio.totals.expectedCommercial)}, chance of at least one ${F.pct(portfolio.totals.pAtLeastOneCommercial)}). Shared play risk and dependence between prospects are not modelled${portfolio.leftOut ? `; ${portfolio.leftOut} prospect${portfolio.leftOut === 1 ? '' : 's'} with unfinished inputs left out` : ''}.`,
    };
  }
  model.limits = limitsOf({ p, v, e, parts, units, upstream, epe });
  model.figures = buildFigures({ p, v, e, units, chance: model.chance, economics: model.economics, sensitivity: model.sensitivity });
  return model;
}

/** "Limits of this analysis" (RL9): what the method assumes, then what to check on this prospect. */
export function limitsOf({ p, v, e, units, upstream, epe = null }) {
  const assumptions = [
    'Single prospect. Each prospect is valued on its own; dependence between prospects, shared play risk and a drilling sequence are not modelled, and the portfolio totals add prospects as if independent.',
    'The chance factors are treated as independent and multiplied. No play chance is separated from the prospect chance.',
    'Success-case volumes follow a lognormal fitted to the entered P90 and P10. The P50 does not shape the distribution.',
    `The value of a discovery is deterministic and a straight line in its size, ${LINE_FORMULA}, with no price, cost, fiscal or timing uncertainty.${p.econ?.value === 'model' ? ' The line is read from the economic model between the MEFS and the mean commercial size; the table "Value by field size" shows where the model departs from it.' : p.econ?.value === 'epe' ? ` The value per barrel and development cost come from one Petroleum Economics Studio case (${epeDiscountLine(p.econ.epe)}): its capex is taken as fixed and the rest of the case as proportional to volume, which is exact only at the case's own size.` : ' One value per barrel and one development cost serve every commercial size.'}`,
    p.econ?.mefs === 'derived'
      ? 'The MEFS is derived: the size at which a discovery is worth zero under the stated value. A discovery below it is not developed.'
      : 'The MEFS is typed and is not tied to the value per barrel and the development cost; the size that pays under them is printed beside it. A discovery below it is not developed.',
    ...(p.econ?.value === 'model' ? ['The economic model is a screening model: one flat price, one exponential decline, royalty and tax, and the development capex in the year before first production. That capex earns no tax relief (the canonical screening case expenses it in a year with no income), so the derived MEFS is on the cautious side.'] : []),
    `Volumes are oil equivalent; gas handed over in gas units is converted at ${BOE_BASIS}.`,
    'The sensitivity moves one input at a time over a range the analyst states. It shows which input matters most; it is not a probability range, and inputs that move together in practice (volumes and development cost, price and value per barrel) are not moved together.',
    'A screening valuation for ranking and for a drill decision in principle. It is not a reserves estimate and not a development economics model.',
  ];
  const flags = [];
  if (p.source === 'rcp' && p.basis !== 'recoverable') {
    flags.push(p.basis === 'in-place' ? 'The volumes are IN PLACE (STOIIP or GIIP). A valuation needs recoverable volumes: every value on these pages is overstated by the recovery factor.' : 'The source record does not say whether its volumes are recoverable or in place. Check before using these values.');
  }
  const enteredP50 = numOrNull(p.p50);
  if (enteredP50 !== null && v.successCase.fittedP50 > 0) {
    const d = (enteredP50 - v.successCase.fittedP50) / v.successCase.fittedP50;
    if (Math.abs(d) > 0.1) flags.push(`The entered P50 (${F.n1(units.volume(enteredP50))} ${units.volumeLabel}) differs from the P50 of the fitted lognormal (${F.n1(units.volume(v.successCase.fittedP50))}) by ${(d * 100).toFixed(0)}%: the success case is not close to lognormal, and the mean and the commercial chance rest on the fit.`);
  }
  const atMefs = e.unitValue * e.mefs - e.devCost;
  if (e.mefs > 0 && atMefs < -1e-6) flags.push(`A discovery of exactly the MEFS (${F.plain(units.volume(e.mefs))} ${units.volumeLabel}) is worth ${F.n1(atMefs)} $MM with this value per barrel and development cost: the MEFS is below the size that pays for the development.`);
  if (e.mefs === 0 && e.devCost > 0) flags.push('The MEFS is zero, so every discovery is developed, including those too small to pay for the development cost.');
  const defaults = ECON_KEYS.filter((k) => !p.touched?.[k] && numOrNull(p[k]) === DEFAULT_ECONOMICS[k] && numOrNull(p.handoff?.values?.[k]) === null && !p.inputMeta?.[k]?.source);
  if (defaults.length) flags.push(`${cap(defaults.map((k) => SHORT_LABEL[k]).join(', '))}: ${defaults.length === 1 ? 'a starting default that was' : 'starting defaults that were'} never changed on this screen. Replace ${defaults.length === 1 ? 'it' : 'them'} with the prospect's own figures.`);
  if (p.econ?.value === 'model') {
    const untouched = ECON_MODEL_FIELDS.filter(([k]) => !p.econ.modelTouched?.[k] && numOrNull(p.econ.model?.[k]) === ECON_MODEL_DEFAULTS[k]);
    if (untouched.length && !p.inputMeta?.econModel?.source) {
      flags.push(untouched.length === ECON_MODEL_FIELDS.length
        ? 'The economic model is the starting screening default, never changed on this screen. Replace it with assumptions for this prospect, or state its source.'
        : `${untouched.length} of the ${ECON_MODEL_FIELDS.length} assumptions of the economic model are starting defaults (${untouched.map(([, l]) => l.toLowerCase()).join(', ')}). Check them for this prospect, or state the source of the model.`);
    }
    const r = resolveEconomics(p);
    if (r.line && finite(v.npvIfCommercial)) {
      const gap = emvOnCurve(e, p.econ.model) - v.emv;
      if (Math.abs(gap) > Math.max(1, 0.05 * Math.abs(v.emv + e.wellCost))) flags.push(`The straight value line departs from the economic model: the EMV with the value-by-size curve integrated differs by ${F.n1(gap)} $MM. Read the table "Value by field size".`);
    }
  }
  if (p.econ?.epe) {
    const say = epe && epe.state !== 'current' && epe.state !== 'none' ? epeSentence(epe, units) : null;
    if (say && p.econ.value === 'epe') flags.push(`${say}${epe.state === 'changed' ? ' Refresh the case on the Economics tab before signing.' : ''}`);
    if (p.econ.value === 'epe' && !p.econ.epe.split) flags.push('The Petroleum Economics Studio run carries no present value of capex, so every field size is valued at its full-cycle NPV per barrel and the derived MEFS is zero. Type an MEFS, or re-run the case on a current engine.');
    if (p.econ.value !== 'epe') flags.push(`A Petroleum Economics Studio case was received (${epeLine(p.econ.epe)}) and is no longer the value in use: the value per barrel or the development cost was changed here.`);
  }
  const ch = chanceModel(p);
  if (ch.rows && ch.closes === false) flags.push(`The Pg used (${F.frac(Number(p.pg))}) is not the product of the chance factors (${F.frac(ch.product)}).`);
  const edited = editedKeys(p);
  if (edited.length) flags.push(`Edited after the handoff from ReservoirCalc Pro: ${edited.map((k) => SHORT_LABEL[k]).join(', ')}. The values printed are the edited ones.`);
  const up = upstream && upstream.state !== 'current' && upstream.state !== 'own' ? upstreamSentence(upstream, units) : null;
  if (up) flags.push(`${up}${upstream.state === 'changed' || upstream.state === 'replaced' ? ' Refresh the prospect before signing.' : ''}`);
  return { assumptions, flags, noFlagsText: 'No input on this prospect raises a flag.' };
}

/** The figures of the report, as Report Kit figure specs. The screen chart draws the same series. */
export function buildFigures({ p, v, e, units, chance, economics = null, sensitivity = null }) {
  const curves = volumeCurves(e);
  const conv = (pts) => pts.map(([x, y]) => [units.volume(x), y]);
  const lines = [];
  if (e.mefs > 0) lines.push({ x: units.volume(e.mefs), label: 'MEFS', rgb: SERIES_RGB.red, row: 1 });
  for (const k of ['p90', 'p50', 'p10']) if (finite(v.successCase[k])) lines.push({ x: units.volume(v.successCase[k]), label: k.toUpperCase(), dash: [1, 1] });
  const figures = [{
    id: 'volume',
    title: 'Expectation curve of volume',
    caption: `Chance of finding at least a given recoverable volume. Unrisked: the success case, given a discovery. Risked: Pg (${F.pct(v.pg)}) times the unrisked curve, so it starts at Pg. The curve crosses the MEFS at the commercial chance, ${F.pct(v.pc)} risked and ${F.pct(v.pCommercialGivenSuccess)} unrisked. P90, P50 and P10 mark the entered success-case volumes.`,
    panels: [{
      height: 78,
      spec: {
        xTitle: `Volume (${units.volumeLabel}, log scale)`, yTitle: 'Chance of at least this volume (%)', xLog: true, yInclude: [0, 100], lines,
        series: [
          { name: 'Unrisked (success case)', pts: conv(curves.success), rgb: SERIES_RGB.slate, dash: [1.5, 1] },
          { name: `Risked (x Pg ${F.pct(v.pg)})`, pts: conv(curves.risked), rgb: SERIES_RGB.blue, width: 0.6 },
        ],
        notes: [`Unrisked mean ${F.n1(units.volume(v.successCase.mean))}, risked mean ${F.n1(units.volume(v.riskedMean))} ${units.volumeLabel}`],
      },
    }],
  }];
  const vc = valueCurves(e);
  if (vc) {
    figures.push({
      id: 'value',
      title: 'Expectation curve of value',
      caption: `Chance that the outcome of the well is worth at least a given value, after the exploration well. A dry hole or a discovery below the MEFS is worth minus the well cost (${F.n1(-e.wellCost)} $MM), which is the step on the left. Risked: over all outcomes; unrisked: given a discovery. The mean of the risked curve is the EMV, ${F.n1(v.emv)} $MM.`,
      panels: [{
        height: 78,
        spec: {
          xTitle: 'Value of the outcome ($MM)', yTitle: 'Chance of at least this value (%)', yInclude: [0, 100],
          lines: [{ x: 0, label: 'Zero', dash: [1, 1] }, { x: v.emv, label: 'EMV', rgb: SERIES_RGB.emerald, row: 1 }],
          series: [
            { name: 'Unrisked (given a discovery)', pts: vc.success, rgb: SERIES_RGB.slate, dash: [1.5, 1] },
            { name: 'Risked (all outcomes)', pts: vc.risked, rgb: SERIES_RGB.blue, width: 0.6 },
          ],
          notes: [`EMV ${F.n1(v.emv)} $MM; chance of a positive outcome ${F.pct(valueExceedance(e, 0))}`],
        },
      }],
    });
  } else {
    figures.push({ id: 'value', title: 'Expectation curve of value', statement: 'Not plotted: the value per barrel is zero, so every commercial outcome has the same value and there is no curve to draw.' });
  }
  if (economics) {
    const cx = (pts) => pts.map(([x, y]) => [units.volume(x), y]);
    const marks = [{ x: units.volume(e.mefs), label: 'MEFS', rgb: SERIES_RGB.red, row: 1 }];
    for (const k of ['p90', 'p50', 'p10']) if (finite(v.successCase[k]) && v.successCase[k] <= economics.hi) marks.push({ x: units.volume(v.successCase[k]), label: k.toUpperCase(), dash: [1, 1] });
    if (finite(economics.caseSize) && economics.caseSize <= economics.hi) marks.push({ x: units.volume(economics.caseSize), label: 'Case', rgb: SERIES_RGB.emerald, row: 2 });
    figures.push({
      id: 'valueSize',
      title: 'Value of a discovery against its size',
      caption: economics.onModel
        ? `The net present value of developing a discovery of a given size, before the exploration well. Engine: the canonical screening NPV under the economic model, size by size. Line: ${LINE_FORMULA}, which the valuation reads. They meet at the MEFS (${F.plain(units.volume(e.mefs))} ${units.volumeLabel}), where the value is zero${p.econ?.mefs === 'derived' ? '' : ' on the engine curve only if the typed MEFS is the size that pays'}, and at the mean commercial size.`
        : `The value of developing a discovery of a given size, before the exploration well: the straight line ${LINE_FORMULA} with ${p.econ?.value === 'epe' ? 'the value per barrel and development cost of the Petroleum Economics Studio case' : 'the stated value per barrel and development cost'}. The MEFS is marked at ${F.plain(units.volume(e.mefs))} ${units.volumeLabel}${p.econ?.mefs === 'derived' ? ', where the line is zero' : ''}.`,
      panels: [{
        height: 72,
        spec: {
          xTitle: `Size of the discovery (${units.volumeLabel})`, yTitle: 'Value of the discovery ($MM)', yInclude: [0],
          lines: [...marks, { y: 0, label: 'Zero', dash: [1, 1] }],
          series: [
            ...(economics.series.curve ? [{ name: 'Engine NPV by size (economic model)', pts: cx(economics.series.curve), rgb: SERIES_RGB.slate, dash: [1.5, 1] }] : []),
            { name: `Value line (${F.plain(units.unitValue(e.unitValue))} ${units.unitValueLabel} x V - ${F.plain(e.devCost)} $MM)`, pts: cx(economics.series.line), rgb: SERIES_RGB.blue, width: 0.6 },
          ],
        },
      }],
    });
  }
  if (chance.rows) {
    const f = p.pgFactors;
    const used = chance.used;
    const cats = [...used.map((k) => FACTOR_LABEL[k]), 'Pg used', 'Commercial chance Pc'];
    const vals = [...used.map((k) => f[k] * 100), v.pg * 100, v.pc * 100];
    figures.push({
      id: 'chance',
      title: 'Chance factors and the chance of success',
      caption: `The chance factors as received, the chance of geological success used in the valuation (${chance.closes ? 'their product' : 'entered as a total, which is not their product'}) and the commercial chance, Pg times the chance of at least the MEFS.`,
      panels: [{
        kind: 'bars', height: 62,
        spec: {
          yTitle: 'Chance (%)', categories: cats, yInclude: [100], valueText: (x) => `${x.toFixed(1)}%`,
          series: [{ name: 'Chance', values: vals, rgb: SERIES_RGB.slate, rgbs: [...used.map(() => null), SERIES_RGB.blue, SERIES_RGB.emerald] }],
        },
      }],
    });
  } else {
    figures.push({ id: 'chance', title: 'Chance factors and the chance of success', statement: `Not plotted: ${chance.statement.charAt(0).toLowerCase()}${chance.statement.slice(1)}` });
  }
  if (sensitivity && sensitivity.rows.length) {
    const top = sensitivity.rows[0];
    figures.push({
      id: 'sensitivity',
      title: 'Sensitivity of the EMV',
      caption: `Change in the EMV when one input is moved to its low and its high case and the others are held, largest swing first (base EMV ${F.n1(sensitivity.base)} $MM). Ranges: ${sensitivity.ranges}. ${top.label} moves the EMV most: ${F.n1(top.low.emv)} to ${F.n1(top.high.emv)} $MM. The numbers are in the table "Sensitivity of the EMV".`,
      panels: [{
        kind: 'bars', height: 74,
        spec: {
          yTitle: 'Change in EMV ($MM)', categories: sensitivity.categories, valueText: (x) => signed(x),
          lines: [{ y: 0 }],
          series: [
            { name: 'Low case', values: sensitivity.lowDelta, rgb: SERIES_RGB.slate },
            { name: 'High case', values: sensitivity.highDelta, rgb: SERIES_RGB.blue },
          ],
        },
      }],
    });
  } else {
    figures.push({ id: 'sensitivity', title: 'Sensitivity of the EMV', statement: 'Not plotted: no input of this prospect could be moved.' });
  }
  return figures;
}
