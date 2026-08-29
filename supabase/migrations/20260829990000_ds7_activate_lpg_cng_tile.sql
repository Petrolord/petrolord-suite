-- Midstream & Downstream DS7 — LPG & CNG Rollout Studio goes Active (HELD).
-- DEPLOY GATE: apply only with the prod upload that ships the DS7 build.

do $$
declare v_slug text := 'lpg-cng-rollout-studio';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first.', v_slug;
    return;
  end if;
  update public.master_apps
  set status = 'Active', is_built = true, is_functional = true,
      description = 'Two fuels that share more structure than they look like they do. A cylinder '
        || 'in circulation and a CNG trailer shuttling to a daughter station are the same problem, '
        || 'so one fleet model serves both and NAMES ITSELF: it is Little''s Law, and operators '
        || 'guess the cylinder float low because the cylinders at customers'' houses are invisible '
        || 'and are most of the fleet. The bottling carousel and the dispensing forecourt run '
        || 'through the same queue as the Terminal Studio''s loading rack. The maximum LPG fill '
        || 'ratio is REFUSED, not defaulted: it is a safety code limit, and a vessel filled '
        || 'liquid-full ruptures hydraulically. Every blend property declares whether it mixes on '
        || 'volume, mass or moles. CNG is computed as a REAL gas, because at 250 bar the '
        || 'compressibility factor is near 0.8 and a cascade sized on ideal gas is wrong by about '
        || 'a fifth; the factor used is shown, and extrapolation beyond the correlation''s fitted '
        || 'range is stated. The cascade sequences from the lowest bank upward and reports gas '
        || 'below the vehicle target as stranded rather than as inventory. Compression is not '
        || 'reimplemented: it calls the Facilities compression engine and converts units. The '
        || 'conversion case compares per kilometre rather than per unit sold, derives an unmeasured '
        || 'consumption from an EXPLICIT efficiency ratio, and will report a switch that saves '
        || 'money while adding carbon, because cheaper and cleaner are separate questions.',
      updated_at = now()
  where slug = v_slug;
end $$;
