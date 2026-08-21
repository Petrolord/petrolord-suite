-- EPE Wave F (docs/scope/EPE-Industry-Audit.md: 2.5/2.6/2.8/2.9/2.10/3.6):
-- fiscal-depth config columns + reserves-scenario tagging. All additive with
-- defaults reproducing pre-Wave-F behavior exactly (engine v3.9 contract).

-- Reserves scenarios (3.6): tag production datasets; a run config picks one.
alter table public.epe_production_volumes
  add column if not exists scenario_label text;
comment on column public.epe_production_volumes.scenario_label is
  'Wave F: reserves scenario tag (e.g. 1P/2P/3P). Null = base. Runs use the config''s production_scenario; null matches untagged rows.';

alter table public.epe_run_configs
  add column if not exists production_scenario text,
  add column if not exists fx_ngn_per_usd numeric,
  add column if not exists depreciation_method text not null default 'straight_line'
    check (depreciation_method in ('straight_line', 'nigeria_ppt')),
  add column if not exists jv_psc_depr_years numeric not null default 10,
  add column if not exists psc_profit_split_mode text not null default 'flat'
    check (psc_profit_split_mode in ('flat', 'tranches')),
  add column if not exists psc_profit_tranches jsonb,
  add column if not exists psc_itc_pct numeric not null default 0,
  add column if not exists psc_prior_cumulative_liquids_bbl numeric not null default 0,
  add column if not exists abandonment_funding_mode text not null default 'lump_sum'
    check (abandonment_funding_mode in ('lump_sum', 'sinking_fund')),
  add column if not exists abandonment_fund_start_year integer;

comment on column public.epe_run_configs.psc_profit_tranches is
  'Wave F: [{from_cum_mmbbl, contractor_share_pct}] on cumulative liquids at start of year; used when psc_profit_split_mode=tranches. Verify breakpoints against the actual PSC.';
comment on column public.epe_run_configs.fx_ngn_per_usd is
  'Wave F: flat FX for NGN mirror KPIs (v1; no FX vector).';
