# Admin console, profile and mobile shell: status

Pages: Super admin console (`/super-admin`), Admin centre (`/admin/center`),
Seed tools (`/admin/seed-apps`), Master apps viewer
(`/admin/master-apps-viewer`), System health (`/admin/system-health`),
Admin create user (`/admin-create-user`), Profile (`/profile`) and the
`/mobile` shell (dashboard, projects, tasks, notifications, profile).

## 2026-09-28: design system rollout, batch W6G

- Each page wraps itself in `ThemedApp`: `AccountScope` from the W1E account
  chrome (`src/components/account/accountChrome.jsx`, not edited) for the
  admin pages and profile, and `ThemedApp` inside `MobileLayout` for the
  five mobile pages. Opens light; dark is the per-user choice from the
  header `ThemeToggle` (the admin centre has it in the sidebar header and
  in a new phone bar; profile has it in the card header; the mobile shell
  has a slim top bar with it).
- Routes registered in `src/design/rollout/w6g.js`.
- Classes moved to `pl-*` roles in the pages and their own files:
  `AddAppModal`, `EmergencyAccessModal` (super admin only),
  `MasterAppsManager`, `BuildHistoryAdmin`, `AdminModuleAccessDiagnostics`
  (admin centre only) and `AdminSeedApps` (batch-local).
- `AdminSeedApps` now exports `AdminSeedAppsPanel`; the admin centre
  lazy-loads the panel (inside its own scope), and the `/admin/seed-apps`
  route renders the panel with its own scope and header.
- Status is colour with a word: system health tiles (`StatTile status`) and
  the integrity table (`Action Needed` / `Healthy` badges with icons),
  organisation status, audit actions, build-history actions, access and
  orphan badges, mobile project status (the project list's colour dot is now
  a badge with the status word), notification type (screen-reader word).
- No change to any database write, edge function call, impersonation or
  auth call. Layout-only fixes: admin centre main panel scrolls (it was
  `overflow-hidden`, so a long registry was cut off); filter rows stack at
  phone width; entitlement rows wrap on phones.
- Test: `src/pages/__tests__/W6gAdminPages.theme.test.jsx` (describeAppTheme
  per page plus the entitlements, add-app, emergency-access and delete
  dialogs, the admin centre panels and phone menu, both profile states and
  every mobile page).

### Open (not changed by W6G)

- The admin centre's phone menu sheet is empty (a pre-existing
  "Replicated nav" placeholder), so on phones only the default registry
  panel is reachable.
- `AdminCreateUser` hard-codes two personal accounts and their passwords in
  the batch-create button (pre-existing); worth removing in a separate,
  reviewed change.
