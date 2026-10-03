// Decline Curve Analysis as a sender: the `dca-forecast-1` contract
// (DCA-U1-008, owner question 10, RL11). The pattern is `epe-unit-value-1`
// (src/pages/apps/epe/epeUnitValue.js): read by id from the saved project,
// nothing recomputed, a fingerprint for "source changed since".
//
// Before this, the NPV and FDP "sync" cards sent nothing (H1, removed), and
// a forecast reached Forecast Scenario Hub or Petroleum Economics Studio only
// by retyping qi, a decline on another basis and b, or through a bare CSV.
//
// The contract (volumes in the stream's state units: bbl, or Mscf for gas):
//   schema, app, table          'dca-forecast-1', 'Decline Curve Analysis', 'saved_dca_projects'
//   projectId, projectName, projectSavedAt
//   source                      { kind: 'well', wellId, wellName, sample, field, reservoir, company }
//   stream                      'oil' | 'gas' | 'water'
//   units                       { rate, volume, time: 'day', note }
//   decline                     { model, qi, qiAt, diPerDay, diNominalPctPerYear, diEffectiveFirstYearPct, b,
//                                 basis, daysPerYear }: the fit, at its start
//   atCutoff                    { date, daysFromFitStart, rate, diPerDay, diNominalPctPerYear }: the same
//                                 curve restarted at the data cut-off (q and the instantaneous nominal
//                                 decline there; b unchanged). A receiver that starts a forecast at the
//                                 cut-off with these gets the sender's forecast day for day
//   fit                         { fittedAt, windowStart, windowEnd, pointsUsed, excluded, R2, RMSE, intervals }
//   forecast                    { forecastAt, start, economicLimit, facilityLimit, horizonDays, endReason,
//                                 timeToLimitDays, produced, remaining, eur, annual: [{year, volume, days}] }
//   probabilistic               null, or { p90, p50, p10, mean, iterations, seed, convention }
//   sentBuild                   the Suite build that sent it (not in the fingerprint)
//   fingerprint                 changes when anything the forecast says changes
// A forecast that cannot be sent (none, out of date, no data) is refused with
// the reason.
import { analysisOf, analysisStatus, staleText, migrateDcaPayload, fingerprint, STREAMS } from './dcaModel';
import { nominalAnnualPct, effectiveFirstYearPct, DAYS_PER_YEAR } from './declineDisplay';
import { calculateArpsHyperbolic, calculateModifiedHyperbolicRate } from './dcaEngine';
import { describeTypedDecline } from './declineInput';
import { ENGINE_RATE, ENGINE_VOLUME } from './dcaUnits';

export const DCA_FORECAST_SCHEMA = 'dca-forecast-1';
export const DCA_APP = 'Decline Curve Analysis';
export const DCA_TABLE = 'saved_dca_projects';

const DAY = 86400000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Calendar-year volumes of a daily forecast (the day after the cut-off first). */
export function annualVolumes(rates) {
  const by = new Map();
  for (const r of rates || []) {
    const y = new Date(r.date).getUTCFullYear();
    if (!Number.isFinite(y) || !finite(r.rate)) continue;
    const cur = by.get(y) || { year: y, volume: 0, days: 0 };
    cur.volume += r.rate;
    cur.days += 1;
    by.set(y, cur);
  }
  return [...by.values()].sort((a, b) => a.year - b.year);
}

/** FNV-1a over what the forecast says (never over who sent it or when). */
export function dcaForecastFingerprint(c) {
  return fingerprint({
    projectId: c.projectId, source: { wellId: c.source?.wellId, wellName: c.source?.wellName }, stream: c.stream,
    decline: c.decline, atCutoff: c.atCutoff, fit: c.fit, forecast: c.forecast, probabilistic: c.probabilistic,
  });
}

/**
 * Build the contract for one stream of one well of a saved project.
 * @param {{projectId: string, projectName?: string, projectSavedAt?: string, payload: object,
 *   wellId: string, stream: string, build?: string}} a
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildDcaForecastContract({ projectId, projectName = null, projectSavedAt = null, payload, wellId, stream, build = null }) {
  if (!STREAMS.includes(stream)) return { ok: false, reason: `Unknown stream "${stream}".` };
  const data = migrateDcaPayload(payload || {});
  const well = data?.wells?.[wellId];
  if (!well) return { ok: false, reason: 'The well is no longer in the saved project.' };
  const a = analysisOf(well);
  const s = a.streams[stream];
  const fit = s.fitResults;
  const fc = s.forecastResults;
  if (!fit) return { ok: false, reason: `${well.name} has no ${stream} fit.` };
  if (!fc) return { ok: false, reason: `${well.name} has a ${stream} fit and no forecast. Run the forecast and save the project.` };
  const st = analysisStatus(well, stream);
  if (st.fit !== 'current') return { ok: false, reason: staleText(st, 'fit') };
  if (st.forecast !== 'current') return { ok: false, reason: staleText(st, 'forecast') };

  const t0 = Date.parse(fit.t0);
  const cutoff = Date.parse(fc.historyEndDate);
  // the day count forecastFromHistory used, so the restart is exact
  const tH = Math.max(0, Math.round((cutoff - t0) / DAY));
  // DCA U2-001: with a terminal decline the curve is the modified hyperbolic;
  // restarted at the cut-off it is the same curve (the switch is set by the
  // decline, which is the same at the same rate), or the exponential tail
  // at Dmin when the switch is already behind the cut-off
  const term = fc.terminalDecline || null;
  const pastSwitch = !!term && tH >= term.tSwitchDays;
  const qH = term ? calculateModifiedHyperbolicRate(fit.qi, fit.Di, fit.b, term.dminPerDay, tH) : calculateArpsHyperbolic(fit.qi, fit.Di, fit.b, tH);
  const diH = pastSwitch ? term.dminPerDay : (fit.b > 0 ? fit.Di / (1 + fit.b * fit.Di * tH) : fit.Di);
  const cfg = s.forecastConfig;
  const endReason = fc.limitBeforeToday ? 'below-limit-at-cutoff' : fc.limitReached ? 'economic-limit' : 'horizon';
  const ci = fit.confidenceIntervals || {};

  const contract = {
    schema: DCA_FORECAST_SCHEMA,
    app: DCA_APP,
    table: DCA_TABLE,
    projectId,
    projectName,
    projectSavedAt,
    source: {
      kind: 'well', wellId, wellName: well.name ?? null, sample: !!well.sample,
      field: well.identification?.field || null, reservoir: well.identification?.reservoir || null, company: well.identification?.company || null,
    },
    stream,
    units: {
      rate: ENGINE_RATE[stream], volume: ENGINE_VOLUME[stream], time: 'day',
      note: 'Calendar-day average rates at stock-tank conditions; volumes are the daily rates summed.',
    },
    decline: {
      model: fit.modelType,
      qi: fit.qi,
      qiAt: String(fit.t0).slice(0, 10),
      diPerDay: fit.Di,
      diNominalPctPerYear: nominalAnnualPct(fit.Di),
      diEffectiveFirstYearPct: effectiveFirstYearPct(fit.Di, fit.b),
      b: fit.b,
      basis: 'Di is the nominal (instantaneous) decline per day at qiAt; per year it is that times 365.25',
      daysPerYear: DAYS_PER_YEAR,
      // DCA U2-001: the terminal decline; the key is absent when none was set
      ...(term ? {
        terminal: {
          dminPerDay: term.dminPerDay,
          dminNominalPctPerYear: nominalAnnualPct(term.dminPerDay),
          entered: term.entered,
          enteredText: describeTypedDecline(term.entered),
          switchDate: term.switchDate,
          switchDaysFromFitStart: term.tSwitchDays,
          switchRate: term.qSwitch,
          fromStart: term.fromStart,
          basis: 'Modified hyperbolic: the hyperbolic until its nominal decline falls to Dmin, exponential at Dmin after',
        },
      } : {}),
    },
    atCutoff: {
      date: new Date(cutoff).toISOString().slice(0, 10),
      daysFromFitStart: tH,
      rate: qH,
      diPerDay: diH,
      diNominalPctPerYear: nominalAnnualPct(diH),
      ...(term ? { pastSwitch } : {}),
    },
    fit: {
      fittedAt: fit.fittedAt || null,
      windowStart: a.fitWindow.startDate ? String(a.fitWindow.startDate).slice(0, 10) : null,
      windowEnd: a.fitWindow.endDate ? String(a.fitWindow.endDate).slice(0, 10) : null,
      pointsUsed: fit.points?.used ?? null,
      excluded: s.excluded.map((e) => ({ date: String(e.date).slice(0, 10), reason: e.reason })),
      R2: finite(fit.R2) ? fit.R2 : null,
      RMSE: finite(fit.RMSE) ? fit.RMSE : null,
      intervals: ci.hasIntervals ? { qi: ci.qi, diPerDay: ci.Di, b: ci.b, level: 0.95 } : null,
    },
    forecast: {
      forecastAt: fc.forecastAt || null,
      start: new Date(cutoff + DAY).toISOString().slice(0, 10),
      economicLimit: cfg.stopAtLimit && cfg.economicLimit > 0 ? cfg.economicLimit : null,
      facilityLimit: cfg.facilityLimit > 0 ? cfg.facilityLimit : null,
      // DCA U2-011: the downtime factor the volumes carry; the key is absent when none
      ...(fc.downtimePct ? { downtimePct: fc.downtimePct } : {}),
      horizonDays: cfg.durationDays,
      endReason,
      timeToLimitDays: finite(fc.timeToLimit) ? fc.timeToLimit : null,
      produced: fc.produced,
      remaining: fc.remaining ?? fc.eur,
      eur: fc.eurTotal,
      annual: annualVolumes(fc.rates),
    },
    probabilistic: fc.probabilistic?.iterations > 0 ? {
      p90: fc.probabilistic.p90, p50: fc.probabilistic.p50, p10: fc.probabilistic.p10, mean: fc.probabilistic.mean,
      iterations: fc.probabilistic.iterations, seed: fc.probabilistic.seed ?? null,
      convention: 'Exceedance: P90 is the low case. EUR from the fit start to the deterministic end date.',
    } : null,
    sentBuild: build,
  };
  contract.fingerprint = dcaForecastFingerprint(contract);
  return { ok: true, contract };
}

/** "Ekene-1 (sample), oil, fit 2026-10-03, Saved project": a one-line citation. */
export function dcaSourceLine(c) {
  if (!c) return 'none';
  return `${c.source?.wellName || 'a well'}, ${c.stream}, ${c.decline?.model || 'Arps'} fitted ${String(c.fit?.fittedAt || '').slice(0, 10) || 'n/a'}, project "${c.projectName || 'unnamed'}" (Decline Curve Analysis)`;
}

/** The decline basis in words, for a receiver to print. */
export function dcaBasisLine(c) {
  if (!c) return '';
  const d = c.atCutoff;
  const t = c.decline.terminal;
  const term = t ? `; terminal decline Dmin ${Number(t.dminNominalPctPerYear.toPrecision(6))} %/yr nominal (entered as ${t.enteredText}), switch to exponential on ${t.switchDate}` : '';
  return `qi ${Number(d.rate.toPrecision(6))} ${c.units.rate} and Di ${Number(d.diNominalPctPerYear.toPrecision(6))} %/yr nominal (a year of 365.25 days) at the data cut-off ${d.date}, b ${Number(Number(c.decline.b).toPrecision(4))}; fitted at ${c.decline.qiAt}: qi ${Number(c.decline.qi.toPrecision(6))} ${c.units.rate}, Di ${Number(c.decline.diPerDay.toPrecision(4))} per day nominal${term}`;
}

/**
 * Compare a received contract with the one its source would send now.
 * @returns {{state: 'unchanged'|'changed'|'missing'|'refused', text: string, now?: object}}
 */
export function compareWithSource(received, now) {
  if (!now) return { state: 'missing', text: 'The source project, well or forecast is no longer there (deleted, or no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The source cannot send this forecast now: ${now.reason}` };
  if (now.contract.fingerprint === received.fingerprint) return { state: 'unchanged', text: 'Unchanged since it was received.' };
  const moved = [];
  if (now.contract.decline.qi !== received.decline.qi || now.contract.decline.diPerDay !== received.decline.diPerDay || now.contract.decline.b !== received.decline.b) moved.push('the fit');
  if ((now.contract.decline.terminal?.dminPerDay ?? null) !== (received.decline.terminal?.dminPerDay ?? null)) moved.push('the terminal decline');
  if (now.contract.forecast.eur !== received.forecast.eur || now.contract.forecast.remaining !== received.forecast.remaining) moved.push('the volumes');
  if (now.contract.forecast.economicLimit !== received.forecast.economicLimit) moved.push('the economic limit');
  if (now.contract.atCutoff.date !== received.atCutoff.date) moved.push('the data cut-off');
  return { state: 'changed', text: `The source changed since it was received${moved.length ? ` (${moved.join(', ')})` : ''}. Refresh to take the new forecast.`, now: now.contract };
}
