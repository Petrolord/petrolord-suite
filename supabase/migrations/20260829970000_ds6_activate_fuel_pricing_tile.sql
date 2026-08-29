-- Midstream & Downstream DS6 — Fuel Pricing & Supply Chain Studio goes Active (HELD).
-- DEPLOY GATE: apply only with the prod upload that ships the DS6 build.

do $$
declare v_slug text := 'fuel-pricing-supply-chain';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first.', v_slug;
    return;
  end if;
  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'The build-up from a cargo priced off a marker in dollars per tonne to a '
        || 'litre at a nozzle: FOB, freight, insurance, duty and statutory charges in the order '
        || 'that matters, because a charge levied on CIF depends on what CIF already is. Ocean '
        || 'loss DIVIDES rather than adds, since you pay for the loaded quantity and sell the '
        || 'outturn. No duty rate, levy or regulated margin is shipped: those are set by '
        || 'regulation and they change, so the line items come with the rates required, and an '
        || 'incomplete build-up is called a floor rather than a cost. The margin waterfall says '
        || 'where the money in a litre goes, a regulated cap below the chain is named as a '
        || 'shortfall somebody is absorbing, and the exchange rate at which the cap stops '
        || 'covering the chain is solved for. Depot-to-station trucking derives trips per truck '
        || 'from the cycle rather than assuming them, fleet size rounds up because a fraction of '
        || 'a truck does not exist, and station sizing checks the ullage at the reorder level '
        || 'against the delivery payload.',
      updated_at = now()
  where slug = v_slug;
end $$;
