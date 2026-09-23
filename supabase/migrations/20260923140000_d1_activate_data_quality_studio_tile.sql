-- Data & AI D1: the Data Quality Studio tile goes Active (HELD).
--
-- The module's first working app, and the first of its four tiles to leave
-- Coming Soon. ml-workbench, electrofacies-studio and forecasting-ml-workbench
-- stay Coming Soon until the migrations that ship D2 to D4.
--
-- Depends on the DA0 seed (20260923120000) having created the row. If it has
-- not been applied this does nothing and says so, rather than inserting a tile
-- with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as PS1 20260919220000). Apply ONLY after:
--   1. the DA0 seed, and 20260923130000 (dai_qc_runs), so the tile is never
--      sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/data-ai/data-quality-studio is live and that route has
--      been served on the deployed site. A tile must never go Active before
--      its route is on the deploy target.
-- Apply the module pricing (20260923150000) in the same window, after this.
--
-- The description follows the owner copy rule and names the methods the app
-- runs. Status flips only; the row is matched on slug AND module so no other
-- tile can be touched. Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260923140000_d1_activate_data_quality_studio_tile.sql

do $$
declare
  v_slug text := 'data-quality-studio';
begin
  if not exists (select 1 from public.master_apps
                  where slug = v_slug and module = 'Data & AI') then
    raise notice 'Tile % not present in Data & AI; run the DA0 seed (20260923120000) first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
     set status = 'Active',
         is_built = true,
         is_functional = true,
         description = 'Quality checks on well logs from the wells registry, production from the '
           || 'production data spine, or an uploaded CSV or Excel sheet: completeness and gaps, '
           || 'definitional range and index rules, cumulative, water cut, phase sum and frozen '
           || 'value checks, near duplicate identifiers, outliers by z-score, modified z-score, '
           || 'Tukey fences, Hampel, Grubbs and Mahalanobis distance, and individuals, EWMA and '
           || 'CUSUM charts. Every flag states its rule and reason; runs are saved per organization.',
         updated_at = now()
   where slug = v_slug
     and module = 'Data & AI';
end $$;
