// Petroleum Economics Studio as a receiver of Waterflood Design Studio
// pattern forecasts (WF-U2-001). The `dca-forecast-1` pattern
// (./epeDcaIntake.js): a `wf-forecast-1` contract becomes one production
// file, one row per calendar year with oil_bbl and water_bbl (stock-tank
// barrels; the cash-flow engine reads both columns), and, as the LAST
// element of the file's data array, the contract itself under the key
// `wf_forecast_1` with when and by which build it was received. The engine
// reads a row only when it has a year, so the trailing record never reaches
// the cash flow (gate: epeWfIntake.test.js, through computeCashFlow).
import { WF_PROVENANCE_KEY } from './epeDcaIntake';
import { wfSourceLine, wfEndWords } from '@/utils/waterflooddesign/wfForecastContract';

export { WF_PROVENANCE_KEY };

/** The rows a contract gives, the provenance record last. */
export function epeRowsFromWfContract(contract, { receivedAt = new Date().toISOString(), build = null } = {}) {
  const rows = (contract?.forecast?.annual || [])
    .map((y) => ({ year: y.year, oil_bbl: Math.round(y.oil), water_bbl: Math.round(y.water) }))
    .filter((r) => r.oil_bbl > 0 || r.water_bbl > 0);
  if (!rows.length) throw new Error('The pattern forecast has no volume.');
  return [...rows, { [WF_PROVENANCE_KEY]: { ...contract, receivedAt, receivedBuild: build } }];
}

/** The provenance record of a production file, or null. */
export function wfProvenanceOf(file) {
  const data = Array.isArray(file?.data) ? file.data : [];
  const last = data[data.length - 1];
  return last && typeof last === 'object' && last[WF_PROVENANCE_KEY] ? last[WF_PROVENANCE_KEY] : null;
}

/** The file name a received forecast is stored under. */
export const wfFileName = (c) => `Waterflood - ${c.source?.pattern || c.projectName || 'pattern'}.generated`;

/** One paragraph for the file card. */
export function wfProvenanceText(p) {
  if (!p) return null;
  const a = p.model?.arealSweep || {};
  return `From ${wfSourceLine(p)}. `
    + `${p.model?.patternLabel || 'five-spot'} pattern, M ${Number(Number(a.M).toPrecision(4))} on the ${a.mobilityBasis === 'craig' ? "Craig's" : 'endpoint'} basis; Np ${Math.round(p.forecast?.Np || 0).toLocaleString('en-US')} STB to ${wfEndWords(p.forecast?.endReason)} on ${p.forecast?.end}. `
    + `Oil and water in stock-tank barrels by calendar year from the flood start ${p.forecast?.start}. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
}
