# 🚀 Well Test Analyzer: User's Guide

## 🌟 Overview

Welcome to the Well Test Analyzer! This powerful application is your go-to solution for unlocking critical insights from pressure transient data. Designed for petroleum engineers and geoscientists, it transforms raw well test data into actionable intelligence about your reservoir and wellbore.

**What does it do?**

*   **Data-Driven Decisions**: Rapidly analyze pressure and rate data to determine key reservoir characteristics like permeability (kh), skin factor, and initial pressure (Pi).
*   **Comprehensive Diagnostics**: Utilize industry-standard diagnostic plots—Derivative, Horner, MDH/Agarwal, and Flow Regimes—to visually interpret complex reservoir behavior.
*   **Enhanced Model Fitting**: Apply various analytical models (Homogeneous, Dual Porosity, Boundary) to accurately fit your data and refine your understanding.
*   **Gas Well Capability**: Seamlessly handle gas well data with automated pseudo-pressure and pseudo-time calculations, ensuring accurate analysis for all fluid types.
*   **Interactive & Intuitive**: Enjoy an interactive experience with zoomable plots, adjustable smoothing, and a user-friendly interface that streamlines your workflow.
*   **Project Management**: Save, load, and manage all your analysis projects, creating a persistent workspace for continuous well test interpretation.
*   **Automated Reporting & Integration**: Generate professional PDF reports and easily integrate your results with other industry-standard tools like Nodal Analysis and Material Balance.

The Well Test Analyzer is engineered to empower you with precision, speed, and clarity in every well test interpretation!

## 🛠️ Getting Started: The Workflow

### 1. Load Your Data
- **Drag & Drop**: Begin by dragging your well test data file (in .csv, .txt, or .las format) into the upload area.
- **Run a Demo**: Alternatively, click "Run Analysis" to load a sample dataset and explore the application's features immediately.

### 2. Quality Control (QC) & Mapping
- **Column Mapping**: Once data is loaded, you'll enter the QC panel. Here, you must map your data columns to 'Time' and 'Pressure'. 'Rate' is optional but recommended for comprehensive analysis.
- **Visual QC**: A plot of your raw data is displayed. Visually inspect it for anomalies, noise, or inconsistencies.
- **Select a Model**: Choose the appropriate analytical model for your reservoir (e.g., Homogeneous, Dual Porosity).
- **Confirm Properties**: Review and adjust fluid and reservoir properties if needed.
- **Fit Model**: Click "Confirm & Fit Model" to proceed with the analysis.

### 3. Analyze & Interpret Results
- **Key Parameters**: The main results table displays the calculated Key Performance Indicators (KPIs) like Permeability, Skin, and Initial Pressure, along with their P10/P90 confidence intervals.
- **Diagnostic Plots**:
    - **Derivative Plot**: The primary diagnostic tool. Use the log-log plot of pressure change and its derivative to identify flow regimes (wellbore storage, radial flow, boundaries).
    - **Horner Plot**: A classic semi-log plot used for buildup tests to estimate initial reservoir pressure.
    - **MDH/Agarwal Plot**: Another semi-log plot for identifying radial flow and estimating permeability.
    - **Regimes Plot**: A summary chart that visually identifies the duration of each dominant flow regime.
- **Interactivity**:
    - **Zoom & Pan**: Click and drag on any plot to zoom into areas of interest. Use the mouse wheel to zoom in and out.
    - **Derivative Smoothing**: Use the slider below the plots to apply Bourdet smoothing, which helps clarify noisy derivative data.

### 4. Manage Your Work
- **Save Project**: After a successful analysis, click the "Save" button. Give your project a name. This saves all inputs and results.
- **Load Project**: Click "Load Project" to open a dialog with all your saved analyses. You can search, load, or delete projects from this hub.
- **Update Project**: If you load a project and re-run the analysis, clicking "Update" will save the new results over the existing project.

### 5. Export & Integrate
- **Generate PDF Report**: Click "Generate PDF Report" to create a professional, shareable summary of your analysis, including all inputs, results, and plots.
- **Integrate**: Use the integration buttons to send key results (like permeability and skin) to other Petrolord applications, such as Nodal Analysis or Material Balance, for a seamless integrated workflow.

## 📝 Changelog & Fixes (Audit Trail)

### Project Management Pro Updates
* **Task 1: RLS Policy Fix**: Investigated the `tasks` table Supabase RLS policy which blocked UPDATE operations (like re-ordering). Replaced the implicitly-checked policy with explicit `USING` and `WITH CHECK` clauses to ensure authorized project members can re-order and modify milestones securely without hitting RLS errors.
* **Task 2: Add Task Button**: Replaced the fragile inline task addition fields with a robust `TaskFormDialog` modal. The "Add Task" and "Add Milestone" buttons are now always interactive. Clicking without an active project displays a helpful warning, whereas previously it was silently disabled. Added full validation for required fields (Name, Dates) and conflict prevention.
* **Task 3: Comprehensive Milestone Actions**: 
  * Introduced a new Context Menu (right-click) and an Action Dropdown (`...` button) for all tasks and milestones in the WBS view.
  * **Actions Added**: Edit (via comprehensive modal), View Details (opens read-only info panel), Duplicate (clones context safely), Archive/Unarchive (with visibility toggle), Priority settings (Low, Medium, High, Critical), Export (JSON download), and inline Sub-task creation.
  * Migrated database schema to support `is_archived` and `priority` flags.
  * Implemented optimistic UI updates and extensive error handling/toasts for all operations.