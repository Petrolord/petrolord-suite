/**
 * Design system rollout W4B: Earth Modeling opts in to the Petrolord theme.
 * The page mounts the real workstation on the in-memory backend (in place
 * of the registry, so no Supabase is needed) and runs the shared four
 * checks: opens light, the ribbon toggle goes to dark and back and stores
 * the choice, no legacy console colour outside the data-canvas regions
 * (with a negative control), and the route is registered for the themed
 * cold-load loaders. A built model (map, section, QC and 3D views, light
 * and dark) and the help guide are checked below. The map viewport, the
 * section and the 3D viewer are painted for a dark ground and stay dark
 * canvases in both themes.
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
import EarthModeling from '../EarthModeling';
import EarthModelingHelpGuide from '../EarthModelingHelpGuide';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

const ROUTE = '/dashboard/apps/geoscience/earth-modeling';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><EarthModeling /></MemoryRouter>);
const explorerReady = () => screen.findByTestId('em-add-TopA');

// jsdom has no 2D or WebGL canvas. A no-op 2D context lets the map and
// section painters run (they draw nothing); WebGL stays unavailable, so the
// 3D view shows its notice. Classes and canvas marks are what we read.
const noop2d = () => {
  const store = {};
  const special = {
    measureText: () => ({ width: 0 }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    getLineDash: () => [],
  };
  return new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : k in special ? special[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
};
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => (type === '2d' ? noop2d() : null));
});

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Earth Modeling',
  route: ROUTE,
  renderApp,
  ready: explorerReady,
  scopeTestId: 'em-theme-scope',
});

describe('Earth Modeling themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const buildModel = async () => {
    renderApp();
    await explorerReady();
    for (const name of ['TopA', 'TopB', 'BaseB']) fireEvent.click(screen.getByTestId(`em-add-${name}`));
    fireEvent.click(screen.getByTestId('em-build'));
    await waitFor(() => expect(screen.getByTestId('em-status').textContent).toMatch(/Built/), { timeout: 8000 });
    return getScopeRoot('em-theme-scope');
  };

  test('a built model: every view keeps its chrome on roles; the map, section and 3D stay dark canvases', async () => {
    const scope = await buildModel();
    expect(screen.getByTestId('em-map-canvas').closest('[data-canvas]')).toHaveAttribute('data-canvas', 'dark');
    expectNoLegacyChrome();
    for (const view of ['section', 'qc', '3d', 'map']) {
      fireEvent.click(screen.getByTestId(`em-view-${view}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`em-view-${view}`).className).toMatch(/border-pl-primary/));
      if (view === 'section' && screen.queryByTestId('em-section-canvas')) {
        expect(screen.getByTestId('em-section-canvas')).toHaveAttribute('data-canvas', 'dark');
      }
      if (view === '3d' && screen.queryByTestId('em-3d-view')) {
        expect(screen.getByTestId('em-3d-view')).toHaveAttribute('data-canvas', 'dark');
      }
      expectNoLegacyChrome();
    }
    expectNegativeControl(scope);
  }, 20000);

  test('dark: the built model reads in dark with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await buildModel();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  }, 20000);

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><EarthModelingHelpGuide /></MemoryRouter>);
    const scope = getScopeRoot('em-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getByRole('heading', { level: 1, name: /Earth Modeling/ })).toBeInTheDocument();
  });
});
