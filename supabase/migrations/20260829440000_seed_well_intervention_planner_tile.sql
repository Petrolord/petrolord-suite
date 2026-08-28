-- Production P12: seed the Well Intervention Planner tile (fresh slug
-- well-intervention-planner, templated from the nodal-analysis-engine
-- row so it lands in the Production module).
--
-- It replaces four shells archived at P0 — the Stimulation Candidate
-- Selector, the Water/Gas Shutoff Planner, the Workover Planner and the
-- Rigless Intervention Planner. Per the program's no-revival doctrine
-- those rows stay archived and their slugs stay redirects into this
-- app.
--
-- %ROWTYPE sibling-copy pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-27, Production-ROADMAP.md §6.6): apply live only with the ONE
-- prod upload that ships the finished Production Operations module,
-- together with the other held P-phase tiles. This is the LAST of them.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Well Intervention Planner';
  v_desc text := 'Three questions in the order they actually come in: '
    || 'what is wrong with this well, which treatments could address '
    || 'THAT, and what the one you pick is worth. The order is the '
    || 'point. Water channelling and water coning look identical on a '
    || 'water-cut plot and need opposite treatments, so the screening '
    || 'is gated by the diagnostic read from the well''s own '
    || 'production history: on a coning well the shutoff squeeze is '
    || 'ruled out with the reason, because the cone re-forms above '
    || 'whatever is plugged, and reducing drawdown becomes the '
    || 'candidate instead. What survives is sized by solving the well '
    || 'before and after rather than by a multiplier, so the tubing '
    || 'takes back part of what the inflow gained, and a shutoff''s '
    || 'gain through the lighter column is found at all. The money is '
    || 'the Suite''s canonical screening economics, with a decline on '
    || 'the uplift that has to be stated because an intervention '
    || 'modelled as a permanent step change always pays.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'well-intervention-planner'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'well-intervention-planner') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'well-intervention-planner';
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
    tmpl.slug := 'well-intervention-planner';
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
