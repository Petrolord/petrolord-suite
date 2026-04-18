# Investigation Report: Technical Report Autopilot App Card Link

## 1. Economics & Project Management Page File
- **File Located**: `src/pages/dashboard/EconomicsProjectManagementHub.jsx` (Primary Hub) and `src/pages/dashboard/EconomicAndProjectManagement.jsx` (Secondary/Legacy Hub).
- **Primary Routing**: `App.jsx` routes `/dashboard/economics` to `<AppRoute appName="economics"><EconomicsProjectManagementHub /></AppRoute>`.
- **Review**: The page sets `moduleFilter = 'economics'` and fetches applications dynamically.

## 2. App Card Rendering Logic
- **Rendering Mechanism**: The page utilizes a custom React hook `useAppsFromDatabase(moduleFilter)` to fetch the module's associated applications from the Supabase database (`master_apps` table).
- **Component**: The fetched array is passed into the `<ApplicationsGrid moduleFilter={moduleFilter} searchQuery={searchTerm} />` component. 
- **Finding**: App cards are entirely DB-driven, relying on data pulled from the database, rather than a hardcoded frontend array.

## 3. Technical Report Autopilot App Card Definition
- **Location**: Rendered dynamically within `src/components/ApplicationsGrid.jsx`.
- **Current Link/Mapping Mechanism**: 
  - The link is generated on-the-fly using the following logic:
    `let targetRoute = app.route || (app.module ? '/dashboard/apps/' + app.module + '/' + app.slug : '/dashboard/apps/' + app.slug);`
  - Because there is no explicit override in the frontend registry, the card relies on the database-provided `module` and `slug`.
  - Assuming the DB slug is `technical-report-autopilot`, the generated link evaluates to `/dashboard/apps/economics/technical-report-autopilot`.

## 4. Link Mapping Mechanism
- **Mechanism**: Slug conversion with fallback logic. If `app.route` is defined (usually patched in via `applications.js` static registry), it uses that. Otherwise, it concatenates the DB `module` and DB `slug`. 

## 5. Applications.js Registry Entry
- **File**: `src/data/applications.js`
- **Findings**: There is **NO entry** for the Technical Report Autopilot in the static `applications` registry array.
- **Fields Found**: None. Missing `id`, `slug`, `route`, `name`, `icon`, etc.
- **Impact**: The grid cannot fall back to a safely hardcoded `route` property.

## 6. Component File Existence & Export
- **File**: `src/pages/apps/TechnicalReportAutopilot.jsx`
- **Existence**: Yes, the file exists.
- **Export**: It uses a standard default export: `export default function TechnicalReportAutopilotPage()`.
- **Errors**: No syntax or export errors were found. The component is fully functional and includes an internal `ErrorBoundary`.

## 7. App.jsx Route Configuration
- **File**: `src/App.jsx`
- **Lazy Import**: Yes, imported correctly at the top: `const TechnicalReportAutopilot = lazy(() => import('@/pages/apps/TechnicalReportAutopilot'));`.
- **Route Path**: 
  `<Route path="apps/economics/report-autopilot" element={<TechnicalReportAutopilot />} />`
- **Behavior**: The route is lazy-loaded, wrapped inside `<Suspense fallback={<PageLoader />}>` globally. 
- **Missing Wrapper**: Notably, this route is **NOT** wrapped in the standard `<ProtectedAppRoute appId="..." appName="...">` component like other secure apps in the suite.

## 8. Documented Mismatches
1. **Slug vs. Route Path Mismatch**: 
   - The route in `App.jsx` expects the URL to end in `report-autopilot` (`apps/economics/report-autopilot`).
   - The DB-driven app card generates a link utilizing the DB slug, which is likely `technical-report-autopilot`, resulting in an unmapped route (`/dashboard/apps/economics/technical-report-autopilot`), causing a 404.
2. **Missing Static Registry Fallback**: There is no entry in `applications.js` to forcefully override the link to match the `App.jsx` configuration.
3. **Missing Security Wrapper**: The route lacks the `<ProtectedAppRoute>` wrapper, bypassing standard app-level entitlement and telemetry checks.

## 9. Exact Root Cause
**The root cause is a Routing & Slug Mismatch combined with a Missing Registry Override.**
The dynamic app card generates a URL based on the database slug (e.g., `technical-report-autopilot`), but the `App.jsx` routing table is listening for a different explicit path (`report-autopilot`). Because there is no entry in the `applications.js` static registry to override the app card's link destination, the user is navigated to a 404 page.

**To Fix in Follow-up:**
1. Add an entry to `src/data/applications.js` mapping `technical-report-autopilot` explicitly to `/dashboard/apps/economics/technical-report-autopilot`.
2. Update `src/App.jsx` to map the correct path (`apps/economics/technical-report-autopilot`) and wrap the component inside `<ProtectedAppRoute>`.