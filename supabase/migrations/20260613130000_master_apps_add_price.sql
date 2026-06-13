-- Add per-app pricing to master_apps.
-- generate-quote reads master_apps.price; the column did not exist, which 500-errored
-- every quote that included apps. This adds it and seeds PLACEHOLDER prices by module
-- (from src/data/pricingModels.js MODULE_PRICING). These are starting values — review
-- and set real per-app prices before relying on them for live billing.

alter table public.master_apps
  add column if not exists price numeric not null default 0;

update public.master_apps
   set price = case lower(coalesce(module, ''))
                 when 'geoscience' then 899
                 when 'reservoir'  then 799
                 when 'drilling'   then 899
                 when 'production' then 699
                 when 'economics'  then 599
                 when 'facilities' then 699
                 when 'assurance'  then 499
                 else 199
               end
 where price = 0;

comment on column public.master_apps.price is
  'Per-app monthly price (USD). Seeded 2026-06-13 with module-based PLACEHOLDER values — review per app.';
