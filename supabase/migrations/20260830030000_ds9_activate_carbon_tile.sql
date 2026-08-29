-- Midstream & Downstream DS9 — Carbon Footprint & Abatement Studio goes Active (HELD).
-- DEPLOY GATE: apply only with the prod upload that ships the DS9 build.

do $$
declare v_slug text := 'carbon-footprint-abatement';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first.', v_slug;
    return;
  end if;
  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'The roll-up of a ledger the rest of the module already produces, not a '
        || 'second data silo fed by its own spreadsheets once a year. COMPUTED AND REPORTABLE ARE '
        || 'SEPARATE QUESTIONS: an inventory can be complete arithmetic and still not be '
        || 'something to file, and the app says which lines are the reason. Emission factors are '
        || 'REGISTERED, not shipped - value, unit, source, version, vintage - because a factor '
        || 'without its version is not auditable. No global warming potentials are shipped '
        || 'either: they differ between IPCC assessment reports by enough to move a methane-heavy '
        || 'inventory by a fifth, so the set is declared by the user and stated on every result. '
        || 'Combustion CO2 comes from the CARBON IN THE FUEL rather than a factor, because every '
        || 'carbon atom into a burner leaves as CO2 - conservation of mass needs no source '
        || 'document - and carbon that escapes is counted as methane, which is why a flare''s '
        || 'destruction efficiency is asked for rather than assumed. An intensity will not be '
        || 'reported without its BOUNDARY. The abatement curve annualises capital over each '
        || 'measure''s life, puts the measures that pay for themselves on the left, and - unlike '
        || 'the spreadsheets it replaces - FLAGS MEASURES THAT ACT ON THE SAME SOURCE as not '
        || 'additive and catches claims that exceed what a source emits, without resolving the '
        || 'overlap itself. The gap to target is named as unabated with no measure identified, '
        || 'never drawn as a wedge. It feeds Assurance''s compliance register; it is not one.',
      updated_at = now()
  where slug = v_slug;
end $$;
