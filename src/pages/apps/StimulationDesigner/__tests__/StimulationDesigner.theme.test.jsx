/**
 * Design system rollout batch 3E: Stimulation Designer opts in to the
 * Petrolord theme. The route page mounts the real workstation (on the
 * in-memory harness backend in place of the registry, so no Supabase is
 * needed) and runs the shared four checks: opens light, the ribbon toggle
 * goes to dark and back and stores the choice, no legacy console colour
 * outside the data-canvas regions (with a negative control), and the route
 * is registered for the themed cold-load loaders. Every ribbon tab, the
 * status banner, the white charts and the help guide are checked below.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import StimulationDesignerStudio from '../StimulationDesignerStudio';
import StimulationDesignerHelpGuide from '../StimulationDesignerHelpGuide';

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ user: null }),
}));
jest.mock('../services/wpBackend', () => ({
  makeWpBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

const ROUTE = '/dashboard/apps/drilling/stimulation-designer';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><StimulationDesignerStudio /></MemoryRouter>);
const designed = () => screen.findByTestId('st-width-chart', {}, { timeout: 5000 });

describeAppTheme({
  name: 'Stimulation Designer',
  route: ROUTE,
  renderApp,
  ready: designed,
  scopeTestId: 'st-theme-scope',
});

describe('Stimulation Designer themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('every ribbon tab keeps its chrome on roles, the banner uses a status role, the charts stay white', async () => {
    renderApp();
    await designed();
    expect(screen.getByTestId('st-width-chart')).toHaveAttribute('data-canvas', 'chart');
    expect(screen.getByTestId('st-banner').className).toMatch(/bg-pl-(success|warning|danger)-bg|bg-pl-sunken/);
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('st-tab-schedule'));
    expect(await screen.findByTestId('st-schedule-chart')).toHaveAttribute('data-canvas', 'chart');
    expectNoLegacyChrome();
    for (const id of ['productivity', 'acidizing']) {
      fireEvent.click(screen.getByTestId(`st-tab-${id}`));
      expectNoLegacyChrome();
    }
  });

  it('opens dark for a user who chose dark, with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    await designed();
    expect(getScopeRoot('st-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with the toggle and no legacy colour', () => {
    render(<MemoryRouter><StimulationDesignerHelpGuide /></MemoryRouter>);
    expect(getScopeRoot('st-help-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
  });
});
