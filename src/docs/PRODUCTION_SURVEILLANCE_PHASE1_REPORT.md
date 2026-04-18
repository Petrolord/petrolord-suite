# Production Surveillance Dashboard - Phase 1 Investigation Report

## Task 1: Current Implementation Investigation

### 1. Main Dashboard Component (`src/pages/apps/ProductionSurveillanceDashboard.jsx`)
**Overview:** The root container for the application. Manages state for the current project, handles saving/loading, and orchestrates the tabbed navigation.
- **State/Hooks:**
  - `user`: from `useAuth()`
  - `projectName`, `projectId`, `inputs`, `results`, `loading`, `isSaveDialogOpen`, `isLoadDialogOpen` via `useState`.
  - `useToast` for user feedback.
- **Data/Supabase Operations:**
  - `handleSaveProject`: Performs an UPSERT (insert or update) to `production_surveillance_projects` using `supabase.from()`. Includes `project_name`, `inputs_data`, `results_data`, `user_id`, and `updated_at`.
- **Logic & Flow:**
  - `handleRunAnalysis`: Simulates data processing using a `setTimeout` of 1500ms and calls `generateUptimeData(analysisInputs)`. This is a mock function simulating the backend/calculation engine.
- **Structure:**
  - Header: Back button, Load Project button, Save Project button, Title/Subtitle.
  - Body: Conditionally renders `EmptyState`, a loading spinner, or `Tabs`.
  - Tabs: "overview", "data", "allocation", "analytics", "reports".
  - Dialogs: Save Project Dialog, Load Project Dialog.

### 2. Sub-Components (`src/components/productionsurveillance/*`)
**`EmptyState.jsx`**
- **Purpose:** Displayed when no results exist and not loading.
- **State:** Functional UI component with Framer Motion animations.
- **Logic/Placeholders:** Has a "Run Demo Analysis" button that triggers the main mock calculation.

**`DataIngestionHub.jsx`**
- **Purpose:** Interface for data connections and file uploads.
- **Real logic:** Uses `react-dropzone` for UI interaction (drag & drop production and well test files).
- **Stubs/Placeholders:**
  - Real-time connectors (OSIsoft PI, OPC-UA, Emerson DeltaV, Custom API) are purely UI buttons that trigger a `"🚧 Feature Coming Soon!"` toast.
  - "Configure Validation Rules" triggers a toast.
  - "Process & Validate Data" button simply calls the parent `onRunAnalysis` mock function without actually processing the dropped files.

**`FieldOverviewDashboard.jsx`**
- **Purpose:** High-level executive view.
- **Real logic:** Renders `react-chartjs-2` Bar/Line chart using data passed in `results.trendData`. Renders a data table for wells.
- **Stubs/Placeholders:**
  - KPIs (Uptime, Lost Production, etc.) rely purely on the mock `results.kpis` generated in the parent.
  - **Hardcoded mock logic:** The Well Status column dynamically fakes a status on render using `Math.random() > 0.1 ? 'Producing' : 'Shut-in'`, which will change every time the component re-renders.

**`ProductionAllocationEngine.jsx`**
- **Purpose:** View distributed facility production back to individual wells.
- **Real logic:** Renders a data table using `results.allocationData`. Calculates totals in the footer using the provided data.
- **Stubs/Placeholders:**
  - "View Audit Trail" button triggers a `"🚧 Feature Coming Soon!"` toast. No real audit data exists.

**`PerformanceAnalytics.jsx`**
- **Purpose:** Granular breakdown of downtime and targets.
- **Real logic:** Renders two charts (Pareto for downtime, Bar/Line combo for variance analysis) using `paretoData` and `varianceData`.
- **Stubs/Placeholders:**
  - The bottom "Key Performance Indicators" section is entirely hardcoded HTML text (e.g., `92.1%`, `34.5%`, `1,250 scf/stb`, `96.8%`).

**`ReportsAndAlerts.jsx`**
- **Purpose:** Report generation and alert configuration.
- **Real logic:** Purely UI presentation. Forms have visual elements but no backing state.
- **Stubs/Placeholders:**
  - PDF/CSV Export buttons trigger a dummy `"Export Initiated"` toast.
  - "Customize Report Template" button triggers a `"Coming Soon!"` toast.
  - "Save Alert Settings" trigger a fake `"Settings Saved"` toast. Form state is not captured or sent anywhere.

**`LoadSurveillanceProjectDialog.jsx`**
- **Purpose:** Modal to view and load past projects.
- **Real logic:** Successfully queries Supabase `production_surveillance_projects` on open, mapping over returned rows to display project names and dates. Clicking "Load" correctly passes data back to parent.

---

## Task 2: Supabase Schema & Data Integration State

**References Found:**
- Table: `production_surveillance_projects`
- Fields mapped in code: `id`, `project_name`, `user_id`, `inputs_data` (jsonb), `results_data` (jsonb), `updated_at` (timestamptz), `created_at` (timestamptz).

**State of Data-Layer Integration:**
- **Create/Update (Upsert):** Fully functional via `handleSaveProject`. Authenticated user context is strictly required and enforced via UI validation before saving.
- **Read:** Fully functional via `LoadSurveillanceProjectDialog`. Fetches the id, name, and dates, and subsequently loads the JSON payloads into app state.
- **Missing Elements:**
  - There are NO tables or schemas for connecting external APIs (Connectors), storing raw uploaded timeseries data (Daily Production/Well Tests), persisting Alert Configurations, or saving custom Report Templates.
  - Currently, the app treats a "Project" as a single point-in-time snapshot of the mock calculated output.

---

## Task 3: Gap Analysis & Phase 2 Roadmap

### Detailed Gap Analysis

| Feature / Section | Status | Details |
| :--- | :--- | :--- |
| **Project Save/Load** | Fully Functional | CRUD operations to Supabase `production_surveillance_projects` work for storing snapshot states. |
| **Data Hub: File Uploads** | Stub/Placeholder | UI accepts files via dropzone, but they are completely ignored. No CSV parsing logic exists. |
| **Data Hub: API Connectors** | Completely Missing | UI buttons exist but trigger toasts. No actual integration logic or backend. |
| **Calculation Engine** | Stub/Placeholder | `generateUptimeData` generates static random objects. No mathematical models for nodal analysis, allocation, or downtime attribution. |
| **Field Overview: Charts** | Partially Implemented | Chart.js rendering works, but relies entirely on mock data streams. |
| **Field Overview: Well Status** | Stub/Placeholder | Uses `Math.random()` to generate producing vs shut-in states. |
| **Performance: KPI Cards** | Completely Missing | Hardcoded strings in the UI (`92.1%`, `34.5%`, etc). |
| **Allocation Engine** | Partially Implemented | Table renders correctly, but data is fake. Audit trail is a toast stub. |
| **Reports: Generation** | Stub/Placeholder | No PDF library (like `jspdf` or `html2canvas`) is integrated for this module. Export triggers a toast. |
| **Alerts: Configuration** | Completely Missing | UI form exists but state is not captured and cannot be saved anywhere in the database. |

### Development Starting-Point Map for Phase 2 (Concrete Engineering Work)

To transform this into a fully working app, the following concrete engineering tasks must be executed:

1.  **Data Ingestion & Parsing (The foundation):**
    - Implement `papaparse` in `DataIngestionHub.jsx` to parse the dropped CSV files.
    - Create a data validation service to check for required columns (Date, Well ID, Oil, Gas, Water, Hours On, Choke, etc.).
    - Pass the parsed JSON arrays into the parent state (`inputs`).

2.  **Calculation Engine Implementation (`utils/productionSurveillanceCalculations.js`):**
    - Replace the mock `generateUptimeData` with real algorithms.
    - **Allocation Math:** Calculate theoretical facility production based on individual well tests, compare to actual facility meter, and distribute the variance back to wells based on their individual production potential.
    - **Downtime Math:** Analyze "Hours On" against 24 hours. Categorize shortfalls and aggregate lost barrels.
    - Format outputs into exactly the shapes needed by Chart.js instances (`trendData`, `paretoData`, `varianceData`).

3.  **Dynamic UI Hookup:**
    - `PerformanceAnalytics.jsx`: Remove hardcoded KPIs. Extract these values from the new calculation engine's output.
    - `FieldOverviewDashboard.jsx`: Remove the `Math.random()` status generator. Deduce well status based on the parsed CSV data (e.g., `Hours On == 0` equals `Shut-in`).

4.  **Reporting Engine:**
    - Integrate `jspdf` and `jspdf-autotable` (or similar available dependencies) inside `ReportsAndAlerts.jsx`.
    - Create a function that loops over `results` data to assemble a formatted PDF table/chart payload and prompts the user to download it.
    - Implement CSV export by utilizing `papaparse`'s unparse feature or native Blob/URL techniques for `results.allocationData`.

5.  **Alerts Persistence Expansion (Optional / Advanced):**
    - Create a state object in `ReportsAndAlerts.jsx` to hold alert preferences.
    - Expand the `production_surveillance_projects` JSON schema to include an `alert_settings` object within the save payload. 

*This concludes the Phase 1 investigation. The app shell, routing, and persistence layer are stable, but the core processing logic and data parsing layers require complete implementation in Phase 2.*