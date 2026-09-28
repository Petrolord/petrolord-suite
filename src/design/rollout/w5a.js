// Cold-load paths for design-system rollout batch 5A:
// Facility Layout Mapper, Pipeline & Line Sizing, Corrosion & Integrity,
// Control Valve & Choke Sizing, Heat Exchanger & Cooling
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/facilities/control-valve-sizing',
  '/dashboard/apps/facilities/corrosion-rate-predictor',
  '/dashboard/apps/facilities/heat-exchanger-sizer',
  // Pipeline & Line Sizing Studio keeps its original slug.
  '/dashboard/apps/facilities/facility-network-hydraulics',
];
