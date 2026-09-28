/**
 * Design system rollout batch 3E: Torque & Drag Studio opts in to the
 * Petrolord theme. The route page mounts the real workstation (on the
 * in-memory harness backend in place of the registry, so no Supabase is
 * needed) and runs the shared four checks: opens light, the ribbon toggle
 * goes to dark and back and stores the choice, no legacy console colour
 * outside the data-canvas regions (with a negative control), and the route
 * is registered for the themed cold-load loaders. Every ribbon tab, the
 * analysis charts (white chart paper) and the help guide are checked below.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import TorqueDragStudio from '../TorqueDragStudio';
import TorqueDragHelpGuide from '../TorqueDragHelpGuide';

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

const ROUTE = '/dashboard/apps/drilling/torque-drag-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><TorqueDragStudio /></MemoryRouter>);
const caseLoaded = () => screen.findByTestId('td-fill-to-td');

describeAppTheme({
  name: 'Torque & Drag Studio',
  route: ROUTE,
  renderApp,
  ready: caseLoaded,
  scopeTestId: 'td-theme-scope',
});

describe('Torque & Drag Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('every ribbon tab keeps its chrome on roles, and the run charts stay white chart paper', async () => {
    renderApp();
    await caseLoaded();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('td-tab-analysis'));
    fireEvent.click(screen.getByTestId('td-run'));
    expect(await screen.findByTestId('td-broomstick', {}, { timeout: 5000 })).toBeInTheDocument();
    for (const id of ['td-broomstick', 'td-torquechart', 'td-sideforce']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-canvas', 'chart');
    }
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('td-tab-wear'));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('td-tab-sensitivity'));
    fireEvent.click(screen.getByTestId('td-sweep'));
    expect(await screen.findByTestId('td-sweep-table')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('opens dark for a user who chose dark, with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    await caseLoaded();
    expect(getScopeRoot('td-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with the toggle and no legacy colour', () => {
    render(<MemoryRouter><TorqueDragHelpGuide /></MemoryRouter>);
    const root = getScopeRoot('td-help-theme-scope');
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
  });
});
