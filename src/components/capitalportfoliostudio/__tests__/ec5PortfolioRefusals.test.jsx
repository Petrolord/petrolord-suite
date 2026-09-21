/**
 * EC5-6 and EC5-7 (engines #185) in Capital Portfolio Studio.
 *
 * A pos that is present but blank, non-numeric or outside 0 to 1 is refused
 * by project name, and so is a capex that is not a finite number of 0 or
 * more. `projectEmv` throws for a bad pos and the workbench table calls it
 * while rendering, so the page reads every project through a helper and
 * shows the refusal instead of crashing.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args) => mockToast(...args),
}));

const mockTables = { portfolio_projects: [], portfolios: [] };
const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'update', 'upsert', 'delete', 'in', 'insert'].forEach((m) => { q[m] = jest.fn(chain); });
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

import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';
import { emvOrRefusal, projectRefusal, posText } from '../projectRefusal';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  mockToast.mockClear();
  mockTables.portfolio_projects = [];
  mockTables.portfolios = [];
});

describe('the engine refusals, read safely', () => {
  it('names the project for a blank, non-numeric or out-of-range pos', () => {
    expect(emvOrRefusal({ name: 'Alpha', capex: 10, npv_p50: 100, pos: '' }).refusal)
      .toBe('Project "Alpha" has a blank pos; pos must be a number from 0 to 1');
    expect(emvOrRefusal({ name: 'Beta', capex: 10, npv_p50: 100, pos: 'n/a' }).refusal)
      .toMatch(/Project "Beta" has a pos that is not a number \("n\/a"\)/);
    expect(emvOrRefusal({ name: 'Gamma', capex: 10, npv_p50: 100, pos: 1.4 }).refusal)
      .toMatch(/Project "Gamma" has a pos outside 0 to 1 \(1.4\)/);
  });

  it('negative control: a good project returns its risked EMV and no refusal', () => {
    const good = { name: 'Delta', capex: 10, npv_p50: 300, pos: 0.3, fail_cost: 50 };
    const { emv, refusal } = emvOrRefusal(good);
    expect(refusal).toBeNull();
    expect(emv).toBeCloseTo(0.3 * 300 - 0.7 * 50, 9);
    expect(projectRefusal(good)).toBeNull();
    // A missing pos keeps the documented default of certainty.
    expect(emvOrRefusal({ name: 'Eps', capex: 1, npv_p50: 100 }).emv).toBe(100);
  });

  it('refuses a capex that is not a finite number of 0 or more', () => {
    expect(projectRefusal({ name: 'Bad', capex: 'abc', npv_p50: 10 }))
      .toMatch(/Project "Bad" has a capex that is not a finite number \("abc"\)/);
    expect(projectRefusal({ name: 'Neg', capex: -5, npv_p50: 10 })).toMatch(/negative capex/);
    expect(projectRefusal({ name: 'None', npv_p50: 10 })).toMatch(/has no capex/);
  });

  it('prints the chance of success, or n/a when it is the refused field', () => {
    expect(posText({ pos: 0.35 })).toBe('35%');
    expect(posText({})).toBe('100%');
    expect(posText({ pos: '' }, 'Project "A" has a blank pos; pos must be a number from 0 to 1')).toBe('n/a');
  });
});

describe('the workbench page', () => {
  it('lists the refusal and renders instead of crashing', async () => {
    mockTables.portfolios = [{ id: 'pf1', name: 'Plan', capex_limit: 100 }];
    mockTables.portfolio_projects = [
      { id: 'x1', name: 'Bad Pos', capex: 10, npv_p50: 100, pos: 1.4 },
      { id: 'x2', name: 'Good', capex: 10, npv_p50: 100, pos: 0.5 },
    ];
    render(<MemoryRouter><CapitalPortfolioStudio /></MemoryRouter>);
    const plan = await screen.findByText('Plan');
    plan.click();
    await waitFor(() => expect(screen.getByTestId('portfolio-refusals')).toBeInTheDocument());
    expect(screen.getByTestId('portfolio-refusals'))
      .toHaveTextContent('Project "Bad Pos" has a pos outside 0 to 1 (1.4)');
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('negative control: a portfolio of good projects shows no refusal banner', async () => {
    mockTables.portfolios = [{ id: 'pf1', name: 'Plan', capex_limit: 100 }];
    mockTables.portfolio_projects = [{ id: 'x2', name: 'Good', capex: 10, npv_p50: 100, pos: 0.5 }];
    render(<MemoryRouter><CapitalPortfolioStudio /></MemoryRouter>);
    const plan = await screen.findByText('Plan');
    plan.click();
    await waitFor(() => expect(screen.getByText('Good')).toBeInTheDocument());
    expect(screen.queryByTestId('portfolio-refusals')).not.toBeInTheDocument();
  });
});
