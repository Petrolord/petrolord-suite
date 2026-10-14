/**
 * The price each year received, in the Year-by-Year table and the exports
 * (video programme, 2026-10-14): a yearly deck could not be checked against
 * what the engine applied. The rows come from the vendored engine itself.
 */
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import { cashFlowColumns, fmtPrice } from '@/pages/apps/epe/EpeResultsViewer';

const CFG = {
  oil_price_usd_bbl: 75, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0, discount_rate_pct: 10, inflation_rate_pct: 0, base_year: 2026,
  fiscal_regime: 'JV', jv_working_interest_pct: 100, jv_royalty_pct: 10, jv_tax_rate_pct: 30,
  oil_price_escalator_pct: 0, gas_price_escalator_pct: 0, condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
  present_value_basis: 'real', oil_price_differential_usd_bbl: 1.5,
  price_deck: [{ year: 2026, oil: 65 }, { year: 2027, oil: 70 }, { year: 2028, oil: 75 }],
};
const prodRows = [0, 1, 2, 3].map((i) => ({ year: 2026 + i, oil_bbl: 40000 }));
const opexRows = prodRows.map((r) => ({ year: r.year, total_opex_usd: 500000 }));

describe('applied prices', () => {
  const { cashFlowData } = computeCashFlow({ cfg: CFG, prodRows, capexRows: [], opexRows });
  it('the engine reports the deck plus the differential, held after the last deck year', () => {
    expect(cashFlowData.map((r) => r.applied_oil_price)).toEqual([66.5, 71.5, 76.5, 76.5]);
  });
  it('the exports carry the applied prices beside the volumes', () => {
    const keys = cashFlowColumns(false, cashFlowData).map((c) => c.key);
    expect(keys.slice(0, 7)).toEqual(['year', 'oil_bbl', 'gas_mscf', 'condensate_bbl', 'applied_oil_price', 'applied_gas_price', 'applied_cond_price']);
  });
  it('negative control: rows without the field keep the old columns', () => {
    const old = cashFlowData.map(({ applied_oil_price, applied_gas_price, applied_cond_price, ...r }) => r); // eslint-disable-line no-unused-vars
    expect(cashFlowColumns(false, old).map((c) => c.key)).not.toContain('applied_oil_price');
  });
  it('price format', () => {
    expect(fmtPrice(66.5)).toBe('66.50');
    expect(fmtPrice(null)).not.toBe('0.00');
  });
});
