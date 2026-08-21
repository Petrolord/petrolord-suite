-- EPE Wave B (docs/scope/EPE-Industry-Audit.md Band 2): equity + price
-- realism config columns on epe_run_configs. All additive with defaults that
-- reproduce pre-Wave-B behavior exactly (engine v3.6 defaults match).

alter table public.epe_run_configs
  add column if not exists psc_working_interest_pct numeric not null default 100,
  add column if not exists pia_working_interest_pct numeric not null default 100,
  add column if not exists price_deck jsonb,
  add column if not exists oil_price_differential_usd_bbl numeric not null default 0,
  add column if not exists gas_price_differential_usd_mscf numeric not null default 0,
  add column if not exists condensate_price_differential_usd_bbl numeric not null default 0,
  add column if not exists discounting_convention text not null default 'end_year'
    check (discounting_convention in ('end_year', 'mid_year')),
  add column if not exists valuation_year integer,
  add column if not exists treat_prior_as_sunk boolean not null default false;

comment on column public.epe_run_configs.price_deck is
  'Per-year price deck: [{year, oil, gas, condensate}]; entries override flat price + escalator per stream (engine v3.6 rules).';
comment on column public.epe_run_configs.psc_working_interest_pct is
  'Contractor-group share scaling for PSC runs; fiscal math stays field-level.';
comment on column public.epe_run_configs.pia_working_interest_pct is
  'Lessee share scaling for PIA runs; fiscal math stays field-level.';
comment on column public.epe_run_configs.valuation_year is
  'Discounting reference year (null = base_year).';
comment on column public.epe_run_configs.treat_prior_as_sunk is
  'Exclude pre-valuation years from value metrics (still modeled for fiscal state).';
