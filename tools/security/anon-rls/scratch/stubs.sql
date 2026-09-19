-- Stand-ins for the live objects Migrations A and B touch, for a scratch
-- PostgreSQL only (run.sh). NEVER run against a Supabase project.
-- Table shapes (columns and types, no constraints) and the legacy
-- policies were generated from the live catalogue 2026-09-19; helper
-- bodies are copied from live (is_org_member / has_org_role honour
-- organization_members.status).
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's defaults: every new public table is granted to all three
-- API roles. This is exactly the state the live tables are in.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.organizations (id uuid primary key, name text);
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid, user_id uuid, role text, status text, joined_at timestamptz, created_at timestamptz default now());
create function public.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om where om.organization_id = is_org_member.org_id and om.user_id = auth.uid() and coalesce(lower(om.status), 'active') = 'active') $$;
create function public.has_org_role(org_id uuid, roles text[]) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.organization_members om where om.organization_id = has_org_role.org_id and om.user_id = auth.uid() and coalesce(lower(om.status), 'active') = 'active' and om.role = any (has_org_role.roles)) $$;
create function public.is_super_admin() returns boolean language plpgsql security definer as $$ begin return (select auth.uid() in (select id from auth.users where email = any(array['info@petrolord.com']))); end $$;
create function public.get_my_claim(claim text) returns text language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> claim, '')::text $$;
-- referenced by legacy policies on dead tables
create table public.petrophysics_team_members (project_id uuid, user_id uuid, role text);
create table public.saved_quickvol_projects (id uuid primary key, user_id uuid, workspace_id uuid);
-- the 86 tables and public.projects, as live
create table public.access_logs (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, access_type text, resource_accessed text, location text, access_time timestamp with time zone, access_duration integer, status text, created_at timestamp with time zone);
create table public.actions (id uuid primary key default gen_random_uuid(), organization_id uuid, title text, description text, status text, priority text, due_date timestamp with time zone, action_code text, assigned_to uuid, created_by uuid, report_id uuid, approver_id uuid, closure_comment text, meta_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, effectiveness_score integer, completion_date timestamp with time zone, root_cause_category text);
create table public.ai_insights (id uuid primary key default gen_random_uuid(), org_id uuid, type text, title text, description text, confidence_score numeric, metadata jsonb, created_at timestamp with time zone);
create table public.apps (id uuid primary key default gen_random_uuid(), module_id text, slug text, name text, description text, price numeric, status text, created_at timestamp with time zone);
create table public.asset_summary (id uuid primary key default gen_random_uuid(), asset_name text, user_id uuid, total_value numeric, total_spend numeric, rag_status text, updated_at timestamp with time zone);
create table public.badge_definitions (id character varying(50) primary key, name character varying(255), description text, icon character varying(10), requirement_type character varying(50), requirement_count integer, rarity character varying(20));
create table public.behavioral_anomalies (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, anomaly_type text, severity text, description text, detected_date timestamp with time zone, investigation_status text, investigation_notes text, insider_threat_score integer, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.benchmarking_data (id uuid primary key default gen_random_uuid(), organization_id uuid, metric_name text, org_value numeric, industry_avg numeric, top_quartile numeric, category text, period_start date, period_end date, created_at timestamp with time zone);
create table public.branding_audit_log (id uuid primary key default gen_random_uuid(), organization_id uuid, action text, changes jsonb, performed_by uuid, "timestamp" timestamp with time zone);
create table public.branding_presets (id uuid primary key default gen_random_uuid(), organization_id uuid, name text, description text, branding_config jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid);
create table public.cementing_simulation_projects (id uuid primary key default gen_random_uuid(), user_id uuid, project_name text, inputs_data jsonb, results_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.data_quality_metrics (id uuid primary key default gen_random_uuid(), organization_id uuid, overall_score numeric, completeness_score numeric, consistency_score numeric, freshness_score numeric, issues_found jsonb, checked_at timestamp with time zone);
create table public.email_templates (id uuid primary key default gen_random_uuid(), name text, subject text, body_html text, variables text[], created_at timestamp with time zone);
create table public.feature_flags (id uuid primary key default gen_random_uuid(), key text, is_enabled boolean, description text, created_at timestamp with time zone);
create table public.feedback (id uuid primary key default gen_random_uuid(), organization_id uuid, user_id uuid, target_type text, target_id uuid, rating integer, feedback_category text, comment text, created_at timestamp with time zone);
create table public.frac_completion_projects (id uuid primary key default gen_random_uuid(), user_id uuid, project_name text, inputs_data jsonb, results_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.geomechanics_projects (id uuid primary key default gen_random_uuid(), user_id uuid, project_name text, inputs_data jsonb, results_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.help_feedback (id uuid primary key default gen_random_uuid(), article_id uuid, user_id uuid, is_helpful boolean, comment text, created_at timestamp with time zone);
create table public.integration_logs (id uuid primary key default gen_random_uuid(), org_id uuid, source text, event text, status text, details jsonb, created_at timestamp with time zone);
create table public.key_personnel (id uuid primary key default gen_random_uuid(), organization_id uuid, role character varying(100), user_id uuid, assigned_at timestamp without time zone);
create table public.model_versions (id uuid primary key default gen_random_uuid(), organization_id uuid, version_number text, status text, accuracy_score numeric, precision_score numeric, recall_score numeric, f1_score numeric, training_date timestamp with time zone, dataset_size integer, created_at timestamp with time zone);
create table public.organization_assets (id uuid primary key default gen_random_uuid(), organization_id uuid, name text, asset_id text, category text, description text, location text, assigned_to text, purchase_date date, warranty_expiry date, safety_status text, safety_notes text, maintenance_schedule text, last_inspection date, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.payment_audit_log (id uuid primary key default gen_random_uuid(), payment_id uuid, action text, details jsonb, created_at timestamp with time zone, created_by text);
create table public.payment_notifications (id uuid primary key default gen_random_uuid(), payment_id uuid, notification_type text, recipient_email text, subject text, body text, sent_at timestamp with time zone, delivery_status text, created_at timestamp with time zone);
create table public.permit_approvals (id uuid primary key default gen_random_uuid(), permit_id uuid, approver_id uuid, approval_level integer, status text, comments text, rejection_reason text, approved_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.permit_templates (id uuid primary key default gen_random_uuid(), organization_id uuid, name text, description text, permit_type text, default_duration_hours integer, hazards jsonb, control_measures jsonb, ppe_requirements jsonb, emergency_procedures text, equipment_required jsonb, approval_chain jsonb, compliance_rules jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid);
create table public.petrophysics_channels (id uuid primary key default gen_random_uuid(), project_id uuid, name text, description text, type text, created_at timestamp with time zone, created_by uuid);
create table public.petrophysics_messages (id uuid primary key default gen_random_uuid(), channel_id uuid, user_id uuid, content text, created_at timestamp with time zone, attachments jsonb);
create table public.petrophysics_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, project_id uuid, type text, title text, message text, link text, is_read boolean, created_at timestamp with time zone);
create table public.petrophysics_wiki_pages (id uuid primary key default gen_random_uuid(), project_id uuid, title text, slug text, content text, category text, tags text[], last_updated_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.phishing_results (id uuid primary key default gen_random_uuid(), user_id uuid, simulation_id uuid, organization_id uuid, email_opened boolean, link_clicked boolean, reported boolean, reported_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.phishing_simulations (id uuid primary key default gen_random_uuid(), organization_id uuid, simulation_date date, email_subject text, email_body text, total_sent integer, total_clicked integer, total_reported integer, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.pm_app_integrations (id uuid primary key default gen_random_uuid(), project_id uuid, app_name text, last_sync timestamp with time zone, sync_status text, data_count integer);
create table public.pm_deliverables (id uuid primary key default gen_random_uuid(), project_id uuid, name text, app_source text, version text, status text, linked_gate uuid, linked_tasks uuid[], created_by uuid, created_at timestamp with time zone, approved_date timestamp with time zone, updated_at timestamp with time zone);
create table public.pm_integration_logs (id uuid primary key default gen_random_uuid(), project_id uuid, app_name text, action text, "timestamp" timestamp with time zone, status text);
create table public.pm_resource_assignments (id uuid primary key default gen_random_uuid(), task_id uuid, resource_id uuid, role text, allocated_hours numeric, allocation_percent numeric, start_date date, end_date date, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.pm_resources (id uuid primary key default gen_random_uuid(), project_id uuid, name text, type text, discipline text, availability_percent numeric, cost_per_day numeric, skills text[], contact_info jsonb, department text, status text, cv_url text, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.portfolio_projects (id uuid primary key default gen_random_uuid(), user_id uuid, name text, capex numeric, npv_p10 numeric, npv_p50 numeric, npv_p90 numeric, risk_score numeric, created_at timestamp with time zone, pos numeric, fail_cost numeric, npv_stddev numeric, source_type text, source_ref uuid, source_label text);
create table public.portfolio_scenario_projects (id uuid primary key default gen_random_uuid(), portfolio_id uuid, project_id uuid, user_id uuid);
create table public.portfolio_snapshots (id uuid primary key default gen_random_uuid(), user_id uuid, snapshot_date date, total_projects integer, total_budget numeric, total_actual_cost numeric, avg_cpi numeric, avg_spi numeric, risk_count integer, created_at timestamp with time zone);
create table public.portfolios (id uuid primary key default gen_random_uuid(), user_id uuid, name text, capex_limit numeric, created_at timestamp with time zone);
create table public.positions (id uuid primary key default gen_random_uuid(), organization_id uuid, department_id uuid, name character varying(255), level character varying(50), created_at timestamp without time zone);
create table public.project_issues (id uuid primary key default gen_random_uuid(), project_id uuid, title text, description text, occurred_date date, reported_date date, resolved_date date, owner text, resolution text, status text, linked_risk_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.project_members (project_id uuid, user_id uuid, role text);
create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid, name text, description text, start_date date, baseline_budget numeric, created_at timestamp with time zone, company_name text, project_type text, stage text, country text, asset text, status text, owner text, percent_complete numeric);
create table public.quickvol_activity_logs (id uuid primary key default gen_random_uuid(), scenario_id uuid, user_id uuid, action text, details jsonb, created_at timestamp with time zone);
create table public.quickvol_comments (id uuid primary key default gen_random_uuid(), scenario_id uuid, user_id uuid, content text, created_at timestamp with time zone);
create table public.quickvol_ml_models (id uuid primary key default gen_random_uuid(), user_id uuid, project_id uuid, name text, type text, target_parameter text, algorithm text, status text, metrics jsonb, feature_importance jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.quickvol_predictions (id uuid primary key default gen_random_uuid(), model_id uuid, user_id uuid, input_data jsonb, prediction_result jsonb, confidence_score numeric, created_at timestamp with time zone);
create table public.quickvol_versions (id uuid primary key default gen_random_uuid(), scenario_id uuid, user_id uuid, version_number integer, data jsonb, created_at timestamp with time zone, commit_message text);
create table public.quickvol_workspace_members (workspace_id uuid, user_id uuid, role text, joined_at timestamp with time zone);
create table public.quickvol_workspaces (id uuid primary key default gen_random_uuid(), name text, description text, owner_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.report_shares (id uuid primary key default gen_random_uuid(), report_id uuid, shared_by uuid, shared_with character varying(255), share_type character varying(50), created_at timestamp without time zone);
create table public.retraining_jobs (id uuid primary key default gen_random_uuid(), organization_id uuid, status text, triggered_by text, start_time timestamp with time zone, end_time timestamp with time zone, logs jsonb, new_model_version_id uuid, created_at timestamp with time zone);
create table public.rto_projects (id uuid primary key default gen_random_uuid(), user_id uuid, project_name text, inputs_data jsonb, results_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.safety_moment_downloads (id uuid primary key default gen_random_uuid(), moment_id uuid, user_id uuid, format text, downloaded_at timestamp with time zone);
create table public.safety_moment_shares (id uuid primary key default gen_random_uuid(), moment_id uuid, shared_by uuid, shared_with_email text, shared_at timestamp with time zone);
create table public.safety_moment_views (id uuid primary key default gen_random_uuid(), moment_id uuid, user_id uuid, viewed_at timestamp with time zone);
create table public.safety_points (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, points integer, reason character varying(255), report_id uuid, created_at timestamp with time zone);
create table public.safety_scores (id uuid primary key default gen_random_uuid(), org_id uuid, score numeric, category_breakdown jsonb, calculated_at timestamp with time zone);
create table public.scenario_comparisons (id uuid primary key default gen_random_uuid(), user_id uuid, name text, scenarios jsonb, comparison_results jsonb, created_at timestamp with time zone);
create table public.scheduled_safety_moments (id uuid primary key default gen_random_uuid(), moment_id uuid, scheduled_by uuid, scheduled_for timestamp with time zone, team_id uuid, status text, created_at timestamp with time zone);
create table public.security_knowledge_assessments (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, assessment_date date, assessment_type text, score integer, weak_areas text[], recommended_training text[], created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.security_profiles (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, security_risk_score integer, awareness_score integer, training_completion_percentage integer, last_training_date timestamp with time zone, next_training_due_date timestamp with time zone, incident_count_this_year integer, last_incident_date timestamp with time zone, compliance_status text, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.security_training (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, training_type text, training_module text, training_date date, completion_date date, status text, score integer, certificate_url text, next_training_due_date date, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.sip_faults (id uuid primary key default gen_random_uuid(), version_id uuid, volume_id uuid, name text, color text, storage_path text, metadata_jsonb jsonb, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.sip_horizons (id uuid primary key default gen_random_uuid(), version_id uuid, volume_id uuid, name text, color text, storage_path text, metadata_jsonb jsonb, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.sip_jobs (id uuid primary key default gen_random_uuid(), project_id uuid, job_type text, status text, input_jsonb jsonb, output_jsonb jsonb, error_text text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone);
create table public.sip_projects (id uuid primary key default gen_random_uuid(), organization_id uuid, name text, description text, crs_epsg integer, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone);
create table public.sip_surveys (id uuid primary key default gen_random_uuid(), project_id uuid, name text, asset_type text, domain_type text, metadata_jsonb jsonb, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone);
create table public.sip_uploads (id uuid primary key default gen_random_uuid(), survey_id uuid, file_name text, file_hash text, file_size bigint, storage_path text, status text, qc_report_jsonb jsonb, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.sip_versions (id uuid primary key default gen_random_uuid(), workspace_id uuid, parent_version_id uuid, name text, commit_message text, created_by uuid, created_at timestamp with time zone);
create table public.sip_volumes (id uuid primary key default gen_random_uuid(), survey_id uuid, source_upload_id uuid, name text, format text, storage_path text, inline_min integer, inline_max integer, xline_min integer, xline_max integer, z_min numeric, z_max numeric, z_step numeric, stats_jsonb jsonb, status text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone);
create table public.sip_workspaces (id uuid primary key default gen_random_uuid(), project_id uuid, name text, visibility text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone);
create table public.studio_users (id uuid primary key default gen_random_uuid(), full_name text, email text, role text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.system_settings (id uuid primary key default gen_random_uuid(), key text, value jsonb, description text);
create table public.template_usage (id uuid primary key default gen_random_uuid(), template_id character varying(50), organization_id uuid, usage_count integer, last_used timestamp with time zone);
create table public.templates (id character varying(50) primary key, name character varying(255), icon character varying(10), category character varying(100), severity character varying(20), description text, controls text, is_global boolean, organization_id uuid);
create table public.torque_drag_projects (id uuid primary key default gen_random_uuid(), user_id uuid, project_name text, inputs_data jsonb, results_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.user_badges (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, badge_id character varying(50), unlocked_at timestamp with time zone);
create table public.user_positions (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, position_id uuid, department_id uuid, site_id uuid, is_primary boolean, assigned_at timestamp without time zone);
create table public.vulnerabilities (id uuid primary key default gen_random_uuid(), organization_id uuid, vulnerability_name text, description text, severity text, affected_systems text[], risk_score integer, remediation_recommendation text, remediation_status text, remediation_due_date date, remediation_completed_date date, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.webhooks (id uuid primary key default gen_random_uuid(), org_id uuid, url text, events text[], secret text, is_active boolean, created_at timestamp with time zone);
create table public.work_permits (id uuid primary key default gen_random_uuid(), organization_id uuid, permit_number text, permit_type text, title text, description text, location text, department text, priority text, status text, template_id uuid, requested_by uuid, approved_by uuid, supervisor_id uuid, contractor_name text, start_date timestamp with time zone, end_date timestamp with time zone, expiry_date timestamp with time zone, risk_level text, hazards jsonb, control_measures jsonb, ppe_requirements jsonb, emergency_procedures text, weather_conditions text, equipment_required jsonb, special_conditions text, compliance_checks jsonb, attachments jsonb, audit_trail jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid);
create table public.workflow_executions (id uuid primary key default gen_random_uuid(), workflow_id uuid, status text, logs jsonb, started_at timestamp with time zone, completed_at timestamp with time zone);
create table public.workflow_steps (id uuid primary key default gen_random_uuid(), workflow_id uuid, step_order integer, action_type text, action_config jsonb, conditions jsonb);
create table public.workflows (id uuid primary key default gen_random_uuid(), org_id uuid, name text, description text, trigger_type text, trigger_config jsonb, is_active boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone);
alter table public.projects enable row level security;
-- legacy policies, as live (inert on the 86 while their RLS is off)
create policy "Org admins can insert audit log" on public.branding_audit_log as PERMISSIVE for INSERT to public with check (has_org_role(organization_id, ARRAY['org_admin'::text, 'owner'::text, 'super_admin'::text]));
create policy "Org admins can read audit log" on public.branding_audit_log as PERMISSIVE for SELECT to public using (has_org_role(organization_id, ARRAY['org_admin'::text, 'owner'::text, 'super_admin'::text]));
create policy "Org admins can manage presets" on public.branding_presets as PERMISSIVE for ALL to public using (has_org_role(organization_id, ARRAY['org_admin'::text, 'owner'::text, 'super_admin'::text]));
create policy "Org members can read presets" on public.branding_presets as PERMISSIVE for SELECT to public using (is_org_member(organization_id));
create policy "Users can manage their own cementing projects" on public.cementing_simulation_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Users can manage their own frac projects" on public.frac_completion_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Users can manage their own geomechanics projects" on public.geomechanics_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Users can manage organization assets" on public.organization_assets as PERMISSIVE for ALL to public using (is_org_member(organization_id));
create policy "Admins can manage channels" on public.petrophysics_channels as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM petrophysics_team_members
  WHERE ((petrophysics_team_members.project_id = petrophysics_channels.project_id) AND (petrophysics_team_members.user_id = auth.uid()) AND (petrophysics_team_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
create policy "Team can view channels" on public.petrophysics_channels as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM petrophysics_team_members
  WHERE ((petrophysics_team_members.project_id = petrophysics_channels.project_id) AND (petrophysics_team_members.user_id = auth.uid())))));
create policy "Team can send messages" on public.petrophysics_messages as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM (petrophysics_channels c
     JOIN petrophysics_team_members m ON ((c.project_id = m.project_id)))
  WHERE ((c.id = petrophysics_messages.channel_id) AND (m.user_id = auth.uid())))));
create policy "Team can view messages" on public.petrophysics_messages as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM (petrophysics_channels c
     JOIN petrophysics_team_members m ON ((c.project_id = m.project_id)))
  WHERE ((c.id = petrophysics_messages.channel_id) AND (m.user_id = auth.uid())))));
create policy "System can insert notifications" on public.petrophysics_notifications as PERMISSIVE for INSERT to public with check (true);
create policy "Users can view own notifications" on public.petrophysics_notifications as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Team can view wiki" on public.petrophysics_wiki_pages as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM petrophysics_team_members
  WHERE ((petrophysics_team_members.project_id = petrophysics_wiki_pages.project_id) AND (petrophysics_team_members.user_id = auth.uid())))));
create policy "Team editors can manage wiki" on public.petrophysics_wiki_pages as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM petrophysics_team_members
  WHERE ((petrophysics_team_members.project_id = petrophysics_wiki_pages.project_id) AND (petrophysics_team_members.user_id = auth.uid()) AND (petrophysics_team_members.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));
create policy "Users can manage their own portfolio projects" on public.portfolio_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Users can manage links for their portfolios" on public.portfolio_scenario_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Users can manage their own portfolios" on public.portfolios as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Allow admin full access" on public.projects as PERMISSIVE for ALL to public using ((get_my_claim('user_role'::text) = 'admin'::text)) with check ((get_my_claim('user_role'::text) = 'admin'::text));
create policy "Users can manage their own data" on public.projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can view logs on accessible scenarios" on public.quickvol_activity_logs as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM saved_quickvol_projects p
  WHERE ((p.id = quickvol_activity_logs.scenario_id) AND ((p.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM quickvol_workspace_members m
          WHERE ((m.workspace_id = p.workspace_id) AND (m.user_id = auth.uid())))))))));
create policy "Users can add comments to accessible scenarios" on public.quickvol_comments as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM saved_quickvol_projects p
  WHERE ((p.id = quickvol_comments.scenario_id) AND ((p.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM quickvol_workspace_members m
          WHERE ((m.workspace_id = p.workspace_id) AND (m.user_id = auth.uid())))))))));
create policy "Users can view comments on accessible scenarios" on public.quickvol_comments as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM saved_quickvol_projects p
  WHERE ((p.id = quickvol_comments.scenario_id) AND ((p.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM quickvol_workspace_members m
          WHERE ((m.workspace_id = p.workspace_id) AND (m.user_id = auth.uid())))))))));
create policy "Users can view versions on accessible scenarios" on public.quickvol_versions as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM saved_quickvol_projects p
  WHERE ((p.id = quickvol_versions.scenario_id) AND ((p.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM quickvol_workspace_members m
          WHERE ((m.workspace_id = p.workspace_id) AND (m.user_id = auth.uid())))))))));
create policy "Members can view other members" on public.quickvol_workspace_members as PERMISSIVE for SELECT to public using (((EXISTS ( SELECT 1
   FROM quickvol_workspace_members m
  WHERE ((m.workspace_id = m.workspace_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM quickvol_workspaces w
  WHERE ((w.id = quickvol_workspace_members.workspace_id) AND (w.owner_id = auth.uid()))))));
create policy "Owners and Admins can manage members" on public.quickvol_workspace_members as PERMISSIVE for ALL to public using (((EXISTS ( SELECT 1
   FROM quickvol_workspaces
  WHERE ((quickvol_workspaces.id = quickvol_workspace_members.workspace_id) AND (quickvol_workspaces.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM quickvol_workspace_members quickvol_workspace_members_1
  WHERE ((quickvol_workspace_members_1.workspace_id = quickvol_workspace_members_1.workspace_id) AND (quickvol_workspace_members_1.user_id = auth.uid()) AND (quickvol_workspace_members_1.role = 'admin'::text))))));
create policy "Users can create workspaces" on public.quickvol_workspaces as PERMISSIVE for INSERT to public with check ((auth.uid() = owner_id));
create policy "Users can view workspaces they are members of" on public.quickvol_workspaces as PERMISSIVE for SELECT to public using (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM quickvol_workspace_members
  WHERE ((quickvol_workspace_members.workspace_id = quickvol_workspaces.id) AND (quickvol_workspace_members.user_id = auth.uid()))))));
create policy "Users can manage their own RTO projects" on public.rto_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Users can manage their own torque and drag projects" on public.torque_drag_projects as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
-- fixtures: A = org1 engineer, B = org2 owner, C = org1 invited (not active), E = super admin
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','a@x'),('00000000-0000-0000-0000-00000000000b','b@x'),('00000000-0000-0000-0000-00000000000c','c@x'),('00000000-0000-0000-0000-00000000000e','info@petrolord.com');
insert into public.organizations values ('10000000-0000-0000-0000-000000000001','Org1'),('10000000-0000-0000-0000-000000000002','Org2');
insert into public.organization_members(organization_id,user_id,role,status) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','engineer','active'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b','owner','active'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','org_admin','invited');
insert into public.projects(id, user_id, name) values ('60000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','A project'),('60000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','B project');
insert into public.pm_resources(id, project_id, name) values ('61000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-00000000000a','A res'),('61000000-0000-0000-0000-00000000000b','60000000-0000-0000-0000-00000000000b','B res');
insert into public.work_permits(id, organization_id, title, created_by) values ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','org1 permit','00000000-0000-0000-0000-00000000000a'),('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','org2 permit','00000000-0000-0000-0000-00000000000b');
insert into public.permit_approvals(permit_id, status) values ('70000000-0000-0000-0000-000000000001','pending'),('70000000-0000-0000-0000-000000000002','pending');
insert into public.templates(id, name, is_global, organization_id) values ('g1','global',true,null),('o1','org1 only',false,'10000000-0000-0000-0000-000000000001'),('o2','org2 only',false,'10000000-0000-0000-0000-000000000002');
insert into public.payment_audit_log(action) values ('seed');
insert into public.project_members values ('60000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','owner'),('60000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','owner');
insert into public.portfolios(user_id, name) values ('00000000-0000-0000-0000-00000000000b','B portfolio');
