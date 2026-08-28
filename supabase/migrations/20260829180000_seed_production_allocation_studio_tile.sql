-- Production P3: seed the Production Allocation Studio tile (fresh slug
-- production-allocation-studio, templated from the nodal-analysis-engine
-- row so it lands in the Production module). The archived shells it
-- replaces (allocation, virtual metering, multiphase flow meter,
-- production data QC) were archived at P0 and are never revived.
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
  v_name text := 'Production Allocation Studio';
  v_desc text := 'Back-allocate metered facility totals across your wells '
    || 'by well test and hours on stream, QC the tests behind the split '
    || 'against their own history and the daily ledger, reconcile the '
    || 'meter against what the wells booked, and write monthly '
    || 'allocation factors back to the production data spine.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'production-allocation-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'production-allocation-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'production-allocation-studio';
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
    tmpl.slug := 'production-allocation-studio';
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
