-- Process Safety PS2: the Consequence Modelling Studio tile goes Active (HELD).
--
-- The module's second working app. lopa-sil-studio is PS1's (20260919220000)
-- and qra-studio stays Coming Soon until the migration that ships PS3.
--
-- Depends on the PS0 seed (20260919200000) having created the row. If it has
-- not been applied this does nothing and says so, rather than inserting a tile
-- with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as AS13 20260918900000 and PS1 20260919220000).
-- Apply ONLY after:
--   1. the PS0 seed, and 20260919234000 (ps_consequence_studies), so the tile
--      is never sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/process-safety/consequence-studio is live and that
--      route has been served on the deployed site. A tile must never go
--      Active before its route is on the deploy target.
-- No pricing change: the module was priced at PS1 (20260919230000) and a
-- module price includes its apps.
--
-- The description follows the owner copy rule and says what the studio
-- models; the PS0 seed's description promised jet fires and multi-energy
-- blast, which PS2 does not model, so it is replaced. Status flips only on
-- the row matched by slug AND module, so no other tile can be touched.
-- Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260919235000_ps2_activate_consequence_tile.sql

do $$
declare
  v_slug text := 'consequence-studio';
begin
  if not exists (select 1 from public.master_apps
                  where slug = v_slug and module = 'Process Safety') then
    raise notice 'Tile % not present in Process Safety; run the PS0 seed (20260919200000) first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
     set status = 'Active',
         is_built = true,
         is_functional = true,
         description = 'Release source terms for liquid and gas through a hole, with the choked or '
           || 'subsonic regime; pool size and evaporation; Gaussian plume dispersion with Briggs '
           || 'rural sigmas and the distance to a concentration; pool fire radiation by the '
           || 'solid-flame model with view factor and transmissivity; TNT equivalence and '
           || 'Kinney and Graham overpressure; and thermal, toxic and blast probits with named '
           || 'presets. Checked against the TNO Yellow Book and Purple Book worked examples.',
         updated_at = now()
   where slug = v_slug
     and module = 'Process Safety';
end $$;
