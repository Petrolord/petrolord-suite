/**
 * EC5-0 gates for Capital Portfolio Studio (owner decision 2026-09-14).
 *
 * The engine now computes the loss probability and the P90 / P10 from a
 * seeded Monte Carlo, flags a funded set that overshoots the capex limit on
 * the quantised grid, and refuses a negative capex. These pin the app side:
 * the cards state method, iterations and seed; the overshoot warning renders
 * from the real engine on the D3-shaped case; a negative capex never reaches
 * the database and never crashes the page.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args) => mockToast(...args),
}));

const mockTables = { portfolio_projects: [], portfolios: [] };
const mockInsert = jest.fn();
const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'update', 'upsert', 'delete', 'in'].forEach((m) => { q[m] = jest.fn(chain); });
  q.insert = jest.fn((...args) => { mockInsert(table, ...args); return q; });
  q.then = (resolve, reject) => Promise.resolve({ data: mockTables[table] || [], error: null }).then(resolve, reject);
  return q;
};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((table) => makeQuery(table)),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: null, loading: false }),
}));

import OptimizationResults, { riskMethodLabel } from '@/components/capitalportfoliostudio/OptimizationResults';
import ProjectForm from '@/components/capitalportfoliostudio/ProjectForm';
import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';
import { optimizePortfolio } from '@/utils/portfolioOptimizer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  mockToast.mockClear();
  mockInsert.mockClear();
});

const D3_PROJECTS = [
  { id: 'A', name: 'A', capex: 4000, npv_p50: 500 },
  { id: 'B', name: 'B', capex: 2002, npv_p50: 300 },
  { id: 'C', name: 'C', capex: 1995, npv_p50: 280 },
];

describe('risk cards', () => {
  it('state the method, the iteration count and the seed', () => {
    const result = optimizePortfolio({
      projects: [{ id: 'W', name: 'Wildcat', capex: 10, npv_p50: 300, pos: 0.3, fail_cost: 50 }],
      capexLimit: 100,
    });
    render(<OptimizationResults result={result} />);
    const labels = screen.getAllByTestId('risk-method');
    expect(labels).toHaveLength(2);
    labels.forEach((el) => expect(el).toHaveTextContent('Monte Carlo, 10,000 iterations, seed 20260829'));
    expect(screen.getByText('NPV P90 (low) / P10 (high)')).toBeInTheDocument();
    // The single wildcat's loss chance is its failure chance, about 70 percent.
    expect(screen.getByText('69.6%')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/normal approximation/i);
  });

  it('builds the label from the engine fields', () => {
    expect(riskMethodLabel({ method: 'monte-carlo', iterations: 2000, seed: 7 }))
      .toBe('Monte Carlo, 2,000 iterations, seed 7');
  });
});

// EC5 (engines #194) retired the quantized grid for any portfolio the exact
// solver can hold: the D3 case that used to overshoot the limit by 2 now
// returns the best set that fits, there is no resolution to report, and no
// screen claims a funded set can exceed the limit.
describe('the exact solve', () => {
  it('funds the best set that fits on the D3 case, and shows no grid or overshoot', () => {
    const result = optimizePortfolio({ projects: D3_PROJECTS, capexLimit: 6000 });
    expect(result.solveMethod).toBe('exact');
    expect(result.overLimit).toBe(false);
    expect(result.totalCapex).toBeLessThanOrEqual(6000);
    render(<OptimizationResults result={result} />);
    expect(screen.getByTestId('exact-solve')).toHaveTextContent('Solved exactly on the capital figures');
    expect(screen.queryByTestId('grid-resolution')).not.toBeInTheDocument();
    expect(screen.queryByTestId('overlimit-warning')).not.toBeInTheDocument();
  });

  it('says so too when the whole set fits', () => {
    const result = optimizePortfolio({ projects: D3_PROJECTS, capexLimit: 8000 });
    expect(result.overLimit).toBe(false);
    expect(result.optimalityGap).toBe(0);
    render(<OptimizationResults result={result} />);
    expect(screen.queryByTestId('overlimit-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('exact-solve')).toBeInTheDocument();
  });

  it('negative control: a grid fallback still reports its resolution and its gap', () => {
    const result = optimizePortfolio({ projects: D3_PROJECTS, capexLimit: 6000 });
    render(<OptimizationResults result={{
      ...result, solveMethod: 'grid-feasible', resolution: 3, optimalityGap: 12,
    }} />);
    expect(screen.getByTestId('grid-resolution')).toHaveTextContent('resolution of 3 $MM');
    expect(screen.getByTestId('grid-resolution')).toHaveTextContent('12 $MM');
    expect(screen.queryByTestId('exact-solve')).not.toBeInTheDocument();
  });
});

describe('negative capex', () => {
  it('ProjectForm sets min 0 and refuses a negative capex on submit', async () => {
    const onSave = jest.fn();
    render(<ProjectForm project={null} onSave={onSave} onCancel={() => {}} />);
    const capex = screen.getByLabelText('CAPEX ($MM)');
    expect(capex).toHaveAttribute('min', '0');
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Neg', name: 'name' } });
    fireEvent.change(capex, { target: { value: '-5', name: 'capex' } });
    fireEvent.change(screen.getByLabelText('NPV P90 ($MM)'), { target: { value: '1', name: 'npv_p90' } });
    fireEvent.change(screen.getByLabelText('NPV P50 ($MM)'), { target: { value: '2', name: 'npv_p50' } });
    fireEvent.change(screen.getByLabelText('NPV P10 ($MM)'), { target: { value: '3', name: 'npv_p10' } });
    fireEvent.submit(capex.closest('form'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'CAPEX cannot be negative' })));
    expect(mockInsert).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the page shows the PortfolioInputError as a destructive toast instead of crashing', async () => {
    mockTables.portfolios = [{ id: 'pf1', name: 'Plan', capex_limit: 100 }];
    mockTables.portfolio_projects = [{ id: 'x1', name: 'Bad Project', capex: -5, npv_p50: 10 }];
    render(<MemoryRouter><CapitalPortfolioStudio /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Plan'));
    await screen.findByText('Bad Project');
    fireEvent.click(screen.getByRole('button', { name: /Run Optimization/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive',
      description: expect.stringMatching(/negative capex/),
    })));
    expect(screen.getByText('Capital Portfolio Studio')).toBeInTheDocument();
    expect(screen.queryByText('Optimal Portfolio')).not.toBeInTheDocument();
  });
});
