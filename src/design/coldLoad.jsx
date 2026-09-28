// Cold-load screens on the opted-in (pilot) paths.
//
// Before the auth session restores, the app shows a loader from outside any
// <ThemedApp> (AuthGuard, ProtectedRoute, the root Suspense PageLoader). On
// the paths below that loader paints in the theme this device last resolved
// (petrolord.theme.v1.last, light when unknown), so a light user does not
// see a dark spinner before a light app, and a dark user sees no light flash.
// Every other path keeps its legacy loader byte for byte.
//
// Keep THEMED_PATHS in step with the opted-in routes in App.jsx; the test
// src/design/__tests__/coldLoad.test.jsx reads App.jsx and fails if a scoped
// route is missing here.
import React from 'react';
import { readLastTheme } from './ThemeProvider.jsx';
import { DEFAULT_THEME } from './tokens.js';

// the dashboard landing and the ten module hubs (pilot 1, HubScope)
export const THEMED_HUBS = [
  'geoscience', 'reservoir', 'drilling', 'production', 'economics', 'facilities',
  'midstream-downstream', 'process-safety', 'data-ai', 'assurance',
];

// apps that opted in, by path prefix (pilots 2 to 5)
export const THEMED_APP_PREFIXES = [
  '/dashboard/apps/reservoir/decline-curve-analysis',
  '/dashboard/apps/economics/epe',
  '/dashboard/apps/geoscience/seismolord',
  '/dashboard/apps/reservoir/voidage-replacement-monitor',
];

const trimSlash = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

/** True when `pathname` renders inside a design-system scope. */
export function isThemedPath(pathname) {
  if (typeof pathname !== 'string') return false;
  const p = trimSlash(pathname);
  if (p === '/dashboard') return true;
  if (THEMED_HUBS.some((h) => p === `/dashboard/${h}`)) return true;
  return THEMED_APP_PREFIXES.some((pre) => {
    const bare = trimSlash(pre);
    return p === bare || p.startsWith(`${bare}/`);
  });
}

/** The theme a cold-load loader should paint on `pathname`, or null for legacy. */
export function coldLoadTheme(pathname) {
  if (!isThemedPath(pathname)) return null;
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
