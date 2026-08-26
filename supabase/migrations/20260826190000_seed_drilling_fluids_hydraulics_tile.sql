-- Drilling D2 launch: Drilling Fluids & Hydraulics Studio tile (slug
-- drilling-fluids-hydraulics). The slug is roadmap-locked to the REBUILT
-- app (Drilling-ROADMAP.md §2), so this update-in-place REACTIVATES the
-- D0-archived row with the launch copy — the documented exception to the
-- never-revive rule. %ROWTYPE sibling-copy fallback if the row is absent.
-- Idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with 20260826140000 (Torque & Drag Studio) and the
-- later D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Drilling Fluids & Hydraulics Studio';
  v_desc text := 'Mud rheology, circulating pressure losses, ECD, surge and '
    || 'swab, and hole cleaning on your planned trajectories, validated '
    || 'against independent oracles. Shares hole geometry with Torque & '
    || 'Drag Studio and overlays the published pore pressure window.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'drilling-fluids-hydraulics'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'drilling-fluids-hydraulics') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'drilling-fluids-hydraulics';
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
  tmpl.slug := 'drilling-fluids-hydraulics';
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
