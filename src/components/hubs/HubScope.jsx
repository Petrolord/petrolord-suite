// Layout route for the dashboard landing and the ten module hubs.
//
// Since batch 7A the design-system scope is DashboardLayout's single
// ThemedApp (src/design/DashboardScope.jsx), which covers every page under
// /dashboard. This element keeps the hubs' own Suspense boundary, so a lazy
// hub's loading state follows the theme and the sidebar stays in place
// while a hub loads.
import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

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
    <div className="min-h-screen" data-testid="hub-scope">
      <Suspense fallback={<HubLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
