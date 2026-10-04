/**
 * Decline EUR over the in-place volume as a cross-check of the estimate
 * (RF-U2-014). The forecasts are read by id as `dca-forecast-1` contracts
 * (src/utils/declineCurve/dcaForecastContract.js) from saved Decline Curve
 * Analysis projects; nothing is recomputed here. The EUR of a contract is
 * produced to the data cut-off plus the forecast remaining to the economic
 * limit or the horizon (forecast.eur), in the stream's engine units: bbl at
 * stock-tank conditions for oil (= STB), Mscf for gas (x 1,000 to scf).
 *
 * The implied recovery factor is the sum of the EURs over the in-place
 * volume of this case. It counts only the wells taken: when wells are
 * missing it is a lower bound, and the screen and the report say so. It is a
 * cross-check printed beside the estimate; it never replaces it.
 *
 * Pure.
 */
import { DCA_FORECAST_SCHEMA, dcaSourceLine } from '@/utils/declineCurve/dcaForecastContract';

export const SCF_PER_MSCF = 1000;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The EUR of one contract in this app's units (STB or scf), or the reason it cannot be used. */
export function eurOf(contract, phase) {
  if (!contract || contract.schema !== DCA_FORECAST_SCHEMA) return { ok: false, reason: 'Not a dca-forecast-1 forecast.' };
  const want = phase === 'gas' ? 'gas' : 'oil';
  if (contract.stream !== want) return { ok: false, reason: `${contract.source?.wellName || 'The well'}: a ${contract.stream} forecast cannot check a ${want} recovery factor.` };
  const unit = contract.units?.volume;
  const eur = contract.forecast?.eur;
  if (!finite(eur) || eur < 0) return { ok: false, reason: `${contract.source?.wellName || 'The well'}: the forecast has no EUR.` };
  if (want === 'oil' && unit !== 'bbl') return { ok: false, reason: `Unexpected oil volume unit "${unit}".` };
  if (want === 'gas' && unit !== 'Mscf') return { ok: false, reason: `Unexpected gas volume unit "${unit}".` };
  return { ok: true, value: want === 'gas' ? eur * SCF_PER_MSCF : eur, unit: want === 'gas' ? 'scf' : 'STB', engineValue: eur, engineUnit: unit };
}

/**
 * The record the estimator keeps when forecasts are taken.
 * @param {object[]} contracts dca-forecast-1 contracts
 * @param {{phase: 'oil'|'gas', now?: string}} o
 * @returns {{ok: true, check: object}|{ok: false, errors: string[]}}
 */
export function dcaCheckFrom(contracts, { phase, now = new Date().toISOString() }) {
  const errors = [];
  const items = [];
  for (const c of contracts || []) {
    const e = eurOf(c, phase);
    if (!e.ok) { errors.push(e.reason); continue; }
    items.push({
      projectId: c.projectId, projectName: c.projectName, wellId: c.source?.wellId ?? null, wellName: c.source?.wellName ?? null,
      sample: !!c.source?.sample, stream: c.stream, eur: e.value, unit: e.unit, engineEur: e.engineValue, engineUnit: e.engineUnit,
      endReason: c.forecast?.endReason ?? null, economicLimit: c.forecast?.economicLimit ?? null,
      cutoff: c.atCutoff?.date ?? null, fingerprint: c.fingerprint, source: dcaSourceLine(c),
    });
  }
  if (!items.length) return { ok: false, errors: errors.length ? errors : ['Choose at least one forecast.'] };
  return {
    ok: true,
    errors,
    check: { contract: DCA_FORECAST_SCHEMA, phase: phase === 'gas' ? 'gas' : 'oil', items, projectIds: [...new Set(items.map((i) => i.projectId))], takenAt: now },
  };
}

/**
 * The implied recovery factor of a kept check against the in-place volume of the case.
 * @returns {?{eur: number, unit: string, impliedRf: ?number, wells: number, text: string, vsEstimate: ?string}}
 */
export function dcaImpliedRf(check, { inPlace, phase, rf = null }) {
  if (!check?.items?.length) return null;
  if ((check.phase === 'gas') !== (phase === 'gas')) return { eur: null, unit: null, impliedRf: null, wells: check.items.length, text: `The forecasts taken are ${check.phase} forecasts and this estimate is for ${phase}; take ${phase} forecasts to compare.`, vsEstimate: null };
  const eur = check.items.reduce((s, i) => s + i.eur, 0);
  const unit = check.items[0].unit;
  const impliedRf = finite(inPlace) && inPlace > 0 ? eur / inPlace : null;
  const ip = phase === 'gas' ? 'OGIP' : 'OOIP';
  const pct = (v) => `${(v * 100).toFixed(1)} percent`;
  const text = impliedRf == null
    ? `The ${check.items.length} decline forecasts add to an EUR, and the case has no ${ip} to divide it by.`
    : `Decline EUR over ${ip}: ${pct(impliedRf)}, from ${check.items.length} well${check.items.length === 1 ? '' : 's'} (EUR is produced to the data cut-off plus the forecast to its economic limit or horizon). It counts only the wells taken: with wells missing it is a lower bound.`;
  const vsEstimate = impliedRf != null && finite(rf) ? `The estimate is ${pct(rf)}; the decline EUR implies ${pct(impliedRf)} (${impliedRf >= rf ? 'above' : 'below'} by ${((Math.abs(impliedRf - rf)) * 100).toFixed(1)} points).` : null;
  return { eur, unit, impliedRf, wells: check.items.length, text, vsEstimate };
}
