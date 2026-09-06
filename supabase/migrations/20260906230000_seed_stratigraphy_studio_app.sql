-- Stratigraphy Studio close-out (docs/scope/Stratigraphy-PLAN.md decision
-- 10, Geoscience-ROADMAP.md Phase G9): register the app as the eleventh
-- Geoscience tile. Flipped Active only NOW, with the ST0 to ST5 routes
-- shipped and the help guide in the same PR (the deploy lesson: a tile
-- never points at a route production does not serve yet). DEPLOY-GATED:
-- apply after the production upload that carries the routes is verified.
--
-- Same %ROWTYPE template-copy pattern as the well-correlation seed
-- (20260713250000); flat 899 inherited. Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'stratigraphy-studio') then
    raise notice 'master_apps: stratigraphy-studio already present, skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'well-correlation') desc,
            (slug = 'well-data-manager') desc,
            (slug = 'petrophysics-studio') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found, skipping stratigraphy-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'stratigraphy-studio';
  tmpl.app_name      := 'Stratigraphy Studio';
  tmpl.description   := 'The stratigraphic framework on the shared well registry: a stratigraphic column with ages and colours, sequence-stratigraphic surface types on the shared tops (Catuneanu stored, Exxon terminology as a display option), lithology, core and facies interval logs with core photos, systems tracts and a Wheeler chart on the shared section, age-depth plots, biozones and a Basin handoff, net-sand and facies maps in Mapping, and flattening, stratal slices and terminations in Seismolord.';
  tmpl.icon_url      := 'Layers';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded stratigraphy-studio (module/module_id inherited from template)';
end $$;
