-- Drilling D10 launch: seed the Well Integrity & P&A Studio tile (fresh
-- slug well-integrity-pa, templated from the well-planning row so it
-- lands in the Drilling module) AND refresh the long-archived
-- well-abandonment-plan row's description to point here (it stays
-- Archived). %ROWTYPE sibling-copy pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Well Integrity & P&A Studio';
  v_desc text := 'Keep the life-of-well safety case honest: verify well '
    || 'barrier envelopes with the two-barrier traffic light, set annulus '
    || 'pressure limits (MAASP and MAWOP), design balanced cement plugs, '
    || 'and build the rule-checked abandonment program on your planned '
    || 'wellbores.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'well-integrity-pa'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'well-integrity-pa') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'well-integrity-pa';
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
    tmpl.slug := 'well-integrity-pa';
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
  set description = 'Superseded by Well Integrity & P&A Studio (Drilling '
        || 'module).',
      updated_at = now()
  where slug = 'well-abandonment-plan'
    and status = 'Archived';
end $$;
