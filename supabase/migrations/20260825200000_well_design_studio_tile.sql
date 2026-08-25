-- Well Design Studio tile (Well Design Studio program, wave WD0).
--
-- The 'well-planning' slug has NO prior migration: whatever tile exists
-- in master_apps was hand-seeded outside the repo (Horizons era). This
-- migration makes the row canonical and migration-managed either way:
-- update it in place if it exists, else seed it from a sibling drilling
-- row (%ROWTYPE template copy, the 20260713200000 pattern) so module,
-- price and future columns stay schema-correct without being named.
--
-- Rename: app_name becomes 'Well Design Studio' (owner decision
-- 2026-08-25; slug and entitlement key stay 'well-planning').
-- app_name is UNIQUE: if some other row already holds the new name the
-- rename is skipped with a notice instead of failing the migration.
--
-- DEPLOY GATE: apply together with the WD0 production upload (the same
-- build that renames the in-app strings and gates the route). Safe to
-- re-run; idempotent.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
begin
  select exists (
    select 1 from public.master_apps
    where app_name = 'Well Design Studio' and slug <> 'well-planning'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'well-planning') then
    update public.master_apps
    set app_name    = case when name_taken then app_name else 'Well Design Studio' end,
        description = 'Compass-class well trajectory design: minimum-curvature survey engine validated against analytic oracles, profile design, targets, and survey listings. Anti-collision and 3D visualization are being rebuilt wave by wave.',
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'well-planning';
    if name_taken then
      raise notice 'well-planning tile updated but rename skipped: another row already holds app_name ''Well Design Studio''.';
    end if;
    return;
  end if;

  -- No row: seed from a sibling drilling tile.
  select * into tmpl
  from public.master_apps
  where slug = 'casing-tubing-design-pro'
  limit 1;
  if tmpl.id is null then
    select * into tmpl from public.master_apps where module is not null limit 1;
  end if;
  if tmpl.id is null then
    raise notice 'master_apps is empty; nothing to template from. Seed skipped.';
    return;
  end if;

  tmpl.id := gen_random_uuid();
  tmpl.slug := 'well-planning';
  tmpl.app_name := case when name_taken then 'Well Design Studio (well-planning)' else 'Well Design Studio' end;
  tmpl.description := 'Compass-class well trajectory design: minimum-curvature survey engine validated against analytic oracles, profile design, targets, and survey listings. Anti-collision and 3D visualization are being rebuilt wave by wave.';
  tmpl.status := 'Active';
  tmpl.is_built := true;
  tmpl.is_functional := true;
  tmpl.created_at := now();
  tmpl.updated_at := now();
  select coalesce(max(display_order), 0) + 1 into tmpl.display_order from public.master_apps;

  insert into public.master_apps values (tmpl.*);
end $$;
