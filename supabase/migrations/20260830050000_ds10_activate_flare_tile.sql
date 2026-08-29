-- Midstream & Downstream DS10 — Flare Gas to Value Studio goes Active (HELD).
-- The module's tenth and last tile.
-- DEPLOY GATE: apply only with the prod upload that ships the DS10 build.

do $$
declare v_slug text := 'flare-gas-to-value';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first.', v_slug;
    return;
  end if;
  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'A volume of gas is being burned for nothing; this screens the routes that '
        || 'would turn it into something against THE GAS THAT IS ACTUALLY THERE rather than the '
        || 'gas a brochure assumed. Liquids content is DERIVED from the composition and component '
        || 'liquid densities rather than read off a table, and CO2 is tracked separately from '
        || 'inerts because a liquefaction train cares about CO2 specifically. Screening has THREE '
        || 'states, not two: a requirement with no limit set is UNCHECKED, not passed, and a '
        || 'failure names which requirement failed and by how much, because "not feasible" is not '
        || 'an answer anybody can act on. Requirement limits ship unset, since a licensor''s CO2 '
        || 'limit is a design choice rather than physical law. Recovery is a REQUIRED input, '
        || 'because a recovery quietly assumed at 100 percent is the optimism that sinks these '
        || 'cases, and capital scales by the same power law the Modular Refinery studio uses. '
        || '**THE CLAIM THIS APP EXISTS TO STOP**: you cannot count a flare''s gross emission as '
        || 'abatement unless the gas is never burned. Recover it and somebody burns it, and the '
        || 'abatement is the DIFFERENCE against a stated counterfactual - larger than the gross '
        || 'figure if it displaces a dirtier fuel, smaller or negative if it displaces nothing. '
        || 'No abatement is reported until the counterfactual is declared, and credits are not '
        || 'priced off a gross figure because a credit that cannot be substantiated cannot be '
        || 'issued. Whether the project needs credits is reported separately from what they are '
        || 'worth: that is the question a bid turns on. Routes that fail screening STAY IN THE '
        || 'BID TABLE with their failure named. Valuation is handed to the sanctioned economics '
        || 'engine rather than duplicated here.',
      updated_at = now()
  where slug = v_slug;
end $$;
