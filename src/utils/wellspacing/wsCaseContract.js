// Well Spacing Optimizer as a sender: the `ws-case-1` contract (WS-U2-004,
// RL11). The pattern is `wf-forecast-1`
// (src/utils/waterflooddesign/wfForecastContract.js): read by id from the
// saved project by the receiver, nothing typed again, a fingerprint for
// "source changed since".
//
// Before this, a spacing case reached economics or the scenario hub only by
// typing its numbers again.
//
// What is sent is the FIELD oil (and solution gas) profile of the one spacing
// case the user chose, from the first production date the user set: every
// well of the case, on the drilling schedule of the case, with the rate limit
// as the case ran it. The volumes are the engine's own exact cumulative
// (wellSpacingCalculations.js fieldProfile), so the steps, the calendar
// years and the economics of the case all sum to the same Np.
//
// The contract (oil at stock-tank conditions, gas at standard conditions):
//   schema, app, table          'ws-case-1', 'Well Spacing Optimizer', 'saved_well_spacing_projects'
//   projectId, projectName, projectSavedAt
//   source                      { kind: 'spacing-case', field, reservoir, licence, company, spacingAcres, wells, layout }
//   units                       { rate, gasRate, volume, gasVolume, time, note }
//   basis                       { start, stepDays, daysPerYear, Bo, boSource, gor, eurPerWellStb, recoveryFactorPct,
//                                 declineEffectivePct, rateLimit, schedule }
//   model                       { recovery, economics, npvUsdMM, npvConvention }
//   inputs                      the form the case ran on (oilfield units, strings)
//   forecast                    { start, end, elapsedDays, Np, Gp, steps: [{ t_days, qo, qg, Np }],
//                                 annual: [{ year, oil, gas, days }] }
//   sentBuild                   the Suite build that sent it (not in the fingerprint)
//   fingerprint                 changes when anything the case says changes
// A case that cannot be sent (no valid inputs, no first production date, a
// spacing not in the study) is refused with the reason.
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { DAYS_PER_YEAR } from '@/lib/units/registry';
import { validateInputs, runSpacingCases, fieldProfile, rfOf, NPV_CONVENTION_NOTE } from '@/utils/wellSpacingCalculations';
import { inputsFromPayload } from './model';
import { layoutOf } from './drainage';
import { modelText, rateLimitModelText } from './reportModel';

export const WS_CASE_SCHEMA = 'ws-case-1';
export const WS_APP = 'Well Spacing Optimizer';
export const WS_TABLE = 'saved_well_spacing_projects';

const DAY = 86400000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STEPS_PER_YEAR = 12;

/** A YYYY-MM-DD date that exists, or null. */
export function firstProductionOf(sender) {
  const s = String(sender?.start || '').trim();
  if (!ISO_DATE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null;
}

/** FNV-1a over what the case says (never over who sent it or when). */
export function wsCaseFingerprint(c) {
  return fingerprint({ projectId: c.projectId, source: c.source, basis: c.basis, model: c.model, inputs: c.inputs, forecast: c.forecast });
}

/**
 * The field profile of one case as steps of a twelfth of a year (constant
 * rate inside each step, the step's exact volume over its days) and as
 * calendar years from the start date (exact, from the cumulative at each
 * year boundary).
 * @param {(tYears: number) => number} F field cumulative oil, STB
 * @param {number} endYears when the field stops producing
 */
export function wsProfileSteps(F, endYears, { start, gor = 0 }) {
  const steps = [];
  const stepYears = 1 / STEPS_PER_YEAR;
  const n = Math.ceil(endYears / stepYears - 1e-9);
  for (let i = 1; i <= n; i += 1) {
    const a = (i - 1) * stepYears;
    const b = Math.min(i * stepYears, endYears);
    if (!(b > a)) break;
    const dDays = (b - a) * DAYS_PER_YEAR;
    const vol = F(b) - F(a);
    const qo = vol / dDays;
    steps.push({ t_days: b * DAYS_PER_YEAR, qo, qg: (qo * gor) / 1000, Np: F(b) });
  }
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const endMs = t0 + endYears * DAYS_PER_YEAR * DAY;
  const annual = [];
  let a = t0;
  while (a < endMs - 1e-3) {
    const y = new Date(a).getUTCFullYear();
    const b = Math.min(endMs, Date.UTC(y + 1, 0, 1));
    const ta = (a - t0) / DAY / DAYS_PER_YEAR;
    const tb = (b - t0) / DAY / DAYS_PER_YEAR;
    const oil = F(tb) - F(ta);
    annual.push({ year: y, oil, gas: (oil * gor) / 1000, days: (b - a) / DAY });
    a = b;
  }
  return { steps, annual, end: new Date(endMs).toISOString().slice(0, 10) };
}

/**
 * The contract for the chosen case of a saved project.
 * @param {{projectId: string, projectName?: string, projectSavedAt?: string, payload: object, build?: string}} a
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildWsCaseContract({ projectId, projectName = null, projectSavedAt = null, payload, build = null }) {
  const inputs = inputsFromPayload(payload);
  if (!inputs) return { ok: false, reason: 'The project has no saved inputs.' };
  const start = firstProductionOf(inputs.sender);
  const spacing = Number(inputs.sender?.spacing);
  if (!Number.isFinite(spacing) || !(spacing > 0)) return { ok: false, reason: 'Choose the case to send (its spacing) under "Send a case" and save.' };
  if (!start) return { ok: false, reason: 'Set the first production date under "Send a case" and save: the receiver places the profile on the calendar from it.' };
  const v = validateInputs(inputs.form);
  if (!v.ok) return { ok: false, reason: `The inputs are not complete: ${v.errors[0]}` };
  let results;
  try {
    results = runSpacingCases(inputs.form);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  const row = results.spacingResults.find((r) => Math.abs(r.spacing - spacing) < 1e-9);
  if (!row) return { ok: false, reason: `The study has no case at ${spacing} acres a well (the range or the step changed). Choose a case again.` };
  const p = results.parameters;
  const field = fieldProfile(row.spacing, p);
  if (!(field.F(field.endYears) > 0)) return { ok: false, reason: 'The case produces no oil (its deliverable rate is at or below the economic limit rate).' };
  const { steps, annual, end } = wsProfileSteps(field.F, field.endYears, { start, gor: p.gor });
  const ident = inputs.identification || {};
  const L = row.rateLimit;
  const contract = {
    schema: WS_CASE_SCHEMA,
    app: WS_APP,
    table: WS_TABLE,
    projectId,
    projectName,
    projectSavedAt,
    source: {
      kind: 'spacing-case',
      field: ident.field || inputs.form.fieldName || null,
      reservoir: ident.reservoir || null,
      licence: ident.licence || null,
      company: ident.company || null,
      spacingAcres: row.spacing,
      wells: row.numberOfWells,
      layout: layoutOf(inputs.form.wellLayout).key,
    },
    units: {
      rate: 'STB/d', gasRate: 'Mscf/d', volume: 'STB', gasVolume: 'Mscf', time: 'day',
      note: 'Field totals of every well of the case. Oil at stock-tank conditions; gas is the solution gas at the stated GOR. Each rate is the step average over a twelfth of a 365.25-day year, constant inside the step.',
    },
    basis: {
      start,
      stepDays: DAYS_PER_YEAR / STEPS_PER_YEAR,
      daysPerYear: DAYS_PER_YEAR,
      Bo: results.boUsed,
      boSource: results.boSource,
      gor: p.gor,
      eurPerWellStb: row.eurPerWell * 1000,
      recoveryFactorPct: rfOf(row.spacing, p) * 100,
      recoveryModel: p.rfFit ? 'calibrated against spacing' : 'stated',
      declineEffectivePct: p.declineRate * 100,
      rateLimit: {
        on: L.on, computed: L.computed, binding: L.on && L.binding, deliverableStbd: Number.isFinite(row.drainage.pssRateStbd) ? row.drainage.pssRateStbd : null,
        plateauYears: L.on && L.binding ? L.plateauYears : 0,
      },
      schedule: field.cohorts.map((c) => ({ year: c.startYear + 1, wells: c.wells })),
    },
    model: {
      recovery: `${modelText(inputs.form)}. ${rateLimitModelText(L.on)}`,
      economics: 'Suite screening economics engine (calculateEconomics), mid-year discounting',
      npvUsdMM: row.npv,
      npvConvention: NPV_CONVENTION_NOTE,
    },
    inputs: { ...inputs.form },
    forecast: {
      start,
      end,
      elapsedDays: field.endYears * DAYS_PER_YEAR,
      Np: field.F(field.endYears),
      Gp: (field.F(field.endYears) * p.gor) / 1000,
      steps,
      annual,
    },
    sentBuild: build,
  };
  contract.fingerprint = wsCaseFingerprint(contract);
  return { ok: true, contract };
}

/** "Case 80 acres a well (62 wells), project "Ekene spacing" (Well Spacing Optimizer)": one line. */
export function wsSourceLine(c) {
  if (!c) return 'none';
  return `case ${Number(c.source?.spacingAcres)} acres a well (${c.source?.wells} wells${c.source?.field ? `, ${c.source.field}` : ''}) from ${c.forecast?.start || 'n/a'}, project "${c.projectName || 'unnamed'}" (Well Spacing Optimizer)`;
}

/** The basis in words, for a receiver to print. */
export function wsBasisLine(c) {
  if (!c) return '';
  const b = c.basis;
  const rl = b.rateLimit.binding
    ? `rate-limited at ${Number(b.rateLimit.deliverableStbd.toPrecision(4))} STB/d a well for ${b.rateLimit.plateauYears.toFixed(2)} years`
    : (b.rateLimit.on ? 'rate limit on, not binding' : 'rate limit off (unlimited decline)');
  const sched = b.schedule.length > 1 ? `drilled over ${b.schedule.length} years (${b.schedule.map((s) => `${s.wells} in year ${s.year}`).join(', ')})` : 'all wells on stream in year 1';
  return `EUR ${Math.round(b.eurPerWellStb).toLocaleString('en-US')} STB a well at RF ${Number(b.recoveryFactorPct.toPrecision(4))} percent, Bo ${b.Bo.toFixed(4)} RB/STB; exponential decline ${Number(b.declineEffectivePct.toPrecision(4))} percent a year effective; ${rl}; ${sched}; ends ${c.forecast.end}`;
}

/**
 * Compare a received contract with the one its source would send now.
 * @returns {{state: 'unchanged'|'changed'|'missing'|'refused', text: string, now?: object}}
 */
export function compareWsWithSource(received, now) {
  if (!now) return { state: 'missing', text: 'The source project is no longer there (deleted, or no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The source cannot send this case now: ${now.reason}` };
  if (now.contract.fingerprint === received.fingerprint) return { state: 'unchanged', text: 'Unchanged since it was received.' };
  const moved = [];
  if (now.contract.source.spacingAcres !== received.source.spacingAcres) moved.push('the case chosen');
  if (fingerprint(now.contract.inputs) !== fingerprint(received.inputs)) moved.push('the inputs');
  if (now.contract.forecast.start !== received.forecast.start) moved.push('the first production date');
  if (fingerprint(now.contract.forecast.annual) !== fingerprint(received.forecast.annual)) moved.push('the volumes');
  return { state: 'changed', text: `The source changed since it was received${moved.length ? ` (${moved.join(', ')})` : ''}. Refresh to take the new case.`, now: now.contract };
}

export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
export { DAY };
