-- Process Safety PS1: the LOPA & SIL Studio tile goes Active (HELD).
--
-- The module's first working app, and the first of its three tiles to leave
-- Coming Soon. consequence-studio and qra-studio stay Coming Soon until the
-- migrations that ship PS2 and PS3.
--
-- Depends on the PS0 seed (20260919200000) having created the row. If it has
-- not been applied this does nothing and says so, rather than inserting a tile
-- with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as AS13 20260918900000). Apply ONLY after:
--   1. the PS0 seed, and 20260919210000 (ps_lopa_studies), so the tile is
--      never sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/process-safety/lopa-sil-studio is live and that route
--      has been served on the deployed site. A tile must never go Active
--      before its route is on the deploy target.
-- Apply the module pricing (20260919230000) in the same window, after this.
--
-- The description follows the owner copy rule. Status flips only; the row is
-- matched on slug AND module so no other tile can be touched. Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260919220000_ps1_activate_lopa_sil_tile.sql

do $$
declare
  v_slug text := 'lopa-sil-studio';
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
         description = 'Layers of protection analysis against your tolerable target: '
           || 'mitigated event frequency, the risk reduction still missing and the SIL '
           || 'band it demands, with every non-credited layer named and its reason given. '
           || 'SIF verification by the IEC 61508-6 Annex B equations for 1oo1, 1oo2, '
           || '2oo2, 2oo3 and 1oo3 with common cause, proof testing and repair times, '
           || 'and the longest proof test interval that still meets a target. '
           || 'Low demand mode; failure rates are yours to supply.',
         updated_at = now()
   where slug = v_slug
     and module = 'Process Safety';
end $$;
