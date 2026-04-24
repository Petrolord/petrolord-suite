# Petrolord Suite - Application Routing Analysis

## 1. Main Routing File
*   **Location**: `src/App.jsx`
*   **Role**: This is the central entry point for all client-side routing. It handles:
    *   Context Provider wrapping (`AuthProvider`, `HSEProvider`, `IntegrationProvider`, etc.).
    *   Lazy loading of page components.
    *   Definition of the Route tree using `react-router-dom`.
    *   Implementation of global error boundaries and authentication guards.

## 2. Routing Structure
*   **Framework**: React Router v6.
*   **Architecture**:
    *   **Nested Routing**: Utilizes nested routes for the `/dashboard` and `/mobile` sections to apply shared layouts (`DashboardLayout`, `MobileLayout`).
    *   **Lazy Loading**: Extensive use of `React.lazy()` and `Suspense` with a fallback `PageLoader`. This splits the bundle significantly by domain (Geoscience, Economics, etc.).
    *   **Context-Driven**: Routing logic is heavily intertwined with authentication and entitlement contexts (`SupabaseAuthContext`, `AdminOrganizationContext`).

## 3. Route Guards & Middleware
The application uses a layered approach to route protection:

*   **`AuthGuard`**: Top-level wrapper ensuring the authentication session is resolved before rendering any routes.
*   **`ProtectedRoute`**: The primary guard. It checks:
    *   User authentication.
    *   `requiredRole` (e.g., 'super_admin').
    *   `requiredPermission` (e.g., `SUITE_PERMISSIONS.MANAGE_BILLING`).
    *   `appContext` (redirects purely HSE users to external sites).
*   **`SuperAdminRoute`**: Specialized guard strictly for users with the `is_super_admin` flag.
*   **`OnboardingRoute`**: Wraps the `/dashboard` to ensure users have completed setup/onboarding steps.
*   **`ProtectedAppRoute`**: Granular guard for individual apps (e.g., QuickVol). It verifies if the user's organization has purchased the specific `appId`.
*   **`AppRoute`**: Wraps module hubs (e.g., `/dashboard/geoscience`) to check module-level access.

## 4. Navigation & File Organization
*   **Routing Definition**: `src/App.jsx` (The map).
*   **Layouts**: `src/layouts/DashboardLayout.jsx`, `src/layouts/MobileLayout.jsx`.
*   **Page Component Structure**:
    *   **Root Pages**: `src/pages/*.jsx` (Login, Home, Signup).
    *   **Admin Console**: `src/pages/admin/*.jsx`.
    *   **Domain Hubs**: `src/pages/dashboard/*.jsx` (e.g., `GeoscienceAnalytics.jsx`).
    *   **Applications**: `src/pages/apps/*.jsx` (Contains the heavy business logic apps like `ReservoirCalcPro`, `VelocityModelBuilder`).
    *   **Mobile Views**: `src/pages/mobile/*.jsx`.

## 5. Defined Routes (Summary)

### Public & Auth
*   `/`, `/login`, `/signup`, `/forgot-password`, `/set-password`
*   `/auth/accept-invite`, `/auth/confirm`
*   `/payment/verify`
*   `/legal/*`, `/solutions`, `/resources`, `/about-us`

### Super Admin
*   `/super-admin` (Console)
*   `/admin/organizations`, `/admin/system-health`, `/admin/seed-apps`, etc.

### Dashboard (`/dashboard/*`)
Wrapped in `DashboardLayout`.
*   **Hubs**: `geoscience`, `reservoir`, `drilling`, `production`, `economics`, `facilities`, `assurance`.
*   **Management**:
    *   `upgrade`, `modules`, `employees`, `access-requests`
    *   `subscriptions`, `subscriptions/analytics`, `audit-logs`
*   **Specific Apps (Nested under `apps/`)**:
    *   *Geoscience*: `apps/geoscience/hub`, `apps/geoscience/velocity-model-builder`, `apps/geoscience/earth-model-studio`...
    *   *Drilling*: `apps/drilling/well-planning`, `apps/drilling/casing-tubing-design-pro`...
    *   *Economics*: `apps/economics/petroleum-economics-studio`, `apps/economics/capital-portfolio-studio`...
    *   *(Note: `apps/geoscience/quickvol` currently routes to `ReservoirCalcPro`)*

### Mobile (`/mobile/*`)
Wrapped in `MobileLayout`.
*   `dashboard`, `projects`, `tasks`, `notifications`, `profile`.

## 6. Routing Tree Snippet (Abstracted)