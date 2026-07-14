-- Earth Modeling G8.4 close-out (docs/scope/EarthModeling-PLAN.md):
-- register the app as a Geoscience tile, Active — the 10th and final
-- tile of the Geoscience roadmap. The workstation (G8.2) works
-- end-to-end and the route ships in the same PR (the deploy lesson).
-- Functional name per roadmap §6.2, slug earth-modeling — a NEW row;
-- the archived earthmodel-studio / earthmodel-pro rows stay archived
-- (G0 archive, never revive archived rows; the Seismolord seed's
-- template-preference lookup only READS earthmodel-studio, unaffected).
-- Same %ROWTYPE template-copy pattern as the sibling geoscience seeds.
-- Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'earth-modeling') then
    raise notice 'master_apps: earth-modeling already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
     and status = 'Active'
   order by (slug = 'mapping-surface-studio') desc,
            (slug = 'petrophysics-studio') desc,
            (slug = 'seismolord') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping earth-modeling seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'earth-modeling';
  tmpl.app_name      := 'Earth Modeling';
  tmpl.description   := 'Layer-cake earth modeling on the shared subsurface registry: structural frameworks stacked from mapped surfaces with clamp QC, fault-block zonation, per-zone property population from petrophysics zone averages (constant, trend, simple kriging), zone volumes per fault block, and GRV-ready surface publishing to volumetrics.';
  tmpl.icon_url      := 'Mountain';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded earth-modeling (module/module_id inherited from template)';
end $$;
