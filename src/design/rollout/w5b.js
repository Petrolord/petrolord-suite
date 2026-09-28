// Cold-load paths for design-system rollout batch 5B:
// Storage Tank & Venting, Compressor Station, Separator & Slug Catcher,
// Pump Station, Relief & Flare, Produced Water Treatment, Flow Metering,
// Gas Processing
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/facilities/storage-tank-designer',
  '/dashboard/apps/facilities/compressor-station-designer',
  '/dashboard/apps/facilities/separator-slug-catcher-designer',
  '/dashboard/apps/facilities/pump-station-designer',
  '/dashboard/apps/facilities/relief-blowdown-sizer',
  '/dashboard/apps/facilities/produced-water-treatment',
  '/dashboard/apps/facilities/flow-metering-designer',
  '/dashboard/apps/facilities/gas-treating-dehydration',
];
