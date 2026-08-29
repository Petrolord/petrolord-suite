/**
 * Page smoke tests for the rest of the Economics module (Economics E2).
 *
 * The module shipped twelve routed, sold apps with zero page-level tests. A
 * unit test on an engine cannot see a broken import, a renamed prop, a
 * component deleted out from under a page, or a header that throws before the
 * first paint. Those are exactly the failures that reach a paying user, and
 * they are what these catch.
 *
 * Every economics page is mounted here, including the ones whose product work
 * belongs to a later phase (FDP Accelerator is E3; Project Management Pro,
 * AFE Cost Control Manager and Technical Report Autopilot are E4). Mounting
 * them costs little and means a later phase starts from a page known to
 * render rather than one nobody has run.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// A chainable query builder that resolves to an empty result whatever the
// caller does with it, so a page's data fetching neither throws nor hangs.
const emptyResult = { data: [], error: null };
const makeQuery = () => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in', 'gte', 'lte', 'not', 'is']
    .forEach((m) => { q[m] = jest.fn(chain); });
  q.single = jest.fn().mockResolvedValue({ data: null, error: null });
  q.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  q.then = (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject);
  return q;
};

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => makeQuery()),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'tester@example.com' }, session: null, loading: false }),
  SupabaseAuthProvider: ({ children }) => children,
}));

import DecisionStudio from '@/pages/apps/DecisionStudio';
import DecisionTreeBuilder from '@/pages/apps/DecisionTreeBuilder';
import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';
import FiscalRegimeDesigner from '@/pages/apps/FiscalRegimeDesigner';
import AfeCostControlManager from '@/pages/apps/AfeCostControlManager';
import TechnicalReportAutopilot from '@/pages/apps/TechnicalReportAutopilot';
import ProjectManagementPro from '@/pages/apps/ProjectManagementPro';
import FDPAccelerator from '@/pages/apps/FDPAccelerator';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = (Component) => render(<MemoryRouter><Component /></MemoryRouter>);

describe('Economics pages mount', () => {
  it('Decision Studio renders its shell and its help guide', async () => {
    mount(DecisionStudio);
    expect(await screen.findByText('Decision Studio')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('Decision Tree Builder renders a tree from the default template', async () => {
    mount(DecisionTreeBuilder);
    expect(await screen.findByText('Decision Tree Builder')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
    // The default template rolls back on mount, so an EMV must be on screen.
    // A tree that throws would leave the error path instead.
    expect(screen.queryByText(/Decision and chance nodes need/i)).not.toBeInTheDocument();
  });

  it('Capital Portfolio Studio renders its portfolio rail', async () => {
    mount(CapitalPortfolioStudio);
    expect(await screen.findByText('Capital Portfolio Studio')).toBeInTheDocument();
    expect(screen.getByText('Portfolios')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('Fiscal Regime Designer renders its setup panel', async () => {
    mount(FiscalRegimeDesigner);
    // The name appears as the page h1 and again as the input panel's h2.
    expect(await screen.findByRole('heading', { level: 1, name: 'Fiscal Regime Designer' })).toBeInTheDocument();
    expect(screen.getByText('Build & Compare Petroleum Fiscal Terms')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('AFE Cost Control Manager renders without an AFE selected', async () => {
    mount(AfeCostControlManager);
    expect(await screen.findByRole('heading', { name: /AFE & Cost Control/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New AFE/i })).toBeInTheDocument();
  });

  it('Technical Report Autopilot renders', async () => {
    mount(TechnicalReportAutopilot);
    expect(await screen.findByText(/Report/i)).toBeInTheDocument();
  });

  it('Project Management Pro renders', async () => {
    mount(ProjectManagementPro);
    expect(await screen.findByRole('heading', { name: 'Project Management Pro' })).toBeInTheDocument();
  });

  it('FDP Accelerator renders through its provider and layout', async () => {
    // A 33-line page over ~11k LOC of context, layout and modules. The E3
    // slim rebuild starts here, so it needs to be known to mount first.
    mount(FDPAccelerator);
    expect((await screen.findAllByText(/FDP|Field Development/i)).length).toBeGreaterThan(0);
  });
});
