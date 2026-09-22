/**
 * W3 (D3): the Fiscal Regime Designer under the Full precision switch. Off,
 * the summary prints 1 decimal and has no tax column. On, NPV and government
 * cash flow print 4 decimals and each regime's total tax appears, read from
 * the engine's own annual ledger (runFiscalComparison).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { runFiscalComparison } from '@/utils/fiscalDesignerCalculations';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import ResultsPanel from '../ResultsPanel';

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  const ResponsiveContainer = ({ children }) => React.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});
beforeAll(() => { global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });

// the URUAN case of the NextGen fiscal capstone (intermediate)
const URUAN = {
  production: { oil: { initial: 5200, decline: 11 }, gas: { initial: 65, decline: 7 }, ngl: { initial: 480, decline: 13 } },
  prices: [{ year: 1, oil: 58, gas: 3.2, ngl: 27 }, { year: 8, oil: 72, gas: 4.1, ngl: 34 }],
  costs: { capex: { drilling: 185, facilities: 95, subsea: 35 }, opex: { fixed: 9, variable: 6.5 } },
  discountRate: 11,
};
const CONCESSION = { id: 'uruan_concession', name: 'URUAN concession', royalty: { type: 'flat', rate: 14 }, costRecoveryLimit: 100, profitSplit: { type: 'flat', split: 100 }, tax: { cit: 28, rrt: 0, minTax: 0 } };
const PSC = {
  id: 'uruan_psc', name: 'URUAN production sharing contract',
  royalty: { type: 'sliding_price', tiers: [{ threshold: 0, rate: 6 }, { threshold: 60, rate: 9.5 }] },
  costRecoveryLimit: 65,
  profitSplit: { type: 'tiered_r_factor', tiers: [{ threshold: 1.0, split: 65 }, { threshold: 1.4, split: 45 }, { threshold: 1.65, split: 32 }] },
  tax: { cit: 32, rrt: 0, minTax: 0 },
};

let results;
beforeAll(async () => { results = await runFiscalComparison({ projectInputs: URUAN, regimes: [CONCESSION, PSC] }); });
const rowOf = (name) => screen.getByText(name).closest('tr');

test('off: 1 decimal and no tax column', () => {
  render(<FullPrecisionProvider><ResultsPanel results={results} /></FullPrecisionProvider>);
  const s = results.summary.find((r) => r.id === PSC.id);
  expect(within(rowOf(PSC.name)).getByText(s.npv.toFixed(1))).toBeTruthy();
  expect(screen.queryByTestId('fiscal-total-tax-head')).toBeNull();
  expect(screen.queryByTestId('fiscal-total-tax')).toBeNull();
});

test('on: total tax per regime, NPV and government cash flow at 4 decimals', () => {
  render(<FullPrecisionProvider initial><ResultsPanel results={results} /></FullPrecisionProvider>);
  results.summary.forEach((s) => {
    const ledger = results.annualCashFlows.find((d) => d.regimeId === s.id).data;
    const tax = ledger.reduce((a, r) => a + r.tax, 0);
    const row = rowOf(s.name);
    expect(within(row).getByTestId('fiscal-total-tax').textContent).toBe(formatFull(tax, 4));
    expect(within(row).getByText(formatFull(s.npv, 4))).toBeTruthy();
    expect(within(row).getByText(formatFull(s.govTake, 4))).toBeTruthy();
  });
  // the PSC total tax is the graded psc_total_tax_musd; it reads to 4 dp
  const psc = screen.getAllByTestId('fiscal-total-tax')[results.summary.findIndex((s) => s.id === PSC.id)];
  expect(psc.textContent).toMatch(/^\d+\.\d{4}$/);
});
