-- Drilling D4 launch: seed the Cementing Studio tile (fresh slug
-- cementing-studio; the archived cementing-simulation-app row stays
-- archived, never revived). %ROWTYPE sibling-copy pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Cementing Studio';
  v_desc text := 'Primary cement job design on your planned wells: volumes '
    || 'and sacks, plug-flow placement with U-tube, free fall and ECD, '
    || 'API 10D centralization and an honest quality checklist, validated '
    || 'against independent oracles.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'cementing-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'cementing-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'cementing-studio';
    if name_taken then
      raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
    end if;
    return;
  end if;

  select * into tmpl from public.master_apps where slug = 'well-planning' limit 1;
  if tmpl.id is null then
    select * into tmpl from public.master_apps where module is not null limit 1;
  end if;
  if tmpl.id is null then
    raise notice 'master_apps is empty; nothing to template from. Seed skipped.';
    return;
  end if;

  tmpl.id := gen_random_uuid();
  tmpl.slug := 'cementing-studio';
  tmpl.app_name := v_name;
  tmpl.description := v_desc;
  tmpl.status := 'Active';
  tmpl.is_built := true;
  tmpl.is_functional := true;
  tmpl.created_at := now();
  tmpl.updated_at := now();
  select coalesce(max(display_order), 0) + 1 into tmpl.display_order from public.master_apps;

  insert into public.master_apps values (tmpl.*);
end $$;
