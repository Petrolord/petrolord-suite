/**
 * Design system rollout batch 2E: Fiscal Regime Designer opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration. The walk below runs the default two-regime
 * comparison and repeats the legacy check on every results tab (the summary
 * ledger, cash flow, payout, sensitivities, insights) in light and dark, with
 * Full precision on, in the template, save and load dialogs and in the help
 * guide; the chart cards stay white in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const chain = {
    select: () => chain,
    insert: () => Promise.resolve({ error: null }),
    eq: () => chain,
    order: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
  };
  return { supabase: { from: jest.fn(() => chain) } };
});
// recharts has no layout in jsdom; give the responsive container a size
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const R = require('react');
  const ResponsiveContainer = ({ children }) => R.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

import { AuthContext } from '@/contexts/SupabaseAuthContext';
import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import FiscalRegimeDesigner from '@/pages/apps/FiscalRegimeDesigner';

const SCOPE = 'fiscal-theme-scope';
const AUTH = { user: { id: 'u1' }, loading: false };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><FiscalRegimeDesigner /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByRole('heading', { level: 1, name: 'Fiscal Regime Designer' });

describeAppTheme({
  name: 'Fiscal Regime Designer',
  route: '/dashboard/apps/economics/fiscal-regime-designer',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
});

const openTab = (name) => {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
};

const runComparison = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Run Comparison/i }));
  return screen.findByText('Regime comparison', {}, { timeout: 10000 });
};

describe('Fiscal Regime Designer theme, results, dialogs and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour on any results tab, in light and dark; charts stay white', async () => {
    renderApp();
    await ready();
    await runComparison();
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      openTab('Summary');
      // the summary ledger: mono right-aligned figures, regime names as row labels
      const table = scope.querySelector('table');
      table.querySelectorAll('tbody td').forEach((td) => expect(td.className).toMatch(/font-pl-mono/));
      table.querySelectorAll('tbody td').forEach((td) => expect(td.className).toMatch(/text-right/));
      expect(table.querySelectorAll('tbody th[scope="row"]').length).toBeGreaterThan(0);
      expectNoLegacyChrome();
      openTab('Cash Flow');
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThanOrEqual(2);
      expectNoLegacyChrome();
      openTab('Payout');
      expectNoLegacyChrome();
      openTab('Sensitivities');
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThanOrEqual(2);
      expectNoLegacyChrome();
      openTab('Insights');
      expect(screen.getByText('What the comparison shows')).toBeInTheDocument();
      expectNoLegacyChrome();
    }
  }, 30000);

  it('with Full precision on, the total tax column stays themed', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('switch', { name: 'Full precision' }));
    await runComparison();
    expect(screen.getByTestId('fiscal-total-tax-head')).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 30000);

  it('the template, save and load dialogs open in the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Fiscal Regime Templates')).toBeInTheDocument();
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Save Project' })).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /^Load$/ }));
    dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No saved projects found.')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the help guide opens in the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });
});
