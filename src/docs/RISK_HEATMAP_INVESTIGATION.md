# Investigation & Analysis Report: Risk Heatmap Application (Assurance Module)

## Phase 1: Complete Investigation

### Task 1: Assurance Module App Card Structure
- **File Locale**: `src/pages/dashboard/Assurance.jsx`
- **Rendering Mechanism**: The page utilizes the `useAppsFromDatabase('assurance')` hook. This data is passed to the `<ApplicationsGrid />` component.
- **Card Generation**: The "Risk Heatmap" app card is dynamically driven by the Supabase `master_apps` table. It is NOT hardcoded in the page component.
- **Link Generation**: The link is determined inside `ApplicationsGrid.jsx`. It checks for a static `route` property in the app object. If missing, it builds: `/dashboard/apps/${app.module}/${app.slug}`.
- **Current Link Target**: Based on database conventions for the Assurance module, the generated link is likely `/dashboard/apps/assurance/risk-heatmap`.

### Task 2: App Card Link Mapping
- **Mechanism**: The system uses a **Hybrid Mapping** approach.
  1. It first checks the static registry in `src/data/applications.js` for a matching `id` or `slug` to find an explicit `route` override.
  2. If no registry entry exists, it falls back to the dynamic path construction based on database fields (`module` and `slug`).
- **Tracing**: Clicking the card triggers `navigate(targetRoute)`. Since there is no registry entry for Risk Heatmap, it uses the fallback `/dashboard/apps/assurance/risk-heatmap`.

### Task 3: Registry Check (`src/data/applications.js`)
- **Findings**: The `applications` array was searched for "risk-heatmap", "Risk Heatmap", or any assurance-related keys.
- **Status**: **Completely Absent**. The Risk Heatmap app is not registered in the static data file.
- **Impact**: No static `route` override is available to guide the router or fix pathing mismatches.

### Task 4: Component Verification (`src/pages/apps/RiskHeatmap.jsx`)
- **Findings**: A thorough search of the `src/pages/apps/` directory and codebase inventory was conducted.
- **Status**: **Missing**. The file `src/pages/apps/RiskHeatmap.jsx` does not exist in the current project structure.
- **Impact**: Even if the route existed, the application would fail to load as the component source is missing.

### Task 5: Route Configuration (`src/App.jsx`)
- **Lazy Loading**: Missing. There is no `const RiskHeatmap = lazy(() => import(...))` statement.
- **Route Definitions**: Missing. There is no `<Route>` entry for `apps/assurance/risk-heatmap` or any related path.
- **Assurance Fallback**: There is a catch-all redirect: `<Route path="assurance/*" element={<Navigate to="/dashboard/assurance" replace />} />`. 
- **Impact**: Any attempt to navigate to the Heatmap URL results in a redirect back to the Assurance dashboard, making the app appear "broken" or "non-responsive."

### Task 6: Root Cause Synthesis
The "Risk Heatmap" app card link is broken due to a **Triple Point Failure**:
1. **Infrastructure Gap**: The route `/dashboard/apps/assurance/risk-heatmap` is not defined in `App.jsx`.
2. **Registry Gap**: The application is missing from `src/data/applications.js`, preventing the UI from knowing where the route should point or what icon/metadata to prioritize.
3. **Implementation Gap**: The actual page component `src/pages/apps/RiskHeatmap.jsx` has not been created or linked.

**Exact Root Cause**: The database-driven UI is generating a valid path based on metadata, but the frontend infrastructure (Routes, Registry, and Component) to support that path is entirely missing.

---
## Investigation Log
- `Assurance.jsx`: Confirmed using dynamic grid.
- `ApplicationsGrid.jsx`: Confirmed fallback link logic.
- `applications.js`: Confirmed missing entry.
- `App.jsx`: Confirmed missing route and import.