// Cold-load paths for design-system rollout batch 2F:
// AFE Cost Control Manager, Probabilistic Breakeven Analyzer, Decision
// Studio, Value of Information Analyzer, Decision Tree Builder
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/economics/afe-cost-control',
  '/dashboard/apps/economics/afe-cost-control-manager',
  '/dashboard/apps/economics-project-management/afe-cost-control-manager',
  '/dashboard/apps/economic/afe-cost-control-manager',
  '/dashboard/apps/economics/breakeven-analyzer',
  '/dashboard/apps/economics/probabilistic-breakeven-analyzer',
  '/dashboard/apps/economics-project-management/probabilistic-breakeven-analyzer',
  '/dashboard/apps/economic/probabilistic-breakeven-analyzer',
  '/dashboard/apps/economics/decision-studio',
  '/dashboard/apps/economics/voi-analyzer',
  '/dashboard/apps/economics/value-of-information-analyzer',
  '/dashboard/apps/economics-project-management/value-of-information-analyzer',
  '/dashboard/apps/economic/value-of-information-analyzer',
  '/dashboard/apps/economics/decision-tree-builder',
];
