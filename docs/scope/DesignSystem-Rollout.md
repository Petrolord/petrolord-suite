# Petrolord Design System: site-wide rollout

Owner decision, 2026-09-28: "It is now time for us to proceed and make it a
site-wide implementation on all apps." Grey panel (the base light theme since
#754) with the current input styling is the default for every Suite app. Dark
stays a per-user choice through the header `ThemeToggle`, and a user can
always switch back to light (to present, to share a screen, to collaborate).

This document is the plan of record for that rollout: the inventory of every
routed page, the prerequisites, the wave plan, the per-app recipe and the end
state. The rules live in `docs/scope/DesignSystem.md`; the audit, pilots and
decisions in `docs/scope/DesignSystem-PLAN.md`; the worked recipe in
`docs/scope/DesignSystem-example-EPE.md`.

Measured on main `5c12596ce` (2026-09-28).

## 0. Summary

| | count |
|---|---|
| Dashboard apps (distinct apps, aliases folded) | 105 |
| already migrated (DCA, VRR, EPE, Seismolord) | 4, plus the landing and 10 hubs |
| apps still to migrate | 101 |
| dashboard platform pages (billing, seats, employees, admin) | 16 |
| signed-in pages outside `/dashboard` (profile, super admin, `/mobile`) | 13 |
| units to migrate in total | 130 |
| public and auth pages (homepage, login, legal) | 20, outside the rollout (section 5.4) |
| dev-only harness routes | 59 |
| own legacy colour classes still to remove (apps) | 18,390 over 1,850 own files |
| estimated effort, all units | 126 VRR-equivalents |
| agent sessions | 41 (3 prerequisite, 36 migration, 2 cleanup), plus 1 optional |

| wave | what | sessions | parallel |
|---|---|---|---|
| 0 | prerequisites: rollout plumbing, 2 ui primitives, 3 shared kits | 3 | yes, all three |
| 1 | reservoir flagships, ReservoirCalc Pro, Petrophysics, account and billing pages | 5 | yes |
| 2 | reservoir remainder, production (3 batches), economics decision tools (2) | 6 | yes |
| 3 | drilling (5 batches), organisation admin pages | 6 | yes |
| 4 | geoscience (4 batches), assurance and process safety (2) | 6 | yes |
| 5 | facilities (2), midstream and downstream (3), data and AI | 6 | yes |
| 6 | FDP Accelerator (2, in sequence), Project Management Pro (3, in sequence), super admin and internal pages (2) | 7 | 4 lanes |
| 7 | end state: scope moves to the dashboard layout, legacy branches deleted | 2 (+1 optional) | in sequence |

## 1. How the inventory was measured

A throwaway script (not committed) walked the import graph from every route
element in `src/App.jsx`:

- **App.** Routes under `/dashboard/apps/<module>/<slug>` group by slug; a
  help route (`.../help`), sub-pages (assurance registers, EPE pages, risk
  register pages) and slug aliases that render the same component (for
  example the eight `reservoir-balance` routes, the three Nodal slugs, the
  four AFE slugs) fold into one app. Redirect routes (`<Navigate>`) are not
  apps. `allApps` in `SupabaseAuthContext.jsx` is an entitlement slug list
  (91 slugs). It holds retired tiles (`seismic-interpreter`,
  `velocity-model-builder`, `waterflood-dashboard` ...) and aliases
  (`voi-analyzer`, `breakeven-analyzer`, `epe`), so it was used as a cross
  check only; App.jsx routes are the source.
- **Own files.** Files reachable from exactly one app (or page) and from no
  other. Dev harnesses are ignored when deciding ownership.
- **Shared pulls still legacy.** Files reachable from two or more apps that
  still hold legacy colour classes and do not use `useThemeClass`,
  `useStudioTheme`, `useDsTheme` or `usePortalThemeProps`. The number in
  brackets is how many apps pull the file. `ChartFrame` and `chartTheme`
  are left out: they are the white chart standard and stay as they are.
- **Legacy.** Count, in the app's own files, of
  `bg|text|border|ring|from|to|via|divide|outline|fill|stroke|placeholder|shadow`
  with `slate|zinc|gray|neutral|stone`, `black|white` backgrounds, text and
  borders, `cyan|lime|emerald` accents, and hex colours on lines with
  `className` or `style`.
- **Status hues.** Count of red, amber, green, blue and the other hues. They
  are not automatically wrong (status is allowed through the status roles)
  but each one needs a decision, so they add effort.
- **Token classes.** `hsl(var(--x))`, `bg-background`, `text-muted-foreground`
  and the other stock shadcn names. These follow the theme on their own
  inside a scope (`theme.css` re-points every variable `index.css` defines),
  so a token-built app is cheap: the assurance registers are the example.
- **Shell.** Studio kit (`StudioLayout`), workstation (`WorkspaceShell`),
  help guide (`HelpGuideLayout`) or bespoke. All three shared shells are
  already scope-aware.
- **Effort (VRR).** `0.3 + 0.7 x (legacy + 0.5 x hues) / 178.5`, so the
  Voidage Replacement Monitor as it was before pilot 5 (152 legacy, 53
  hues, 21 own files) is 1.0. The fixed 0.3 covers the wrap, the theme test,
  the cold-load entry, the STATUS update and the staging walk. Calibration
  from the other pilots before migration: DCA 477 legacy (2.4), EPE 633
  (3.1), Seismolord 862 (4.0); each was one agent session, which is where
  the batch size of 3 to 4 VRR comes from.

The pilot survey's "15 small, 6 medium, 11 large" for the 32 Studio-kit apps
used a different measure. On this one the 31 kit apps left are 16 small
(under 0.75), 11 medium (0.75 to 1.25) and 4 large (Surveillance, Waterflood
Design, Fluid Systems, Material Balance).

Usage evidence for the ordering (read-only, 2026-09-27 counts from
`DesignSystem-PLAN.md` section 3, rechecked 2026-09-28 from
`pg_stat_user_tables`): DCA 12 saved projects, EPE 10 cases, Seismolord 6
volumes, ReservoirCalc Pro 5, Material Balance 6 runs and 2 cases,
Reservoir Simulation 5 runs, VRR 4, Well Test 4, Petrophysics 4, one case
each in the ten drilling studios, one Waterflood project, one run each in
Data Quality and AI Evaluation. There is still no page-view data, so
visibility also weighs module flagships and pages every organisation admin
opens (upgrade, seats, employees, subscriptions).

## 2. Inventory

Columns: own files / own files with any colour class; legacy, status hues
and token classes counted in own files only; batch refers to section 3.
Routes are under `/dashboard/` unless they start with `/`.

#### Landing and hubs (1)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard landing + 10 module hubs | `/dashboard`, `/dashboard/<module>` (10) | `pages/Dashboard.jsx`, `pages/dashboard/GeoscienceAnalytics.jsx` +9 | bespoke | yes (#747) | 19 / 7 | 14 | 18 | 0 | - | UpgradeSuiteButton(2), lib/riskScoring.js(3) | done |

#### Geoscience (14)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BasinFlow Genesis | `/dashboard/apps/geoscience/basinflow-genesis` + `/help` | `apps/BasinFlowGenesis/BasinFlowGenesis.jsx`, `apps/BasinFlowGenesis/BasinFlowHelpGuide.jsx` | help guide | no | 76 / 40 | 697 | 193 | 0 | 3.41 | ui/radio-group(3) | 4C |
| Contour Map Digitizer | `/dashboard/apps/geoscience/contour-map-digitizer` | `apps/ContourMapDigitizer.jsx` | bespoke | no | 8 / 5 | 74 | 9 | 0 | 0.61 | - | 4D |
| Earth Modeling | `/dashboard/apps/geoscience/earth-modeling` + `/help` | `apps/EarthModeling/EarthModeling.jsx`, `apps/EarthModeling/EarthModelingHelpGuide.jsx` | workstation+help guide | no | 30 / 6 | 156 | 16 | 0 | 0.94 | maps/MapViewport(2) | 4B |
| Geoscience Hub | `/dashboard/apps/geoscience/hub` | `apps/GeoscienceHub.jsx` | bespoke | no | 1 / 1 | 26 | 7 | 0 | 0.42 | - | 4D |
| Mapping & Surface Studio | `/dashboard/apps/geoscience/mapping-surface-studio` + `/help` | `apps/MappingSurfaceStudio/MappingSurfaceStudio.jsx`, `apps/MappingSurfaceStudio/MappingHelpGuide.jsx` | workstation+help guide | no | 29 / 5 | 188 | 44 | 0 | 1.12 | maps/MapViewport(2) | 4B |
| Petrophysics Studio | `/dashboard/apps/geoscience/petrophysics-studio` + `/help` | `apps/PetrophysicsStudio/PetrophysicsStudio.jsx`, `apps/PetrophysicsStudio/PetrophysicsHelpGuide.jsx` | workstation+help guide | no | 86 / 29 | 786 | 40 | 0 | 3.46 | wells/DepthNavigator(3), wells/TopNamePopover(3), wells/LayoutPanel(2), portability/PackageExportDialog(2), portability/SigningSummary(3) | 1C |
| Pore Pressure Studio | `/dashboard/apps/geoscience/pore-pressure-studio` + `/help` | `apps/PorePressureStudio/PorePressureStudio.jsx`, `apps/PorePressureStudio/PorePressureStudioHelpGuide.jsx` | workstation+help guide | no | 16 / 5 | 108 | 8 | 0 | 0.74 | - | 4B |
| ReservoirCalc Pro | `/dashboard/apps/geoscience/reservoircalc-pro` (+ legacy `quickvol` slug) | `apps/ReservoirCalcPro/ReservoirCalcPro.jsx` | bespoke | no | 88 / 37 | 1030 | 213 | 0 | 4.76 | ui/avatar(3), ui/radio-group(3) | 1B |
| Rock Physics Studio | `/dashboard/apps/geoscience/rock-physics-studio` + `/help` | `apps/RockPhysicsStudio/RockPhysicsStudio.jsx`, `apps/RockPhysicsStudio/RockPhysicsStudioHelpGuide.jsx` | workstation+help guide | no | 28 / 6 | 146 | 12 | 0 | 0.9 | - | 4D |
| Seismolord | `/dashboard/apps/geoscience/seismolord` + `/help` | `apps/Seismolord/Seismolord.jsx`, `apps/Seismolord/SeismolordHelpGuide.jsx` | workstation+help guide | yes (#751) | 192 / 45 | 51 | 25 | 0 | - | - | done |
| Stratigraphy Studio | `/dashboard/apps/geoscience/stratigraphy-studio` + `/help` | `apps/StratigraphyStudio/StratigraphyStudio.jsx`, `apps/StratigraphyStudio/StratigraphyHelpGuide.jsx` | workstation+help guide | no | 25 / 9 | 162 | 11 | 0 | 0.96 | wells/section/CrossSection(2), wells/DepthNavigator(3), wells/TopNamePopover(3), wells/CoreImagesPanel(2), wells/IntervalsEditor(2) | 4B |
| Well Correlation | `/dashboard/apps/geoscience/well-correlation` + `/help` | `apps/WellCorrelation/WellCorrelation.jsx`, `apps/WellCorrelation/CorrelationHelpGuide.jsx` | workstation+help guide | no | 8 / 3 | 84 | 4 | 0 | 0.64 | wells/section/CrossSection(2), wells/DepthNavigator(3), wells/TopNamePopover(3), wells/LayoutPanel(2) | 4A |
| Well Data Manager | `/dashboard/apps/geoscience/well-data-manager` | `apps/WellDataManager/WellDataManager.jsx` | workstation | no | 14 / 8 | 189 | 21 | 0 | 1.08 | portability/PackageImportDialog(2), portability/PackageExportDialog(2), portability/SigningSummary(3), wells/CoreImagesPanel(2), wells/IntervalsEditor(2), wells/RowGridEditor(2) | 4A |
| Wellsite Studio | `/dashboard/apps/geoscience/wellsite-studio` + `/help` | `apps/WellsiteStudio/WellsiteStudio.jsx`, `apps/WellsiteStudio/WellsiteHelpGuide.jsx` | workstation+help guide | no | 79 / 23 | 401 | 39 | 0 | 1.95 | wells/RowGridEditor(2) | 4A |

#### Reservoir (13)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Decline Curve Analysis | `/dashboard/apps/reservoir/decline-curve-analysis` | `apps/DeclineCurveAnalysis.jsx` | Studio kit | yes (#750) | 38 / 21 | 0 | 5 | 0 | - | - | done |
| EOR Screening Tool | `/dashboard/apps/reservoir/eor-screening` + `/help` | `apps/EorScreeningTool.jsx`, `apps/EorScreeningHelpGuide.jsx` | help guide | no | 3 / 1 | 56 | 6 | 0 | 0.53 | - | 3E |
| Fluid Systems Studio | `/dashboard/apps/reservoir/fluid-systems-studio` | `apps/FluidSystemsStudio.jsx` | Studio kit | no | 43 / 17 | 302 | 42 | 0 | 1.57 | waterflooddesign/primitives(3) | 1D |
| Forecast Scenario Hub | `/dashboard/apps/reservoir/forecast-scenario-hub` + `/help` | `apps/ForecastScenarioHub.jsx`, `apps/ForecastScenarioHubHelpGuide.jsx` | help guide | no | 2 / 1 | 64 | 5 | 0 | 0.56 | - | 2A |
| Material Balance Studio (ReservoirBalance) | `/dashboard/apps/reservoir/reservoir-balance` (+7 more routes) | `apps/reservoir-balance/ReservoirBalance.jsx` | Studio kit | no | 26 / 13 | 490 | 82 | 6 | 2.38 | - | 1A |
| Recovery Factor Estimator | `/dashboard/apps/reservoir/recovery-factor-estimator` | `apps/RecoveryFactorEstimator.jsx` | Studio kit | no | 10 / 7 | 57 | 3 | 0 | 0.53 | - | 2A |
| Reservoir Simulation Studio | `/dashboard/apps/reservoir/reservoir-simulation-studio` | `apps/ReservoirSimulationStudio.jsx` | Studio kit | no | 29 / 11 | 174 | 31 | 0 | 1.04 | - | 2A |
| Risked Reserves Valuation | `/dashboard/apps/reservoir/risked-reserves-valuation` + `/help` | `apps/RiskedReservesValuation.jsx`, `apps/RiskedReservesHelpGuide.jsx` | help guide | no | 7 / 2 | 32 | 6 | 0 | 0.44 | - | 3E |
| SCAL Studio | `/dashboard/apps/reservoir/scal-studio` | `apps/ScalStudio.jsx` | Studio kit | no | 14 / 11 | 68 | 9 | 0 | 0.58 | waterflooddesign/primitives(3) | 1D |
| Voidage Replacement Monitor | `/dashboard/apps/reservoir/voidage-replacement-monitor` | `apps/VoidageReplacementMonitor.jsx` | Studio kit | yes (#749) | 21 / 16 | 5 | 9 | 0 | - | - | done |
| Waterflood Design Studio | `/dashboard/apps/reservoir/waterflood-design-studio` (+1 more route) | `apps/WaterfloodDesignStudio.jsx` | Studio kit | no | 33 / 24 | 209 | 82 | 0 | 1.28 | waterflooddesign/primitives(3) | 1D |
| Well Spacing Optimizer | `/dashboard/apps/reservoir/well-spacing-optimizer` + `/help` | `apps/WellSpacingOptimizer.jsx`, `apps/WellSpacingHelpGuide.jsx` | help guide | no | 7 / 5 | 240 | 23 | 0 | 1.29 | - | 2A |
| Well Test Analysis Studio | `/dashboard/apps/reservoir/well-test-analyzer` (+1 more route) | `apps/WellTestAnalysisStudio.jsx` | Studio kit | no | 23 / 16 | 183 | 21 | 0 | 1.06 | - | 1A |

#### Drilling & Completions (12)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Casing & Tubing Design Studio | `/dashboard/apps/drilling/casing-tubing-design-pro` + `/help` | `apps/CasingTubingDesignPro/CasingTubingDesignPro.jsx`, `apps/CasingTubingDesignPro/CasingTubingHelpGuide.jsx` | bespoke | no | 38 / 31 | 908 | 116 | 0 | 4.09 | TorqueDragStudio/components/WellboreDetails(11) | 3B |
| Cementing Studio | `/dashboard/apps/drilling/cementing-studio` + `/help` | `apps/CementingStudio/CementingStudio.jsx`, `apps/CementingStudio/CementingHelpGuide.jsx` | workstation | no | 14 / 6 | 127 | 25 | 0 | 0.85 | TorqueDragStudio/components/GeometryNotice(4), TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3D |
| Completion Design Studio | `/dashboard/apps/drilling/completion-design-studio` + `/help` | `apps/CompletionDesignStudio/CompletionDesignStudio.jsx`, `apps/CompletionDesignStudio/CompletionDesignHelpGuide.jsx` | workstation | no | 10 / 8 | 219 | 31 | 0 | 1.22 | TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3C |
| Drilling Fluids & Hydraulics Studio | `/dashboard/apps/drilling/drilling-fluids-hydraulics` + `/help` | `apps/HydraulicsStudio/HydraulicsStudio.jsx`, `apps/HydraulicsStudio/HydraulicsHelpGuide.jsx` | workstation | no | 18 / 7 | 150 | 29 | 0 | 0.95 | TorqueDragStudio/components/GeometryNotice(4), TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3D |
| Geomechanics & Wellbore Stability Studio | `/dashboard/apps/drilling/geomechanics-studio` + `/help` | `apps/GeomechanicsStudio/GeomechanicsStudio.jsx`, `apps/GeomechanicsStudio/GeomechanicsHelpGuide.jsx` | workstation | no | 15 / 6 | 111 | 25 | 0 | 0.78 | TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3E |
| Perforation & Sand Control Designer | `/dashboard/apps/drilling/perforation-sand-control` + `/help` | `apps/PerforationSandControl/PerforationSandControlStudio.jsx`, `apps/PerforationSandControl/PerforationSandControlHelpGuide.jsx` | workstation | no | 15 / 7 | 142 | 31 | 0 | 0.92 | TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3D |
| Stimulation Designer | `/dashboard/apps/drilling/stimulation-designer` + `/help` | `apps/StimulationDesigner/StimulationDesignerStudio.jsx`, `apps/StimulationDesigner/StimulationDesignerHelpGuide.jsx` | workstation | no | 17 / 7 | 121 | 26 | 0 | 0.83 | TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3E |
| Torque & Drag Studio | `/dashboard/apps/drilling/torque-drag-studio` + `/help` | `apps/TorqueDragStudio/TorqueDragStudio.jsx`, `apps/TorqueDragStudio/TorqueDragHelpGuide.jsx` | workstation | no | 10 / 7 | 129 | 23 | 0 | 0.85 | TorqueDragStudio/components/GeometryNotice(4), TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3E |
| Well Control Studio | `/dashboard/apps/drilling/well-control-studio` + `/help` | `apps/WellControlStudio/WellControlStudio.jsx`, `apps/WellControlStudio/WellControlHelpGuide.jsx` | workstation | no | 11 / 6 | 132 | 24 | 0 | 0.86 | TorqueDragStudio/components/GeometryNotice(4), TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3D |
| Well Cost & Time Estimator | `/dashboard/apps/drilling/well-cost-time` + `/help` | `apps/WellCostTime/WellCostTimeStudio.jsx`, `apps/WellCostTime/WellCostTimeHelpGuide.jsx` | workstation | no | 17 / 7 | 167 | 22 | 0 | 1 | fullprecision/FullPrecision(23), TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3C |
| Well Design Studio | `/dashboard/apps/drilling/well-planning` + `/help` (+1 more route) | `apps/WellPlanning.jsx`, `apps/well-planning/WellDesignHelpGuide.jsx` | bespoke | no | 58 / 29 | 961 | 114 | 0 | 4.29 | - | 3A |
| Well Integrity & P&A Studio | `/dashboard/apps/drilling/well-integrity-pa` + `/help` | `apps/WellIntegrityPA/WellIntegrityPAStudio.jsx`, `apps/WellIntegrityPA/WellIntegrityPAHelpGuide.jsx` | workstation | no | 15 / 7 | 181 | 49 | 0 | 1.11 | TorqueDragStudio/components/Explorer(10), TorqueDragStudio/components/WellboreDetails(11) | 3C |

#### Production (12)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Artificial Lift Advisor | `/dashboard/apps/production/artificial-lift-advisor` (+1 more route) | `apps/ArtificialLiftAdvisor.jsx` | Studio kit | no | 15 / 7 | 77 | 27 | 0 | 0.65 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2C |
| Choke & Wellhead Performance Studio | `/dashboard/apps/production/choke-performance-studio` | `apps/ChokePerformanceStudio.jsx` | Studio kit | no | 13 / 10 | 131 | 34 | 0 | 0.88 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2D |
| ESP Design Studio | `/dashboard/apps/production/esp-design-studio` | `apps/EspDesignStudio.jsx` | Studio kit | no | 17 / 14 | 188 | 43 | 0 | 1.12 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2C |
| Flow Assurance Studio | `/dashboard/apps/production/flow-assurance-studio` | `apps/FlowAssuranceStudio.jsx` | Studio kit | no | 14 / 13 | 152 | 25 | 0 | 0.95 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2D |
| Gas Lift Design Studio | `/dashboard/apps/production/gas-lift-design-studio` | `apps/GasLiftDesignStudio.jsx` | Studio kit | no | 14 / 11 | 165 | 27 | 0 | 1 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2C |
| Gas Well Performance Studio | `/dashboard/apps/production/gas-well-performance-studio` | `apps/GasWellPerformanceStudio.jsx` | Studio kit | no | 16 / 11 | 122 | 44 | 0 | 0.86 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2D |
| Nodal Analysis Studio | `/dashboard/apps/production/nodal-analysis-studio` (+2 more routes) | `apps/NodalAnalysisStudio.jsx` | Studio kit | no | 13 / 8 | 69 | 17 | 0 | 0.6 | - | 2D |
| Production Allocation Studio | `/dashboard/apps/production/production-allocation-studio` | `apps/ProductionAllocationStudio.jsx` | Studio kit | no | 18 / 13 | 199 | 49 | 0 | 1.18 | production/FieldPicker(2) | 2B |
| Production Network Studio | `/dashboard/apps/production/production-network-studio` | `apps/ProductionNetworkStudio.jsx` | Studio kit | no | 13 / 9 | 148 | 32 | 0 | 0.94 | production/WellModelPanel(9) | 2B |
| Production Surveillance Studio | `/dashboard/apps/production/production-surveillance-studio` | `apps/ProductionSurveillanceStudio.jsx` | Studio kit | no | 15 / 12 | 232 | 29 | 0 | 1.27 | production/FieldPicker(2) | 2B |
| Rod Pump Design Studio | `/dashboard/apps/production/rod-pump-design-studio` | `apps/RodPumpDesignStudio.jsx` | Studio kit | no | 17 / 14 | 159 | 38 | 0 | 1 | fullprecision/FullPrecision(23), production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2C |
| Well Intervention Planner | `/dashboard/apps/production/well-intervention-planner` | `apps/WellInterventionPlanner.jsx` | Studio kit | no | 13 / 9 | 117 | 28 | 0 | 0.81 | production/WellModelSpinePanel(8), production/WellModelPanel(9) | 2D |

#### Economics & Project Management (12)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AFE Cost Control Manager | `/dashboard/apps/economics/afe-cost-control` (+3 more routes) | `apps/AfeCostControlManager.jsx` | bespoke | no | 14 / 10 | 265 | 97 | 0 | 1.53 | fullprecision/FullPrecision(23) | 2F |
| Capital Portfolio Studio | `/dashboard/apps/economics/capital-portfolio-studio` | `apps/CapitalPortfolioStudio.jsx` | bespoke | no | 7 / 6 | 129 | 40 | 0 | 0.88 | fullprecision/FullPrecision(23) | 2E |
| Decision Studio | `/dashboard/apps/economics/decision-studio` | `apps/DecisionStudio.jsx` | bespoke | no | 4 / 2 | 48 | 7 | 0 | 0.5 | fullprecision/FullPrecision(23) | 2F |
| Decision Tree Builder | `/dashboard/apps/economics/decision-tree-builder` | `apps/DecisionTreeBuilder.jsx` | bespoke | no | 4 / 3 | 63 | 15 | 0 | 0.58 | fullprecision/FullPrecision(23), decisiontree/TreeDiagram(2) | 2F |
| FDP Accelerator | `/dashboard/apps/economics/fdp-accelerator` | `apps/FDPAccelerator.jsx` | bespoke | no | 97 / 63 | 1128 | 285 | 0 | 5.28 | fullprecision/FullPrecision(23) | 6A/6B |
| Fiscal Regime Designer | `/dashboard/apps/economics/fiscal-regime-designer` | `apps/FiscalRegimeDesigner.jsx` | bespoke | no | 19 / 10 | 211 | 35 | 0 | 1.2 | fullprecision/FullPrecision(23) | 2E |
| NPV Scenario Builder | `/dashboard/apps/economics/npv-scenario-builder` | `apps/NpvScenarioBuilder.jsx` | bespoke | no | 18 / 13 | 279 | 53 | 14 | 1.5 | fullprecision/FullPrecision(23) | 2E |
| Petroleum Economics Studio | `/dashboard/apps/economics/epe/cases` + `/help` (+6 more routes) | `apps/epe/EpeCaseList.jsx`, `apps/epe/EpeHelpGuide.jsx` +4 | bespoke | yes (#748) | 17 / 12 | 8 | 2 | 0 | - | - | done |
| Probabilistic Breakeven Analyzer | `/dashboard/apps/economics/breakeven-analyzer` (+3 more routes) | `apps/ProbabilisticBreakevenAnalyzer.jsx` | bespoke | no | 14 / 8 | 96 | 13 | 0 | 0.7 | fullprecision/FullPrecision(23) | 2F |
| Project Management Pro | `/dashboard/apps/economics/project-management-pro` | `apps/ProjectManagementPro.jsx` | bespoke | no | 81 / 68 | 1943 | 483 | 0 | 8.87 | fullprecision/FullPrecision(23), ui/avatar(3) | 6C/6D/6E |
| Technical Report Autopilot | `/dashboard/apps/economics/report-autopilot` (+3 more routes) | `apps/TechnicalReportAutopilot.jsx` | bespoke | no | 7 / 6 | 60 | 20 | 0 | 0.57 | ui/radio-group(3) | 4D |
| Value of Information Analyzer | `/dashboard/apps/economics/voi-analyzer` (+3 more routes) | `apps/ValueOfInformationAnalyzer.jsx` | bespoke | no | 9 / 7 | 65 | 20 | 0 | 0.59 | decisiontree/TreeDiagram(2), fullprecision/FullPrecision(23) | 2F |

#### Facilities (13)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Compressor Station Designer | `/dashboard/apps/facilities/compressor-station-designer` | `apps/CompressorStationDesigner.jsx` | Studio kit | no | 7 / 4 | 58 | 9 | 0 | 0.55 | fullprecision/FullPrecision(23) | 5B |
| Control Valve & Choke Sizing | `/dashboard/apps/facilities/control-valve-sizing` | `apps/ControlValveSizing.jsx` | Studio kit | no | 7 / 4 | 69 | 23 | 0 | 0.62 | - | 5A |
| Corrosion & Integrity Studio | `/dashboard/apps/facilities/corrosion-rate-predictor` | `apps/CorrosionRatePredictor.jsx` | Studio kit | no | 7 / 4 | 75 | 25 | 0 | 0.64 | - | 5A |
| Facility Layout Mapper | `/dashboard/apps/facilities/facility-layout-mapper` | `apps/FacilityLayoutMapper.jsx` | bespoke | no | 15 / 11 | 146 | 30 | 0 | 0.93 | fullprecision/FullPrecision(23) | 5A |
| Flow Metering Designer | `/dashboard/apps/facilities/flow-metering-designer` | `apps/FlowMeteringDesigner.jsx` | Studio kit | no | 7 / 4 | 52 | 10 | 0 | 0.52 | - | 5B |
| Gas Processing Studio | `/dashboard/apps/facilities/gas-treating-dehydration` | `apps/GasTreatingDehydration.jsx` | Studio kit | no | 8 / 5 | 38 | 16 | 0 | 0.48 | fullprecision/FullPrecision(23) | 5B |
| Heat Exchanger & Cooling Studio | `/dashboard/apps/facilities/heat-exchanger-sizer` | `apps/HeatExchangerSizer.jsx` | Studio kit | no | 8 / 5 | 65 | 15 | 0 | 0.58 | fullprecision/FullPrecision(23) | 5A |
| Pipeline & Line Sizing Studio | `/dashboard/apps/facilities/facility-network-hydraulics` | `apps/PipelineLineSizingStudio.jsx` | Studio kit | no | 14 / 9 | 89 | 14 | 0 | 0.68 | fullprecision/FullPrecision(23) | 5A |
| Produced Water Treatment Studio | `/dashboard/apps/facilities/produced-water-treatment` | `apps/ProducedWaterTreatment.jsx` | Studio kit | no | 7 / 4 | 54 | 11 | 0 | 0.53 | - | 5B |
| Pump Station Designer | `/dashboard/apps/facilities/pump-station-designer` | `apps/PumpStationDesigner.jsx` | Studio kit | no | 7 / 4 | 53 | 13 | 0 | 0.53 | fullprecision/FullPrecision(23) | 5B |
| Relief & Flare Studio | `/dashboard/apps/facilities/relief-blowdown-sizer` | `apps/ReliefBlowdownSizer.jsx` | Studio kit | no | 10 / 7 | 53 | 12 | 0 | 0.53 | fullprecision/FullPrecision(23) | 5B |
| Separator & Slug Catcher Studio | `/dashboard/apps/facilities/separator-slug-catcher-designer` | `apps/SeparatorSlugCatcherDesigner.jsx` | Studio kit | no | 6 / 5 | 53 | 17 | 0 | 0.54 | fullprecision/FullPrecision(23) | 5B |
| Storage Tank & Venting Designer | `/dashboard/apps/facilities/storage-tank-designer` | `apps/StorageTankDesigner.jsx` | Studio kit | no | 7 / 4 | 62 | 12 | 0 | 0.57 | - | 5B |

#### Midstream & Downstream (12)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Carbon Footprint & Abatement Studio | `/dashboard/apps/midstream-downstream/carbon-footprint-abatement` | `apps/CarbonAbatementStudio.jsx` | bespoke | no | 7 / 5 | 83 | 41 | 0 | 0.71 | - | 5E |
| Crude Assay & Blending Studio | `/dashboard/apps/midstream-downstream/crude-assay-blending-studio` | `apps/CrudeAssayBlendingStudio.jsx` | bespoke | no | 7 / 5 | 98 | 25 | 0 | 0.73 | - | 5D |
| Energy & Utilities Efficiency Studio | `/dashboard/apps/midstream-downstream/energy-utilities-efficiency` | `apps/EnergyEfficiencyStudio.jsx` | bespoke | no | 9 / 6 | 103 | 35 | 0 | 0.77 | fullprecision/FullPrecision(23) | 5C |
| Flare Gas to Value Studio | `/dashboard/apps/midstream-downstream/flare-gas-to-value` | `apps/FlareToValueStudio.jsx` | bespoke | no | 8 / 5 | 81 | 32 | 0 | 0.68 | - | 5E |
| Fuel Pricing & Supply Chain Studio | `/dashboard/apps/midstream-downstream/fuel-pricing-supply-chain` | `apps/FuelPricingStudio.jsx` | bespoke | no | 8 / 5 | 102 | 26 | 0 | 0.75 | - | 5C |
| LPG & CNG Rollout Studio | `/dashboard/apps/midstream-downstream/lpg-cng-rollout-studio` | `apps/LpgCngRolloutStudio.jsx` | bespoke | no | 9 / 6 | 97 | 29 | 0 | 0.74 | - | 5D |
| Marine Logistics Planner | `/dashboard/apps/midstream-downstream/marine-logistics-planner` | `apps/MarineLogisticsPlanner.jsx` | bespoke | no | 14 / 9 | 131 | 28 | 0 | 0.87 | - | 5C |
| Materials & Spares Planner | `/dashboard/apps/midstream-downstream/materials-spares-planner` | `apps/MaterialsSparesPlanner.jsx` | bespoke | no | 15 / 10 | 100 | 16 | 0 | 0.72 | - | 5D |
| Modular Refinery Feasibility Studio | `/dashboard/apps/midstream-downstream/modular-refinery-feasibility` | `apps/ModularRefineryFeasibility.jsx` | bespoke | no | 7 / 4 | 88 | 11 | 0 | 0.67 | - | 5E |
| Product Blending Optimizer | `/dashboard/apps/midstream-downstream/product-blending-optimizer` | `apps/ProductBlendingOptimizer.jsx` | bespoke | no | 7 / 4 | 94 | 17 | 0 | 0.7 | fullprecision/FullPrecision(23) | 5E |
| Refinery Planning & Scheduling Studio | `/dashboard/apps/midstream-downstream/refinery-planning-scheduling` | `apps/RefineryPlanningStudio.jsx` | bespoke | no | 11 / 6 | 162 | 13 | 0 | 0.96 | fullprecision/FullPrecision(23) | 5C |
| Terminal & Depot Studio | `/dashboard/apps/midstream-downstream/terminal-depot-studio` | `apps/TerminalDepotStudio.jsx` | bespoke | no | 6 / 4 | 94 | 20 | 0 | 0.71 | - | 5D |

#### Process Safety (3)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Consequence Modelling Studio | `/dashboard/apps/process-safety/consequence-studio` + `/help` | `apps/ConsequenceModellingStudio.jsx`, `apps/ConsequenceModellingStudioHelpGuide.jsx` | help guide | no | 12 / 5 | 19 | 7 | 0 | 0.39 | processsafety/consequence/fields(2), processsafety/lopa/shared(3) | 4F |
| LOPA & SIL Studio | `/dashboard/apps/process-safety/lopa-sil-studio` + `/help` | `apps/LopaSilStudio.jsx`, `apps/LopaSilStudioHelpGuide.jsx` | help guide | no | 9 / 5 | 69 | 20 | 0 | 0.61 | processsafety/lopa/shared(3) | 4F |
| QRA Studio | `/dashboard/apps/process-safety/qra-studio` + `/help` | `apps/QraStudio.jsx`, `apps/QraStudioHelpGuide.jsx` | help guide | no | 15 / 8 | 106 | 36 | 0 | 0.79 | processsafety/consequence/fields(2), processsafety/lopa/shared(3) | 4F |

#### Data & AI (5)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AI Evaluation Studio | `/dashboard/apps/data-ai/ai-evaluation-studio` + `/help` | `apps/AiEvaluationStudio.jsx`, `apps/AiEvaluationStudioHelpGuide.jsx` | help guide | no | 27 / 10 | 46 | 12 | 0 | 0.5 | dataai/quality/shared(5) | 5F |
| Data Quality Studio | `/dashboard/apps/data-ai/data-quality-studio` + `/help` | `apps/DataQualityStudio.jsx`, `apps/DataQualityStudioHelpGuide.jsx` | help guide | no | 11 / 5 | 67 | 7 | 0 | 0.58 | dataai/quality/shared(5) | 5F |
| Electrofacies Studio | `/dashboard/apps/data-ai/electrofacies-studio` + `/help` | `apps/ElectrofaciesStudio.jsx`, `apps/ElectrofaciesStudioHelpGuide.jsx` | help guide | no | 24 / 9 | 65 | 11 | 0 | 0.58 | dataai/quality/shared(5) | 5F |
| ML Workbench | `/dashboard/apps/data-ai/ml-workbench` + `/help` | `apps/MlWorkbench.jsx`, `apps/MlWorkbenchHelpGuide.jsx` | help guide | no | 14 / 7 | 70 | 9 | 0 | 0.59 | dataai/quality/shared(5) | 5F |
| Production Forecasting ML Workbench | `/dashboard/apps/data-ai/forecasting-ml-workbench` + `/help` | `apps/ForecastingMlWorkbench.jsx`, `apps/ForecastingMlWorkbenchHelpGuide.jsx` | help guide | no | 19 / 7 | 45 | 10 | 0 | 0.5 | dataai/quality/shared(5) | 5F |

#### Assurance (9)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Audit & Findings Manager | `/dashboard/apps/assurance/audit-manager/*` | `apps/assurance/audit-manager/AuditManagerPageShell.jsx` | bespoke | no | 14 / 0 | 0 | 0 | 208 | 0.3 | assurance/shared/ConfirmDialog(3) | 4E |
| Document Control | `/dashboard/apps/assurance/document-control` (+5 more routes) | `apps/assurance/document-control/Dashboard.jsx`, `apps/assurance/document-control/Library.jsx` +4 | bespoke | no | 12 / 1 | 1 | 0 | 144 | 0.3 | - | 4F |
| ISO Compliance | `/dashboard/apps/assurance/iso-compliance/*` | `apps/assurance/iso-compliance/ISOCompliancePageShell.jsx` | bespoke | no | 14 / 0 | 0 | 0 | 188 | 0.3 | assurance/shared/ConfirmDialog(3) | 4E |
| Lessons Learned | `/dashboard/apps/assurance/lessons-learned/*` | `apps/assurance/lessons-learned/LessonsLearnedPageShell.jsx` | bespoke | no | 12 / 0 | 0 | 0 | 131 | 0.3 | lib/riskScoring.js(3), assurance/shared/ConfirmDialog(3) | 4E |
| Management of Change | `/dashboard/apps/assurance/management-of-change` (+5 more routes) | `apps/assurance/moc/Dashboard.jsx`, `apps/assurance/moc/Register.jsx` +4 | bespoke | no | 12 / 1 | 1 | 0 | 171 | 0.3 | - | 4F |
| Peer Review Manager | `/dashboard/apps/assurance/peer-review-manager` (+4 more routes) | `apps/assurance/peer-review/Dashboard.jsx`, `apps/assurance/peer-review/ReviewRegister.jsx` +3 | bespoke | no | 12 / 1 | 1 | 0 | 119 | 0.3 | - | 4F |
| Quality Assurance Plan | `/dashboard/apps/assurance/qa-plan/*` | `apps/assurance/qa-plan/QAPlanPageShell.jsx` | bespoke | no | 13 / 1 | 1 | 0 | 231 | 0.3 | - | 4F |
| Regulatory Compliance | `/dashboard/apps/assurance/regulatory-compliance/*` | `apps/assurance/regulatory-compliance/RegulatoryCompliancePageShell.jsx` | bespoke | no | 11 / 8 | 12 | 0 | 217 | 0.35 | - | 4E |
| Risk Register | `/dashboard/apps/assurance/risk-register` (+3 more routes) | `apps/RiskRegister.jsx`, `apps/risk-register/NewRiskPage.jsx` +2 | bespoke | no | 26 / 15 | 471 | 45 | 20 | 2.24 | lib/riskScoring.js(3) | 4E |

#### Dashboard platform pages (16)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Upgrade / quote builder | `/dashboard/upgrade` | `pages/QuoteBuilder.jsx` | bespoke | no | 1 / 1 | 191 | 32 | 0 | 1.11 | - | 1E |
| Module access | `/dashboard/modules` | `pages/ModuleAccess.jsx` | bespoke | no | 1 / 1 | 35 | 9 | 0 | 0.45 | - | 1E |
| Seat management | `/dashboard/seats` | `pages/SeatManagement.jsx` | bespoke | no | 1 / 1 | 35 | 7 | 0 | 0.45 | - | 1E |
| Employees | `/dashboard/employees` | `pages/EmployeeManagement.jsx` | bespoke | no | 2 / 2 | 54 | 10 | 1 | 0.53 | - | 1E |
| Access requests | `/dashboard/access-requests` | `pages/admin/AccessRequests.jsx` | bespoke | no | 2 / 2 | 40 | 18 | 0 | 0.49 | - | 1E |
| Data export | `/dashboard/data-export` | `pages/DataExport.jsx` | bespoke | no | 5 / 3 | 104 | 16 | 0 | 0.74 | portability/PackageImportDialog(2), portability/SigningSummary(3) | 3F |
| Audit logs | `/dashboard/audit-logs` | `pages/admin/AuditLogs.jsx` | bespoke | no | 1 / 1 | 43 | 3 | 0 | 0.47 | - | 3F |
| Teams | `/dashboard/teams` | `pages/admin/TeamManagement.jsx` | bespoke | no | 2 / 1 | 35 | 10 | 0 | 0.46 | - | 3F |
| Bulk import employees | `/dashboard/bulk-import` | `pages/admin/BulkImportEmployees.jsx` | bespoke | no | 1 / 1 | 14 | 12 | 0 | 0.38 | - | 3F |
| App analytics | `/dashboard/analytics` | `pages/admin/AppAnalyticsDashboard.jsx` | bespoke | no | 1 / 1 | 27 | 2 | 0 | 0.41 | - | 3F |
| Subscriptions | `/dashboard/subscriptions` | `pages/SubscriptionManagement.jsx` | bespoke | no | 2 / 2 | 35 | 15 | 0 | 0.47 | - | 1E |
| Renew subscription | `/dashboard/subscriptions/renew/:moduleId` | `pages/RenewSubscription.jsx` | bespoke | no | 1 / 1 | 20 | 4 | 0 | 0.39 | - | 1E |
| Subscription usage analytics | `/dashboard/subscriptions/analytics` | `pages/SubscriptionUsageAnalytics.jsx` | bespoke | no | 1 / 1 | 13 | 4 | 0 | 0.36 | - | 1E |
| Subscription history | `/dashboard/subscriptions/history` | `pages/SubscriptionHistory.jsx` | bespoke | no | 1 / 1 | 20 | 1 | 0 | 0.38 | - | 1E |
| Quote dashboard | `/dashboard/quote/:quoteId` | `pages/QuoteDashboard.jsx` | bespoke | no | 1 / 1 | 101 | 39 | 0 | 0.77 | - | 3F |
| Get quote | `/dashboard/get-quote` | `pages/GetQuote.jsx` | bespoke | no | 1 / 1 | 114 | 9 | 0 | 0.76 | - | 3F |

#### Signed-in pages outside /dashboard (13)

| App | Route | Entry | Shell | Migrated | Own files / UI files | Legacy | Status hues | Token classes | Effort (VRR) | Shared pulls still legacy | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Super admin console | `/super-admin` | `pages/SuperAdminConsole.jsx` | bespoke | no | 5 / 4 | 115 | 32 | 0 | 0.81 | - | 6G |
| Admin: create user | `/admin-create-user` | `pages/AdminCreateUser.jsx` | bespoke | no | 1 / 1 | 34 | 6 | 0 | 0.45 | - | 6G |
| Admin: organizations | `/admin/organizations` | `pages/admin/AdminOrganizations.jsx` | bespoke | no | 1 / 1 | 55 | 21 | 0 | 0.56 | - | 6F |
| Admin: organization detail | `/admin/organizations/:orgId` | `pages/admin/OrgDetail.jsx` | bespoke | no | 14 / 13 | 331 | 65 | 0 | 1.73 | UpgradeSuiteButton(2) | 6F |
| Admin: organization edit | `/admin/organizations/:orgId/edit` | `pages/admin/OrgEdit.jsx` | bespoke | no | 1 / 1 | 44 | 1 | 0 | 0.47 | - | 6F |
| Admin: send quote | `/admin/organizations/:orgId/send-quote` | `pages/admin/OrgSendQuote.jsx` | bespoke | no | 1 / 1 | 56 | 2 | 0 | 0.52 | - | 6F |
| Admin: system health | `/admin/system-health` | `pages/admin/SystemHealth.jsx` | bespoke | no | 1 / 1 | 31 | 11 | 0 | 0.44 | - | 6G |
| Admin centre | `/admin/center` | `pages/admin/AdminCenter.jsx` | bespoke | no | 6 / 4 | 139 | 32 | 0 | 0.91 | pages/admin/AdminSeedApps(2) | 6G |
| Admin: seed apps | `/admin/seed-apps` | `pages/admin/AdminSeedApps.jsx` | bespoke | no | 0 / 0 | 0 | 0 | 0 | 0.3 | pages/admin/AdminSeedApps(2) | 6G |
| Admin: master apps viewer | `/admin/master-apps-viewer` | `pages/admin/MasterAppsViewer.jsx` | bespoke | no | 3 / 1 | 53 | 9 | 0 | 0.53 | - | 6G |
| Admin: promo codes | `/admin/promo-codes` | `pages/admin/PromoCodes.jsx` | bespoke | no | 1 / 1 | 50 | 0 | 0 | 0.5 | - | 6F |
| Mobile shell pages (5) | `/mobile/*` | `pages/mobile/MobileDashboard.jsx`, `pages/mobile/MobileProjectList.jsx` +3 | bespoke | no | 6 / 5 | 76 | 21 | 0 | 0.64 | ui/avatar(3) | 6G |
| Profile | `/profile` | `pages/Profile.jsx` | bespoke | no | 1 / 1 | 46 | 0 | 0 | 0.48 | - | 6G |

#### Public and auth pages (20, outside the rollout; see section 5.4)

| Page | Route | Entry | Legacy | Status hues |
|---|---|---|---|---|
| Home | `/` | `pages/Home.jsx` | 40 | 18 |
| Login | `/login` | `pages/Login.jsx` | 21 | 9 |
| Signup | `/signup` | `pages/Signup.jsx` | 83 | 41 |
| ConfirmationPage | `/auth/confirm` | `pages/auth/ConfirmationPage.jsx` | 16 | 5 |
| ForgotPassword | `/forgot-password` | `pages/ForgotPassword.jsx` | 15 | 2 |
| SetPassword | `/set-password` | `pages/SetPassword.jsx` | 67 | 9 |
| AcceptInvite | `/auth/accept-invite` | `pages/auth/AcceptInvite.jsx` | 20 | 3 |
| PaymentVerification | `/payment/verify` | `pages/PaymentVerification.jsx` | 26 | 15 |
| Solutions | `/solutions` | `pages/Solutions.jsx` | 18 | 18 |
| Resources | `/resources` | `pages/Resources.jsx` | 13 | 2 |
| AboutUs | `/about-us` | `pages/company/AboutUs.jsx` | 15 | 3 |
| Careers | `/careers` | `pages/company/Careers.jsx` | 66 | 6 |
| TermsOfService | `/legal/terms-of-service` | `pages/legal/TermsOfService.jsx` | 22 | 0 |
| PrivacyPolicy | `/legal/privacy-policy` | `pages/legal/PrivacyPolicy.jsx` | 21 | 0 |
| DataRetention | `/legal/data-retention` | `pages/legal/DataRetention.jsx` | 22 | 0 |
| DataProcessingAgreement | `/legal/dpa` | `pages/legal/DataProcessingAgreement.jsx` | 26 | 0 |
| VerifyDeletion | `/legal/verify-deletion` | `pages/legal/VerifyDeletion.jsx` | 28 | 4 |
| VerifyExport | `/legal/verify-export` | `pages/legal/VerifyExport.jsx` | 22 | 5 |
| Support | `/legal/support` | `pages/legal/Support.jsx` | 32 | 0 |
| Documentation | `/legal/documentation` | `pages/legal/Documentation.jsx` | 16 | 0 |

#### Dev-only harnesses (59 routes, `import.meta.env.DEV` only)

| Route | Entry | Wraps ThemedApp itself |
|---|---|---|
| `/dev/scal-studio` | `(the app page itself)` | no |
| `/dev/seismolord-selftest` | `pages/apps/Seismolord/SeismolordSelfTest.jsx` | no |
| `/dev/seismolord-sliceview` | `pages/apps/Seismolord/SeismolordSliceViewHarness.jsx` | yes |
| `/dev/seismolord-cubeview` | `pages/apps/Seismolord/SeismolordCubeViewHarness.jsx` | yes |
| `/dev/seismolord-largesurvey` | `pages/apps/Seismolord/SeismolordLargeSurveyHarness.jsx` | yes |
| `/dev/seismolord-wells` | `pages/apps/Seismolord/SeismolordWellsHarness.jsx` | yes |
| `/dev/seismolord-welltie` | `pages/apps/Seismolord/SeismolordWellTieHarness.jsx` | yes |
| `/dev/seismolord-synthetics` | `pages/apps/Seismolord/SeismolordSyntheticsHarness.jsx` | yes |
| `/dev/seismolord-workspace` | `pages/apps/Seismolord/SeismolordWorkspaceHarness.jsx` | yes |
| `/dev/well-data-manager` | `pages/apps/WellDataManager/WellDataManagerHarness.jsx` | no |
| `/dev/petrophysics-studio` | `pages/apps/PetrophysicsStudio/PetrophysicsStudioHarness.jsx` | no |
| `/dev/well-correlation` | `pages/apps/WellCorrelation/WellCorrelationHarness.jsx` | no |
| `/dev/stratigraphy-studio` | `pages/apps/StratigraphyStudio/StratigraphyStudioHarness.jsx` | no |
| `/dev/wellsite-studio` | `pages/apps/WellsiteStudio/WellsiteStudioHarness.jsx` | no |
| `/dev/mapping-surface-studio` | `pages/apps/MappingSurfaceStudio/MappingSurfaceStudioHarness.jsx` | no |
| `/dev/prospect-risking` | `pages/apps/ReservoirCalcPro/ProspectRiskingHarness.jsx` | no |
| `/dev/risked-reserves` | `pages/apps/riskedreserves/RiskedReservesHarness.jsx` | no |
| `/dev/reservoircalc-pro` | `pages/apps/ReservoirCalcPro/ReservoirCalcProHarness.jsx` | no |
| `/dev/rock-physics-studio` | `pages/apps/RockPhysicsStudio/RockPhysicsStudioHarness.jsx` | no |
| `/dev/earth-modeling` | `pages/apps/EarthModeling/EarthModelingHarness.jsx` | no |
| `/dev/pore-pressure-studio` | `pages/apps/PorePressureStudio/PorePressureStudioHarness.jsx` | no |
| `/dev/basinflow-genesis` | `pages/apps/BasinFlowGenesis/BasinFlowGenesisHarness.jsx` | no |
| `/dev/well-design` | `pages/apps/well-planning/WellDesignHarness.jsx` | no |
| `/dev/torque-drag` | `pages/apps/TorqueDragStudio/TorqueDragHarness.jsx` | no |
| `/dev/hydraulics` | `pages/apps/HydraulicsStudio/HydraulicsHarness.jsx` | no |
| `/dev/well-control` | `pages/apps/WellControlStudio/WellControlHarness.jsx` | no |
| `/dev/cementing` | `pages/apps/CementingStudio/CementingHarness.jsx` | no |
| `/dev/geomechanics` | `pages/apps/GeomechanicsStudio/GeomechanicsHarness.jsx` | no |
| `/dev/casing-tubing` | `pages/apps/CasingTubingDesignPro/CasingTubingHarness.jsx` | no |
| `/dev/completion-design` | `pages/apps/CompletionDesignStudio/CompletionDesignHarness.jsx` | no |
| `/dev/perforation-sand-control` | `pages/apps/PerforationSandControl/PerforationSandControlHarness.jsx` | no |
| `/dev/stimulation` | `pages/apps/StimulationDesigner/StimulationDesignerHarness.jsx` | no |
| `/dev/well-integrity` | `pages/apps/WellIntegrityPA/WellIntegrityPAHarness.jsx` | no |
| `/dev/well-cost` | `pages/apps/WellCostTime/WellCostTimeHarness.jsx` | no |
| `/dev/dca` | `dev/DcaHarness.jsx` | no |
| `/dev/forecast-scenario-hub` | `dev/ForecastScenarioHubHarness.jsx` | no |
| `/dev/fiscal-regime-designer` | `(the app page itself)` | no |
| `/dev/fluid-systems-studio` | `(the app page itself)` | no |
| `/dev/epe/*` | `pages/apps/epe/harness/EpeHarness.jsx` | yes |
| `/dev/decision-studio` | `components/decisionstudio/harness/DecisionStudioHarness.jsx` | no |
| `/dev/well-test-analysis-studio` | `dev/WellTestHarness.jsx` | no |
| `/dev/reservoir-simulation-studio` | `dev/SimStudioHarness.jsx` | no |
| `/dev/fdp-accelerator` | `dev/FdpHarness.jsx` | no |
| `/dev/voi-analyzer` | `dev/VoiHarness.jsx` | no |
| `/dev/capital-portfolio-studio` | `dev/CapitalPortfolioHarness.jsx` | no |
| `/dev/flare-gas-to-value` | `dev/FlareHarness.jsx` | no |
| `/dev/production/:app` | `dev/ProductionHarness.jsx` | no |
| `/dev/facilities/:app` | `dev/FacilitiesHarness.jsx` | no |
| `/dev/studio/:app` | `dev/StudiosHarness.jsx` | yes |
| `/dev/assurance/:app` | `dev/AssuranceHarness.jsx` | no |
| `/dev/hubs/:page` | `dev/HubsHarness.jsx` | no |
| `/dev/modular-refinery-feasibility` | `dev/ModularRefineryHarness.jsx` | no |
| `/dev/carbon-footprint-abatement` | `dev/CarbonHarness.jsx` | no |
| `/dev/electrofacies-studio` | `dev/ElectrofaciesHarness.jsx` | no |
| `/dev/data-quality-studio` | `dev/DataQualityHarness.jsx` | no |
| `/dev/design-system` | `dev/DesignSystemHarness.jsx` | yes |
| `/dev/nodal-analysis-studio` | `dev/NodalHarness.jsx` | no |
| `/dev/material-balance-studio` | `pages/apps/reservoir-balance/harness/MbalHarness.jsx` | no |
| `/dev/material-balance-studio/cases/:caseId` | `(the app page itself)` | no |

Notes on the inventory:

- There is no dashboard-level notifications page, projects list or help
  centre in the Suite: `my-projects` redirects to `/dashboard`, help is per
  app (`.../help` routes on `HelpGuideLayout`), notifications and projects
  exist only in the `/mobile` shell. The HSE route (`/dashboard/hse`) is an
  external redirect.
- Contour Map Digitizer, BasinFlow Genesis and the reservoir apps without
  `ProtectedAppRoute` (Fluid Systems, Waterflood, SCAL, Well Test, RF, RRV,
  EOR, Forecast Scenario Hub, Material Balance, DCA, VRR) are routed
  without an entitlement gate. That is out of scope here; it only means
  their pages have no `AccessDenied` state to check.
- Residual legacy counts on the migrated pilots (Seismolord 51, hubs 14,
  EPE 8, VRR 5) are dark-canvas interiors, chart-card headings in
  `CHART_COLORS` and similar deliberate cases; the cleanup wave (7B)
  re-checks them.
- The admin and super-admin pages sit outside `DashboardLayout` (their own
  `SuperAdminRoute` routes), so they are listed with the signed-in pages.

## 3. Wave plan

### 3.1 Rules for parallel work

- **One batch, one agent session, one branch, one PR.** A batch is 3 to 4
  VRR. Batches in the same wave run in parallel; a wave starts when the
  prerequisites it names have merged (earlier waves need not have finished,
  the order is a priority order).
- **A batch touches only its own apps' files.** Own files are those in the
  inventory's "own files" set for the batch's apps, plus their tests, their
  harness files and their `docs/scope/<App>-STATUS.md`.
- **Shared files.** A file pulled by several apps is either (a) Wave 0
  (adapted once with `useThemeClass`, legacy DOM pinned, before any
  consumer migrates) or (b) batch-local: every app that pulls it is in the
  same batch, so the batch moves it straight to roles with no legacy
  branch. Batch-local shared files are named in the batch table.
- **No shared registry edits.** Wave 0A turns the cold-load list into one
  file per batch, so no two batches edit the same file. The status tables
  (`DesignSystem-PLAN.md`, section 6 below) are updated by the coordinator
  after each merge; batch PRs leave them alone.
- **No App.jsx edits.** Each app wraps itself (section 4). App.jsx changes
  only in Wave 7.

### 3.2 Wave 0: prerequisites

Three sessions, all in parallel (they touch disjoint files). Wave 1 needs
0A; batches 1C, 3F, 4A and 4B need 0C; batches 2B, 2C, 2D, 3B to 3E need 0B.

| session | files | consumers | legacy | what |
|---|---|---|---|---|
| **0A plumbing and primitives** | `src/design/coldLoad.jsx` | every batch | - | move `THEMED_APP_PREFIXES` into one file per batch (`src/design/rollout/w1a.js` ... `w6g.js`, each `export default []`), imported statically by `coldLoad.jsx`; each batch then edits only its own file |
| | new `src/design/testing/themeAssertions.js` | every batch | - | shared test helpers lifted from the VRR and EPE theme tests: the console-colour regex, "opens light, toggles dark and back, stores per user", "no legacy class under the scope root except inside `data-canvas`", and "`isThemedPath(route)` is true" |
| | `src/design/__tests__/optInScope.test.jsx`, `src/components/hubs/__tests__/hubScope.test.jsx` | - | - | the non-pilot proof mounts Waterflood Design Studio, which migrates in batch 1D; replace it with a test-only legacy fixture component so no batch has to move the proof again |
| | `src/dev/StudiosHarness.jsx`, `ProductionHarness.jsx`, `FacilitiesHarness.jsx`, `AssuranceHarness.jsx` | 31 apps | 16 | multi-app harnesses: drop the `THEMED` set (VRR wraps itself now) and the `bg-slate-950` wrapper so a page that wraps itself shows correctly; after this no batch edits these files |
| | `src/components/ui/avatar.jsx` | 3 (ReservoirCalc Pro, PM Pro, mobile) | 2 | adapt with `useThemeClass`, pin in `uiLegacyDom` |
| | `src/components/ui/radio-group.jsx` | 3 (ReservoirCalc Pro, BasinFlow, Report Autopilot) | 3 | adapt, pin |
| | `src/components/fullprecision/FullPrecision.jsx` | 23 (economics, facilities, midstream, production) | 2 | `tone` picks `text-slate-700`/`300`; add a themed branch |
| **0B drilling and production kits** | `src/pages/apps/TorqueDragStudio/components/WellboreDetails.jsx`, `Explorer.jsx`, `GeometryNotice.jsx` | 11 drilling apps (all ten workstation studios and Casing & Tubing) | 61 | adapt with `useThemeClass`, pin legacy DOM like `sharedShellsOptIn.test.jsx` |
| | `src/components/production/WellModelPanel.jsx`, `WellModelSpinePanel.jsx` | 9 production apps | 40 | same |
| **0C geoscience wells kit and portability** | `src/components/wells/LayoutPanel.jsx`, `TopNamePopover.jsx`, `DepthNavigator.jsx`, `section/CrossSection.jsx`, `CoreImagesPanel.jsx`, `IntervalsEditor.jsx` | Petrophysics, Well Correlation, Stratigraphy, Well Data Manager | 111 | adapt, pin (as the pilot 4 forms in `sharedFormsOptIn.test.jsx`) |
| | `src/components/portability/PackageImportDialog.jsx`, `PackageExportDialog.jsx`, `SigningSummary.jsx` | Data export page, Petrophysics, Well Data Manager | 105 | adapt, pin; custom portals get `usePortalThemeProps()` |

Everything else the apps pull is already scope-aware: the adapted ui
primitives (`DesignSystem.md` section 4), the Studio kit, `WorkspaceShell`, `ModuleHomeLink`,
`HelpGuideLayout`, the CRS, well-import and culture forms, `AccessDenied`,
`ComingSoon`, and `resizable`, `collapsible`, `table`, `numeric-table`
(no colour classes of their own).

### 3.3 Waves 1 to 6

Effort in VRR-equivalents; legacy is the own-file count. "Needs" lists the
Wave 0 session that must have merged; "batch-local" lists shared files the
batch owns outright.

| batch | apps | effort | legacy | needs | batch-local shared files |
|---|---|---|---|---|---|
| **Wave 1** | *reservoir and geoscience flagships with saved work, and the pages every organisation admin opens* | | | | |
| 1A | Material Balance Studio, Well Test Analysis Studio | 3.4 | 673 | 0A | - |
| 1B | ReservoirCalc Pro (the reserve pilot) | 4.8 | 1,030 | 0A | - |
| 1C | Petrophysics Studio | 3.5 | 786 | 0A, 0C | - |
| 1D | Fluid Systems Studio, Waterflood Design Studio, SCAL Studio | 3.4 | 579 | 0A | `waterflooddesign/primitives.jsx` |
| 1E | Upgrade (quote builder), Module access, Seats, Employees, Access requests, Subscriptions, Renew, Subscription history, Subscription usage analytics | 4.6 | 443 | 0A | - (single-file pages, so the real effort is below the formula) |
| **Wave 2** | *reservoir remainder, production, economics decision tools* | | | | |
| 2A | Reservoir Simulation Studio, Well Spacing Optimizer, Forecast Scenario Hub, Recovery Factor Estimator | 3.4 | 535 | 0A | - |
| 2B | Production Surveillance, Production Allocation, Production Network | 3.4 | 579 | 0A, 0B | `production/FieldPicker.jsx` |
| 2C | ESP Design, Gas Lift Design, Rod Pump Design, Artificial Lift Advisor | 3.8 | 589 | 0A, 0B | - |
| 2D | Flow Assurance, Choke & Wellhead Performance, Gas Well Performance, Well Intervention Planner, Nodal Analysis | 4.1 | 591 | 0A, 0B | - |
| 2E | NPV Scenario Builder, Fiscal Regime Designer, Capital Portfolio Studio | 3.6 | 619 | 0A | - |
| 2F | AFE Cost Control Manager, Probabilistic Breakeven Analyzer, Decision Studio, Value of Information Analyzer, Decision Tree Builder | 3.9 | 537 | 0A | `decisiontree/TreeDiagram.jsx` |
| **Wave 3** | *drilling and organisation admin* | | | | |
| 3A | Well Design Studio | 4.3 | 961 | 0A | - |
| 3B | Casing & Tubing Design Studio | 4.1 | 908 | 0A, 0B | - |
| 3C | Completion Design, Well Integrity & P&A, Well Cost & Time | 3.3 | 567 | 0A, 0B | - |
| 3D | Drilling Fluids & Hydraulics, Perforation & Sand Control, Well Control, Cementing | 3.6 | 551 | 0A, 0B | - |
| 3E | Torque & Drag, Stimulation Designer, Geomechanics & Wellbore Stability, EOR Screening, Risked Reserves Valuation | 3.4 | 449 | 0A, 0B | - |
| 3F | Data export, Audit logs, Teams, Bulk import, App analytics, Quote dashboard, Get quote | 4.0 | 438 | 0A, 0C | - |
| **Wave 4** | *geoscience, assurance, process safety* | | | | |
| 4A | Wellsite Studio, Well Data Manager, Well Correlation | 3.7 | 674 | 0A, 0C | `wells/RowGridEditor.jsx` |
| 4B | Stratigraphy Studio, Mapping & Surface Studio, Earth Modeling, Pore Pressure Studio | 3.8 | 614 | 0A, 0C | `maps/MapViewport.jsx` |
| 4C | BasinFlow Genesis | 3.4 | 697 | 0A | - |
| 4D | Rock Physics Studio, Contour Map Digitizer, Geoscience Hub (legacy app), Technical Report Autopilot | 2.5 | 306 | 0A | - |
| 4E | Risk Register, Regulatory Compliance, Lessons Learned, ISO Compliance, Audit & Findings Manager | 3.5 | 483 | 0A | `lib/riskScoring.js` (the hubs, its other consumer, are already themed), `assurance/shared/ConfirmDialog.jsx` |
| 4F | Document Control, Peer Review Manager, Management of Change, Quality Assurance Plan, LOPA & SIL, Consequence Modelling, QRA | 3.0 | 198 | 0A | `processsafety/lopa/shared.jsx`, `processsafety/consequence/fields.jsx` |
| **Wave 5** | *facilities, midstream and downstream, data and AI* | | | | |
| 5A | Facility Layout Mapper, Pipeline & Line Sizing, Corrosion & Integrity, Control Valve & Choke Sizing, Heat Exchanger & Cooling | 3.5 | 444 | 0A | - |
| 5B | Storage Tank & Venting, Compressor Station, Separator & Slug Catcher, Pump Station, Relief & Flare, Produced Water Treatment, Flow Metering, Gas Processing | 4.3 | 423 | 0A | - (eight small Studio-kit apps of one pattern) |
| 5C | Refinery Planning & Scheduling, Marine Logistics, Energy & Utilities Efficiency, Fuel Pricing & Supply Chain | 3.4 | 498 | 0A | - |
| 5D | LPG & CNG Rollout, Crude Assay & Blending, Materials & Spares, Terminal & Depot | 2.9 | 389 | 0A | - |
| 5E | Carbon Footprint & Abatement, Product Blending Optimizer, Flare Gas to Value, Modular Refinery Feasibility | 2.8 | 346 | 0A | - |
| 5F | Data Quality Studio, ML Workbench, Electrofacies Studio, Production Forecasting ML Workbench, AI Evaluation Studio | 2.8 | 293 | 0A | `dataai/quality/shared.jsx` |
| **Wave 6** | *the two largest bespoke trees, internal pages* | | | | |
| 6A, 6B | FDP Accelerator (97 own files), two sessions in sequence split by subtree, one PR each; the app wraps itself in 6A | 5.3 | 1,128 | 0A | - |
| 6C, 6D, 6E | Project Management Pro (81 own files), three sessions in sequence split by subtree | 8.9 | 1,943 | 0A | - |
| 6F | Admin: organizations, organization detail, edit, send quote, promo codes | 3.8 | 536 | 0A | `UpgradeSuiteButton.jsx` (its gold hex is the brand button; move it to `bg-pl-accent text-pl-accent-fg`) |
| 6G | Super admin console, Admin centre, Seed apps, Master apps viewer, System health, Create user, Profile, `/mobile` shell | 4.6 | 494 | 0A (`avatar`) | `pages/admin/AdminSeedApps.jsx` |

Ordering. Wave 1 carries the apps with the most stored work after the
pilots (Material Balance, ReservoirCalc Pro, Well Test, Petrophysics,
Waterflood) and the account pages every organisation admin opens. Wave 2
finishes Reservoir (so the whole module is light) and takes Production and
the economics tools most often opened beside EPE. Drilling follows with its
flagship Well Design Studio, then Geoscience (Seismolord's neighbours),
Assurance and Process Safety. The youngest modules (Facilities, Midstream
and Downstream, Data and AI) come in Wave 5, and the two largest bespoke
trees and the internal pages last. For a split app (FDP, PM Pro) a partly
migrated page is acceptable between the sessions only on a branch: merge
each session's PR only when the app reads correctly in both themes, or
keep the wrap in the last session.

### 3.4 Wave 7: end state (section 5)

| session | what | needs |
|---|---|---|
| 7A | move the scope to `DashboardLayout`, remove per-app and hub wraps, cold-load simplification, the sidebar | all of waves 1 to 6 merged |
| 7B | delete legacy branches, fixtures and the dark `index.css` defaults for the dashboard | 7A |
| 7C (optional) | auth and legal pages, then one scope at the app root | owner decision, section 5.4 |

## 4. Per-app recipe

The checklist is `DesignSystem.md` section 6; the concrete steps and traps
are in `DesignSystem-example-EPE.md`. In short, per app:

1. **Work in a worktree.** Never in the primary checkout (it is the staging
   mount and HMR is live). Sparse checkout without `node_modules/`; run jest
   and vite from a mirror with `node_modules` symlinked, and always give
   vite a private `cacheDir` (EPE trap 1).
2. **Wrap inside the app's own page component**, as DCA and VRR do:
   `export default function App() { return <ThemedApp data-testid="<app>-theme-scope">...</ThemedApp>; }`
   around the page's providers. Do not touch App.jsx, so no two batches
   collide there and the app's dev harness gets the scope too. An app with
   several route components (help guide, sub-pages, register pages) wraps
   each entry, or puts one `ThemedApp` in its own shell component (for
   example the assurance `*PageShell` components, which render nested
   routes). An app with a separate help route wraps the help guide too
   (Seismolord does).
3. **Register the path** in the batch's own `src/design/rollout/<batch>.js`
   so the cold-load loaders paint the last theme.
4. **Migrate the app's own classes to pl-\* roles**: codemod the obvious
   ones, then a manual pass (EPE section 3). Remove overrides on adapted
   primitives (`Input`, `Card`, `DialogContent` ...), because tailwind-merge
   lets them win. Status only through status roles; decorative colour goes.
   Header: `StudioHeader` themes itself; otherwise `AppHeader`. The toggle
   must be visible.
5. **Charts stay white.** Keep `ChartFrame`/`ChartLogo` + `chartTheme`; wrap
   titled charts in `ChartPanel`, or give a hand-made white wrapper
   `data-canvas="chart"`. Headings inside a white chart card keep
   `CHART_COLORS`.
6. **Dark canvases** (seismic sections, 3D, maps, well-log images) sit in
   `data-canvas="dark"` and keep their pixels; check their overlays and
   legends in both themes.
7. **Theme test per app** with the Wave 0A helpers: opens light, the toggle
   switches to dark and back and the choice is stored per user, no legacy
   class under the scope root outside `data-canvas` regions (with a planted
   negative control), and `isThemedPath(<route>)` is true. The app's
   existing tests pass unchanged.
8. **An app's migration must not change any other app.** The PR diff is
   limited to the app's own files (inventory), its tests, harness, STATUS
   doc and its rollout file. A shared file changes only if it is
   batch-local (every consumer is in the batch) or through
   `useThemeClass` with its legacy DOM pinned. Before opening the PR, grep
   the diff for files outside that list.
9. **Copy pass** on every string touched (no em dashes, none of the banned
   contrast phrasings).
10. **Staging walk** in light and dark at 1440 and 390 wide (no sideways
    page scroll), then update `docs/scope/<App>-STATUS.md`. The
    coordinator updates the tracker tables after merge.

## 5. End state and cleanup

### 5.1 One scope for the dashboard (7A)

Once every route under `/dashboard` is migrated:

- `DashboardLayout` renders one `ThemedApp` around its content column
  (the `<Outlet />`), so every dashboard page, including the entitlement
  `AccessDenied` and `ComingSoon` states that `ProtectedAppRoute` renders
  outside the per-app wraps today, is themed.
- Remove the per-app `ThemedApp` wraps (about 110 page components), the EPE
  layout route in App.jsx and the `ThemedApp` in `HubScope` (it keeps the
  `Suspense`). Nested scopes would work, but one provider is simpler and
  avoids double storage listeners.
- Cold load: `isThemedPath` becomes "any `/dashboard` path"; the per-batch
  rollout files and `THEMED_HUBS` go.
- The loading screen in `DashboardLayout` (still `bg-slate-900` with a lime
  spinner) becomes the themed loader.
- **Sidebar.** Today it is a fixed `data-pl-theme="dark"` ink rail in both
  themes (lead decision 1b, pilot 1). Recommendation: keep the ink rail as
  the brand frame; it reads well beside both themes. The alternative (rail
  follows the user's theme) is one attribute change in `DashboardSidebar`
  and the mobile sheet. Owner to confirm at 7A.

**As built (7A, `feat/ds-w7a`).** `DashboardLayout` renders
`DashboardScope` (`src/design/DashboardScope.jsx`, one `ThemedApp`) around
the org closure banner and the `<Outlet />`. 165 per-app wraps became
plain root elements (their `data-testid` kept), and the EPE layout route
and the `HubScope` wrap went (HubScope keeps its `Suspense`). The dev
harness routes in App.jsx get one scope of their own, since they render
app pages outside DashboardLayout. `AccountScope` is a plain element
inside a scope and opens its own on `/profile` and the super-admin pages.
`ProtectedAppRoute`'s loading, licence-banner and access-restricted
states moved to roles. `HelpGuideShell` shows the `ThemeToggle`.
`isThemedPath` is any `/dashboard` path plus `THEMED_PAGE_PREFIXES` and
`PUBLIC_PAGE_PREFIXES` in `coldLoad.jsx`; `src/design/rollout/` and
`rolloutFiles.test.js` are gone. The sidebar keeps the ink rail (lead
decision). `dashboardScope.test.jsx` fails if a page renders its own
`ThemedApp`. Theme tests mount `/dashboard` pages through
`installDashboardScope`. Left for 7B: the outer `DashboardLayout` frame
(`bg-slate-900 text-white`, outside the scope and behind the rail), the
`LegacyAppFixture` (now at a path outside `/dashboard`) and the other
legacy fixtures in 5.2.

### 5.2 Delete the legacy branches (7B)

Only when no page renders the shared components outside a scope (see 5.4
for the public pages that still use `Button`, `Input`, `Label`, `Card`):

- ui kit: the `LEGACY` tables and `ds ? THEMED : LEGACY` branches in the
  adapted primitives; `Badge`'s stock light classes with dead `dark:`
  variants.
- Studio kit: the legacy strings in every `tc(legacy, themed)` call in
  `src/components/studio/*`; `useStudioTheme` returns roles only.
- Shared shells and forms: `WorkspaceShell`, `ModuleHomeLink`,
  `HelpGuideLayout`, CRS, wells, culture and portability forms, and the
  Wave 0 kits.
- `useThemeClass` and `themeClassPicker`: with no legacy branch left they
  are removed, and callers use the themed string directly.
- Fixtures and proofs: `uiLegacyDom.test.jsx` and `uiLegacyDom.json`,
  `studioKitLegacyDom.test.jsx` and its fixture, `sharedShellsOptIn` and
  `sharedFormsOptIn` snapshots, the Wave 0 pins, the test-only legacy
  fixture in `optInScope` and `hubScope`, and the `tokens.test.js`
  assertion that `index.css` still holds the legacy dark values.
- Re-check the residual legacy classes on the pilots (section 2 notes).

### 5.3 Retire the dark defaults for the dashboard (7B)

- `src/index.css` `:root, .dark` "Dark Premium" variables, the DM Sans body
  font and the dark `bg-background` body: inside the dashboard the scope
  supplies every variable, so these only serve pages outside a scope.
  Retire them for the dashboard (the App.jsx root div's
  `bg-[hsl(var(--background))]` and the legacy `PageLoader` included),
  and keep them only as long as 5.4 leaves legacy pages.
- `src/App.css`: the lime scrollbar, `.text-gradient` and lime focus
  outline go (the scope's focus ring replaces them).
- `panel-elevation`, `btn-primary` and the `data-grid-*` component classes
  in `index.css` already use variables; keep them or fold them into roles.

### 5.4 Pages outside the dashboard (decision)

Twenty public and auth pages (login, signup, set and reset password,
invite, confirmation, payment verification, legal, about, careers,
solutions, resources) keep the legacy dark look after Wave 6, and the
homepage keeps its own paper look (`Home.css`, scoped `.suite-home`).
Because login, signup, set password and support use the adapted `Button`,
`Input`, `Label`, `Card`, the ui kit's legacy branch in 5.2 can only be
deleted once these pages are themed too. Options for the owner:

- (a) Session 7C: migrate them (about 3 VRR, all single files), then place
  one `ThemedApp` at the app root and delete every legacy branch.
  Recommended: one look from sign-in to app, and the simplest code.
- (b) Keep them legacy: 7B then deletes the legacy branches of the Studio
  kit, shells and domain kits only, and the ui kit keeps its two branches.

## 6. Totals and tracker

| wave | batches | apps and pages | effort (VRR) | agent sessions |
|---|---|---|---|---|
| 0 | 0A, 0B, 0C | rollout plumbing and 3 shared components (0A), 5 kit files (0B), 9 kit files (0C) | about 4 | 3 |
| 1 | 1A to 1E | 7 apps, 9 platform pages | 19.7 | 5 |
| 2 | 2A to 2F | 24 apps | 22.2 | 6 |
| 3 | 3A to 3F | 14 apps, 7 platform pages | 22.7 | 6 |
| 4 | 4A to 4F | 24 apps | 19.8 | 6 |
| 5 | 5A to 5F | 30 apps | 19.5 | 6 |
| 6 | 6A to 6G | 2 apps, 13 signed-in pages | 22.5 | 7 |
| 7 | 7A, 7B (7C) | scope move and cleanup | - | 2 (+1) |
| **total** | | **101 apps, 16 platform pages, 13 signed-in pages** | **126** | **41 (+1)** |

Waves 1 to 6 are 36 sessions for 126 VRR, an average of 3.5 per session.

Tracker (the coordinator fills it after each merge):

| batch | PR | merged | staging walk |
|---|---|---|---|
| 0A | | | |
| 0B | | | |
| 0C | | | |
| 1A to 1E | | | |
| 2A to 2F | | | |
| 3A to 3F | | | |
| 4A to 4F | | | |
| 5A to 5F | | | |
| 6A to 6G | | | |
| 7A, 7B | | | |
