-- Drilling D7 launch: seed the Completion Design Studio tile (fresh slug
-- completion-design-studio, templated from the well-planning row so it
-- lands in the Drilling module) AND archive the absorbed Production
-- well-schematic-designer tile (roadmap §2 item 8; its route now redirects
-- to the Studio and its code tree is deleted at D7). %ROWTYPE sibling-copy
-- pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Completion Design Studio';
  v_desc text := 'Architect completion strings on your planned wellbores: '
    || 'catalog components with API 5CT drift and run-in clearance checks, '
    || 'wireline through-bore access, capacities and seal space-out, a '
    || 'to-scale schematic with bill of materials, and tubing sizing '
    || 'screened with the validated nodal engine.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'completion-design-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'completion-design-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'completion-design-studio';
    if name_taken then
      raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
    end if;
  else
    select * into tmpl from public.master_apps where slug = 'well-planning' limit 1;
    if tmpl.id is null then
      select * into tmpl from public.master_apps where module is not null limit 1;
    end if;
    if tmpl.id is null then
      raise notice 'master_apps is empty; nothing to template from. Seed skipped.';
      return;
    end if;

    tmpl.id := gen_random_uuid();
    tmpl.slug := 'completion-design-studio';
    tmpl.app_name := v_name;
    tmpl.description := v_desc;
    tmpl.status := 'Active';
    tmpl.is_built := true;
    tmpl.is_functional := true;
    tmpl.created_at := now();
    tmpl.updated_at := now();
    select coalesce(max(display_order), 0) + 1 into tmpl.display_order from public.master_apps;

    insert into public.master_apps values (tmpl.*);
  end if;

  -- Absorb: archive the Production Well Schematic Designer row (archive
  -- preserves entitlement/history references; never deleted).
  update public.master_apps
  set status = 'Archived',
      description = 'Absorbed by Completion Design Studio (Drilling module). '
        || 'The route redirects there.',
      updated_at = now()
  where slug = 'well-schematic-designer'
    and status <> 'Archived';
end $$;
