-- R5 (Reservoir-ROADMAP.md §3): register the Forecast Scenario Hub in
-- master_apps. The reservoir-side successor to the archived
-- scenario-planner shell (dead scenario-planner-engine; archived tile
-- NOT revived per the no-revival rule): a real multi-case Arps
-- forecast comparator on the shared, tested DCA engine, with
-- Supabase-persisted scenario sets and an annual-profile handoff to
-- the Economics module's NPV Scenario Builder (the R5 scope split:
-- Reservoir forecasts, Economics values).
--
-- Standard %ROWTYPE sibling copy; idempotent and self-skipping.
-- DEPLOY RULE (2026-07-07 lesson): apply WITH the prod upload that
-- carries the route — never before.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'forecast-scenario-hub') then
    raise notice 'master_apps: forecast-scenario-hub already present — skipping';
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
    raise notice 'master_apps: no reservoir template row found — skipping forecast-scenario-hub seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'forecast-scenario-hub';
  tmpl.app_name      := 'Forecast Scenario Hub';
  tmpl.description   := 'Compare multi-case Arps production forecasts side by side: EUR, time to economic limit, cumulative milestones and indicative case economics, with annual-profile export to NPV Scenario Builder.';
  tmpl.icon_url      := 'GitBranch';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded forecast-scenario-hub (module/module_id inherited from template)';
end $$;
