-- Register Seismolord in master_apps so it appears as a tile on the
-- Geoscience dashboard (ApplicationsGrid reads master_apps; the route is
-- derived as /dashboard/apps/${module}/${slug} by useAppsFromDatabase).
--
-- Same %ROWTYPE template-copy pattern as
-- 20260708130000_seed_recovery_factor_estimator_app.sql: copy an existing
-- geoscience row and override only identity/display fields, so module,
-- module_id, price and any future columns stay schema-correct.
-- Idempotent and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  -- Idempotent: nothing to do if the app is already catalogued.
  if exists (select 1 from public.master_apps where slug = 'seismolord') then
    raise notice 'master_apps: seismolord already present — skipping';
    return;
  end if;

  -- Prefer a known geoscience sibling as the template; fall back to any geoscience row.
  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
   order by (slug = 'reservoircalc-pro') desc,
            (slug = 'earthmodel-studio') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping seismolord seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'seismolord';
  tmpl.app_name      := 'Seismolord';
  tmpl.description   := 'Seismic interpretation: SEG-Y loading, inline/crossline/time-slice viewing, horizon and fault picking, surface gridding, and export to XYZ / CPS-3 / ZMAP+ for downstream apps.';
  tmpl.icon_url      := 'Waves';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded seismolord (module/module_id inherited from template)';
end $$;
