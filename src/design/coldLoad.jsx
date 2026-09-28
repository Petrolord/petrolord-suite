// Cold-load screens on the themed paths.
//
// Before the auth session restores, the app shows a loader from outside any
// <ThemedApp> (AuthGuard, ProtectedRoute, the root Suspense PageLoader). On
// the paths below that loader paints in the theme this device last resolved
// (petrolord.theme.v1.last, light when unknown), so a light user does not
// see a dark spinner before a light page, and a dark user sees no light
// flash. The public and auth pages always paint light. Every other path
// (the homepage, NextGen, unknown paths) keeps its legacy loader byte for
// byte.
//
// Since batch 7A every page under /dashboard sits in the one dashboard scope
// (DashboardLayout, src/design/DashboardScope.jsx), so the whole /dashboard
// tree is themed and the per-batch path lists are gone. The only lists left
// are the pages outside /dashboard that open their own scope.
import React from 'react';
import { readLastTheme } from './ThemeProvider.jsx';
import { DEFAULT_THEME } from './tokens.js';

/** Every path at or under this prefix renders inside the dashboard scope. */
export const DASHBOARD_PREFIX = '/dashboard';

// Signed-in pages outside /dashboard that open their own scope and follow
// the user's choice (batches 6F and 6G): the super-admin pages and /profile
// through AccountScope, the /mobile shell through MobileLayout.
export const THEMED_PAGE_PREFIXES = Object.freeze([
  '/admin/organizations',
  '/admin/promo-codes',
  '/super-admin',
  '/admin-create-user',
  '/admin/system-health',
  '/admin/center',
  '/admin/seed-apps',
  '/admin/master-apps-viewer',
  '/profile',
  // covers /mobile/dashboard, /projects, /tasks, /notifications and /profile
  '/mobile',
]);

// The public and auth pages (batch 7C) always render light: PublicPage in
// src/components/public/PublicPage.jsx has no toggle and follows no
// per-user choice, so their loader paints light too. The homepage keeps its
// own paper look (Home.css) and is not listed.
export const PUBLIC_PAGE_PREFIXES = Object.freeze([
  '/login',
  '/signup',
  '/auth/confirm',
  '/forgot-password',
  '/auth/reset-password',
  '/set-password',
  '/auth/accept-invite',
  '/payment/verify',
  '/solutions',
  '/resources',
  '/about-us',
  '/careers',
  '/legal/terms-of-service',
  '/legal/privacy-policy',
  '/legal/data-retention',
  '/legal/dpa',
  '/legal/verify-deletion',
  '/legal/verify-export',
  '/legal/support',
  '/legal/documentation',
]);

const trimSlash = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

const underPrefix = (p, pre) => {
  const bare = trimSlash(pre);
  return p === bare || p.startsWith(`${bare}/`);
};

/** True when `pathname` is a public or auth page (always light). */
export function isPublicLightPath(pathname) {
  if (typeof pathname !== 'string') return false;
  const p = trimSlash(pathname);
  return PUBLIC_PAGE_PREFIXES.some((pre) => underPrefix(p, pre));
}

/** True when `pathname` renders inside a design-system scope. */
export function isThemedPath(pathname) {
  if (typeof pathname !== 'string') return false;
  const p = trimSlash(pathname);
  if (underPrefix(p, DASHBOARD_PREFIX)) return true;
  return THEMED_PAGE_PREFIXES.some((pre) => underPrefix(p, pre)) || isPublicLightPath(p);
}

/** The theme a cold-load loader should paint on `pathname`, or null for legacy. */
export function coldLoadTheme(pathname) {
  if (!isThemedPath(pathname)) return null;
  if (isPublicLightPath(pathname)) return 'light';
  return readLastTheme() || DEFAULT_THEME;
}

/** Full-screen themed spinner (its own scope; it is not a ThemedApp). */
export function ThemedLoadingScreen({ theme, className = 'h-screen' }) {
  return (
    <div
      data-pl-theme={theme}
      data-pl-root=""
      data-testid="themed-loading"
      role="status"
      aria-live="polite"
      className={`flex w-full items-center justify-center ${className}`}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-pl-border border-t-pl-primary" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
