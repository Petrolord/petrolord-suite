// Cold-load paths for design-system rollout batch 4B:
// Stratigraphy Studio, Mapping & Surface Studio, Earth Modeling, Pore
// Pressure Studio
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  // each Studio and its help guide (/help is a sub-path)
  '/dashboard/apps/geoscience/stratigraphy-studio',
  '/dashboard/apps/geoscience/mapping-surface-studio',
  '/dashboard/apps/geoscience/earth-modeling',
  '/dashboard/apps/geoscience/pore-pressure-studio',
];
