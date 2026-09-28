// Cold-load paths for design-system rollout batch 4A:
// Wellsite Studio, Well Data Manager, Well Correlation
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  // each app and, for Wellsite Studio and Well Correlation, its help guide (/help is a sub-path)
  '/dashboard/apps/geoscience/wellsite-studio',
  '/dashboard/apps/geoscience/well-data-manager',
  '/dashboard/apps/geoscience/well-correlation',
];
