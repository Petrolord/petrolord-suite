-- Drop orphan legacy tables: ss_* (Seismic Studio), em_* legacy
-- (EarthModel Studio), bf_* collaboration scaffolding.
--
-- SPA consumers were removed in chore/orphan-table-drops; live tables
-- em_models (Earth Modeling G8) and bf_wells (BasinFlow Genesis G7) are
-- kept. bf_wells.project_id (nullable FK to bf_projects) is dropped —
-- the app never reads or writes it and all 4 live rows have it NULL.
--
-- DATA DISCARDED (verified 2026-07-14, all other tables empty):
--   ss_assets 21 rows, ss_projects 7 rows, ss_jobs 2 rows
--   (legacy EarthModel Studio project list, retired with the SPA purge).
--
-- OWNER-GATED: apply only with owner approval, staging-first.

-- bf_wells is live; detach it from bf_projects before the drop below.
alter table public.bf_wells drop column if exists project_id;

-- Legacy Seismic Studio RPC functions — depend on ss_* rowtypes/enums,
-- zero callers in SPA or edge functions (verified 2026-07-14).
drop function if exists public.save_interpretation(uuid,uuid,uuid,uuid,interp_type,jsonb,text,jsonb,text,uuid,jsonb);
drop function if exists public.lock_interpretation(uuid,boolean);
drop function if exists public.create_ss_section(uuid,section_type,integer,jsonb,text);
drop function if exists public.upsert_ss_volume(uuid,uuid,text,text,text,text,integer,integer,integer,integer,integer,numeric,text,text,jsonb);
drop function if exists public.enqueue_job(uuid,job_kind,jsonb);

-- ss_* — legacy Seismic Studio (children before parents)
drop table if exists public.ss_interpretations;
drop table if exists public.ss_sections;
drop table if exists public.ss_workflow_runs;
drop table if exists public.ss_workflows;
drop table if exists public.ss_assets;
drop table if exists public.ss_events;
drop table if exists public.ss_jobs;
drop table if exists public.ss_styles;
drop table if exists public.ss_versions;
drop table if exists public.ss_volumes;
drop table if exists public.ss_projects;

-- em_* — legacy EarthModel Studio (em_models is live: keep)
drop table if exists public.em_fault_sticks;
drop table if exists public.em_faults;
drop table if exists public.em_grid_properties;
drop table if exists public.em_volumes;
drop table if exists public.em_grids;
drop table if exists public.em_jobs;
drop table if exists public.em_objects;
drop table if exists public.em_object_templates;
drop table if exists public.em_petro_analyses;
drop table if exists public.em_petro_templates;
drop table if exists public.em_surface_points;
drop table if exists public.em_surfaces;
drop table if exists public.em_well_logs;
drop table if exists public.em_wells;
drop table if exists public.em_projects;

-- bf_* — legacy BasinFlow scaffolding (bf_wells is live: keep) plus the
-- two unprefixed orphans that FK into bf_projects.
drop table if exists public.calibration_results;
drop table if exists public.expert_mode_settings;
drop table if exists public.bf_activity_log;
drop table if exists public.bf_comments;
drop table if exists public.bf_team_members;
drop table if exists public.bf_versions;
drop table if exists public.bf_jobs;
drop table if exists public.bf_projects;

-- Enums now orphaned — each was used only by the tables/functions above
-- (verified: zero column or signature uses elsewhere).
drop type if exists public.interp_type;
drop type if exists public.interpretation_kind;
drop type if exists public.asset_domain;
drop type if exists public.job_kind;
drop type if exists public.job_status;
drop type if exists public.section_type;
