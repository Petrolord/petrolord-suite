// Forecast Scenario Hub as a receiver of Decline Curve Analysis forecasts
// (DCA-U1-008, HUB-U1). A case made from a `dca-forecast-1` contract starts
// at the day after the DCA data cut-off with the fitted curve restarted
// there: qi is the fitted rate at the cut-off and the decline the nominal
// instantaneous decline there (Di / (1 + b Di t) for a hyperbolic), b
// unchanged. Arps is self-similar under a shift in time, so the hub's
// forecast is the DCA forecast day for day (gate: forecastScenarioIntake).
//
// The case keeps the contract it was made from (`source`), so the hub can
// print where it came from, read the source again by id, and say when it
// changed or when the case was edited after the handoff.
import { DAYS_PER_YEAR } from '@/utils/forecastScenarioCalculations';
import { dcaSourceLine, dcaBasisLine } from '@/utils/declineCurve/dcaForecastContract';

const r6 = (v) => Number(Number(v).toPrecision(10));

/** The hub case values a contract gives. */
export function caseValuesFromContract(c) {
  return {
    qi: r6(c.atCutoff.rate),
    declineAnnualPct: r6(c.atCutoff.diNominalPctPerYear),
    declineBasis: 'nominal',
    b: r6(c.decline.b),
    years: r6(c.forecast.horizonDays / DAYS_PER_YEAR),
    economicLimit: c.forecast.economicLimit ? r6(c.forecast.economicLimit) : 0,
    startDate: c.forecast.start,
    // DCA U2-001: the terminal decline travels as its exact nominal %/yr
    terminalDeclinePct: c.decline.terminal ? r6(c.decline.terminal.dminNominalPctPerYear) : null,
    terminalDeclineBasis: c.decline.terminal ? 'nominal' : null,
    // DCA U2-011: the downtime factor of the sender's forecast
    downtimePct: c.forecast.downtimePct || null,
  };
}

/**
 * A hub case from a contract, or a refusal: the hub holds oil cases in bbl/d.
 * @returns {{ok: true, case: object}|{ok: false, reason: string}}
 */
export function caseFromDcaContract(contract, { id = `dca-${Date.now()}`, receivedAt = new Date().toISOString(), build = null } = {}) {
  if (!contract || contract.schema !== 'dca-forecast-1') return { ok: false, reason: 'Not a Decline Curve Analysis forecast.' };
  if (contract.stream !== 'oil') return { ok: false, reason: `Forecast Scenario Hub holds oil cases in bbl/d; this is a ${contract.stream} forecast. Send it to Petroleum Economics Studio instead.` };
  if (contract.forecast.endReason === 'below-limit-at-cutoff') return { ok: false, reason: 'The fitted rate is already below the economic limit at the data cut-off: there is nothing left to forecast.' };
  return {
    ok: true,
    case: {
      id,
      name: `${contract.source?.wellName || 'Well'} (DCA)`,
      ...caseValuesFromContract(contract),
      source: { contract, receivedAt, receivedBuild: build },
    },
  };
}

const KEYS = ['qi', 'declineAnnualPct', 'declineBasis', 'b', 'years', 'economicLimit', 'startDate', 'terminalDeclinePct', 'terminalDeclineBasis', 'downtimePct'];
const LABELS = { qi: 'qi', declineAnnualPct: 'decline', declineBasis: 'decline basis', b: 'b', years: 'horizon', economicLimit: 'economic limit', startDate: 'start date', terminalDeclinePct: 'terminal decline', terminalDeclineBasis: 'terminal decline basis', downtimePct: 'downtime' };
const TEXT_KEYS = new Set(['startDate', 'terminalDeclineBasis']);
const numOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) === 0 ? null : Number(v));

/** The fields of a case changed by hand after the handoff. */
export function editedAfterHandoff(c) {
  if (!c?.source?.contract) return [];
  const sent = caseValuesFromContract(c.source.contract);
  return KEYS.filter((k) => {
    if (k === 'declineBasis') return (c[k] || 'nominal') !== (sent[k] || 'nominal');
    if (TEXT_KEYS.has(k)) return String(c[k] || '') !== String(sent[k] || '');
    if (k === 'terminalDeclinePct' || k === 'downtimePct') {
      const a = numOrNull(c[k]); const b = numOrNull(sent[k]);
      if (a == null || b == null) return a !== b;
      return Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b));
    }
    return Math.abs(Number(c[k]) - Number(sent[k])) > 1e-9 * Math.max(1, Math.abs(Number(sent[k])));
  }).map((k) => LABELS[k]);
}

/** One sentence: where the case came from and on which basis. */
export function caseSourceText(c) {
  if (!c?.source?.contract) return null;
  const k = c.source.contract;
  const edited = editedAfterHandoff(c);
  return `From ${dcaSourceLine(k)}, received ${String(c.source.receivedAt || '').slice(0, 10)}. ${dcaBasisLine(k)}.${edited.length ? ` Edited here after the handoff: ${edited.join(', ')}.` : ''}`;
}
