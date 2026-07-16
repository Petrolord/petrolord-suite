-- R3 (Reservoir-ROADMAP.md §3): register Risked Reserves Valuation in
-- master_apps. The R0 audit found this app COMPLETE but fully orphaned
-- (page + component set + Monte Carlo engine, yet no route, no catalog
-- row, no importer). R3 wires it up: engine hardened + jest-tested,
-- route apps/reservoir/risked-reserves-valuation added, and this tile.
-- Module placement per the plan of record: Reservoir (it consumes
-- volumetric/recovery inputs; its old back-link pointed at Economics
-- and was corrected in the same branch).
--
-- Standard %ROWTYPE sibling copy (the aquifer/RFE pattern): inherit
-- module/module_id/price from an existing Reservoir row, override only
-- identity/display. Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'risked-reserves-valuation') then
    raise notice 'master_apps: risked-reserves-valuation already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'reservoir'
   order by (slug = 'recovery-factor-estimator') desc,
            (slug = 'aquifer-influx-calculator') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no reservoir template row found — skipping risked-reserves-valuation seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'risked-reserves-valuation';
  tmpl.app_name      := 'Risked Reserves Valuation';
  tmpl.description   := 'Probabilistic project valuation: triangular Monte Carlo over reserves, price, cost and decline inputs to NPV P90/P50/P10, chance of success, S-curve and tornado sensitivity.';
  tmpl.icon_url      := 'PieChart';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded risked-reserves-valuation (module/module_id inherited from template)';
end $$;
