/**
 * Design system rollout batch 5E: Flare Gas to Value Studio opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration. The walk below repeats the legacy check on
 * the screening tab (verdicts carry their word and tone, the bid comparison
 * is a mono ledger), on a failed route, and on the abatement tab once the
 * counterfactual is stated (success callout, the credit chart stays white,
 * the credit table), in light and dark, and on the help guide.
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
import FlareToValueStudio from '@/pages/apps/FlareToValueStudio';

const SCOPE = 'flare-theme-scope';
const AUTH = { user: { id: 'u1' }, loading: false };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><FlareToValueStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText('The gas that is actually there');
const openTab = async (name) => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 });
};

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: 'u1' });

describeAppTheme({
  name: 'Flare Gas to Value Studio',
  route: '/dashboard/apps/midstream-downstream/flare-gas-to-value',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
});

describe('Flare Gas to Value Studio theme, both tabs and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the screening tab reads in light and dark; a failed route keeps its word', async () => {
    renderApp();
    await ready();
    fireEvent.change(screen.getByLabelText(/Mini LNG Minimum volume/i), { target: { value: '40' } });
    await screen.findByText(/Minimum volume: 10.000 against a limit of 40.000/i);
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      const fails = screen.getAllByText('fails');
      expect(fails.some((el) => /text-pl-danger-text/.test(el.className))).toBe(true);
      expect(screen.getAllByText('not fully screened')[0].className).toMatch(/text-pl-warning-text/);
      // the credit route picker is the themed native select
      expect(screen.getByLabelText('Route the credits apply to').className).toMatch(/bg-pl-surface/);
      expectNoLegacyChrome();
    }
  }, 20000);

  it('the abatement tab reads in light and dark with the credit chart white', async () => {
    renderApp();
    await ready();
    await openTab(/Abatement & credits/i);
    fireEvent.change(screen.getByLabelText(/Flare destruction efficiency/i), { target: { value: '0.92' } });
    fireEvent.change(screen.getByLabelText(/Methane GWP/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/What the product displaces/i), { target: { value: 'diesel' } });
    fireEvent.change(screen.getByLabelText(/Product burned/i), { target: { value: '190000' } });
    fireEvent.change(screen.getByLabelText(/Fuel displaced/i), { target: { value: '240000' } });
    const abated = await screen.findByText(/abated against "diesel"/i);
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expect(abated.closest('.bg-pl-success-bg')).not.toBeNull();
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(1);
      expect(screen.getByText('Credit revenue/yr')).toBeInTheDocument();
      expectNoLegacyChrome();
    }
  }, 20000);

  it('the refusal and the no-abatement warnings stay themed', async () => {
    renderApp();
    await ready();
    await openTab(/Abatement & credits/i);
    // at defaults the destruction efficiency is blank, so the tab refuses
    const refusal = await screen.findByText(/destruction efficiency/i, { selector: '.bg-pl-warning-bg p' });
    expect(refusal).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.change(screen.getByLabelText(/Flare destruction efficiency/i), { target: { value: '0.92' } });
    fireEvent.change(screen.getByLabelText(/Methane GWP/i), { target: { value: '28' } });
    const none = await screen.findByText('No abatement reported');
    expect(none.closest('.bg-pl-warning-bg')).not.toBeNull();
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
