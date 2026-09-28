/**
 * Design-system pilot 1, and since batch 7A the one dashboard scope: the
 * dashboard landing and the ten module hubs sit in HubScope (their Suspense
 * layout route), and the theme comes from DashboardLayout's single scope
 * (DashboardScope) around every /dashboard page.
 *
 *   1. App.jsx wires exactly the landing and the ten hubs inside HubScope,
 *      and no /apps/ route.
 *   2. Mounted through the real DashboardLayout, a hub sits in the light
 *      dashboard scope with the toggle in its header, and the toggle
 *      switches light and dark.
 *   3. A page opened from a hub (a small Studio-kit page stands in)
 *      renders inside the same single scope: one [data-pl-root], one toggle.
 *   4. The sidebar is a fixed dark ink scope in both themes, outside the
 *      dashboard scope.
 *   5. Cards, status badges, the empty state and the loading state use
 *      theme roles in both themes.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const chain = () => {
    const q = {
      select: () => q, eq: () => q, neq: () => q, order: () => q, limit: () => q, or: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (res) => Promise.resolve({ data: [], error: null, count: 0 }).then(res),
      upsert: () => Promise.resolve({ error: null }),
      delete: () => q,
    };
    return q;
  };
  return {
    supabase: {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      },
      from: jest.fn(() => chain()),
    },
  };
});

let mockApps = [];
let mockAppsLoading = false;
jest.mock('@/hooks/useAppsFromDatabase', () => ({
  useAppsFromDatabase: () => ({ apps: mockApps, loading: mockAppsLoading, error: null }),
}));
let mockAllowed = () => true;
jest.mock('@/hooks/usePurchasedModules', () => ({
  usePurchasedModules: () => ({
    isAllowed: (id) => mockAllowed(id),
    isModuleActive: () => true,
    loading: false,
    refresh: jest.fn(),
    debugData: { purchasedItems: { modules: new Set(['data-ai']) } },
    accessible_app_ids: [],
  }),
}));
jest.mock('@/hooks/useHSEAccess', () => ({ useHSEAccess: () => ({ can: () => false }) }));
jest.mock('@/hooks/useSuiteAccess', () => ({ useSuiteAccess: () => ({ can: () => true }) }));
jest.mock('@/contexts/ImpersonationContext', () => ({
  useImpersonation: () => ({ isImpersonating: false, exitImpersonation: jest.fn() }),
}));

// eslint-disable-next-line import/first
import { AuthContext } from '@/contexts/SupabaseAuthContext';
// eslint-disable-next-line import/first
import DashboardLayout from '@/layouts/DashboardLayout';
// eslint-disable-next-line import/first
import HubScope from '@/components/hubs/HubScope';
// eslint-disable-next-line import/first
import DataAiHub from '@/pages/dashboard/DataAiHub';
// eslint-disable-next-line import/first
import ApplicationsGrid from '@/components/ApplicationsGrid';
// eslint-disable-next-line import/first
import { ThemedApp } from '@/design/ThemeProvider';
// eslint-disable-next-line import/first
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';

// A stand-in app page on the shared Studio kit (the LegacyAppFixture it
// replaces went with the legacy branches in batch 7B).
const STAND_IN_TITLE = 'Stand-in Studio';
function StandInApp() {
  return (
    <StudioLayout header={<StudioHeader title={STAND_IN_TITLE} tabs={[]} />}>
      <p>stand-in body</p>
    </StudioLayout>
  );
}
// eslint-disable-next-line import/first
import { DashboardScope, DASHBOARD_SCOPE_TEST_ID } from '@/design/DashboardScope';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'group').mockImplementation(() => {});
  jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
});

beforeEach(() => {
  window.localStorage.clear();
  mockApps = [];
  mockAppsLoading = false;
  mockAllowed = () => true;
});

const AUTH = {
  user: { id: 'u1', user_metadata: { full_name: 'Ada Tester' } },
  loading: false,
  isSuperAdmin: false,
  role: 'member',
  organization: { id: null },
  signOut: jest.fn(),
};

const APP_PATH = '/dashboard/apps/legacy/sample-app';

function Shell({ at }) {
  return (
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route element={<HubScope />}>
              <Route path="data-ai" element={<DataAiHub />} />
            </Route>
            <Route path={APP_PATH.slice('/dashboard/'.length)} element={<StandInApp />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}


describe('App.jsx wiring', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../../App.jsx'), 'utf8');
  const start = app.indexOf('<Route element={<HubScope />}>');
  const block = app.slice(start, app.indexOf('</Route>', start));

  it('puts exactly the landing and the ten module hubs inside HubScope', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('<Route index element={<Dashboard />} />');
    const hubs = [...block.matchAll(/path="([^"]+)" element=\{<AppRoute/g)].map((m) => m[1]);
    expect(hubs.sort()).toEqual([
      'assurance', 'data-ai', 'drilling', 'economics', 'facilities', 'geoscience',
      'midstream-downstream', 'process-safety', 'production', 'reservoir',
    ]);
  });

  it('keeps every application route outside the hubs layout route', () => {
    expect(block).not.toMatch(/path="apps\//);
    expect(app.match(/<HubScope \/>/g)).toHaveLength(1);
  });
});

describe('a module hub inside the dashboard shell', () => {
  it('is a light themed scope with the toggle in its header, and the toggle switches the theme', async () => {
    mockApps = [{ id: 'a1', app_name: 'Data Quality Studio', description: 'Checks', module: 'Data & AI', slug: 'data-quality-studio' }];
    render(<Shell at="/dashboard/data-ai" />);
    await screen.findByTestId('hub-scope');
    const scope = screen.getByTestId(DASHBOARD_SCOPE_TEST_ID);
    expect(scope).toContainElement(screen.getByTestId('hub-scope'));
    expect(scope).toHaveAttribute('data-pl-theme', 'light');
    expect(scope).toHaveAttribute('data-pl-root');
    const heading = screen.getByRole('heading', { level: 1, name: 'Data & AI' });
    expect(scope).toContainElement(heading);
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(heading.closest('header')).toContainElement(toggle);
    fireEvent.click(toggle);
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('petrolord.theme.v1:u1')).toBe('dark');
  });

  it('shows the sidebar as a fixed dark ink scope beside a light hub', async () => {
    render(<Shell at="/dashboard/data-ai" />);
    await screen.findByTestId('hub-scope');
    const rails = screen.getAllByTestId('dashboard-sidebar-rail');
    rails.forEach((rail) => {
      expect(rail).toHaveAttribute('data-pl-theme', 'dark');
      expect(rail.className).toContain('bg-pl-surface');
      expect(rail.className).not.toMatch(/slate-/);
    });
    // the sidebar is not inside the dashboard scope, and the hub is not inside it
    expect(screen.getByTestId('hub-scope').closest('[data-testid="dashboard-sidebar-rail"]')).toBeNull();
    rails.forEach((rail) => expect(rail.closest(`[data-testid="${DASHBOARD_SCOPE_TEST_ID}"]`)).toBeNull());
    expect(screen.getByTestId('dashboard-mobile-bar')).toHaveAttribute('data-pl-theme', 'dark');
  });
});

describe('a page opened from a hub', () => {
  it('renders inside the same single dashboard scope, and its header toggle switches it', async () => {
    render(<Shell at={APP_PATH} />);
    const title = await screen.findByText(STAND_IN_TITLE);
    const scope = screen.getByTestId(DASHBOARD_SCOPE_TEST_ID);
    expect(document.querySelectorAll('[data-pl-root]')).toHaveLength(1);
    expect(title.closest('[data-pl-root]')).toBe(scope);
    expect(scope).toHaveAttribute('data-pl-theme', 'light');
    // the sidebar and the phone bar are not shown inside an application
    expect(screen.queryByTestId('dashboard-sidebar-rail')).toBeNull();
    expect(screen.queryByTestId('dashboard-mobile-bar')).toBeNull();
    const toggles = screen.getAllByTestId('theme-toggle');
    expect(toggles).toHaveLength(1);
    fireEvent.click(toggles[0]);
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expect(window.localStorage.getItem('petrolord.theme.v1:u1')).toBe('dark');
  });
});

describe('ApplicationsGrid in both themes', () => {
  const apps = [
    { id: 'live', app_name: 'Live App', description: 'Opens', module: 'm', slug: 'live-app' },
    { id: 'soon', app_name: 'Soon App', description: 'Later', module: 'm', slug: 'soon-app', isComingSoon: true, is_built: true },
    { id: 'dev', app_name: 'Dev App', description: 'Building', module: 'm', slug: 'dev-app', isComingSoon: true, is_built: false },
    { id: 'locked', app_name: 'Locked App', description: 'Paid', module: 'm', slug: 'locked-app' },
  ];
  const grid = (theme, props = {}) => {
    window.localStorage.setItem('petrolord.theme.v1:u1', theme);
    return render(
      <AuthContext.Provider value={AUTH}>
        <MemoryRouter>
          <ThemedApp><ApplicationsGrid moduleFilter="m" searchQuery="" {...props} /></ThemedApp>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  };

  it.each(['light', 'dark'])('%s: cards and status badges use theme roles, with no legacy console colour', (theme) => {
    mockApps = apps;
    mockAllowed = (id) => !String(id).startsWith('locked');
    const { container } = grid(theme);
    expect(document.querySelector('[data-pl-root]')).toHaveAttribute('data-pl-theme', theme);
    expect(screen.getAllByTestId('app-card')).toHaveLength(4);
    expect(screen.getByText('Coming Soon').className).toContain('bg-pl-info-bg');
    expect(screen.getByText('In Development').className).toContain('bg-pl-sunken');
    expect(screen.getByText('Locked').className).toContain('bg-pl-warning-bg');
    expect(screen.getByText('Requires License').className).toContain('text-pl-warning-text');
    expect(container.innerHTML).not.toMatch(/(?:bg|text|border)-(?:slate|lime|blue|amber)-\d/);
  });

  it('opens a live app from the keyboard, and a Coming Soon card is not focusable', () => {
    mockApps = apps;
    grid('light');
    const [live, soon] = screen.getAllByTestId('app-card');
    expect(live).toHaveAttribute('tabindex', '0');
    expect(live).toHaveAttribute('role', 'link');
    expect(soon).not.toHaveAttribute('tabindex');
    expect(soon).toHaveAttribute('aria-disabled', 'true');
  });

  it('has a themed empty state and a themed loading state', () => {
    mockApps = [];
    const empty = grid('dark', { searchQuery: 'zzz' });
    expect(screen.getByText('No Applications Found').className).toContain('text-pl-text');
    expect(screen.getByText(/No applications match "zzz"/)).toBeInTheDocument();
    empty.unmount();

    mockAppsLoading = true;
    const { container } = grid('light');
    expect(screen.getByRole('status')).toHaveTextContent('Loading applications');
    // the shared Skeleton themes itself inside the scope (no local override)
    const bone = container.querySelector('[aria-busy="true"] .animate-pulse');
    expect(bone.className).toMatch(/\bbg-pl-border\/70\b/);
    expect(container.innerHTML).not.toMatch(/bg-slate-800\/50/);
  });
});

describe('first paint on a cold load', () => {
  it('a hub mounted while the session restores paints the last theme this device resolved', () => {
    window.localStorage.setItem('petrolord.theme.v1.last', 'dark');
    render(
      <AuthContext.Provider value={{ ...AUTH, user: null, loading: true }}>
        <MemoryRouter initialEntries={['/x']}>
          <Routes>
            <Route element={<DashboardScope><Outlet /></DashboardScope>}>
              <Route element={<HubScope />}><Route path="/x" element={<p>hub</p>} /></Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByTestId(DASHBOARD_SCOPE_TEST_ID)).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByTestId(DASHBOARD_SCOPE_TEST_ID)).toContainElement(screen.getByText('hub'));
  });

  it('the layout itself paints the themed loader while the session restores', () => {
    window.localStorage.setItem('petrolord.theme.v1.last', 'dark');
    render(
      <AuthContext.Provider value={{ ...AUTH, user: null, loading: true }}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes><Route path="/dashboard" element={<DashboardLayout />} /></Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const loader = screen.getByTestId('themed-loading');
    expect(loader).toHaveAttribute('data-pl-theme', 'dark');
    expect(loader).toHaveAttribute('role', 'status');
    expect(document.querySelector('.bg-slate-900, .border-lime-400')).toBeNull();
  });
});
