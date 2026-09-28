/**
 * Design system rollout batch 3A: Well Design Studio wraps itself in
 * <ThemedApp> (WellPlanning.jsx), and so do its help guide and the dev
 * harness. The shared describeAppTheme block checks light by default, the
 * toggle round trip, no legacy console colour and the cold-load
 * registration; the walk below opens a seeded site > wellbore > design,
 * repeats the legacy check on every workspace tab and view, in the dialogs,
 * and confirms the charts keep the white chart standard in dark and the
 * targets map stays a dark canvas.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const SITE = {
  id: 'wds-s1', name: 'Theme Pad', crs: null, origin_x: 500000, origin_y: 6800000,
  slots: [], user_id: 'wds-theme-user', organization_id: null,
};
const WELLBORE = {
  id: 'wds-w1', site_id: 'wds-s1', name: 'TP-1', head_x: 500000, head_y: 6800000,
  kb_elev_m: 30, depth_unit: 'm', status: 'planning', user_id: 'wds-theme-user',
};
const DESIGN = {
  id: 'wds-d1', wellbore_id: 'wds-w1', name: 'Plan A', revision: 1, status: 'draft',
  user_id: 'wds-theme-user',
  segments: [
    { id: 'h1', type: 'Hold', length: 400, buildRate: 0, turnRate: 0 },
    { id: 'b1', type: 'Build', length: 600, buildRate: 3, turnRate: 0 },
    { id: 'h2', type: 'Hold', length: 800, buildRate: 0, turnRate: 0 },
  ],
  stations: null,
};
const TARGET = {
  id: 'wds-t1', site_id: 'wds-s1', name: 'Sand A', kind: 'circle', category: 'geological',
  center_x: 500300, center_y: 6800400, tvdss_m: 1400, geometry: { radius_m: 50 },
  color: '#d97706', user_id: 'wds-theme-user',
};

jest.mock('../services/wpApi', () => {
  const ok = (v) => jest.fn().mockResolvedValue(v);
  return {
    WP_DESIGN_KIND: 'wp-design',
    listSites: ok([SITE]), saveSite: ok(SITE), updateSite: ok(SITE), deleteSite: ok(null),
    shareSite: ok(null), unshareSite: ok(null),
    listWellbores: ok([WELLBORE]), saveWellbore: ok(WELLBORE), updateWellbore: ok(WELLBORE), deleteWellbore: ok(null),
    listDesigns: ok([DESIGN]), saveDesign: ok(DESIGN), updateDesign: ok(DESIGN), deleteDesign: ok(null),
    saveDesignRevision: ok(DESIGN), setDefinitiveDesign: ok(null),
    listTargets: ok([TARGET]), saveTarget: ok(TARGET), updateTarget: ok(TARGET), deleteTarget: ok(null),
    listSurveys: ok([]), saveSurvey: ok(null), updateSurvey: ok(null), deleteSurvey: ok(null),
    getSurveyProgram: ok(null), upsertSurveyProgram: ok(null),
    listAcRuns: ok([]), saveAcRun: ok(null), deleteAcRun: ok(null),
  };
});

// Any other supabase call (registries, offsets) resolves empty.
jest.mock('@/lib/customSupabaseClient', () => {
  const result = Promise.resolve({ data: [], error: null, count: 0 });
  const chain = () => new Proxy(function () {}, {
    get: (t, prop) => (prop === 'then' ? result.then.bind(result) : chain()),
    apply: () => chain(),
  });
  return {
    supabase: {
      from: () => chain(),
      rpc: () => chain(),
      storage: { from: () => chain() },
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

// Leaflet needs a real layout; the map only has to mount its frame here.
jest.mock('react-leaflet', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    MapContainer: Pass, TileLayer: () => null, Marker: () => null, Popup: Pass,
    Circle: () => null, Tooltip: Pass, Polyline: () => null, useMapEvents: () => null,
  };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import WellPlanning from '@/pages/apps/WellPlanning';
import WellDesignHelpGuide from '../WellDesignHelpGuide';

const USER_ID = 'wds-theme-user';
const ROUTE = '/dashboard/apps/drilling/well-planning';
const AUTH = { user: { id: USER_ID }, organization: null };

const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter initialEntries={[ROUTE]}>
      <WellPlanning />
    </MemoryRouter>
  </AuthContext.Provider>,
);
const WAIT = { timeout: 5000 };
const ready = () => screen.findByText('Theme Pad', {}, WAIT);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: USER_ID });

describeAppTheme({
  name: 'Well Design Studio',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'wds-theme-scope',
  userId: USER_ID,
});

describeAppTheme({
  name: 'Well Design Studio help guide',
  route: `${ROUTE}/help`,
  renderApp: () => render(
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter><WellDesignHelpGuide /></MemoryRouter>
    </AuthContext.Provider>,
  ),
  ready: () => screen.findByText('Well Design Studio Help Guide'),
  scopeTestId: 'wds-help-theme-scope',
  userId: USER_ID,
});

describe('Well Design Studio theme: every tab, view and dialog', () => {
  beforeAll(() => {
    installDomShims();
    // jsdom has no WebGL2; the 3D view shows its own fallback message
    window.HTMLCanvasElement.prototype.getContext = () => null;
  });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  const pressTab = (name) => {
    const tab = screen.getByRole('tab', { name });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
  };

  const openDesign = async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByText('Theme Pad'));
    fireEvent.click(await screen.findByText('TP-1', {}, WAIT));
    fireEvent.click(await screen.findByText('Plan A', {}, WAIT));
    await screen.findByTestId('section-view-chart', {}, WAIT);
    return getScopeRoot('wds-theme-scope');
  };

  it('the alias route with a well id is registered too', async () => {
    const { isThemedPath } = await import('@/design/coldLoad');
    expect(isThemedPath(`${ROUTE}/some-well-id`)).toBe(true);
  });

  it('the design workspace and each view carry no legacy colour, in light and in dark', async () => {
    const scope = await openDesign();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getAllByTestId('theme-toggle')[0]);
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      expectNoLegacyChrome();
      // the charts keep the white chart standard in both themes
      expect(screen.getByTestId('section-view-chart')).toHaveAttribute('data-canvas', 'chart');
      const viewButton = (label) => screen.getAllByRole('button').find((el) => (el.textContent || '').trim() === label);
      for (const [view, testId] of [['Plots', 'plan-view-chart'], ['Plan', null], ['Survey', 'design-survey-table'], ['3D', null]]) {
        fireEvent.click(viewButton(view));
        if (testId) expect(screen.getByTestId(testId)).toBeInTheDocument();
        expectNoLegacyChrome();
      }
      fireEvent.click(viewButton('Section'));
    }
  }, 60000);

  it('the targets, surveys, anti-collision, reports and apps tabs carry no legacy colour', async () => {
    await openDesign();
    pressTab(/Targets/);
    expect(await screen.findByText('Sand A', {}, WAIT)).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getAllByRole('button').find((b) => (b.textContent || '').trim() === 'Map'));
    const mapFrame = document.querySelector('[data-canvas="dark"]');
    expect(mapFrame).not.toBeNull();
    expectNoLegacyChrome();

    for (const [tab, text] of [
      [/Surveys/, /Survey runs/],
      [/Anti-Collision/, /Anti-collision setup/],
      [/Reports/, /Wall plot/],
      [/Apps/, /Analysis & Engineering/],
    ]) {
      pressTab(tab);
      expect((await screen.findAllByText(text, {}, WAIT)).length).toBeGreaterThan(0);
      expectNoLegacyChrome();
    }
  }, 60000);

  it('the dialogs open inside the scope with no legacy colour', async () => {
    await openDesign();
    fireEvent.click(screen.getByTestId('open-solver'));
    let dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByTestId('open-survey-program'));
    dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // new site dialog from the tree
    fireEvent.click(screen.getByTitle('New site'));
    dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  }, 60000);
});
