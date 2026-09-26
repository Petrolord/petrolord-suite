-- EPE: PIA 2021 / NTA 2025 compliance inputs (EC7, engines 3.12.0, engines PR #262).
--
-- HELD: NOT APPLIED. Owner applies staging first, then production, and only
-- then redeploys epe-cash-flow-engine, epe-cash-flow-engine-batch and
-- epe-monte-carlo, then uploads the Suite build (MIGRATIONS.md row
-- 20260926150000 states the order).
--
-- Product-prefixed table (epe_*); no shared table is touched.
--
-- Engines 3.12.0 computes the PIA regime from the gazetted texts by default
-- (PIA 2021, NTA 2025, Petroleum Royalty Regulations 2022, Finance Act 2023;
-- packages/engines/tools/validation/economics/FINDINGS-pia2021.md). The input
-- pia_legacy_pre_audit = true reproduces the pre-audit engine (3.11.0)
-- exactly.
--
-- DECISION (saved runs): every existing PIA run config is stamped
-- pia_legacy_pre_audit = true, so a saved run re-run, swept or simulated
-- reproduces the result stored with it. New configs default to false (the
-- compliant engine). The Run Console shows the stamp as a toggle the user can
-- clear.
--
-- Idempotent: add column if not exists; the stamp only touches PIA rows that
-- are not already true; the default and not-null changes are no-ops when
-- repeated.

begin;

alter table public.epe_run_configs
  add column if not exists pia_legacy_pre_audit boolean not null default false,
  add column if not exists pia_new_pml_hct_rate_pct numeric
    check (pia_new_pml_hct_rate_pct is null or pia_new_pml_hct_rate_pct in (15, 30)),
  add column if not exists pia_gas_in_country_share_pct numeric not null default 0
    check (pia_gas_in_country_share_pct >= 0 and pia_gas_in_country_share_pct <= 100),
  add column if not exists pia_price_royalty_base text not null default 'regulations_2021'
    check (pia_price_royalty_base in ('regulations_2021', 'act_2020')),
  add column if not exists pia_nddc_levy_base text not null default 'total_budget'
    check (pia_nddc_levy_base in ('total_budget', 'opex')),
  add column if not exists pia_nddc_levy_pct numeric
    check (pia_nddc_levy_pct is null or (pia_nddc_levy_pct >= 0 and pia_nddc_levy_pct <= 100)),
  add column if not exists pia_production_allowance_per_bbl_new_after_cap numeric not null default 4.00,
  add column if not exists pia_cit_company_gas_operations boolean not null default false,
  add column if not exists pia_decom_escrow_condition_met boolean;

-- Existing saved PIA runs keep the engine they were computed with.
update public.epe_run_configs
   set pia_legacy_pre_audit = true
 where fiscal_regime = 'PIA'
   and pia_legacy_pre_audit is distinct from true;

-- TET: NULL means the statutory rate by year (3% from 2023, TETFund Act s.1(2)
-- as amended by Finance Act 2023 s.26; 2.5% before). Stamped legacy rows keep
-- the rate stored on them.
alter table public.epe_run_configs
  alter column pia_tet_rate_pct drop default;

-- Deep offshore hydrocarbon tax under the NTA is a stated choice with no
-- default (NTA s.65(1) with s.72; engine decision D5). NULL is allowed so a
-- run that never reaches a deep offshore NTA year need not state it; the
-- engine refuses a deep offshore NTA year without it. The value check stays.
alter table public.epe_run_configs
  alter column pia_deep_offshore_hct_interpretation drop default,
  alter column pia_deep_offshore_hct_interpretation drop not null;

comment on column public.epe_run_configs.pia_legacy_pre_audit is
  'EC7 (engines 3.12.0): true runs the pre-audit PIA engine (3.11.0) exactly. Every PIA config saved before 2026-09-26 is stamped true by migration 20260926150000; new configs default to false (PIA 2021 / NTA 2025 compliant).';
comment on column public.epe_run_configs.pia_new_pml_hct_rate_pct is
  'EC7: hydrocarbon tax rate for a new-acreage PML onshore or in shallow water, 15 or 30 (PIA s.267, NTA s.72 do not say which). Required by the engine for that case; no default.';
comment on column public.epe_run_configs.pia_gas_in_country_share_pct is
  'EC7: percent of gas revenue utilised in-country, royalty 2.5% on it and 5% on the rest (PIA Seventh Schedule para 10(6); Royalty Regulations 2022 r.16).';
comment on column public.epe_run_configs.pia_price_royalty_base is
  'EC7: royalty-by-price benchmark base year. regulations_2021 (Royalty Regulations 2022 Schedule, default) or act_2020 (PIA Seventh Schedule para 11(1)).';
comment on column public.epe_run_configs.pia_nddc_levy_base is
  'EC7: NDDC levy base. total_budget (opex plus capex, NDDC Act s.14(2)(b), default) or opex (the pre-audit base).';
comment on column public.epe_run_configs.pia_nddc_levy_pct is
  'EC7: NDDC levy percent of pia_nddc_levy_base. NULL falls back to pia_nddc_levy_pct_of_opex, then 3.';
comment on column public.epe_run_configs.pia_production_allowance_per_bbl_new_after_cap is
  'EC7: new-lease production allowance per barrel after the cumulative cap, lower of this and the percent of price (PIA Sixth Schedule para 1(2)); 4.00 USD/bbl.';
comment on column public.epe_run_configs.pia_cit_company_gas_operations is
  'EC7: true exempts a company in upstream or midstream gas operations from the CITA two-thirds capital allowance limit in PIA years (Finance Act 2023 s.9(b)).';
comment on column public.epe_run_configs.pia_decom_escrow_condition_met is
  'EC7: NTA s.86 escrow condition (at least 30% of the decommissioning fund in an accredited Nigerian bank escrow). Required by the engine when an NTA year carries a sinking-fund contribution; no default.';
comment on column public.epe_run_configs.pia_tet_rate_pct is
  'Tertiary education tax percent in PIA years. NULL (the default since EC7) applies the statute by year: 3% from 2023 (Finance Act 2023 s.26), 2.5% before.';
comment on column public.epe_run_configs.pia_deep_offshore_hct_interpretation is
  'Deep offshore HCT reading in NTA years: conservative_zero, aggressive_pml_30 or custom. No default since EC7 (decision D5); required by the engine for a deep offshore NTA year.';

commit;
