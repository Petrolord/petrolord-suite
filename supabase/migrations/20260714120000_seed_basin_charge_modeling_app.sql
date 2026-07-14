-- BasinFlow Genesis G7.4 close-out (docs/scope/BasinFlow-PLAN.md):
-- register the upgraded app as a Geoscience tile, Active. The route
-- apps/geoscience/basinflow-genesis has existed all along (the app was
-- route-only, no tile — G0 audit), so the slug matches the existing
-- route. Functional tile name per roadmap tile #8 "Basin & Charge
-- Modeling" (plan Q1 recommendation). The archived basin-modeling-suite
-- marketing row stays archived (catalog closed 2026-07-13, never
-- revive archived rows). Same %ROWTYPE template-copy pattern as the
-- sibling geoscience seeds. Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'basinflow-genesis') then
    raise notice 'master_apps: basinflow-genesis already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
     and status = 'Active'
   order by (slug = 'rock-physics-studio') desc,
            (slug = 'mapping-surface-studio') desc,
            (slug = 'seismolord') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping basinflow-genesis seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'basinflow-genesis';
  tmpl.app_name      := 'Basin & Charge Modeling';
  tmpl.description   := '1D basin and petroleum-systems modeling: solid-thickness-conserving burial history, transient heat flow with erosion and paleo-heat-flow histories, published Sweeney-Burnham Easy%Ro maturity, TOC/HI mass-based generation and expulsion, with Ro/BHT calibration auto-fit and sensitivity analysis — validated against an independent oracle.';
  tmpl.icon_url      := 'Flame';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded basinflow-genesis (module/module_id inherited from template)';
end $$;
