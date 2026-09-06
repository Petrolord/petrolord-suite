-- Wellsite Studio close-out (docs/scope/WellsiteStudio-PLAN.md section 5,
-- WS9; Geoscience-ROADMAP.md Phase G10): register the app as the twelfth
-- Geoscience tile. Active only NOW, with WS0 to WS9 shipped and the help
-- guide in the same PR (the deploy lesson: a tile never points at a route
-- production does not serve yet). DEPLOY-GATED: apply after the
-- production upload that carries the routes is verified.
--
-- Same %ROWTYPE template-copy pattern as the stratigraphy seed
-- (20260906230000); flat 899 inherited. Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'wellsite-studio') then
    raise notice 'master_apps: wellsite-studio already present, skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'stratigraphy-studio') desc,
            (slug = 'well-correlation') desc,
            (slug = 'well-data-manager') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found, skipping wellsite-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'wellsite-studio';
  tmpl.app_name      := 'Wellsite Studio';
  tmpl.description   := 'The geological command centre for a live well, offline first: lag and sample scheduling, structured cuttings descriptions with operator abbreviations, hydrocarbon shows with a derived quality, manual gas and drilling observations, photographs, formation tops with interpretation, decision and version lifecycle, the operational timeline, shift handovers and daily geological reports generated from the record and signed, all shared with the office without last-writer-wins and published to the well registry.';
  tmpl.icon_url      := 'HardHat';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded wellsite-studio (module/module_id inherited from template)';
end $$;
