// Cold-load paths for design-system rollout batch 3F:
// Data export, Audit logs, Teams, Bulk import, App analytics, Quote
// dashboard, Get quote
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/dashboard/data-export',
  '/dashboard/audit-logs',
  '/dashboard/teams',
  '/dashboard/bulk-import',
  '/dashboard/analytics',
  '/dashboard/quote',
  '/dashboard/get-quote',
];
