// The one design-system scope for the dashboard (batch 7A,
// docs/scope/DesignSystem-Rollout.md section 5.1).
//
// DashboardLayout renders this around its content column (the <Outlet />),
// so every page under /dashboard is themed by one provider: the landing,
// the module hubs, every app and help guide, the account pages and the
// AccessDenied and ComingSoon states ProtectedAppRoute renders. Pages do not
// wrap themselves in <ThemedApp> any more (src/design/__tests__/
// dashboardScope.test.jsx fails if one does), so there is one storage
// listener and the theme holds while the user moves between pages. The
// header ThemeToggle of each page sits inside this scope and switches it.
//
// The sidebar rail and the phone bar stay outside it: they are the fixed
// dark ink frame in both themes (lead decision 1).
//
// The app theme tests mount their app inside this same component through
// the shared helpers (src/design/testing/themeAssertions.js).
import React from 'react';
import { ThemedApp } from './ThemeProvider.jsx';

export const DASHBOARD_SCOPE_TEST_ID = 'dashboard-theme-scope';

export function DashboardScope({ className = 'min-h-full', children, ...rest }) {
  return (
    <ThemedApp className={className} data-testid={DASHBOARD_SCOPE_TEST_ID} {...rest}>
      {children}
    </ThemedApp>
  );
}

export default DashboardScope;
