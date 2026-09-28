/**
 * Design system rollout batch 4D: Rock Physics Studio opts in to the
 * Petrolord theme. The route page mounts the real workstation (on the
 * in-memory harness backend in place of the registry, so no Supabase is
 * needed) and runs the shared four checks: opens light, the ribbon toggle
 * goes to dark and back and stores the choice, no legacy console colour
 * outside the data-canvas regions (with a negative control), and the route
 * is registered for the themed cold-load loaders. The three views with
 * their white charts, the dark wedge canvas and the help guide are checked
 * below.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import RockPhysicsStudio from '../RockPhysicsStudio';
import RockPhysicsStudioHelpGuide from '../RockPhysicsStudioHelpGuide';

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ user: null }),
}));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

// jsdom has no 2D canvas; the wedge drawer returns early on a null context
HTMLCanvasElement.prototype.getContext = () => null;

const ROUTE = '/dashboard/apps/geoscience/rock-physics-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><RockPhysicsStudio /></MemoryRouter>);
const wellsLoaded = async () => (await screen.findAllByTestId('rp-well-row'))[0];

describeAppTheme({
  name: 'Rock Physics Studio',
  route: ROUTE,
  renderApp,
  ready: wellsLoaded,
  scopeTestId: 'rp-theme-scope',
});

describe('Rock Physics Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('every view keeps its chrome on roles; charts stay white and the wedge sits on a dark canvas', async () => {
    const { container } = renderApp();
    const row = await wellsLoaded();
    fireEvent.click(row);
    await screen.findByTestId('rp-fluids-panel', {}, { timeout: 10000 });
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('rp-view-avo'));
    await screen.findByTestId('rp-avo-panel');
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('rp-view-wedge'));
    expect(await screen.findByTestId('rp-wedge-canvas')).toHaveAttribute('data-canvas', 'dark');
    expectNoLegacyChrome();

    expect(container.querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThan(0);
  }, 30000);

  it('opens dark for a user who chose dark, with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    await wellsLoaded();
    expect(getScopeRoot('rp-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with no legacy colour', () => {
    render(<MemoryRouter><RockPhysicsStudioHelpGuide /></MemoryRouter>);
    expect(getScopeRoot('rp-help-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
  });
});
