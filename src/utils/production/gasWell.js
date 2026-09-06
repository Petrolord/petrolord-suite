/**
 * Gas Well Performance Studio analytics (Production P7).
 *
 * The droplet balance, the loading profile and the plunger-lift force
 * balance are engine work and live in the validated package
 * (`utils/production/engine/gasWellLoading` and `plungerLift`). The gas
 * inflow, the gas column and the nodal solve are the Suite's validated
 * nodal layer. What lives HERE is the chain that needs the well:
 *
 *   gas IPR + gas column      -> the rate this well delivers
 *   march the column          -> pressure and temperature down the string
 *   droplet balance at each   -> where the well loads, and by how much
 *   decline the reservoir     -> WHEN it will load
 *   the well's own numbers    -> whether a plunger would fix it
 *
 * The last two are the point of the studio. A liquid-loading number for
 * today is surveillance; the pressure at which a well WILL load is a
 * plan, and it is what decides whether to buy tubing, a plunger or a
 * compressor.
 *
 * Pressures psia, depths ft, rates Mscf/d, temperatures degF unless
 * named ...R.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { averageTzBhp } from '../nodal/cullenderSmith.js';
import { solveGasOperatingPoint, gasPwfAtRate } from '../nodal/system.js';
import { zFactor } from '../fluidStudioCalculations.js';
import { num, linspace } from '../nodal/numerics.js';
import { buildGasIpr } from './wellModel.js';
import {
  loadingProfile, recommendCorrelation, sizeTubingForRate, turnerFluid,
  TURNER_FLUIDS, tubingAreaFt2, velocityAtRate,
} from './engine/gasWellLoading.js';
import { screenPlungerLift, maxSlugLengthFt, slugVolumeBbl } from './engine/plungerLift.js';

/** Tubing sizes a loading gas well is realistically re-completed with. */
export const TUBING_CANDIDATES_IN = [3.958, 2.992, 2.441, 1.995, 1.61, 1.38];

/**
 * Pressure and temperature down the flowing gas column.
 *
 * Marched segment by segment with the validated average-temperature-
 * and-z column, each segment carrying its own end temperatures, so the
 * profile is a real traverse rather than two endpoints joined by a
 * straight line. The loading check needs it that way: critical rate
 * depends on the local pressure, and it is the deepest station that
 * decides whether a well loads.
 *
 * returns { ok, stations: [{ depthFt, pPsia, tempR, z, idIn }], pwf }
 */
export const flowingProfile = ({
  model, qMscfd, whp, whtF, bhtF, nStations = 9,
}) => {
  const tvdMax = model.tvdMax;
  const mdMax = model.vlp.nodeMd || tvdMax;
  const idIn = model.vlp.idIn;
  const gasSg = num(model.vlp.fluidModel?.gasSg, NaN);
  const sg = Number.isFinite(gasSg) ? gasSg : num(model.gasSg, 0.65);
  const n = Math.max(2, Math.round(nStations));
  const depths = linspace(0, tvdMax, n);
  const stations = [];
  let p = whp;
  for (let i = 0; i < depths.length; i += 1) {
    const tvd = depths[i];
    const tempF = model.tAt(tvd);
    const tempR = tempF + 460;
    stations.push({
      depthFt: tvd,
      pPsia: p,
      tempF,
      tempR,
      z: zFactor(p, tempF, sg),
      idIn,
    });
    if (i === depths.length - 1) break;
    const segTvd = depths[i + 1] - tvd;
    const segMd = segTvd * (mdMax / (tvdMax || 1));
    const next = averageTzBhp({
      ptf: p,
      gasSg: sg,
      mdFt: Math.max(segMd, 1e-6),
      tvdFt: Math.max(segTvd, 1e-6),
      whtF: tempF,
      bhtF: model.tAt(depths[i + 1]),
      qMscfd,
      idIn,
      roughnessIn: model.vlp.roughnessIn,
    });
    p = next.pwf;
  }
  void whtF; void bhtF;
  return { ok: true, stations, pwf: p };
};

/**
 * What this well delivers against a wellhead pressure.
 *
 * The gas IPR meets the gas column at the node. Both halves are the
 * Suite's validated nodal layer; this only puts the well's own numbers
 * into them.
 */
export const deliverability = ({ model, whp, gasSg, roughnessIn, nGrid = 40 }) => {
  const tvdMax = model.tvdMax;
  const mdMax = model.vlp.nodeMd || tvdMax;
  const solved = solveGasOperatingPoint({
    iprResult: model.gasIpr,
    outflow: 'cullenderSmith',
    vlp: {
      ptf: whp,
      gasSg,
      mdFt: mdMax,
      tvdFt: tvdMax,
      whtF: model.tAt(0),
      bhtF: model.tAt(tvdMax),
      idIn: model.vlp.idIn,
      roughnessIn: roughnessIn ?? model.vlp.roughnessIn,
    },
    nGrid,
  });
  return solved;
};

/**
 * The whole design run from studio form values.
 *
 * Coerced here and refused with reasons rather than defaulted, the same
 * contract every other production studio uses.
 *
 * returns { ok, errors, result }
 */
export const runGasWellAnalysis = ({ form, model }) => {
  const errors = [];
  const n = (value, label, { min = -Infinity, max = Infinity } = {}) => {
    const v = num(value, NaN);
    if (!Number.isFinite(v)) { errors.push(`${label} is required.`); return NaN; }
    if (v < min || v > max) errors.push(`${label} is outside the range this analysis can use.`);
    return v;
  };

  const whp = n(form.whp, 'Wellhead pressure', { min: 1 });
  const gasSg = n(form.gasSg, 'Gas gravity', { min: 0.5, max: 1.2 });
  const sigmaDyneCm = n(form.sigmaDyneCm, 'Interfacial tension', { min: 1, max: 100 });
  const rhoLiquidLbFt3 = n(form.rhoLiquidLbFt3, 'Liquid density', { min: 20, max: 80 });

  if (!model) errors.push('The well model is incomplete.');
  else if (model.phase !== 'gas') {
    errors.push('This well is described as an oil well. Set the phase to gas on the Well Model tab.');
  } else if (!model.gasIpr || !(model.gasIpr.aof > 0)) {
    errors.push('The gas inflow did not build. Check the deliverability coefficients.');
  }
  if (errors.length) return { ok: false, errors, result: null };

  const correlation = form.correlation === 'auto'
    ? recommendCorrelation(whp).correlation
    : form.correlation;
  const guidance = recommendCorrelation(whp);

  const solved = deliverability({
    model, whp, gasSg, roughnessIn: model.vlp.roughnessIn,
  });
  if (!solved.op) {
    return {
      ok: false,
      result: null,
      errors: [
        `Against ${Math.round(whp)} psia at the wellhead this well's inflow never meets its own tubing, so it does not flow at all. Lower the wellhead pressure, or check the deliverability coefficients and the reservoir pressure.`,
      ],
    };
  }
  const qMscfd = solved.op.q;

  const profile = flowingProfile({ model, qMscfd, whp });
  const loading = loadingProfile({
    stations: profile.stations,
    qMscfd,
    correlation,
    sigmaDyneCm,
    rhoLiquidLbFt3,
    gasSg,
  });
  if (!loading.ok) return { ok: false, errors: [loading.error], result: null };

  const warnings = [];
  if (loading.loaded) {
    warnings.push({
      code: 'loading',
      message: `At ${Math.round(qMscfd).toLocaleString()} Mscf/d this well is ${Math.abs(loading.marginPct).toFixed(0)} percent below the rate needed to carry its liquid at ${Math.round(loading.controlling.depthFt).toLocaleString()} ft. Liquid is accumulating there, and the column it builds will keep cutting the rate.`,
    });
  } else if (loading.marginPct < 20) {
    warnings.push({
      code: 'nearLoading',
      message: `The well is only ${loading.marginPct.toFixed(0)} percent above its critical rate at ${Math.round(loading.controlling.depthFt).toLocaleString()} ft. It has very little margin left.`,
    });
  }
  if (form.correlation !== 'auto' && form.correlation !== guidance.correlation) {
    warnings.push({
      code: 'correlationChoice',
      message: `${guidance.reason} You have chosen ${form.correlation}; the two differ by 20 percent.`,
    });
  }

  return {
    ok: true,
    errors: [],
    result: {
      whp,
      gasSg,
      correlation,
      guidance,
      qMscfd,
      pwfPsia: solved.op.pwf,
      aofMscfd: model.gasIpr.aof,
      solved,
      profile,
      loading,
      warnings,
    },
  };
};

/**
 * WHEN this well will load, as the reservoir depletes.
 *
 * The useful question is not whether a well is loading today but at
 * what reservoir pressure it will start. As pr falls the deliverability
 * falls with it, while the critical rate falls more slowly, and the two
 * curves cross. That crossing is the number a tubing change, a plunger
 * or a compressor gets justified against.
 *
 * Each point is a nodal solve plus a marched column, so this is an
 * explicit run.
 *
 * returns { ok, points: [{ prPsia, qMscfd, criticalMscfd, marginPct,
 *           loaded }], crossingPrPsia }
 */
export const loadingForecast = ({
  model, inputs, whp, gasSg, sigmaDyneCm, rhoLiquidLbFt3, correlation,
  prFrom, prTo, nPoints = 8,
}) => {
  const prs = linspace(prFrom, prTo, Math.max(2, Math.round(nPoints)));
  const points = [];
  for (const prPsia of prs) {
    // Re-build the inflow at the future reservoir pressure. The
    // deliverability coefficients are held: this is a depletion, not a
    // different well.
    const future = {
      ...inputs,
      inflow: { ...inputs.inflow, pr: String(prPsia) },
    };
    const gasIpr = buildGasIpr(future);
    if (!gasIpr || !(gasIpr.aof > 0)) {
      points.push({ prPsia, qMscfd: null, criticalMscfd: null, loaded: null, reason: 'the inflow did not build' });
      continue;
    }
    const atPr = { ...model, gasIpr };
    const solved = deliverability({ model: atPr, whp, gasSg });
    if (!solved.op) {
      points.push({ prPsia, qMscfd: 0, criticalMscfd: null, loaded: true, reason: 'the well no longer flows' });
      continue;
    }
    const q = solved.op.q;
    const profile = flowingProfile({ model: atPr, qMscfd: q, whp });
    const loading = loadingProfile({
      stations: profile.stations, qMscfd: q, correlation,
      sigmaDyneCm, rhoLiquidLbFt3, gasSg,
    });
    points.push({
      prPsia,
      qMscfd: q,
      criticalMscfd: loading.ok ? loading.controlling.criticalRateMscfd : null,
      controllingDepthFt: loading.ok ? loading.controlling.depthFt : null,
      marginPct: loading.ok ? loading.marginPct : null,
      loaded: loading.ok ? loading.loaded : null,
    });
  }

  // Where the two curves cross, by linear interpolation on the margin.
  let crossingPrPsia = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!Number.isFinite(a.marginPct) || !Number.isFinite(b.marginPct)) continue;
    if (a.marginPct > 0 && b.marginPct <= 0) {
      const f = a.marginPct / (a.marginPct - b.marginPct);
      crossingPrPsia = a.prPsia + f * (b.prPsia - a.prPsia);
      break;
    }
  }
  return { ok: true, points, crossingPrPsia };
};

/**
 * What tubing would keep this well unloaded at its current rate.
 *
 * Evaluated at the CONTROLLING station, because that is the one that
 * decides, and a smaller string changes the pressure profile too --
 * which is why the answer is a screening list rather than a promise.
 */
export const tubingOptions = ({ result, sigmaDyneCm, rhoLiquidLbFt3, correlation, gasSg }) => {
  const c = result.loading.controlling;
  return sizeTubingForRate({
    candidatesIdIn: TUBING_CANDIDATES_IN,
    qMscfd: result.qMscfd,
    correlation,
    sigmaDyneCm,
    rhoLiquidLbFt3,
    pPsia: c.pPsia,
    tempR: c.tempR,
    z: c.z,
    gasSg,
  });
};

/**
 * Plunger lift for this well, with the well's own numbers rather than
 * typed-in ones where they are already known.
 */
export const plungerScreen = ({ model, result, form }) => {
  const depthFt = model.tvdMax;
  const bottom = result.profile.stations[result.profile.stations.length - 1];
  return screenPlungerLift({
    depthFt,
    idIn: model.vlp.idIn,
    linePressurePsia: num(form.linePressurePsia, result.whp),
    casingPressurePsia: num(form.casingPressurePsia, NaN),
    slugLengthFt: num(form.slugLengthFt, NaN),
    liquidSg: num(form.liquidSg, 1.02),
    plungerWeightLb: num(form.plungerWeightLb, NaN),
    gasSg: result.gasSg,
    avgTempR: (result.profile.stations[0].tempR + bottom.tempR) / 2,
    z: bottom.z,
    wellGlrScfBbl: num(form.wellGlrScfBbl, NaN),
    frictionPsi: num(form.frictionPsi, 0),
    riseFtMin: num(form.riseFtMin, undefined) || undefined,
    fallInGasFtMin: num(form.fallInGasFtMin, undefined) || undefined,
    fallInLiquidFtMin: num(form.fallInLiquidFtMin, undefined) || undefined,
    afterflowMin: num(form.afterflowMin, 0),
    shutInMin: num(form.shutInMin, 0),
    scfPerBblPer1000ft: num(form.scfPerBblPer1000ft, undefined) || undefined,
  });
};

/** The longest slug this well's casing pressure could lift. */
/**
 * The longest slug this casing pressure can lift, or a refusal.
 *
 * Item 34 gave `maxSlugLengthFt` the refusal contract: it returns
 * `{ ok: true, maxSlugLengthFt }` or `{ ok: false, code, error }`, where
 * it used to clamp to zero or to the well depth and hand back a bare
 * number that read like an ordinary answer. This unwraps it into the
 * shape the studio renders, `{ ft, ok, reason }`, so a refusal reaches
 * the panel as a sentence rather than as a length nobody can act on.
 */
export const largestSlug = ({ model, result, form }) => {
  const bottom = result.profile.stations[result.profile.stations.length - 1];
  const solved = maxSlugLengthFt({
    casingPressurePsia: num(form.casingPressurePsia, NaN),
    linePressurePsia: num(form.linePressurePsia, result.whp),
    liquidSg: num(form.liquidSg, 1.02),
    idIn: model.vlp.idIn,
    plungerWeightLb: num(form.plungerWeightLb, NaN),
    depthFt: model.tvdMax,
    gasSg: result.gasSg,
    avgTempR: (result.profile.stations[0].tempR + bottom.tempR) / 2,
    z: bottom.z,
    frictionPsi: num(form.frictionPsi, 0),
  });
  if (solved.ok) return { ok: true, ft: solved.maxSlugLengthFt, reason: null };
  return { ok: false, ft: null, code: solved.code, reason: solved.error };
};

export {
  TURNER_FLUIDS, turnerFluid, recommendCorrelation, tubingAreaFt2,
  velocityAtRate, slugVolumeBbl, gasPwfAtRate,
};
