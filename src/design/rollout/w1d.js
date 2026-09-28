// Cold-load paths for design-system rollout batch 1D:
// Fluid Systems Studio, Waterflood Design Studio, SCAL Studio
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/reservoir/fluid-systems-studio',
  '/dashboard/apps/reservoir/waterflood-design-studio',
  // Alias route: the retired Fractional Flow Analyzer slug renders the
  // Waterflood Design Studio page.
  '/dashboard/apps/reservoir/fractional-flow-calculator',
  '/dashboard/apps/reservoir/scal-studio',
];
