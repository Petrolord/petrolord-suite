-- Facilities F10 — Pump Station Designer tile (HELD).
--
-- A SEED, not a rename: this is a new app on a fresh slug. The
-- F0-retired `compressor-pump-pack` stays Archived and its route stays
-- a redirect, per the program's no-revival doctrine — that shell
-- printed "Head: 450 ft" and "NPSHa: 12 ft" as literal strings and is
-- not the ancestor of anything.
--
-- %ROWTYPE sibling copy off a live Facilities row so the module,
-- pricing and module_id come from a real neighbour rather than being
-- typed. Idempotent.
--
-- DEPLOY GATE: apply only with the prod upload that ships the F10
-- build — a tile must never go Active before its route is on the
-- deploy target (the master_apps deploy lesson).

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_slug text := 'pump-station-designer';
  v_name text := 'Pump Station Designer';
  v_desc text := 'Centrifugal pump selection against the system it '
    || 'actually works into. The duty point is SOLVED as the '
    || 'intersection of the pump and system curves rather than assumed, '
    || 'so a change to the system, the trim or the speed moves it and '
    || 'everything downstream of it. NPSH available is built from the '
    || 'real suction side and judged against the customary margin, not '
    || 'bare equality with the required value. The operating region '
    || 'relative to best efficiency is named along with what it costs, '
    || 'because a pump that works and a pump that works for a fortnight '
    || 'look identical on a datasheet. Hydraulic Institute viscosity '
    || 'corrections show what a catalogue water curve really delivers on '
    || 'crude. And two pumps in parallel are solved rather than doubled, '
    || 'because on a friction-dominated system the second one buys far '
    || 'less than the first.';

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
