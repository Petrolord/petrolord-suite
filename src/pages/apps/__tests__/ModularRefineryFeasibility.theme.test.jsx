/**
 * Design system rollout batch 5E: Modular Refinery Feasibility Studio opts
 * in to the Petrolord theme (the page wraps itself in <ThemedApp>).
 * describeAppTheme checks light by default, the toggle round trip, no legacy
 * console colour and the cold-load registration. The walk below repeats the
 * legacy check on the results in light and dark (the scale chart stays
 * white, a negative NPV reads in danger text beside its minus sign, the
 * slate and scenario tables are mono ledgers), on the open configuration
 * select, on a ticked licence stage and on the help guide.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));
// recharts has no layout in jsdom; give the responsive container a size
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const R = require('react');
  const ResponsiveContainer = ({ children }) => R.cloneElement(children, { width: 800, height: 300 });
  return { ...actual, ResponsiveContainer };
});

import { AuthContext } from '@/contexts/SupabaseAuthContext';
import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import ModularRefineryFeasibility from '@/pages/apps/ModularRefineryFeasibility';

const SCOPE = 'modular-theme-scope';
const AUTH = { user: { id: 'u1' }, loading: false };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><ModularRefineryFeasibility /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText('-$97.4MM');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: 'u1' });

describeAppTheme({
  name: 'Modular Refinery Feasibility Studio',
  route: '/dashboard/apps/midstream-downstream/modular-refinery-feasibility',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
});

describe('Modular Refinery Feasibility Studio theme, results, select, licensing and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the results read in light and dark; the chart stays white and money is mono', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(1);
      const npv = screen.getByText('-$97.4MM');
      expect(npv.className).toMatch(/text-pl-danger-text/);
      expect(npv.className).toMatch(/font-pl-mono/);
      expect(screen.getByText('Gross value').closest('table')).not.toBeNull();
      expectNoLegacyChrome();
    }
  }, 20000);

  it('the configuration select opens in the scope', async () => {
    renderApp();
    await ready();
    const trigger = screen.getAllByRole('combobox')[0];
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('a ticked licence stage and the out-of-order warning stay themed', async () => {
    renderApp();
    await ready();
    fireEvent.click(await screen.findByText(/2\. Licence to Construct/));
    expect(screen.getByText(/2\. Licence to Construct/).closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/probably a data-entry slip/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('theme-toggle'));
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
