/**
 * Owner decision 2026-10-14, option A (engine 3.12.3): the valuation date is
 * 31 December of the valuation year; mid-year cash is half a year before the
 * year end, so mid-year discounts it less than end of year. Gates through the
 * vendored engine on the Ekene kit case, and the wording the app prints.
 */
import fs from 'fs';
import path from 'path';
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import { computeIncremental } from '../epeIncremental';
import { valuationYearOf, valuedAtText, conventionText, CONVENTION_HELP } from '../epeValuation';
import { epeDiscountLine } from '../epeUnitValue';

const CASE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../../packages/engines/test-data/economics/ekene-epe-case.json'), 'utf8'));
const run = (convention, over = {}) => computeCashFlow({ ...CASE, ...over, cfg: { ...CASE.cfg, discounting_convention: convention } });

describe('mid-year on the Ekene case', () => {
  it('end of year is the kit NPV10; mid-year is larger by (1.1)^0.5', () => {
    const end = run('end_year');
    const mid = run('mid_year');
    expect(end.kpis.npv).toBeCloseTo(1980235.4787, 3);
    expect(mid.kpis.npv).toBeGreaterThan(end.kpis.npv);
    expect(mid.kpis.npv).toBeCloseTo(end.kpis.npv * Math.sqrt(1.1), 4);
  });

  it('the incremental NPV of two mid-year runs is the difference of their NPVs', () => {
    const noCapex = { capexRows: [] };
    const base = run('mid_year', noCapex);
    const second = run('mid_year');
    const inc = computeIncremental(
      { name: 'A', kpis: base.kpis, cashFlowData: base.cashFlowData, config: CASE.cfg },
      { name: 'B', kpis: second.kpis, cashFlowData: second.cashFlowData, config: CASE.cfg },
    );
    expect(inc.convention).toBe('mid_year');
    expect(inc.npv).toBeCloseTo(second.kpis.npv - base.kpis.npv, 4);
  });
});

describe('the wording', () => {
  it('valued at 31 December of the valuation year', () => {
    expect(valuationYearOf({ valuation_year: 2026 }, {})).toBe(2026);
    expect(valuationYearOf({}, { base_year: 2027 })).toBe(2027);
    expect(valuationYearOf({}, { valuation_year: '', base_year: '2028' })).toBe(2028);
    expect(valuedAtText(2026)).toBe('valued at 31 Dec 2026');
    expect(valuedAtText(null)).toBeNull();
    expect(conventionText('mid_year')).toBe('mid-year discounting');
    expect(conventionText('end_year')).toBe('end-year discounting');
    expect(CONVENTION_HELP).toMatch(/31 December of the valuation year[\s\S]*half a year before the year end/);
    expect(epeDiscountLine({ discountRatePct: 10, pvBasis: 'real', discounting: 'end_year' }, { valuationYear: 2026 })).toBe('10% real, end-year discounting, valued at 31 Dec 2026');
    expect(epeDiscountLine({ discountRatePct: 10, pvBasis: 'real', discounting: 'mid_year' })).toBe('10% real, mid-year discounting');
  });
});
