-- Process Safety PS1: the module joins pricing_config.module_pricing (HELD).
--
-- The one source of truth for module prices is pricing_config.module_pricing
-- (20260830060000_module_pricing_single_source.sql), read by generate-quote,
-- which re-prices every quote server side. src/data/pricingModels.js
-- (MODULE_PRICING) and the generate-quote fallback carry the same number and
-- src/data/__tests__/modulePricing.test.js holds all three together.
--
-- PRICE: 1,999 per month. The rule is "a module costs about 3.3x its own
-- per-app price". Process Safety tiles take their per-app price from the
-- Facilities row the PS0 seed copies (master_apps.price 699, Facilities being
-- the closest analogue). 3.3 x 699 = 2,307, which rounds to the house ending
-- at 2,299. But this module has three apps planned (one built at PS1), so
-- 2,299 would cost MORE than all three apps a la carte (3 x 699 = 2,097),
-- which inverts the rule's own purpose (the bundle must be the obvious
-- purchase). 1,999 is the price in the rule's tested band (2.8x to 4.0x the
-- per-app price; this is 2.86x, beside Assurance at 3.0x) that keeps the
-- module below the a la carte cost of its apps, and it is the
-- Economics and Midstream & Downstream price. Decided under the owner's
-- delegation; the owner can change it here without a code deploy (then
-- update pricingModels.js and the generate-quote fallback to match).
--
-- Merged into the existing object, so every other module's price, including
-- any the owner has changed since 20260830060000, is left exactly as it is.
-- Idempotent.
--
-- ORDER: after the PS0 seed (20260919200000) and together with the PS1 tile
-- activation (20260919220000). A price for a module whose every app is
-- Coming Soon sells an empty module, so do not apply this before the
-- lopa-sil-studio tile is Active.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260919230000_ps1_process_safety_module_pricing.sql

update public.pricing_config
   set value = value || '{"process-safety":1999}'::jsonb
 where key = 'module_pricing';

do $$
begin
  if not exists (select 1 from public.pricing_config
                  where key = 'module_pricing'
                    and (value ->> 'process-safety')::numeric = 1999) then
    raise exception 'pricing_config.module_pricing is missing; apply 20260830060000 first';
  end if;
end $$;
