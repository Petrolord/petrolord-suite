// Wave D8 shared design values: the numbers two domains must agree on.
//
// Everything else a domain needs comes from ./spine.mjs (the LOCKED field),
// ./geology.mjs, the generated kit and the engines. These values are DESIGN
// (not taught by any Academy course), chosen once here so that, for example,
// the Economics episode's Ekene-11 capital is the Drilling episode's AFE and
// the Process Safety release comes from the Facilities separator.
//
// Field history for reference (08-production, monthly daily rates): peak
// oil 374.42 bopd and gas 149.77 Mscf/d (2020-09), peak injection 233.21
// bwpd (2024-01); December 2025: 118.41 bopd, 31.06 bwpd, 47.36 Mscf/d,
// 180.82 bwpd injected.

/** Ekene-11, the well Episode 10 plans from Ekene Alpha. */
export const EKENE11 = {
  // Drilling and completion cost, USD. The Well Cost & Time program in the
  // drilling domain must total this (deterministic run) within 1 percent;
  // the economics domain books it as the well's capital.
  dc_cost_usd: 11_800_000,
  spud: '2027-01-15',
  first_oil: '2027-04-01',
  // Planted initial decline for the incremental forecast (economics); the
  // same Arps family and units as the ekene-dynamic producers.
  forecast: { model: 'hyperbolic', qi_bopd: 450, di_per_day: 0.0015, b: 0.5 },
};

/**
 * Facilities design basis: today's field plus Ekene-11 and water-cut
 * growth, with margin. The facilities domain sizes to it; process safety
 * takes its release from the separator at these conditions.
 */
export const FACILITY_DESIGN = {
  oil_bopd: 1000,
  water_bwpd: 1500,
  gas_mmscfd: 0.45,            // GOR 400 scf/stb on 1000 bopd, plus 12.5 percent
  water_injection_bwpd: 2500,
  separator_pressure_psig: 150,
  separator_temperature_f: 140,
  // export line from Ekene Alpha to the shore terminal
  export_line_length_km: 18,
};
