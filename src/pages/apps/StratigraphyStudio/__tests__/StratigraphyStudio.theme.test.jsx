/**
 * Design system rollout W4B: Stratigraphy Studio opts in to the Petrolord
 * theme. The page mounts the real workstation on the in-memory backend (in
 * place of the registry, so no Supabase is needed) and runs the shared four
 * checks: opens light, the ribbon toggle goes to dark and back and stores
 * the choice, no legacy console colour outside the data-canvas regions
 * (with a negative control), and the route is registered for the themed
 * cold-load loaders. Every view, the dark theme and the help guide are
 * checked below with expectNoLegacyChrome; the column, age-depth and
 * Wheeler charts are drawn for a dark ground and stay dark canvases.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import StratigraphyStudio from '../StratigraphyStudio';
import StratigraphyHelpGuide from '../StratigraphyHelpGuide';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

const ROUTE = '/dashboard/apps/geoscience/stratigraphy-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><StratigraphyStudio /></MemoryRouter>);
const wellsListed = () => screen.findAllByTestId(/^strat-well-/);

// jsdom has no 2D canvas; the section painter draws nothing under test
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

describeAppTheme({
  name: 'Stratigraphy Studio',
  route: ROUTE,
  renderApp,
  ready: wellsListed,
  scopeTestId: 'strat-theme-scope',
});

describe('Stratigraphy Studio themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const VIEWS = ['column', 'tops', 'intervals', 'core', 'section', 'wheeler', 'ages', 'glossary'];

  test('every view keeps its chrome on roles; the selected view uses the primary tint', async () => {
    renderApp();
    const rows = await wellsListed();
    fireEvent.click(rows[0]);
    const scope = getScopeRoot('strat-theme-scope');
    for (const view of VIEWS) {
      fireEvent.click(screen.getByTestId(`strat-view-${view}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`strat-view-${view}`).className).toMatch(/border-pl-primary/));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expectNoLegacyChrome());
    }
    expectNegativeControl(scope);
  });

  test('the age-depth plot stays a dark canvas in the light theme', async () => {
    renderApp();
    fireEvent.click((await wellsListed())[0]);
    fireEvent.click(screen.getByTestId('strat-view-ages'));
    const plot = await screen.findByTestId(/^strat-agedepth-(plot|empty)$/);
    if (plot.getAttribute('data-testid') === 'strat-agedepth-plot') expect(plot).toHaveAttribute('data-canvas', 'dark');
    expectNoLegacyChrome();
  });

  test('dark: the column view reads in dark with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    await wellsListed();
    const scope = getScopeRoot('strat-theme-scope');
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><StratigraphyHelpGuide /></MemoryRouter>);
    const scope = screen.getByTestId('strat-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getByRole('heading', { level: 1, name: /Stratigraphy Studio Help Guide/ })).toBeInTheDocument();
  });
});
