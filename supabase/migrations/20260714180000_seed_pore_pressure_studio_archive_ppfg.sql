-- Pore Pressure Studio P4 close-out (docs/scope/PorePressure-PLAN.md,
-- approved as drafted 2026-07-14: Q1 new Geoscience tile, Q2 retire
-- the legacy PPFG shell).
--
-- 1) Seed the pore-pressure-studio Geoscience tile, Active — the
--    route ships in the same PR (the deploy lesson). %ROWTYPE
--    template-copy pattern as the sibling geoscience seeds.
--    Idempotent and self-skipping. The Archived aspirational rows
--    pressure-prediction-system / pressure-compartment-analyzer stay
--    archived (catalog closed 2026-07-13, never revive).
-- 2) Archive the Drilling pore-pressure-frac-gradient tile (ARCHIVE
--    not DELETE, house pattern): its 88-component UI carried ZERO
--    computation (Eaton existed as a slider default and help text),
--    so the Active/built/functional row misadvertised a shell. Its
--    route now redirects to the successor in the SPA.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
  n int;
begin
  -- ---- 1) seed the new Geoscience tile ------------------------------------
  if exists (select 1 from public.master_apps where slug = 'pore-pressure-studio') then
    raise notice 'master_apps: pore-pressure-studio already present — skipping seed';
  else
    select * into tmpl
      from public.master_apps
     where lower(module) = 'geoscience'
       and status = 'Active'
     order by (slug = 'rock-physics-studio') desc,
              (slug = 'petrophysics-studio') desc,
              (slug = 'seismolord') desc,
              display_order asc nulls last
     limit 1;

    if tmpl.id is null then
      raise notice 'master_apps: no geoscience template row found — skipping pore-pressure-studio seed';
    else
      select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

      tmpl.id            := gen_random_uuid();
      tmpl.slug          := 'pore-pressure-studio';
      tmpl.app_name      := 'Pore Pressure Studio';
      tmpl.description   := 'Pore-pressure and fracture-gradient prognosis on the shared well registry: Eaton and Bowers methods with normal-compaction-trend fitting, density or Gardner overburden, Seismolord velocity-model trends, and publishable PP/FP/OBG curves.';
      tmpl.icon_url      := 'Gauge';
      tmpl.status        := 'Active';
      tmpl.is_built      := true;
      tmpl.is_functional := true;
      tmpl.display_order := next_order;
      tmpl.created_at    := now();
      tmpl.updated_at    := now();

      insert into public.master_apps values (tmpl.*);
      raise notice 'master_apps: seeded pore-pressure-studio (module/module_id inherited from template)';
    end if;
  end if;

  -- ---- 2) archive the legacy Drilling PPFG shell ---------------------------
  update public.master_apps
     set status = 'Archived', updated_at = now()
   where slug = 'pore-pressure-frac-gradient'
     and status <> 'Archived';
  get diagnostics n = row_count;
  raise notice 'master_apps: archived % pore-pressure-frac-gradient tile(s)', n;
end $$;
