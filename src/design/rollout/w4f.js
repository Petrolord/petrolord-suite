// Cold-load paths for design-system rollout batch 4F:
// Document Control, Peer Review Manager, Management of Change, Quality
// Assurance Plan, LOPA & SIL, Consequence Modelling, QRA
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/apps/assurance/document-control',
  '/dashboard/apps/assurance/peer-review-manager',
  '/dashboard/apps/assurance/management-of-change',
  '/dashboard/apps/assurance/qa-plan',
  '/dashboard/apps/process-safety/lopa-sil-studio',
  '/dashboard/apps/process-safety/consequence-studio',
  '/dashboard/apps/process-safety/qra-studio',
];
