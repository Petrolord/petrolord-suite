/**
 * Design system rollout W4B: Mapping & Surface Studio opts in to the
 * Petrolord theme. The page mounts the real workstation on the in-memory
 * backend (in place of the registry, so no Supabase is needed) and runs the
 * shared four checks: opens light, the ribbon toggle goes to dark and back
 * and stores the choice, no legacy console colour outside the data-canvas
 * regions (with a negative control), and the route is registered for the
 * themed cold-load loaders. An open surface (light and dark), the import
 * dialog, the sample banner and the help guide are checked below. The map
 * is painted with light ink for a dark ground, so the map viewport stays a
 * dark canvas in both themes.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import MappingSurfaceStudio from '../MappingSurfaceStudio';
import MappingHelpGuide from '../MappingHelpGuide';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

const ROUTE = '/dashboard/apps/geoscience/mapping-surface-studio';
const renderApp = (search = '') => render(<MemoryRouter initialEntries={[`${ROUTE}${search}`]}><MappingSurfaceStudio /></MemoryRouter>);
const surfacesListed = () => screen.findAllByTestId('map-surface-row');

// jsdom has no 2D canvas. A no-op context lets the map painter run (it
// draws nothing); classes and canvas marks are what we read.
const noop2d = () => {
  const special = {
    measureText: () => ({ width: 0 }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    getLineDash: () => [],
  };
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k in special ? special[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
};
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => (type === '2d' ? noop2d() : null));
});

describeAppTheme({
  name: 'Mapping & Surface Studio',
  route: ROUTE,
  renderApp: () => renderApp(),
  ready: surfacesListed,
  scopeTestId: 'map-theme-scope',
});

describe('Mapping & Surface Studio themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openSurface = async () => {
    renderApp();
    const rows = await surfacesListed();
    fireEvent.click(rows[rows.length - 1]);
    await screen.findByTestId('map-canvas');
    return getScopeRoot('map-theme-scope');
  };

  test('an open surface: ribbon, explorer, dock and status bar use roles; the map stays a dark canvas', async () => {
    const scope = await openSurface();
    expect(screen.getByTestId('map-canvas').closest('[data-canvas]')).toHaveAttribute('data-canvas', 'dark');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
    expectNegativeControl(scope);
  });

  test('dark: the open surface reads in dark with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openSurface();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  test('the import dialog opens inside the scope (the portal carries it) with no legacy chrome', async () => {
    renderApp();
    await surfacesListed();
    fireEvent.click(screen.getByTestId('map-import'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('the sample banner is a warning callout on roles', async () => {
    renderApp('?sample=1');
    const banner = await screen.findByTestId('map-sample-banner');
    expect(banner.className).toMatch(/bg-pl-warning-bg/);
    await surfacesListed();
    expectNoLegacyChrome();
  });

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><MappingHelpGuide /></MemoryRouter>);
    const scope = screen.getByTestId('map-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getByRole('heading', { level: 1, name: /Mapping/ })).toBeInTheDocument();
  });
});
