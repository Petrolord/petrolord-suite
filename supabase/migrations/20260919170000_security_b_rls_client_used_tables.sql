-- SECURITY: row level security for the 33 client-used tables Migration A
-- left open to authenticated, and authenticated taken off the 53 dead ones.
--
-- Migration B of two. APPLY ONLY AFTER 20260919160000 (Migration A) and
-- after a SECOND ENGINEER'S REVIEW (shared project; Suite and HSE tables).
-- OWNER-RUN via tools/security/anon-rls/apply.sh. Audit:
-- docs/security/2026-09-19-anon-rls-exposure.md.
--
-- After A, anon holds nothing on these tables, but every signed-in user of
-- ANY organization can still read and write every row of them (RLS off).
-- This migration scopes each one to the way its live code uses it:
--
--   * helpers are the existing ones: public.is_org_member(org) (reads
--     organization_members, honours status), public.has_org_role(org,
--     roles), public.is_super_admin();
--   * authenticated gets exactly the verbs the live code uses (revoke
--     all, then grant), so TRUNCATE/REFERENCES/TRIGGER and unused verbs
--     go; no delete policy unless the app deletes;
--   * an insert that stamps an attribution column (created_by, user_id,
--     shared_by, performed_by) may only stamp the caller (or leave it
--     null), the AS14/AS15 forged-write rule;
--   * Suite Project Management tables are scoped by an EXISTS on
--     public.projects, which inherits that table's own RLS (owner or the
--     legacy admin claim), so the PM tables follow their project exactly.
--
-- Then, section 3: the 53 dead tables (RLS on since A) lose their
-- authenticated grants, which also neutralises the 15 legacy policies
-- A made live there (one of them, on quickvol_workspace_members, is
-- self-referential and would raise "infinite recursion"; another lets
-- anyone insert any petrophysics notification).
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------
-- 1-2. Client-used tables
-- ---------------------------------------------------------------

-- apps: legacy app catalogue; read by the super admin SystemHealth page only. Read-only catalogue, like modules
revoke all on table public.apps from anon, authenticated;
grant select on table public.apps to authenticated;
alter table public.apps enable row level security;
drop policy if exists apps_read on public.apps;
create policy apps_read on public.apps
  for select to authenticated
  using (true);

-- pm_deliverables: Project Management Pro deliverables, scoped through public.projects (whose own RLS, owner or admin claim, the subquery inherits). No delete: the app never deletes
revoke all on table public.pm_deliverables from anon, authenticated;
grant select, insert, update on table public.pm_deliverables to authenticated;
alter table public.pm_deliverables enable row level security;
drop policy if exists pm_deliverables_project_read on public.pm_deliverables;
create policy pm_deliverables_project_read on public.pm_deliverables
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = pm_deliverables.project_id));
drop policy if exists pm_deliverables_project_insert on public.pm_deliverables;
create policy pm_deliverables_project_insert on public.pm_deliverables
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = pm_deliverables.project_id) and coalesce(created_by, auth.uid()) = auth.uid());
drop policy if exists pm_deliverables_project_update on public.pm_deliverables;
create policy pm_deliverables_project_update on public.pm_deliverables
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = pm_deliverables.project_id))
  with check (exists (select 1 from public.projects p where p.id = pm_deliverables.project_id));

-- pm_resources: Project Management Pro resources, scoped through public.projects (whose own RLS, owner or admin claim, the subquery inherits). No delete: the app never deletes
revoke all on table public.pm_resources from anon, authenticated;
grant select, insert, update on table public.pm_resources to authenticated;
alter table public.pm_resources enable row level security;
drop policy if exists pm_resources_project_read on public.pm_resources;
create policy pm_resources_project_read on public.pm_resources
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = pm_resources.project_id));
drop policy if exists pm_resources_project_insert on public.pm_resources;
create policy pm_resources_project_insert on public.pm_resources
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = pm_resources.project_id));
drop policy if exists pm_resources_project_update on public.pm_resources;
create policy pm_resources_project_update on public.pm_resources
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = pm_resources.project_id))
  with check (exists (select 1 from public.projects p where p.id = pm_resources.project_id));

-- project_issues: Project Management Pro issues, scoped through public.projects (whose own RLS, owner or admin claim, the subquery inherits). No delete: the app never deletes
revoke all on table public.project_issues from anon, authenticated;
grant select, insert, update on table public.project_issues to authenticated;
alter table public.project_issues enable row level security;
drop policy if exists project_issues_project_read on public.project_issues;
create policy project_issues_project_read on public.project_issues
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_issues.project_id));
drop policy if exists project_issues_project_insert on public.project_issues;
create policy project_issues_project_insert on public.project_issues
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_issues.project_id));
drop policy if exists project_issues_project_update on public.project_issues;
create policy project_issues_project_update on public.project_issues
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_issues.project_id))
  with check (exists (select 1 from public.projects p where p.id = project_issues.project_id));

-- pm_integration_logs: read-only in the app
revoke all on table public.pm_integration_logs from anon, authenticated;
grant select on table public.pm_integration_logs to authenticated;
alter table public.pm_integration_logs enable row level security;
drop policy if exists pm_integration_logs_project_read on public.pm_integration_logs;
create policy pm_integration_logs_project_read on public.pm_integration_logs
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = pm_integration_logs.project_id));

-- pm_resource_assignments: scoped through pm_resources, hence projects. The app inserts and deletes, never updates
revoke all on table public.pm_resource_assignments from anon, authenticated;
grant select, insert, delete on table public.pm_resource_assignments to authenticated;
alter table public.pm_resource_assignments enable row level security;
drop policy if exists pm_resource_assignments_read on public.pm_resource_assignments;
create policy pm_resource_assignments_read on public.pm_resource_assignments
  for select to authenticated
  using (exists (select 1 from public.pm_resources r where r.id = pm_resource_assignments.resource_id));
drop policy if exists pm_resource_assignments_insert on public.pm_resource_assignments;
create policy pm_resource_assignments_insert on public.pm_resource_assignments
  for insert to authenticated
  with check (exists (select 1 from public.pm_resources r where r.id = pm_resource_assignments.resource_id));
drop policy if exists pm_resource_assignments_delete on public.pm_resource_assignments;
create policy pm_resource_assignments_delete on public.pm_resource_assignments
  for delete to authenticated
  using (exists (select 1 from public.pm_resources r where r.id = pm_resource_assignments.resource_id));

-- portfolios: Capital Portfolio Studio and Decision Studio. The legacy owner policy (inert while RLS was off) becomes live, restated for authenticated only
revoke all on table public.portfolios from anon, authenticated;
grant select, insert, update, delete on table public.portfolios to authenticated;
alter table public.portfolios enable row level security;
drop policy if exists "Users can manage their own portfolios" on public.portfolios;
drop policy if exists portfolios_own on public.portfolios;
create policy portfolios_own on public.portfolios
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- portfolio_projects: Capital Portfolio Studio and Decision Studio. The legacy owner policy (inert while RLS was off) becomes live, restated for authenticated only
revoke all on table public.portfolio_projects from anon, authenticated;
grant select, insert, update, delete on table public.portfolio_projects to authenticated;
alter table public.portfolio_projects enable row level security;
drop policy if exists "Users can manage their own portfolio projects" on public.portfolio_projects;
drop policy if exists portfolio_projects_own on public.portfolio_projects;
create policy portfolio_projects_own on public.portfolio_projects
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- project_members: no client code; read by the SECURITY INVOKER helpers is_project_member / can_edit_project behind the cases policies, which only ever look at the caller's own row. This policy keeps them exact
revoke all on table public.project_members from anon, authenticated;
grant select on table public.project_members to authenticated;
alter table public.project_members enable row level security;
drop policy if exists project_members_own_read on public.project_members;
create policy project_members_own_read on public.project_members
  for select to authenticated
  using (user_id = auth.uid());

-- access_logs: HSE AccessControl, org dashboard. Read-only; nothing in either app writes it
revoke all on table public.access_logs from anon, authenticated;
grant select on table public.access_logs to authenticated;
alter table public.access_logs enable row level security;
drop policy if exists access_logs_org_read on public.access_logs;
create policy access_logs_org_read on public.access_logs
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin() or user_id = auth.uid());

-- actions: HSE action tracking. The app reads and updates; nothing inserts or deletes
revoke all on table public.actions from anon, authenticated;
grant select, update on table public.actions to authenticated;
alter table public.actions enable row level security;
drop policy if exists actions_org_read on public.actions;
create policy actions_org_read on public.actions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists actions_org_update on public.actions;
create policy actions_org_update on public.actions
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ai_insights: HSE predictive analytics writes a best-effort insight row
revoke all on table public.ai_insights from anon, authenticated;
grant select, insert on table public.ai_insights to authenticated;
alter table public.ai_insights enable row level security;
drop policy if exists ai_insights_org_read on public.ai_insights;
create policy ai_insights_org_read on public.ai_insights
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_super_admin());
drop policy if exists ai_insights_org_insert on public.ai_insights;
create policy ai_insights_org_insert on public.ai_insights
  for insert to authenticated
  with check (public.is_org_member(org_id));

-- badge_definitions: global gamification catalogue
revoke all on table public.badge_definitions from anon, authenticated;
grant select on table public.badge_definitions to authenticated;
alter table public.badge_definitions enable row level security;
drop policy if exists badge_definitions_read on public.badge_definitions;
create policy badge_definitions_read on public.badge_definitions
  for select to authenticated
  using (true);

-- benchmarking_data: HSE, read-only in every live code path (writers, where they exist, are dead code)
revoke all on table public.benchmarking_data from anon, authenticated;
grant select on table public.benchmarking_data to authenticated;
alter table public.benchmarking_data enable row level security;
drop policy if exists benchmarking_data_org_read on public.benchmarking_data;
create policy benchmarking_data_org_read on public.benchmarking_data
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- data_quality_metrics: HSE, read-only in every live code path (writers, where they exist, are dead code)
revoke all on table public.data_quality_metrics from anon, authenticated;
grant select on table public.data_quality_metrics to authenticated;
alter table public.data_quality_metrics enable row level security;
drop policy if exists data_quality_metrics_org_read on public.data_quality_metrics;
create policy data_quality_metrics_org_read on public.data_quality_metrics
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- model_versions: HSE, read-only in every live code path (writers, where they exist, are dead code)
revoke all on table public.model_versions from anon, authenticated;
grant select on table public.model_versions to authenticated;
alter table public.model_versions enable row level security;
drop policy if exists model_versions_org_read on public.model_versions;
create policy model_versions_org_read on public.model_versions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- permit_templates: HSE, read-only in every live code path (writers, where they exist, are dead code)
revoke all on table public.permit_templates from anon, authenticated;
grant select on table public.permit_templates to authenticated;
alter table public.permit_templates enable row level security;
drop policy if exists permit_templates_org_read on public.permit_templates;
create policy permit_templates_org_read on public.permit_templates
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- key_personnel: HSE, read-only in every live code path (writers, where they exist, are dead code)
revoke all on table public.key_personnel from anon, authenticated;
grant select on table public.key_personnel to authenticated;
alter table public.key_personnel enable row level security;
drop policy if exists key_personnel_org_read on public.key_personnel;
create policy key_personnel_org_read on public.key_personnel
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- positions: HSE, read-only in every live code path (writers, where they exist, are dead code)
revoke all on table public.positions from anon, authenticated;
grant select on table public.positions to authenticated;
alter table public.positions enable row level security;
drop policy if exists positions_org_read on public.positions;
create policy positions_org_read on public.positions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- branding_presets: HSE branding. The two legacy policies (members read, admins manage) are restated for authenticated, with created_by forgery blocked
revoke all on table public.branding_presets from anon, authenticated;
grant select, insert, update, delete on table public.branding_presets to authenticated;
alter table public.branding_presets enable row level security;
drop policy if exists "Org admins can manage presets" on public.branding_presets;
drop policy if exists "Org members can read presets" on public.branding_presets;
drop policy if exists branding_presets_member_read on public.branding_presets;
create policy branding_presets_member_read on public.branding_presets
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists branding_presets_admin_insert on public.branding_presets;
create policy branding_presets_admin_insert on public.branding_presets
  for insert to authenticated
  with check ((public.has_org_role(organization_id, array['org_admin','owner','super_admin']) or public.is_super_admin()) and coalesce(created_by, auth.uid()) = auth.uid());
drop policy if exists branding_presets_admin_update on public.branding_presets;
create policy branding_presets_admin_update on public.branding_presets
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_admin','owner','super_admin']) or public.is_super_admin())
  with check (public.has_org_role(organization_id, array['org_admin','owner','super_admin']) or public.is_super_admin());
drop policy if exists branding_presets_admin_delete on public.branding_presets;
create policy branding_presets_admin_delete on public.branding_presets
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_admin','owner','super_admin']) or public.is_super_admin());

-- branding_audit_log: HSE branding audit trail. Legacy policies restated; append-only, performed_by cannot be forged
revoke all on table public.branding_audit_log from anon, authenticated;
grant select, insert on table public.branding_audit_log to authenticated;
alter table public.branding_audit_log enable row level security;
drop policy if exists "Org admins can read audit log" on public.branding_audit_log;
drop policy if exists "Org admins can insert audit log" on public.branding_audit_log;
drop policy if exists branding_audit_log_admin_read on public.branding_audit_log;
create policy branding_audit_log_admin_read on public.branding_audit_log
  for select to authenticated
  using (public.has_org_role(organization_id, array['org_admin','owner','super_admin']) or public.is_super_admin());
drop policy if exists branding_audit_log_admin_insert on public.branding_audit_log;
create policy branding_audit_log_admin_insert on public.branding_audit_log
  for insert to authenticated
  with check ((public.has_org_role(organization_id, array['org_admin','owner','super_admin']) or public.is_super_admin()) and coalesce(performed_by, auth.uid()) = auth.uid());

-- feedback: HSE feedback modal (insert then select) and dashboard
revoke all on table public.feedback from anon, authenticated;
grant select, insert on table public.feedback to authenticated;
alter table public.feedback enable row level security;
drop policy if exists feedback_org_read on public.feedback;
create policy feedback_org_read on public.feedback
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists feedback_org_insert on public.feedback;
create policy feedback_org_insert on public.feedback
  for insert to authenticated
  with check (public.is_org_member(organization_id) and coalesce(user_id, auth.uid()) = auth.uid());

-- help_feedback: HSE help article thumbs; the caller's own rows
revoke all on table public.help_feedback from anon, authenticated;
grant select, insert on table public.help_feedback to authenticated;
alter table public.help_feedback enable row level security;
drop policy if exists help_feedback_own_read on public.help_feedback;
create policy help_feedback_own_read on public.help_feedback
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists help_feedback_own_insert on public.help_feedback;
create policy help_feedback_own_insert on public.help_feedback
  for insert to authenticated
  with check (coalesce(user_id, auth.uid()) = auth.uid());

-- organization_assets: HSE organization assets; the legacy member policy restated (the app deletes)
revoke all on table public.organization_assets from anon, authenticated;
grant select, insert, update, delete on table public.organization_assets to authenticated;
alter table public.organization_assets enable row level security;
drop policy if exists "Users can manage organization assets" on public.organization_assets;
drop policy if exists organization_assets_member_read on public.organization_assets;
create policy organization_assets_member_read on public.organization_assets
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists organization_assets_member_insert on public.organization_assets;
create policy organization_assets_member_insert on public.organization_assets
  for insert to authenticated
  with check (public.is_org_member(organization_id));
drop policy if exists organization_assets_member_update on public.organization_assets;
create policy organization_assets_member_update on public.organization_assets
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
drop policy if exists organization_assets_member_delete on public.organization_assets;
create policy organization_assets_member_delete on public.organization_assets
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- permit_approvals: embedded by permitsService.getPermitById (approvals:permit_approvals(*)); inherits work_permits scoping. No client writes
revoke all on table public.permit_approvals from anon, authenticated;
grant select on table public.permit_approvals to authenticated;
alter table public.permit_approvals enable row level security;
drop policy if exists permit_approvals_via_permit on public.permit_approvals;
create policy permit_approvals_via_permit on public.permit_approvals
  for select to authenticated
  using (exists (select 1 from public.work_permits wp where wp.id = permit_approvals.permit_id));

-- safety_moment_views: HSE safety moments tracking; the caller's own rows, attribution cannot be forged
revoke all on table public.safety_moment_views from anon, authenticated;
grant select, insert on table public.safety_moment_views to authenticated;
alter table public.safety_moment_views enable row level security;
drop policy if exists safety_moment_views_own_read on public.safety_moment_views;
create policy safety_moment_views_own_read on public.safety_moment_views
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists safety_moment_views_own_insert on public.safety_moment_views;
create policy safety_moment_views_own_insert on public.safety_moment_views
  for insert to authenticated
  with check (coalesce(user_id, auth.uid()) = auth.uid());

-- safety_moment_downloads: HSE safety moments tracking; the caller's own rows, attribution cannot be forged
revoke all on table public.safety_moment_downloads from anon, authenticated;
grant select, insert on table public.safety_moment_downloads to authenticated;
alter table public.safety_moment_downloads enable row level security;
drop policy if exists safety_moment_downloads_own_read on public.safety_moment_downloads;
create policy safety_moment_downloads_own_read on public.safety_moment_downloads
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists safety_moment_downloads_own_insert on public.safety_moment_downloads;
create policy safety_moment_downloads_own_insert on public.safety_moment_downloads
  for insert to authenticated
  with check (coalesce(user_id, auth.uid()) = auth.uid());

-- safety_moment_shares: HSE safety moments tracking; the caller's own rows, attribution cannot be forged
revoke all on table public.safety_moment_shares from anon, authenticated;
grant select, insert on table public.safety_moment_shares to authenticated;
alter table public.safety_moment_shares enable row level security;
drop policy if exists safety_moment_shares_own_read on public.safety_moment_shares;
create policy safety_moment_shares_own_read on public.safety_moment_shares
  for select to authenticated
  using (shared_by = auth.uid());
drop policy if exists safety_moment_shares_own_insert on public.safety_moment_shares;
create policy safety_moment_shares_own_insert on public.safety_moment_shares
  for insert to authenticated
  with check (coalesce(shared_by, auth.uid()) = auth.uid());

-- security_profiles: HSE security dashboard, read-only. OWNER QUESTION: org-wide read mirrors today's dashboard; admin-only may be preferred
revoke all on table public.security_profiles from anon, authenticated;
grant select on table public.security_profiles to authenticated;
alter table public.security_profiles enable row level security;
drop policy if exists security_profiles_org_read on public.security_profiles;
create policy security_profiles_org_read on public.security_profiles
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin() or user_id = auth.uid());

-- security_training: HSE security dashboard, read-only. OWNER QUESTION: org-wide read mirrors today's dashboard; admin-only may be preferred
revoke all on table public.security_training from anon, authenticated;
grant select on table public.security_training to authenticated;
alter table public.security_training enable row level security;
drop policy if exists security_training_org_read on public.security_training;
create policy security_training_org_read on public.security_training
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin() or user_id = auth.uid());

-- templates: HSE report templates (all 6 live rows are global)
revoke all on table public.templates from anon, authenticated;
grant select on table public.templates to authenticated;
alter table public.templates enable row level security;
drop policy if exists templates_read on public.templates;
create policy templates_read on public.templates
  for select to authenticated
  using (is_global or organization_id is null or public.is_org_member(organization_id) or public.is_super_admin());

-- user_badges: HSE gamification, read-only in the app
revoke all on table public.user_badges from anon, authenticated;
grant select on table public.user_badges to authenticated;
alter table public.user_badges enable row level security;
drop policy if exists user_badges_read on public.user_badges;
create policy user_badges_read on public.user_badges
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_super_admin());

-- work_permits: HSE work permits (PermitForm stamps organization_id and created_by). No delete: the app never deletes
revoke all on table public.work_permits from anon, authenticated;
grant select, insert, update on table public.work_permits to authenticated;
alter table public.work_permits enable row level security;
drop policy if exists work_permits_org_read on public.work_permits;
create policy work_permits_org_read on public.work_permits
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists work_permits_org_insert on public.work_permits;
create policy work_permits_org_insert on public.work_permits
  for insert to authenticated
  with check (public.is_org_member(organization_id) and coalesce(created_by, auth.uid()) = auth.uid());
drop policy if exists work_permits_org_update on public.work_permits;
create policy work_permits_org_update on public.work_permits
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------
-- 3. Dead tables: no client role at all (service_role and the table
--    owner are unaffected; payment_audit_log keeps working because its
--    only writers are service-role edge functions)
-- ---------------------------------------------------------------
revoke all privileges on table
  public.asset_summary,
  public.behavioral_anomalies,
  public.cementing_simulation_projects,
  public.email_templates,
  public.feature_flags,
  public.frac_completion_projects,
  public.geomechanics_projects,
  public.integration_logs,
  public.payment_audit_log,
  public.payment_notifications,
  public.petrophysics_channels,
  public.petrophysics_messages,
  public.petrophysics_notifications,
  public.petrophysics_wiki_pages,
  public.phishing_results,
  public.phishing_simulations,
  public.pm_app_integrations,
  public.portfolio_scenario_projects,
  public.portfolio_snapshots,
  public.quickvol_activity_logs,
  public.quickvol_comments,
  public.quickvol_ml_models,
  public.quickvol_predictions,
  public.quickvol_versions,
  public.quickvol_workspace_members,
  public.quickvol_workspaces,
  public.report_shares,
  public.retraining_jobs,
  public.rto_projects,
  public.safety_points,
  public.safety_scores,
  public.scenario_comparisons,
  public.scheduled_safety_moments,
  public.security_knowledge_assessments,
  public.sip_faults,
  public.sip_horizons,
  public.sip_jobs,
  public.sip_projects,
  public.sip_surveys,
  public.sip_uploads,
  public.sip_versions,
  public.sip_volumes,
  public.sip_workspaces,
  public.studio_users,
  public.system_settings,
  public.template_usage,
  public.torque_drag_projects,
  public.user_positions,
  public.vulnerabilities,
  public.webhooks,
  public.workflow_executions,
  public.workflow_steps,
  public.workflows
from anon, authenticated;

-- ---------------------------------------------------------------
-- 4. manual_verify_quote provisions paid entitlements. Its only callers
--    are service-role edge functions (verify-paystack-payment,
--    paystack-webhook, activate-bank-transfer, _shared/provision-quote),
--    so no signed-in user may call it either.
-- ---------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.manual_verify_quote(text, uuid)') is not null then
    revoke execute on function public.manual_verify_quote(text, uuid) from public, anon, authenticated;
    grant execute on function public.manual_verify_quote(text, uuid) to service_role;
  end if;
end $$;

commit;
