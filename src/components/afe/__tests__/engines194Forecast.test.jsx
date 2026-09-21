/**
 * EC5-1, the negative-forecast flag, EC5-9b and the exact knapsack
 * (engines #194) in the AFE and portfolio screens.
 *
 * An entered forecast below the money already spent and committed is kept,
 * because a re-baseline is legitimate, but it reports a saving on money
 * already gone, so the line and the tile say so. A negative entered forecast
 * is ignored in favour of the standard rule, and the line says that too.
 * The S-curve closes at the window end, so an overrun cannot draw as an
 * underrun. The portfolio knapsack is solved exactly, so there is no grid
 * resolution to report and the funded set cannot exceed the limit.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args) => mockToast(...args),
}));
jest.mock('@/lib/customSupabaseClient', () => {
  const makeQuery = () => {
    const q = {};
    const chain = () => q;
    ['select', 'eq', 'order', 'limit', 'update', 'upsert', 'delete', 'in', 'insert'].forEach((m) => { q[m] = jest.fn(chain); });
    q.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn(() => makeQuery()),
    },
  };
});

import AFEDashboard, { forecastFlagText } from '@/components/afe/AFEDashboard';
import CostBreakdownTab from '@/components/afe/CostBreakdownTab';
import OptimizationResults from '@/components/capitalportfoliostudio/OptimizationResults';
import { calculateMetrics, generateSCurveData, itemForecastCheck } from '@/utils/costControlCalculations';
import { optimizePortfolio } from '@/utils/portfolioOptimizer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const AFE = { start_date: '2026-01-01', end_date: '2026-12-31', currency: 'USD' };
// A line re-baselined below what is already spent and committed, and a line
// whose negative forecast the engine ignores.
const ITEMS = [
  { id: 'i1', code: 'D-100', description: 'Drilling', budget: 1000, actual: 800, commitment: 100, forecast: 600, progress: 50 },
  { id: 'i2', code: 'C-200', description: 'Completion', budget: 500, actual: 100, forecast: -50, progress: 10 },
  { id: 'i3', code: 'F-300', description: 'Facilities', budget: 400, actual: 100, forecast: 450, progress: 20 },
];

describe('a forecast below what is already committed', () => {
  it('is kept, and flagged with how far below it sits', () => {
    const check = itemForecastCheck(ITEMS[0]);
    expect(check.forecast).toBe(600);
    expect(check.committed).toBe(900);
    expect(check.forecastBelowCommitted).toBe(true);
    expect(check.forecastBelowCommittedBy).toBe(300);
  });

  it('negative control: a forecast above committed is not flagged', () => {
    const check = itemForecastCheck(ITEMS[2]);
    expect(check.forecastBelowCommitted).toBe(false);
    expect(check.forecastIgnored).toBeNull();
  });

  it('a negative forecast is ignored in favour of the standard rule, and said so', () => {
    const check = itemForecastCheck(ITEMS[1]);
    expect(check.forecastIgnored).toBe('negative');
    expect(check.forecast).toBe(500);
  });
});

describe('the dashboard', () => {
  it('counts both flags beside the estimate at completion', () => {
    const metrics = calculateMetrics(AFE, ITEMS, [], '2026-06-30');
    expect(metrics.linesForecastBelowCommitted).toBe(1);
    expect(metrics.linesForecastIgnored).toBe(1);
    expect(forecastFlagText(metrics))
      .toBe('1 line forecast below committed, 1 negative forecast ignored');

    render(<AFEDashboard afe={AFE} costItems={ITEMS} invoices={[]} />);
    const eac = screen.getByText('EAC (Forecast)').closest('.p-5');
    expect(within(eac).getByText('1 line forecast below committed, 1 negative forecast ignored'))
      .toBeInTheDocument();
  });

  it('negative control: clean lines leave the variance subtext in place', () => {
    const clean = [{ id: 'x', code: 'X', budget: 100, actual: 10, progress: 10 }];
    const metrics = calculateMetrics(AFE, clean, [], '2026-06-30');
    expect(forecastFlagText(metrics)).toBeNull();
    render(<AFEDashboard afe={AFE} costItems={clean} invoices={[]} />);
    const eac = screen.getByText('EAC (Forecast)').closest('.p-5');
    expect(within(eac).getByText(/^Variance:/)).toBeInTheDocument();
  });
});

describe('the S-curve', () => {
  it('closes at the window end on the full budget, so an overrun cannot draw as an underrun', () => {
    const points = generateSCurveData(AFE, [{ budget: 1200 }], [], '2026-06-30');
    const last = points[points.length - 1];
    expect(last.windowEnd).toBe(true);
    expect(last.Planned).toBe(1200);
    // Every point carries the flag, so a reader can tell the closing point.
    points.slice(0, -1).forEach((p) => expect(p.windowEnd).toBe(false));
  });
});

describe('the cost breakdown lines', () => {
  it('marks the re-baselined line and the ignored negative forecast', () => {
    render(<CostBreakdownTab afeId="a1" costItems={ITEMS} onRefresh={() => {}} />);
    expect(screen.getByTestId('below-committed-i1'))
      .toHaveTextContent('below spent and committed');
    expect(screen.getByTestId('forecast-ignored-i2'))
      .toHaveTextContent('negative forecast ignored, standard rule used');
    // Negative control: the clean line carries neither mark.
    expect(screen.queryByTestId('below-committed-i3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forecast-ignored-i3')).not.toBeInTheDocument();
  });
});

describe('the portfolio answer', () => {
  const result = optimizePortfolio({
    projects: [
      { id: 'A', name: 'A', capex: 4000, npv_p50: 500 },
      { id: 'B', name: 'B', capex: 2002, npv_p50: 300 },
      { id: 'C', name: 'C', capex: 1995, npv_p50: 280 },
    ],
    capexLimit: 6000,
  });

  it('is exact, so no grid resolution is shown and no overshoot is claimed', () => {
    expect(result.solveMethod).toBe('exact');
    render(<OptimizationResults result={result} />);
    expect(screen.getByTestId('exact-solve')).toHaveTextContent('Solved exactly on the capital figures');
    expect(screen.queryByTestId('grid-resolution')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overlimit-warning')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/exceeds the limit/);
  });

  it('negative control: a grid fallback would say so and bound what it left', () => {
    render(<OptimizationResults result={{
      ...result, solveMethod: 'grid-feasible', resolution: 3, optimalityGap: 12,
    }} />);
    expect(screen.getByTestId('grid-resolution'))
      .toHaveTextContent('too large to solve exactly');
    expect(screen.getByTestId('grid-resolution')).toHaveTextContent('12 $MM');
    expect(screen.queryByTestId('exact-solve')).not.toBeInTheDocument();
  });
});
