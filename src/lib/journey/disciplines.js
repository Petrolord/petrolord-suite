// Guided Journey: disciplines and their starter packs (docs/scope/
// GuidedJourney-DESIGN.md, section 4). Owner rule 2026-10-17: people are
// never bothered with work outside their discipline; a drilling engineer is
// never shown seismic or logs. Keys are the Suite module slugs
// (src/data/suiteCatalog.js) plus 'management', and match the database's
// suite_journey_disciplines().
//
// A starter step names its app id (the route's ProtectedAppRoute appId and
// the work-source app id) and its module. It is offered only when the person
// can open that app; otherwise the next step of the pack takes its place.
// Pure.

const APP = '/dashboard/apps';

export const DISCIPLINES = Object.freeze([
  { key: 'geoscience', label: 'Geoscience', hint: 'seismic, wells, maps, petrophysics' },
  { key: 'reservoir', label: 'Reservoir engineering', hint: 'fluids, decline, material balance, simulation' },
  { key: 'drilling', label: 'Drilling and completion', hint: 'well design, casing, cost and time' },
  { key: 'production', label: 'Production operations', hint: 'well performance, lift, surveillance' },
  { key: 'facilities', label: 'Facilities engineering', hint: 'lines, separators, relief, stations' },
  { key: 'process-safety', label: 'Process safety', hint: 'LOPA, consequence, QRA' },
  { key: 'midstream-downstream', label: 'Midstream, refining and downstream', hint: 'assays, refinery planning, terminals' },
  { key: 'economics', label: 'Economics and project management', hint: 'project cases, fiscal terms, decisions' },
  { key: 'assurance', label: 'Assurance, risk and compliance', hint: 'risk register, change, audits' },
  { key: 'data-ai', label: 'Data and AI', hint: 'data quality, machine learning' },
  { key: 'management', label: 'Management and overview', hint: 'team, projects, reports' },
]);

export const DISCIPLINE_KEYS = Object.freeze(DISCIPLINES.map((d) => d.key));
export const disciplineLabel = (key) => DISCIPLINES.find((d) => d.key === key)?.label || key;

/** One starter step. */
const step = (discipline, appId, app, title, path, extra = {}) => ({
  key: `start:${discipline}:${appId}`,
  discipline,
  module: discipline === 'management' ? null : discipline,
  appId,
  app,
  title,
  href: `${APP}/${path}`,
  ...extra,
});

/**
 * Starter packs: the recommended first step, then the alternatives in order.
 * `doImport` marks apps that open their import from `?do=import`.
 */
export const STARTER_PACKS = Object.freeze({
  geoscience: [
    step('geoscience', 'seismolord', 'Seismolord', 'Load your seismic: SEG-Y or ZGY', 'geoscience/seismolord', { doImport: true }),
    step('geoscience', 'well-data-manager', 'Well Data Manager', 'Load your wells and logs: LAS', 'geoscience/well-data-manager', { doImport: true }),
    step('geoscience', 'mapping-surface-studio', 'Mapping & Surface Studio', 'Load your surfaces and maps', 'geoscience/mapping-surface-studio'),
  ],
  reservoir: [
    step('reservoir', 'fluid-systems-studio', 'Fluid Systems Studio', 'Describe your fluid: import a PVT report or start from correlations', 'reservoir/fluid-systems-studio'),
    step('reservoir', 'decline-curve-analysis', 'Decline Curve Analysis', 'Load your production history', 'reservoir/decline-curve-analysis'),
    step('reservoir', 'reservoir-balance', 'Material Balance Studio', 'Set up a material balance with pressure and production history', 'reservoir/reservoir-balance'),
    step('reservoir', 'well-test-analyzer', 'Well Test Analysis Studio', 'Interpret a well test', 'reservoir/well-test-analysis-studio'),
  ],
  drilling: [
    step('drilling', 'well-planning', 'Well Design Studio', 'Plan a well: start a trajectory or import a survey', 'drilling/well-planning'),
    step('drilling', 'casing-tubing-design-pro', 'Casing & Tubing Design Studio', 'Design the casing', 'drilling/casing-tubing-design-pro'),
    step('drilling', 'well-cost-time', 'Well Cost & Time Estimator', 'Estimate cost and time', 'drilling/well-cost-time'),
  ],
  production: [
    step('production', 'nodal-analysis-engine', 'Nodal Analysis Studio', 'Build a well model', 'production/nodal-analysis-studio'),
    step('production', 'production-surveillance-studio', 'Production Surveillance Studio', 'Load your production data', 'production/production-surveillance-studio'),
    step('production', 'artificial-lift-designer', 'Artificial Lift Advisor', 'Choose a lift method', 'production/artificial-lift-advisor'),
  ],
  facilities: [
    step('facilities', 'facility-network-hydraulics', 'Pipeline & Line Sizing Studio', 'Size a line', 'facilities/facility-network-hydraulics'),
    step('facilities', 'separator-slug-catcher-designer', 'Separator & Slug Catcher Studio', 'Size a separator', 'facilities/separator-slug-catcher-designer'),
    step('facilities', 'relief-blowdown-sizer', 'Relief & Flare Studio', 'Size relief and flare', 'facilities/relief-blowdown-sizer'),
  ],
  'process-safety': [
    step('process-safety', 'lopa-sil-studio', 'LOPA & SIL Studio', 'Start a LOPA study', 'process-safety/lopa-sil-studio'),
    step('process-safety', 'consequence-studio', 'Consequence Modelling Studio', 'Model a release', 'process-safety/consequence-studio'),
    step('process-safety', 'qra-studio', 'QRA Studio', 'Start a QRA', 'process-safety/qra-studio'),
  ],
  'midstream-downstream': [
    step('midstream-downstream', 'crude-assay-blending-studio', 'Crude Assay & Blending Studio', 'Load a crude assay', 'midstream-downstream/crude-assay-blending-studio'),
    step('midstream-downstream', 'refinery-planning-scheduling', 'Refinery Planning & Scheduling Studio', 'Plan a refinery run', 'midstream-downstream/refinery-planning-scheduling'),
    step('midstream-downstream', 'terminal-depot-studio', 'Terminal & Depot Studio', 'Set up a terminal or depot', 'midstream-downstream/terminal-depot-studio'),
  ],
  economics: [
    step('economics', 'epe-suite', 'Petroleum Economics Studio', 'Build a project case', 'economics/epe/cases'),
    step('economics', 'fiscal-regime-designer', 'Fiscal Regime Designer', 'Set up fiscal terms', 'economics/fiscal-regime-designer'),
    step('economics', 'npv-scenario-builder', 'NPV Scenario Builder', 'Compare NPV scenarios', 'economics/npv-scenario-builder'),
  ],
  assurance: [
    step('assurance', 'risk-register', 'Risk Register', 'Open your risk register', 'assurance/risk-register'),
    step('assurance', 'management-of-change', 'Management of Change', 'Raise a change', 'assurance/management-of-change'),
    step('assurance', 'audit-findings-manager', 'Audit & Findings Manager', 'Plan an audit', 'assurance/audit-manager'),
  ],
  'data-ai': [
    step('data-ai', 'data-quality-studio', 'Data Quality Studio', 'Check a dataset', 'data-ai/data-quality-studio'),
    step('data-ai', 'ml-workbench', 'ML Workbench', 'Train a model', 'data-ai/ml-workbench'),
  ],
  management: [],
});

/**
 * The starter steps of a discipline that this person can open, in pack order.
 * @param {string} discipline
 * @param {(appId: string, module: ?string) => boolean} canOpen
 */
export function starterSteps(discipline, canOpen) {
  return (STARTER_PACKS[discipline] || []).filter((s) => canOpen(s.appId, s.module));
}

/**
 * Disciplines inferred from the modules a person can open (used when they skip
 * the question). Everything open, or nothing open, infers nothing: no guess.
 * @param {(module: string) => boolean} moduleOpen
 */
export function inferDisciplines(moduleOpen) {
  const open = DISCIPLINE_KEYS.filter((k) => k !== 'management' && moduleOpen(k));
  const all = DISCIPLINE_KEYS.length - 1;
  if (open.length === 0 || open.length === all) return [];
  return open;
}

/** The app ids whose work the journey state needs for these disciplines. */
export const appsOf = (disciplines) => disciplines.flatMap((d) => (STARTER_PACKS[d] || []).map((s) => s.appId));
