-- Production P7: seed the Gas Well Performance Studio tile (fresh slug
-- gas-well-performance-studio, templated from the nodal-analysis-engine
-- row so it lands in the Production module). The archived shells it
-- replaces (Liquid Loading Monitor, Plunger Lift Controller) were
-- archived at P0 and are never revived.
-- %ROWTYPE sibling-copy pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-27, Production-ROADMAP.md §6.6): apply live only with the ONE
-- prod upload that ships the finished Production Operations module,
-- together with the other held P-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Gas Well Performance Studio';
  v_desc text := 'Gas well deliverability, liquid loading and plunger '
    || 'lift on validated engines: the Turner and Coleman droplet '
    || 'balance derived from drag and the critical Weber number rather '
    || 'than quoted, the critical rate profile down the whole string so '
    || 'the shoe controls rather than the wellhead, the reservoir '
    || 'pressure at which the well will start to load, tubing '
    || 'screening, and plunger feasibility from a static force balance '
    || 'with the gas-liquid ratio computed rather than assumed.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'gas-well-performance-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'gas-well-performance-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'gas-well-performance-studio';
    if name_taken then
      raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
    end if;
  else
    select * into tmpl from public.master_apps where slug = 'nodal-analysis-engine' limit 1;
    if tmpl.id is null then
      select * into tmpl from public.master_apps where lower(module) = 'production' limit 1;
    end if;
    if tmpl.id is null then
      raise notice 'no Production template row found; seed skipped.';
      return;
    end if;

    tmpl.id := gen_random_uuid();
    tmpl.slug := 'gas-well-performance-studio';
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
