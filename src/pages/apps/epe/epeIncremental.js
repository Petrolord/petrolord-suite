// Incremental economics of two Petroleum Economics Studio runs (Wave F,
// audit 2.7), on the engine's own valuation.
//
// The comparison page used to discount every year of the delta from the base
// run's earliest year and to include the sunk history years. With a valuation
// year of 2026 and history from 2020 (the Ekene demo) that discounted the
// increment six extra years: 1,377,011 USD on screen for an increment that is
// 1,980,235 - (-459,224) = 2,439,459 USD. The engine (cashflow.ts) values only
// the rows it does not treat as sunk, on the PV-basis flow (real when the run
// is on a real basis), with the exponent
//   dexp(year) = (year - valuation year) + 0.5 on mid-year discounting.
// The increment here does the same, so when both runs share valuation year,
// convention, basis and rate the incremental NPV equals the difference of the
// two runs' NPVs (gate: __tests__/epeIncremental.test.js through the engine).
//
// The rate of return comes from the shared IRR contract
// (packages/engines/engines/economics/irrContract.js); nothing here solves
// for a rate itself.
import { solveIrrInBand } from '@/utils/irrContract';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The valuation terms a run's NPV was computed on. */
export function valuationOf(run) {
  const k = run?.kpis || {};
  const cfg = run?.config || {};
  const fromCfg = parseInt(String(cfg.valuation_year ?? ''), 10);
  const baseYear = parseInt(String(cfg.base_year ?? ''), 10);
  const valuationYear = num(k.valuation_year)
    ?? (Number.isFinite(fromCfg) && fromCfg > 0 ? fromCfg : null)
    ?? (Number.isFinite(baseYear) && baseYear > 0 ? baseYear : null);
  const convention = k.discounting_convention || cfg.discounting_convention || 'end_year';
  const basis = k.pv_basis || cfg.present_value_basis || 'real';
  const ratePct = num(k.discount_rate_applied_pct);
  return { valuationYear, convention, basis, ratePct };
}

/** The flow a run's NPV discounts, by year, for the rows it values. */
function valuedFlows(run, basis) {
  const m = new Map();
  for (const row of run?.cashFlowData || []) {
    if (typeof row?.year !== 'number' || row.sunk === true) continue;
    const real = num(row.real_net_cash_flow);
    const nominal = num(row.net_cash_flow);
    const v = basis === 'real' ? (real ?? nominal) : nominal;
    if (v !== null) m.set(row.year, v);
  }
  return m;
}

/**
 * The second run minus the base run, valued on the base run's terms.
 * Returns null when either run has no yearly data.
 */
export function computeIncremental(base, second) {
  if (!base?.cashFlowData || !second?.cashFlowData) return null;
  const vb = valuationOf(base);
  const vs = valuationOf(second);
  const baseFlows = valuedFlows(base, vb.basis);
  const secondFlows = valuedFlows(second, vb.basis);
  const years = Array.from(new Set([...baseFlows.keys(), ...secondFlows.keys()])).sort((a, b) => a - b);
  if (years.length === 0) return null;

  let cum = 0;
  const rows = years.map((year) => {
    const delta = (secondFlows.get(year) || 0) - (baseFlows.get(year) || 0);
    cum += delta;
    return { year, delta, cumulative: cum };
  });

  const anchor = vb.valuationYear ?? years[0];
  const half = vb.convention === 'mid_year' ? 0.5 : 0;
  const times = rows.map((r) => (r.year - anchor) + half);
  const rate = vb.ratePct !== null ? vb.ratePct / 100 : null;
  const npv = rate !== null
    ? rows.reduce((s, r, i) => s + r.delta / Math.pow(1 + rate, times[i]), 0)
    : null;

  const irrResult = solveIrrInBand(rows.map((r) => r.delta), times);

  // Payback: years from the first valued year until the cumulative delta
  // turns non-negative for the first time after being negative.
  const payback = (() => {
    let running = 0;
    for (const row of rows) {
      const prev = running;
      running += row.delta;
      if (prev < 0 && running >= 0 && row.delta !== 0) {
        return (row.year - rows[0].year) + (-prev / row.delta);
      }
    }
    return running >= 0 && rows[0].delta >= 0 ? 0 : null;
  })();

  const mismatches = [];
  if (vb.basis !== vs.basis) mismatches.push('PV basis');
  if (vb.ratePct !== vs.ratePct) mismatches.push('discount rate');
  if (vb.valuationYear !== vs.valuationYear) mismatches.push('valuation year');
  if (vb.convention !== vs.convention) mismatches.push('discounting convention');

  return {
    rows,
    ratePct: vb.ratePct,
    valuationYear: vb.valuationYear,
    convention: vb.convention,
    npv,
    irr: irrResult.irr, // percent, or null
    irrStatus: irrResult.irrStatus,
    irrRoots: irrResult.irrRoots,
    irrRootAboveBand: irrResult.irrRootAboveBand,
    payback,
    mismatches,
  };
}

const pct = (v) => `${Number(v).toFixed(2)}%`;
const joinAnd = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

/** The incremental IRR tile value. */
export function incrementalIrrLabel(inc) {
  if (!inc) return 'N/A';
  if (inc.irr != null) return pct(inc.irr);
  if (inc.irrStatus === 'multiple-roots') return 'Several rates';
  return 'None';
}

/** One sentence under the tile when there is no single rate, or null. */
export function incrementalIrrNote(inc) {
  if (!inc || inc.irr != null) return null;
  switch (inc.irrStatus) {
  case 'multiple-roots': {
    const roots = (inc.irrRoots || []).map(pct);
    const listed = inc.irrRootAboveBand ? [...roots, 'a rate above 1000%'] : roots;
    const n = listed.length;
    return n >= 2
      ? `${COUNT[n] || n} rates zero the incremental NPV: ${joinAnd(listed)}. Read the incremental NPV.`
      : 'More than one rate zeroes the incremental NPV. Read the incremental NPV.';
  }
  case 'no-sign-change':
    return 'The incremental cash flow never changes sign, so it has no rate of return.';
  case 'above-clamp':
    return 'The incremental return is above 1000%, beyond the band searched.';
  case 'no-root':
    return 'No rate from -99% to 1000% zeroes the incremental NPV.';
  default:
    return null;
  }
}

export default computeIncremental;

/**
 * Money for the comparison page, to three significant figures like the
 * Results Viewer ($1.98M, -$459K, $2.44M). The page used whole compact units,
 * so a 2.44 MM increment read "$2.4M" and a 1.98 MM run "$2M". Values under
 * half a dollar are rounding noise from differencing two runs and read $0.
 */
export function fmtUsd3(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  const v = Math.abs(value) < 0.5 ? 0 : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 }).format(v);
}

/** One plain sentence for the decision the increment supports, or null. */
export function incrementVerdict(inc) {
  if (!inc || typeof inc.npv !== 'number' || !Number.isFinite(inc.npv)) return null;
  const at = typeof inc.ratePct === 'number' ? ` at ${inc.ratePct.toFixed(2)}%` : '';
  const amount = fmtUsd3(Math.abs(inc.npv));
  if (fmtUsd3(inc.npv) === '$0') return `On NPV${at}, ${inc.secondName} and ${inc.baseName} are worth the same.`;
  return inc.npv > 0
    ? `On NPV${at}, ${inc.secondName} is worth ${amount} more than ${inc.baseName}.`
    : `On NPV${at}, ${inc.secondName} is worth ${amount} less than ${inc.baseName}.`;
}
