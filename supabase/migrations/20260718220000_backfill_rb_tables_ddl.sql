-- Material Balance Studio (rb_*) DDL backfill.
--
-- FILENAME IS DELIBERATELY BACK-DATED (authored 2026-09-11): on a fresh
-- rebuild, 20260718235500_rb_runs_history_match_run_type.sql alters
-- rb_runs, so this file must sort before it. That migration is a
-- drop-if-exists + re-add of rb_runs_run_type_check, and the live shape
-- captured here already carries the post-MB5 constraint, so on a rebuild it
-- re-adds a byte-identical constraint and on the live project it stays the
-- no-op it already was.
--
-- All five rb_* tables predate this repo's migration history: they exist live
-- but had no DDL in source, so the Material Balance schema could not be
-- rebuilt from the repo at all (only the MB5 constraint change had a
-- migration). This captures the LIVE shape verbatim -- columns via
-- pg_attribute with format_type + defaults, constraints via
-- pg_get_constraintdef, indexes via pg_indexes, policies via pg_policies,
-- snapshot taken 2026-09-11 -- as create-if-not-exists DDL. Same pattern and
-- the same debt as 20260814185000_backfill_epe_tables_ddl.sql cleared for the
-- epe_* family, which this file finishes for rb_*.
--
-- Applying against the live project is a no-op for tables, columns, indexes
-- and constraints; the five policies are dropped and recreated byte-identically
-- inside the migration's transaction. On a fresh rebuild it creates everything.
-- Idempotent.
--
-- RLS model: per-user owner scoping. rb_cases is owned directly
-- (auth.uid() = user_id); every child table is reachable only through its
-- parent case. org_id on rb_cases is an optional label with ON DELETE SET NULL,
-- not a second access path -- membership does NOT grant access to a colleague's
-- case, which is worth knowing before anyone assumes org-wide visibility.
--
-- Two fields in the captured shape are historical rather than current:
--   * rb_results.final_sdi is a DEPRECATED MIRROR of final_cdi. The engine
--     stopped producing `sdi` in engines #167 (it had been holding the rock and
--     connate water expansion under a name that means gas cap segregation); the
--     edge function keeps writing the mirror so a browser still running an
--     older bundle renders. Dropping the column is a later migration, not this
--     one -- this file records the shape that exists.
--   * rb_run_configs.solver_method still permits 'p_over_z' and
--     'p_over_z_modified'. Neither was ever implemented, and since engines #168
--     the engine reports solver_method_used instead and calculate-mbal no longer
--     forwards the input. The column and its check are captured as they are.

create table if not exists public.rb_cases (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  org_id uuid,
  name text not null,
  description text,
  field_name text,
  reservoir_name text,
  fluid_system text default 'oil'::text not null,
  has_aquifer boolean default false not null,
  has_gas_cap boolean default false not null,
  volumetric_ooip_stb double precision,
  volumetric_ogip_scf double precision,
  volumetric_estimate_source text,
  initial_pressure_psia double precision,
  bubble_point_psia double precision,
  reservoir_temperature_f double precision,
  initial_water_saturation double precision,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  archived_at timestamp with time zone,
  constraint rb_cases_fluid_system_check CHECK ((fluid_system = ANY (ARRAY['oil'::text, 'gas'::text, 'oil_with_gas_cap'::text]))),
  constraint rb_cases_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL,
  constraint rb_cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint rb_cases_pkey PRIMARY KEY (id)
);

alter table public.rb_cases enable row level security;

create index if not exists idx_rb_cases_active ON public.rb_cases USING btree (user_id, updated_at DESC) WHERE (archived_at IS NULL);

create index if not exists idx_rb_cases_org_id ON public.rb_cases USING btree (org_id) WHERE (org_id IS NOT NULL);

create index if not exists idx_rb_cases_user_id ON public.rb_cases USING btree (user_id);

drop policy if exists rb_cases_owner_all on public.rb_cases;
create policy rb_cases_owner_all on public.rb_cases
  as permissive for all to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));


create table if not exists public.rb_run_configs (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  name text default 'Default Run'::text not null,
  is_scenario boolean default false not null,
  pvt_source text default 'correlated'::text not null,
  pvt_correlations jsonb default '{"water": "mccain", "pb_rs_bo": "standing", "z_factor": "hall_yarborough", "gas_viscosity": "lee_gonzalez_eakin", "oil_viscosity": "beggs_robinson"}'::jsonb not null,
  pvt_lab_table jsonb,
  oil_gravity_api double precision,
  gas_specific_gravity double precision,
  water_salinity_ppm double precision,
  formation_compressibility_psi double precision,
  water_compressibility_psi double precision,
  aquifer_model text default 'none'::text,
  aquifer_params jsonb,
  aquifer_history_match boolean default false not null,
  gas_cap_ratio_m double precision,
  solver_method text default 'havlena_odeh'::text not null,
  excluded_timesteps integer[] default '{}'::integer[],
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint rb_run_configs_aquifer_model_check CHECK ((aquifer_model = ANY (ARRAY['none'::text, 'pot'::text, 'fetkovich'::text, 'carter_tracy'::text]))),
  constraint rb_run_configs_pvt_source_check CHECK ((pvt_source = ANY (ARRAY['correlated'::text, 'lab_table'::text, 'mixed'::text]))),
  constraint rb_run_configs_solver_method_check CHECK ((solver_method = ANY (ARRAY['havlena_odeh'::text, 'p_over_z'::text, 'p_over_z_modified'::text, 'pot_aquifer_plot'::text]))),
  constraint rb_run_configs_case_id_fkey FOREIGN KEY (case_id) REFERENCES rb_cases(id) ON DELETE CASCADE,
  constraint rb_run_configs_pkey PRIMARY KEY (id)
);

alter table public.rb_run_configs enable row level security;

create index if not exists idx_rb_run_configs_case_id ON public.rb_run_configs USING btree (case_id);

create index if not exists idx_rb_run_configs_scenarios ON public.rb_run_configs USING btree (case_id) WHERE (is_scenario = true);

drop policy if exists rb_run_configs_via_case on public.rb_run_configs;
create policy rb_run_configs_via_case on public.rb_run_configs
  as permissive for all to authenticated
  using ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))))
  with check ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))));


create table if not exists public.rb_runs (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  run_config_id uuid not null,
  status text default 'pending'::text not null,
  error_message text,
  error_detail jsonb,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  duration_ms integer,
  parent_run_id uuid,
  run_type text default 'single'::text not null,
  engine_version text,
  created_at timestamp with time zone default now() not null,
  constraint rb_runs_run_type_check CHECK ((run_type = ANY (ARRAY['single'::text, 'sensitivity'::text, 'monte_carlo'::text, 'history_match'::text]))),
  constraint rb_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))),
  constraint rb_runs_case_id_fkey FOREIGN KEY (case_id) REFERENCES rb_cases(id) ON DELETE CASCADE,
  constraint rb_runs_parent_run_id_fkey FOREIGN KEY (parent_run_id) REFERENCES rb_runs(id) ON DELETE SET NULL,
  constraint rb_runs_run_config_id_fkey FOREIGN KEY (run_config_id) REFERENCES rb_run_configs(id) ON DELETE CASCADE,
  constraint rb_runs_pkey PRIMARY KEY (id)
);

alter table public.rb_runs enable row level security;

create index if not exists idx_rb_runs_case_id ON public.rb_runs USING btree (case_id, started_at DESC);

create index if not exists idx_rb_runs_status ON public.rb_runs USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));

drop policy if exists rb_runs_via_case on public.rb_runs;
create policy rb_runs_via_case on public.rb_runs
  as permissive for all to authenticated
  using ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))))
  with check ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))));


create table if not exists public.rb_production_data (
  id uuid default gen_random_uuid() not null,
  case_id uuid not null,
  timestep_index integer not null,
  observation_date date,
  pressure_psia double precision not null,
  cum_oil_stb double precision default 0,
  cum_gas_scf double precision default 0,
  cum_water_stb double precision default 0,
  cum_water_inj_stb double precision default 0,
  cum_gas_inj_scf double precision default 0,
  bo_rb_stb double precision,
  rs_scf_stb double precision,
  bg_rb_mscf double precision,
  bw_rb_stb double precision,
  z_factor double precision,
  observed_we_rb double precision,
  created_at timestamp with time zone default now() not null,
  constraint rb_production_data_case_id_fkey FOREIGN KEY (case_id) REFERENCES rb_cases(id) ON DELETE CASCADE,
  constraint rb_production_data_pkey PRIMARY KEY (id),
  constraint rb_production_data_case_id_timestep_index_key UNIQUE (case_id, timestep_index)
);

alter table public.rb_production_data enable row level security;

create index if not exists idx_rb_production_data_case_timestep ON public.rb_production_data USING btree (case_id, timestep_index);

drop policy if exists rb_production_data_via_case on public.rb_production_data;
create policy rb_production_data_via_case on public.rb_production_data
  as permissive for all to authenticated
  using ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))))
  with check ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))));


create table if not exists public.rb_results (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  case_id uuid not null,
  estimated_ooip_stb double precision,
  estimated_ogip_scf double precision,
  r_squared double precision,
  regression_slope double precision,
  regression_intercept double precision,
  n_data_points integer,
  aquifer_owip_rb double precision,
  aquifer_cumulative_we_rb double precision,
  aquifer_fit_quality double precision,
  final_ddi double precision,
  final_gdi double precision,
  final_wdi double precision,
  final_sdi double precision,
  final_drive_index_sum double precision,
  drive_mechanism text,
  aquifer_strength text,
  warnings text[],
  plot_data jsonb,
  volumetric_reconciliation jsonb,
  created_at timestamp with time zone default now() not null,
  final_cdi double precision,
  constraint rb_results_case_id_fkey FOREIGN KEY (case_id) REFERENCES rb_cases(id) ON DELETE CASCADE,
  constraint rb_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES rb_runs(id) ON DELETE CASCADE,
  constraint rb_results_pkey PRIMARY KEY (id),
  constraint rb_results_run_id_key UNIQUE (run_id)
);

alter table public.rb_results enable row level security;

create index if not exists idx_rb_results_case_id ON public.rb_results USING btree (case_id);

create index if not exists idx_rb_results_run_id ON public.rb_results USING btree (run_id);

drop policy if exists rb_results_via_case on public.rb_results;
create policy rb_results_via_case on public.rb_results
  as permissive for all to authenticated
  using ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))))
  with check ((case_id IN ( SELECT rb_cases.id
   FROM rb_cases
  WHERE (rb_cases.user_id = auth.uid()))));

