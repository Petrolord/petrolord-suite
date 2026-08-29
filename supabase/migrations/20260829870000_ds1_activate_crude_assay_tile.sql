-- Midstream & Downstream DS1 — Crude Assay & Blending Studio goes Active (HELD).
--
-- The module's first working app, and the first of its ten tiles to leave
-- Coming Soon. Each of the others follows in the migration that ships its own
-- build; the catalog never says an app works before it does.
--
-- Depends on 20260829850000 having created the row. If that seed has not been
-- applied this does nothing and says so, rather than inserting a tile with no
-- module behind it.
--
-- DEPLOY GATE: apply only with the prod upload that ships the DS1 build. A
-- tile must never go Active before its route is on the deploy target.

do $$
declare
  v_slug text := 'crude-assay-blending-studio';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
  set status = 'Active',
      is_built = true,
      is_functional = true,
      description = 'Crude assay cut yields from a TBP distillation, blend property '
        || 'prediction with every property on its own correct basis (density on '
        || 'volume, sulfur and TAN on mass, viscosity through the Refutas index, '
        || 'and API never averaged directly because it does not blend), asphaltene '
        || 'stability screening by the colloidal instability index where a SARA '
        || 'analysis is supplied and a labelled gravity-contrast heuristic where it '
        || 'is not, and netback valuation that follows the assay rather than a rule '
        || 'of thumb about gravity and sulfur.',
      updated_at = now()
  where slug = v_slug;
end $$;
