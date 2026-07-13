-- Well Correlation G3.3 close-out (docs/scope/WellCorrelation-PLAN.md
-- decision 7): register the app as a Geoscience tile. Flipped Active
-- only NOW — the cross-section workstation (G3.2) works end-to-end and
-- the route ships in the same PR (the deploy lesson).
--
-- Functional name per §6.2, slug well-correlation. The legacy
-- `well-correlation-tool` tile is already Archived
-- (20260712200000-era catalog); its route now redirects to this
-- successor in the SPA, so nothing to change there.
--
-- Same %ROWTYPE template-copy pattern as the seismolord / well-data-
-- manager / petrophysics-studio seeds; flat 899 inherited (§6.4).
-- Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'well-correlation') then
    raise notice 'master_apps: well-correlation already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'well-data-manager') desc,
            (slug = 'petrophysics-studio') desc,
            (slug = 'seismolord') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping well-correlation seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'well-correlation';
  tmpl.app_name      := 'Well Correlation';
  tmpl.description   := 'Multi-well stratigraphic correlation on the shared well registry: cross-sections along a picked well path, datum flattening on any top, formation-top picking, drag-editing and propagation, and zone fills — tops write back to the registry so Seismolord and Mapping see them with no re-import.';
  tmpl.icon_url      := 'GitCompare';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded well-correlation (module/module_id inherited from template)';
end $$;
