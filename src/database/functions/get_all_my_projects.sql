-- ASPIRATIONAL MIRROR, NOT LIVE: checked 2026-07-18, no function named
-- get_all_my_projects exists in the production database, and this file
-- references tables that do not exist live (e.g.
-- saved_log_digitizer_projects). Reconcile against the live schema before
-- ever applying it; do not copy it into migrations verbatim (that mistake
-- was caught in 20260718120000's first apply attempt, which rolled back).
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
        SELECT id, project_name, created_at, 'well_test_analysis_studio' as app_type, null::jsonb as project_data, inputs_data, results_data from public.saved_well_test_projects where user_id = auth.uid()
        UNION ALL
        SELECT id, project_name, created_at, 'fluid_studio' as app_type, results_data as project_data, inputs_data, results_data from public.saved_fluid_studio_projects where user_id = auth.uid()
    )
    SELECT *
    FROM all_projects
    ORDER BY created_at DESC;
    $$;