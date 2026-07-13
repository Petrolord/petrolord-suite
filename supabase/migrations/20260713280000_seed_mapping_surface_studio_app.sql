-- Mapping & Surface Studio G4.4 close-out (docs/scope/
-- MappingSurfaceStudio-PLAN.md decision 8): register the app as a
-- Geoscience tile, Active. The workstation (G4.3) works end-to-end and
-- the route ships in the same PR (the deploy lesson). Functional name
-- per §6.2, slug mapping-surface-studio; flat 899 inherited (§6.4).
-- Same %ROWTYPE template-copy pattern as the sibling geoscience seeds.
-- Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'mapping-surface-studio') then
    raise notice 'master_apps: mapping-surface-studio already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'well-correlation') desc,
            (slug = 'petrophysics-studio') desc,
            (slug = 'seismolord') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping mapping-surface-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'mapping-surface-studio';
  tmpl.app_name      := 'Mapping & Surface Studio';
  tmpl.description   := 'Gridding and contouring on the shared subsurface registry: map well tops and zone attributes, import Seismolord horizons and third-party grids, do surface math (isochores, depth conversion), and publish surfaces to the registry for volumetrics — no filesystem round-trip.';
  tmpl.icon_url      := 'Map';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded mapping-surface-studio (module/module_id inherited from template)';
end $$;
