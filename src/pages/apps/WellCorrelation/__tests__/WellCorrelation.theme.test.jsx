/**
 * Design system rollout W4A: Well Correlation opts in to the Petrolord
 * theme. The page mounts the real workstation (on the in-memory backend in
 * place of the registry, so no Supabase is needed) and runs the shared four
 * checks: opens light, the ribbon toggle goes to dark and back and stores
 * the choice, no legacy console colour outside the data-canvas regions
 * (with a negative control), and the route is registered for the themed
 * cold-load loaders. Further states (a three-well section with its dock,
 * dark, and the help guide) are checked below with expectNoLegacyChrome.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import WellCorrelation from '../WellCorrelation';
import CorrelationHelpGuide from '../CorrelationHelpGuide';

jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

const ROUTE = '/dashboard/apps/geoscience/well-correlation';
const renderApp = (query = '') => render(
  <MemoryRouter initialEntries={[`${ROUTE}${query}`]}><WellCorrelation /></MemoryRouter>,
);
const explorerReady = () => screen.findByTestId('corr-explorer');

// jsdom has no 2D canvas; the map and the section draw into a no-op
// context under test (their classes and data-canvas attributes are what the
// theme check reads).
const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});

describeAppTheme({
  name: 'Well Correlation',
  route: ROUTE,
  renderApp: () => renderApp(),
  ready: explorerReady,
  scopeTestId: 'corr-theme-scope',
});

describe('Well Correlation themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openSection = async () => {
    renderApp('?wells=corr-w1,corr-w2,corr-w3');
    await explorerReady();
    await screen.findByTestId('corr-tracks-details');
    await screen.findAllByTestId(/^corr-remove-/);
    return getScopeRoot('corr-theme-scope');
  };

  test('the empty section: ribbon, explorer and status bar use roles; the path map is a dark canvas', async () => {
    renderApp();
    await explorerReady();
    expectNoLegacyChrome();
    expect(screen.getByTestId('corr-map')).toHaveAttribute('data-canvas', 'dark');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  test('a three-well section: the dock (datum, tops, zones, track layout) reads on roles', async () => {
    const scope = await openSection();
    expect(screen.getAllByTestId(/^corr-remove-/)).toHaveLength(3);
    expectNoLegacyChrome();
    // the section itself is the shared wells kit, white log paper inside the scope
    expect(scope.querySelector('[data-canvas="chart"]')).not.toBeNull();
    expectNegativeControl(scope);
  });

  test('dark: the same section reads in dark with no legacy chrome, and the log paper stays chart', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openSection();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
    expect(scope.querySelector('[data-canvas="chart"]')).not.toBeNull();
  });

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><CorrelationHelpGuide /></MemoryRouter>);
    const scope = screen.getByTestId('corr-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
  });
});
