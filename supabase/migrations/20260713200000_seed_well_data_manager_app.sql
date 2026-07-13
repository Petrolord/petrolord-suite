-- Well Data Manager G1.5 (docs/scope/WellDataManager-PLAN.md decision
-- 7): register the app in master_apps so it appears as a tile on the
-- Geoscience dashboard. Flipped Active only NOW — the app UI (G1.3)
-- and the Seismolord registry migration (G1.4) both work, and the
-- route ships in the same PR as this migration (the deploy lesson:
-- tile and route ship together).
--
-- Functional name, no "-lord" branding (Geoscience-ROADMAP.md §6.2,
-- locked); slug well-data-manager; pricing inherited flat from the
-- template row (§6.4: flat 899 for now).
--
-- Same %ROWTYPE template-copy pattern as the seismolord seed
-- (20260710120500): copy an existing geoscience row and override only
-- identity/display fields so module, module_id, price and any future
-- columns stay schema-correct. Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'well-data-manager') then
    raise notice 'master_apps: well-data-manager already present — skipping';
    return;
  end if;

  -- Seismolord is the natural sibling (same module, Active, current);
  -- fall back to any geoscience row.
  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'seismolord') desc,
            (slug = 'reservoircalc-pro') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping well-data-manager seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'well-data-manager';
  tmpl.app_name      := 'Well Data Manager';
  tmpl.description   := 'Shared subsurface well registry: well headers, deviation surveys, LAS log import with SI unit handling, formation tops and checkshots — private by default, shareable read-only with your organization, and consumed directly by Seismolord and every geoscience app.';
  tmpl.icon_url      := 'Database';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded well-data-manager (module/module_id inherited from template)';
end $$;
