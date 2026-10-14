// Petroleum Economics Studio as a receiver of Well Cost & Time estimates
// (EPE video programme, 2026-10-14). A `wct-afe-1` contract
// (src/utils/wellcosttime/wctAfeContract.js) becomes one CAPEX file: one row
// with the year the money is spent, a category, the item and cost_usd (the
// column the cash-flow engine reads), and, as the LAST element of the file's
// data, the contract itself under `wct_afe_1` with the basis booked, the
// year and when it was received. The engine aggregates cost rows by year and
// skips a row without one, so the record never reaches the economics (gate:
// __tests__/epeWctIntake.test.js through computeCashFlow).
import { WCT_PROVENANCE_KEY } from './epeDcaIntake';
import { amountFor, BASIS_LABEL } from '@/utils/wellcosttime/wctAfeContract';

export { WCT_PROVENANCE_KEY };

const wellOf = (c) => c?.well?.wellboreName || c?.caseName || 'the well';

/** The rows a contract gives for a spend year, the provenance record last. */
export function epeRowsFromWctContract(contract, { year, category = 'Drilling', basis = 'afe', receivedAt = new Date().toISOString(), build = null } = {}) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || y > 2200) throw new Error('Pick the year the money is spent.');
  const amount = amountFor(contract, basis);
  if (!(typeof amount === 'number' && amount > 0)) throw new Error(basis === 'afe' ? 'The estimate has no AFE total.' : 'The estimate\'s saved run has no Monte Carlo result.');
  const row = {
    year: y,
    category: String(category || 'Drilling'),
    item: `${wellOf(contract)} drilling and completion (Well Cost & Time, ${basis === 'afe' ? 'AFE' : basis.toUpperCase()})`,
    cost_usd: Math.round(amount * 100) / 100,
  };
  return [row, { [WCT_PROVENANCE_KEY]: { ...contract, booked: { basis, year: y, category: row.category, amountUsd: row.cost_usd }, receivedAt, receivedBuild: build } }];
}

/** The provenance record of a CAPEX file, or null. */
export function wctProvenanceOf(file) {
  const data = Array.isArray(file?.data) ? file.data : [];
  const last = data[data.length - 1];
  return last && typeof last === 'object' && last[WCT_PROVENANCE_KEY] ? last[WCT_PROVENANCE_KEY] : null;
}

/** The file name a received estimate is stored under. */
export const wctFileName = (c) => `WCT - ${wellOf(c)} AFE.generated`;

const usd = (v) => `${Math.round(v).toLocaleString('en-US')} USD`;

/** One paragraph for the file card. */
export function wctProvenanceText(p) {
  if (!p) return null;
  const b = p.booked || {};
  const risk = p.risk ? ` Monte Carlo of the base cost: P10 ${usd(p.risk.p10Usd)}, P50 ${usd(p.risk.p50Usd)}, P90 ${usd(p.risk.p90Usd)}.` : '';
  return `From Well Cost & Time: estimate "${p.caseName}" for ${wellOf(p)}, run saved ${String(p.runSavedAt || '').slice(0, 10) || 'n/a'}. `
    + `AFE ${usd(p.afe.totalUsd)} (${p.afe.label}).${risk} `
    + `Booked: ${BASIS_LABEL[b.basis] || BASIS_LABEL.afe}, ${b.amountUsd != null ? usd(b.amountUsd) : 'n/a'} in ${b.year ?? 'n/a'} as ${b.category || 'Drilling'}. Received ${String(p.receivedAt || '').slice(0, 10)}.`;
}
