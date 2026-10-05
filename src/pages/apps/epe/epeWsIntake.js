// Petroleum Economics Studio as a receiver of Well Spacing Optimizer cases
// (WS-U2-004). The `wf-forecast-1` pattern (./epeWfIntake.js): a `ws-case-1`
// contract becomes one production file, one row per calendar year with
// oil_bbl and gas_mscf (the cash-flow engine reads both columns), and, as the
// LAST element of the file's data array, the contract itself under the key
// `ws_case_1` with when and by which build it was received. The engine reads
// a row only when it has a year, so the trailing record never reaches the
// cash flow (gate: wsCaseContract.test.js, through computeCashFlow).
//
// The case's capex and opex stay in this app's own economics: EPE takes the
// volumes, and the drilling schedule is printed on the file card so the
// capex entered here can follow it.
import { WS_PROVENANCE_KEY } from './epeDcaIntake';
import { wsSourceLine } from '@/utils/wellspacing/wsCaseContract';

export { WS_PROVENANCE_KEY };

/** The rows a contract gives, the provenance record last. */
export function epeRowsFromWsContract(contract, { receivedAt = new Date().toISOString(), build = null } = {}) {
  const rows = (contract?.forecast?.annual || [])
    .map((y) => ({ year: y.year, oil_bbl: Math.round(y.oil), gas_mscf: Math.round(y.gas) }))
    .filter((r) => r.oil_bbl > 0 || r.gas_mscf > 0);
  if (!rows.length) throw new Error('The spacing case has no volume.');
  return [...rows, { [WS_PROVENANCE_KEY]: { ...contract, receivedAt, receivedBuild: build } }];
}

/** The provenance record of a production file, or null. */
export function wsProvenanceOf(file) {
  const data = Array.isArray(file?.data) ? file.data : [];
  const last = data[data.length - 1];
  return last && typeof last === 'object' && last[WS_PROVENANCE_KEY] ? last[WS_PROVENANCE_KEY] : null;
}

/** The file name a received case is stored under. */
export const wsFileName = (c) => `Well spacing - ${c.source?.field || c.projectName || 'case'} ${Number(c.source?.spacingAcres)} acres.generated`;

/** One paragraph for the file card. */
export function wsProvenanceText(p) {
  if (!p) return null;
  const f = p.forecast || {};
  const n = (v) => Math.round(v || 0).toLocaleString('en-US');
  const sched = (p.basis?.schedule || []).map((s) => `${s.wells} in year ${s.year}`).join(', ');
  return `From ${wsSourceLine(p)}. `
    + `Np ${n(f.Np)} STB and Gp ${n(f.Gp)} Mscf (solution gas at ${p.basis?.gor} scf/STB) to ${f.end}; ${p.basis?.rateLimit?.binding ? 'rate-limited at the deliverable rate' : 'not rate-limited'}. `
    + `Wells on stream: ${sched || 'n/a'}; enter the matching drilling capex in this case. Field volumes by calendar year. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
}
