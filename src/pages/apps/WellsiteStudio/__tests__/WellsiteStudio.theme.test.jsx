/**
 * Design system rollout W4A: Wellsite Studio opts in to the Petrolord
 * theme. The page mounts the real workstation on the real local database
 * (fake-indexeddb) with the fake transport standing in for Supabase, and
 * runs the shared four checks: opens light, the ribbon toggle goes to dark
 * and back and stores the choice, no legacy console colour outside the
 * data-canvas regions (with a negative control), and the route is
 * registered for the themed cold-load loaders. Further states (every view
 * of the seeded well, a competing top call, the sync drawer, dark and the
 * help guide) are checked below with expectNoLegacyChrome.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, seedCompetingTop, SEED_REGISTRY_WELLS, SEED_USER, SEED_ORG_PEOPLE } from '../services/seed';
import WellsiteStudio from '../WellsiteStudio';
import WellsiteHelpGuide from '../WellsiteHelpGuide';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('../services/transports/supabaseTransport', () => ({ makeSupabaseTransport: () => null }));
// The page builds its local backend on the Supabase transport; the test
// hands it a seeded local backend on the fake transport (autoSync off, so
// the sync engine's timers do not leak across tests).
let mockBackend = null;
jest.mock('../services/localBackend', () => ({ makeLocalBackend: () => mockBackend }));
const { makeLocalBackend } = jest.requireActual('../services/localBackend');

let n = 0;
async function seedBackend({ conflict = false } = {}) {
  const db = openWellsiteDb(`ws-theme-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS, orgPeople: SEED_ORG_PEOPLE, online: true });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  if (conflict) {
    await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'rig pick', depth: { value: 10168, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'logged' } });
    await seedCompetingTop(backend, well);
  }
  return backend;
}

const ROUTE = '/dashboard/apps/geoscience/wellsite-studio';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><WellsiteStudio /></MemoryRouter>);
const wellOpen = () => waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));

beforeAll(installDomShims);
beforeEach(async () => { mockBackend = await seedBackend(); });

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Wellsite Studio',
  route: ROUTE,
  renderApp,
  ready: wellOpen,
  scopeTestId: 'ws-theme-scope',
});

const VIEWS = ['live', 'samples', 'describe', 'shows', 'observations', 'photos', 'tops', 'timeline', 'handover', 'report', 'config', 'setup'];

describe('Wellsite Studio themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openWell = async () => {
    renderApp();
    await wellOpen();
    return getScopeRoot('ws-theme-scope');
  };

  test('every view of the seeded well reads on roles', async () => {
    const scope = await openWell();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    for (const view of VIEWS) {
      fireEvent.click(screen.getByTestId(`ws-nav-${view}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`ws-nav-${view}`).className).toMatch(/border-pl-primary/));
      expectNoLegacyChrome();
    }
    expectNegativeControl(scope);
  });

  test('dark: every view reads in dark with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openWell();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    for (const view of VIEWS) {
      fireEvent.click(screen.getByTestId(`ws-nav-${view}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`ws-nav-${view}`).className).toMatch(/border-pl-primary/));
      expectNoLegacyChrome();
    }
  });

  test('a competing top call and the sync drawer read on roles', async () => {
    mockBackend = await seedBackend({ conflict: true });
    await openWell();
    fireEvent.click(screen.getByTestId('ws-nav-tops'));
    await screen.findByTestId('ws-tops-conflicts');
    await screen.findByTestId('ws-conflict');
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('ws-sync-state'));
    await screen.findByTestId('ws-sync-drawer');
    expectNoLegacyChrome();
  });

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><WellsiteHelpGuide /></MemoryRouter>);
    const scope = getScopeRoot('ws-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
  });
});
