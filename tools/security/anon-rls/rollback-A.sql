-- EMERGENCY ROLLBACK of Migration A (20260919160000). RE-OPENS THE HOLE.
-- Use only if A is shown to break a live flow and the fix cannot wait;
-- prefer granting back the ONE table/verb that broke. Restores the exact
-- pre-A state read live 2026-09-19 (anon: arwdDxtm on all 86, RLS off on
-- the 53, EXECUTE for PUBLIC/anon on the six functions).
-- Roll back B first (tools/security/anon-rls/rollback-B.md) if B is applied.
begin;
grant all privileges on table
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
to anon;

alter table public.asset_summary disable row level security;
alter table public.behavioral_anomalies disable row level security;
alter table public.cementing_simulation_projects disable row level security;
alter table public.email_templates disable row level security;
alter table public.feature_flags disable row level security;
alter table public.frac_completion_projects disable row level security;
alter table public.geomechanics_projects disable row level security;
alter table public.integration_logs disable row level security;
alter table public.payment_audit_log disable row level security;
alter table public.payment_notifications disable row level security;
alter table public.petrophysics_channels disable row level security;
alter table public.petrophysics_messages disable row level security;
alter table public.petrophysics_notifications disable row level security;
alter table public.petrophysics_wiki_pages disable row level security;
alter table public.phishing_results disable row level security;
alter table public.phishing_simulations disable row level security;
alter table public.pm_app_integrations disable row level security;
alter table public.portfolio_scenario_projects disable row level security;
alter table public.portfolio_snapshots disable row level security;
alter table public.quickvol_activity_logs disable row level security;
alter table public.quickvol_comments disable row level security;
alter table public.quickvol_ml_models disable row level security;
alter table public.quickvol_predictions disable row level security;
alter table public.quickvol_versions disable row level security;
alter table public.quickvol_workspace_members disable row level security;
alter table public.quickvol_workspaces disable row level security;
alter table public.report_shares disable row level security;
alter table public.retraining_jobs disable row level security;
alter table public.rto_projects disable row level security;
alter table public.safety_points disable row level security;
alter table public.safety_scores disable row level security;
alter table public.scenario_comparisons disable row level security;
alter table public.scheduled_safety_moments disable row level security;
alter table public.security_knowledge_assessments disable row level security;
alter table public.sip_faults disable row level security;
alter table public.sip_horizons disable row level security;
alter table public.sip_jobs disable row level security;
alter table public.sip_projects disable row level security;
alter table public.sip_surveys disable row level security;
alter table public.sip_uploads disable row level security;
alter table public.sip_versions disable row level security;
alter table public.sip_volumes disable row level security;
alter table public.sip_workspaces disable row level security;
alter table public.studio_users disable row level security;
alter table public.system_settings disable row level security;
alter table public.template_usage disable row level security;
alter table public.torque_drag_projects disable row level security;
alter table public.user_positions disable row level security;
alter table public.vulnerabilities disable row level security;
alter table public.webhooks disable row level security;
alter table public.workflow_executions disable row level security;
alter table public.workflow_steps disable row level security;
alter table public.workflows disable row level security;

grant execute on function public.get_users_for_organization(uuid) to public, anon;
grant execute on function public.manual_verify_quote(text, uuid) to public, anon;
grant execute on function public.can_user_access_app(uuid, text) to public, anon;
grant execute on function public.get_user_subscribed_modules(uuid) to public, anon;
grant execute on function public.get_constraint_def(text) to public, anon;
grant execute on function public.get_app_seat_usage_db(uuid, text) to public, anon;
commit;
