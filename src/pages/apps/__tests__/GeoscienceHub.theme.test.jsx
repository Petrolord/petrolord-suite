/**
 * Design system rollout batch 4D: the legacy Geoscience Hub app opts in to
 * the Petrolord theme. It runs the shared four checks (opens light, the
 * header toggle goes to dark and back and stores the choice, no legacy
 * console colour with a negative control, the route is registered) and
 * checks the dark first paint for a user who chose dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import GeoscienceHub from '../GeoscienceHub';

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ user: null }),
}));

const ROUTE = '/dashboard/apps/geoscience/hub';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><GeoscienceHub /></MemoryRouter>);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Geoscience Hub',
  route: ROUTE,
  renderApp,
  ready: () => screen.findByText('Geoscience Analytics Hub'),
  scopeTestId: 'geo-hub-theme-scope',
});

describe('Geoscience Hub themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('opens dark for a user who chose dark, with every app card on roles', () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    expect(getScopeRoot('geo-hub-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getAllByText('Launch App')).toHaveLength(6);
    expectNoLegacyChrome();
  });
});
