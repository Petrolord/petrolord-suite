/**
 * W3 (NextGen graded-field follow-on, D3 and §1): Full precision in the
 * Capital Portfolio Studio and the AFE dashboard, plus the AFE as-of date.
 * Off, every card prints as before. On, the graded quantities print at the
 * course's precision. Every expected "on" value is computed here by calling
 * the engine on the course case, never restated as a formula.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import OptimizationResults from '@/components/capitalportfoliostudio/OptimizationResults';
import AFEDashboard, { resolveDashboardAsOf, todayIsoDate, spiTile, cpiTile } from '@/components/afe/AFEDashboard';
import { optimizePortfolio, projectEmv } from '@/utils/portfolioOptimizer';
import { calculateMetrics } from '@/utils/costControlCalculations';
import { formatFull } from '@/lib/fullPrecision';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

// The NextGen portfolio beginner capstone case (IDOHO), $MM.
const IDOHO = [
  ['ID-1', 145, 118.4, 0.92, 14.6], ['ID-2', 215, 163.7, 0.86, 23.8], ['ID-3', 105, 388.5, 0.3, 72.4],
  ['ID-4', 265, 231.9, 0.78, 46.3], ['ID-5', 75, 47.3, 0.97, 5.1], ['ID-6', 340, 402.6, 0.5, 131.5],
  ['ID-7', 190, 121.2, 0.88, 18.7],
].map(([id, capex, npv, pos, loss]) => ({ id, name: id, capex, npv_p50: npv, pos, fail_cost: loss }));

const metric = (title) => screen.getAllByText(title).find((el) => el.tagName === 'P').nextSibling;

describe('Capital Portfolio Studio', () => {
  const result = optimizePortfolio({ projects: IDOHO, capexLimit: 520 });

  it('off: the cards print whole $MM as before', () => {
    render(<FullPrecisionProvider><OptimizationResults result={result} /></FullPrecisionProvider>);
    expect(metric('Risked EMV').textContent).toBe('$344 MM');
  });

  it('on: risked EMV, success NPV, P90 / P10 and the funded EMV column at 4 decimals', () => {
    render(<FullPrecisionProvider initial><OptimizationResults result={result} /></FullPrecisionProvider>);
    // the course key 344.326 (tol 0.001) is what the engine returns
    expect(Math.abs(result.totalEmv - 344.326)).toBeLessThan(1e-9);
    expect(metric('Risked EMV').textContent).toBe(`${formatFull(result.totalEmv, 4)} $MM`);
    expect(metric('Success-case NPV').textContent).toBe(`${formatFull(result.totalNpvSuccess, 4)} $MM`);
    expect(metric('NPV P90 (low) / P10 (high)').textContent)
      .toBe(`${formatFull(result.risk.p90, 4)} / ${formatFull(result.risk.p10, 4)}`);
    // the funded-project table's EMV column
    const funded = result.optimalProjects[0];
    expect(screen.getByText(funded.name).closest('tr').textContent).toContain(`${formatFull(projectEmv(funded), 4)} $MM`);
    expect(document.body.textContent).not.toMatch(/\d,\d{3}\.\d{4}/);
  });
});

// The NextGen portfolio intermediate capstone case (IDOHO-2 AFE), USD.
const AFE = { id: 'idoho2', start_date: '2028-03-06', end_date: '2029-01-19', currency: 'USD' };
const ITEMS = [
  { code: 'RIG-01', budget: 11384650, commitment: 1937400, actual: 8215730, progress: 67.5 },
  { code: 'TUB-02', budget: 2963180, commitment: 0, actual: 3148920, progress: 100 },
  { code: 'CEM-03', budget: 1476325, commitment: 412600, actual: 688140, forecast: 1591870, progress: 48 },
  { code: 'EVL-04', budget: 3208470, commitment: 1265300, actual: 1418260, progress: 37.5 },
  { code: 'CPL-05', budget: 4719850, commitment: 873900, actual: 0, progress: 0 },
];
const card = (title) => screen.getByText(title).closest('.p-5');

describe('AFE dashboard', () => {
  it('the as-of input defaults to today, so the dashboard reads as before', () => {
    render(<FullPrecisionProvider><AFEDashboard afe={AFE} costItems={ITEMS} invoices={[]} /></FullPrecisionProvider>);
    expect(screen.getByTestId('afe-as-of')).toHaveValue(todayIsoDate());
  });

  it('a typed as-of date measures SPI at that date; on prints CPI and SPI at 6 decimals', () => {
    const m = calculateMetrics(AFE, ITEMS, [], '2028-10-03');
    // the course keys (tol 1e-5) come from the engine at the stated date
    expect(Math.abs(m.spi - 0.7994222620522224)).toBeLessThan(1e-9);
    expect(Math.abs(m.cpi - 0.9323423935031048)).toBeLessThan(1e-9);
    render(<FullPrecisionProvider initial><AFEDashboard afe={AFE} costItems={ITEMS} invoices={[]} /></FullPrecisionProvider>);
    fireEvent.change(screen.getByTestId('afe-as-of'), { target: { value: '2028-10-03' } });
    expect(within(card('SPI (Schedule Efficiency)')).getByText(formatFull(m.spi, 6))).toBeInTheDocument();
    expect(within(card('CPI (Cost Efficiency)')).getByText(formatFull(m.cpi, 6))).toBeInTheDocument();
  });

  it('off at the same date prints 2 decimals as before', () => {
    const m = calculateMetrics(AFE, ITEMS, [], '2028-10-03');
    render(<FullPrecisionProvider><AFEDashboard afe={AFE} costItems={ITEMS} invoices={[]} /></FullPrecisionProvider>);
    fireEvent.change(screen.getByTestId('afe-as-of'), { target: { value: '2028-10-03' } });
    expect(within(card('SPI (Schedule Efficiency)')).getByText(m.spi.toFixed(2))).toBeInTheDocument();
    expect(spiTile(AFE, m).value).toBe(m.spi.toFixed(2));
    expect(cpiTile(m).value).toBe(m.cpi.toFixed(2));
  });

  it('a blank or unreadable as-of falls back to today', () => {
    expect(resolveDashboardAsOf('', '2026-01-02')).toBe('2026-01-02');
    expect(resolveDashboardAsOf('2028-13-45', '2026-01-02')).toBe('2026-01-02');
    expect(resolveDashboardAsOf('2028-10-03', '2026-01-02')).toBe('2028-10-03');
  });
});
