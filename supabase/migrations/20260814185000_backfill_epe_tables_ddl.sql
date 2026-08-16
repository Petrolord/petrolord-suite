-- Petroleum Economics Studio DDL backfill (EPE.md §4.2b close-out,
-- owner-approved 2026-08-17).
--
-- FILENAME IS DELIBERATELY BACK-DATED (authored 2026-08-17): on a fresh
-- rebuild, 20260814190000_create_epe_mc_runs.sql FK-references
-- epe_cases/epe_run_configs, so this file must sort before it. Against the
-- live project it is a pure no-op-shaped apply (see below), so out-of-order
-- application is harmless there.
--
-- Nine of the ten epe_* tables predate this repo's migration history: they
-- exist live but had no DDL in source, so the schema could not be rebuilt
-- from the repo (only epe_mc_runs had a migration, 20260814190000). This
-- migration captures the LIVE shape verbatim (columns via pg_attribute with
-- format_type + defaults, constraints via pg_get_constraintdef, indexes via
-- pg_indexes, policies via pg_policies; snapshot taken 2026-08-17) as
-- create-if-not-exists DDL, the same pattern as
-- 20260716210000_align_saved_dca_projects.
--
-- Applying against the live project is a no-op for tables/indexes; policies
-- are drop-and-recreated byte-identically inside the transaction. On a fresh
-- rebuild this creates everything, and the later additive migration
-- 20260816130000 (field-life columns) no-ops via its own IF NOT EXISTS —
-- the columns it added are already part of the shape captured here.
--
-- RLS model (documented in EPE.md): per-user owner scoping,
-- auth.uid() = user_id; sensitivity results are reachable only via their
-- parent run. Idempotent.

create table if not exists public.epe_cases (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  case_name text not null,
  description text,
  created_at timestamp with time zone default now(),
  constraint epe_cases_pkey primary key (id),
  constraint epe_cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

alter table public.epe_cases enable row level security;

create table if not exists public.epe_run_configs (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null,
  config_name text not null,
  description text,
  oil_price_usd_bbl numeric not null default 75.00,
  gas_price_usd_mscf numeric not null default 4.50,
  condensate_price_usd_bbl numeric not null default 70.00,
  discount_rate_pct numeric not null default 10.00,
  inflation_rate_pct numeric not null default 3.00,
  base_year integer not null default 2027,
  fiscal_regime text not null default 'JV'::text,
  jv_working_interest_pct numeric default 100.00,
  jv_royalty_pct numeric default 10.00,
  jv_tax_rate_pct numeric default 50.00,
  psc_royalty_pct numeric default 10.00,
  psc_cost_oil_cap_pct numeric default 80.00,
  psc_contractor_profit_share_pct numeric default 50.00,
  psc_tax_rate_pct numeric default 50.00,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  oil_price_escalator_pct numeric,
  gas_price_escalator_pct numeric,
  condensate_price_escalator_pct numeric,
  opex_escalator_pct numeric,
  capex_escalator_pct numeric not null default 0,
  present_value_basis text not null default 'real'::text,
  pia_terrain text,
  pia_license_type text,
  pia_lease_status text,
  pia_water_depth_m numeric,
  pia_marginal_field_pre_2021 boolean default false,
  pia_hct_rate_override_pct numeric,
  pia_cit_rate_pct numeric default 30,
  pia_tet_rate_pct numeric default 2.5,
  pia_nddc_levy_pct_of_opex numeric default 3,
  pia_nddc_levy_fixed_usd numeric,
  pia_prior_year_opex_usd numeric,
  pia_capex_recovery_years integer default 5,
  pia_cpr_limit_pct numeric default 65,
  pia_production_allowance_per_bbl_converted numeric default 2.50,
  pia_production_allowance_per_bbl_new numeric default 8.00,
  pia_production_allowance_pct_of_price numeric default 20,
  pia_under_nta_2025_override text not null default 'auto'::text,
  pia_deep_offshore_hct_interpretation text not null default 'conservative_zero'::text,
  pia_deep_offshore_hct_custom_rate_pct numeric,
  pia_development_levy_rate_pct numeric not null default 4.0,
  pia_apply_minimum_etr boolean not null default false,
  pia_minimum_etr_pct numeric not null default 15.0,
  pia_new_lease_prod_alw_cap_onshore_bbl numeric not null default 50000000,
  pia_new_lease_prod_alw_cap_shallow_bbl numeric not null default 100000000,
  pia_new_lease_prod_alw_cap_deep_bbl numeric not null default 500000000,
  pia_prior_cumulative_oil_bbl numeric not null default 0,
  apply_economic_limit boolean not null default false,
  abandonment_cost_usd numeric,
  abandonment_year integer,
  constraint epe_run_configs_pkey primary key (id),
  constraint epe_run_configs_case_id_fkey FOREIGN KEY (case_id) REFERENCES epe_cases(id) ON DELETE CASCADE,
  constraint epe_run_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint epe_run_configs_pia_deep_offshore_hct_interpretation_check CHECK ((pia_deep_offshore_hct_interpretation = ANY (ARRAY['conservative_zero'::text, 'aggressive_pml_30'::text, 'custom'::text]))),
  constraint epe_run_configs_present_value_basis_check CHECK ((present_value_basis = ANY (ARRAY['real'::text, 'nominal'::text]))),
  constraint epe_run_configs_fiscal_regime_check CHECK ((fiscal_regime = ANY (ARRAY['JV'::text, 'PSC'::text, 'PIA'::text]))),
  constraint epe_run_configs_pia_terrain_check CHECK (((pia_terrain IS NULL) OR (pia_terrain = ANY (ARRAY['onshore'::text, 'shallow_water'::text, 'deep_offshore'::text, 'frontier'::text, 'marginal_field'::text])))),
  constraint epe_run_configs_pia_license_type_check CHECK (((pia_license_type IS NULL) OR (pia_license_type = ANY (ARRAY['PML'::text, 'PPL'::text])))),
  constraint epe_run_configs_pia_lease_status_check CHECK (((pia_lease_status IS NULL) OR (pia_lease_status = ANY (ARRAY['converted'::text, 'new'::text])))),
  constraint epe_run_configs_pia_under_nta_2025_override_check CHECK ((pia_under_nta_2025_override = ANY (ARRAY['auto'::text, 'force_pia'::text, 'force_nta'::text])))
);

alter table public.epe_run_configs enable row level security;

create table if not exists public.epe_runs (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null,
  run_name text not null,
  parameters jsonb not null,
  created_at timestamp with time zone default now(),
  run_config_id uuid,
  constraint epe_runs_pkey primary key (id),
  constraint epe_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  constraint epe_runs_run_config_id_fkey FOREIGN KEY (run_config_id) REFERENCES epe_run_configs(id) ON DELETE SET NULL,
  constraint epe_runs_case_id_fkey FOREIGN KEY (case_id) REFERENCES epe_cases(id) ON DELETE CASCADE
);

alter table public.epe_runs enable row level security;

create table if not exists public.epe_results (
  id uuid not null default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null,
  kpis jsonb,
  cash_flow_data jsonb,
  created_at timestamp with time zone default now(),
  constraint epe_results_pkey primary key (id),
  constraint epe_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  constraint epe_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES epe_runs(id) ON DELETE CASCADE
);

alter table public.epe_results enable row level security;

create table if not exists public.epe_production_volumes (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null,
  data jsonb,
  file_name text,
  created_at timestamp with time zone default now(),
  constraint epe_production_volumes_pkey primary key (id),
  constraint epe_production_volumes_case_id_fkey FOREIGN KEY (case_id) REFERENCES epe_cases(id) ON DELETE CASCADE,
  constraint epe_production_volumes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

alter table public.epe_production_volumes enable row level security;

create table if not exists public.epe_capex (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null,
  data jsonb,
  file_name text,
  created_at timestamp with time zone default now(),
  constraint epe_capex_pkey primary key (id),
  constraint epe_capex_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  constraint epe_capex_case_id_fkey FOREIGN KEY (case_id) REFERENCES epe_cases(id) ON DELETE CASCADE
);

alter table public.epe_capex enable row level security;

create table if not exists public.epe_opex (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null,
  data jsonb,
  file_name text,
  created_at timestamp with time zone default now(),
  constraint epe_opex_pkey primary key (id),
  constraint epe_opex_case_id_fkey FOREIGN KEY (case_id) REFERENCES epe_cases(id) ON DELETE CASCADE,
  constraint epe_opex_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

alter table public.epe_opex enable row level security;

create table if not exists public.epe_sensitivity_runs (
  id uuid not null default gen_random_uuid(),
  base_run_id uuid not null,
  base_run_config_id uuid not null,
  user_id uuid not null,
  status text not null default 'queued'::text,
  base_npv numeric,
  error_message text,
  sweeps_count integer not null default 0,
  duration_ms integer,
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  constraint epe_sensitivity_runs_pkey primary key (id),
  constraint epe_sensitivity_runs_base_run_id_fkey FOREIGN KEY (base_run_id) REFERENCES epe_runs(id) ON DELETE CASCADE,
  constraint epe_sensitivity_runs_base_run_config_id_fkey FOREIGN KEY (base_run_config_id) REFERENCES epe_run_configs(id) ON DELETE CASCADE,
  constraint epe_sensitivity_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint epe_sensitivity_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'complete'::text, 'failed'::text])))
);

alter table public.epe_sensitivity_runs enable row level security;

create table if not exists public.epe_sensitivity_results (
  id uuid not null default gen_random_uuid(),
  sensitivity_run_id uuid not null,
  variable text not null,
  variable_label text,
  base_value numeric,
  low_factor numeric not null default 0.8,
  high_factor numeric not null default 1.2,
  low_value numeric,
  high_value numeric,
  base_npv numeric,
  low_npv numeric not null,
  high_npv numeric not null,
  delta_low_npv numeric not null,
  delta_high_npv numeric not null,
  max_abs_delta numeric not null,
  ordinal integer,
  created_at timestamp with time zone not null default now(),
  constraint epe_sensitivity_results_pkey primary key (id),
  constraint epe_sensitivity_results_sensitivity_run_id_fkey FOREIGN KEY (sensitivity_run_id) REFERENCES epe_sensitivity_runs(id) ON DELETE CASCADE
);

alter table public.epe_sensitivity_results enable row level security;

create index if not exists idx_epe_run_configs_case_id ON public.epe_run_configs USING btree (case_id);
create index if not exists idx_epe_run_configs_user_id ON public.epe_run_configs USING btree (user_id);
create index if not exists idx_epe_runs_run_config_id ON public.epe_runs USING btree (run_config_id);
create index if not exists idx_sensitivity_results_run ON public.epe_sensitivity_results USING btree (sensitivity_run_id);
create index if not exists idx_sensitivity_results_ordinal ON public.epe_sensitivity_results USING btree (sensitivity_run_id, ordinal);
create index if not exists idx_sensitivity_runs_base_run ON public.epe_sensitivity_runs USING btree (base_run_id);
create index if not exists idx_sensitivity_runs_user ON public.epe_sensitivity_runs USING btree (user_id);

drop policy if exists "Users can manage their own capex data" on public.epe_capex;
create policy "Users can manage their own capex data" on public.epe_capex
  for all
  using ((auth.uid() = user_id));

drop policy if exists "Users can manage their own EPE cases" on public.epe_cases;
create policy "Users can manage their own EPE cases" on public.epe_cases
  for all
  using ((auth.uid() = user_id));

drop policy if exists "Users can manage their own opex data" on public.epe_opex;
create policy "Users can manage their own opex data" on public.epe_opex
  for all
  using ((auth.uid() = user_id));

drop policy if exists "Users can manage their own production data" on public.epe_production_volumes;
create policy "Users can manage their own production data" on public.epe_production_volumes
  for all
  using ((auth.uid() = user_id));

drop policy if exists "Users can manage their own EPE results" on public.epe_results;
create policy "Users can manage their own EPE results" on public.epe_results
  for all
  using ((auth.uid() = user_id));

drop policy if exists "Users create run configs for their cases" on public.epe_run_configs;
create policy "Users create run configs for their cases" on public.epe_run_configs
  for insert
  with check (((auth.uid() = user_id) AND (case_id IN ( SELECT epe_cases.id
   FROM epe_cases
  WHERE (epe_cases.user_id = auth.uid())))));

drop policy if exists "Users delete their own run configs" on public.epe_run_configs;
create policy "Users delete their own run configs" on public.epe_run_configs
  for delete
  using ((auth.uid() = user_id));

drop policy if exists "Users update their own run configs" on public.epe_run_configs;
create policy "Users update their own run configs" on public.epe_run_configs
  for update
  using ((auth.uid() = user_id));

drop policy if exists "Users view their own run configs" on public.epe_run_configs;
create policy "Users view their own run configs" on public.epe_run_configs
  for select
  using ((auth.uid() = user_id));

drop policy if exists "Users can manage their own EPE runs" on public.epe_runs;
create policy "Users can manage their own EPE runs" on public.epe_runs
  for all
  using ((auth.uid() = user_id));

drop policy if exists "sens_results_insert_via_parent" on public.epe_sensitivity_results;
create policy "sens_results_insert_via_parent" on public.epe_sensitivity_results
  for insert
  with check ((EXISTS ( SELECT 1
   FROM epe_sensitivity_runs r
  WHERE ((r.id = epe_sensitivity_results.sensitivity_run_id) AND (r.user_id = auth.uid())))));

drop policy if exists "sens_results_select_via_parent" on public.epe_sensitivity_results;
create policy "sens_results_select_via_parent" on public.epe_sensitivity_results
  for select
  using ((EXISTS ( SELECT 1
   FROM epe_sensitivity_runs r
  WHERE ((r.id = epe_sensitivity_results.sensitivity_run_id) AND (r.user_id = auth.uid())))));

drop policy if exists "sens_runs_delete_own" on public.epe_sensitivity_runs;
create policy "sens_runs_delete_own" on public.epe_sensitivity_runs
  for delete
  using ((auth.uid() = user_id));

drop policy if exists "sens_runs_insert_own" on public.epe_sensitivity_runs;
create policy "sens_runs_insert_own" on public.epe_sensitivity_runs
  for insert
  with check ((auth.uid() = user_id));

drop policy if exists "sens_runs_select_own" on public.epe_sensitivity_runs;
create policy "sens_runs_select_own" on public.epe_sensitivity_runs
  for select
  using ((auth.uid() = user_id));

drop policy if exists "sens_runs_update_own" on public.epe_sensitivity_runs;
create policy "sens_runs_update_own" on public.epe_sensitivity_runs
  for update
  using ((auth.uid() = user_id));
