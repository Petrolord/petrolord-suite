-- Petroleum Economics Studio capability round (engine v3.4): field-life
-- config on epe_run_configs. Additive, nullable/defaulted, safe pre-deploy
-- (old engine code ignores the columns; new engine treats absent as off).
--
--   apply_economic_limit  – trim trailing years whose escalated revenue no
--                           longer covers inflated opex
--   abandonment_cost_usd  – lump-sum decommissioning outflow (post-tax by
--                           design; see epe-engine.ts v3.4 header)
--   abandonment_year      – year the lump sum lands (null = final modeled year)
--
-- Idempotent.

alter table public.epe_run_configs
  add column if not exists apply_economic_limit boolean not null default false,
  add column if not exists abandonment_cost_usd numeric,
  add column if not exists abandonment_year integer;
