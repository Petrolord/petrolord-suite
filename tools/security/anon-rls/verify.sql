-- Read-only verification for the anon RLS exposure fix
-- (20260919160000 Migration A, 20260919170000 Migration B).
-- SELECTs only into session temp tables (plus a DO block that probes as anon and records the
-- outcome in a temp table; it reads, never writes a public table).
-- apply.sh runs it before, inside both rollback-wrapped dry runs, and
-- after the apply.
--
-- Expected:
--   before A      : dead 53/0 rls/53 anon, client 33/0 rls/33 anon, probe 86 readable
--   after A       : dead 53/53 rls/0 anon, client 33/0 rls/0 anon,  probe 0 readable
--   after A and B : dead 53/53 rls/0 anon/0 auth, client 33/33 rls/0 anon, 0 truncate

create temp table if not exists _sec_tables(tn text, grp text) on commit drop;
truncate _sec_tables;
insert into _sec_tables select unnest(array[
    'asset_summary',
    'behavioral_anomalies',
    'cementing_simulation_projects',
    'email_templates',
    'feature_flags',
    'frac_completion_projects',
    'geomechanics_projects',
    'integration_logs',
    'payment_audit_log',
    'payment_notifications',
    'petrophysics_channels',
    'petrophysics_messages',
    'petrophysics_notifications',
    'petrophysics_wiki_pages',
    'phishing_results',
    'phishing_simulations',
    'pm_app_integrations',
    'portfolio_scenario_projects',
    'portfolio_snapshots',
    'quickvol_activity_logs',
    'quickvol_comments',
    'quickvol_ml_models',
    'quickvol_predictions',
    'quickvol_versions',
    'quickvol_workspace_members',
    'quickvol_workspaces',
    'report_shares',
    'retraining_jobs',
    'rto_projects',
    'safety_points',
    'safety_scores',
    'scenario_comparisons',
    'scheduled_safety_moments',
    'security_knowledge_assessments',
    'sip_faults',
    'sip_horizons',
    'sip_jobs',
    'sip_projects',
    'sip_surveys',
    'sip_uploads',
    'sip_versions',
    'sip_volumes',
    'sip_workspaces',
    'studio_users',
    'system_settings',
    'template_usage',
    'torque_drag_projects',
    'user_positions',
    'vulnerabilities',
    'webhooks',
    'workflow_executions',
    'workflow_steps',
    'workflows'
  ]), 'dead';
insert into _sec_tables select unnest(array[
    'apps',
    'pm_deliverables',
    'pm_integration_logs',
    'pm_resource_assignments',
    'pm_resources',
    'portfolio_projects',
    'portfolios',
    'project_issues',
    'project_members',
    'access_logs',
    'actions',
    'ai_insights',
    'badge_definitions',
    'benchmarking_data',
    'branding_audit_log',
    'branding_presets',
    'data_quality_metrics',
    'feedback',
    'help_feedback',
    'key_personnel',
    'model_versions',
    'organization_assets',
    'permit_templates',
    'permit_approvals',
    'positions',
    'safety_moment_downloads',
    'safety_moment_shares',
    'safety_moment_views',
    'security_profiles',
    'security_training',
    'templates',
    'user_badges',
    'work_permits'
  ]), 'client';

create temp table if not exists _sec_report(ord int, k text, v text) on commit drop;
truncate _sec_report;

insert into _sec_report
select 1, t.grp || ': tables/rls_on/anon_any/auth_select/auth_any_write/auth_truncate/policies',
       concat_ws(' / ', count(*),
         count(*) filter (where c.relrowsecurity),
         count(*) filter (where has_any_column_privilege('anon', c.oid, 'select')
                            or has_table_privilege('anon', c.oid, 'insert,update,delete,truncate,references,trigger')),
         count(*) filter (where has_table_privilege('authenticated', c.oid, 'select')),
         count(*) filter (where has_table_privilege('authenticated', c.oid, 'insert,update,delete')),
         count(*) filter (where has_table_privilege('authenticated', c.oid, 'truncate')),
         sum((select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tn)))
  from _sec_tables t
  join pg_class c on c.relname = t.tn and c.relnamespace = 'public'::regnamespace
 group by t.grp;

-- behavioural probe: can anon still read each table? (a SELECT only)
do $$
declare r record; n bigint; readable int := 0; denied int := 0; errored text := '';
begin
  for r in select tn from _sec_tables loop
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', r.tn) into n;
      execute 'reset role';
      readable := readable + 1;
    exception
      when insufficient_privilege then
        execute 'reset role';
        denied := denied + 1;
      when others then
        -- e.g. 42P17: a legacy recursive policy is expanded (and fails)
        -- before the privilege check; the table is not readable either way
        execute 'reset role';
        errored := errored || r.tn || '=' || sqlstate || ' ';
    end;
  end loop;
  insert into _sec_report values (2, 'anon SELECT probe: readable / denied / errored', readable || ' / ' || denied || ' / ' || coalesce(nullif(errored, ''), 'none'));
end $$;

insert into _sec_report
select 3, 'fn ' || p.proname || ': anon_exec / auth_exec',
       has_function_privilege('anon', p.oid, 'execute') || ' / ' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('get_users_for_organization','manual_verify_quote','can_user_access_app',
                     'get_user_subscribed_modules','get_constraint_def','get_app_seat_usage_db');

insert into _sec_report
select 4, 'public tables still RLS-off AND anon-reachable (live: expect 1, spatial_ref_sys)', count(*) || ': ' || coalesce(string_agg(c.relname, ', ' order by c.relname), '')
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
   and not c.relrowsecurity
   and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert,update,delete'));

select k as check, v as value from _sec_report order by ord, k;
