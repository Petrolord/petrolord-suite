-- Process Safety PS3: the QRA Studio tile goes Active (HELD).
--
-- The module's third working app. lopa-sil-studio is PS1's (20260919220000)
-- and consequence-studio PS2's (20260919235000). With this, every tile the
-- PS0 seed created is Active.
--
-- Depends on the PS0 seed (20260919200000) having created the row. If it has
-- not been applied this does nothing and says so, rather than inserting a tile
-- with no module behind it.
--
-- DEPLOY GATE (the F12 rule, as AS13 20260918900000, PS1 20260919220000 and
-- PS2 20260919235000). Apply ONLY after:
--   1. the PS0 seed, and 20260921100000 (ps_qra_studies), so the tile is
--      never sold over a table that does not exist;
--   2. the production upload carrying the route
--      /dashboard/apps/process-safety/qra-studio is live and that route has
--      been served on the deployed site. A tile must never go Active before
--      its route is on the deploy target.
-- No pricing change: the module was priced at PS1 (20260919230000) and a
-- module price includes its apps.
--
-- The description follows the owner copy rule and says what the studio does.
-- The PS0 seed's description said ALARP is judged by the implied cost of
-- averting a fatality; the engine bands individual risk against the R2P2 or
-- the user's limits and tests a measure by gross disproportion, reporting
-- the ICAF beside it, so the description is replaced. Status flips only on
-- the row matched by slug AND module, so no other tile can be touched.
-- Idempotent.
--
-- Owner-run: supabase db query --linked -f supabase/migrations/20260921110000_ps3_activate_qra_tile.sql

do $$
declare
  v_slug text := 'qra-studio';
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
         description = 'Quantitative risk assessment on a register of scenarios and locations: '
           || 'event trees with Purple Book direct ignition, a probability of death from a '
           || 'consequence dose by the Purple Book rules, location specific individual risk and '
           || 'the individual risk per annum of the most exposed person with the ALARP band of '
           || 'each, contours along a transect, potential loss of life and FAR, the F-N curve '
           || 'against a criterion line, and the cost-benefit test with a disproportion factor '
           || 'and the implied cost of averting a fatality. Checked against the Purple Book, '
           || 'R2P2 and the HSE cost benefit checklist.',
         updated_at = now()
   where slug = v_slug
     and module = 'Process Safety';
end $$;
