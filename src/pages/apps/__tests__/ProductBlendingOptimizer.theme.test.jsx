/**
 * Design system rollout batch 5E: Product Blending Optimizer opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). describeAppTheme
 * checks light by default, the toggle round trip, no legacy console colour
 * and the cold-load registration. The walk below repeats the legacy check on
 * the recipe (the chart stays white, the specification states carry their
 * word and tone, the money tables are mono ledgers) in light and dark, on
 * the open template select, on the no-recipe warning and on the help guide.
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
import ProductBlendingOptimizer from '@/pages/apps/ProductBlendingOptimizer';

const SCOPE = 'blend-theme-scope';
const AUTH = { user: { id: 'u1' }, loading: false };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><ProductBlendingOptimizer /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText('The recipe');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: 'u1' });

describeAppTheme({
  name: 'Product Blending Optimizer',
  route: '/dashboard/apps/midstream-downstream/product-blending-optimizer',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
});

describe('Product Blending Optimizer theme, recipe, select, warning and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the recipe reads in light and dark; the chart stays white and the ledgers are mono', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot(SCOPE);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expect(scope.querySelectorAll('[data-canvas="chart"]').length).toBe(1);
      // a specification state is status: its word plus a tone
      const binding = screen.getAllByText('binding')[0];
      expect(binding.className).toMatch(/text-pl-info-text/);
      // the shadow prices are a mono ledger
      expect(screen.getByText('$55.01').className).toMatch(/font-pl-mono/);
      // the full-precision toggle sits in the header
      expect(screen.getByRole('switch', { name: 'Full precision' })).toBeInTheDocument();
      expectNoLegacyChrome();
    }
  }, 20000);

  it('the template select opens in the scope', async () => {
    renderApp();
    await ready();
    const trigger = screen.getAllByRole('combobox')[0];
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('an impossible specification shows the warning box in theme roles', async () => {
    renderApp();
    await ready();
    const ronMin = screen.getAllByRole('spinbutton').find((el) => el.value === '91');
    fireEvent.change(ronMin, { target: { value: '120' } });
    const title = await screen.findByText(/No recipe meets these specifications/i);
    expect(title.closest('.bg-pl-warning-bg')).not.toBeNull();
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
