# App Route Protection: STATUS

Owner-approved 2026-09-30. Closes the Suite-wide gap found by the Mapping upgrade
(MAP-U1-035): app routes in `src/App.jsx` that rendered a paid app without the
licence gate (`ProtectedAppRoute`), so any signed-in user could open them.

## How the gate decides

- `ProtectedAppRoute` (src/components/ProtectedAppRoute.jsx) sends a signed-out
  visitor to `/login`, lets a super admin through, and otherwise opens the app
  only when `useUserEntitlements().hasAccessToApp(id)` is true for at least one
  id in `appId` (a string or an array).
- `hasAccessToApp` checks `accessible_app_ids` from the `get-user-entitlements`
  edge function. That list carries the master_apps UUID and slug of every app
  the org holds: a direct app purchase, every app in a purchased module
  (`purchased_modules.module_uuid` matched to `master_apps.module_id`), or, for
  an internal (Lordsway staff) org, every master_apps row whose status is Active.
- Consequence: a slug with no master_apps row is never granted to anyone except
  a super admin. A slug whose row is Archived is never granted to internal orgs.
  So every protected route must carry at least one id that exists and is Active.
  The guard test enforces both.
- Every route under `/dashboard` already sits behind `ProtectedRoute` (signed in)
  and `OnboardingRoute`; `ProtectedAppRoute` adds the licence check.

## What changed

- 25 routes wrapped (all rendered a paid app with no licence check): Basin &
  Charge Modeling and its help page, and every Reservoir app route not already
  gated (Fluid Systems, VRR Monitor, Waterflood Design Studio, SCAL Studio,
  Well Test Analysis Studio, Recovery Factor Estimator, Risked Reserves and
  help, EOR Screening and help, Forecast Scenario Hub and help, DCA, and the
  eight Material Balance Studio aliases).
- 5 broken redirects corrected so they land on their gated successor:
  `apps/reservoir/waterflood-dashboard` pointed at `/apps/...` (no such route,
  it fell through to the homepage); the four archived intervention planner
  slugs pointed at `/dashboard/production/apps/...`, which the
  `production/*` catch-all turned into the Production hub.
- Guard test `src/__tests__/appRouteProtection.test.js` parses App.jsx and fails
  on any bare app route, any appId missing from the master_apps snapshot, any
  route with no Active appId, and any redirect that lands on an unprotected
  route or on no route. Run against the pre-change App.jsx it reports 36
  problems (25 bare routes, 6 redirects onto them, 5 broken redirects).
- Snapshot `src/data/masterAppSlugs.json`: slug to status for all 327 production
  master_apps rows (export 2026-09-30); its `_refresh` key says how to refresh it.

## Slug choices for the wrapped routes

| Route(s) | appId | Reasoning |
|---|---|---|
| geoscience/basinflow-genesis, /help | basinflow-genesis | Own Active row (Basin & Charge Modeling, Geoscience). |
| reservoir/fluid-systems-studio | fluid-systems-studio | Own Active row. |
| reservoir/voidage-replacement-monitor | voidage-replacement-monitor | Own Active row. |
| reservoir/waterflood-design-studio, reservoir/fractional-flow-calculator | fractional-flow-calculator | No `waterflood-design-studio` row. The Active row named "Waterflood Design Studio" carries the slug `fractional-flow-calculator` (the tile slug kept as the entitlement key). |
| reservoir/scal-studio | scal-studio | Own Active row. |
| reservoir/well-test-analysis-studio, reservoir/well-test-analyzer | well-test-analyzer | No `well-test-analysis-studio` row. The Active row named "Well Test Analysis Studio" carries the tile slug `well-test-analyzer` (App.jsx comment: "kept as the entitlement key"). |
| reservoir/recovery-factor-estimator | recovery-factor-estimator | Own Active row. |
| reservoir/risked-reserves-valuation, /help | risked-reserves-valuation | Own Active row. |
| reservoir/eor-screening, /help | eor-screening | Own Active row. |
| reservoir/forecast-scenario-hub, /help | forecast-scenario-hub | Own Active row. |
| reservoir/decline-curve-analysis | decline-curve-analysis | Own Active row. |
| reservoir/reservoir-balance, -pro, -surveillance, material-balance-studio (each with /cases/:caseId) | reservoir-balance | Only `reservoir-balance` is an Active row ("Material Balance Studio"). `material-balance-pro` is Archived; the other alias slugs have no row. |

The Contour Map Digitizer (PR #826) keeps `['contour-map-digitizer', 'mapping-surface-studio']`:
`contour-map-digitizer` has no master_apps row, so the Mapping licence is what opens it.

## Routes intentionally without ProtectedAppRoute

None under `/dashboard/apps/**`; the guard's allow list is empty.

Outside `/dashboard/apps/**` (not paid apps, listed for completeness):

| Route(s) | Why no licence gate |
|---|---|
| `/`, `/login`, `/signup`, `/auth/*`, `/forgot-password`, `/set-password`, `/payment/verify`, `/get-quote` | Marketing, auth and payment flows; must work before a licence exists. |
| `/solutions`, `/resources`, `/about-us`, `/careers`, `/nextgen`, `/legal/*` | Public marketing and legal pages. |
| `/super-admin`, `/admin/**`, `/admin-create-user` | SuperAdminRoute / super_admin role. |
| `/mobile/**`, `/profile` | Signed-in account pages (ProtectedRoute). |
| `/dashboard` index and the ten module hubs | Signed-in; AppRoute guards the hub, and each tile shows Locked without a seat. |
| `/dashboard/upgrade`, `modules`, `seats`, `employees`, `access-requests`, `subscriptions/**`, `quote/:quoteId`, `get-quote`, `data-export`, `audit-logs`, `teams`, `bulk-import`, `analytics` | Org, billing and admin pages (ProtectedRoute, several with a permission). The upgrade page is where the locked screen sends people. |
| `/dashboard/hse` | External redirect to hse.petrolord.com behind the HSE view permission; the HSE product licenses itself. |
| `/dev/**` | Wrapped in `import.meta.env.DEV`; absent from production builds (Vite strips the branch). |

## Full inventory of /dashboard/apps/** (after this PR)

| # | Route (/dashboard/…) | Component | appId(s) | master_apps status | Action |
|---|---|---|---|---|---|
| 1 | apps/geoscience/hub | Navigate to /dashboard/geoscience | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 2 | apps/geoscience/quickvol | ReservoirCalcPro | reservoircalc-pro | reservoircalc-pro: Active | already protected |
| 3 | apps/geoscience/reservoircalc-pro | ReservoirCalcPro | reservoircalc-pro | reservoircalc-pro: Active | already protected |
| 4 | apps/geoscience/well-correlation | WellCorrelation | well-correlation | well-correlation: Active | already protected |
| 5 | apps/geoscience/well-correlation/help | CorrelationHelpGuide | well-correlation | well-correlation: Active | already protected |
| 6 | apps/geoscience/stratigraphy-studio | StratigraphyStudio | stratigraphy-studio | stratigraphy-studio: Active | already protected |
| 7 | apps/geoscience/stratigraphy-studio/help | StratigraphyHelpGuide | stratigraphy-studio | stratigraphy-studio: Active | already protected |
| 8 | apps/geoscience/wellsite-studio | WellsiteStudio | wellsite-studio | wellsite-studio: Active | already protected |
| 9 | apps/geoscience/wellsite-studio/help | WellsiteHelpGuide | wellsite-studio | wellsite-studio: Active | already protected |
| 10 | apps/geoscience/mapping-surface-studio | MappingSurfaceStudio | mapping-surface-studio | mapping-surface-studio: Active | already protected |
| 11 | apps/geoscience/mapping-surface-studio/help | MappingHelpGuide | mapping-surface-studio | mapping-surface-studio: Active | already protected |
| 12 | apps/geoscience/well-correlation-tool | Navigate to /dashboard/apps/geoscience/well-correlation | (target route) | n/a | redirect; target is gated |
| 13 | apps/geoscience/petrophysics-studio | PetrophysicsStudio | petrophysics-studio | petrophysics-studio: Active | already protected |
| 14 | apps/geoscience/petrophysics-studio/help | PetrophysicsHelpGuide | petrophysics-studio | petrophysics-studio: Active | already protected |
| 15 | apps/geoscience/rock-physics-studio | RockPhysicsStudio | rock-physics-studio | rock-physics-studio: Active | already protected |
| 16 | apps/geoscience/rock-physics-studio/help | RockPhysicsStudioHelpGuide | rock-physics-studio | rock-physics-studio: Active | already protected |
| 17 | apps/geoscience/earth-modeling | EarthModeling | earth-modeling | earth-modeling: Active | already protected |
| 18 | apps/geoscience/earth-modeling/help | EarthModelingHelpGuide | earth-modeling | earth-modeling: Active | already protected |
| 19 | apps/geoscience/pore-pressure-studio | PorePressureStudio | pore-pressure-studio | pore-pressure-studio: Active | already protected |
| 20 | apps/geoscience/pore-pressure-studio/help | PorePressureStudioHelpGuide | pore-pressure-studio | pore-pressure-studio: Active | already protected |
| 21 | apps/geoscience/crossplot-generator | Navigate to /dashboard/apps/geoscience/petrophysics-studio | (target route) | n/a | redirect; target is gated |
| 22 | apps/geoscience/petrophysics-estimator | Navigate to /dashboard/apps/geoscience/petrophysics-studio | (target route) | n/a | redirect; target is gated |
| 23 | apps/geoscience/petrophysical-integration-suite | Navigate to /dashboard/apps/geoscience/petrophysics-studio | (target route) | n/a | redirect; target is gated |
| 24 | apps/geoscience/log-facies-analysis | Navigate to /dashboard/apps/geoscience/petrophysics-studio | (target route) | n/a | redirect; target is gated |
| 25 | apps/geoscience/well-log-analyzer | Navigate to /dashboard/apps/geoscience/petrophysics-studio | (target route) | n/a | redirect; target is gated |
| 26 | apps/geoscience/automated-log-digitizer | Navigate to /dashboard/apps/geoscience/petrophysics-studio | (target route) | n/a | redirect; target is gated |
| 27 | apps/geoscience/contour-map-digitizer | ContourMapDigitizer | contour-map-digitizer, mapping-surface-studio | contour-map-digitizer: NO ROW, mapping-surface-studio: Active | already protected |
| 28 | apps/geoscience/analog-finder | Navigate to /dashboard/geoscience | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 29 | apps/geoscience/earthmodel-studio | Navigate to /dashboard/apps/geoscience/earth-modeling | (target route) | n/a | redirect; target is gated |
| 30 | apps/geoscience/earth-model-studio | Navigate to /dashboard/apps/geoscience/earth-modeling | (target route) | n/a | redirect; target is gated |
| 31 | apps/geoscience/earthmodel-pro | Navigate to /dashboard/apps/geoscience/earth-modeling | (target route) | n/a | redirect; target is gated |
| 32 | apps/geoscience/earth-model-pro | Navigate to /dashboard/apps/geoscience/earth-modeling | (target route) | n/a | redirect; target is gated |
| 33 | apps/geoscience/earth-model-studio/projects | Navigate to /dashboard/apps/geoscience/earth-modeling | (target route) | n/a | redirect; target is gated |
| 34 | apps/geoscience/basinflow-genesis | BasinFlowGenesis | basinflow-genesis | basinflow-genesis: Active | WRAPPED in this PR |
| 35 | apps/geoscience/basinflow-genesis/help | BasinFlowHelpGuide | basinflow-genesis | basinflow-genesis: Active | WRAPPED in this PR |
| 36 | apps/geoscience/seismolord | Seismolord | seismolord | seismolord: Active | already protected |
| 37 | apps/geoscience/seismolord/help | SeismolordHelpGuide | seismolord | seismolord: Active | already protected |
| 38 | apps/geoscience/well-data-manager | WellDataManager | well-data-manager | well-data-manager: Active | already protected |
| 39 | apps/geoscience/well-data-manager/help | WellDataManagerHelpGuide | well-data-manager | well-data-manager: Active | already protected |
| 40 | apps/geoscience/mechanical-earth-model | Navigate to /dashboard/apps/drilling/geomechanics-studio | (target route) | n/a | redirect; target is gated |
| 41 | apps/mechanical-earth-model | Navigate to /dashboard/apps/drilling/geomechanics-studio | (target route) | n/a | redirect; target is gated |
| 42 | apps/geoscience/1d-mechanical-earth-model | Navigate to /dashboard/apps/drilling/geomechanics-studio | (target route) | n/a | redirect; target is gated |
| 43 | apps/1d-mechanical-earth-model | Navigate to /dashboard/apps/drilling/geomechanics-studio | (target route) | n/a | redirect; target is gated |
| 44 | apps/geoscience/mem | Navigate to /dashboard/apps/drilling/geomechanics-studio | (target route) | n/a | redirect; target is gated |
| 45 | apps/geoscience/geomechanics | Navigate to /dashboard/apps/drilling/geomechanics-studio | (target route) | n/a | redirect; target is gated |
| 46 | apps/reservoir/fluid-systems-studio | FluidSystemsStudio | fluid-systems-studio | fluid-systems-studio: Active | WRAPPED in this PR |
| 47 | apps/reservoir/waterflood-dashboard | Navigate to /dashboard/apps/reservoir/waterflood-design-studio?tab=surveillance | (target route) | n/a | redirect; target is gated (target corrected in this PR) |
| 48 | apps/reservoir/voidage-replacement-monitor | VoidageReplacementMonitor | voidage-replacement-monitor | voidage-replacement-monitor: Active | WRAPPED in this PR |
| 49 | apps/reservoir/waterflood-design-studio | WaterfloodDesignStudio | fractional-flow-calculator | fractional-flow-calculator: Active | WRAPPED in this PR |
| 50 | apps/reservoir/scal-studio | ScalStudio | scal-studio | scal-studio: Active | WRAPPED in this PR |
| 51 | apps/reservoir/reservoir-simulation-studio | ReservoirSimulationStudio | reservoir-simulation-studio | reservoir-simulation-studio: Active | already protected |
| 52 | apps/reservoir/well-test-analysis-studio | WellTestAnalysisStudio | well-test-analyzer | well-test-analyzer: Active | WRAPPED in this PR |
| 53 | apps/reservoir/well-test-analyzer | WellTestAnalysisStudio | well-test-analyzer | well-test-analyzer: Active | WRAPPED in this PR |
| 54 | apps/reservoir/fractional-flow-calculator | WaterfloodDesignStudio | fractional-flow-calculator | fractional-flow-calculator: Active | WRAPPED in this PR |
| 55 | apps/reservoir/relative-permeability-designer | Navigate to /dashboard/apps/reservoir/scal-studio | (target route) | n/a | redirect; target is gated |
| 56 | apps/reservoir/recovery-factor-estimator | RecoveryFactorEstimator | recovery-factor-estimator | recovery-factor-estimator: Active | WRAPPED in this PR |
| 57 | apps/reservoir/risked-reserves-valuation | RiskedReservesValuation | risked-reserves-valuation | risked-reserves-valuation: Active | WRAPPED in this PR |
| 58 | apps/reservoir/risked-reserves-valuation/help | RiskedReservesHelpGuide | risked-reserves-valuation | risked-reserves-valuation: Active | WRAPPED in this PR |
| 59 | apps/reservoir/eor-screening | EorScreeningTool | eor-screening | eor-screening: Active | WRAPPED in this PR |
| 60 | apps/reservoir/eor-screening/help | EorScreeningHelpGuide | eor-screening | eor-screening: Active | WRAPPED in this PR |
| 61 | apps/reservoir/forecast-scenario-hub | ForecastScenarioHub | forecast-scenario-hub | forecast-scenario-hub: Active | WRAPPED in this PR |
| 62 | apps/reservoir/forecast-scenario-hub/help | ForecastScenarioHubHelpGuide | forecast-scenario-hub | forecast-scenario-hub: Active | WRAPPED in this PR |
| 63 | apps/reservoir/aquifer-influx-calculator | Navigate to /dashboard/apps/reservoir/reservoir-balance?tab=aquifer | (target route) | n/a | redirect; target is gated |
| 64 | apps/reservoir/decline-curve-analysis | DeclineCurveAnalysis | decline-curve-analysis | decline-curve-analysis: Active | WRAPPED in this PR |
| 65 | apps/reservoir/reservoir-balance | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 66 | apps/reservoir/reservoir-balance/cases/:caseId | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 67 | apps/reservoir/reservoir-balance-pro | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 68 | apps/reservoir/reservoir-balance-pro/cases/:caseId | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 69 | apps/reservoir/reservoir-balance-surveillance | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 70 | apps/reservoir/reservoir-balance-surveillance/cases/:caseId | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 71 | apps/reservoir/material-balance-studio | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 72 | apps/reservoir/material-balance-studio/cases/:caseId | ReservoirBalance | reservoir-balance | reservoir-balance: Active | WRAPPED in this PR |
| 73 | apps/reservoir/scenario-planner | Navigate to /dashboard/apps/reservoir/forecast-scenario-hub | (target route) | n/a | redirect; target is gated |
| 74 | apps/reservoir/eor-designer | Navigate to /dashboard/apps/reservoir/eor-screening | (target route) | n/a | redirect; target is gated |
| 75 | apps/reservoir/uncertainty-analysis | Navigate to /dashboard/apps/geoscience/reservoircalc-pro | (target route) | n/a | redirect; target is gated |
| 76 | apps/reservoir/reservoir-simulation-connector | Navigate to /dashboard/apps/reservoir/reservoir-simulation-studio | (target route) | n/a | redirect; target is gated |
| 77 | apps/drilling/well-planning | WellPlanning | well-planning | well-planning: Active | already protected |
| 78 | apps/drilling/well-planning/help | WellDesignHelpGuide | well-planning | well-planning: Active | already protected |
| 79 | apps/drilling/well-planning/:wellId | WellPlanning | well-planning | well-planning: Active | already protected |
| 80 | apps/drilling/casing-tubing-design-pro | CasingTubingDesignPro | casing-tubing-design-pro | casing-tubing-design-pro: Active | already protected |
| 81 | apps/drilling/casing-tubing-design-pro/help | CasingTubingHelpGuide | casing-tubing-design-pro | casing-tubing-design-pro: Active | already protected |
| 82 | apps/drilling/completion-design-studio | CompletionDesignStudio | completion-design-studio | completion-design-studio: Active | already protected |
| 83 | apps/drilling/completion-design-studio/help | CompletionDesignHelpGuide | completion-design-studio | completion-design-studio: Active | already protected |
| 84 | apps/drilling/perforation-sand-control | PerforationSandControlStudio | perforation-sand-control | perforation-sand-control: Active | already protected |
| 85 | apps/drilling/perforation-sand-control/help | PerforationSandControlHelpGuide | perforation-sand-control | perforation-sand-control: Active | already protected |
| 86 | apps/drilling/stimulation-designer | StimulationDesignerStudio | stimulation-designer | stimulation-designer: Active | already protected |
| 87 | apps/drilling/stimulation-designer/help | StimulationDesignerHelpGuide | stimulation-designer | stimulation-designer: Active | already protected |
| 88 | apps/drilling/well-integrity-pa | WellIntegrityPAStudio | well-integrity-pa | well-integrity-pa: Active | already protected |
| 89 | apps/drilling/well-integrity-pa/help | WellIntegrityPAHelpGuide | well-integrity-pa | well-integrity-pa: Active | already protected |
| 90 | apps/drilling/well-cost-time | WellCostTimeStudio | well-cost-time | well-cost-time: Active | already protected |
| 91 | apps/drilling/well-cost-time/help | WellCostTimeHelpGuide | well-cost-time | well-cost-time: Active | already protected |
| 92 | apps/drilling/geomechanics-studio | GeomechanicsStudio | geomechanics-studio | geomechanics-studio: Active | already protected |
| 93 | apps/drilling/geomechanics-studio/help | GeomechanicsHelpGuide | geomechanics-studio | geomechanics-studio: Active | already protected |
| 94 | apps/drilling/cementing-studio | CementingStudio | cementing-studio | cementing-studio: Active | already protected |
| 95 | apps/drilling/cementing-studio/help | CementingHelpGuide | cementing-studio | cementing-studio: Active | already protected |
| 96 | apps/drilling/well-control-studio | WellControlStudio | well-control-studio | well-control-studio: Active | already protected |
| 97 | apps/drilling/well-control-studio/help | WellControlHelpGuide | well-control-studio | well-control-studio: Active | already protected |
| 98 | apps/drilling/torque-drag-studio | TorqueDragStudio | torque-drag-studio | torque-drag-studio: Active | already protected |
| 99 | apps/drilling/torque-drag-studio/help | TorqueDragHelpGuide | torque-drag-studio | torque-drag-studio: Active | already protected |
| 100 | apps/drilling/pore-pressure-fracture-gradient | Navigate to /dashboard/apps/geoscience/pore-pressure-studio | (target route) | n/a | redirect; target is gated |
| 101 | apps/drilling/casing-wear-analyzer | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 102 | apps/drilling/drilling-fluids-hydraulics | HydraulicsStudio | drilling-fluids-hydraulics | drilling-fluids-hydraulics: Active | already protected |
| 103 | apps/drilling/drilling-fluids-hydraulics/help | HydraulicsHelpGuide | drilling-fluids-hydraulics | drilling-fluids-hydraulics: Active | already protected |
| 104 | apps/drilling/torque-drag-predictor | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 105 | apps/drilling/cementing-simulation | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 106 | apps/drilling/frac-completion | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 107 | apps/drilling/rto-dashboard | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 108 | apps/drilling/incident-finder | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 109 | apps/drilling/wellbore-stability-analyzer | Navigate to /dashboard/drilling | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 110 | apps/drilling/well-spacing-optimizer | Navigate to /dashboard/apps/reservoir/well-spacing-optimizer | (target route) | n/a | redirect; target is gated |
| 111 | apps/reservoir/well-spacing-optimizer | WellSpacingOptimizer | well-spacing-optimizer | well-spacing-optimizer: Active | already protected |
| 112 | apps/reservoir/well-spacing-optimizer/help | WellSpacingHelpGuide | well-spacing-optimizer | well-spacing-optimizer: Active | already protected |
| 113 | apps/production/production-surveillance-studio | ProductionSurveillanceStudio | production-surveillance-studio | production-surveillance-studio: Active | already protected |
| 114 | apps/production/production-surveillance-dashboard | Navigate to /dashboard/apps/production/production-surveillance-studio | (target route) | n/a | redirect; target is gated |
| 115 | apps/production/surveillance-dashboard | Navigate to /dashboard/apps/production/production-surveillance-studio | (target route) | n/a | redirect; target is gated |
| 116 | apps/production/production-allocation-studio | ProductionAllocationStudio | production-allocation-studio | production-allocation-studio: Active | already protected |
| 117 | apps/production/gas-lift-design-studio | GasLiftDesignStudio | gas-lift-design-studio | gas-lift-design-studio: Active | already protected |
| 118 | apps/production/esp-design-studio | EspDesignStudio | esp-design-studio | esp-design-studio: Active | already protected |
| 119 | apps/production/rod-pump-design-studio | RodPumpDesignStudio | rod-pump-design-studio | rod-pump-design-studio: Active | already protected |
| 120 | apps/production/gas-well-performance-studio | GasWellPerformanceStudio | gas-well-performance-studio | gas-well-performance-studio: Active | already protected |
| 121 | apps/production/choke-performance-studio | ChokePerformanceStudio | choke-performance-studio | choke-performance-studio: Active | already protected |
| 122 | apps/production/well-test-analyzer | Navigate to /dashboard/apps/reservoir/well-test-analysis-studio | (target route) | n/a | redirect; target is gated |
| 123 | apps/production/production-forecasting | Navigate to /dashboard/apps/reservoir/decline-curve-analysis | (target route) | n/a | redirect; target is gated |
| 124 | apps/production/nodal-analysis-studio | NodalAnalysisStudio | nodal-analysis-engine | nodal-analysis-engine: Active | already protected |
| 125 | apps/production/nodal-analysis-engine | NodalAnalysisStudio | nodal-analysis-engine | nodal-analysis-engine: Active | already protected |
| 126 | apps/production/nodal-performance-optimizer | NodalAnalysisStudio | nodal-analysis-engine | nodal-analysis-engine: Active | already protected |
| 127 | apps/production/wellbore-flow-simulator | Navigate to /dashboard/apps/production/nodal-analysis-studio | (target route) | n/a | redirect; target is gated |
| 128 | apps/production/artificial-lift-designer | ArtificialLiftAdvisor | artificial-lift-designer | artificial-lift-designer: Active | already protected |
| 129 | apps/production/artificial-lift-advisor | ArtificialLiftAdvisor | artificial-lift-designer | artificial-lift-designer: Active | already protected |
| 130 | apps/production/flow-assurance-studio | FlowAssuranceStudio | flow-assurance-studio | flow-assurance-studio: Active | already protected |
| 131 | apps/production/flow-assurance-monitor | Navigate to /dashboard/production | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 132 | apps/production/integrated-asset-modeler | Navigate to /dashboard/apps/production/nodal-analysis-studio | (target route) | n/a | redirect; target is gated |
| 133 | apps/production/well-schematic-designer | Navigate to /dashboard/apps/drilling/completion-design-studio | (target route) | n/a | redirect; target is gated |
| 134 | apps/production/well-intervention-planner | WellInterventionPlanner | well-intervention-planner | well-intervention-planner: Active | already protected |
| 135 | apps/production/stimulation-candidate-selector | Navigate to /dashboard/apps/production/well-intervention-planner | (target route) | n/a | redirect; target is gated (target corrected in this PR) |
| 136 | apps/production/water-gas-shutoff-planner | Navigate to /dashboard/apps/production/well-intervention-planner | (target route) | n/a | redirect; target is gated (target corrected in this PR) |
| 137 | apps/production/workover-planner | Navigate to /dashboard/apps/production/well-intervention-planner | (target route) | n/a | redirect; target is gated (target corrected in this PR) |
| 138 | apps/production/rigless-intervention-planner | Navigate to /dashboard/apps/production/well-intervention-planner | (target route) | n/a | redirect; target is gated (target corrected in this PR) |
| 139 | apps/production/production-network-studio | ProductionNetworkStudio | production-network-studio | production-network-studio: Active | already protected |
| 140 | apps/production/network-diagram-pro | Navigate to /dashboard/production | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 141 | apps/economics/project-management-pro | ProjectManagementPro | project-management-pro | project-management-pro: Active | already protected |
| 142 | apps/economics-project-management/afe-cost-control-manager | AfeCostControlManager | afe-cost-control-manager | afe-cost-control-manager: Active | already protected |
| 143 | apps/economics/afe-cost-control-manager | AfeCostControlManager | afe-cost-control-manager | afe-cost-control-manager: Active | already protected |
| 144 | apps/economic/afe-cost-control-manager | AfeCostControlManager | afe-cost-control-manager | afe-cost-control-manager: Active | already protected |
| 145 | apps/economics/afe-cost-control | AfeCostControlManager | afe-cost-control-manager | afe-cost-control-manager: Active | already protected |
| 146 | apps/economics-project-management/technical-report-autopilot | TechnicalReportAutopilot | technical-report-autopilot | technical-report-autopilot: Active | already protected |
| 147 | apps/economics/technical-report-autopilot | TechnicalReportAutopilot | technical-report-autopilot | technical-report-autopilot: Active | already protected |
| 148 | apps/economic/technical-report-autopilot | TechnicalReportAutopilot | technical-report-autopilot | technical-report-autopilot: Active | already protected |
| 149 | apps/economics/report-autopilot | TechnicalReportAutopilot | technical-report-autopilot | technical-report-autopilot: Active | already protected |
| 150 | apps/economics-project-management/probabilistic-breakeven-analyzer | ProbabilisticBreakevenAnalyzer | probabilistic-breakeven-analyzer | probabilistic-breakeven-analyzer: Active | already protected |
| 151 | apps/economics/probabilistic-breakeven-analyzer | ProbabilisticBreakevenAnalyzer | probabilistic-breakeven-analyzer | probabilistic-breakeven-analyzer: Active | already protected |
| 152 | apps/economic/probabilistic-breakeven-analyzer | ProbabilisticBreakevenAnalyzer | probabilistic-breakeven-analyzer | probabilistic-breakeven-analyzer: Active | already protected |
| 153 | apps/economics/breakeven-analyzer | ProbabilisticBreakevenAnalyzer | probabilistic-breakeven-analyzer | probabilistic-breakeven-analyzer: Active | already protected |
| 154 | apps/economics-project-management/value-of-information-analyzer | ValueOfInformationAnalyzer | value-of-information-analyzer | value-of-information-analyzer: Active | already protected |
| 155 | apps/economics/value-of-information-analyzer | ValueOfInformationAnalyzer | value-of-information-analyzer | value-of-information-analyzer: Active | already protected |
| 156 | apps/economic/value-of-information-analyzer | ValueOfInformationAnalyzer | value-of-information-analyzer | value-of-information-analyzer: Active | already protected |
| 157 | apps/economics/voi-analyzer | ValueOfInformationAnalyzer | value-of-information-analyzer | value-of-information-analyzer: Active | already protected |
| 158 | apps/economics/npv-scenario-builder | NpvScenarioBuilder | npv-scenario-builder | npv-scenario-builder: Active | already protected |
| 159 | apps/economics/decision-tree-builder | DecisionTreeBuilder | decision-tree-builder | decision-tree-builder: Active | already protected |
| 160 | apps/economics/decision-studio | DecisionStudio | decision-studio | decision-studio: Active | already protected |
| 161 | apps/economics/fiscal-regime-designer | FiscalRegimeDesigner | fiscal-regime-designer | fiscal-regime-designer: Active | already protected |
| 162 | apps/economics/capital-portfolio-studio | CapitalPortfolioStudio | capital-portfolio-studio | capital-portfolio-studio: Active | already protected |
| 163 | apps/economics/fdp-accelerator | FdpAccelerator | fdp-accelerator | fdp-accelerator: Active | already protected |
| 164 | apps/economics-project-management/petroleum-economics-studio/* | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 165 | apps/economics/petroleum-economics-studio/* | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 166 | apps/economic/petroleum-economics-studio/* | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 167 | apps/economics-project-management/epe-suite | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 168 | apps/economics/epe-suite | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 169 | apps/economic/epe-suite | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 170 | apps/economics/epe/cases | EpeCaseList | epe-suite | epe-suite: Active | already protected |
| 171 | apps/economics/epe/help | EpeHelpGuide | epe-suite | epe-suite: Active | already protected |
| 172 | apps/economics/epe/cases/:caseId | EpeCaseDetail | epe-suite | epe-suite: Active | already protected |
| 173 | apps/economics/epe/cases/:caseId/run | EpeRunConsole | epe-suite | epe-suite: Active | already protected |
| 174 | apps/economics/epe/cases/:caseId/compare | EpeRunComparison | epe-suite | epe-suite: Active | already protected |
| 175 | apps/economics/epe/runs/:runId | EpeResultsViewer | epe-suite | epe-suite: Active | already protected |
| 176 | apps/economics/epe/run/:runId | EpeResultsViewer | epe-suite | epe-suite: Active | already protected |
| 177 | apps/economics/epe/results/:runId | EpeResultsViewer | epe-suite | epe-suite: Active | already protected |
| 178 | apps/economics/epe/compare | Navigate to /dashboard/apps/economics/epe/cases | (target route) | n/a | redirect; target is gated |
| 179 | apps/facilities/separator-slug-catcher-designer | SeparatorSlugCatcherDesigner | separator-slug-catcher-designer | separator-slug-catcher-designer: Active | already protected |
| 180 | apps/facilities/compressor-pump-pack | Navigate to /dashboard/facilities | (target route) | n/a | redirect to a module hub or the dashboard; no app renders |
| 181 | apps/facilities/compressor-station-designer | CompressorStationDesigner | compressor-station-designer | compressor-station-designer: Active | already protected |
| 182 | apps/facilities/pump-station-designer | PumpStationDesigner | pump-station-designer | pump-station-designer: Active | already protected |
| 183 | apps/facilities/control-valve-sizing | ControlValveSizing | control-valve-sizing | control-valve-sizing: Active | already protected |
| 184 | apps/facilities/storage-tank-designer | StorageTankDesigner | storage-tank-designer | storage-tank-designer: Active | already protected |
| 185 | apps/facilities/flow-metering-designer | FlowMeteringDesigner | flow-metering-designer | flow-metering-designer: Active | already protected |
| 186 | apps/midstream-downstream/crude-assay-blending-studio | CrudeAssayBlendingStudio | crude-assay-blending-studio | crude-assay-blending-studio: Active | already protected |
| 187 | apps/process-safety/lopa-sil-studio | LopaSilStudio | lopa-sil-studio | lopa-sil-studio: Active | already protected |
| 188 | apps/process-safety/lopa-sil-studio/help | LopaSilStudioHelpGuide | lopa-sil-studio | lopa-sil-studio: Active | already protected |
| 189 | apps/data-ai/data-quality-studio | DataQualityStudio | data-quality-studio | data-quality-studio: Active | already protected |
| 190 | apps/data-ai/data-quality-studio/help | DataQualityStudioHelpGuide | data-quality-studio | data-quality-studio: Active | already protected |
| 191 | apps/data-ai/ml-workbench | MlWorkbench | ml-workbench | ml-workbench: Active | already protected |
| 192 | apps/data-ai/ml-workbench/help | MlWorkbenchHelpGuide | ml-workbench | ml-workbench: Active | already protected |
| 193 | apps/data-ai/electrofacies-studio | ElectrofaciesStudio | electrofacies-studio | electrofacies-studio: Active | already protected |
| 194 | apps/data-ai/electrofacies-studio/help | ElectrofaciesStudioHelpGuide | electrofacies-studio | electrofacies-studio: Active | already protected |
| 195 | apps/data-ai/forecasting-ml-workbench | ForecastingMlWorkbench | forecasting-ml-workbench | forecasting-ml-workbench: Active | already protected |
| 196 | apps/data-ai/forecasting-ml-workbench/help | ForecastingMlWorkbenchHelpGuide | forecasting-ml-workbench | forecasting-ml-workbench: Active | already protected |
| 197 | apps/data-ai/ai-evaluation-studio | AiEvaluationStudio | ai-evaluation-studio | ai-evaluation-studio: Active | already protected |
| 198 | apps/data-ai/ai-evaluation-studio/help | AiEvaluationStudioHelpGuide | ai-evaluation-studio | ai-evaluation-studio: Active | already protected |
| 199 | apps/process-safety/consequence-studio | ConsequenceModellingStudio | consequence-studio | consequence-studio: Active | already protected |
| 200 | apps/process-safety/consequence-studio/help | ConsequenceModellingStudioHelpGuide | consequence-studio | consequence-studio: Active | already protected |
| 201 | apps/process-safety/qra-studio | QraStudio | qra-studio | qra-studio: Active | already protected |
| 202 | apps/process-safety/qra-studio/help | QraStudioHelpGuide | qra-studio | qra-studio: Active | already protected |
| 203 | apps/midstream-downstream/product-blending-optimizer | ProductBlendingOptimizer | product-blending-optimizer | product-blending-optimizer: Active | already protected |
| 204 | apps/midstream-downstream/refinery-planning-scheduling | RefineryPlanningStudio | refinery-planning-scheduling | refinery-planning-scheduling: Active | already protected |
| 205 | apps/midstream-downstream/modular-refinery-feasibility | ModularRefineryFeasibility | modular-refinery-feasibility | modular-refinery-feasibility: Active | already protected |
| 206 | apps/midstream-downstream/terminal-depot-studio | TerminalDepotStudio | terminal-depot-studio | terminal-depot-studio: Active | already protected |
| 207 | apps/midstream-downstream/materials-spares-planner | MaterialsSparesPlanner | materials-spares-planner | materials-spares-planner: Active | already protected |
| 208 | apps/midstream-downstream/marine-logistics-planner | MarineLogisticsPlanner | marine-logistics-planner | marine-logistics-planner: Active | already protected |
| 209 | apps/midstream-downstream/fuel-pricing-supply-chain | FuelPricingStudio | fuel-pricing-supply-chain | fuel-pricing-supply-chain: Active | already protected |
| 210 | apps/midstream-downstream/lpg-cng-rollout-studio | LpgCngRolloutStudio | lpg-cng-rollout-studio | lpg-cng-rollout-studio: Active | already protected |
| 211 | apps/midstream-downstream/energy-utilities-efficiency | EnergyEfficiencyStudio | energy-utilities-efficiency | energy-utilities-efficiency: Active | already protected |
| 212 | apps/midstream-downstream/carbon-footprint-abatement | CarbonAbatementStudio | carbon-footprint-abatement | carbon-footprint-abatement: Active | already protected |
| 213 | apps/midstream-downstream/flare-gas-to-value | FlareToValueStudio | flare-gas-to-value | flare-gas-to-value: Active | already protected |
| 214 | apps/facilities/heat-exchanger-sizer | HeatExchangerSizer | heat-exchanger-sizer | heat-exchanger-sizer: Active | already protected |
| 215 | apps/facilities/gas-treating-dehydration | GasTreatingDehydration | gas-treating-dehydration | gas-treating-dehydration: Active | already protected |
| 216 | apps/facilities/relief-blowdown-sizer | ReliefBlowdownSizer | relief-blowdown-sizer | relief-blowdown-sizer: Active | already protected |
| 217 | apps/facilities/facility-network-hydraulics | PipelineLineSizingStudio | facility-network-hydraulics | facility-network-hydraulics: Active | already protected |
| 218 | apps/facilities/facility-layout-mapper | FacilityLayoutMapper | facility-layout-mapper | facility-layout-mapper: Active | already protected |
| 219 | apps/facilities/corrosion-rate-predictor | CorrosionRatePredictor | corrosion-rate-predictor | corrosion-rate-predictor: Active | already protected |
| 220 | apps/facilities/pipeline-designer | Navigate to /dashboard/apps/facilities/facility-network-hydraulics | (target route) | n/a | redirect; target is gated |
| 221 | apps/facilities/pipeline-sizer | Navigate to /dashboard/apps/facilities/facility-network-hydraulics | (target route) | n/a | redirect; target is gated |
| 222 | apps/facilities/produced-water-treatment | ProducedWaterTreatment | produced-water-treatment | produced-water-treatment: Active | already protected |
| 223 | apps/assurance/risk-heatmap | Navigate to /dashboard/apps/assurance/risk-register?tab=heatmap | (target route) | n/a | redirect; target is gated |
| 224 | apps/assurance/risk-register | RiskRegister | risk-register | risk-register: Active | already protected |
| 225 | apps/assurance/risk-register/new | NewRiskPage | risk-register | risk-register: Active | already protected |
| 226 | apps/assurance/risk-register/:id/edit | EditRiskPage | risk-register | risk-register: Active | already protected |
| 227 | apps/assurance/risk-register/:id | RiskDetailPage | risk-register | risk-register: Active | already protected |
| 228 | apps/assurance/document-control | DocControlDashboard | document-control | document-control: Active | already protected |
| 229 | apps/assurance/document-control/library | DocControlLibrary | document-control | document-control: Active | already protected |
| 230 | apps/assurance/document-control/new | DocControlNew | document-control | document-control: Active | already protected |
| 231 | apps/assurance/document-control/approvals | DocControlApprovals | document-control | document-control: Active | already protected |
| 232 | apps/assurance/document-control/reports | DocControlReports | document-control | document-control: Active | already protected |
| 233 | apps/assurance/document-control/:id | DocControlDetail | document-control | document-control: Active | already protected |
| 234 | apps/assurance/peer-review-manager | PeerReviewDashboard | peer-review-manager | peer-review-manager: Active | already protected |
| 235 | apps/assurance/peer-review-manager/register | PeerReviewRegister | peer-review-manager | peer-review-manager: Active | already protected |
| 236 | apps/assurance/peer-review-manager/new | PeerReviewNew | peer-review-manager | peer-review-manager: Active | already protected |
| 237 | apps/assurance/peer-review-manager/reports | PeerReviewReports | peer-review-manager | peer-review-manager: Active | already protected |
| 238 | apps/assurance/peer-review-manager/:id | PeerReviewDetail | peer-review-manager | peer-review-manager: Active | already protected |
| 239 | apps/assurance/management-of-change | MOCDashboard | management-of-change | management-of-change: Active | already protected |
| 240 | apps/assurance/management-of-change/register | MOCRegister | management-of-change | management-of-change: Active | already protected |
| 241 | apps/assurance/management-of-change/new | MOCNew | management-of-change | management-of-change: Active | already protected |
| 242 | apps/assurance/management-of-change/approvals | MOCApprovals | management-of-change | management-of-change: Active | already protected |
| 243 | apps/assurance/management-of-change/reports | MOCReports | management-of-change | management-of-change: Active | already protected |
| 244 | apps/assurance/management-of-change/:id | MOCDetail | management-of-change | management-of-change: Active | already protected |
| 245 | apps/assurance/qa-plan/* | QAPlanPageShell | quality-assurance-plan | quality-assurance-plan: Active | already protected |
| 246 | apps/assurance/regulatory-compliance/* | RegulatoryCompliancePageShell | regulatory-compliance | regulatory-compliance: Active | already protected |
| 247 | apps/assurance/iso-compliance/* | ISOCompliancePageShell | iso-compliance-tool | iso-compliance-tool: Active | already protected |
| 248 | apps/assurance/lessons-learned/* | LessonsLearnedPageShell | lesson-learned-db | lesson-learned-db: Active | already protected |
| 249 | apps/assurance/audit-manager/* | AuditManagerPageShell | audit-findings-manager | audit-findings-manager: Active | already protected |

## Verification

- Jest: `src/__tests__/appRouteProtection.test.js` (guard, slug checks, six negative
  controls) and `src/components/__tests__/ProtectedAppRoute.test.jsx` (gate
  behaviour on the real component, including the newly gated slugs).
- Browser: dev harness `/dev/route-guard/:page` (src/dev/RouteGuardHarness.jsx)
  mounts the real ProtectedAppRoute and the real app pages on the in-memory
  Supabase double with a chosen licence. Playwright walk 2026-09-30 (own Vite
  server, 1 worker), 12 of 12 pass: SCAL Studio, Waterflood Design Studio,
  Material Balance Studio, DCA, Basin & Charge Modeling and EOR Screening each
  show Access Restricted with Purchase License when unlicensed (no licence, or
  a licence for a different app) and open the app when the route's slug is
  licensed. The guard test checks that the harness uses the same appIds as
  App.jsx.

## Open items

- Staging E2E with a real unlicensed account is still an owner walk.
