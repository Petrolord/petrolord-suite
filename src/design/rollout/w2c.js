// Cold-load paths for design-system rollout batch 2C:
// ESP Design, Gas Lift Design, Rod Pump Design, Artificial Lift Advisor
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/production/esp-design-studio',
  '/dashboard/apps/production/gas-lift-design-studio',
  '/dashboard/apps/production/rod-pump-design-studio',
  '/dashboard/apps/production/artificial-lift-advisor',
  // Alias route: the original Artificial Lift Designer slug renders the
  // Artificial Lift Advisor page (entitlements and pricing keep the slug).
  '/dashboard/apps/production/artificial-lift-designer',
];
