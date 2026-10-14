-- APPLIED 2026-10-14 by the owner (staging and production share the linked
-- project); verified: the four columns exist as nullable numeric.
-- Petroleum Economics Studio: variable operating cost rates (engine 3.12.2,
-- engines PR #358). Four nullable rates on epe_run_configs, read by the
-- three EPE edge functions (they select every column of the run config):
--
--   opex_variable_usd_per_bbl_oil     US$ per barrel of oil produced
--   opex_variable_usd_per_bbl_water   US$ per barrel of water produced
--   opex_variable_usd_per_mscf_gas    US$ per Mscf of gas produced
--   opex_variable_usd_per_bbl_liquid  US$ per barrel of oil + condensate + water
--
-- The engine adds them to the OPEX file's yearly total on the volumes a run
-- prices, in base-year dollars. Null or 0 means off, so existing configs and
-- the pre-3.12.2 engine are unaffected (an older engine ignores the columns).
--
-- Additive and idempotent. OWNER applies it to staging first, then
-- production, BEFORE the Suite build that writes these columns is uploaded:
-- until it is applied, saving a run config with the new fields fails with an
-- unknown-column error.
--   supabase db query --linked -f supabase/migrations/20261014120000_epe_variable_opex.sql

alter table public.epe_run_configs
  add column if not exists opex_variable_usd_per_bbl_oil numeric,
  add column if not exists opex_variable_usd_per_bbl_water numeric,
  add column if not exists opex_variable_usd_per_mscf_gas numeric,
  add column if not exists opex_variable_usd_per_bbl_liquid numeric;
