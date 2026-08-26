-- S0 (Reservoir Simulation Studio, docs/scope/ReservoirSimulationStudio-
-- STATUS.md): register the Reservoir Simulation Studio tile in master_apps.
-- Deck-first V1: upload or template an Eclipse-style deck, run it on the
-- OPM Flow worker, chart the summary vectors. The old
-- reservoir-simulation-connector row (Archived by the R0 honest-catalog
-- pass, 20260716200000) stays Archived; its route redirect repoints to
-- this app in the same upload.
--
-- Standard %ROWTYPE sibling copy; idempotent and self-skipping.
-- DEPLOY RULE (2026-07-07 lesson): apply WITH the prod upload that
-- carries the route — never before. HELD until the S2 upload.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'reservoir-simulation-studio') then
    raise notice 'master_apps: reservoir-simulation-studio already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'reservoir'
   order by (slug = 'scal-studio') desc,
            (slug = 'forecast-scenario-hub') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no reservoir template row found — skipping reservoir-simulation-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'reservoir-simulation-studio';
  tmpl.app_name      := 'Reservoir Simulation Studio';
  tmpl.description   := 'Run black-oil reservoir simulations on the open-source OPM Flow engine. Upload an Eclipse-format deck or start from an SPE benchmark template, queue the run, and chart field and well production, pressures and water cut. Cases and results save to your account.';
  tmpl.icon_url      := 'Cuboid';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded reservoir-simulation-studio (module/module_id inherited from template)';
end $$;
