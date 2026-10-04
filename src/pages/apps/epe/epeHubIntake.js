// Petroleum Economics Studio as a receiver of Forecast Scenario Hub cases
// (DCA U2-013, HUB-U1-010). The import used to recompute the case and keep
// nothing of where it came from. It now takes the `fsh-case-1` contract read
// by id from the saved scenario set (src/utils/forecastScenarioContract.js):
// one row per forecast year from the first production year chosen in the
// dialog, and, as the LAST element of the file's data, the contract itself
// under `fsh_case_1`, with the Decline Curve Analysis forecast behind a
// received case inside it. The cash-flow engine reads only rows with a year,
// so the record never reaches the economics (gate: epeHubIntake.test.js
// through computeCashFlow). The file card prints the source and says when it
// changed.
import { HUB_PROVENANCE_KEY } from './epeDcaIntake';
import { hubSourceLine } from '@/utils/forecastScenarioContract';

export { HUB_PROVENANCE_KEY };

/** The rows a hub contract gives from a first production year, the provenance record last. */
export function epeRowsFromHubContract(contract, startYear, { receivedAt = new Date().toISOString(), build = null } = {}) {
  if (!Number.isFinite(startYear)) throw new Error('Pick a first production year.');
  const rows = (contract.results?.annual || []).map((bbl, i) => ({ year: startYear + i, oil_bbl: Math.round(bbl) })).filter((r) => r.oil_bbl > 0);
  if (!rows.length) throw new Error('The scenario produced no annual volumes.');
  return [...rows, { [HUB_PROVENANCE_KEY]: { ...contract, receivedAt, receivedBuild: build, firstYear: startYear } }];
}

/** The hub provenance record of a production file, or null. */
export function hubProvenanceOf(file) {
  const data = Array.isArray(file?.data) ? file.data : [];
  const last = data[data.length - 1];
  return last && typeof last === 'object' && last[HUB_PROVENANCE_KEY] ? last[HUB_PROVENANCE_KEY] : null;
}

/** The file name a received case is stored under. */
export const hubFileName = (c) => `FSH - ${c.caseName || 'scenario'}.generated`;

/** One paragraph for the file card. */
export function hubProvenanceText(p) {
  if (!p) return null;
  const q = p.parameters || {};
  // WF-U2-001: a profile case received from Waterflood Design Studio
  if (q.kind === 'profile') {
    return `From ${hubSourceLine(p)}. A production profile (no Arps parameters), horizon ${q.years} yr, case start ${q.startDate}. `
      + `Forecast year 1 is ${p.firstYear} here; a forecast year is 365.25 days from the case start. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
  }
  const basis = q.declineBasis && q.declineBasis !== 'nominal' ? `${q.declineAnnualPct} %/yr ${q.declineBasis === 'effective-secant' ? 'effective secant' : 'effective tangent'} (${Number(q.diNominalPctPerYear).toFixed(2)} %/yr nominal)` : `${q.declineAnnualPct} %/yr nominal`;
  return `From ${hubSourceLine(p)}. qi ${q.qi} bbl/d, decline ${basis}, b ${q.b}${q.terminalDeclinePct ? `, terminal decline ${q.terminalDeclinePct} %/yr ${q.terminalDeclineBasis === 'nominal' ? 'nominal' : 'effective'}` : ''}, horizon ${q.years} yr, case start ${q.startDate}. `
    + `Forecast year 1 is ${p.firstYear} here; a forecast year is 365.25 days from the case start. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
}
