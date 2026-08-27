-- Drilling D6 launch: rename the EXISTING Active casing-tubing-design-pro
-- tile to "Casing & Tubing Design Studio" with honest launch copy. The
-- slug (tile link + entitlement key) is unchanged; this is an
-- update-in-place, not a seed. Non-destructive: the WDS seed migration
-- only reads this row. Idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-26): apply live only with the ONE prod upload that ships all 12
-- D&C apps, together with the other held D-phase tiles.

do $$
declare
  name_taken boolean;
  v_name text := 'Casing & Tubing Design Studio';
  v_desc text := 'API 5C3 casing and tubing design on your planned '
    || 'trajectories: validated Barlow burst, four-regime collapse with '
    || 'axial derate and triaxial checks over canonical load cases, real '
    || 'API 5CT catalog ratings, and the Lubinski tubing-packer force '
    || 'system, validated against independent oracles.';
begin
  if not exists (select 1 from public.master_apps where slug = 'casing-tubing-design-pro') then
    raise notice 'casing-tubing-design-pro tile not found; nothing to update.';
    return;
  end if;

  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'casing-tubing-design-pro'
  ) into name_taken;

  update public.master_apps
  set app_name = case when name_taken then app_name else v_name end,
      description = v_desc,
      status = 'Active',
      is_built = true,
      is_functional = true,
      updated_at = now()
  where slug = 'casing-tubing-design-pro';

  if name_taken then
    raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
  end if;
end $$;
