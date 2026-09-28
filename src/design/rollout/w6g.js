// Cold-load paths for design-system rollout batch 6G:
// Super admin console, Admin centre, Seed apps, Master apps viewer, System
// health, Create user, Profile, /mobile shell
//
// Add each migrated route prefix here (for example
// '/dashboard/apps/reservoir/material-balance-studio'); every sub-path
// under a prefix is themed too. Only this batch edits this file; the
// rollout index aggregates it (docs/scope/DesignSystem.md section 4).
export default [
  '/super-admin',
  '/admin-create-user',
  '/admin/system-health',
  '/admin/center',
  '/admin/seed-apps',
  '/admin/master-apps-viewer',
  '/profile',
  // covers /mobile/dashboard, /projects, /tasks, /notifications and /profile
  '/mobile',
];
