/**
 * Material Balance Studio, Forecast tab (MB6) — pure helpers, jest guarded.
 *
 * Decline math is NOT implemented here: fitting and forecasting go through
 * the canonical Arps engine (src/utils/declineCurve/dcaEngine.js, the DCA
 * Studio engine; see CLAUDE.md canon rules). This module adapts the studio's
 * cumulative production rows to that engine's {date, rate} contract and
 * reconciles the DCA remaining reserves against the material-balance
 * volumes:
 *
 *   gas — recoverable from the p/z line at an abandonment pressure
 *         (standard depletion-material-balance recovery,
 *         G_rec = G · (1 − (p/z)_ab / (p/z)_i)), with (p/z)_ab interpolated
 *         through the run's own p/z history so the z at abandonment is
 *         consistent with the PVT the engine actually used;
 *   oil — implied recovery factor (produced + DCA remaining) / N compared
 *         with the statistical recovery ranges by drive mechanism (Arps /
 *         API study ranges as tabulated in Ahmed, Reservoir Engineering
 *         Handbook). A screening comparison, not a promise.
 */

const DAY_MS = 86_400_000;

/**
 * Cumulative rb rows -> [{date, rate}] daily-rate series for fitArpsModel.
 * Rate between consecutive dated rows is placed at the midpoint date.
 * Returns null when fewer than 3 rate points can be built (undated rows or
 * too little history).
 */
export function ratesFromCumulative(productionData, phase) {
  const field = phase === 'gas' ? 'cum_gas_scf' : 'cum_oil_stb';
  const dated = (productionData ?? []).filter(
    (r) => r.observation_date && Number.isFinite(new Date(r.observation_date).getTime()),
  );
  if (dated.length < 2) return null;
  const sorted = [...dated].sort(
    (a, b) => new Date(a.observation_date) - new Date(b.observation_date),
  );
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const t0 = new Date(sorted[i - 1].observation_date).getTime();
    const t1 = new Date(sorted[i].observation_date).getTime();
    const dtDays = (t1 - t0) / DAY_MS;
    if (dtDays <= 0) continue;
    const q0 = sorted[i - 1][field] ?? 0;
    const q1 = sorted[i][field] ?? 0;
    const dQ = q1 - q0;
    if (!Number.isFinite(dQ) || dQ < 0) continue;
    out.push({
      date: new Date((t0 + t1) / 2).toISOString().slice(0, 10),
      rate: dQ / dtDays,
    });
  }
  return out.length >= 3 ? out : null;
}

/**
 * Forecast beyond the end of history. fitArpsModel anchors qi at the FIRST
 * fitted rate point, so a naive forecast would re-produce the history window
 * and inflate remaining reserves. This generates from the fit anchor through
 * the horizon (economic-limit stop), then splits at the last history date:
 * only post-history volume counts as remaining.
 *
 * fit = fitArpsModel result ({ parameters, t0 }); generateForecastFn is
 * injected (the canonical dcaEngine.generateForecast) so the module stays
 * dependency-pure for jest.
 *
 * Returns { points: [{date, rate, cumulative}], remaining, rateAtHistoryEnd,
 *           reachedLimit, timeToLimitYearsFromNow } or null when the fit is
 * unusable.
 */
export function forecastBeyondHistory(fit, lastHistoryDate, config, generateForecastFn) {
  const params = fit?.parameters;
  if (!params || !(params.qi > 0) || !(params.Di > 0)) return null;
  const t0 = new Date(fit.t0).getTime();
  const tLast = new Date(lastHistoryDate).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(tLast) || tLast < t0) return null;
  const historyDays = Math.round((tLast - t0) / DAY_MS);
  const horizonDays = historyDays + Math.round((config.horizonYears ?? 20) * 365.25);
  const fc = generateForecastFn(
    params,
    {
      forecastDurationDays: horizonDays,
      economicLimit: config.economicLimit,
      stopAtLimit: true,
    },
    fit.t0,
  );
  if (!fc?.rates?.length) return null;
  const points = [];
  let cumulativeAtHistoryEnd = 0;
  let rateAtHistoryEnd = null;
  for (const pt of fc.rates) {
    const t = new Date(pt.date).getTime();
    if (t <= tLast) {
      cumulativeAtHistoryEnd = pt.cumulative;
      rateAtHistoryEnd = pt.rate;
    } else {
      points.push(pt);
    }
  }
  const reachedLimit = fc.timeToLimit < horizonDays;
  const remaining = Math.max(0, fc.eur - cumulativeAtHistoryEnd);
  return {
    points,
    remaining,
    rateAtHistoryEnd,
    reachedLimit,
    timeToLimitYearsFromNow: reachedLimit
      ? Math.max(0, (fc.timeToLimit - historyDays) / 365.25)
      : null,
  };
}

/**
 * Interpolate p/z at a target pressure through the run's observed p/z curve
 * (plot_data.pressure vs plot_data.p_over_z). Linear between points; linear
 * extrapolation from the last (lowest-pressure) pair below the data range.
 * Returns null when the run has no p/z series (oil cases).
 */
export function pOverZAt(plotData, targetPsia) {
  const p = plotData?.pressure;
  const pz = plotData?.p_over_z;
  if (!Array.isArray(p) || !Array.isArray(pz)) return null;
  const pairs = p
    .map((pi, i) => ({ p: pi, pz: pz[i] }))
    .filter((d) => Number.isFinite(d.p) && Number.isFinite(d.pz))
    .sort((a, b) => b.p - a.p); // descending pressure
  if (pairs.length < 2) return null;
  if (targetPsia >= pairs[0].p) {
    // Above the observed range: extrapolate from the top pair.
    const [a, b] = [pairs[0], pairs[1]];
    return a.pz + ((targetPsia - a.p) * (b.pz - a.pz)) / (b.p - a.p);
  }
  for (let i = 1; i < pairs.length; i++) {
    if (targetPsia >= pairs[i].p) {
      const a = pairs[i - 1];
      const b = pairs[i];
      return a.pz + ((targetPsia - a.p) * (b.pz - a.pz)) / (b.p - a.p);
    }
  }
  // Below the observed range: extrapolate from the bottom pair.
  const a = pairs[pairs.length - 2];
  const b = pairs[pairs.length - 1];
  return a.pz + ((targetPsia - a.p) * (b.pz - a.pz)) / (b.p - a.p);
}

/**
 * Statistical oil recovery-factor ranges by the engine's drive-mechanism
 * classification (Arps / API study ranges as tabulated in Ahmed REH).
 */
export const OIL_RF_BANDS = {
  depletion_drive: { lo: 0.05, hi: 0.30, label: 'solution gas drive' },
  combination_drive: { lo: 0.20, hi: 0.60, label: 'combination drive' },
  gas_cap_drive: { lo: 0.20, hi: 0.40, label: 'gas cap drive' },
  water_drive_with_depletion: { lo: 0.25, hi: 0.60, label: 'partial water drive' },
  strong_water_drive: { lo: 0.35, hi: 0.75, label: 'water drive' },
};

/**
 * Reconcile the DCA remaining reserves with the material balance.
 *
 * args = {
 *   fluidSystem: 'oil' | 'gas' | 'oil_with_gas_cap',
 *   inPlace:      N (STB) or G (scf) from the last run (matched or regressed),
 *   producedToDate: Np (STB) or Gp (scf) at the last history row,
 *   dcaRemaining: EUR of the forecast from today to the economic limit
 *                 (same unit as inPlace),
 *   driveMechanism: engine classification string,
 *   plotData:     rb_results.plot_data of the last run (for the p/z curve),
 *   initialPressure, abandonmentPressure: psia (gas path only),
 * }
 *
 * Gas returns { kind: 'gas_pz', mbalRecoverable, mbalRemaining, dcaRemaining,
 *               deltaFraction, pzAb, pzI, note? }.
 * Oil returns { kind: 'oil_rf', impliedRF, band|null, withinBand|null, ... }.
 * Returns { kind: 'unavailable', reason } when inputs cannot support it.
 */
export function reconcileWithMbal(args) {
  const {
    fluidSystem, inPlace, producedToDate, dcaRemaining,
    driveMechanism, plotData, initialPressure, abandonmentPressure,
  } = args;
  if (!Number.isFinite(inPlace) || inPlace <= 0) {
    return { kind: 'unavailable', reason: 'Run the engine first: the reconciliation needs OOIP or OGIP from the last run.' };
  }
  if (!Number.isFinite(dcaRemaining) || dcaRemaining <= 0) {
    return { kind: 'unavailable', reason: 'Generate a decline forecast first.' };
  }
  const produced = Number.isFinite(producedToDate) ? producedToDate : 0;

  if (fluidSystem === 'gas') {
    if (!Number.isFinite(abandonmentPressure) || abandonmentPressure <= 0) {
      return { kind: 'unavailable', reason: 'Set an abandonment pressure to compute the p/z recoverable.' };
    }
    const pzI = pOverZAt(plotData, initialPressure);
    const pzAb = pOverZAt(plotData, abandonmentPressure);
    if (pzI == null || pzAb == null || pzI <= 0) {
      return { kind: 'unavailable', reason: 'The last run has no p/z history to interpolate through.' };
    }
    const mbalRecoverable = inPlace * (1 - pzAb / pzI);
    const mbalRemaining = mbalRecoverable - produced;
    const deltaFraction = mbalRemaining > 0
      ? (dcaRemaining - mbalRemaining) / mbalRemaining
      : null;
    const isWaterDrive = typeof driveMechanism === 'string' && driveMechanism.includes('water');
    return {
      kind: 'gas_pz',
      mbalRecoverable,
      mbalRemaining,
      dcaRemaining,
      deltaFraction,
      pzI,
      pzAb,
      note: isWaterDrive
        ? 'The last run classifies this reservoir as water drive. The straight p/z recoverable understates pressure support and overstates decline, so treat this comparison as a bound rather than a match.'
        : null,
    };
  }

  const impliedRF = (produced + dcaRemaining) / inPlace;
  const band = OIL_RF_BANDS[driveMechanism] ?? null;
  return {
    kind: 'oil_rf',
    impliedRF,
    producedRF: produced / inPlace,
    band,
    withinBand: band ? impliedRF >= band.lo && impliedRF <= band.hi : null,
    driveMechanism: driveMechanism ?? null,
  };
}
