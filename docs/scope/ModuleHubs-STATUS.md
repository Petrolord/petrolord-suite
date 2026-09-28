# Module hubs and dashboard landing: status

Scope: the dashboard landing (`/dashboard`, `src/pages/Dashboard.jsx`), the
ten module hubs (`/dashboard/<module>`, `src/pages/dashboard/*Hub.jsx`,
`GeoscienceAnalytics.jsx`, `ReservoirManagement.jsx`) over the shared
`ApplicationsGrid`, and the dashboard sidebar (`DashboardSidebar`,
`DashboardLayout`).

The catalogue rule stands: a hub lists applications from `master_apps` and
from nowhere else (`src/pages/dashboard/__tests__/moduleHubs.test.js`).

## Design system

- 2026-09-27, pilot 1 (`feat/ds-pilot-hubs`): landing and hubs opt in
  through one `HubScope` (light by default, dark by choice, toggle in each
  page header). Sidebar restyled as a dark ink rail in both themes, with a
  drawer at phone width. Applications opened from a hub are outside the
  scope and look as before. Details and proof:
  `docs/scope/DesignSystem-PLAN.md` section 5.
- Open: `AccessDenied` and `ComingSoon` (shared with other routes) still
  render the legacy dark screen when a hub route is denied or not built;
  the global cold-load spinners (`AuthGuard`, `ProtectedRoute`, the root
  `Suspense` fallback) paint before any scope exists and stay legacy dark.
  The "Share Workspace" and "Add Custom App" buttons on five hubs have no
  handler (unchanged, restyled only).
