-- Midstream & Downstream DS4 — Modular Refinery Feasibility goes Active (HELD).
-- DEPLOY GATE: apply only with the prod upload that ships the DS4 build.

do $$
declare
  v_slug text := 'modular-refinery-feasibility';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'Feasibility for a modular refinery, built around the comparison the '
        || 'incumbent tools bury: stick-built capital follows the six-tenths rule, which is '
        || 'why the industry believes small refineries cannot work, while a modular plant '
        || 'adds capacity by replicating trains and so scales close to linearly. Both curves '
        || 'are on the screen, and both exponents are yours to set. Configuration and yields, '
        || 'product slate valued at your own prices, valuation through the Suite screening '
        || 'economics engine, a licensing tracker, and crude supply as a named scenario on '
        || 'utilisation and premium, because supply is what actually decides these projects.',
      updated_at = now()
  where slug = v_slug;
end $$;
