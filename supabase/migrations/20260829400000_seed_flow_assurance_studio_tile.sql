-- Production P10: seed the Flow Assurance Studio tile (fresh slug
-- flow-assurance-studio, templated from the nodal-analysis-engine row
-- so it lands in the Production module).
--
-- The FRESH SLUG IS THE POINT. The old flow-assurance-monitor was
-- archived at P0 after its math turned out to be invented outright: a
-- fixed 0.02 psi/ft pressure gradient regardless of fluid or rate, and
-- a hydrate temperature of 18*ln(P) - 100 + GOR/1000, which is not a
-- correlation from anywhere. Per the program's doctrine an archived
-- shell is never revived; the replacement is a different app with a
-- different id, and the old slug stays a redirect.
--
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
  v_name text := 'Flow Assurance Studio';
  v_desc text := 'One continuous pressure and temperature trace from '
    || 'the perforations to the arrival point, with the hydrate and '
    || 'wax questions asked at every station along it rather than at '
    || 'the arrival only. The wellbore is the validated nodal '
    || 'traverse; the choke carries its Joule-Thomson cooling, which '
    || 'is where hydrates actually form; the flowline and riser are '
    || 'marched with pressure and temperature COUPLED, so every '
    || 'gradient is evaluated at the temperature the thermal model '
    || 'puts the line at. The overall U is built from the real coating '
    || 'stack and reported with the area it is referred to, the '
    || 'inhibitor dose shows both depression relations with the gap '
    || 'between them named, and a shutdown gives a no-touch cooldown '
    || 'time that counts the steel as well as the fluid.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'flow-assurance-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'flow-assurance-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'flow-assurance-studio';
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
    tmpl.slug := 'flow-assurance-studio';
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
