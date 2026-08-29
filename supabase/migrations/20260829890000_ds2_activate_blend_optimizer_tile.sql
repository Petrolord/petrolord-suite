-- Midstream & Downstream DS2 — Product Blending Optimizer goes Active (HELD).
--
-- The module's second working app. Depends on the DS0 seed having created the
-- row; if it has not, this says so and does nothing rather than inserting a
-- tile with no module behind it.
--
-- DEPLOY GATE: apply only with the prod upload that ships the DS2 build.

do $$
declare
  v_slug text := 'product-blending-optimizer';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
  set status = 'Active',
      is_built = true,
      is_functional = true,
      description = 'Least-cost blend recipes solved as a linear programme under real '
        || 'specifications, where every property declares how it blends: volume, mass '
        || 'for anything per unit mass such as sulfur, or through a stated index for '
        || 'RVP and viscosity, because those do not mix linearly at all. Reports which '
        || 'specifications bind, what quality is being handed over for nothing, and the '
        || 'shadow price of every constraint, which is what one unit of relief on it '
        || 'would be worth. An infeasible blend is reported as one rather than returned '
        || 'as a recipe that misses.',
      updated_at = now()
  where slug = v_slug;
end $$;
