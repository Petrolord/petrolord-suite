/**
 * Material Balance Studio, Contacts tab (MB6) — tank-model contact movement.
 * Pure functions, jest guarded.
 *
 * Piston-like displacement estimates on top of the engine's material balance
 * series (the same approximation commercial MBAL packages use for contact
 * tracking):
 *
 *   OWC (GWC for gas) rises by the net aquifer water that entered the
 *   hydrocarbon zone, spread over the contact area:
 *     Δh_owc = 5.615 · (We − Wp·Bw) / (A_owc · φ · (1 − Swi − Sor_w))
 *   where (1 − Swi − Sor_w) is the saturation change behind a piston-like
 *   water front (connate water to residual oil).
 *
 *   GOC descends by the gas-cap expansion volume:
 *     Δh_goc = 5.615 · m · N · Eg_oil / (A_goc · φ · (1 − Swi − Sor_g))
 *   with Eg_oil the engine's per-timestep gas-cap expansion term
 *   (RB/STB, Pletcher Eq. 23), so the volume is exactly the one the MBE
 *   attributed to the gas cap.
 *
 * These are screening estimates: they assume piston-like fronts, uniform
 * area with depth and no coning. The copy in the tab says so.
 */

const CUFT_PER_BBL = 5.615;
const SQFT_PER_ACRE = 43_560;

export const CONTACT_DEFAULTS = {
  sorWater: 0.25, // residual oil to water displacement
  sorGas: 0.15,   // residual oil to gas displacement
};

/**
 * Compute contact movement series from the last run's plot_data.
 *
 * params = {
 *   initialOwcFt, initialGocFt (null for no gas cap),
 *   areaOwcAcres, areaGocAcres,
 *   porosity, swi, sorWater, sorGas,
 *   ooipStb (N, from the last run), gasCapM (m),
 *   fluidSystem: 'oil' | 'gas' | 'oil_with_gas_cap',
 * }
 * plotData = rb_results.plot_data (arrays We, cum_water_stb, Bw, Eg_oil,
 *            timestep_index, pressure).
 * observationDates = production rows' dates aligned by index (optional).
 *
 * Returns { ok, series, currentOwcFt, currentGocFt, warnings } or
 * { ok: false, error }.
 */
export function computeContactMovement(params, plotData, observationDates = null) {
  const {
    initialOwcFt, initialGocFt,
    areaOwcAcres, areaGocAcres,
    porosity, swi,
    sorWater = CONTACT_DEFAULTS.sorWater,
    sorGas = CONTACT_DEFAULTS.sorGas,
    ooipStb, gasCapM,
    fluidSystem,
  } = params ?? {};

  const warnings = [];
  if (!plotData || !Array.isArray(plotData.timestep_index) || plotData.timestep_index.length < 2) {
    return { ok: false, error: 'Run the engine first: contact tracking reads the We and expansion series of the last run.' };
  }
  if (!Number.isFinite(initialOwcFt) || initialOwcFt <= 0) {
    return { ok: false, error: 'Set the initial oil-water contact depth.' };
  }
  if (!Number.isFinite(areaOwcAcres) || areaOwcAcres <= 0) {
    return { ok: false, error: 'Set the contact area in acres.' };
  }
  if (!Number.isFinite(porosity) || porosity <= 0 || porosity >= 1) {
    return { ok: false, error: 'Set porosity as a fraction between 0 and 1.' };
  }
  if (!Number.isFinite(swi) || swi < 0 || swi >= 1) {
    return { ok: false, error: 'Set the initial water saturation as a fraction between 0 and 1.' };
  }

  const dSwWater = 1 - swi - sorWater;
  if (dSwWater <= 0) {
    return { ok: false, error: 'Swi plus residual oil to water leaves no displaceable saturation. Check Swi and Sor.' };
  }

  const n = plotData.timestep_index.length;
  const We = plotData.We ?? [];
  const Wp = plotData.cum_water_stb ?? [];
  const Bw = plotData.Bw ?? [];
  const EgOil = plotData.Eg_oil ?? [];

  const hasWe = We.some((v) => Number.isFinite(v) && v !== 0);
  if (!hasWe) {
    warnings.push('The last run reports no water influx (We is zero or absent), so the water contact stays at its initial depth.');
  }
  const hasBw = Bw.some((v) => Number.isFinite(v));
  if (!hasBw && Wp.some((v) => Number.isFinite(v) && v > 0)) {
    warnings.push('The last run predates the Bw series; produced water is netted at Bw = 1.0 rb/STB.');
  }

  // GOC path only for oil with a gas cap and a usable N, m and Eg series.
  const wantsGoc = fluidSystem !== 'gas' && Number.isFinite(initialGocFt) && initialGocFt > 0;
  let gocActive = false;
  let dSwGas = null;
  if (wantsGoc) {
    dSwGas = 1 - swi - sorGas;
    const hasEg = EgOil.some((v) => Number.isFinite(v) && v !== 0);
    if (!Number.isFinite(ooipStb) || ooipStb <= 0) {
      warnings.push('GOC tracking needs OOIP from the last run; the GOC stays at its initial depth.');
    } else if (!Number.isFinite(gasCapM) || gasCapM <= 0) {
      warnings.push('GOC tracking needs a gas cap ratio m greater than zero; the GOC stays at its initial depth.');
    } else if (!hasEg) {
      warnings.push('The last run predates the gas-cap expansion series (Eg_oil); rerun the engine to enable GOC tracking.');
    } else if (dSwGas <= 0) {
      warnings.push('Swi plus residual oil to gas leaves no displaceable saturation; the GOC stays at its initial depth.');
    } else {
      gocActive = true;
    }
  }

  const areaOwcFt2 = areaOwcAcres * SQFT_PER_ACRE;
  const areaGocFt2 = (Number.isFinite(areaGocAcres) && areaGocAcres > 0 ? areaGocAcres : areaOwcAcres) * SQFT_PER_ACRE;

  const series = [];
  for (let i = 0; i < n; i++) {
    const we = Number.isFinite(We[i]) ? We[i] : 0;
    const wp = Number.isFinite(Wp[i]) ? Wp[i] : 0;
    const bw = Number.isFinite(Bw[i]) ? Bw[i] : 1.0;
    const netWaterRb = we - wp * bw;
    // Influx smaller than produced water means the contact has not advanced;
    // clamp at zero rather than showing the contact receding below initial.
    const dhOwc = Math.max(0, (netWaterRb * CUFT_PER_BBL) / (areaOwcFt2 * porosity * dSwWater));

    let dhGoc = 0;
    if (gocActive) {
      const eg = Number.isFinite(EgOil[i]) ? EgOil[i] : 0;
      const gasCapRb = Math.max(0, gasCapM * ooipStb * eg);
      dhGoc = (gasCapRb * CUFT_PER_BBL) / (areaGocFt2 * porosity * dSwGas);
    }

    series.push({
      step: plotData.timestep_index[i],
      date: observationDates?.[i] ?? null,
      pressure: plotData.pressure?.[i] ?? null,
      owcFt: initialOwcFt - dhOwc,
      gocFt: wantsGoc ? (gocActive ? initialGocFt + dhGoc : initialGocFt) : null,
      dhOwcFt: dhOwc,
      dhGocFt: wantsGoc ? dhGoc : null,
    });
  }

  const last = series[series.length - 1];
  if (wantsGoc && last.gocFt != null && last.gocFt >= last.owcFt) {
    warnings.push('The tracked GOC has reached the tracked OWC. The remaining oil column is gone under these assumptions; revisit the areas and residuals before reading anything else from this plot.');
  }

  return {
    ok: true,
    series,
    currentOwcFt: last.owcFt,
    currentGocFt: last.gocFt,
    oilColumnFt: wantsGoc && last.gocFt != null ? Math.max(0, last.owcFt - last.gocFt) : null,
    warnings,
  };
}
