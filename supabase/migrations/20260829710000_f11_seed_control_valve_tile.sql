-- Facilities F11 — Control Valve & Choke Sizing tile (HELD).
--
-- A SEED: a new app on a fresh slug. The F0-archived
-- `control-valve-sizer` stub (one of the 30 zero-code Coming Soon rows
-- the honest catalog archived) stays archived; this app shares its
-- subject and nothing else.
--
-- %ROWTYPE sibling copy off a live Facilities row so the module,
-- pricing and module_id come from a real neighbour rather than being
-- typed. Idempotent.
--
-- DEPLOY GATE: apply only with the prod upload that ships the F11
-- build — a tile must never go Active before its route is on the
-- deploy target (the master_apps deploy lesson).

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_slug text := 'control-valve-sizing';
  v_name text := 'Control Valve & Choke Sizing';
  v_desc text := 'ISA 75.01 control valve sizing with the choking '
    || 'boundary put first, because past it the extra pressure drop '
    || 'does nothing and sizing on the full stated drop undersizes the '
    || 'valve badly. Liquid Cv against the allowable drop, with '
    || 'cavitation kept distinct from flashing since an '
    || 'anti-cavitation trim cannot fix a flashing service, and the '
    || 'cavitation index reported because damage begins well before '
    || 'choking. Gas sizing with the expansion factor falling to '
    || 'exactly two thirds at the terminal ratio. Valve authority and '
    || 'the characteristic that follows from it, travel at minimum, '
    || 'normal and maximum flow so a valve that cannot control at '
    || 'turndown is visible, an honest aerodynamic noise indication '
    || 'labelled as screening, and the API RP 14E outlet velocity '
    || 'limit.';

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
