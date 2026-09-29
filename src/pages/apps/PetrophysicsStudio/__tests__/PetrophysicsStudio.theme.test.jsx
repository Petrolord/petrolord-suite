/**
 * Design system rollout W1C: Petrophysics Studio opts in to the Petrolord
 * theme. The page mounts the real workstation (on the in-memory harness
 * backend in place of the registry, so no Supabase is needed) and runs the
 * shared four checks: opens light, the ribbon toggle goes to dark and back
 * and stores the choice, no legacy console colour outside the data-canvas
 * regions (with a negative control), and the route is registered for the
 * themed cold-load loaders. Further states (a loaded well with its log
 * tracks and dock, the crossplot and histogram views, the dialogs and the
 * help guide) are checked below with expectNoLegacyChrome.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import PetrophysicsStudio from '../PetrophysicsStudio';
import PetrophysicsHelpGuide from '../PetrophysicsHelpGuide';

jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

const ROUTE = '/dashboard/apps/geoscience/petrophysics-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><PetrophysicsStudio /></MemoryRouter>);
const wellsListed = () => screen.findAllByTestId('petro-well-row');

// jsdom has no 2D canvas; the log tracks and plots draw nothing under test
// (their classes are what the theme check reads).
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Petrophysics Studio',
  route: ROUTE,
  renderApp,
  ready: wellsListed,
  scopeTestId: 'petro-theme-scope',
});

describe('Petrophysics Studio themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openWell = async () => {
    renderApp();
    const rows = await wellsListed();
    fireEvent.click(rows[0]);
    await screen.findByTestId('petro-tracks');
    return getScopeRoot('petro-theme-scope');
  };

  test('a loaded well: ribbon, explorer, dock and status bar use roles; the log tracks stay white chart paper', async () => {
    const scope = await openWell();
    expectNoLegacyChrome();
    const tracks = screen.getByTestId('petro-tracks-canvas').closest('[data-canvas]');
    expect(tracks).toHaveAttribute('data-canvas', 'chart');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    // the track layout editor in the dock is the shared wells kit, themed inside the scope
    expect(scope.innerHTML).toMatch(/bg-pl-surface/);
    expectNegativeControl(scope);
  });

  test('dark: the same well reads in dark with no legacy chrome, and the tracks stay chart paper', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openWell();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
    expect(screen.getByTestId('petro-tracks-canvas').closest('[data-canvas]')).toHaveAttribute('data-canvas', 'chart');
  });

  test('crossplot, histogram, split, depth shift and field views keep chrome on roles and plots on chart paper', async () => {
    await openWell();
    for (const view of ['crossplot', 'histogram', 'split', 'shift', 'field']) {
      fireEvent.click(screen.getByTestId(`petro-view-${view}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`petro-view-${view}`).className).toMatch(/border-pl-primary/));
      expectNoLegacyChrome();
    }
  });

  test('the dialogs open inside the scope (portals carry it) with no legacy chrome', async () => {
    await openWell();
    for (const id of ['petro-rwtools', 'petro-batch', 'petro-rule-facies', 'petro-scenarios', 'petro-probabilistic', 'petro-mineral', 'petro-calc', 'petro-digitize', 'petro-condition', 'petro-export']) {
      const button = screen.getByTestId(id);
      if (button.disabled) continue;
      fireEvent.click(button);
      // eslint-disable-next-line no-await-in-loop
      const dialog = await screen.findByRole('dialog');
      expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
      expectNoLegacyChrome();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
  }, 20000); // ten dialogs: over 5 s when the jest run is loaded

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><PetrophysicsHelpGuide /></MemoryRouter>);
    const scope = getScopeRoot('petro-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getByRole('heading', { level: 1, name: /Petrophysics Studio Help Guide/ })).toBeInTheDocument();
  });
});
