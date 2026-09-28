// Cold-load paths for design-system rollout batch 1A:
// Material Balance Studio, Well Test Analysis Studio
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  // Material Balance Studio: the current slug and the three legacy aliases
  // App.jsx still mounts it under (each with /cases/:caseId).
  '/dashboard/apps/reservoir/material-balance-studio',
  '/dashboard/apps/reservoir/reservoir-balance',
  '/dashboard/apps/reservoir/reservoir-balance-pro',
  '/dashboard/apps/reservoir/reservoir-balance-surveillance',
  // Well Test Analysis Studio and its retired-mock slug.
  '/dashboard/apps/reservoir/well-test-analysis-studio',
  '/dashboard/apps/reservoir/well-test-analyzer',
];
