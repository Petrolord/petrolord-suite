// Petroleum Economics Studio as a receiver of Reservoir Simulation Studio
// runs (SIM-U2-002). The `wf-forecast-1` pattern (./epeWfIntake.js): a
// `sim-forecast-1` contract becomes one production file, one row per
// calendar year with oil_bbl, gas_mscf and water_bbl (the cash-flow engine
// reads all three columns), and, as the LAST element of the file's data
// array, the contract itself under the key `sim_forecast_1` with when and by
// which build it was received. The engine reads a row only when it has a
// year, so the trailing record never reaches the cash flow (gate:
// simForecastContract.test.js, through computeCashFlow).
import { SIM_PROVENANCE_KEY } from './epeDcaIntake';
import { simSourceLine, SIM_PHASES } from '@/utils/simstudio/simForecastContract';

export { SIM_PROVENANCE_KEY };

/** The rows a contract gives, the provenance record last. A stream the run did not report is left out. */
export function epeRowsFromSimContract(contract, { receivedAt = new Date().toISOString(), build = null } = {}) {
  const f = contract?.forecast || {};
  const rows = (f.annual || [])
    .map((y) => ({
      year: y.year,
      oil_bbl: Math.round(y.oil),
      ...(f.gasReported ? { gas_mscf: Math.round(y.gas) } : {}),
      ...(f.waterReported ? { water_bbl: Math.round(y.water) } : {}),
    }))
    .filter((r) => r.oil_bbl > 0 || r.gas_mscf > 0 || r.water_bbl > 0);
  if (!rows.length) throw new Error('The run has no volume in the phase sent.');
  return [...rows, { [SIM_PROVENANCE_KEY]: { ...contract, receivedAt, receivedBuild: build } }];
}

/** The provenance record of a production file, or null. */
export function simProvenanceOf(file) {
  const data = Array.isArray(file?.data) ? file.data : [];
  const last = data[data.length - 1];
  return last && typeof last === 'object' && last[SIM_PROVENANCE_KEY] ? last[SIM_PROVENANCE_KEY] : null;
}

/** The file name a received run is stored under. */
export const simFileName = (c) => `Simulation - ${c.projectName || 'case'} ${String(c.run?.id || '').slice(0, 8)}${c.phase === 'prediction' ? ' prediction' : ''}.generated`;

/** One paragraph for the file card. */
export function simProvenanceText(p) {
  if (!p) return null;
  const f = p.forecast || {};
  const n = (v) => Math.round(v || 0).toLocaleString('en-US');
  return `From ${simSourceLine(p)}. `
    + `OPM Flow ${p.run?.opmVersion || ''}, deck SHA-256 ${String(p.run?.deckSha256 || 'not recorded').slice(0, 12)}; Np ${n(f.Np)} STB${f.gasReported ? `, Gp ${n(f.Gp)} Mscf` : ', no gas rate in the run'}${f.waterReported ? `, Wp ${n(f.Wp)} STB` : ''} to ${f.end} (${SIM_PHASES[p.phase] || p.phase}). `
    + `Field volumes by calendar year at stock-tank and standard conditions. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
}
