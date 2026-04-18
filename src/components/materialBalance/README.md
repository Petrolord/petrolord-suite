# Material Balance Pro

## Architecture
Material Balance Pro is a modular React application designed for reservoir engineering analysis.

### Core Modules
- **Engine:** Pure JS functions for MB calculations (`src/utils/materialBalance`).
- **Context:** Global state management for project data (`MaterialBalanceContext`).
- **UI:** Shadcn/UI components with Tailwind CSS.
- **Persistence:** Adapter-based storage (IndexedDB default).

### Key Features
1. **Dynamic Start Day:** Automatically detects the first available day in the datasets and uses it as the initial reference point for all calculations, removing any hardcoded reliance on Day 0.
2. **Data Import:** Supports Excel/CSV paste for Production, Pressure, and PVT data.
3. **Diagnostics:** Campbell, Havlena-Odeh, and P/Z plots.
4. **Modeling:** Linear regression fitting for OOIP/OGIP and Drive Indices.
5. **Forecasting:** Production scheduling and pressure prediction.
6. **Project Management:** Save/Load/Duplicate projects locally.

### Developer Notes
- Always use `MBErrorBoundary` around new major components.
- Use `MBDataPersistence` for all storage operations; do not use `localStorage` directly for project data.
- Keep calculation logic in `utils` folders, separate from UI components.