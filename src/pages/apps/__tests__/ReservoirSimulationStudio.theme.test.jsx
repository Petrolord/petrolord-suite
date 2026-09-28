/**
 * Design system rollout batch 2A: Reservoir Simulation Studio opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration; the walk below repeats the legacy check on
 * every tab (the builder with a deviated well and production history open,
 * the runs table with its failure and log), in the help drawer and the
 * new-case dialog, and confirms the 3D preview sits on a dark canvas.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const CASE_ROW = {
  id: 'case-1', user_id: 'u1', name: 'SPE1 demo', description: '',
  deck_source: 'template', template_slug: 'SPE1CASE1',
  deck_path: 'u1/case-1/deck/SPE1CASE1.DATA', deck_bytes: 12000,
  created_at: '2026-08-26T00:00:00Z', updated_at: '2026-08-26T00:00:00Z',
};
const RUN_ROW = {
  id: 'run-11111111', case_id: 'case-1', user_id: 'u1', status: 'failed',
  cancel_requested: false, attempt: 1, queued_at: '2026-08-26T01:00:00Z',
  failure_stage: 'sim_failed', error_message: 'The simulator reported an error:\nError: unknown keyword FOO',
  elapsed_seconds: 12, report_steps: null, result_path: null,
  log_path: 'u1/case-1/runs/run-1/prt_excerpt.txt', opm_version: 'flow 2026.04',
};

const queryResult = (table) => (table === 'sim_cases' ? [CASE_ROW] : [RUN_ROW]);

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    rpc: jest.fn().mockResolvedValue({ data: 'run-2', error: null }),
    from: jest.fn((table) => {
      const chain = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: queryResult(table), error: null }),
        single: () => Promise.resolve({ data: CASE_ROW, error: null }),
        then: (resolve) => resolve({ data: queryResult(table), error: null }),
      };
      return chain;
    }),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        download: jest.fn().mockResolvedValue({
          // jsdom Blob lacks .text(); a thenable text() double is enough.
          data: { text: () => Promise.resolve('RUNSPEC\nDIMENS\n 10 10 3 /\nEND\n') },
          error: null,
        }),
      })),
    },
  },
}));

import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import ReservoirSimulationStudio from '@/pages/apps/ReservoirSimulationStudio';

const renderApp = () => render(<MemoryRouter><ReservoirSimulationStudio /></MemoryRouter>);
const ready = () => screen.findByText('SPE1 demo');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Reservoir Simulation Studio',
  route: '/dashboard/apps/reservoir/reservoir-simulation-studio',
  renderApp,
  ready,
  scopeTestId: 'sim-theme-scope',
});

describe('Reservoir Simulation Studio theme, every tab and overlay', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour on the deck, builder, runs and results tabs', async () => {
    renderApp();
    await ready();
    await waitFor(() => expect(screen.getByTestId('deck-editor').value).toContain('RUNSPEC'));
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Builder' }));
    expect(await screen.findByText(/Grid: 300 cells/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('well-deviated-0'));
    fireEvent.click(screen.getByTestId('history-enabled'));
    expect(await screen.findByText(/Survey stations/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Runs' }));
    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText(/unknown keyword FOO/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Results' }));
    expect(await screen.findByText(/Run a simulation first/i)).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 30000);

  it('the 3D preview is a dark canvas in the light theme', async () => {
    renderApp();
    await ready();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Builder' }));
    const svg = await screen.findByTestId('viz-svg');
    expect(getScopeRoot('sim-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expect(svg.closest('[data-canvas]')).toHaveAttribute('data-canvas', 'dark');
  });

  it('the help drawer and the new-case dialog carry the scope', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Simulation documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(drawer, { key: 'Escape' });

    fireEvent.click(screen.getByTitle('Create new case'));
    const create = await screen.findByRole('dialog');
    expect(create).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
