/**
 * Cold-load loaders on the opted-in paths paint the device's last theme
 * (petrolord.theme.v1.last), so a light user does not see a dark spinner
 * before a light app. Other paths keep the legacy loader (pinned in
 * uiLegacyDom.test.jsx). THEMED paths stay in step with App.jsx.
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
import { isThemedPath, isPublicLightPath, coldLoadTheme, THEMED_HUBS } from '@/design/coldLoad';
import { LAST_THEME_KEY } from '@/design/ThemeProvider';
import { LEGACY_FIXTURE_PATH } from '@/design/testing/LegacyAppFixture';

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
  ])('%s is themed', (p) => expect(isThemedPath(p)).toBe(true));

  it.each([
    // paths no rollout batch registers (batch paths are checked in rolloutFiles.test.js)
    '/', '/nextgen', '/login-x', '/legal', '/dashboard/reservoir-x', '/dashboard/apps', '/dashboard/apps/economics',
    LEGACY_FIXTURE_PATH, `${LEGACY_FIXTURE_PATH}/help`, '/dashboard/apps/economics/epe-suite',
    '/dashboard/apps/geoscience/seismolord-legacy', undefined,
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

  it('elsewhere the legacy loaders stay, whatever the device key says', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'light');
    render(loading(<AuthGuard><p>app</p></AuthGuard>, LEGACY_FIXTURE_PATH));
    expect(screen.queryByTestId('themed-loading')).toBeNull();
    expect(document.querySelector('.bg-slate-900')).not.toBeNull();
    expect(document.querySelector('[data-pl-theme]')).toBeNull();
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
    // and the homepage keeps its legacy loader
    expect(coldLoadTheme('/')).toBeNull();
  });

  it('a garbage device key falls back to light', () => {
    window.localStorage.setItem(LAST_THEME_KEY, 'purple');
    expect(coldLoadTheme('/dashboard')).toBe('light');
  });
});

describe('THEMED paths stay in step with App.jsx', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');

  it('the root Suspense PageLoader uses the cold-load theme', () => {
    const loader = app.slice(app.indexOf('const PageLoader'), app.indexOf('const ExternalRedirect'));
    expect(loader).toMatch(/coldLoadTheme\(pathname\)/);
    expect(loader).toMatch(/ThemedLoadingScreen/);
  });

  it('every hub inside HubScope is listed', () => {
    const start = app.indexOf('<Route element={<HubScope />}>');
    const block = app.slice(start, app.indexOf('</Route>', start));
    const hubs = [...block.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    expect(hubs.length).toBe(10);
    expect([...hubs].sort()).toEqual([...THEMED_HUBS].sort());
  });

  it('every route inside the EPE ThemedApp layout route and every ThemedApp route element is themed', () => {
    const start = app.indexOf('<Route element={<ThemedApp');
    const block = app.slice(start, app.indexOf('</Route>', start + 10));
    const epe = [...block.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    expect(epe.length).toBeGreaterThan(5);
    const inline = [...app.matchAll(/path="([^"]+)" element=\{<ThemedApp/g)].map((m) => m[1]);
    for (const p of [...epe, ...inline]) {
      expect({ p, themed: isThemedPath(`/dashboard/${p.replace(/:[^/]+/g, 'x')}`) }).toEqual({ p, themed: true });
    }
  });

  it('the apps that wrap ThemedApp inside their own component are listed', () => {
    for (const [route, file] of [
      ['apps/reservoir/decline-curve-analysis', '../../pages/apps/DeclineCurveAnalysis.jsx'],
      ['apps/geoscience/seismolord', '../../pages/apps/Seismolord/Seismolord.jsx'],
    ]) {
      expect(app).toContain(`path="${route}"`);
      expect(fs.readFileSync(path.resolve(__dirname, file), 'utf8')).toMatch(/<ThemedApp/);
      expect(isThemedPath(`/dashboard/${route}`)).toBe(true);
    }
  });
});
