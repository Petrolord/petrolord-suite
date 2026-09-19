# 2026-09-19: anon could read and write 87 public tables (RLS off)

Status: **FIX PREPARED, NOT APPLIED.** Owner-run, second engineer review
required (shared project `ssyckywijlrkgcwvkwlr`, Suite and HSE tables).

| Artifact | Path |
|---|---|
| Migration A (emergency) | `supabase/migrations/20260919160000_security_a_revoke_anon_rls_off_tables.sql` |
| Migration B (proper fix) | `supabase/migrations/20260919170000_security_b_rls_client_used_tables.sql` |
| Owner apply script | `tools/security/anon-rls/apply.sh` (`verify`, `dry-run`, `apply-a`, `apply-b`) |
| Read-only verification | `tools/security/anon-rls/verify.sql`, `owner-probe.sql` |
| Scratch rehearsal | `tools/security/anon-rls/scratch/run.sh` (Postgres 16, role probes, expected output) |
| Rollback | `tools/security/anon-rls/rollback-A.sql`, `rollback-B.md` |
| Default-privileges proposal | `tools/security/anon-rls/proposed-default-privileges.sql` (NOT a migration) |

## 1. What was found (verified live 2026-09-19)

- **87** tables in `public` (the brief said 88; the CSV has 87 data rows
  plus a header) have `relrowsecurity = false` and `anon` holds SELECT,
  INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on every one
  (owner and grantor `postgres`). This is what is left of the 121 the
  commerce migration (20260916103000) counted; its §7 question 4 is this
  sweep.
- 14 hold rows; see the table in section 3. Exact counts were read with
  `count(*)`, never row contents.
- **Proven from outside** with the publishable key that ships in the SPA
  (read-only GETs, 2026-09-19):
  - `GET /rest/v1/badge_definitions?select=id,name,rarity&limit=3` returned 200 and three
    catalogue rows ("Safety Starter", "Safety Sentinel", "Safety Scout").
  - count-only (`Prefer: count=exact`, `Range: 0-0`, `select=id`):
    `payment_audit_log` 206 `0-0/3`, `studio_users` 0-0/2,
    `email_templates` 0-0/6, `safety_moment_views` 0-0/173,
    `pm_deliverables` 0-0/7, `portfolios` 0-0/3. No contents printed.
  - The same grants allow INSERT/UPDATE/DELETE; not exercised (no writes).
- **Who uses the project:** Suite and petrolord-hse (both ship
  `ssyckywijlrkgcwvkwlr`). **NextGen does not**: it is its own project
  (`txcsbtvcdaqmkjjbhbeg`) and has no reference to this one, so its
  `apps` / `system_settings` references are to different tables.
- `pg_graphql` is NOT installed, so `graphql_public` exposes nothing;
  the grants fix covers the REST surface, which is the only one.

## 2. How usage was established (step 1)

For each table: `git grep` of `.from('<t>')` and of the bare name in
Suite `src/` + `supabase/functions/` (origin/main 3e5506561) and HSE
`src/` + `supabase/functions/` (origin/main b902e79, which includes HSE
#14); PostgREST embeds (`x:<t>(...)`, which a `.from` grep misses, and
which found `permit_approvals`); an **import-closure walk** from each
SPA's `main.jsx` (static and `lazy(() => import())`) to separate live code
from dead services; the same walk from every HSE public route
(`/`, `/pricing`, `/login`, `/signup`, `/observe/:token`, `/accept-invite/:token`,
`/payment/verify`, auth callbacks) and the app-wide providers; and on the
live catalogue every function body, view, trigger and policy that names
the table. Edge functions: the only one touching any of the 87 is
`payment_audit_log`, always with the service role.

**Result: no unauthenticated reader or writer of any of the 86 tables
exists** (the HSE public closure touches none of them; the Suite PM and
portfolio apps are behind `ProtectedAppRoute`). So Migration A has **no
anon SELECT exceptions.**

33 tables are used by signed-in clients; 53 are used by no client (no
reference at all, dead code no route reaches, or service-role only).

## 3. Per-table audit

Scope columns: the org/user/project columns present. "Unauth" = any
unauthenticated use found. S/I/U/D = the verbs Migration B grants.

| Table | Rows | Scope columns | Used by | Unauth | Migration A | Migration B |
|---|---:|---|---|---|---|---|
| `spatial_ref_sys` | 8500 | (none) | PostGIS system catalogue | no | **excluded** (extension-owned reference data) | - |
| `safety_moment_views` | 173 | user_id | HSE `safetyMomentService.trackView` (insert) | no | anon revoked; RLS stays off | RLS on: own; S/I |
| `safety_moment_downloads` | 50 | user_id | HSE `safetyMomentService.trackDownload` (insert) | no | anon revoked; RLS stays off | RLS on: own; S/I |
| `pm_deliverables` | 7 | project_id, created_by | Suite Project Management Pro: `ProjectManagementPro.jsx`, 5 project wizards, `integrations/*` (select/insert/update) | no | anon revoked; RLS stays off | RLS on: via projects; S/I/U; created_by = caller |
| `badge_definitions` | 6 | (none) | HSE `gamificationService.js` <- TopBar, BadgesDisplay (select) | no | anon revoked; RLS stays off | RLS on: authenticated read (catalogue) |
| `email_templates` | 6 | (none) | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `templates` | 6 | is_global, organization_id | HSE `templateService.js` <- ReportTemplates (select); FK from `incidents` | no | anon revoked; RLS stays off | RLS on: read global / null-org / own-org |
| `apps` | 4 | (none) | Suite `pages/admin/SystemHealth.jsx` (super admin, count only) | no | anon revoked; RLS stays off | RLS on: authenticated read (catalogue) |
| `payment_audit_log` | 3 | created_by | service role only: Suite edge fns `verify-paystack-payment`, `_shared/nextgen-bridge.ts` (insert) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `portfolios` | 3 | user_id | Suite Capital Portfolio Studio + Decision Studio (full CRUD) | no | anon revoked; RLS stays off | RLS on: own rows, full CRUD |
| `studio_users` | 2 | (none) | no code in Suite/HSE/NextGen (the studio gateway uses a service key); 2 rows of names + e-mails | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `cementing_simulation_projects` | 1 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `frac_completion_projects` | 1 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `geomechanics_projects` | 1 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `access_logs` | 0 | user_id, organization_id | HSE `services/accessControlService.js` <- security/AccessControl (select) | no | anon revoked; RLS stays off | RLS on: org or own; S |
| `actions` | 0 | organization_id, created_by | HSE `services/actionsService.js` <- ActionTrackingModule (select/update); `predictiveAnalyticsService.js` (select) | no | anon revoked; RLS stays off | RLS on: org; S/U |
| `ai_insights` | 0 | org_id | HSE `predictiveAnalyticsService.js` (insert) | no | anon revoked; RLS stays off | RLS on: org; S/I |
| `asset_summary` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `behavioral_anomalies` | 0 | user_id, organization_id | dead HSE `behavioralAnalyticsService.js` (no importer) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `benchmarking_data` | 0 | organization_id | HSE `benchmarkingService.js` <- BenchmarkingDashboard (select) | no | anon revoked; RLS stays off | RLS on: org; S |
| `branding_audit_log` | 0 | organization_id, performed_by | HSE `settingsService.js` <- admin/branding (select/insert) | no | anon revoked; RLS stays off | RLS on: org admins S/I; performed_by = caller |
| `branding_presets` | 0 | organization_id, created_by | HSE `settingsService.js` <- BrandingTheme (select/insert/delete) | no | anon revoked; RLS stays off | RLS on: members read; org admins I/U/D; created_by = caller |
| `data_quality_metrics` | 0 | organization_id | HSE `dataQualityService.js` <- DataQualityDashboard (select) | no | anon revoked; RLS stays off | RLS on: org; S |
| `feature_flags` | 0 | (none) | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `feedback` | 0 | organization_id, user_id | HSE `feedbackService.js` <- FeedbackModal/FeedbackDashboard (insert/select) | no | anon revoked; RLS stays off | RLS on: org; S/I; user_id = caller |
| `help_feedback` | 0 | user_id | HSE `helpService.js` <- SupportContact (insert) | no | anon revoked; RLS stays off | RLS on: own; S/I |
| `integration_logs` | 0 | org_id | HSE `integrationService.js` <- APIDashboard, which no route reaches | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `key_personnel` | 0 | organization_id, user_id | HSE `hooks/useOrganizationData.js` <- QuickReportPreview (select); upsert only in dead `organizationSetupService.js` | no | anon revoked; RLS stays off | RLS on: org; S |
| `model_versions` | 0 | organization_id | HSE `modelService.js` <- ModelRetrainingPanel (select) | no | anon revoked; RLS stays off | RLS on: org; S |
| `organization_assets` | 0 | organization_id | HSE `organizationService.js` <- OrganizationAssets etc. (full CRUD) | no | anon revoked; RLS stays off | RLS on: org; full CRUD |
| `payment_notifications` | 0 | (none) | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `permit_approvals` | 0 | (none) | HSE `permitsService.getPermitById` embed `approvals:permit_approvals(*)` (select) | no | anon revoked; RLS stays off | RLS on: via work_permits; S |
| `permit_templates` | 0 | organization_id, created_by | HSE `permitsService.js` (select) | no | anon revoked; RLS stays off | RLS on: org; S |
| `petrophysics_channels` | 0 | project_id, created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `petrophysics_messages` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `petrophysics_notifications` | 0 | user_id, project_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `petrophysics_wiki_pages` | 0 | project_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `phishing_results` | 0 | user_id, organization_id | dead HSE `phishingService.js` (no importer) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `phishing_simulations` | 0 | organization_id | dead HSE `phishingService.js` (no importer) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `pm_app_integrations` | 0 | project_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `pm_integration_logs` | 0 | project_id | Suite `projectmanagement/AppIntegrationDashboard.jsx` (select) | no | anon revoked; RLS stays off | RLS on: via projects; S |
| `pm_resource_assignments` | 0 | (none) | Suite `ResourceAssignment.jsx`, `ResourcesDashboard.jsx` (select/insert/delete) | no | anon revoked; RLS stays off | RLS on: via pm_resources; S/I/D |
| `pm_resources` | 0 | project_id | Suite PM Pro: `ResourceForm.jsx`, wizards, `PortfolioAnalyticsDashboard.jsx`, embed in `services/SupabaseService.js` (select/insert/update) | no | anon revoked; RLS stays off | RLS on: via projects; S/I/U |
| `portfolio_projects` | 0 | user_id | Suite Capital Portfolio Studio + Decision Studio (full CRUD) | no | anon revoked; RLS stays off | RLS on: own rows, full CRUD |
| `portfolio_scenario_projects` | 0 | portfolio_id, project_id, user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `portfolio_snapshots` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `positions` | 0 | organization_id | HSE `useOrganizationData.js` (select); insert only in dead `organizationSetupService.js` | no | anon revoked; RLS stays off | RLS on: org; S |
| `project_issues` | 0 | project_id | Suite PM Pro `IssueForm.jsx`, `ProjectManagementPro.jsx` (select/insert/update) | no | anon revoked; RLS stays off | RLS on: via projects; S/I/U |
| `project_members` | 0 | project_id, user_id | no client code; read by SECURITY INVOKER `is_project_member`/`can_edit_project` behind the `cases` policies | no | anon revoked; RLS stays off | RLS on: read own rows |
| `quickvol_activity_logs` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `quickvol_comments` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `quickvol_ml_models` | 0 | user_id, project_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `quickvol_predictions` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `quickvol_versions` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `quickvol_workspace_members` | 0 | workspace_id, user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `quickvol_workspaces` | 0 | owner_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 2 legacy policies go live | authenticated revoked |
| `report_shares` | 0 | shared_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `retraining_jobs` | 0 | organization_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `rto_projects` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `safety_moment_shares` | 0 | shared_by | HSE `safetyMomentService.shareMoment` (insert) | no | anon revoked; RLS stays off | RLS on: own (shared_by); S/I |
| `safety_points` | 0 | user_id, organization_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `safety_scores` | 0 | org_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `scenario_comparisons` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `scheduled_safety_moments` | 0 | scheduled_by | HSE `safetyMomentService.scheduleMoment`, which nothing calls | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `security_knowledge_assessments` | 0 | user_id, organization_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `security_profiles` | 0 | user_id, organization_id | HSE `securityRiskService.js` <- SecurityDashboard (select) | no | anon revoked; RLS stays off | RLS on: org or own; S (owner Q) |
| `security_training` | 0 | user_id, organization_id | HSE `trainingService.js` (select) | no | anon revoked; RLS stays off | RLS on: org or own; S (owner Q) |
| `sip_faults` | 0 | created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_horizons` | 0 | created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_jobs` | 0 | project_id, created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_projects` | 0 | organization_id, created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_surveys` | 0 | project_id, created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_uploads` | 0 | created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_versions` | 0 | workspace_id, created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_volumes` | 0 | created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `sip_workspaces` | 0 | project_id, created_by | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `system_settings` | 0 | (none) | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `template_usage` | 0 | organization_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `torque_drag_projects` | 0 | user_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy**; 1 legacy policy go live | authenticated revoked |
| `user_badges` | 0 | user_id, organization_id | HSE `gamificationService.js` (select) | no | anon revoked; RLS stays off | RLS on: own or org; S |
| `user_positions` | 0 | user_id, organization_id | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `vulnerabilities` | 0 | organization_id | dead HSE `vulnerabilityService.js` (no importer) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `webhooks` | 0 | org_id | HSE `integrationService.js` <- APIDashboard, which no route reaches | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `work_permits` | 0 | organization_id, created_by | HSE `permitsService.js`, `contractorService.js`, `PermitForm.jsx` (select/insert/update) | no | anon revoked; RLS stays off | RLS on: org; S/I/U; created_by = caller |
| `workflow_executions` | 0 | (none) | HSE `workflowService.js` <- WorkflowDashboard, which no route reaches | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `workflow_steps` | 0 | (none) | **no code reference** (Suite, HSE, edge fns, DB fns/views) | no | anon revoked; **RLS on, no policy** | authenticated revoked |
| `workflows` | 0 | org_id, created_by | HSE `workflowService.js` <- WorkflowDashboard, which no route reaches | no | anon revoked; **RLS on, no policy** | authenticated revoked |

## 4. What the migrations do

**Migration A (emergency, minimal risk).** `revoke all` from `anon` on
the 86 (spatial_ref_sys excluded); `enable row level security` (no
policy) on the 53 no client uses; and `revoke execute ... from public,
anon` (re-granting `authenticated`, `service_role`) on six SECURITY
DEFINER functions with no unauthenticated caller:
`get_users_for_organization` (returned any org's member e-mails and
last sign-in to anon), `manual_verify_quote` (provisions paid
entitlements), `can_user_access_app`, `get_user_subscribed_modules`,
`get_constraint_def`, `get_app_seat_usage_db`. `authenticated` grants on
tables are untouched, so every signed-in flow behaves exactly as today.
Enabling RLS on the 53 makes 15 legacy policies live; they only narrow
access, and the tables have no client.

**Migration B (proper fix).** On the 33 client-used tables: revoke all
from anon and authenticated, grant authenticated only the verbs the live
code uses (TRUNCATE/REFERENCES/TRIGGER go everywhere; DELETE only where
the app deletes: portfolios, portfolio_projects, organization_assets,
branding_presets, pm_resource_assignments), enable RLS, and add 57
policies `to authenticated` using the existing helpers `is_org_member`,
`has_org_role`, `is_super_admin` (organization_members is the membership
table; `is_org_member` honours `status`, so invited members see nothing).
Attribution columns cannot be forged (`coalesce(col, auth.uid()) =
auth.uid()`, the AS14/AS15 rule). Suite PM tables are scoped by
`exists (select 1 from projects p where p.id = <t>.project_id)`, which
inherits the RLS already on `projects` (owner, or the legacy admin claim),
so a PM row is visible exactly when its project is. The 7 legacy policies
on these tables are replaced by `authenticated`-only equivalents. On the
53 dead tables B revokes `authenticated` too, and it takes
`manual_verify_quote` away from `authenticated` (all four callers are
service-role edge functions).

## 5. Proof

**Rollback-wrapped dry runs on linked production** (`apply.sh dry-run`;
`begin; <migration>; <verify.sql>; rollback;`):

| Check | Before | After A | After A+B |
|---|---|---|---|
| client 33: rls_on / anon_any / auth_select / auth_write / auth_truncate / policies | 0/33/33/33/33/7 | 0/0/33/33/33/7 | 33/0/33/17/0/57 |
| dead 53: same | 0/53/53/53/53/22 | 53/0/53/53/53/22 | 53/0/0/0/0/22 |
| anon SELECT probe on 86 (readable / denied / errored) | 86/0/0 | 0/78/8 | 0/78/8 |
| six definer fns, anon EXECUTE | 6 | 0 | 0 |
| public tables RLS-off and anon-reachable | 87 | 1 (spatial_ref_sys) | 1 |

"errored" = 42P17: eight dead tables carry legacy self-referencing
policies (quickvol_*, petrophysics_channels/messages/wiki_pages via
`petrophysics_team_members`) that PostgreSQL expands, and fails on,
before the privilege check. Nothing is readable either way.

**Owner probe inside the A+B dry run** (`owner-probe.sql`, counts only):
every owner of live rows still sees all of them (portfolios 2 owners,
pm_deliverables 1, safety_moment_views 4, safety_moment_downloads 3; 0
lost rows); a stranger sees 0; any signed-in user reads templates 6/6,
badge_definitions 6/6, apps 4/4; `payment_audit_log` is refused to
`authenticated`.

**Scratch rehearsal** (`scratch/run.sh`, Postgres 16, live table shapes
and legacy policies, each migration applied twice): after A, anon is
refused read/insert/update/truncate while a signed-in user still reads
both orgs' permits (behaviour unchanged, which is why B exists) and
service_role still writes the dead table; after B, cross-project and
cross-org inserts, forged `created_by`/`user_id`, moving a permit to
another org, org2 updating org1 rows, engineers writing branding presets
and deletes where the app never deletes are all refused; invited members
see nothing; the super admin reads across orgs but cannot write into an
org it is not in. Output is pinned in `probes.expected*`.

## 6. Owner steps (in order)

1. Second engineer reviews Migration A (this doc, section 3, is the
   evidence). A changes nothing for signed-in users.
2. From the linked Suite checkout on `main` after merge:
   `tools/security/anon-rls/apply.sh apply-a` (verify, dry run, typed
   confirmation, apply, verify, optional HTTP probe with
   `SUPABASE_ANON_KEY` set: expect 401 on badge_definitions).
3. Mark the MIGRATIONS.md row for A applied.
4. Second engineer reviews Migration B, especially the owner questions
   below. Staging and production share this database, so B cannot be
   staged on its own: the proof is the prod dry run plus the scratch
   rehearsal.
5. In a quiet window: `tools/security/anon-rls/apply.sh apply-b`, then
   straight away click through, signed in as a normal (non super admin)
   user: Suite Project Management Pro (open a project, add a deliverable,
   resource and issue, assign and remove a resource), Capital Portfolio
   Studio and Decision Studio (list, create, edit, delete); HSE work
   permits (create, open, edit), branding presets as an org admin,
   organization assets, report templates, safety moment view/download/
   share, feedback modal, help thumbs, badges, actions. If one breaks,
   roll back THAT table only (`rollback-B.md`). Mark B's row applied.
6. Decide on `proposed-default-privileges.sql` (section 8).

## 7. Owner questions (left as the safest reading in B)

- `security_profiles`, `security_training`: B lets org members read
  (matching today's org dashboard). Admin-only may be intended.
- `key_personnel`, `positions`: B is read-only; their writers live in the
  dead `organizationSetupService.js`. If that setup flow is revived it
  needs an admin write policy.
- `scheduled_safety_moments` is treated as dead (`scheduleMoment` has no
  caller); if scheduling ships, it needs a policy (scope via `team_id` ->
  departments is unclear).
- The 53 dead tables: candidates to DROP (legacy Horizons tables:
  `sip_*`, `quickvol_*`, `petrophysics_channels/messages/wiki_pages`, the
  five `*_projects` calculators, etc.). Not done here.

## 8. Revoke-by-default (proposal only, not applied)

`pg_default_acl` for `postgres` (and `supabase_admin`) in `public` grants
`anon` `arwdDxtm` on every new table, `rwU` on sequences and `X` on
functions. That default is how all 87 happened. The proposal
(`tools/security/anon-rls/proposed-default-privileges.sql`) revokes the
`postgres` defaults for `anon`, keeping `authenticated`, plus a CI check
that any migration creating a public table enables RLS in the same file.

## 9. Also found, NOT fixed here (report for the owner)

1. **CRITICAL: `add_user_to_organization(p_user_id, p_org_id, p_role)`**
   is SECURITY DEFINER, executable by anon and authenticated, with **no
   check at all**: any caller can put any existing user into any org with
   any role, including `owner`, which then passes `is_org_member` and
   `has_org_role` everywhere. Not revoked: HSE `InvitationAcceptance`
   calls it right after `signUp`, possibly without a session, so revoking
   anon could break invitation acceptance. The fix is a redesign (accept
   by invitation token inside the function, role from the invitation).
2. **`invitations` (shared table) has live policies "Public can view
   invitations" (SELECT `true`) and "Public can update invitation by
   token" (UPDATE `true`)** with anon grants: anyone can read every
   invitation including its `token`, and rewrite it. 1 row today, not
   pending (confirmed by an anon count-only GET). Shared table: needs the
   second engineer; the fix pairs with item 1.
3. `enable_hse_for_organization(p_user_id)` (definer, anon-executable)
   trusts a caller-supplied user id: anyone knowing an org admin's uid can
   switch on HSE Free for that org. Low impact; should use `auth.uid()`.
4. RLS-on tables with permissive `{public}` `true` policies: 
   `leaderboard_scores` (ALL true), `custom_fields` and `custom_workflows`
   (ALL true, 0 rows), `incident_comments` (SELECT true), `organization_branding`
   (SELECT true), `drilling_incidents` (SELECT true), insert-only `true`
   on `demo_requests`, `nextgen_registrations`, `access_audit_log`,
   `organization_audit_logs`, `quick_report_*`, `user_notifications`,
   `incident_attachments`, `mem_activity_log`, `petrophysics_activity_log`.
   Most are empty or intentionally public forms; `leaderboard_scores`,
   `custom_fields`, `custom_workflows` should be scoped.
5. Live bug: `petrophysics_team_members`' policies are self-recursive
   (42P17 on any signed-in query of it or of tables whose policies read
   it); `quickvol_workspace_members` likewise, and its "view" policy
   compares `m.workspace_id = m.workspace_id`.
6. `net.http_get/post/delete` (pg_net) are executable by anon; harmless
   while `net` is not an exposed API schema, but worth revoking.
