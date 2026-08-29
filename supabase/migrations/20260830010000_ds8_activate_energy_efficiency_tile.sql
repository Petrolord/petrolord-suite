-- Midstream & Downstream DS8 — Energy & Utilities Efficiency Studio goes Active (HELD).
-- DEPLOY GATE: apply only with the prod upload that ships the DS8 build.

do $$
declare v_slug text := 'energy-utilities-efficiency';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first.', v_slug;
    return;
  end if;
  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'Finds energy a plant is throwing away and prices it twice, in money and in '
        || 'tonnes of CO2, from the same energy in the same run: the module''s carbon doctrine as '
        || 'arithmetic rather than an ESG spreadsheet reconciled once a year. Combustion comes '
        || 'from YOUR fuel analysis as an atom balance, not a chart, with fuel inerts carried '
        || 'through because they still have to be heated up the stack, and excess air SOLVED from '
        || 'the measured stack oxygen rather than taken off a shortcut formula. EVERY EFFICIENCY '
        || 'DECLARES ITS BASIS: LHV and HHV differ by close to ten points on natural gas for the '
        || 'same heater, the moisture loss is computed differently on each, and the app refuses '
        || 'to compare two efficiencies on different bases. Three things it will NOT supply: the '
        || 'radiation loss (a published chart), the minimum safe stack oxygen (below it the '
        || 'burner makes carbon monoxide, and it is burner-specific), and a failed trap''s '
        || 'discharge coefficient. Trap loss is CHOKED flow, so it depends on upstream pressure '
        || 'and not on what is downstream. Condensate is valued on fuel, water AND treatment, the '
        || 'term routinely left out. Energy intensity is the plant''s own and says plainly that '
        || 'it is NOT the proprietary Solomon index. Pinch targets come from the Problem Table '
        || 'Algorithm with the energy balance closing exactly, a threshold problem reported as '
        || 'one rather than given an invented pinch, and the cost of carrying heat across the '
        || 'pinch stated. Abatement cost per tonne is handed to the Carbon Studio to rank.',
      updated_at = now()
  where slug = v_slug;
end $$;
