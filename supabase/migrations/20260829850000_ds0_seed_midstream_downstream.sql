-- Midstream & Downstream DS0 — module row and the ten catalog tiles (HELD).
--
-- The Suite's eighth module. Registration has two halves and both must be
-- set: `master_apps.module` is free text used by the UI, and `module_id` is
-- the UUID entitlements are actually resolved by
-- (get-user-entitlements grants every app whose module_id equals a purchased
-- module_uuid). Seeding one without the other produces tiles nobody can be
-- sold, which is the trap the 2026-08-29 repo sweep flagged and the reason
-- 20260829840000 exists.
--
-- Every tile lands as **Coming Soon**, is_built false, is_functional false.
-- Not one of these apps is written yet, and the module's own doctrine is that
-- the catalog tells the truth: a tile goes Active in the migration that ships
-- its build, one app at a time through DS1 to DS10.
--
-- DEPLOY GATE: apply only with the prod upload that ships the DS0 build. The
-- module tile and its hub route must exist on the deploy target before the
-- module appears in the catalog, or the dashboard links into a 404.

do $$
declare
  v_module_id uuid;
  tmpl public.master_apps%rowtype;
  rec record;
  v_order integer;
begin
  -- 1. The module itself, on the shape the live `modules` table already uses.
  select id into v_module_id from public.modules where slug = 'midstream-downstream';
  if v_module_id is null then
    insert into public.modules (id, name, slug, description)
    values (
      gen_random_uuid(),
      'Midstream & Downstream',
      'midstream-downstream',
      'Refining, terminals, fuel supply chain and the carbon ledger that runs beside them'
    )
    returning id into v_module_id;
  end if;

  -- 2. A live row to copy, so pricing and column defaults come from a real
  --    neighbour rather than being typed. Economics is the closest analogue
  --    in shape; the module and module_id are overwritten below.
  select * into tmpl from public.master_apps
    where lower(module) = 'economics' and status = 'Active' limit 1;
  if tmpl.id is null then
    raise notice 'no template row found; DS0 seed skipped.';
    return;
  end if;

  select coalesce(max(display_order), 0) into v_order from public.master_apps;

  for rec in
    select * from (values
      ('crude-assay-blending-studio', 'Crude Assay & Blending Studio',
       'Assay library with TBP and D86 interconversion and cut-yield curves, blend property prediction for API, sulfur, viscosity and TAN, crude compatibility screening, and value per barrel against a marker crude.'),
      ('product-blending-optimizer', 'Product Blending Optimizer',
       'Least-cost gasoline, diesel and fuel-oil recipes under real specifications: octane and RVP index blending, sulfur mass balance, cetane index and flash and distillation constraints, with the quality giveaway quantified rather than absorbed.'),
      ('refinery-planning-scheduling', 'Refinery Planning & Scheduling Studio',
       'One data model carrying the plan, the schedule and the actuals: a configuration-level linear programme cascades to a calendar of crude receipts, tank batches, unit runs and blend events, and recorded actuals reconcile back with variance attributed to price, yield, timing or downtime.'),
      ('modular-refinery-feasibility', 'Modular Refinery Feasibility Studio',
       'End-to-end feasibility for a modular refinery: configuration and yields from a chosen crude, capex and opex scaling by train size, the product slate valued at local prices, full fiscal cash flow and Monte Carlo through the Petroleum Economics engine, the licensing stages, and the crude supply risk that decides most of these projects.'),
      ('terminal-depot-studio', 'Terminal & Depot Studio',
       'Built for a terminal with a dip tape rather than a control system: manual dips against strapping tables to standard volumes, daily stock reconciliation and gain-loss trending, evaporation and handling losses, rack throughput and queueing, and throughput economics with the carbon per tonne beside them.'),
      ('fuel-pricing-supply-chain', 'Fuel Pricing & Supply Chain Studio',
       'Import parity landed cost and pump price build-up, from FOB through freight, losses, duties and regulatory margins, with the margin waterfall by product, depot to station trucking economics, and station throughput sizing. Template driven, so a build-up survives the next regulatory change.'),
      ('lpg-cng-rollout-studio', 'LPG & CNG Rollout Studio',
       'Bottling plant and storage sizing, cylinder fleet logistics and vaporizer sizing for LPG; mother and daughter station design, cascade storage and dispensing capacity for CNG; and the conversion economics against petrol and diesel with the payback and the emissions avoided.'),
      ('energy-utilities-efficiency', 'Energy & Utilities Efficiency Studio',
       'Fired heater and boiler efficiency by the indirect stack-loss method, excess air optimization with the fuel saving quantified, steam system screening, energy intensity benchmarking per unit, and heat integration targeting from your own stream table. Every recommendation priced in both money and tonnes of CO2.'),
      ('carbon-footprint-abatement', 'Carbon Footprint & Abatement Studio',
       'Scope 1 and 2 inventory assembled from the same stream and fuel data the rest of the module already holds, so the carbon ledger is native rather than reconciled: combustion, flaring and venting on versioned emission factors, carbon intensity per tonne of product, and a marginal abatement cost curve that ranks what to do first.'),
      ('flare-gas-to-value', 'Flare Gas to Value Studio',
       'Screening for what to do with flared and associated gas: CNG, mini LNG, LPG extraction or gas to power matched to the volume and composition you actually have, with capex and opex, full economics through the Petroleum Economics engine, and the emissions abated with carbon credit sensitivity.')
    ) as t(slug, app_name, description)
  loop
    if exists (select 1 from public.master_apps where slug = rec.slug) then
      update public.master_apps
      set module = 'Midstream & Downstream',
          module_id = v_module_id,
          description = rec.description,
          updated_at = now()
      where slug = rec.slug;
    else
      v_order := v_order + 1;
      tmpl.id := gen_random_uuid();
      tmpl.slug := rec.slug;
      tmpl.app_name := rec.app_name;
      tmpl.description := rec.description;
      tmpl.module := 'Midstream & Downstream';
      tmpl.module_id := v_module_id;
      -- Honest from the first day: nothing here is built yet.
      tmpl.status := 'Coming Soon';
      tmpl.is_built := false;
      tmpl.is_functional := false;
      tmpl.display_order := v_order;
      tmpl.created_at := now();
      tmpl.updated_at := now();
      insert into public.master_apps values (tmpl.*);
    end if;
  end loop;
end $$;
