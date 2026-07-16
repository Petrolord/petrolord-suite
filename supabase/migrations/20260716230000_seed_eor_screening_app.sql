-- R4 (Reservoir-ROADMAP.md §3): register EOR Screening in master_apps.
-- The honest replacement for the ARCHIVED eor-designer shell (whose
-- compute called an edge function that never existed): a pure
-- client-side technical-screening tool on the published Taber, Martin
-- & Seright (1997) criteria tables, jest-tested. Per the module
-- non-goal, the archived tile is NOT revived — a new tile ships with
-- working code behind it.
--
-- Standard %ROWTYPE sibling copy; idempotent and self-skipping.
-- DEPLOY RULE (2026-07-07 lesson): apply WITH the prod upload that
-- carries the route — never before.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'eor-screening') then
    raise notice 'master_apps: eor-screening already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'reservoir'
   order by (slug = 'recovery-factor-estimator') desc,
            (slug = 'aquifer-influx-calculator') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no reservoir template row found — skipping eor-screening seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'eor-screening';
  tmpl.app_name      := 'EOR Screening';
  tmpl.description   := 'Screen a reservoir against the published Taber-Martin-Seright (1997) EOR criteria: per-method pass/fail on gravity, viscosity, saturation, formation, permeability, depth and temperature, with honest not-scored handling of missing inputs.';
  tmpl.icon_url      := 'FlaskConical';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded eor-screening (module/module_id inherited from template)';
end $$;
