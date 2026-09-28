/**
 * Design system rollout batch 2F: Probabilistic Breakeven Analyzer opts in
 * to the Petrolord theme (the page wraps itself in <ThemedApp>).
 * describeAppTheme checks light by default, the toggle round trip, no
 * legacy console colour and the cold-load registration; the tests below
 * repeat the legacy check with every setup section open and the help guide
 * open, and on the results panel (KPI tiles, the full-precision tornado
 * NumericTable, and the three charts on white in dark).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const makeQuery = () => {
    const q = {};
    const chain = () => q;
    ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in']
      .forEach((m) => { q[m] = jest.fn(chain); });
    q.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
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

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { ThemedApp } from '@/design/ThemeProvider';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import ProbabilisticBreakevenAnalyzer from '@/pages/apps/ProbabilisticBreakevenAnalyzer';
import ResultsPanel from '@/components/breakevenanalyzer/ResultsPanel';

const renderApp = () => render(<MemoryRouter><ProbabilisticBreakevenAnalyzer /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: 'Probabilistic Breakeven Analyzer' });

describeAppTheme({
  name: 'Probabilistic Breakeven Analyzer',
  route: '/dashboard/apps/economics/breakeven-analyzer',
  renderApp,
  ready,
  scopeTestId: 'pba-theme-scope',
});

const results = {
  kpis: { p10: 41.2, p50: 48.7, p90: 57.9, mean: 49.3 },
  plotData: {
    cdf: { x: [40, 45, 50, 55, 60], y: [0.1, 0.3, 0.5, 0.8, 1] },
    histogram: { x: [41, 44, 47, 49, 52, 55, 58] },
  },
  tornadoData: { y: ['Oil Price', 'Total CAPEX'], low: [-6.1, -3.2], high: [7.4, 4.0], base: 48.1 },
  insights: 'The median breakeven sits below the planning price.',
  seed: 20260915,
  baseBreakeven: 48.1,
  excludedIterations: 0,
};

describe('Probabilistic Breakeven Analyzer theme, setup, help and results', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour with every setup section open and the help guide open', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByText('Simulation Settings'));
    expect(await screen.findByText('Run Seed')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTitle('Documentation'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('results: tiles and the full-precision tornado table are themed, charts stay white in dark', () => {
    render(
      <MemoryRouter>
        <ThemedApp data-testid="pba-results-scope">
          <FullPrecisionProvider initial><ResultsPanel results={results} /></FullPrecisionProvider>
        </ThemedApp>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('breakeven-tornado-table').querySelector('table')).not.toBeNull();
    expectNoLegacyChrome();
    const scope = getScopeRoot('pba-results-scope');
    scope.setAttribute('data-pl-theme', 'dark');
    expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThan(0);
    expectNoLegacyChrome();
  });
});
