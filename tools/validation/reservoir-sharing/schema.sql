-- Scratch-Postgres stand-in for the Reservoir sharing dry run and pentest
-- (tools/validation/reservoir-sharing/run.sh). NEVER applied to a Supabase
-- database. Loaded AFTER tools/validation/org-sharing/schema.sql, which
-- supplies the roles, auth.uid(), organizations, organization_members, the
-- membership helpers, get_my_claim and the storage.objects stub.
--
-- WRITTEN from a read-only catalog read of the live project on 2026-10-02
-- (information_schema.columns, pg_constraint, pg_policies, pg_trigger,
-- pg_indexes, role_table_grants): the fifteen tables the migration touches,
-- with the columns, defaults, checks, foreign keys, triggers, policies (and
-- the roles they are granted to) and grants they had BEFORE the migration.
-- Live grants: anon, authenticated and service_role hold every privilege on
-- all fifteen (the Supabase default, reproduced by the default privileges of
-- the org-sharing schema).

create or replace function public.update_updated_at_column() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table public.saved_fluid_studio_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_fluid_studio_projects_pkey PRIMARY KEY (id),
    constraint saved_fluid_studio_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_fluid_studio_projects_user_id_idx on public.saved_fluid_studio_projects using btree (user_id, created_at desc);
alter table public.saved_fluid_studio_projects enable row level security;
create policy "fluid_studio_delete_own" on public.saved_fluid_studio_projects for delete using ((auth.uid() = user_id));
create policy "fluid_studio_insert_own" on public.saved_fluid_studio_projects for insert with check ((auth.uid() = user_id));
create policy "fluid_studio_select_own" on public.saved_fluid_studio_projects for select using ((auth.uid() = user_id));
create policy "fluid_studio_update_own" on public.saved_fluid_studio_projects for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_scal_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_scal_projects_pkey PRIMARY KEY (id),
    constraint saved_scal_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_scal_projects_user_id_idx on public.saved_scal_projects using btree (user_id, updated_at desc);
alter table public.saved_scal_projects enable row level security;
create policy "scal_owner_all" on public.saved_scal_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_dca_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    original_file_data text,
    file_name text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_dca_projects_pkey PRIMARY KEY (id),
    constraint saved_dca_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_dca_projects_user_id_idx on public.saved_dca_projects using btree (user_id, updated_at desc);
alter table public.saved_dca_projects enable row level security;
create policy "Allow admin full access" on public.saved_dca_projects for all using ((get_my_claim('user_role'::text) = 'admin'::text)) with check ((get_my_claim('user_role'::text) = 'admin'::text));
create policy "Users can manage their own data" on public.saved_dca_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "dca_owner_all" on public.saved_dca_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_scenario_hub_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_scenario_hub_projects_pkey PRIMARY KEY (id),
    constraint saved_scenario_hub_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_scenario_hub_projects_user_id_idx on public.saved_scenario_hub_projects using btree (user_id, updated_at desc);
alter table public.saved_scenario_hub_projects enable row level security;
create policy "scenario_hub_owner_all" on public.saved_scenario_hub_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_well_test_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_well_test_projects_pkey PRIMARY KEY (id),
    constraint saved_well_test_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_well_test_projects_user_id_idx on public.saved_well_test_projects using btree (user_id, updated_at desc);
alter table public.saved_well_test_projects enable row level security;
create policy "well_test_owner_all" on public.saved_well_test_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_waterflood_design_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_waterflood_design_projects_pkey PRIMARY KEY (id),
    constraint saved_waterflood_design_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_waterflood_design_projects_user_id_idx on public.saved_waterflood_design_projects using btree (user_id, updated_at desc);
alter table public.saved_waterflood_design_projects enable row level security;
create policy "waterflood_design_owner_all" on public.saved_waterflood_design_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_vrr_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_vrr_projects_pkey PRIMARY KEY (id),
    constraint saved_vrr_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_vrr_projects_user_id_idx on public.saved_vrr_projects using btree (user_id, updated_at desc);
alter table public.saved_vrr_projects enable row level security;
create policy "vrr_owner_all" on public.saved_vrr_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.saved_rf_projects (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    project_name text not null,
    inputs_data jsonb not null,
    results_data jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint saved_rf_projects_pkey PRIMARY KEY (id),
    constraint saved_rf_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index saved_rf_projects_user_id_idx on public.saved_rf_projects using btree (user_id, updated_at desc);
alter table public.saved_rf_projects enable row level security;
create policy "rf_owner_all" on public.saved_rf_projects for all using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- Material Balance (rb_*): policies are granted to authenticated on the live database
create table public.rb_cases (
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
    constraint rb_cases_pkey PRIMARY KEY (id),
    constraint rb_cases_fluid_system_check CHECK ((fluid_system = ANY (ARRAY['oil'::text, 'gas'::text, 'oil_with_gas_cap'::text]))),
    constraint rb_cases_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
    constraint rb_cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index idx_rb_cases_active on public.rb_cases using btree (user_id, updated_at desc) where (archived_at is null);
create index idx_rb_cases_org_id on public.rb_cases using btree (org_id) where (org_id is not null);
create index idx_rb_cases_user_id on public.rb_cases using btree (user_id);
create trigger update_rb_cases_updated_at before update on public.rb_cases for each row execute function update_updated_at_column();
alter table public.rb_cases enable row level security;
create policy "rb_cases_owner_all" on public.rb_cases for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.rb_production_data (
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
    constraint rb_production_data_pkey PRIMARY KEY (id),
    constraint rb_production_data_case_id_timestep_index_key UNIQUE (case_id, timestep_index),
    constraint rb_production_data_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.rb_cases(id) ON DELETE CASCADE
);
create index idx_rb_production_data_case_timestep on public.rb_production_data using btree (case_id, timestep_index);

create table public.rb_run_configs (
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
    constraint rb_run_configs_pkey PRIMARY KEY (id),
    constraint rb_run_configs_aquifer_model_check CHECK ((aquifer_model = ANY (ARRAY['none'::text, 'pot'::text, 'fetkovich'::text, 'carter_tracy'::text]))),
    constraint rb_run_configs_pvt_source_check CHECK ((pvt_source = ANY (ARRAY['correlated'::text, 'lab_table'::text, 'mixed'::text]))),
    constraint rb_run_configs_solver_method_check CHECK ((solver_method = ANY (ARRAY['havlena_odeh'::text, 'p_over_z'::text, 'p_over_z_modified'::text, 'pot_aquifer_plot'::text]))),
    constraint rb_run_configs_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.rb_cases(id) ON DELETE CASCADE
);
create index idx_rb_run_configs_case_id on public.rb_run_configs using btree (case_id);
create index idx_rb_run_configs_scenarios on public.rb_run_configs using btree (case_id) where (is_scenario = true);
create trigger update_rb_run_configs_updated_at before update on public.rb_run_configs for each row execute function update_updated_at_column();

create table public.rb_runs (
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
    constraint rb_runs_pkey PRIMARY KEY (id),
    constraint rb_runs_run_type_check CHECK ((run_type = ANY (ARRAY['single'::text, 'sensitivity'::text, 'monte_carlo'::text, 'history_match'::text]))),
    constraint rb_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))),
    constraint rb_runs_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.rb_cases(id) ON DELETE CASCADE,
    constraint rb_runs_parent_run_id_fkey FOREIGN KEY (parent_run_id) REFERENCES public.rb_runs(id) ON DELETE SET NULL,
    constraint rb_runs_run_config_id_fkey FOREIGN KEY (run_config_id) REFERENCES public.rb_run_configs(id) ON DELETE CASCADE
);
create index idx_rb_runs_case_id on public.rb_runs using btree (case_id, started_at desc);
create index idx_rb_runs_status on public.rb_runs using btree (status) where (status = ANY (ARRAY['pending'::text, 'running'::text]));

create table public.rb_results (
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
    constraint rb_results_pkey PRIMARY KEY (id),
    constraint rb_results_run_id_key UNIQUE (run_id),
    constraint rb_results_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.rb_cases(id) ON DELETE CASCADE,
    constraint rb_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rb_runs(id) ON DELETE CASCADE
);
create index idx_rb_results_case_id on public.rb_results using btree (case_id);
create index idx_rb_results_run_id on public.rb_results using btree (run_id);

alter table public.rb_production_data enable row level security;
create policy "rb_production_data_via_case" on public.rb_production_data for all to authenticated using ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid())))) with check ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid()))));
alter table public.rb_run_configs enable row level security;
create policy "rb_run_configs_via_case" on public.rb_run_configs for all to authenticated using ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid())))) with check ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid()))));
alter table public.rb_runs enable row level security;
create policy "rb_runs_via_case" on public.rb_runs for all to authenticated using ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid())))) with check ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid()))));
alter table public.rb_results enable row level security;
create policy "rb_results_via_case" on public.rb_results for all to authenticated using ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid())))) with check ((case_id IN ( SELECT rb_cases.id FROM rb_cases WHERE (rb_cases.user_id = auth.uid()))));

-- Reservoir Simulation (sim_*): policies are granted to PUBLIC on the live database
create table public.sim_cases (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    organization_id uuid,
    name text not null,
    description text,
    deck_source text default 'upload'::text not null,
    template_slug text,
    deck_path text,
    deck_bytes bigint,
    deck_sha256 text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    schema_version integer default 1 not null,
    app_build text,
    engine_version text,
    constraint sim_cases_pkey PRIMARY KEY (id),
    constraint sim_cases_deck_source_check CHECK ((deck_source = ANY (ARRAY['upload'::text, 'template'::text, 'generated'::text]))),
    constraint sim_cases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
    constraint sim_cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index sim_cases_user_idx on public.sim_cases using btree (user_id, updated_at desc);
alter table public.sim_cases enable row level security;
create policy "sim_cases_delete_own" on public.sim_cases for delete using ((auth.uid() = user_id));
create policy "sim_cases_insert_own" on public.sim_cases for insert with check (((auth.uid() = user_id) AND ((organization_id IS NULL) OR is_org_member(organization_id))));
create policy "sim_cases_select_own_or_org" on public.sim_cases for select using (((auth.uid() = user_id) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id))));
create policy "sim_cases_update_own" on public.sim_cases for update using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create table public.sim_runs (
    id uuid default gen_random_uuid() not null,
    case_id uuid not null,
    user_id uuid not null,
    organization_id uuid,
    status text default 'queued'::text not null,
    cancel_requested boolean default false not null,
    attempt integer default 0 not null,
    worker_id text,
    queued_at timestamp with time zone default now() not null,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    finished_at timestamp with time zone,
    deck_sha256 text,
    opm_version text,
    exit_code integer,
    failure_stage text,
    error_message text,
    elapsed_seconds numeric,
    active_cells integer,
    report_steps integer,
    result_path text,
    log_path text,
    result_bytes bigint,
    constraint sim_runs_pkey PRIMARY KEY (id),
    constraint sim_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'complete'::text, 'failed'::text, 'cancelled'::text]))),
    constraint sim_runs_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.sim_cases(id) ON DELETE CASCADE,
    constraint sim_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create index sim_runs_case_idx on public.sim_runs using btree (case_id, queued_at desc);
create index sim_runs_queue_idx on public.sim_runs using btree (queued_at) where (status = 'queued'::text);
create index sim_runs_quota_idx on public.sim_runs using btree (user_id, queued_at desc);
alter table public.sim_runs enable row level security;
create policy "sim_runs_select_own_or_org" on public.sim_runs for select using (((auth.uid() = user_id) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id))));

-- the live SECURITY DEFINER run functions (the migration must leave them working)
create or replace function public.sim_enqueue_run(p_case_id uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_case     public.sim_cases%rowtype;
  v_inflight int;
  v_daily    int;
  v_run_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'sim_enqueue_run: sign in first';
  end if;
  select * into v_case from public.sim_cases where id = p_case_id;
  if v_case.id is null or v_case.user_id <> auth.uid() then
    raise exception 'sim_enqueue_run: case not found (or not yours)';
  end if;
  if v_case.deck_path is null then
    raise exception 'sim_enqueue_run: upload a deck to this case first';
  end if;
  if coalesce(v_case.deck_bytes, 0) > 26214400 then
    raise exception 'sim_enqueue_run: deck bundle exceeds the 25 MB limit';
  end if;
  select count(*) into v_inflight from public.sim_runs where user_id = auth.uid() and status in ('queued', 'running');
  if v_inflight >= 2 then
    raise exception 'sim_enqueue_run: you already have 2 runs queued or running - wait for one to finish';
  end if;
  select count(*) into v_daily from public.sim_runs where user_id = auth.uid() and queued_at > now() - interval '24 hours';
  if v_daily >= 10 then
    raise exception 'sim_enqueue_run: daily limit reached (10 runs per 24 h)';
  end if;
  insert into public.sim_runs (case_id, user_id, organization_id)
  values (v_case.id, v_case.user_id, v_case.organization_id)
  returning id into v_run_id;
  return v_run_id;
end;
$function$;
revoke all on function public.sim_enqueue_run(uuid) from public, anon;
grant execute on function public.sim_enqueue_run(uuid) to authenticated;

-- the live `sim` bucket policies (own folder only, granted to authenticated)
create policy "sim_objects_delete_own" on storage.objects for delete to authenticated using (((bucket_id = 'sim'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "sim_objects_insert_own" on storage.objects for insert to authenticated with check (((bucket_id = 'sim'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "sim_objects_select_own" on storage.objects for select to authenticated using (((bucket_id = 'sim'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "sim_objects_update_own" on storage.objects for update to authenticated using (((bucket_id = 'sim'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'sim'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
