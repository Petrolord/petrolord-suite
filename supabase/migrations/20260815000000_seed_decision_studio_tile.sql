-- D5 (Economics-ROADMAP.md): seed the Decision Studio tile in master_apps.
--
-- DEPLOY-GATED: apply ONLY after the production upload that ships the
-- apps/economics/decision-studio route (master_apps deploy lesson: an
-- Active tile's card appears everywhere immediately and 404s on a build
-- without the route). Tracked NOT YET APPLIED in MIGRATIONS.md until the
-- gate clears.
--
-- Same %ROWTYPE sibling-copy pattern as the aquifer-influx-calculator
-- seed: copy an existing Economics row and override identity/display
-- fields so module/module_id/price stay schema-correct. Idempotent.

do $$
declare
  tmpl public.master_apps%rowtype;
  next_order int;
begin
  if exists (select 1 from public.master_apps where slug = 'decision-studio') then
    raise notice 'master_apps: decision-studio already present, skipping';
    return;
  end if;

  select * into tmpl
    from public.master_apps
   where slug in ('capital-portfolio-studio', 'epe-suite', 'petroleum-economics-studio')
   order by (slug = 'capital-portfolio-studio') desc
   limit 1;

  if tmpl.id is null then
    raise notice 'master_apps: no economics template row found, skipping decision-studio seed';
    return;
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.master_apps;

  tmpl.id            := gen_random_uuid();
  tmpl.slug          := 'decision-studio';
  tmpl.app_name      := 'Decision Studio';
  tmpl.description   := 'Executive decision briefs on validated engines: probabilistic economics, decision trees with value of information, and risked capital allocation, with provenance on every number.';
  tmpl.status        := 'Active';
  tmpl.is_built      := true;
  tmpl.is_functional := true;
  tmpl.display_order := next_order;
  tmpl.created_at    := now();
  tmpl.updated_at    := now();

  insert into public.master_apps values (tmpl.*);
end $$;
