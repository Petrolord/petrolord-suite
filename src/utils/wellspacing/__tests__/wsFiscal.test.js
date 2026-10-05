/**
 * WS-U2-010: fiscal terms wired to calculateEconomics (it already supports
 * income tax with depreciation and loss carry-forward, and a PSC with a cost
 * recovery cap and a profit split); no fiscal maths in the app. Gates: the
 * default is the earlier royalty-only number; income tax against a hand
 * computation on the case's own arrays (mid-year); a PSC with 100 percent
 * cost recovery and 100 percent contractor profit oil and no tax is the
 * royalty-only case (identity); the net cash closes on the government take.
 * Negative control: the tax not passed through would leave the after-tax
 * NPV equal to the royalty-only one.
 */
import { calculateEconomics } from '@/utils/npvCalculations';
import { runSpacingCases, spacingEconomicsInputs, validateInputs } from '@/utils/wellSpacingCalculations';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs, SAMPLE_FORM } from '../model';

const S = { ...SAMPLE_FORM };
const at = (form, sp = 40) => runSpacingCases(form).spacingResults.find((r) => r.spacing === sp);

describe('WS-U2-010: fiscal terms through calculateEconomics', () => {
  it('royalty only stays the default and the earlier number', () => {
    expect(at(S).npv).toBeCloseTo(1885.787, 2);
    expect(at(S).economics.totalTax).toBe(0);
  });

  it('income tax: the NPV is a hand mid-year sum of the after-tax cash on the case arrays', () => {
    const form = { ...S, fiscalTerms: 'taxRoyalty', incomeTaxRate: '30' };
    const r = at(form);
    const e = spacingEconomicsInputs(40, runSpacingCases(form).parameters);
    expect(e.taxRate).toBe(30);
    let npv = 0;
    for (let i = 0; i < e.projectLife; i += 1) {
      const rev = (e.production.oil[i] * e.price.oil[i] + e.production.gas[i] * e.price.gas[i]) / 1e6;
      const net = rev * (1 - e.royaltyRate / 100);
      const taxable = net - e.opexFixed[i] - e.capex[i];
      const tax = taxable > 0 ? taxable * 0.3 : 0;
      npv += (net - e.opexFixed[i] - e.capex[i] - tax) / 1.1 ** (i + 0.5);
    }
    expect(r.npv).toBeCloseTo(npv, 6);
    expect(r.npv).toBe(calculateEconomics(e, { skipIrr: true }).metrics.npv);
    // NEGATIVE CONTROL: without the tax wired the NPV would be the royalty-only one
    expect(Math.abs(r.npv - at(S).npv)).toBeGreaterThan(100);
    const ec = r.economics;
    expect(ec.totalRevenue - ec.totalRoyalty - ec.totalTax - ec.totalGovProfit - ec.totalOpex - ec.totalCapex).toBeCloseTo(r.netCashUndiscounted, 9);
  });

  it('PSC: full cost recovery, all profit oil to the contractor and no tax is the royalty-only case; a split lowers it', () => {
    const base = at(S);
    const ident = at({ ...S, fiscalTerms: 'psc', incomeTaxRate: '0', costRecoveryCap: '100', contractorProfitShare: '100' });
    expect(ident.npv).toBeCloseTo(base.npv, 9);
    const split = at({ ...S, fiscalTerms: 'psc', incomeTaxRate: '0', costRecoveryCap: '60', contractorProfitShare: '60' });
    expect(split.npv).toBeLessThan(base.npv);
    expect(split.economics.totalGovProfit).toBeGreaterThan(0);
    const ec = split.economics;
    expect(ec.totalRevenue - ec.totalRoyalty - ec.totalTax - ec.totalGovProfit - ec.totalOpex - ec.totalCapex).toBeCloseTo(split.netCashUndiscounted, 9);
  });

  it('validation and the report', () => {
    expect(validateInputs({ ...S, fiscalTerms: 'psc', incomeTaxRate: '30' }).errors).toContain('Cost recovery cap is required for these fiscal terms.');
    expect(validateInputs({ ...S, fiscalTerms: 'taxRoyalty', incomeTaxRate: '130' }).errors).toContain('Income tax rate must be between 0 and 100 (%).');
    const inputs = defaultInputs('oilfield', { sample: true });
    inputs.form = { ...inputs.form, fiscalTerms: 'taxRoyalty', incomeTaxRate: '30', depreciationYears: '5' };
    const m = buildWellSpacingReportModel(inputs, { results: runSpacingCases(inputs.form) });
    expect(m.economics.head).toEqual(expect.arrayContaining(['Income tax', 'Government profit oil']));
    expect(m.economics.note).toMatch(/income tax 30 percent of revenue after royalty, opex and depreciation \(capex straight line over 5 years; losses not carried forward\)/);
    expect(m.limits.assumptions.join(' ')).toMatch(/Fiscal terms: royalty 25 percent/);
  });
});
