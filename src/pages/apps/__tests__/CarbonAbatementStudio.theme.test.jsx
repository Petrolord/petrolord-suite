/**
 * Design system rollout batch 5E: Carbon Footprint & Abatement Studio opts
 * in to the Petrolord theme (the page wraps itself in <ThemedApp>).
 * describeAppTheme checks light by default, the toggle round trip, no legacy
 * console colour and the cold-load registration. The walk below repeats the
 * legacy check on both tabs in light and dark (the three charts stay white),
 * on the over-claim danger callout, on the reportable success callout and on
 * the help guide dialog.
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
} from '@/design/testing/themeAssertions';
import CarbonAbatementStudio from '@/pages/apps/CarbonAbatementStudio';

const SCOPE = 'carbon-theme-scope';
const AUTH = { user: { id: 'u1' }, loading: false };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><CarbonAbatementStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText(/Computed but NOT reportable/i);
const openTab = async (name) => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 });
};

describeAppTheme({
  name: 'Carbon Footprint & Abatement Studio',
  route: '/dashboard/apps/midstream-downstream/carbon-footprint-abatement',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
});

describe('Carbon Footprint & Abatement Studio theme, tabs, callouts and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('both tabs read in light and dark with the charts white', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      await openTab(/Inventory & intensity/i);
      await screen.findByText('Where the emissions are');
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(1);
      // the not-reportable verdict is a warning box with its words
      expect(screen.getByText(/Computed but NOT reportable/i).closest('.bg-pl-warning-bg')).not.toBeNull();
      // inventory figures sit in the mono ledger cells
      expect(screen.getByRole('cell', { name: 'Fired heaters and boilers (CO2)' }).nextSibling.className).toMatch(/font-pl-mono/);
      expectNoLegacyChrome();

      await openTab(/Abatement & path/i);
      await screen.findByText('The marginal abatement cost curve');
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(2);
      expectNoLegacyChrome();
    }
  }, 20000);

  it('the over-claim danger callout and the reportable success callout stay themed', async () => {
    renderApp();
    await ready();
    fireEvent.change(screen.getByLabelText(/Assessment report/i), { target: { value: 'IPCC AR6 GWP100' } });
    fireEvent.change(screen.getByLabelText(/^CH4/i), { target: { value: '29.8' } });
    fireEvent.change(screen.getAllByLabelText(/Destruction efficiency \(fraction\)/i)[1], { target: { value: '0.98' } });
    screen.getAllByLabelText(/ source$/i).forEach((el) => fireEvent.change(el, { target: { value: 'Operator disclosure' } }));
    screen.getAllByLabelText(/ version$/i).forEach((el) => fireEvent.change(el, { target: { value: '2026' } }));
    screen.getAllByLabelText(/^Factor /i).forEach((el) => fireEvent.change(el, { target: { value: '0.45' } }));
    const ok = await screen.findByText(/Computed and reportable/i);
    expect(ok.closest('.bg-pl-success-bg')).not.toBeNull();
    expectNoLegacyChrome();

    await openTab(/Abatement & path/i);
    const over = await screen.findByText('More abatement is claimed than the source emits');
    expect(over.closest('.bg-pl-danger-bg')).not.toBeNull();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expectNoLegacyChrome();
  }, 20000);

  it('the help guide opens in the scope with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });
});
