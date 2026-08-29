-- Facilities F9 — Compressor Station Designer tile (HELD).
--
-- A SEED, not a rename: this is a new app on a fresh slug. The
-- F0-retired `compressor-pump-pack` stays Archived and its route stays
-- a redirect, per the program's no-revival doctrine — that shell
-- printed "Power: 1250 hp" as a literal string and is not the
-- ancestor of anything.
--
-- %ROWTYPE sibling copy off a live Facilities row so the module,
-- pricing and module_id come from a real neighbour rather than being
-- typed. Idempotent.
--
-- DEPLOY GATE: apply only with the prod upload that ships the F9
-- build — a tile must never go Active before its route is on the
-- deploy target (the master_apps deploy lesson).

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_slug text := 'compressor-station-designer';
  v_name text := 'Compressor Station Designer';
  v_desc text := 'Gas compression sizing to the GPSA method: the stage '
    || 'count from BOTH the ratio rule and the discharge-temperature '
    || 'limit with the governing one named, because on a hot or high-k '
    || 'gas it is temperature that decides; polytropic head and power '
    || 'with the exponent derived from the polytropic efficiency rather '
    || 'than the isentropic exponent misused in its place; '
    || 'compressibility evaluated at both ends of each stage and '
    || 'averaged; interstage cooling duty reported because it is a real '
    || 'exchanger; reciprocating against centrifugal screened on the '
    || 'published criteria of inlet volume, ratio and power; and driver '
    || 'fuel, which on a gas plant comes out of the very stream being '
    || 'compressed.';
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
