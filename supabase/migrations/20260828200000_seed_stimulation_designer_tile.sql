-- Drilling D9 launch: seed the Stimulation Designer tile (fresh slug
-- stimulation-designer, templated from the well-planning row so it lands
-- in the Drilling module) AND refresh the long-archived
-- frac-completion-app row's description to point here (it stays
-- Archived; its route already redirects). %ROWTYPE sibling-copy pattern;
-- idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Stimulation Designer';
  v_desc text := 'Design hydraulic fracturing and matrix acidizing on your '
    || 'planned wellbores: PKN and KGD geometry, Nolte pump schedule and '
    || 'proppant selection, Cinco-Ley productivity against the 1.6 optimum, '
    || 'and Hawkins damage removal, with closure stress from your published '
    || 'geomechanics curves.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'stimulation-designer'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'stimulation-designer') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'stimulation-designer';
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
    tmpl.slug := 'stimulation-designer';
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

  -- The superseded mock stays Archived; point its description at the
  -- rebuild (never deleted).
  update public.master_apps
  set description = 'Superseded by Stimulation Designer (Drilling module). '
        || 'The route redirects there.',
      updated_at = now()
  where slug = 'frac-completion-app'
    and status = 'Archived';
end $$;
