/**
 * Design system rollout batch 3E: Geomechanics & Wellbore Stability Studio
 * opts in to the Petrolord theme. The route page mounts the real
 * workstation (on the in-memory harness backend in place of the registry,
 * so no Supabase is needed) and runs the shared four checks: opens light,
 * the ribbon toggle goes to dark and back and stores the choice, no legacy
 * console colour outside the data-canvas regions (with a negative control),
 * and the route is registered for the themed cold-load loaders. The loaded
 * logs, the MEM and mud-window runs with their white charts, and the help
 * guide are checked below.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import GeomechanicsStudio from '../GeomechanicsStudio';
import GeomechanicsHelpGuide from '../GeomechanicsHelpGuide';

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

const ROUTE = '/dashboard/apps/drilling/geomechanics-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><GeomechanicsStudio /></MemoryRouter>);
const caseLoaded = () => screen.findByTestId('gm-load');

describeAppTheme({
  name: 'Geomechanics & Wellbore Stability Studio',
  route: ROUTE,
  renderApp,
  ready: caseLoaded,
  scopeTestId: 'gm-theme-scope',
});

describe('Geomechanics & Wellbore Stability Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('every ribbon tab keeps its chrome on roles, and the run charts stay white chart paper', async () => {
    renderApp();
    await caseLoaded();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('gm-load'));
    await screen.findByTestId('gm-curve-status');
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('gm-tab-profiles'));
    fireEvent.click(screen.getByTestId('gm-run-mem'));
    expect(await screen.findByTestId('gm-stress-chart', {}, { timeout: 15000 })).toHaveAttribute('data-canvas', 'chart');
    expect(screen.getByTestId('gm-ucs-chart')).toHaveAttribute('data-canvas', 'chart');
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('gm-tab-window'));
    fireEvent.click(screen.getByTestId('gm-run-window'));
    expect(await screen.findByTestId('gm-window-chart', {}, { timeout: 15000 })).toHaveAttribute('data-canvas', 'chart');
    expectNoLegacyChrome();
  }, 30000);

  it('opens dark for a user who chose dark, with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    await caseLoaded();
    expect(getScopeRoot('gm-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with the toggle and no legacy colour', () => {
    render(<MemoryRouter><GeomechanicsHelpGuide /></MemoryRouter>);
    expect(getScopeRoot('gm-help-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
  });
});
