/**
 * Design system rollout W4B: Pore Pressure Studio opts in to the Petrolord
 * theme. The page mounts the real workstation on the in-memory backend (in
 * place of the registry, so no Supabase is needed) and runs the shared four
 * checks: opens light, the ribbon toggle goes to dark and back and stores
 * the choice, no legacy console colour outside the data-canvas regions
 * (with a negative control), and the route is registered for the themed
 * cold-load loaders. A loaded well (prognosis and NCT views, light and
 * dark) and the help guide are checked below; the prognosis and NCT plots
 * stay white chart paper in both themes.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import PorePressureStudio from '../PorePressureStudio';
import PorePressureStudioHelpGuide from '../PorePressureStudioHelpGuide';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

const ROUTE = '/dashboard/apps/geoscience/pore-pressure-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><PorePressureStudio /></MemoryRouter>);
const wellsListed = () => screen.findAllByTestId('pp-well-row');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

describeAppTheme({
  name: 'Pore Pressure Studio',
  route: ROUTE,
  renderApp,
  ready: wellsListed,
  scopeTestId: 'pp-theme-scope',
});

describe('Pore Pressure Studio themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openWell = async () => {
    renderApp();
    const rows = await wellsListed();
    fireEvent.click(rows[0]);
    await screen.findByTestId('pp-prognosis-chart', {}, { timeout: 4000 });
    return getScopeRoot('pp-theme-scope');
  };

  test('a loaded well: ribbon, explorer, parameters and status bar use roles; the prognosis stays white chart paper', async () => {
    const scope = await openWell();
    expectNoLegacyChrome();
    expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-canvas', 'chart');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNegativeControl(scope);
  });

  test('the NCT view keeps its chrome on roles and its plot on chart paper', async () => {
    await openWell();
    fireEvent.click(screen.getByTestId('pp-view-nct'));
    const nct = await screen.findByTestId('pp-nct-chart');
    expect(nct).toHaveAttribute('data-canvas', 'chart');
    expect(screen.getByTestId('pp-view-nct').className).toMatch(/border-pl-primary/);
    expectNoLegacyChrome();
  });

  test('dark: the loaded well reads in dark with no legacy chrome and the plot stays white', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openWell();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    await waitFor(() => expectNoLegacyChrome());
    expect(screen.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-canvas', 'chart');
  });

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><PorePressureStudioHelpGuide /></MemoryRouter>);
    const scope = screen.getByTestId('pp-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getByRole('heading', { level: 1, name: /Pore Pressure Studio/ })).toBeInTheDocument();
  });
});
