-- Facilities F12 — Flow Metering Designer tile (HELD).
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
  v_slug text := 'flow-metering-designer';
  v_name text := 'Flow Metering Designer';
  v_desc text := 'Orifice meter run sizing with the discharge '
    || 'coefficient computed from the Reader-Harris/Gallagher equation '
    || 'rather than assumed, because across the practical range of '
    || 'beta and Reynolds number it moves about seven percent, which '
    || 'is many times the uncertainty anybody argues about. Plate bore '
    || 'solved for a target flow at a design differential, '
    || 'expansibility for compressible service, permanent pressure '
    || 'loss, and the straight run required for the beta and the '
    || 'upstream fitting. The centrepiece is a full uncertainty '
    || 'budget: every input propagated with its own sensitivity and '
    || 'the dominant term named, plus the transmitter turndown effect '
    || 'that limits an orifice run to about three to one, since a more '
    || 'precisely bored plate buys nothing when the differential '
    || 'transmitter dominates the budget.';

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
