# Investigation & Analysis Report: Risk Register Application (Assurance Module)

## Investigation Steps & Findings

### Task 1: Assurance Page Structure
- **File**: `src/pages/dashboard/Assurance.jsx`
- **Rendering Method**: The page uses the `useAppsFromDatabase('assurance')` hook to fetch applications assigned to the "assurance" module. It passes this data to the `<ApplicationsGrid moduleFilter="assurance" searchQuery={searchTerm} />` component.
- **App Card Definition**: The individual cards are rendered inside `ApplicationsGrid`. 
- **Link Generation**: `ApplicationsGrid` uses a fallback mechanism. If the app is found in the static `applications.js` registry, it uses that `route`. If not, it dynamically constructs the path: `/dashboard/apps/${app.module}/${app.slug}`. For the Risk Register, this resolves to `/dashboard/apps/assurance/risk-register`.

### Task 2: Registry & Configuration
- **File**: `src/data/applications.js`
- **Findings**: Searched for `risk-register`. The entry is **MISSING**. Only `risk-heatmap` exists for the assurance module in the static registry.
- **Impact**: The UI cannot pull static overrides (like specific icons or explicit route definitions) for this app, relying entirely on the dynamic fallback.

### Task 3: Component Existence
- **File**: `src/pages/apps/RiskRegister.jsx`
- **Findings**: The file **DOES NOT EXIST** in the codebase.
- **Impact**: Even if routed correctly, there is no component to render.

### Task 4: Route Configuration
- **File**: `src/App.jsx`
- **Findings**: Searched for `/dashboard/apps/assurance/risk-register`. The route definition is **MISSING**.
- **Impact**: React Router falls back to the catch-all route for the assurance module (`<Route path="assurance/*" element={<Navigate to="/dashboard/assurance" replace />} />`), immediately redirecting the user back to the dashboard when they click the card.

### Task 5: App Card Rendering Logic
- **Findings**: The rendering is correct. The database provides the slug (`risk-register`), and the grid attempts to link to it. The issue is purely infrastructural on the frontend.

## Task 6: Root Cause Analysis
**Exact Root Cause**: The Risk Register app card link is broken because of a complete lack of frontend infrastructure for this specific application. It suffers from a missing component (`RiskRegister.jsx`), a missing route declaration in `App.jsx`, and a missing static registry entry in `applications.js`. The combination of these missing pieces causes the router's wildcard fallback to silently redirect the user back to the dashboard.

## Task 7-9: Fix & Verification Plan
1. **Create Component**: Build `src/pages/apps/RiskRegister.jsx` with a functional, default-exported UI.
2. **Update Registry**: Add `risk-register` to `src/data/applications.js` so `ApplicationsGrid` has a definitive source of truth.
3. **Update Routes**: Add the lazy import and `<Route>` definition in `src/App.jsx`.
4. **Verification**: Clicking the card will now successfully navigate to the new component without triggering the fallback redirect. No other assurance cards will be affected.