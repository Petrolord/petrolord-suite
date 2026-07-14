-- Rock Physics Studio G6.5 close-out (docs/scope/
-- RockPhysicsStudio-PLAN.md): register the app as a Geoscience tile,
-- Active. The workstation (G6.4) works end-to-end and the route ships
-- in the same PR (the deploy lesson). Functional name per roadmap
-- §6.2, slug rock-physics-studio — a NEW row; the archived
-- rock-physics-analyzer vaporware row stays archived (catalog closed
-- 2026-07-13, never revive archived rows). Same %ROWTYPE
-- template-copy pattern as the sibling geoscience seeds. Idempotent
-- and self-skipping.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'rock-physics-studio') then
    raise notice 'master_apps: rock-physics-studio already present — skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where lower(module) = 'geoscience'
     and status = 'Active'
   order by (slug = 'mapping-surface-studio') desc,
            (slug = 'petrophysics-studio') desc,
            (slug = 'seismolord') desc,
            display_order asc nulls last
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no geoscience template row found — skipping rock-physics-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'rock-physics-studio';
  tmpl.app_name      := 'Rock Physics Studio';
  tmpl.description   := 'Quantitative interpretation on the shared well registry: Batzle-Wang pore fluids, Gassmann fluid substitution on log intervals, exact-Zoeppritz AVO with intercept-gradient crossplots and Rutherford-Williams classes, and wedge synthetics with tuning analysis.';
  tmpl.icon_url      := 'Waves';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);

  raise notice 'master_apps: seeded rock-physics-studio (module/module_id inherited from template)';
end $$;
