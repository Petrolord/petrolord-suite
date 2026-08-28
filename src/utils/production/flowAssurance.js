/**
 * Flow Assurance Studio computation layer (Production P10,
 * Production-ROADMAP.md app 10).
 *
 * The one thing this studio does that nothing else in the Suite does is
 * carry a SINGLE CONTINUOUS pressure-temperature trace from the
 * perforations to the arrival point, and ask the hydrate and wax
 * questions at every station along it. Hydrates do not form where a
 * spreadsheet says the average is; they form at one particular place,
 * and the whole point of the trace is to name it.
 *
 * The chain is four legs:
 *
 *   wellbore   perforations to wellhead, the validated nodal traverse
 *   choke      one pressure step, with Joule-Thomson cooling
 *   flowline   horizontal, coupled thermal and hydraulic march
 *   riser      vertical, the same march with gravity back in
 *
 * WHAT IS SOLVED AND WHAT IS ASSUMED, because the difference matters:
 *
 * The WELLBORE temperature is the well record's linear flowing profile.
 * It is an INPUT, not a heat transfer solution, and it is deliberately
 * the same input every other production studio uses -- a studio whose
 * traverse disagreed with the nodal studios about the temperature would
 * be worse than useless. Say it in the UI rather than implying the
 * wellbore is being solved thermally, because it is not.
 *
 * The FLOWLINE and RISER temperatures ARE solved, by the engine's
 * energy balance, from an overall U built out of the actual layers.
 * That is where this studio earns its name.
 *
 * The two are COUPLED, not overlaid: at each flowline station the
 * temperature comes from the thermal solution and the pressure gradient
 * is then evaluated at that local (p, T) with the same Beggs-Brill
 * implementation the wellbore uses. Properties that depend on
 * temperature see the temperature the line is actually at.
 *
 * WHERE THE HYDRATE BOUNDARY IS comes from the Fluid Studio's Motiee
 * screening, with its warnings carried through rather than dropped. How
 * far an inhibitor MOVES that boundary comes from the engine. The two
 * are different questions and are kept apart.
 *
 * There is NO WAX CORRELATION here. A wax appearance temperature is a
 * measurement; inventing one from API gravity would be a fiction
 * dressed as an answer. WAT is an input, and if it is blank the wax
 * question is not answered.
 *
 * Field units throughout: psia, degF, ft, in, stb/d, Mscf/d, lb/hr.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { gradientAt } from '../nodal/traverse.js';
import { computeTraverse } from '../nodal/traverse.js';
import { pwfAtRate } from '../nodal/ipr.js';
import { gasPwfAtRate } from '../nodal/system.js';
import { num, linspace } from '../nodal/numerics.js';
import { hydrateTempMotiee, hydrateCurve } from '../fluidStudioCalculations.js';
import {
  overallU, relaxationLengthFt, uForArrivalTemp, cooldownTime,
  pipeMassLbPerFt, contentsMassLbPerFt, conductivity, filmCoefficient,
  CONDUCTIVITIES, FILM_COEFFICIENTS, INSIDE_FILMS,
} from './engine/flowlineThermal.js';
import {
  inhibitionRequirement, depression, INHIBITORS,
  MAX_PRACTICAL_WT_PCT, HAMMERSCHMIDT_RELIABLE_WT_PCT,
} from './engine/hydrateInhibition.js';

export {
  CONDUCTIVITIES, FILM_COEFFICIENTS, INSIDE_FILMS, INHIBITORS,
  MAX_PRACTICAL_WT_PCT, HAMMERSCHMIDT_RELIABLE_WT_PCT, depression,
};

// ---------------------------------------------------------------------------
// Standard-condition densities and heat capacities
// ---------------------------------------------------------------------------

/** Air density at 60 F and 14.696 psia, lb/ft3. */
const AIR_DENSITY_LB_FT3 = 0.076362;
/** Fresh water at standard conditions, lb/ft3. */
const WATER_DENSITY_LB_FT3 = 62.428;
const FT3_PER_BBL = 5.614583;

/**
 * Specific heats, Btu/lb-F.
 *
 * These are representative values, not properties of the specific
 * fluid, and they are exposed as inputs precisely so that a user with
 * a real number is not stuck with a default. Oil varies with API and
 * temperature over roughly 0.42 to 0.55, gas over 0.5 to 0.65, and
 * water barely moves. The mixture is mass-weighted, which is exact --
 * only the components are approximate.
 */
export const DEFAULT_CP = { oil: 0.5, water: 1.0, gas: 0.56 };

/** Brine specific gravity from salinity, the standard linear form. */
export const brineSg = (salinityPpm) => 1 + 0.695e-6 * Math.max(0, num(salinityPpm, 0));

/**
 * Mass rate and mixture heat capacity from the SURFACE rates.
 *
 * Mass is conserved, so surface rates times standard-condition
 * densities is the mass rate everywhere in the system, exactly. No
 * formation volume factor is needed and none is used.
 *
 * returns { massRateLbHr, cpBtuLbF, oilLbHr, waterLbHr, gasLbHr, fractions }
 */
export const streamMass = ({
  qoStbd = 0, qwStbd = 0, qgMscfd = 0, api, gasSg, salinityPpm = 0, cp = DEFAULT_CP,
}) => {
  const gammaO = 141.5 / (131.5 + num(api, 32));
  const rhoO = WATER_DENSITY_LB_FT3 * gammaO;
  const rhoW = WATER_DENSITY_LB_FT3 * brineSg(salinityPpm);
  const rhoG = AIR_DENSITY_LB_FT3 * num(gasSg, 0.75);

  const oilLbHr = (num(qoStbd, 0) * FT3_PER_BBL * rhoO) / 24;
  const waterLbHr = (num(qwStbd, 0) * FT3_PER_BBL * rhoW) / 24;
  const gasLbHr = (num(qgMscfd, 0) * 1000 * rhoG) / 24;
  const total = oilLbHr + waterLbHr + gasLbHr;
  if (!(total > 0)) {
    return { ok: false, error: 'A thermal profile needs a flow rate. At zero rate the line is a cooldown problem, not a steady-state one.' };
  }
  const cpMix = (oilLbHr * num(cp.oil, DEFAULT_CP.oil)
    + waterLbHr * num(cp.water, DEFAULT_CP.water)
    + gasLbHr * num(cp.gas, DEFAULT_CP.gas)) / total;
  return {
    ok: true,
    massRateLbHr: total,
    cpBtuLbF: cpMix,
    oilLbHr,
    waterLbHr,
    gasLbHr,
    fractions: { oil: oilLbHr / total, water: waterLbHr / total, gas: gasLbHr / total },
    densities: { oil: rhoO, water: rhoW, gas: rhoG },
  };
};

// ---------------------------------------------------------------------------
// Insulation stack
// ---------------------------------------------------------------------------

/**
 * Turn the typed coating table into the engine's layer list.
 *
 * Each row carries an outer diameter and a material, and the bore of
 * each layer is the outer diameter of the one before it, so the stack
 * is described the way a pipe is actually built up rather than as a
 * list of thicknesses that have to be added correctly by hand.
 */
export const buildLayers = ({ idIn, wallIn, coatings }) => {
  const bore = num(idIn, NaN);
  const wall = num(wallIn, NaN);
  if (!(bore > 0) || !(wall > 0)) return { ok: false, error: 'The pipe needs a bore and a wall thickness.' };
  const layers = [{ id: 'wall', label: 'Steel wall', idIn: bore, odIn: bore + 2 * wall, k: conductivity('steel') }];
  let od = bore + 2 * wall;
  const bad = [];
  (coatings || []).forEach((c, i) => {
    const t = num(c.thicknessIn, NaN);
    if (!(t > 0)) return;
    const k = c.materialId === 'custom' ? num(c.k, NaN) : conductivity(c.materialId);
    // A coating whose material does not resolve is REPORTED, never
    // dropped. Dropping it removes the insulation from the stack and
    // the line comes back cold with no explanation of why.
    if (!(k > 0)) { bad.push(c.materialId || `coating ${i + 1}`); return; }
    layers.push({
      id: c.id || `coat${i}`,
      label: c.label || CONDUCTIVITIES.find((x) => x.id === c.materialId)?.label || 'Coating',
      idIn: od,
      odIn: od + 2 * t,
      k,
    });
    od += 2 * t;
  });
  if (bad.length) {
    return { ok: false, error: `No conductivity for ${bad.join(', ')}. Pick a material or give a custom conductivity; a coating with no conductivity cannot be left out of the stack silently.` };
  }
  return { ok: true, layers, outerOdIn: od };
};

/**
 * The overall U for a leg, referred to the BORE.
 *
 * Every U in this studio is referred to the inside diameter and says so,
 * because a U without its reference area is not a number, and quoting
 * one referred to the outside against one referred to the inside is the
 * commonest way a heat transfer hand calculation goes wrong.
 */
export const legU = ({
  idIn, wallIn, coatings, insideFilmId = 'multiphaseFlowing',
  outsideFilmId = 'seawaterCurrent', burialFt, soilId = 'soilWet',
}) => {
  const stack = buildLayers({ idIn, wallIn, coatings });
  if (!stack.ok) return stack;
  const inside = filmCoefficient(insideFilmId);
  const outside = filmCoefficient(outsideFilmId);
  if (!(inside > 0) || !(outside > 0)) {
    return { ok: false, error: 'One of the film coefficients does not resolve. Pick both from the lists rather than leaving one to a default that may not be the right side of the pipe.' };
  }
  const kSoil = conductivity(soilId);
  if (num(burialFt, 0) > 0 && !(kSoil > 0)) {
    return { ok: false, error: 'A buried line needs a soil conductivity.' };
  }
  const u = overallU({
    layers: stack.layers,
    insideFilmH: inside,
    outsideFilmH: outside,
    burialFt: num(burialFt, 0),
    kSoil,
    referenceIdIn: num(idIn, NaN),
  });
  if (!u.ok) return u;
  return { ...u, layers: stack.layers, outerOdIn: stack.outerOdIn };
};

// ---------------------------------------------------------------------------
// The march
// ---------------------------------------------------------------------------

/** A straight pipe at a fixed inclination, in the trajectory's own shape. */
const straightTrajectory = ({ lengthFt, inclinationDeg }) => {
  const inc = num(inclinationDeg, 90);
  const rise = lengthFt * Math.cos((inc * Math.PI) / 180);
  return {
    points: [
      { md: 0, tvd: 0, angle: inc },
      { md: lengthFt, tvd: rise, angle: inc },
    ],
    tvdMax: rise,
    mdMax: lengthFt,
    warnings: [],
  };
};

/**
 * March one pipe leg in the DIRECTION OF FLOW, coupling temperature and
 * pressure.
 *
 * Temperature at each station is the engine's exponential approach to
 * ambient, which is exact for a constant U and Cp. Pressure is then
 * integrated with the same two-phase gradient the wellbore traverse
 * uses, re-evaluated at the local pressure AND the local temperature.
 *
 * Sign convention: `dpdz` from the nodal gradient is dp/dMD with MD
 * increasing downhole for an upward-flowing producer, which is to say
 * it is positive AGAINST the flow. Marching a distance dx along the
 * flow therefore subtracts it. For a horizontal leg the gravity term
 * falls out and only friction remains; for a riser the hydrostatic
 * head comes back in through exactly the same term, which is why both
 * legs are one function rather than two.
 *
 * returns { ok, stations, pOut, tOut, u, relaxationLengthFt, ntu, warnings }
 */
export const marchLeg = ({
  lengthFt, inclinationDeg = 90, idIn, roughnessIn = 0.0006, correlation = 'beggsBrill',
  fluidModel, rates, pInPsia, tInF, ambientTempF, uBtuHrFt2F,
  massRateLbHr, cpBtuLbF, nStations = 41, label = 'flowline',
}) => {
  const L = num(lengthFt, NaN);
  if (!(L > 0)) return { ok: false, error: `${label}: a length is needed.` };
  const lc = relaxationLengthFt({ massRateLbHr, cpBtuLbF, uBtuHrFt2F, idIn });
  if (!Number.isFinite(lc) || !(lc > 0)) {
    return { ok: false, error: `${label}: the thermal march needs a mass rate, a heat capacity and a heat transfer coefficient.` };
  }
  const trajectory = straightTrajectory({ lengthFt: L, inclinationDeg });
  const rough = num(roughnessIn, 0.0006) / num(idIn, 1);
  const n = Math.max(2, Math.round(nStations));
  const dx = L / (n - 1);
  const warnings = [];

  const tempAt = (x) => ambientTempF + (tInF - ambientTempF) * Math.exp(-x / lc);

  let p = pInPsia;
  const stations = [];
  for (let i = 0; i < n; i += 1) {
    const x = i * dx;
    const tF = tempAt(x);
    if (p < 14.7) {
      warnings.push(`${label}: pressure fell to atmospheric ${Math.round(x)} ft in. The line cannot carry this rate.`);
      break;
    }
    // The gradient wants a temperature as a function of TVD; on a
    // single station there is exactly one, so hand it this one.
    const g = gradientAt({
      md: x, p, fluidModel, rates, trajectory, tAt: () => tF, idIn, rough, correlation,
    });
    stations.push({
      xFt: x, pPsia: p, tempF: tF, dpdz: g.dpdz,
      gradGrav: g.gradGrav, gradFric: g.gradFric, holdup: g.holdup, pattern: g.pattern,
    });
    if (i === n - 1) break;
    // Heun step in the flow direction: predictor at the next station's
    // own temperature, so the corrector is not evaluating a downstream
    // gradient at an upstream temperature.
    const tNext = tempAt(x + dx);
    const pPred = p - g.dpdz * dx;
    if (pPred < 14.7) {
      warnings.push(`${label}: pressure fell to atmospheric ${Math.round(x + dx)} ft in. The line cannot carry this rate.`);
      p = 14.7;
      break;
    }
    const gNext = gradientAt({
      md: x + dx, p: pPred, fluidModel, rates, trajectory, tAt: () => tNext, idIn, rough, correlation,
    });
    p -= ((g.dpdz + gNext.dpdz) / 2) * dx;
  }
  const last = stations[stations.length - 1];
  return {
    ok: warnings.length === 0,
    stations,
    pOut: last ? last.pPsia : NaN,
    tOut: last ? last.tempF : NaN,
    uBtuHrFt2F,
    relaxationLengthFt: lc,
    ntu: L / lc,
    dpPsi: stations.length ? stations[0].pPsia - last.pPsia : NaN,
    warnings,
  };
};

// ---------------------------------------------------------------------------
// The choke step
// ---------------------------------------------------------------------------

/**
 * Joule-Thomson cooling across the choke.
 *
 * The JT coefficient is an INPUT and has no default worth trusting: it
 * is a flash property that runs from roughly 0.02 to 0.08 F/psi for
 * natural gas and is near zero, occasionally slightly negative, for a
 * liquid. A studio that guessed it would be inventing the single number
 * that decides whether the wellhead is inside the hydrate region, and
 * that is exactly the number this studio exists to get right.
 *
 * The cooling is real and it is large: a 1000 psi drop on gas at
 * 0.05 F/psi is 50 F, which is why chokes and their downstream spools
 * are where hydrates actually plug.
 */
export const chokeStep = ({ pUpPsia, pDownPsia, tUpF, jtCoeffFPerPsi }) => {
  const dp = num(pUpPsia, NaN) - num(pDownPsia, NaN);
  if (!Number.isFinite(dp)) return { ok: false, error: 'The choke needs an upstream and a downstream pressure.' };
  if (dp < 0) {
    return { ok: false, error: 'The downstream pressure is above the wellhead pressure. Nothing flows through the choke in that direction.' };
  }
  const jt = num(jtCoeffFPerPsi, 0);
  const dT = jt * dp;
  return {
    ok: true,
    dpPsi: dp,
    coolingF: dT,
    tDownF: num(tUpF, NaN) - dT,
    jtCoeffFPerPsi: jt,
  };
};

// ---------------------------------------------------------------------------
// The hydrate and wax overlays
// ---------------------------------------------------------------------------

/**
 * Score one trace against the hydrate boundary and, if one was
 * measured, the wax appearance temperature.
 *
 * Subcooling is hydrate temperature less fluid temperature: positive
 * means inside the hydrate region. The WORST station is reported by
 * subcooling rather than by temperature, because the coldest point is
 * not always the most exposed one -- a cold low-pressure arrival can be
 * safe while a warmer high-pressure spool is not, and getting that
 * backwards is the whole failure mode this studio guards against.
 */
export const scoreTrace = ({ trace, gasSg, watF }) => {
  const scored = trace.map((pt) => {
    const tHyd = pt.pPsia > 0 ? hydrateTempMotiee(pt.pPsia, gasSg) : null;
    const sub = tHyd != null && Number.isFinite(tHyd) ? tHyd - pt.tempF : null;
    const wat = num(watF, NaN);
    return {
      ...pt,
      tHydF: tHyd != null && Number.isFinite(tHyd) ? tHyd : null,
      subcoolingF: sub,
      inHydrate: sub != null && sub > 0,
      belowWat: Number.isFinite(wat) ? pt.tempF < wat : null,
    };
  });
  const exposed = scored.filter((p) => p.inHydrate);
  const worst = scored.reduce(
    (best, p) => (p.subcoolingF != null && (best == null || p.subcoolingF > best.subcoolingF) ? p : best),
    null,
  );
  const waxPoints = scored.filter((p) => p.belowWat === true);
  return {
    stations: scored,
    inHydrate: exposed.length > 0,
    entry: exposed.length ? exposed[0] : null,
    exit: exposed.length ? exposed[exposed.length - 1] : null,
    exposedLengthFt: exposed.length
      ? exposed[exposed.length - 1].sFt - exposed[0].sFt
      : 0,
    worst,
    maxSubcoolingF: worst?.subcoolingF ?? null,
    wax: Number.isFinite(num(watF, NaN))
      ? {
        watF: num(watF, NaN),
        crosses: waxPoints.length > 0,
        entry: waxPoints.length ? waxPoints[0] : null,
        coldest: scored.reduce((c, p) => (c == null || p.tempF < c.tempF ? p : c), null),
      }
      : null,
  };
};

/** Where the hydrate boundary is, and the caveats that come with it. */
export const HYDRATE_BASIS_NOTE = 'The hydrate boundary is the Motiee (1991) gas-gravity screening the Fluid Studio uses. It is a screening correlation for sweet natural gas: it does not know about CO2, H2S or salt, and a design decision should be confirmed against a measured dissociation curve or a compositional flash.';

export const SALINITY_NOTE = 'Produced-water salt inhibits hydrates too, and it is not in this boundary. Ignoring it is conservative -- it over-states the subcooling and so over-doses the inhibitor -- but on a high-salinity well it over-states it substantially.';

// ---------------------------------------------------------------------------
// The whole analysis
// ---------------------------------------------------------------------------

/** Rate bundle for the traverse, from the duty the user typed. */
export const dutyRates = ({ phase, duty }) => {
  if (phase === 'gas') {
    const qg = num(duty.qgMscfd, NaN);
    if (!(qg > 0)) return { ok: false, error: 'A gas rate is needed.' };
    return {
      ok: true,
      traverse: { qgMscfd: qg, wgr: num(duty.wgr, 0), cgr: num(duty.cgr, 0) },
      qoStbd: (num(duty.cgr, 0) * qg) / 1000,
      qwStbd: (num(duty.wgr, 0) * qg) / 1000,
      qgMscfd: qg,
    };
  }
  const qo = num(duty.qoStbd, NaN);
  if (!(qo > 0)) return { ok: false, error: 'An oil rate is needed.' };
  const wct = num(duty.wctPct, 0) / 100;
  if (!(wct >= 0) || wct >= 1) return { ok: false, error: 'Water cut has to be between 0 and 100 percent.' };
  const qt = qo / (1 - wct);
  const gor = num(duty.gor, NaN);
  return {
    ok: true,
    traverse: { qo, wct, gor },
    qoStbd: qo,
    qwStbd: qt - qo,
    qgMscfd: Number.isFinite(gor) ? (qo * gor) / 1000 : 0,
  };
};

/**
 * The full reservoir-to-arrival analysis.
 *
 * form sections: duty, choke, flowline, riser, thermal, hydrate, inhibitor,
 * cooldown. `model` is the shared well record (P6.5).
 *
 * Every leg that cannot be run is REPORTED as a named problem rather
 * than dropped, because a trace that quietly stops at the wellhead
 * looks exactly like a trace that found nothing wrong downstream.
 */
export const runFlowAssurance = ({ form, model }) => {
  const errors = [];
  const notes = [];
  if (!model) return { ok: false, errors: ['The well model is incomplete. Fill in the Well tab.'] };

  const duty = form.duty || {};
  const rates = dutyRates({ phase: model.phase, duty });
  if (!rates.ok) return { ok: false, errors: [rates.error] };

  const mass = streamMass({
    qoStbd: rates.qoStbd,
    qwStbd: rates.qwStbd,
    qgMscfd: rates.qgMscfd,
    api: model.fluidModel.api,
    gasSg: model.fluidModel.gasSg,
    salinityPpm: model.fluidModel.salinityPpm,
    cp: {
      oil: num(form.thermal?.cpOil, DEFAULT_CP.oil),
      water: num(form.thermal?.cpWater, DEFAULT_CP.water),
      gas: num(form.thermal?.cpGas, DEFAULT_CP.gas),
    },
  });
  if (!mass.ok) return { ok: false, errors: [mass.error] };

  // ---- leg 1: the wellbore -----------------------------------------
  const whp = num(duty.whpPsia, NaN);
  if (!(whp > 0)) return { ok: false, errors: ['A wellhead pressure is needed to start the trace.'] };
  const up = computeTraverse({
    ...model.vlp,
    rates: rates.traverse,
    pStart: whp,
    mdStart: 0,
    mdEnd: model.vlp.nodeMd,
  });
  if (!up.points.length) errors.push('The wellbore traverse did not run.');
  up.warnings.forEach((w) => notes.push(`Wellbore: ${w}`));

  // The trace runs in the FLOW direction, so the wellbore comes back
  // reversed: perforations first, wellhead last.
  const wellbore = [...up.points].reverse().map((pt) => ({
    sFt: model.vlp.nodeMd - pt.md,
    leg: 'wellbore',
    label: 'Wellbore',
    mdFt: pt.md,
    tvdFt: pt.tvd,
    pPsia: pt.p,
    tempF: pt.tF,
  }));
  const wellheadT = wellbore.length ? wellbore[wellbore.length - 1].tempF : NaN;
  const bhpPsia = up.pEnd;

  // Drawdown, when the inflow can say what it should be at this rate.
  let drawdown = null;
  if (model.phase === 'oil' && model.ipr && rates.qoStbd > 0) {
    const pwf = pwfAtRate(model.ipr, rates.qoStbd);
    if (Number.isFinite(pwf)) drawdown = { pwfFromIpr: pwf, pwfFromVlp: bhpPsia, gapPsi: pwf - bhpPsia };
  } else if (model.phase === 'gas' && model.gasIpr && rates.qgMscfd > 0) {
    const pwf = gasPwfAtRate(model.gasIpr, rates.qgMscfd);
    if (Number.isFinite(pwf)) drawdown = { pwfFromIpr: pwf, pwfFromVlp: bhpPsia, gapPsi: pwf - bhpPsia };
  }

  // ---- leg 2: the choke --------------------------------------------
  const ch = form.choke || {};
  const choke = chokeStep({
    pUpPsia: whp,
    pDownPsia: num(ch.pDownPsia, NaN),
    tUpF: wellheadT,
    jtCoeffFPerPsi: num(ch.jtCoeffFPerPsi, 0),
  });
  if (!choke.ok) errors.push(choke.error);
  if (choke.ok && !(num(ch.jtCoeffFPerPsi, 0) > 0) && model.phase === 'gas') {
    notes.push('The Joule-Thomson coefficient is zero, so the choke is being treated as isothermal. On gas it is not: a real coefficient is the difference between a wellhead that is comfortably outside the hydrate region and one that is not.');
  }

  // ---- legs 3 and 4: flowline and riser ------------------------------
  const legs = [];
  const legSpecs = [
    { key: 'flowline', spec: form.flowline, label: 'Flowline', inclinationDeg: 90 },
    { key: 'riser', spec: form.riser, label: 'Riser', inclinationDeg: 0 },
  ];
  let p = choke.ok ? num(ch.pDownPsia, NaN) : NaN;
  let t = choke.ok ? choke.tDownF : NaN;

  legSpecs.forEach(({ key, spec, label, inclinationDeg }) => {
    if (!spec || !spec.enabled) return;
    const u = legU({
      idIn: num(spec.idIn, NaN),
      wallIn: num(spec.wallIn, NaN),
      coatings: spec.coatings,
      insideFilmId: spec.insideFilmId,
      outsideFilmId: spec.outsideFilmId,
      burialFt: num(spec.burialFt, 0),
      soilId: spec.soilId,
    });
    if (!u.ok) { errors.push(`${label}: ${u.error}`); return; }
    const marched = marchLeg({
      lengthFt: num(spec.lengthFt, NaN),
      inclinationDeg,
      idIn: num(spec.idIn, NaN),
      roughnessIn: num(spec.roughnessIn, 0.0018),
      correlation: spec.correlation || 'beggsBrill',
      fluidModel: model.fluidModel,
      rates: rates.traverse,
      pInPsia: p,
      tInF: t,
      ambientTempF: num(spec.ambientTempF, NaN),
      uBtuHrFt2F: u.uBtuHrFt2F,
      massRateLbHr: mass.massRateLbHr,
      cpBtuLbF: mass.cpBtuLbF,
      label,
    });
    if (marched.error) { errors.push(marched.error); return; }
    marched.warnings.forEach((w) => notes.push(w));
    legs.push({ key, label, u, ...marched });
    if (Number.isFinite(marched.pOut)) p = marched.pOut;
    if (Number.isFinite(marched.tOut)) t = marched.tOut;
  });

  // ---- one continuous trace ------------------------------------------
  const trace = [...wellbore];
  let s = wellbore.length ? wellbore[wellbore.length - 1].sFt : 0;
  if (choke.ok) {
    // The choke is a step, not a length. It gets its own station at the
    // same distance so the trace shows the drop as the vertical jump it
    // physically is rather than smearing it over a made-up length.
    trace.push({
      sFt: s, leg: 'choke', label: 'Choke (downstream)',
      pPsia: num(ch.pDownPsia, NaN), tempF: choke.tDownF,
    });
  }
  legs.forEach((leg) => {
    leg.stations.forEach((st, i) => {
      if (i === 0 && trace.length) return; // the leg inlet is the previous outlet
      trace.push({
        sFt: s + st.xFt, leg: leg.key, label: leg.label,
        pPsia: st.pPsia, tempF: st.tempF, holdup: st.holdup, pattern: st.pattern,
      });
    });
    s += leg.stations.length ? leg.stations[leg.stations.length - 1].xFt : 0;
  });

  const gasSg = num(form.hydrate?.gasSg, model.fluidModel.gasSg);
  const scored = scoreTrace({ trace, gasSg, watF: num(form.hydrate?.watF, NaN) });

  // ---- inhibition -----------------------------------------------------
  const inh = form.inhibitor || {};
  const subcooling = scored.maxSubcoolingF;
  const inhibition = Number.isFinite(subcooling)
    ? inhibitionRequirement({
      subcoolingF: subcooling,
      safetyMarginF: num(inh.safetyMarginF, 0),
      waterRateBpd: num(inh.waterRateBpd, rates.qwStbd),
      inhibitorId: inh.inhibitorId || 'methanol',
      leanWtPct: num(inh.leanWtPct, 100),
    })
    : null;

  // ---- insulation target ----------------------------------------------
  const firstLeg = legs[0];
  let insulationTarget = null;
  if (firstLeg && Number.isFinite(num(form.thermal?.targetArrivalF, NaN))) {
    const spec = firstLeg.key === 'flowline' ? form.flowline : form.riser;
    insulationTarget = uForArrivalTemp({
      lengthFt: num(spec.lengthFt, NaN),
      inletTempF: firstLeg.stations[0]?.tempF,
      ambientTempF: num(spec.ambientTempF, NaN),
      targetTempF: num(form.thermal.targetArrivalF, NaN),
      massRateLbHr: mass.massRateLbHr,
      cpBtuLbF: mass.cpBtuLbF,
      idIn: num(spec.idIn, NaN),
    });
    if (insulationTarget?.ok) {
      insulationTarget.currentU = firstLeg.u.uBtuHrFt2F;
      insulationTarget.met = firstLeg.u.uBtuHrFt2F <= insulationTarget.uBtuHrFt2F;
    }
  }

  // ---- cooldown --------------------------------------------------------
  const cd = form.cooldown || {};
  let cooldown = null;
  if (cd.enabled && firstLeg) {
    const spec = firstLeg.key === 'flowline' ? form.flowline : form.riser;
    const idIn = num(spec.idIn, NaN);
    const odIn = firstLeg.u.outerOdIn;
    // What is in the line when it stops is the LIQUID that settles out,
    // not the flowing mixture, so its density is an input rather than
    // the mass-weighted average of a stream that is no longer moving.
    const contentsRho = num(cd.contentsDensityLbFt3, mass.densities.oil);
    cooldown = cooldownTime({
      contents: {
        massLbPerFt: contentsMassLbPerFt({ idIn, densityLbFt3: contentsRho }),
        cpBtuLbF: num(cd.contentsCp, DEFAULT_CP.oil),
      },
      shell: {
        massLbPerFt: pipeMassLbPerFt({ idIn, odIn: num(spec.idIn, 0) + 2 * num(spec.wallIn, 0) }),
        cpBtuLbF: num(cd.steelCp, 0.11),
      },
      uBtuHrFt2F: firstLeg.u.uBtuHrFt2F,
      idIn,
      startTempF: num(cd.startTempF, firstLeg.stations[0]?.tempF),
      ambientTempF: num(spec.ambientTempF, NaN),
      targetTempF: num(cd.targetTempF, NaN),
    });
    if (cooldown?.ok && Number.isFinite(cooldown.hours)) {
      cooldown.note = cooldown.note || `No-touch time: ${cooldown.hours.toFixed(1)} hours before the line reaches ${num(cd.targetTempF, NaN).toFixed(0)} F. The insulation ODs are counted in the shell, and so is the steel's own heat capacity -- leaving the steel out is a common and optimistic error.`;
    }
    if (odIn <= num(spec.idIn, 0) + 2 * num(spec.wallIn, 0)) {
      // no coatings: nothing further to say
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    notes: [...new Set(notes)],
    mass,
    wellbore: { points: wellbore, bhpPsia, whpPsia: whp, warnings: up.warnings },
    drawdown,
    choke,
    legs,
    trace: scored.stations,
    hydrate: {
      basis: HYDRATE_BASIS_NOTE,
      salinity: SALINITY_NOTE,
      gasSg,
      curve: hydrateCurve(gasSg, 100, Math.max(1000, Math.ceil(whp / 500) * 500)),
      inHydrate: scored.inHydrate,
      entry: scored.entry,
      exit: scored.exit,
      exposedLengthFt: scored.exposedLengthFt,
      worst: scored.worst,
      maxSubcoolingF: scored.maxSubcoolingF,
    },
    wax: scored.wax,
    inhibition,
    insulationTarget,
    cooldown,
    arrival: trace.length ? trace[trace.length - 1] : null,
  };
};

/** Sweep U to show what insulation buys, as a curve rather than a number. */
export const insulationSweep = ({ analysis, form, model, uValues }) => {
  const firstLeg = analysis?.legs?.[0];
  if (!firstLeg) return { ok: false, error: 'There is no flowline leg to sweep.' };
  const spec = firstLeg.key === 'flowline' ? form.flowline : form.riser;
  const rates = dutyRates({ phase: model.phase, duty: form.duty || {} });
  if (!rates.ok) return { ok: false, error: rates.error };
  const list = uValues && uValues.length
    ? uValues
    : linspace(0.05, Math.max(1, firstLeg.u.uBtuHrFt2F * 1.5), 14);
  const points = list.map((u) => {
    const marched = marchLeg({
      lengthFt: num(spec.lengthFt, NaN),
      inclinationDeg: firstLeg.key === 'flowline' ? 90 : 0,
      idIn: num(spec.idIn, NaN),
      roughnessIn: num(spec.roughnessIn, 0.0018),
      correlation: spec.correlation || 'beggsBrill',
      fluidModel: model.fluidModel,
      rates: rates.traverse,
      pInPsia: firstLeg.stations[0]?.pPsia,
      tInF: firstLeg.stations[0]?.tempF,
      ambientTempF: num(spec.ambientTempF, NaN),
      uBtuHrFt2F: u,
      massRateLbHr: analysis.mass.massRateLbHr,
      cpBtuLbF: analysis.mass.cpBtuLbF,
      nStations: 21,
    });
    if (marched.error) return { u, arrivalTempF: NaN, subcoolingF: NaN };
    const tHyd = hydrateTempMotiee(marched.pOut, analysis.hydrate.gasSg);
    return {
      u,
      arrivalTempF: marched.tOut,
      arrivalPsia: marched.pOut,
      tHydF: Number.isFinite(tHyd) ? tHyd : null,
      subcoolingF: Number.isFinite(tHyd) ? tHyd - marched.tOut : null,
    };
  });
  // The U at which the arrival stops being inside the hydrate region,
  // read off the sweep rather than asserted.
  const safe = points.filter((pt) => pt.subcoolingF != null && pt.subcoolingF <= 0);
  return {
    ok: true,
    points,
    breakEvenU: safe.length ? Math.max(...safe.map((pt) => pt.u)) : null,
  };
};
