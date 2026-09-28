/**
 * Batch 7A (docs/scope/DesignSystem-Rollout.md section 5.1): one theme scope
 * for the dashboard.
 *
 *   1. No page or component under src/pages, src/components or src/layouts
 *      renders its own <ThemedApp>, apart from the pages outside /dashboard
 *      that open their own scope (the public and auth frame, AccountScope
 *      for /profile and the super-admin pages, the /mobile shell). The
 *      detector is checked on planted sources (negative control).
 *   2. App.jsx has no scope under /dashboard: its only ThemedApp is the dev
 *      harness scope.
 *   3. Mounted through the real DashboardLayout, a hub, an app, the
 *      ProtectedAppRoute access-restricted state, an account page and a
 *      help guide each sit in the one scope: one [data-pl-root], one
 *      storage listener, the page's header toggle switches it, and the
 *      sidebar stays the dark ink rail outside it.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const chain = () => {
    const q = {
      select: () => q, eq: () => q, neq: () => q, order: () => q, limit: () => q, or: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (res) => Promise.resolve({ data: [], error: null, count: 0 }).then(res),
    };
    return q;
  };
  return { supabase: { auth: {}, from: jest.fn(() => chain()), functions: { invoke: jest.fn() } } };
});
jest.mock('@/hooks/useHSEAccess', () => ({ useHSEAccess: () => ({ can: () => false }) }));
jest.mock('@/hooks/useSuiteAccess', () => ({ useSuiteAccess: () => ({ can: () => true }) }));
jest.mock('@/contexts/ImpersonationContext', () => ({
  useImpersonation: () => ({ isImpersonating: false, exitImpersonation: jest.fn() }),
}));
let mockHasAccess = false;
jest.mock('@/hooks/useUserEntitlements', () => ({
  useUserEntitlements: () => ({
    loading: false, hasAccessToApp: () => mockHasAccess, refetch: jest.fn(), stale: false, stampedAt: null,
  }),
}));

// eslint-disable-next-line import/first
import { AuthContext } from '@/contexts/SupabaseAuthContext';
// eslint-disable-next-line import/first
import DashboardLayout from '@/layouts/DashboardLayout';
// eslint-disable-next-line import/first
import HubScope from '@/components/hubs/HubScope';
// eslint-disable-next-line import/first
import ProtectedAppRoute from '@/components/ProtectedAppRoute';
// eslint-disable-next-line import/first
import { AccountScope, AccountHeader, AccountPage } from '@/components/account/accountChrome';
// eslint-disable-next-line import/first
import { HelpGuideShell, GuideSection } from '@/components/helpguide/HelpGuideLayout';
// eslint-disable-next-line import/first
import { AppHeader } from '@/components/ui/app-shell';
// eslint-disable-next-line import/first
import { DASHBOARD_SCOPE_TEST_ID } from '@/design/DashboardScope';
// eslint-disable-next-line import/first
import { expectNoLegacyChrome, installDomShims } from '@/design/testing/themeAssertions';

const SRC = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------- 1. sources

// The pages outside /dashboard that open their own scope, and why.
const ALLOWED = {
  'components/public/PublicPage.jsx': 'public and auth pages (7C), always light',
  'components/account/accountChrome.jsx': 'AccountScope: /profile and the super-admin pages (inside the dashboard it is a plain element)',
  'layouts/MobileLayout.jsx': 'the /mobile shell (6G)',
};

// JSX text of a source file with comments removed (line and block).
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** True when the source renders a <ThemedApp ...> element (comments ignored). */
const rendersThemedApp = (src) => /<ThemedApp\b/.test(stripComments(src));

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const full = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === '__tests__' || d.name === '__mocks__' ? [] : walk(full);
  return /\.(jsx?|tsx?)$/.test(d.name) && !/\.test\./.test(d.name) ? [full] : [];
});

describe('no page under /dashboard opens a scope of its own', () => {
  it('the detector sees a planted wrap and ignores comments (negative control)', () => {
    expect(rendersThemedApp('export default () => (<ThemedApp className="min-h-screen"><App /></ThemedApp>);')).toBe(true);
    expect(rendersThemedApp('return <ThemedApp data-testid="x">{c}</ThemedApp>;')).toBe(true);
    expect(rendersThemedApp('// the app used to wrap itself in <ThemedApp>\nreturn <div />;')).toBe(false);
    expect(rendersThemedApp('/* inside a <ThemedApp> scope */ const a = 1;')).toBe(false);
    expect(rendersThemedApp('const url = "https://x"; return <div />;')).toBe(false);
  });

  it('no file in src/pages, src/components or src/layouts renders <ThemedApp> except the allowed ones', () => {
    const files = ['pages', 'components', 'layouts'].flatMap((d) => walk(path.join(SRC, d)));
    expect(files.length).toBeGreaterThan(500);
    const offenders = files
      .filter((f) => rendersThemedApp(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f))
      .filter((rel) => !ALLOWED[rel]);
    expect(offenders).toEqual([]);
    // the allowed files still open their scope (so the list does not go stale)
    Object.keys(ALLOWED).forEach((rel) => {
      expect({ rel, wraps: rendersThemedApp(fs.readFileSync(path.join(SRC, rel), 'utf8')) }).toEqual({ rel, wraps: true });
    });
  });

  it('App.jsx has no scope under /dashboard; its one ThemedApp is the dev harness scope', () => {
    const app = stripComments(fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8'));
    const wraps = app.match(/<ThemedApp\b[^>]*>/g) || [];
    expect(wraps).toEqual(['<ThemedApp className="min-h-screen" data-testid="dev-theme-scope">']);
    expect(app.indexOf('<ThemedApp')).toBeGreaterThan(app.indexOf('import.meta.env.DEV &&'));
    const start = app.indexOf('<Route path="/dashboard" element={');
    expect(start).toBeGreaterThan(-1);
    expect(app.slice(start, app.indexOf('import.meta.env.DEV &&'))).not.toMatch(/<ThemedApp\b/);
  });
});

// ------------------------------------------------------------- 2. rendering

const AUTH = {
  user: { id: 'u1', user_metadata: { full_name: 'Ada Tester' } },
  loading: false,
  isSuperAdmin: false,
  role: 'member',
  organization: { id: null },
  signOut: jest.fn(),
};

const Hub = () => <AppHeader title="Test Hub" />;
const App = () => <div><AppHeader title="Test Studio" /><p>studio body</p></div>;
const Account = () => (
  <AccountScope testId="account-root">
    <AccountPage><AccountHeader title="Seats" /></AccountPage>
  </AccountScope>
);
const Guide = () => (
  <HelpGuideShell title="Test Guide" sections={[{ id: 'a', title: 'Start' }]}>
    <GuideSection id="a"><p>guide body</p></GuideSection>
  </HelpGuideShell>
);

function Shell({ at }) {
  return (
    <AuthContext.Provider value={AUTH}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route element={<HubScope />}>
              <Route path="test-hub" element={<Hub />} />
            </Route>
            <Route path="apps/test/studio" element={<ProtectedAppRoute appId="t" appName="Test Studio"><App /></ProtectedAppRoute>} />
            <Route path="apps/test/studio/help" element={<Guide />} />
            <Route path="seats" element={<Account />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeAll(() => {
  installDomShims();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
beforeEach(() => {
  window.localStorage.clear();
  mockHasAccess = false;
});
afterEach(() => jest.restoreAllMocks());

const storageListeners = () => window.addEventListener.mock.calls.filter(([type]) => type === 'storage').length;

const expectOneScope = () => {
  const scope = screen.getByTestId(DASHBOARD_SCOPE_TEST_ID);
  expect(document.querySelectorAll('[data-pl-root]')).toHaveLength(1);
  expect(scope).toHaveAttribute('data-pl-root');
  return scope;
};

const expectToggleSwitches = (scope) => {
  expect(scope).toHaveAttribute('data-pl-theme', 'light');
  const toggles = screen.getAllByTestId('theme-toggle');
  expect(toggles).toHaveLength(1);
  expect(scope).toContainElement(toggles[0]);
  fireEvent.click(toggles[0]);
  expect(scope).toHaveAttribute('data-pl-theme', 'dark');
  expect(window.localStorage.getItem('petrolord.theme.v1:u1')).toBe('dark');
  fireEvent.click(screen.getByTestId('theme-toggle'));
  expect(scope).toHaveAttribute('data-pl-theme', 'light');
};

describe('every /dashboard page sits in the one scope', () => {
  it.each([
    ['a hub', '/dashboard/test-hub', 'Test Hub'],
    ['an app', '/dashboard/apps/test/studio', 'Test Studio'],
    ['an account page', '/dashboard/seats', 'Seats'],
    ['a help guide on the shared shell', '/dashboard/apps/test/studio/help', 'Test Guide'],
  ])('%s: one scope, one storage listener, the header toggle switches it', async (_label, at, title) => {
    mockHasAccess = true;
    jest.spyOn(window, 'addEventListener');
    render(<Shell at={at} />);
    await screen.findAllByText(title);
    const scope = expectOneScope();
    expect(scope).toContainElement(screen.getAllByText(title)[0]);
    expect(storageListeners()).toBe(1);
    expectToggleSwitches(scope);
  });

  it('the account page root is a plain element inside the scope (no nested scope)', async () => {
    render(<Shell at="/dashboard/seats" />);
    const root = await screen.findByTestId('account-root');
    expect(root).not.toHaveAttribute('data-pl-root');
    expect(root).not.toHaveAttribute('data-pl-theme');
    expect(root.closest('[data-pl-root]')).toBe(screen.getByTestId(DASHBOARD_SCOPE_TEST_ID));
  });

  it('the ProtectedAppRoute access-restricted state is themed, in both themes', async () => {
    render(<Shell at="/dashboard/apps/test/studio" />);
    await screen.findByText('Access Restricted');
    const scope = expectOneScope();
    expect(scope).toContainElement(screen.getByText('Access Restricted'));
    expectNoLegacyChrome();
    window.localStorage.setItem('petrolord.theme.v1:u1', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'petrolord.theme.v1:u1', newValue: 'dark' }));
    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the sidebar stays the dark ink rail outside the scope, whatever the theme', async () => {
    window.localStorage.setItem('petrolord.theme.v1:u1', 'light');
    render(<Shell at="/dashboard/test-hub" />);
    await screen.findByText('Test Hub');
    const scope = expectOneScope();
    const rail = screen.getAllByTestId('dashboard-sidebar-rail')[0];
    expect(rail).toHaveAttribute('data-pl-theme', 'dark');
    expect(scope).not.toContainElement(rail);
    expect(scope.contains(screen.getByTestId('dashboard-mobile-bar'))).toBe(false);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expect(rail).toHaveAttribute('data-pl-theme', 'dark');
  });
});
