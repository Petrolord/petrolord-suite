-- Register the Aquifer Influx Calculator in master_apps so it appears as a tile
-- on the Reservoir Engineering dashboard (ApplicationsGrid reads master_apps).
--
-- The app's code (route, page, engine, tests) already ships in the repo; only the
-- catalog row was missing. Like the sibling reservoir apps, we COPY an existing
-- built reservoir row via %ROWTYPE and override only the identity/display fields.
-- This inherits module, module_id, price and any other columns automatically, so
-- the new row is schema-correct. Idempotent and self-skipping.
--
-- master_apps columns (verified against remote): id, app_name, module, description,
-- icon_url, status, is_functional, display_order, created_at, updated_at, is_built,
-- slug, module_id, price. (No separate `name`/`icon` columns.)

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  -- Idempotent: nothing to do if the app is already catalogued.
  if exists (select 1 from public.master_apps where slug = 'aquifer-influx-calculator') then
    raise notice 'master_apps: aquifer-influx-calculator already present — skipping';
    return;
  end if;

  -- Prefer a known sibling as the template; fall back to any reservoir row.
  select * into tmpl
    from public.master_apps
   where lower(module) = 'reservoir'
   order by (slug = 'recovery-factor-estimator') desc,
            (slug = 'voidage-replacement-monitor') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no reservoir template row found — skipping aquifer-influx-calculator seed';
    return;
  end if;

  -- Append after the current last app.
  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  -- Override only the identity/display fields; everything else (module, module_id,
  -- price, timestamps, …) is inherited from the template reservoir row.
  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'aquifer-influx-calculator';
  tmpl.app_name      := 'Aquifer Influx Calculator';
  tmpl.description   := 'Compute cumulative water influx We(t) from a reservoir-boundary pressure history using the van Everdingen-Hurst, Fetkovich, or Carter-Tracy aquifer models.';
  tmpl.icon_url      := 'Waves';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded aquifer-influx-calculator (module/module_id inherited from template)';
end $$;
