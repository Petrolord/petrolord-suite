-- Production P5: seed the ESP Design Studio tile (fresh slug
-- esp-design-studio, templated from the nodal-analysis-engine row so it
-- lands in the Production module). The archived shells it replaces (the
-- ESP Performance Monitor, whose diagnostics are now this studio's
-- Diagnostics tab, and the Artificial Lift Designer's removed ESP
-- design tab) were archived at P0 and are never revived.
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
  v_name text := 'ESP Design Studio';
  v_desc text := 'Size an electrical submersible pump on validated '
    || 'engines: total dynamic head from the inflow and a real flowing '
    || 'traverse rather than a static column, staging against the '
    || 'vendor''s own pump curve, affinity laws for variable speed, the '
    || 'gas volume fraction that decides standard stage against gas '
    || 'handler, motor and cable selection on published copper data, '
    || 'and diagnostics that read a running installation back against '
    || 'the same curve.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'esp-design-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'esp-design-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'esp-design-studio';
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
    tmpl.slug := 'esp-design-studio';
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
