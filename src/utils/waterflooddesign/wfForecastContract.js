// Waterflood Design Studio as a sender: the `wf-forecast-1` contract
// (WF-U2-001, RL11). The pattern is `dca-forecast-1`
// (src/utils/declineCurve/dcaForecastContract.js): read by id from the saved
// project by the receiver, nothing typed again, a fingerprint for "source
// changed since".
//
// Before this, the pattern forecast reached economics only through the
// annual CSV for NPV Scenario Builder, typed or uploaded by hand, with no
// basis and no source.
//
// The contract (oil and water at stock-tank conditions, injection in
// reservoir barrels):
//   schema, app, table          'wf-forecast-1', 'Waterflood Design Studio', 'saved_waterflood_design_projects'
//   projectId, projectName, projectSavedAt
//   source                      { kind: 'pattern', pattern, field, reservoir, licence, company, injectors, producers }
//   units                       { rate, volume, injectionRate, injectionVolume, time, note }
//   basis                       { start, stepDays, daysPerYear, Bo, Bw, fvf, rates }
//   model                       { displacement, pattern, arealSweep: { correlation, source, mobilityBasis,
//                                 M, M_endpoint, M_craig, EAbt, growth }, EV, Sgi, worLimit, maxYears }
//   inputs                      the pattern inputs the forecast ran on (oilfield units)
//   sources                     { kr: null | { app, recordId, recordName, at, sourceText, edited: [] },
//                                 pvt: null | { app, recordId, recordName, at, pressurePsia, edited: [] } }
//   forecast                    { start, end, endReason, elapsedDays, breakthroughDays, Np, Wp, Wi, ER,
//                                 steps: [{ t_days, qo, qw, iw, Np }], annual: [{ year, oil, water, injection, days }] }
//   sentBuild                   the Suite build that sent it (not in the fingerprint)
//   fingerprint                 changes when anything the forecast says changes
// A forecast that cannot be sent (no valid inputs, no start date) is refused
// with the reason.
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { DAYS_PER_YEAR } from '@/lib/units/registry';
import { migrateWaterfloodPayload, MOBILITY_BASES } from './model';
import { deriveWaterfloodState } from './workspace';
import { wfPvtCurrent } from './pvtIntake';
import { SCAL_INTAKE_FIELDS } from '@/components/waterflooddesign/scalKrIntake';
import { patternLabel, arealSweepCorrelationText } from './patterns';

export const WF_FORECAST_SCHEMA = 'wf-forecast-1';
export const WF_APP = 'Waterflood Design Studio';
export const WF_TABLE = 'saved_waterflood_design_projects';

const DAY = 86400000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD date that exists, or null. */
export function floodStartOf(payload) {
  const s = String(payload?.floodStart || '').trim();
  if (!ISO_DATE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null;
}

/**
 * Calendar-year volumes of a step forecast whose rates are constant inside
 * each step (t_{i-1}, t_i] days after the start. Each step is split at the
 * year boundaries, so the years sum to the forecast exactly.
 * @param {Array<{t_days: number, qo: number, qw: number, iw: number}>} steps
 * @param {string} start YYYY-MM-DD
 */
export function annualFromSteps(steps, start) {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const by = new Map();
  let prev = 0;
  for (const s of steps || []) {
    let a = t0 + prev * DAY;
    const b = t0 + s.t_days * DAY;
    while (a < b - 1e-6) {
      const y = new Date(a).getUTCFullYear();
      const yEnd = Date.UTC(y + 1, 0, 1);
      const segEnd = Math.min(b, yEnd);
      const days = (segEnd - a) / DAY;
      const cur = by.get(y) || { year: y, oil: 0, water: 0, injection: 0, days: 0 };
      cur.oil += s.qo * days;
      cur.water += s.qw * days;
      cur.injection += s.iw * days;
      cur.days += days;
      by.set(y, cur);
      a = segEnd;
    }
    prev = s.t_days;
  }
  return [...by.values()].sort((x, y) => x.year - y.year);
}

/** FNV-1a over what the forecast says (never over who sent it or when). */
export function wfForecastFingerprint(c) {
  return fingerprint({
    projectId: c.projectId, source: c.source, basis: c.basis, model: c.model, inputs: c.inputs,
    sources: c.sources, forecast: c.forecast,
  });
}

// the kr values only: the viscosities that rode with the old handoff belong
// to the PVT intake (pvt-1) when there is one
const KR_KEYS = new Set(['Swc', 'Sor', 'krwMax', 'kroMax', 'nw', 'no']);
const editedKr = (intake, d) => {
  if (!intake?.values) return [];
  return SCAL_INTAKE_FIELDS.filter((f) => KR_KEYS.has(f.key) && intake.values[f.key] != null && d?.[f.key] != null && String(d[f.key]) !== '' && Number(d[f.key]) !== Number(intake.values[f.key])).map((f) => f.label);
};
const editedPvt = (intake, current) => {
  if (!intake?.values) return [];
  return Object.keys(intake.values).filter((k) => current[k] != null && String(current[k]) !== '' && Number(current[k]) !== Number(intake.values[k]));
};

/**
 * The contract for the pattern forecast of a saved project.
 * @param {{projectId: string, projectName?: string, projectSavedAt?: string, payload: object, build?: string}} a
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildWfForecastContract({ projectId, projectName = null, projectSavedAt = null, payload, build = null }, builders) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'The project has no saved inputs.' };
  const data = migrateWaterfloodPayload(payload);
  const start = floodStartOf(data);
  if (!start) return { ok: false, reason: 'Set the flood start date on the Pattern tab and save: the receiver places the forecast on the calendar from it.' };
  const st = deriveWaterfloodState(data, builders);
  if (!st.displacementSpec?.spec) return { ok: false, reason: `The displacement inputs are not valid: ${st.displacementSpec?.error || 'fix the Displacement tab'}.` };
  const pr = st.patternResult;
  if (!pr?.summary || !pr.series?.length) return { ok: false, reason: `No pattern forecast: ${(pr?.warnings || ['fix the Pattern tab inputs'])[0]}` };
  const p = builders.buildPatternInputs(data.patternInputs);
  const s = pr.summary;
  const steps = pr.series.map((r) => ({ t_days: r.t_days, qo: r.qo_stbd, qw: r.qw_stbd, iw: r.Wi_bbl > 0 ? p.iw_bpd : 0, Np: r.Np_stb, EA: r.EA }));
  const annual = annualFromSteps(steps, start);
  let Wp = 0;
  let prevT = 0;
  for (const r of steps) { Wp += r.qw * (r.t_days - prevT); prevT = r.t_days; }
  const last = steps[steps.length - 1];
  const ident = data.identification || {};
  const kr = data.displacementInputs?.krIntake || null;
  const pvt = data.pvtIntake || null;
  const contract = {
    schema: WF_FORECAST_SCHEMA,
    app: WF_APP,
    table: WF_TABLE,
    projectId,
    projectName,
    projectSavedAt,
    source: {
      kind: 'pattern',
      pattern: ident.pattern || null, field: ident.field || null, reservoir: ident.reservoir || null, licence: ident.licence || null,
      company: ident.company || null, injectors: ident.injectors || null, producers: ident.producers || null,
    },
    units: {
      rate: 'STB/d', volume: 'STB', injectionRate: 'RB/d', injectionVolume: 'RB', time: 'day',
      note: 'Oil and water at stock-tank conditions (through Bo and Bw of the pattern); injection in reservoir barrels. Each rate is the step average, constant inside the step.',
    },
    basis: {
      start,
      stepDays: steps.length > 1 ? steps[1].t_days - steps[0].t_days : steps[0].t_days,
      daysPerYear: DAYS_PER_YEAR,
      Bo: p.Bo,
      Bw: p.Bw,
      fvf: pvt ? `Bo and Bw read at ${Number(pvt.pressure_psia).toPrecision(5).replace(/\.?0+$/, '')} psia (${pvt.pressure_from}) from a Fluid Systems Studio project, one pressure for the whole forecast` : 'Bo and Bw as entered, one value for the whole forecast',
      rates: 'Calendar-day rates at constant injection; production balances injection after fill-up (reservoir barrels).',
    },
    model: {
      displacement: 'Buckley-Leverett with the Welge tangent (1-D displacement inside the swept region)',
      pattern: p.pattern || 'five-spot',
      patternLabel: patternLabel(p.pattern),
      arealSweep: {
        correlation: arealSweepCorrelationText(p.pattern),
        mobilityBasis: s.mobilityBasis,
        mobilityBasisText: MOBILITY_BASES[s.mobilityBasis] || s.mobilityBasis,
        M: s.M, M_endpoint: s.M_endpoint, M_craig: s.M_craig, EAbt: s.EAbt,
      },
      EV: p.EV, Sgi: p.Sgi, worLimit: p.worLimit, maxYears: p.maxYears,
    },
    inputs: {
      area_acres: p.area_acres, h_ft: p.h_ft, phi: p.phi, Bo: p.Bo, Bw: p.Bw, iw_bpd: p.iw_bpd,
      Sgi: p.Sgi, EV: p.EV, worLimit: p.worLimit, maxYears: p.maxYears,
    },
    sources: {
      kr: kr?.from ? {
        app: kr.from.app || 'SCAL Studio', recordId: kr.from.recordId ?? null, recordName: kr.from.recordName ?? null, at: kr.from.at ?? null,
        sourceText: kr.sourceText || null, edited: editedKr(kr, data.displacementInputs),
      } : null,
      pvt: pvt?.from ? {
        app: pvt.from.app || 'Fluid Systems Studio', recordId: pvt.from.recordId ?? null, recordName: pvt.from.recordName ?? null, at: pvt.from.takenAt ?? pvt.from.at ?? null,
        pressurePsia: pvt.pressure_psia ?? null,
        edited: editedPvt(pvt, wfPvtCurrent({ displacementInputs: data.displacementInputs, patternInputs: data.patternInputs, surveillanceConfig: data.surveillance?.config || {} })),
      } : null,
    },
    forecast: {
      start,
      end: new Date(Date.parse(`${start}T00:00:00Z`) + last.t_days * DAY).toISOString().slice(0, 10),
      endReason: s.stopped,
      elapsedDays: last.t_days,
      breakthroughDays: s.breakthrough_days,
      Np: last.Np,
      Wp,
      Wi: last.t_days * p.iw_bpd,
      ER: s.recoverySplit?.ER ?? null,
      steps,
      annual,
    },
    sentBuild: build,
  };
  contract.fingerprint = wfForecastFingerprint(contract);
  return { ok: true, contract };
}

const END_WORDS = { 'wor-limit': 'the WOR limit', 'displacement-exhausted': 'the end of the displacement', horizon: 'the horizon' };
export const wfEndWords = (r) => END_WORDS[r] || r || 'the horizon';

/** "Pattern P-1, five-spot, project "Ekene" (Waterflood Design Studio)": one line. */
export function wfSourceLine(c) {
  if (!c) return 'none';
  const name = c.source?.pattern || 'the pattern';
  return `${name}, ${c.model?.patternLabel || 'five-spot'} forecast from ${c.forecast?.start || 'n/a'}, project "${c.projectName || 'unnamed'}" (Waterflood Design Studio)`;
}

/** The basis in words, for a receiver to print. */
export function wfBasisLine(c) {
  if (!c) return '';
  const a = c.model.arealSweep;
  const kr = c.sources.kr ? `kr from ${c.sources.kr.recordName || c.sources.kr.app}${c.sources.kr.edited.length ? ` (edited after the intake: ${c.sources.kr.edited.join(', ')})` : ''}` : 'kr as entered';
  const pvt = c.sources.pvt ? `PVT from ${c.sources.pvt.recordName || c.sources.pvt.app} at ${c.sources.pvt.pressurePsia} psia${c.sources.pvt.edited.length ? ` (edited after the intake: ${c.sources.pvt.edited.join(', ')})` : ''}` : 'PVT as entered';
  return `${c.model.displacement}; areal sweep ${a.correlation} with M ${Number(a.M.toPrecision(4))} (${a.mobilityBasis === 'craig' ? "Craig's" : 'endpoint'} basis), EA at breakthrough ${(a.EAbt * 100).toFixed(1)} percent; EV ${c.model.EV}; ${kr}; ${pvt}; Bo ${c.basis.Bo} and Bw ${c.basis.Bw} RB/STB; ends at ${wfEndWords(c.forecast.endReason)} on ${c.forecast.end}`;
}

/**
 * Compare a received contract with the one its source would send now.
 * @returns {{state: 'unchanged'|'changed'|'missing'|'refused', text: string, now?: object}}
 */
export function compareWfWithSource(received, now) {
  if (!now) return { state: 'missing', text: 'The source project is no longer there (deleted, or no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The source cannot send this forecast now: ${now.reason}` };
  if (now.contract.fingerprint === received.fingerprint) return { state: 'unchanged', text: 'Unchanged since it was received.' };
  const moved = [];
  if (fingerprint(now.contract.inputs) !== fingerprint(received.inputs)) moved.push('the pattern inputs');
  if (fingerprint(now.contract.model) !== fingerprint(received.model)) moved.push('the sweep model');
  if (fingerprint(now.contract.sources) !== fingerprint(received.sources)) moved.push('the kr or PVT source');
  if (now.contract.forecast.start !== received.forecast.start) moved.push('the flood start');
  if (fingerprint(now.contract.forecast.annual) !== fingerprint(received.forecast.annual)) moved.push('the volumes');
  return { state: 'changed', text: `The source changed since it was received${moved.length ? ` (${moved.join(', ')})` : ''}. Refresh to take the new forecast.`, now: now.contract };
}
