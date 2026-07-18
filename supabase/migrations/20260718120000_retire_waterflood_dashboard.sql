-- W6 (Waterflood Design Studio surveillance tab): retire the standalone
-- Waterflood Dashboard.
--
-- The dashboard's surveillance analytics (reservoir-barrel VRR, Hall plot,
-- Chan diagnostics, pattern response, injector recommendations; all real and
-- jest-tested since the P1-P4 rebuild) now live in the Waterflood Design
-- Studio's Surveillance tab, and the dashboard route redirects there. One
-- waterflood app per owner decision 2026-07-18.
--
-- Also drops saved_waterflood_projects: the table held ZERO rows in
-- production when checked 2026-07-18 (the dashboard's own Save/Load was a
-- no-op placeholder until 2026-07-08 and the real table collected no
-- projects since). Surveillance data now persists inside
-- saved_waterflood_design_projects payloads. get_all_my_projects is
-- recreated without the waterflood_dashboard arm (mirror updated in
-- src/database/functions/get_all_my_projects.sql).
--
-- DEPLOY RULE (honest catalog): apply WITH the production upload that
-- carries the Surveillance tab, never before. An archived tile must not
-- hide an app users can still reach only there, and the table must not be
-- dropped while a deployed build still queries it.
--
-- Idempotent.

update public.master_apps
   set status = 'Archived',
       is_functional = false,
       is_built = false,
       description = 'Retired: waterflood surveillance (VRR, Hall plot, Chan diagnostics, pattern response) now lives in the Waterflood Design Studio Surveillance tab.'
 where slug = 'waterflood-dashboard'
   and lower(module) = 'reservoir'
   and status <> 'Archived';

drop table if exists public.saved_waterflood_projects;

-- Recreate get_all_my_projects without the waterflood_dashboard arm
-- (verbatim mirror of src/database/functions/get_all_my_projects.sql).
    CREATE OR REPLACE FUNCTION get_all_my_projects()
    RETURNS TABLE(id uuid, project_name text, created_at timestamptz, app_type text, project_data jsonb, inputs_data jsonb, results_data jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
    WITH all_projects AS (
        SELECT id, project_name, created_at, 'well_cost_snap_pro' AS app_type, results_data AS project_data, inputs_data, results_data FROM public.saved_well_cost_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'decline_curve_analysis' AS app_type, results_data AS project_data, inputs_data, results_data FROM public.saved_dca_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'quickvol' AS app_type, results_data AS project_data, inputs_data, results_data FROM public.saved_quickvol_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'drilling_fluids' AS app_type, results_data AS project_data, inputs_data, results_data FROM public.saved_drilling_fluids_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'pvt_quicklook' AS app_type, results_data AS project_data, inputs_data, results_data FROM public.saved_pvt_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'contour_digitizer' AS app_type, contours AS project_data, null::jsonb as inputs_data, null::jsonb as results_data FROM public.contour_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'log_digitizer' AS app_type, results_data AS project_data, inputs_data, results_data FROM public.saved_log_digitizer_projects WHERE user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'petrophysics_estimator' as app_type, results_data as project_data, inputs_data, results_data from public.saved_petrophysics_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, name AS project_name, created_at, 'project_management_pro' as app_type, null::jsonb as project_data, null::jsonb as inputs_data, null::jsonb as results_data from public.projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'fdp_accelerator' as app_type, fiscal_terms as project_data, null::jsonb as inputs_data, null::jsonb as results_data from public.fdp_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'material_balance' as app_type, results_data as project_data, inputs_data, results_data from public.saved_mbal_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'report_autopilot' as app_type, results_data as project_data, inputs_data, results_data from public.saved_report_autopilot_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'relief_blowdown' as app_type, results_data as project_data, inputs_data, results_data from public.saved_relief_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'pipeline_sizer' as app_type, results_data as project_data, inputs_data, results_data from public.saved_pipeline_sizer_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'nodal_analysis' as app_type, results_data as project_data, inputs_data, results_data from public.saved_nodal_analysis_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, name as project_name, created_at, 'well_test_analyzer' as app_type, null::jsonb as project_data, inputs_data, results_data from public.pta_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'fluid_studio' as app_type, results_data as project_data, inputs_data, results_data from public.saved_fluid_studio_projects where user_id = auth.uid()
    )
    SELECT *
    FROM all_projects
    ORDER BY created_at DESC;
    $$;