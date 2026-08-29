-- Midstream & Downstream DS5 — Terminal & Depot Studio goes Active (HELD).
-- DEPLOY GATE: apply only with the prod upload that ships the DS5 build.

do $$
declare v_slug text := 'terminal-depot-studio';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first.', v_slug;
    return;
  end if;
  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'Built for a terminal with a dip tape rather than a control system, '
        || 'because that is what most terminals in these markets actually have. Manual dips '
        || 'against strapping tables become stock, free water is subtracted because it is not '
        || 'product, and the table is never extrapolated because that invents capacity the tank '
        || 'does not have. Daily reconciliation NAMES the unaccounted gap rather than balancing '
        || 'itself, with tolerance measured on what moved rather than on what is in the tank, and '
        || 'trending separates one day of noise from a run worth investigating. The loading rack '
        || 'is modelled as a queue, because a rack at 85 percent utilisation does not have 15 '
        || 'percent spare. Throughput margin and carbon per tonne come from the same volumes.',
      updated_at = now()
  where slug = v_slug;
end $$;
