/**
 * W3 (D3): the Probabilistic Breakeven Analyzer under the Full precision
 * switch. Off, the percentile cards print 2 decimals as before and there is no
 * tornado table. On, the cards print 4 decimals and the tornado is a table.
 * Values come from the engine (generateBreakevenData), never restated.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { generateBreakevenData } from '@/utils/breakevenCalculations';
import { expandQuickInputs } from '@/utils/npvCalculations';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import ResultsPanel from '../ResultsPanel';

jest.mock('../BreakevenPlots', () => () => null);

// the UMUNEDE case of the NextGen uncertainty capstone, a smaller sample
const QUICK = { initialRate: 3900, declineRate: 10, oilPrice: 64, capex: 150, fixedOpex: 2.1, opexPerBbl: 14.5, royaltyRate: 17.5, taxRate: 38, discountRate: 13, startYear: 2028 };
let results;
beforeAll(() => {
  const inp = expandQuickInputs(QUICK);
  results = generateBreakevenData({
    iterations: 400, seed: 9031, discountRate: 13, royaltyRate: 17.5, taxRate: 38, targetNpv: 0,
    productionData: { data: inp.production.oil.map((q, i) => ({ year: 2028 + i, oil_production_bbl: q })) },
    variables: [
      { id: 1, name: 'Total CAPEX ($MM)', p10: 125, p50: 150, p90: 185 },
      { id: 2, name: 'Annual OPEX ($MM/year)', p10: 14, p50: 17.5, p90: 23 },
      { id: 3, name: 'Production Efficiency (%)', p10: 84, p50: 90, p90: 95 },
    ],
  });
});

test('off: percentile cards at 2 decimals, no tornado table', () => {
  render(<FullPrecisionProvider><ResultsPanel results={results} /></FullPrecisionProvider>);
  expect(screen.getByText(results.kpis.p10.toFixed(2))).toBeTruthy();
  expect(screen.getByText(results.kpis.p90.toFixed(2))).toBeTruthy();
  expect(screen.queryByTestId('breakeven-tornado-table')).toBeNull();
  expect(screen.queryByTestId('breakeven-base-full')).toBeNull();
});

test('on: percentile cards at 4 decimals and the tornado as a table', () => {
  render(<FullPrecisionProvider initial><ResultsPanel results={results} /></FullPrecisionProvider>);
  expect(screen.getByText(formatFull(results.kpis.p10, 4))).toBeTruthy();
  expect(screen.getByText(formatFull(results.kpis.p50, 4))).toBeTruthy();
  expect(screen.getByText(formatFull(results.kpis.p90, 4))).toBeTruthy();
  const t = screen.getByTestId('breakeven-tornado-table');
  const i = results.tornadoData.y.indexOf('Total CAPEX');
  const row = within(t).getByText('Total CAPEX').closest('tr');
  expect(within(row).getByText(formatFull(results.tornadoData.high[i], 4))).toBeTruthy();
  expect(within(row).getByText(formatFull(results.tornadoData.low[i], 4))).toBeTruthy();
  expect(screen.getByTestId('breakeven-base-full').textContent).toContain(formatFull(results.baseBreakeven, 4));
});
