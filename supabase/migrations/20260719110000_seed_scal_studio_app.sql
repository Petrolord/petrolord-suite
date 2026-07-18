-- SC6 (SCAL Studio, docs/scope/SCALStudio-STATUS.md): register the SCAL
-- Studio tile in master_apps. The thin-real SCAL build locked in
-- ReservoirEngineering-Module.md 4.2: Corey relative permeability curve
-- design with fitting to core data, plus capillary pressure via the
-- Leverett J-function and saturation-height profiles. When this ships,
-- SCAL Studio becomes the rel-perm home and the renamed
-- relative-permeability-designer alias tile archives (companion migration
-- 20260719110500).
--
-- Standard %ROWTYPE sibling copy; idempotent and self-skipping.
-- DEPLOY RULE (2026-07-07 lesson): apply WITH the prod upload that
-- carries the route — never before.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'scal-studio') then
    raise notice 'master_apps: scal-studio already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'reservoir'
   order by (slug = 'forecast-scenario-hub') desc,
            (slug = 'recovery-factor-estimator') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no reservoir template row found — skipping scal-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'scal-studio';
  tmpl.app_name      := 'SCAL Studio';
  tmpl.description   := 'Design Corey relative permeability curves and fit them to core data, build Leverett J-function capillary pressure from lab measurements, and generate saturation-height profiles. Sends curves to the Waterflood Design Studio; projects save to your account.';
  tmpl.icon_url      := 'FlaskConical';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded scal-studio (module/module_id inherited from template)';
end $$;
