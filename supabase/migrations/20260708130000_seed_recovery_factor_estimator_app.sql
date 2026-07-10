-- Register the Recovery Factor Estimator in master_apps so it appears as a tile
-- on the Reservoir Engineering dashboard (ApplicationsGrid reads master_apps).
--
-- The app's code (route, page, engine, tests) already ships in the repo; only the
-- catalog row was missing. The sibling reservoir apps (voidage-replacement-monitor,
-- fractional-flow-calculator) were seeded directly in the live DB and have no
-- migration.
--
-- Rather than hard-code every column, we COPY an existing built reservoir row via
-- %ROWTYPE and override only the identity/display fields. This inherits module,
-- module_id, price and any other columns automatically, so the new row is
-- schema-correct. Idempotent and self-skipping.
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
  if exists (select 1 from public.master_apps where slug = 'recovery-factor-estimator') then
    raise notice 'master_apps: recovery-factor-estimator already present — skipping';
    return;
  end if;

  -- Prefer a known sibling as the template; fall back to any reservoir row.
  select * into tmpl
    from public.master_apps
   where lower(module) = 'reservoir'
   order by (slug = 'voidage-replacement-monitor') desc,
            (slug = 'fractional-flow-calculator') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no reservoir template row found — skipping recovery-factor-estimator seed';
    return;
  end if;

  -- Append after the current last app.
  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  -- Override only the identity/display fields; everything else (module, module_id,
  -- price, timestamps, …) is inherited from the template reservoir row.
  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'recovery-factor-estimator';
  tmpl.app_name      := 'Recovery Factor Estimator';
  tmpl.description   := 'Estimate recovery factor from drive-mechanism analogs, API-1967 correlations, or gas p/z depletion, and convert OOIP/OGIP into recoverable reserves with a low/typical/high band.';
  tmpl.icon_url      := 'Percent';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded recovery-factor-estimator (module/module_id inherited from template)';
end $$;
