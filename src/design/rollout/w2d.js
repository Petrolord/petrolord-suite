// Cold-load paths for design-system rollout batch 2D:
// Flow Assurance, Choke & Wellhead Performance, Gas Well Performance, Well
// Intervention Planner, Nodal Analysis
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/production/flow-assurance-studio',
  '/dashboard/apps/production/choke-performance-studio',
  '/dashboard/apps/production/gas-well-performance-studio',
  '/dashboard/apps/production/well-intervention-planner',
  // Nodal Analysis Studio renders on three slugs.
  '/dashboard/apps/production/nodal-analysis-studio',
  '/dashboard/apps/production/nodal-analysis-engine',
  '/dashboard/apps/production/nodal-performance-optimizer',
];
