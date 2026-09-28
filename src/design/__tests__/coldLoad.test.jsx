/**
 * Cold-load loaders on the themed paths paint the device's last theme
 * (petrolord.theme.v1.last), so a light user does not see a dark spinner
 * before a light app. Paths with no scope (the homepage) paint the light
 * loader (batch 7B retired the legacy loaders). Since batch 7A every /dashboard path is themed
 * (one scope in DashboardLayout); the themed paths outside /dashboard stay
 * in step with App.jsx.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: {}, from: jest.fn() } }));
jest.mock('@/hooks/useHSEAccess', () => ({ useHSEAccess: () => ({ can: () => true }) }));
jest.mock('@/hooks/useSuiteAccess', () => ({ useSuiteAccess: () => ({ can: () => true }) }));

import { AuthContext } from '@/contexts/SupabaseAuthContext';
import AuthGuard from '@/components/AuthGuard';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  isThemedPath, isPublicLightPath, coldLoadTheme, THEMED_PAGE_PREFIXES, PUBLIC_PAGE_PREFIXES,
} from '@/design/coldLoad';
import { LAST_THEME_KEY } from '@/design/ThemeProvider';
const OUTSIDE_PATH = '/legacy/unmigrated-page';

afterEach(() => {
  cleanup();
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

const loading = (el, at) => (
  <AuthContext.Provider value={{ loading: true, user: null }}>
    <MemoryRouter initialEntries={[at]}>{el}</MemoryRouter>
  </AuthContext.Provider>
);

describe('isThemedPath', () => {
  it.each([
    '/dashboard', '/dashboard/', '/dashboard/reservoir', '/dashboard/assurance',
    '/dashboard/apps/economics/epe/cases', '/dashboard/apps/economics/epe/runs/42',
    '/dashboard/apps/reservoir/decline-curve-analysis',
    '/dashboard/apps/geoscience/seismolord', '/dashboard/apps/geoscience/seismolord/help',
    '/dashboard/apps/reservoir/voidage-replacement-monitor',
    // since 7A: any path under /dashboard, whatever the route
    '/dashboard/reservoir-x', '/dashboard/apps', '/dashboard/apps/economics', '/dashboard/upgrade',
    '/dashboard/apps/economics/epe-suite', '/dashboard/apps/not-a-route/help',
    // the signed-in pages outside /dashboard that open their own scope
    '/profile', '/mobile/tasks', '/super-admin', '/admin/organizations/42/edit',
  ])('%s is themed', (p) => expect(isThemedPath(p)).toBe(true));

  it.each([
    '/', '/nextgen', '/login-x', '/legal', '/dashboardx', '/dashboard-x', '/x/dashboard',
    '/admin', '/admin/organizationsx', '/profiles',
    OUTSIDE_PATH, `${OUTSIDE_PATH}/help`, undefined, null, 42,
  ])('%s is not themed', (p) => expect(isThemedPath(p)).toBe(false));
});

describe('the loaders', () => {
  it('AuthGuard on a pilot path paints light by default', () => {
    render(loading(<AuthGuard><p>app</p></AuthGuard>, '/dashboard/apps/economics/epe/cases'));
    const scr = screen.getByTestId('themed-loading');
    expect(scr).toHaveAttribute('data-pl-theme', 'light');
    expect(scr).toHaveAttribute('role', 'status');
    expect(document.querySelector('.bg-slate-900')).toBeNull();
  });

  it('AuthGuard on a pilot path paints the device last theme', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    render(loading(<AuthGuard><p>app</p></AuthGuard>, '/dashboard'));
    expect(screen.getByTestId('themed-loading')).toHaveAttribute('data-pl-theme', 'dark');
  });

  it('ProtectedRoute on a pilot path paints the device last theme', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'light');
    render(loading(<ProtectedRoute><p>app</p></ProtectedRoute>, '/dashboard/apps/reservoir/decline-curve-analysis'));
    expect(screen.getByTestId('themed-loading')).toHaveAttribute('data-pl-theme', 'light');
    expect(document.querySelector('.bg-slate-950')).toBeNull();
  });

  it('elsewhere (the homepage) the loaders paint light, whatever the device key says', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    render(loading(<AuthGuard><p>app</p></AuthGuard>, '/'));
    expect(screen.getByTestId('themed-loading')).toHaveAttribute('data-pl-theme', 'light');
    cleanup();
    render(loading(<ProtectedRoute><p>app</p></ProtectedRoute>, OUTSIDE_PATH));
    expect(screen.getByTestId('themed-loading')).toHaveAttribute('data-pl-theme', 'light');
    expect(document.querySelector('.bg-slate-900, .bg-slate-950, .border-lime-400')).toBeNull();
  });

  it('the public and auth pages (7C) paint light whatever the device key says', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'dark');
    for (const p of ['/login', '/signup', '/set-password', '/auth/reset-password', '/legal/privacy-policy']) {
      expect(isPublicLightPath(p)).toBe(true);
      expect(coldLoadTheme(p)).toBe('light');
    }
    render(loading(<AuthGuard><p>app</p></AuthGuard>, '/login'));
    expect(screen.getByTestId('themed-loading')).toHaveAttribute('data-pl-theme', 'light');
    // the app paths still follow the device key
    expect(isPublicLightPath('/dashboard')).toBe(false);
    expect(coldLoadTheme('/dashboard')).toBe('dark');
    // and the homepage opens no scope (its loaders fall back to light)
    expect(coldLoadTheme('/')).toBeNull();
  });

  it('a garbage device key falls back to light', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'purple');
    expect(coldLoadTheme('/dashboard')).toBe('light');
  });
});

describe('the themed paths stay in step with App.jsx', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');

  it('the root Suspense PageLoader uses the cold-load theme', () => {
    const loader = app.slice(app.indexOf('const PageLoader'), app.indexOf('const ExternalRedirect'));
    expect(loader).toMatch(/coldLoadTheme\(pathname\)/);
    expect(loader).toMatch(/ThemedLoadingScreen/);
  });

  it('/dashboard renders DashboardLayout, which holds the one dashboard scope', () => {
    const start = app.indexOf('<Route path="/dashboard" element={');
    expect(start).toBeGreaterThan(-1);
    expect(app.slice(start, app.indexOf('}>', start))).toMatch(/<DashboardLayout \/>/);
    const layout = fs.readFileSync(path.resolve(__dirname, '../../layouts/DashboardLayout.jsx'), 'utf8');
    expect(layout).toMatch(/<DashboardScope>[\s\S]*<Outlet \/>[\s\S]*<\/DashboardScope>/);
  });

  it('every themed prefix outside /dashboard is well formed, listed once and starts a route', () => {
    const all = [...THEMED_PAGE_PREFIXES, ...PUBLIC_PAGE_PREFIXES];
    expect(new Set(all).size).toBe(all.length);
    for (const p of all) {
      expect({ p, ok: /^\/[a-z0-9][a-z0-9/_-]*[a-z0-9]$/i.test(p) && !p.startsWith('/dashboard') }).toEqual({ p, ok: true });
      expect({ p, route: app.includes(`path="${p}`) }).toEqual({ p, route: true });
      expect({ p, themed: isThemedPath(`${p}/help`) }).toEqual({ p, themed: true });
    }
  });
});
