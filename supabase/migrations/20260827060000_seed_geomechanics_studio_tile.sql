-- Drilling D5 launch: seed the Geomechanics & Wellbore Stability Studio
-- tile (fresh slug geomechanics-studio). The archived
-- 1d-mechanical-earth-model row stays archived (20260712220000 precedent:
-- archive preserves entitlement/history references; the legacy MEM tree is
-- deleted from the codebase at D5). %ROWTYPE sibling-copy pattern;
-- idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Geomechanics & Wellbore Stability Studio';
  v_desc text := '1D mechanical earth models from registry logs and the '
    || 'published pore pressure prognosis, with full-tensor wellbore '
    || 'stability and mud weight windows along your planned trajectories, '
    || 'validated against independent oracles.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'geomechanics-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'geomechanics-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'geomechanics-studio';
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
  tmpl.slug := 'geomechanics-studio';
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
