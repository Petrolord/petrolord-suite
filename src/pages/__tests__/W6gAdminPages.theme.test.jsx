/**
 * Design system rollout batch 6G: the super admin console, admin centre,
 * seed tools, master apps viewer, system health, create user, profile and
 * the /mobile shell wrap themselves in <ThemedApp>. describeAppTheme checks
 * each page; the extra cases open the dialogs, the admin centre panels, the
 * profile's second state and every mobile page. Supabase is a stand-in
 * (accountTestKit), so nothing reaches a network, an edge function, auth or
 * a database, and no test presses a button that writes.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return {
    supabase: makeSupabase({
      organizations: [
        { id: 'o1', name: 'Test Org', org_type: 'internal', subscription_status: 'active', organization_apps: [{ app_id: 'geoscience', seats_allocated: 5, status: 'active' }] },
        { id: 'o2', name: 'Paused Org', org_type: 'customer', subscription_status: 'suspended', organization_apps: [] },
      ],
      organization_members: [{ id: 'm1', user_id: 'u2', organization_id: 'o1', role: 'member', email: 'grace@example.com', organizations: { name: 'Test Org' } }],
      user_activity_logs: [],
      master_apps: [{ id: 'a1', app_id: 'geoscience', app_name: 'Seismolord', name: 'Geoscience', module: 'geoscience', module_id: null, created_at: '2026-09-01T00:00:00Z' }],
      admin_data_integrity_report: [
        { issue_type: 'Orphan seats', count: 3, description: 'Seats without a member' },
        { issue_type: 'Orphan apps', count: 0, description: 'Apps without a module' },
      ],
      app_build_history: [{ id: 'h1', app_name: 'Seismolord', action: 'tested', description: 'Checked', built_by: 'lead', created_at: '2026-09-20T10:00:00Z' }],
      subscriptions: [],
      purchased_modules: [],
      projects: [{ id: 'p1', name: 'Alpha Field', status: 'Amber', stage: 'Define', percent_complete: 40, updated_at: '2026-09-20T10:00:00Z' }],
      tasks: [{ id: 't1', name: 'Review AFE', status: 'To Do', project_id: 'p1', planned_end_date: '2026-10-01' }],
      risks: [],
    }),
  };
});

jest.mock('@/contexts/ImpersonationContext', () => ({
  useImpersonation: () => ({ startOrgImpersonation: jest.fn(), startMemberImpersonation: jest.fn(), isImpersonating: false }),
}));

jest.mock('@/hooks/useUserEntitlements', () => ({
  useUserEntitlements: () => ({
    loading: false,
    refetch: jest.fn(),
    hasAccessToApp: (id) => id === 'a1',
    getAppAccessInfo: () => ({ seats_allocated: 5, seats_used: 2, expiry_date: '2027-01-01' }),
    entitlements: { accessible_app_ids: ['a1'] },
  }),
}));

jest.mock('@/hooks/useMasterApps', () => ({
  useMasterApps: () => ({
    apps: [
      { id: 'a1', app_name: 'Seismolord', module: 'geoscience', status: 'Active', is_built: true, is_functional: true, updated_at: '2026-09-20T10:00:00Z' },
      { id: 'a2', app_name: 'Basin Tool', module: 'geoscience', status: 'Coming Soon', is_built: false, is_functional: false, updated_at: '2026-09-20T10:00:00Z' },
    ],
    loading: false,
    updateApp: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('@/lib/appBuildLogger', () => ({ logAppBuild: jest.fn() }));

jest.mock('@/lib/orgContext', () => ({
  getUserOrgRow: jest.fn(async () => ({ organization_id: 'o1', role: 'owner', status: 'active' })),
}));

jest.mock('@/services/SupabaseService', () => ({
  SupabaseService: {
    getUserNotifications: jest.fn(async () => [
      { id: 'n1', title: 'Budget alert', message: 'AFE over budget', type: 'alert', is_read: false, created_at: '2026-09-20T10:00:00Z' },
    ]),
    markNotificationRead: jest.fn(),
  },
}));

import {
  describeAppTheme, expectNoLegacyChrome, installDomShims,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import SuperAdminConsole from '@/pages/SuperAdminConsole';
import AdminCreateUser from '@/pages/AdminCreateUser';
import SystemHealth from '@/pages/admin/SystemHealth';
import AdminCenter from '@/pages/admin/AdminCenter';
import AdminSeedApps from '@/pages/admin/AdminSeedApps';
import MasterAppsViewer from '@/pages/admin/MasterAppsViewer';
import Profile from '@/pages/Profile';
import MobileLayout from '@/layouts/MobileLayout';
import MobileDashboard from '@/pages/mobile/MobileDashboard';
import MobileProjectList from '@/pages/mobile/MobileProjectList';
import MobileTasks from '@/pages/mobile/MobileTasks';
import MobileNotifications from '@/pages/mobile/MobileNotifications';
import MobileProfile from '@/pages/mobile/MobileProfile';
import { renderAccountPage, TEST_USER } from './accountTestKit';

const PAGES = [
  { name: 'Super admin console', route: '/super-admin', Page: SuperAdminConsole, scope: 'super-admin-theme-scope', ready: () => screen.findByText('Paused Org') },
  { name: 'Admin create user', route: '/admin-create-user', Page: AdminCreateUser, scope: 'admin-create-user-theme-scope', ready: () => screen.findByText('Create Single User') },
  { name: 'System health', route: '/admin/system-health', Page: SystemHealth, scope: 'system-health-theme-scope', ready: () => screen.findByText('Orphan seats') },
  { name: 'Admin centre', route: '/admin/center', Page: AdminCenter, scope: 'admin-center-theme-scope', ready: () => screen.findByText('Master App Registry') },
  { name: 'Seed apps', route: '/admin/seed-apps', Page: AdminSeedApps, scope: 'seed-apps-theme-scope', ready: () => screen.findByText('Master Apps Seeder') },
  { name: 'Master apps viewer', route: '/admin/master-apps-viewer', Page: MasterAppsViewer, scope: 'master-apps-viewer-theme-scope', ready: () => screen.findByText('Seismolord') },
  { name: 'Profile', route: '/profile', Page: Profile, scope: 'profile-theme-scope', ready: () => screen.findByText('Complete Your Profile') },
];

PAGES.forEach(({ name, route, Page, scope, ready }) => {
  describeAppTheme({
    name,
    route,
    renderApp: () => renderAccountPage(Page),
    ready,
    scopeTestId: scope,
    userId: 'u1',
  });
});

function renderMobile(path = '/mobile/dashboard') {
  return render(
    <AuthContext.Provider value={{ user: TEST_USER, loading: false, signOut: jest.fn() }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mobile" element={<MobileLayout />}>
            <Route path="dashboard" element={<MobileDashboard />} />
            <Route path="projects" element={<MobileProjectList />} />
            <Route path="tasks" element={<MobileTasks />} />
            <Route path="notifications" element={<MobileNotifications />} />
            <Route path="profile" element={<MobileProfile />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describeAppTheme({
  name: 'Mobile shell',
  route: '/mobile/dashboard',
  renderApp: () => renderMobile(),
  ready: () => screen.findByText('Alpha Field'),
  scopeTestId: 'mobile-theme-scope',
  userId: 'u1',
});

const inScope = (el) => expect(el.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');

describe('W6G pages, dialogs, panels and states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('super admin shows organisation status as a word and every dialog opens in the scope', async () => {
    renderAccountPage(SuperAdminConsole);
    await screen.findByText('Paused Org');
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('suspended')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getAllByTitle('Edit Entitlements')[0]);
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit Entitlements: Test Org')).toBeInTheDocument();
    inScope(dialog);
    expectNoLegacyChrome();

    // Internal org: the add-application dialog opens on top.
    fireEvent.click(within(dialog).getByRole('button', { name: /Add Application/ }));
    expect(await screen.findByText('Add Application to Test Org')).toBeInTheDocument();
    screen.getAllByRole('dialog').forEach(inScope);
    expectNoLegacyChrome();
  });

  it('super admin emergency access and delete dialogs open in the scope', async () => {
    renderAccountPage(SuperAdminConsole);
    await screen.findByText('Paused Org');

    fireEvent.click(screen.getAllByTitle('Grant Emergency Access')[0]);
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Grant Emergency Access')).toBeInTheDocument();
    inScope(dialog);
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    dialog = await screen.findByText('Danger Zone');
    inScope(dialog);
    expectNoLegacyChrome();
  });

  it('super admin members and audit tabs stay on roles', async () => {
    renderAccountPage(SuperAdminConsole);
    await screen.findByText('Paused Org');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Members/ }), { button: 0 });
    await screen.findByText('grace@example.com');
    expectNoLegacyChrome();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Audit Log/ }), { button: 0 });
    await screen.findByPlaceholderText('Search logs...');
    expectNoLegacyChrome();
  });

  it('system health gives each status a word', async () => {
    renderAccountPage(SystemHealth);
    await screen.findByText('Orphan seats');
    expect(screen.getByText('Action Needed')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Deprecated Table')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('admin centre panels (build history, seed tools, diagnostics) render inside the one scope', async () => {
    renderAccountPage(AdminCenter);
    await screen.findByText('Master App Registry');
    expect(screen.getByText('Pending Development')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Build History' }));
    await screen.findByText('Track creation, updates, fixes, and testing of applications.');
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: 'Seed Tools' }));
    await screen.findByText('Master Apps Seeder');
    // The panel only: one scope, no second page header inside the centre.
    expect(document.querySelectorAll('[data-pl-root]')).toHaveLength(1);
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: 'Access Diagnostics' }));
    await screen.findByText('No Active Subscription Record Found!');
    expectNoLegacyChrome();
  });

  it('admin centre mobile menu opens in the scope', async () => {
    renderAccountPage(AdminCenter);
    await screen.findByText('Master App Registry');
    fireEvent.click(screen.getByRole('button', { name: 'Open admin menu' }));
    const sheet = await screen.findByRole('dialog');
    inScope(sheet);
    expectNoLegacyChrome();
    // W7F: the phone menu used to open empty. Negative control: on the old
    // AdminCenter the sheet holds no menu buttons.
    for (const label of ['App Registry', 'Build History', 'Seed Tools', 'Access Diagnostics']) {
      expect(within(sheet).getByRole('button', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(within(sheet).getByRole('button', { name: 'Build History' }));
    await screen.findByText('Track creation, updates, fixes, and testing of applications.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('master apps viewer shows access and orphan status as words', async () => {
    renderAccountPage(MasterAppsViewer);
    await screen.findByText('Seismolord');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('NULL MODULE ID')).toBeInTheDocument();
    expect(screen.getByText('Apps without a module ID')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('profile complete state is themed and keeps the toggle', async () => {
    renderAccountPage(Profile, {
      auth: { user: { ...TEST_USER, user_metadata: { profile_setup_complete: true } } },
      path: '/profile',
    });
    // Complete profile and no onboarding flag: the plain "My Profile" form.
    await screen.findByText('My Profile');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('profile "all set" state (complete profile in an onboarding flow) is themed', async () => {
    renderAccountPage(Profile, {
      auth: { user: { ...TEST_USER, user_metadata: { profile_setup_complete: true } } },
      path: { pathname: '/profile', state: { onboarding: true } },
    });
    await screen.findByText("You're All Set!");
    expect(screen.getByRole('button', { name: 'Go to Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it.each([
    ['/mobile/projects', 'My Projects'],
    ['/mobile/tasks', 'Review AFE'],
    ['/mobile/notifications', 'Budget alert'],
    ['/mobile/profile', 'Sign Out'],
  ])('mobile page %s is themed', async (path, text) => {
    renderMobile(path);
    await screen.findByText(text);
    expectNoLegacyChrome();
  });
});
