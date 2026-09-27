// Design-system scope for the dashboard landing and the ten module hubs
// (pilot 1, docs/scope/DesignSystem-PLAN.md section 3).
//
// A pathless layout route in App.jsx renders this around exactly those
// routes, so they opt in together and the theme does not flip while the
// user moves between hubs. The applications opened from a hub are sibling
// routes under /dashboard, outside this element, so an app keeps its own
// look until it opts in itself (hubScope.test.jsx proves it).
//
// The lazy hubs suspend inside the scope, so their loading state follows
// the theme and the sidebar stays in place while a hub loads.
import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ThemedApp } from '@/design/ThemeProvider';

export function HubLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-pl-border border-t-pl-primary" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default function HubScope() {
  return (
    <ThemedApp className="min-h-screen" data-testid="hub-scope">
      <Suspense fallback={<HubLoading />}>
        <Outlet />
      </Suspense>
    </ThemedApp>
  );
}
