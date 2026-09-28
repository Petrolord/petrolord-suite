/**
 * Design system pilot 4: Seismolord opts in to the Petrolord theme.
 *  - the page root carries the theme scope, light by default;
 *  - the ribbon's toggle switches light and dark and remembers the choice;
 *  - the workspace chrome (ribbon, explorer, context menus) uses theme
 *    roles, with no dark console colours left;
 *  - the help guide shares the scope so the theme holds across pages.
 * Since batch 7A the page has no scope of its own; it mounts in the
 * dashboard's one scope (DashboardScope), as DashboardLayout gives it.
 * The seismic, map and 3D canvases keep their classes and pixels (see the
 * data-canvas regions in SliceView, CubeView and MapView); the pixel proof
 * is the before/after screenshot comparison described in the PR.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemedApp, themeStorageKey } from '@/design/ThemeProvider';
import { DashboardScope } from '@/design/DashboardScope';
import { getScopeRoot } from '@/design/testing/themeAssertions';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import Ribbon from '@/pages/apps/Seismolord/components/workspace/Ribbon';
import SeismicExplorer from '@/pages/apps/Seismolord/components/workspace/SeismicExplorer';
import SeismolordHelpGuide from '@/pages/apps/Seismolord/SeismolordHelpGuide';

// The page's only child is the workspace controller; stand it in with the
// real Ribbon carrying the same trailing toggle ViewerPanel renders.
jest.mock('@/pages/apps/Seismolord/components/ViewerPanel', () => {
  const R = jest.requireActual('react');
  const { default: RealRibbon } = jest.requireActual('@/pages/apps/Seismolord/components/workspace/Ribbon');
  const { ThemeToggle: Toggle } = jest.requireActual('@/components/ui/theme-toggle');
  return function ViewerPanelStub() {
    return R.createElement(RealRibbon, {
      tabs: [{ key: 'home', label: 'Home', content: R.createElement('div', null, 'tools') }],
      trailing: R.createElement(Toggle, { className: 'h-7 w-7 ml-1' }),
    });
  };
});
// eslint-disable-next-line import/first
import Seismolord from '@/pages/apps/Seismolord/Seismolord';

if (typeof global.DOMRect === 'undefined') {
  global.DOMRect = class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      Object.assign(this, { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height });
    }

    static fromRect(r = {}) { return new DOMRect(r.x, r.y, r.width, r.height); }
  };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

// The page as its /dashboard route mounts it, inside the dashboard scope.
const mountPage = () => render(<MemoryRouter><DashboardScope><Seismolord /></DashboardScope></MemoryRouter>);

const LEGACY_CONSOLE = /\b(bg|text|border)-(slate|cyan|lime)-\d{2,3}\b|\btext-white\b/;

describe('Seismolord design system scope', () => {
  test('the page root carries the theme scope, light by default', () => {
    mountPage();
    const root = getScopeRoot('seismolord-root');
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expect(root).toHaveAttribute('data-pl-root');
  });

  test('the ribbon toggle switches light and dark and remembers the choice', () => {
    mountPage();
    const root = getScopeRoot('seismolord-root');
    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(root).toHaveAttribute('data-pl-theme', 'dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(themeStorageKey(null))).toBe('dark');

    fireEvent.click(toggle);
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expect(localStorage.getItem(themeStorageKey(null))).toBe('light');
  });

  test('a returning dark user opens in dark', () => {
    localStorage.setItem(themeStorageKey(null), 'dark');
    mountPage();
    expect(getScopeRoot('seismolord-root')).toHaveAttribute('data-pl-theme', 'dark');
  });

  test('ribbon chrome uses theme roles inside the scope', () => {
    const { container } = render(
      <ThemedApp userId="t1">
        <Ribbon
          tabs={[{ key: 'home', label: 'Home', content: <div>tools</div> }, { key: 'wells', label: 'Wells', content: null }]}
          trailing={<ThemeToggle />}
        />
      </ThemedApp>,
    );
    expect(container.innerHTML).toMatch(/bg-pl-surface/);
    expect(container.innerHTML).not.toMatch(LEGACY_CONSOLE);
  });

  test('explorer tree and its context menu follow the theme (menu portal carries the scope)', () => {
    const tree = {
      volumes: [{ id: 'v1', name: 'Survey A', status: 'ready', survey_meta: null }],
      activeVolumeId: 'v1',
      horizons: [{ id: 'h1', name: 'Top A' }],
      visibleIds: new Set(['h1']),
      faults: [],
      visibleFaultIds: new Set(),
      wells: [],
      visibleWellIds: new Set(),
      savedTraverses: [],
      slicePlanes: [],
      horizonColorById: {},
    };
    const actions = new Proxy({}, { get: () => jest.fn() });
    const { container } = render(
      <MemoryRouter>
        <ThemedApp userId="t1" defaultTheme="dark">
          <SeismicExplorer tree={tree} actions={actions} />
        </ThemedApp>
      </MemoryRouter>,
    );
    expect(container.innerHTML).not.toMatch(LEGACY_CONSOLE);
    fireEvent.contextMenu(screen.getByText('Top A'));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('data-pl-theme', 'dark');
    expect(menu.className).toMatch(/bg-pl-raised/);
    expect(menu.className).not.toMatch(/bg-slate-800/);
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0);
  });

  test('the help guide shares the scope', () => {
    render(<MemoryRouter><DashboardScope><SeismolordHelpGuide /></DashboardScope></MemoryRouter>);
    expect(getScopeRoot('seismolord-help-root')).toHaveAttribute('data-pl-theme', 'light');
  });
});
