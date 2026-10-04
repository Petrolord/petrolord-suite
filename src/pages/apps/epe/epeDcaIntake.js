// Petroleum Economics Studio as a receiver of Decline Curve Analysis
// forecasts (DCA-U1-008, owner question 10).
//
// A `dca-forecast-1` contract becomes one production file: one row per
// calendar year with the stream's volume column the cash-flow engine reads
// (oil_bbl, gas_mscf or water_bbl), and, as the LAST element of the file's
// data array, the contract itself under the key `dca_forecast_1` with when
// and by which build it was received. The engine reads a row only when it
// has a year (extractAnnualVolumes) and picks volume columns from the first
// row (pickVolumeColumns), so the trailing record never reaches the cash
// flow (gate: epeDcaIntake.test.js, through computeCashFlow). The file keeps
// its provenance through a reload, is printed on the file card, and is read
// again by id to say when the source changed.
export const DCA_PROVENANCE_KEY = 'dca_forecast_1';
const COLUMN = Object.freeze({ oil: 'oil_bbl', gas: 'gas_mscf', water: 'water_bbl' });

/** The rows a contract gives, the provenance record last. */
export function epeRowsFromContract(contract, { receivedAt = new Date().toISOString(), build = null } = {}) {
  const col = COLUMN[contract.stream];
  if (!col) throw new Error(`Unknown stream "${contract.stream}".`);
  const rows = (contract.forecast?.annual || []).filter((y) => y.volume > 0).map((y) => ({ year: y.year, [col]: Math.round(y.volume) }));
  if (!rows.length) throw new Error('The forecast has no volume after the data cut-off.');
  return [...rows, { [DCA_PROVENANCE_KEY]: { ...contract, receivedAt, receivedBuild: build } }];
}

/** The provenance record of a production file, or null. */
export function dcaProvenanceOf(file) {
  const data = Array.isArray(file?.data) ? file.data : [];
  const last = data[data.length - 1];
  return last && typeof last === 'object' && last[DCA_PROVENANCE_KEY] ? last[DCA_PROVENANCE_KEY] : null;
}

/** The key a Forecast Scenario Hub case rides under (DCA U2-013, epeHubIntake.js). */
export const HUB_PROVENANCE_KEY = 'fsh_case_1';
/** The key a Waterflood Design Studio forecast rides under (WF-U2-001, epeWfIntake.js). */
export const WF_PROVENANCE_KEY = 'wf_forecast_1';
/** The key a Reservoir Simulation Studio run rides under (SIM-U2-002, epeSimIntake.js). */
export const SIM_PROVENANCE_KEY = 'sim_forecast_1';
const PROVENANCE_KEYS = [DCA_PROVENANCE_KEY, HUB_PROVENANCE_KEY, WF_PROVENANCE_KEY, SIM_PROVENANCE_KEY];

/** The volume rows of a file, without a provenance record. */
export function volumeRowsOf(data) {
  return (Array.isArray(data) ? data : []).filter((r) => !(r && typeof r === 'object' && PROVENANCE_KEYS.some((k) => r[k])));
}

/** The file name a received forecast is stored under. */
export const dcaFileName = (c) => `DCA - ${c.source?.wellName || 'well'} ${c.stream}.generated`;

/** One line for the file card. */
export function dcaProvenanceText(p) {
  if (!p) return null;
  const unit = p.units?.volume || 'bbl';
  return `From Decline Curve Analysis: ${p.source?.wellName || 'a well'}, ${p.stream}, ${p.decline?.model} fitted ${String(p.fit?.fittedAt || '').slice(0, 10) || 'n/a'}, project "${p.projectName || 'unnamed'}". `
    + `Data cut-off ${p.atCutoff?.date}; forecast from ${p.forecast?.start}, ending at ${p.forecast?.endReason === 'economic-limit' ? 'the economic limit' : 'the horizon'}; remaining ${Math.round(p.forecast?.remaining || 0).toLocaleString('en-US')} ${unit}. `
    + `Di is nominal per day at the fit start, a year of 365.25 days. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
}
