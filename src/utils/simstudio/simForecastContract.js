// Reservoir Simulation Studio as a sender: the `sim-forecast-1` contract
// (SIM-U2-002, RL11). The pattern is `wf-forecast-1`
// (src/utils/waterflooddesign/wfForecastContract.js): read by id by the
// receiver (the case and one completed run, its summary.json in the owner's
// storage folder), nothing typed again, a fingerprint, and "source changed
// since" when the case gains a newer completed run.
//
// Before this, a run's field profile reached economics only through the
// results CSV, typed or uploaded by hand, with no basis and no source.
//
// The contract (oil and water at stock-tank conditions, gas at standard
// conditions, oilfield units whatever the deck's system):
//   schema, app, table          'sim-forecast-1', 'Reservoir Simulation Studio', 'sim_cases'
//   projectId, projectName      the case
//   run                         { id, finishedAt, deckSha256, opmVersion, workerId, deckSource }
//   phase                       'run' (the whole run) | 'prediction' (from the history end)
//   source                      { kind: 'simulation', caseName, deckSystem, historyEnd }
//   units                       { rate, gasRate, volume, gasVolume, time, note }
//   basis                       { start, daysPerYear, deckSystem, conversion, steps, rates, volumes, stride }
//   forecast                    { start, end, elapsedDays, Np, Wp, Gp, gasReported, waterReported,
//                                 steps: [{ t_days, qo, qw, qg, Np }], annual: [{ year, oil, water, gas, days }] }
//   check                       { FOPT, closure } the simulator's own cumulative against the sum of the steps
//   sentBuild                   the Suite build that read it (not in the fingerprint)
//   fingerprint                 changes when anything the forecast says changes
// A run that cannot be sent (no oil rate in the summary, a thinned series
// with no cumulative to rebuild the volumes from, a deck system the app does
// not convert) is refused with the reason.
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { DAYS_PER_YEAR } from '@/lib/units/registry';
import { vectorView } from './simUnits.js';
import { summaryUnitSystem } from './series.js';

export const SIM_FORECAST_SCHEMA = 'sim-forecast-1';
export const SIM_APP = 'Reservoir Simulation Studio';
export const SIM_TABLE = 'sim_cases';
export const SIM_PHASES = Object.freeze({ run: 'the whole run', prediction: 'the prediction after the history end' });

const DAY = 86400000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const isoOf = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * Calendar-year volumes of a step profile whose rates are constant inside
 * each step (t_{i-1}, t_i] days after the start. Each step is split at the
 * year boundaries, so the years sum to the profile exactly.
 * @param {Array<{t_days: number}>} steps
 * @param {string} start YYYY-MM-DD
 * @param {Array<[string, string]>} keys [rate key in the step, volume key in the year]
 */
export function annualFromRateSteps(steps, start, keys) {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const by = new Map();
  let prev = 0;
  for (const s of steps || []) {
    let a = t0 + prev * DAY;
    const b = t0 + s.t_days * DAY;
    while (a < b - 1e-6) {
      const y = new Date(a).getUTCFullYear();
      const segEnd = Math.min(b, Date.UTC(y + 1, 0, 1));
      const days = (segEnd - a) / DAY;
      const cur = by.get(y) || { year: y, ...Object.fromEntries(keys.map(([, v]) => [v, 0])), days: 0 };
      for (const [r, v] of keys) cur[v] += (finite(s[r]) ? s[r] : 0) * days;
      cur.days += days;
      by.set(y, cur);
      a = segEnd;
    }
    prev = s.t_days;
  }
  return [...by.values()].sort((x, y) => x.year - y.year);
}

/** FNV-1a over what the forecast says (never over who read it or when). */
export function simForecastFingerprint(c) {
  return fingerprint({ projectId: c.projectId, run: c.run, phase: c.phase, source: c.source, basis: c.basis, forecast: c.forecast });
}

/**
 * The steps of a summary in oilfield units: from the rate vectors when the
 * series holds every time step; from the cumulative differences when it was
 * thinned and the cumulative is there (exact at the kept points).
 */
function stepsOf(summary, deckSystem) {
  const days = summary.days || [];
  const stride = Number(summary.steps?.stride) || 1;
  const F = summary.field || {};
  const conv = (key) => vectorView(key, deckSystem, 'oilfield').convert;
  const cum = (key) => (Array.isArray(F[key]) ? F[key].map(conv(key)) : null);
  const rate = (key) => (Array.isArray(F[key]) ? F[key].map(conv(key)) : null);
  const fromCum = (c) => {
    let prevT = 0;
    let prevC = 0;
    return days.map((t, i) => {
      const dt = t - prevT;
      const r = dt > 0 && finite(c[i]) ? (c[i] - prevC) / dt : 0;
      prevT = t;
      if (finite(c[i])) prevC = c[i];
      return r;
    });
  };
  const series = {};
  const how = {};
  for (const [phase, rk, ck] of [['qo', 'FOPR', 'FOPT'], ['qw', 'FWPR', 'FWPT'], ['qg', 'FGPR', 'FGPT']]) {
    const r = rate(rk);
    const c = cum(ck);
    if (stride === 1 && r) { series[phase] = r; how[phase] = `${rk}, every time step`; } else if (c) { series[phase] = fromCum(c); how[phase] = `${ck} differences between the kept points (the series is thinned 1 in ${stride})`; } else { series[phase] = null; how[phase] = r ? `${rk} is thinned 1 in ${stride} and ${ck} is not in the summary` : `${rk} is not in the summary`; }
  }
  return { series, how, stride };
}

/**
 * The contract for one completed run of a case.
 * @param {{caseRow: object, run: object, summary: object, phase?: 'run'|'prediction', historyEnd?: ?string,
 *   deckSystem?: ?string, build?: ?string}} a `historyEnd` the deck's history end (YYYY-MM-DD) when the
 *   deck that ran has a history phase; `deckSystem` the unit keyword read from that deck, when known
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildSimForecastContract({ caseRow, run, summary, phase = 'run', historyEnd = null, deckSystem = null, build = null }) {
  if (!caseRow?.id) return { ok: false, reason: 'The case could not be read.' };
  if (!run?.id || run.status !== 'complete') return { ok: false, reason: 'The run is not complete: only a completed run can be sent.' };
  if (!summary?.days?.length) return { ok: false, reason: 'The run\'s summary holds no time steps.' };
  const us = summaryUnitSystem(summary, deckSystem);
  if (us.system !== 'FIELD' && us.system !== 'METRIC') return { ok: false, reason: `The deck is in ${us.system} units, which this app does not convert.` };
  const start = String(summary.start_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, reason: 'The run\'s summary states no start date.' };
  const { series, how, stride } = stepsOf(summary, us.system);
  if (!series.qo) return { ok: false, reason: `No oil profile: ${how.qo}.` };
  if (phase !== 'run' && phase !== 'prediction') return { ok: false, reason: `Unknown phase "${phase}".` };
  const t0 = Date.parse(`${start}T00:00:00Z`);
  let offset = 0;
  if (phase === 'prediction') {
    if (!historyEnd) return { ok: false, reason: 'The deck that ran has no history phase (or it could not be read), so there is no prediction to send apart from the whole run.' };
    offset = (Date.parse(`${historyEnd}T00:00:00Z`) - t0) / DAY;
    if (!(offset > 0)) return { ok: false, reason: `The history end ${historyEnd} is not after the run start ${start}.` };
  }
  const days = summary.days;
  const steps = [];
  let Np = 0;
  let prevT = 0;
  for (let i = 0; i < days.length; i += 1) {
    const t = days[i];
    if (t > offset + 1e-9) {
      // a step that straddles the history end keeps only its part after it (rates are constant inside a step)
      const from = Math.max(prevT, offset);
      Np += series.qo[i] * (t - from);
      steps.push({ t_days: t - offset, qo: series.qo[i], qw: series.qw ? series.qw[i] : 0, qg: series.qg ? series.qg[i] : 0, Np });
    }
    prevT = t;
  }
  if (!steps.length) return { ok: false, reason: 'The run ends at the history end: there is no prediction after it.' };
  const sendStart = isoOf(t0 + offset * DAY);
  const annual = annualFromRateSteps(steps, sendStart, [['qo', 'oil'], ['qw', 'water'], ['qg', 'gas']]);
  let Wp = 0; let Gp = 0; prevT = 0;
  for (const s of steps) { Wp += s.qw * (s.t_days - prevT); Gp += s.qg * (s.t_days - prevT); prevT = s.t_days; }
  const last = steps[steps.length - 1];
  // the simulator's own cumulative against the sum of the steps (an independent channel inside OPM Flow)
  const fopt = Array.isArray(summary.field?.FOPT) ? vectorView('FOPT', us.system, 'oilfield').convert(summary.field.FOPT[summary.field.FOPT.length - 1]) : null;
  const npRun = phase === 'run' ? Np : null;
  const contract = {
    schema: SIM_FORECAST_SCHEMA,
    app: SIM_APP,
    table: SIM_TABLE,
    projectId: caseRow.id,
    projectName: caseRow.name ?? null,
    run: {
      id: run.id,
      finishedAt: run.finished_at ?? null,
      deckSha256: run.deck_sha256 || summary.deck_sha256 || null,
      opmVersion: run.opm_version || summary.opm_version || null,
      workerId: run.worker_id || summary.run?.worker_id || null,
      deckSource: caseRow.deck_source ?? null,
    },
    phase,
    source: { kind: 'simulation', caseName: caseRow.name ?? null, deckSystem: us.system, historyEnd: historyEnd || null },
    units: {
      rate: 'STB/d', gasRate: 'Mscf/d', volume: 'STB', gasVolume: 'Mscf', time: 'day',
      note: 'Oil and water at stock-tank conditions, gas at standard conditions, field totals. Each rate is the simulator\'s rate over its time step, constant inside the step.',
    },
    basis: {
      start: sendStart,
      daysPerYear: DAYS_PER_YEAR,
      deckSystem: us.system,
      conversion: us.system === 'METRIC' ? 'The deck is METRIC: sm3 converted to STB and Mscf with the Suite unit registry' : 'The deck is FIELD: no conversion',
      steps: { oil: how.qo, water: how.qw, gas: how.qg },
      stride,
      rates: 'Calendar-day field rates of the run as the simulator wrote them at each time step.',
      volumes: 'Each calendar year is the sum of the steps inside it; a step across a year end is split by days.',
    },
    forecast: {
      start: sendStart,
      end: isoOf(t0 + days[days.length - 1] * DAY),
      elapsedDays: last.t_days,
      Np,
      Wp,
      Gp,
      waterReported: !!series.qw,
      gasReported: !!series.qg,
      steps,
      annual,
    },
    check: {
      FOPT: fopt,
      closure: finite(fopt) && finite(npRun) && fopt > 0 ? Math.abs(npRun - fopt) / fopt : null,
    },
    sentBuild: build,
  };
  contract.fingerprint = simForecastFingerprint(contract);
  return { ok: true, contract };
}

/** "Run 1a2b3c4d of case "Ekene base" (Reservoir Simulation Studio), the whole run from 2026-01-01": one line. */
export function simSourceLine(c) {
  if (!c) return 'none';
  return `run ${String(c.run?.id || '').slice(0, 8)} of case "${c.projectName || 'unnamed'}" (Reservoir Simulation Studio), ${SIM_PHASES[c.phase] || c.phase} from ${c.forecast?.start || 'n/a'}`;
}

/** The basis in words, for a receiver to print. */
export function simBasisLine(c) {
  if (!c) return '';
  const sha = c.run?.deckSha256 ? String(c.run.deckSha256).slice(0, 12) : 'not recorded';
  const gas = c.forecast.gasReported ? '' : '; no gas rate in the summary, so no gas is sent';
  const water = c.forecast.waterReported ? '' : '; no water rate in the summary, so no water is sent';
  return `OPM Flow ${c.run?.opmVersion || 'version not recorded'} run of deck SHA-256 ${sha}, finished ${String(c.run?.finishedAt || '').slice(0, 10) || 'n/a'}; ${c.basis.conversion}; oil from ${c.basis.steps.oil}${water}${gas}; ends ${c.forecast.end}${c.phase === 'prediction' ? `, from the history end ${c.source.historyEnd}` : ''}`;
}

/**
 * Compare a received contract with what its source says now: the same run
 * read again, and the case's newest completed run.
 * @param {object} received the stored contract
 * @param {?{ok: boolean, contract?: object, reason?: string, latest?: ?object}} now getSimForecast(...)
 * @returns {{state: 'unchanged'|'changed'|'missing'|'refused', text: string, now?: object}}
 */
export function compareSimWithSource(received, now) {
  if (!now) return { state: 'missing', text: 'The source run is no longer there (deleted, or the case is no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The source cannot send this forecast now: ${now.reason}` };
  const latest = now.latest?.ok ? now.latest.contract : null;
  if (latest && latest.run.id !== received.run.id) {
    return {
      state: 'changed',
      text: `The case has a newer completed run since this was received (run ${String(latest.run.id).slice(0, 8)}, finished ${String(latest.run.finishedAt || '').slice(0, 10) || 'n/a'}${latest.run.deckSha256 !== received.run.deckSha256 ? ', a different deck' : ', the same deck'}). Refresh to take it.`,
      now: latest,
    };
  }
  if (now.contract.fingerprint === received.fingerprint) return { state: 'unchanged', text: 'Unchanged since it was received: this is still the newest completed run of the case.' };
  return { state: 'changed', text: 'The run reads differently now (its summary was rewritten). Refresh to take it.', now: now.contract };
}
