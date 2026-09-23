-- Data & AI D1: the module joins pricing_config.module_pricing (HELD).
--
-- The one source of truth for module prices is pricing_config.module_pricing
-- (20260830060000_module_pricing_single_source.sql), read by generate-quote,
-- which re-prices every quote server side. src/data/pricingModels.js
-- (MODULE_PRICING) and the generate-quote fallback carry the same number and
-- src/data/__tests__/modulePricing.test.js holds all three together.
--
-- PRICE: 2,999 per month, chosen the way PS1 chose Process Safety's
-- (20260919230000). The rule is "a module costs about 3.3x its own per-app
-- price". Data & AI tiles take their per-app price from the Geoscience row
-- the DA0 seed copies (master_apps.price 899 as at 2026-08-30; the seed
-- copies whichever Active Geoscience row it finds first, so the owner should
-- confirm the live tile price). 3.3 x 899 = 2,967, which rounds to the house
-- ending at 2,999: 3.34x the per-app price, inside the rule's tested band
-- (2.8x to 4.0x), and below the a la carte cost of the module's four planned
-- apps (4 x 899 = 3,596), so the bundle stays the cheaper purchase. The next
-- house price down, 2,499, is 2.78x and falls outside the band. It is the
-- Geoscience module price for fewer apps; that follows from the rule being
-- per-app, and it is the owner's to change here without a code deploy (then
-- update pricingModels.js and the generate-quote fallback to match).
--
-- Merged into the existing object, so every other module's price, including
-- any the owner has changed since 20260830060000, is left exactly as it is.
-- Idempotent.
--
-- ORDER: after the DA0 seed (20260923120000) and together with the D1 tile
-- activation (20260923140000). A price for a module whose every app is
-- Coming Soon sells an empty module, so do not apply this before the
-- data-quality-studio tile is Active.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260923150000_d1_data_ai_module_pricing.sql

update public.pricing_config
   set value = value || '{"data-ai":2999}'::jsonb
 where key = 'module_pricing';

do $$
begin
  if not exists (select 1 from public.pricing_config
                  where key = 'module_pricing'
                    and (value ->> 'data-ai')::numeric = 2999) then
    raise exception 'pricing_config.module_pricing is missing; apply 20260830060000 first';
  end if;
end $$;
