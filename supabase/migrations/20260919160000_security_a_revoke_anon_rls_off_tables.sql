-- SECURITY (EMERGENCY): take the anon role off 86 public tables that have
-- RLS DISABLED, and close RLS on the 53 of them no client uses.
--
-- Migration A of two. docs/security/2026-09-19-anon-rls-exposure.md is the
-- audit behind every line; read it first.
--
-- REQUIRES A SECOND ENGINEER'S REVIEW BEFORE APPLY (shared project,
-- touches tables used by the Suite AND petrolord-hse). OWNER-RUN via
-- tools/security/anon-rls/apply.sh; never hand-typed.
--
-- What was found, read live 2026-09-19 from pg_class and
-- has_table_privilege():
--
--   87 tables in schema public have relrowsecurity = false AND anon
--   holds SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every one.
--   anon is the role behind the publishable key shipped in both SPAs,
--   so every one of them is readable and writable over /rest/v1 by
--   anyone on the internet (proven with read-only GETs, see the doc).
--   14 hold rows (spatial_ref_sys 8500, safety_moment_views 173,
--   safety_moment_downloads 50, pm_deliverables 7, badge_definitions 6,
--   email_templates 6, templates 6, apps 4, payment_audit_log 3,
--   portfolios 3, studio_users 2, three *_projects tables 1 each).
--
-- What this migration does, and why it cannot break a signed-in flow:
--
--   1. REVOKES EVERY PRIVILEGE anon holds on 86 of the 87 tables
--      (spatial_ref_sys, the PostGIS system catalogue, is left alone:
--      it is public reference data owned by the extension).
--      Step 1 of the audit found NO legitimate unauthenticated reader or
--      writer of any of the 86 (Suite src + edge functions, HSE src +
--      edge functions at HSE origin/main b902e79, the public-route import
--      closure of both SPAs, every DB function, view, trigger and
--      policy). NextGen uses a different Supabase project. So there are
--      no SELECT exceptions.
--      The authenticated and service_role grants are NOT touched.
--
--   2. ENABLES RLS, with no new policy, on the 53 tables that no client
--      uses at all (no code reference, only dead code that no route
--      reaches, or service-role edge functions only, which bypass RLS).
--      Fifteen of them already carry legacy policies; enabling RLS makes
--      those live for authenticated callers, which only narrows access.
--      The 33 client-used tables keep RLS off here (enabling it without
--      the right policies would break live apps); Migration B scopes
--      them.
--
--   3. REVOKES anon/PUBLIC EXECUTE on six SECURITY DEFINER functions
--      that leak or grant across tenants and have no unauthenticated
--      caller (authenticated and service_role are re-granted explicitly,
--      so signed-in behaviour is unchanged). get_users_for_organization
--      returned any org's member e-mails to anon; manual_verify_quote
--      provisions paid entitlements and is only ever called by service
--      role edge functions.
--
-- Idempotent. Rollback: tools/security/anon-rls/rollback-A.sql (restores
-- the exact pre-state; only for an emergency, it re-opens the hole).

begin;

-- ---------------------------------------------------------------
-- 1. anon loses everything on the 86 tables (no exceptions found)
-- ---------------------------------------------------------------
revoke all privileges on table
  public.access_logs,
  public.actions,
  public.ai_insights,
  public.apps,
  public.asset_summary,
  public.badge_definitions,
  public.behavioral_anomalies,
  public.benchmarking_data,
  public.branding_audit_log,
  public.branding_presets,
  public.cementing_simulation_projects,
  public.data_quality_metrics,
  public.email_templates,
  public.feature_flags,
  public.feedback,
  public.frac_completion_projects,
  public.geomechanics_projects,
  public.help_feedback,
  public.integration_logs,
  public.key_personnel,
  public.model_versions,
  public.organization_assets,
  public.payment_audit_log,
  public.payment_notifications,
  public.permit_approvals,
  public.permit_templates,
  public.petrophysics_channels,
  public.petrophysics_messages,
  public.petrophysics_notifications,
  public.petrophysics_wiki_pages,
  public.phishing_results,
  public.phishing_simulations,
  public.pm_app_integrations,
  public.pm_deliverables,
  public.pm_integration_logs,
  public.pm_resource_assignments,
  public.pm_resources,
  public.portfolio_projects,
  public.portfolio_scenario_projects,
  public.portfolio_snapshots,
  public.portfolios,
  public.positions,
  public.project_issues,
  public.project_members,
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
  public.safety_moment_downloads,
  public.safety_moment_shares,
  public.safety_moment_views,
  public.safety_points,
  public.safety_scores,
  public.scenario_comparisons,
  public.scheduled_safety_moments,
  public.security_knowledge_assessments,
  public.security_profiles,
  public.security_training,
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
  public.templates,
  public.torque_drag_projects,
  public.user_badges,
  public.user_positions,
  public.vulnerabilities,
  public.webhooks,
  public.work_permits,
  public.workflow_executions,
  public.workflow_steps,
  public.workflows
from anon;

-- ---------------------------------------------------------------
-- 2. RLS on, no policy, for the 53 tables no client uses
-- ---------------------------------------------------------------
alter table public.asset_summary enable row level security;
alter table public.behavioral_anomalies enable row level security;
alter table public.cementing_simulation_projects enable row level security;
alter table public.email_templates enable row level security;
alter table public.feature_flags enable row level security;
alter table public.frac_completion_projects enable row level security;
alter table public.geomechanics_projects enable row level security;
alter table public.integration_logs enable row level security;
alter table public.payment_audit_log enable row level security;
alter table public.payment_notifications enable row level security;
alter table public.petrophysics_channels enable row level security;
alter table public.petrophysics_messages enable row level security;
alter table public.petrophysics_notifications enable row level security;
alter table public.petrophysics_wiki_pages enable row level security;
alter table public.phishing_results enable row level security;
alter table public.phishing_simulations enable row level security;
alter table public.pm_app_integrations enable row level security;
alter table public.portfolio_scenario_projects enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.quickvol_activity_logs enable row level security;
alter table public.quickvol_comments enable row level security;
alter table public.quickvol_ml_models enable row level security;
alter table public.quickvol_predictions enable row level security;
alter table public.quickvol_versions enable row level security;
alter table public.quickvol_workspace_members enable row level security;
alter table public.quickvol_workspaces enable row level security;
alter table public.report_shares enable row level security;
alter table public.retraining_jobs enable row level security;
alter table public.rto_projects enable row level security;
alter table public.safety_points enable row level security;
alter table public.safety_scores enable row level security;
alter table public.scenario_comparisons enable row level security;
alter table public.scheduled_safety_moments enable row level security;
alter table public.security_knowledge_assessments enable row level security;
alter table public.sip_faults enable row level security;
alter table public.sip_horizons enable row level security;
alter table public.sip_jobs enable row level security;
alter table public.sip_projects enable row level security;
alter table public.sip_surveys enable row level security;
alter table public.sip_uploads enable row level security;
alter table public.sip_versions enable row level security;
alter table public.sip_volumes enable row level security;
alter table public.sip_workspaces enable row level security;
alter table public.studio_users enable row level security;
alter table public.system_settings enable row level security;
alter table public.template_usage enable row level security;
alter table public.torque_drag_projects enable row level security;
alter table public.user_positions enable row level security;
alter table public.vulnerabilities enable row level security;
alter table public.webhooks enable row level security;
alter table public.workflow_executions enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflows enable row level security;

-- ---------------------------------------------------------------
-- 3. SECURITY DEFINER functions: anon and PUBLIC lose EXECUTE.
--    Functions default to EXECUTE for PUBLIC, so revoking anon alone
--    would change nothing; authenticated and service_role are
--    re-granted so no signed-in caller notices.
-- ---------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.get_users_for_organization(uuid)',
    'public.manual_verify_quote(text, uuid)',
    'public.can_user_access_app(uuid, text)',
    'public.get_user_subscribed_modules(uuid)',
    'public.get_constraint_def(text)',
    'public.get_app_seat_usage_db(uuid, text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
end $$;

commit;
