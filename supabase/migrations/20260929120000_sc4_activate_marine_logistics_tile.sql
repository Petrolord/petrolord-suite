-- Supply Chain SC4: the Marine Logistics Planner tile goes Active (HELD, DEPLOY-GATED).
--
-- Depends on 20260929110000 (the SC4 tile seed) having created the row. If it
-- has not been applied this does nothing and says so, rather than inserting a
-- tile with no module behind it.
--
-- DEPLOY GATE (the F12 rule). Apply ONLY after:
--   1. the SC4 tile seed (20260929110000) and 20260929100000
--      (scm_marine_projects), so the tile is never sold over a table that
--      does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/midstream-downstream/marine-logistics-planner is live
--      and that route has been served on the deployed site. A tile must never
--      go Active before its route is on the deploy target.
-- src/data/suiteCatalog.js already counts this app (104 live apps with SC3 and SC4); the
-- homepage count is right from the moment this is applied.
--
-- Note for the pricing migration 20260927120000 (already applied): its guard
-- expects exactly 102 live apps, so it must not be re-run after this one
-- without adding marine-logistics-planner (and materials-spares-planner) to
-- its list.
--
-- Status flips only; the row is matched on slug AND module so no other tile
-- can be touched. Idempotent. No begin/commit of its own.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260929120000_sc4_activate_marine_logistics_tile.sql

do $$
declare
  v_slug text := 'marine-logistics-planner';
begin
  if not exists (select 1 from public.master_apps
                  where slug = v_slug and module = 'Midstream & Downstream') then
    raise notice 'Tile % not present in Midstream & Downstream; run the SC4 tile seed (20260929110000) first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
     set status = 'Active',
         is_built = true,
         is_functional = true,
         updated_at = now()
   where slug = v_slug
     and module = 'Midstream & Downstream';
end $$;
