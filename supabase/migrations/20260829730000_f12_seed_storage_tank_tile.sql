-- Facilities F12 — Storage Tank & Venting Designer tile (HELD).
--
-- A SEED: a new app on a fresh slug. %ROWTYPE sibling copy off a live
-- Facilities row so the module, pricing and module_id come from a real
-- neighbour rather than being typed. Idempotent.
--
-- DEPLOY GATE: apply only with the prod upload that ships the F12
-- build — a tile must never go Active before its route is on the
-- deploy target (the master_apps deploy lesson).

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_slug text := 'storage-tank-designer';
  v_name text := 'Storage Tank & Venting Designer';
  v_desc text := 'API 650 shell course thickness by the one-foot '
    || 'method, with the hydrostatic test case computed beside the '
    || 'product case and the governing one named, because a light '
    || 'product does not stress the shell as hard as the water it will '
    || 'be tested with and designing for the product alone '
    || 'under-thicknesses it. API 2000 normal venting worked in both '
    || 'directions from the thermal and liquid movement components, '
    || 'with the inbreathing case reported as its own answer rather '
    || 'than assumed to follow the pressure case, since a cold '
    || 'rainstorm on a hot tank being drawn down is what actually '
    || 'collapses tanks. Emergency fire venting from the wetted shell '
    || 'below thirty feet. Standing and working evaporative losses, '
    || 'reported as both product lost and emissions, with control '
    || 'equipment quantified by the efficiency you give it.';

begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> v_slug
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = v_slug) then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = v_slug;
    if name_taken then
      raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
    end if;
  else
    select * into tmpl from public.master_apps
      where slug = 'relief-blowdown-sizer' limit 1;
    if tmpl.id is null then
      select * into tmpl from public.master_apps
        where lower(module) = 'facilities' and status = 'Active' limit 1;
    end if;
    if tmpl.id is null then
      raise notice 'no Facilities template row found; seed skipped.';
      return;
    end if;

    tmpl.id := gen_random_uuid();
    tmpl.slug := v_slug;
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
