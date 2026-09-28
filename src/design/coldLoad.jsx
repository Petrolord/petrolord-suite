// Cold-load screens on the opted-in (pilot) paths.
//
// Before the auth session restores, the app shows a loader from outside any
// <ThemedApp> (AuthGuard, ProtectedRoute, the root Suspense PageLoader). On
// the paths below that loader paints in the theme this device last resolved
// (petrolord.theme.v1.last, light when unknown), so a light user does not
// see a dark spinner before a light app, and a dark user sees no light flash.
// Every other path keeps its legacy loader byte for byte.
//
// A migrated app registers its route prefix in its rollout batch's own file,
// src/design/rollout/<batch>.js (never in this file). The test
// src/design/__tests__/coldLoad.test.jsx reads App.jsx and fails if a route
// scoped there is missing.
import React from 'react';
import { readLastTheme } from './ThemeProvider.jsx';
import { DEFAULT_THEME } from './tokens.js';
import { THEMED_APP_PREFIXES } from './rollout/index.js';
import PUBLIC_PAGE_PREFIXES from './rollout/w7c.js';

// the dashboard landing and the ten module hubs (pilot 1, HubScope)
export const THEMED_HUBS = [
  'geoscience', 'reservoir', 'drilling', 'production', 'economics', 'facilities',
  'midstream-downstream', 'process-safety', 'data-ai', 'assurance',
];

// apps that opted in, by path prefix: the pilots plus one file per rollout
// batch (src/design/rollout/<batch>.js), aggregated in rollout/index.js
export { THEMED_APP_PREFIXES };

const trimSlash = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

const underPrefix = (p, pre) => {
  const bare = trimSlash(pre);
  return p === bare || p.startsWith(`${bare}/`);
};

// the public and auth pages (batch 7C) always render light: they have no
// toggle and follow no per-user choice, so their loader paints light too
export { PUBLIC_PAGE_PREFIXES };

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
  if (p === '/dashboard') return true;
  if (THEMED_HUBS.some((h) => p === `/dashboard/${h}`)) return true;
  return THEMED_APP_PREFIXES.some((pre) => underPrefix(p, pre));
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
