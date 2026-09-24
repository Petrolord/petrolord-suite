-- Data & AI D3: the Electrofacies Studio tile goes Active (HELD).
--
-- The module's third working app. forecasting-ml-workbench stays Coming
-- Soon until the migration that ships D4; data-quality-studio (D1) and
-- ml-workbench (D2) are not touched here.
--
-- Depends on the DA0 seed (20260923120000) having created the row. If it has
-- not been applied this does nothing and says so, rather than inserting a tile
-- with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as D1 20260923140000 and D2 20260924130000).
-- Apply ONLY after:
--   1. the DA0 seed, and 20260924140000 (dai_facies_runs), so the tile is
--      never sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/data-ai/electrofacies-studio is live and that route
--      has been served on the deployed site. A tile must never go Active
--      before its route is on the deploy target.
-- No pricing change: the data-ai module price (20260923150000, D1) already
-- covers every app of the module, this one included.
--
-- The description follows the owner copy rule and names the methods the app
-- runs. Status flips only; the row is matched on slug AND module so no other
-- tile can be touched. Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260924150000_d3_activate_electrofacies_studio_tile.sql

do $$
declare
  v_slug text := 'electrofacies-studio';
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
         description = 'Electrofacies from well logs in the wells registry or an uploaded table: '
           || 'principal component analysis (scree, loadings, score crossplot), k-means with '
           || 'seeded k-means++ starts, the elbow and the silhouette, and agglomerative clustering '
           || 'with Ward, complete or average linkage; kNN and CART classification trees trained '
           || 'on core facies and scored on wells held out whole. Clusters are matched to the core '
           || 'facies with the matching stated and the adjusted Rand index, facies are shown against '
           || 'depth for each well, and a facies log is written to a well as a new curve with its '
           || 'provenance; runs are saved per organization.',
         updated_at = now()
   where slug = v_slug
     and module = 'Data & AI';
end $$;
