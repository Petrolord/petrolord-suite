-- Drilling D11 launch: seed the Well Cost & Time Estimator tile (fresh
-- slug well-cost-time, templated from the well-planning row so it lands
-- in the Drilling module). The retired WellCostIQ mock never had a live
-- tile (verified 2026-08-29), so there is nothing to repoint. %ROWTYPE
-- sibling-copy pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Well Cost & Time Estimator';
  v_desc text := 'Build the drilling schedule activity by activity, roll it '
    || 'up into an AFE-grade cost estimate with tangible and intangible '
    || 'lines, and quantify the uncertainty with a seeded Monte Carlo '
    || 'P10/P50/P90 on your planned wellbores.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'well-cost-time'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'well-cost-time') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'well-cost-time';
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
    tmpl.slug := 'well-cost-time';
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
end $$;
