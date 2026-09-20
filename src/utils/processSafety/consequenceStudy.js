// Consequence Modelling Studio (Process Safety PS2): the study model and its
// evaluation.
//
// A study is one release case followed through five steps: the source term,
// its dispersion, a pool fire, an explosion and the harm each does to a
// person. Every number on screen comes from the vendored engine
// (engines/hse/consequence.js, through the shim). This module turns the text
// a user typed into the engine's inputs, carries one step's output into the
// next where the user asks for it, calls the engine and arranges what it
// returns. It restates no formula.
//
// The studio's own arithmetic is limited to three things, each labelled on
// screen as the studio's:
//   1. unit conversion at the edge (bar to Pa, C to K, kW/m2 to W/m2, kPa to
//      Pa, MJ/kg to J/kg, mm to m, g/mol to kg/mol), with the factors below;
//   2. a spill volume from a liquid release held for a duration
//      (rate x duration / density);
//   3. the distance grids the charts are drawn on.
//
// A saved study is its inputs and nothing else. Results are recomputed on
// open, so a reopened study cannot show numbers that no longer follow from it.
import {
  ATM_PA, BRIGGS_ADVISORY_RANGE_M, KINNEY_GRAHAM_Z_RANGE, OVERPRESSURE_PROBITS, POOL_FIRE_FUELS,
  STABILITY_CLASSES, THERMAL_PROBITS, TOXIC_PROBITS,
  atmosphericTransmissivityBagster, distanceForOverpressure, gasOrificeDischarge, gaussianPlume,
  kinneyGrahamOverpressure, liquidOrificeDischarge, mgM3ToPpm, overpressureProbit,
  plumeDistanceToConcentration, poolBurningRate, poolEvaporationMackayMatsugu, poolFireSolidFlame,
  poolFromSpill, ppmToMgM3, scaledDistance, solidFlameDistanceForHeatFlux, thermalProbit,
  tntEquivalentMass, toxicProbit,
} from '@/utils/processSafety/engine/consequence';

export const STUDY_SCHEMA = 1;
export const CONSEQUENCE_STUDIO_ROUTE = '/dashboard/apps/process-safety/consequence-studio';
export {
  BRIGGS_ADVISORY_RANGE_M, KINNEY_GRAHAM_Z_RANGE, OVERPRESSURE_PROBITS, POOL_FIRE_FUELS,
  STABILITY_CLASSES, THERMAL_PROBITS, TOXIC_PROBITS,
};

/** The unit factors the studio applies at its edge. Engine units are SI. */
export const UNIT = Object.freeze({
  PA_PER_BAR: 1e5,
  K_AT_0C: 273.15,
  W_PER_KW: 1000,
  PA_PER_KPA: 1000,
  J_PER_MJ: 1e6,
  M_PER_MM: 1e-3,
  G_PER_KG: 1000,
});

export const ATM_BAR = ATM_PA / UNIT.PA_PER_BAR;

/**
 * Text to an engine number. Blank is ABSENT (undefined), so the engine either
 * applies its documented default or refuses and names the field. Anything
 * that does not read as a number is NaN, which the engine refuses too.
 * Nothing is quietly turned into zero.
 */
export const toNumber = (v) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return undefined;
  return Number(s);
};

/** Scale a typed value, keeping absent absent and NaN NaN. */
const scaled = (v, factor) => {
  const n = toNumber(v);
  return n === undefined ? undefined : n * factor;
};
const shifted = (v, offset) => {
  const n = toNumber(v);
  return n === undefined ? undefined : n + offset;
};

export const barToPa = (v) => scaled(v, UNIT.PA_PER_BAR);
export const celsiusToK = (v) => shifted(v, UNIT.K_AT_0C);
export const kwToW = (v) => scaled(v, UNIT.W_PER_KW);
export const kpaToPa = (v) => scaled(v, UNIT.PA_PER_KPA);
export const mjToJ = (v) => scaled(v, UNIT.J_PER_MJ);
export const mmToM = (v) => scaled(v, UNIT.M_PER_MM);
export const gToKgPerMol = (v) => scaled(v, 1 / UNIT.G_PER_KG);

// --------------------------------------------------------------- choices

export const SPILL_SOURCES = Object.freeze([
  { id: 'typed', label: 'A volume I type' },
  { id: 'liquid-release', label: 'The liquid release held for a duration' },
]);

export const CONTAINMENTS = Object.freeze([
  { id: 'bund', label: 'Confined by a bund' },
  { id: 'thickness', label: 'Unconfined, at a stated thickness' },
]);

export const PLUME_RATE_SOURCES = Object.freeze([
  { id: 'evaporation', label: 'Pool evaporation rate (Source term)' },
  { id: 'gas-release', label: 'Gas release rate (Source term)' },
  { id: 'typed', label: 'A rate I type' },
]);

export const SIGMA_MODES = Object.freeze([
  { id: 'class', label: 'Briggs rural, Pasquill-Gifford class' },
  { id: 'user', label: 'Sigmas I give' },
]);

export const CONCENTRATION_UNITS = Object.freeze(['ppm', 'mg/m3']);

export const DIAMETER_SOURCES = Object.freeze([
  { id: 'pool', label: 'Pool from spill (Source term)' },
  { id: 'typed', label: 'A diameter I type' },
]);

export const BURNING_METHODS = Object.freeze([
  { id: 'babrauskas', label: 'Babrauskas (YB 6.66, Table 6.5)' },
  { id: 'burgess', label: 'Burgess (YB 6.67)' },
]);

export const FLAME_LENGTH_METHODS = Object.freeze([
  { id: 'thomas-wind', label: 'Thomas with wind (YB 6.12 to 6.14)' },
  { id: 'thomas-still-air', label: 'Thomas, still air (1963)' },
]);

export const SEP_METHODS = Object.freeze([
  { id: 'radiative-fraction-soot', label: 'Radiative fraction with soot (YB 6.20, 6.71)' },
  { id: 'radiative-fraction', label: 'Radiative fraction, clear flame (YB 6.71)' },
  { id: 'mudan-diameter', label: 'Mudan, from the diameter (YB 6.19)' },
]);

export const TRANSMISSIVITY_MODES = Object.freeze([
  { id: 'given', label: 'A value I give' },
  { id: 'bagster', label: 'Bagster (YB 6.29), from the water vapour pressure' },
]);

export const CHARGE_MODES = Object.freeze([
  { id: 'fuel', label: 'TNT equivalent of a fuel mass' },
  { id: 'tnt', label: 'A TNT mass I give' },
]);

export const HARM_LINKS = Object.freeze({
  thermal: [{ id: 'fire', label: 'Heat flux at the Fire tab target' }, { id: 'typed', label: 'A heat flux I type' }],
  toxic: [
    { id: 'dispersion-receptor', label: 'Concentration at the Dispersion tab receptor' },
    { id: 'dispersion-centreline', label: 'Centreline concentration (Dispersion tab)' },
    { id: 'typed', label: 'A concentration I type' },
  ],
  overpressure: [{ id: 'explosion', label: 'Overpressure at the Explosion tab distance' }, { id: 'typed', label: 'An overpressure I type' }],
});

// --------------------------------------------------------------- defaults

/**
 * The study a new session opens on: a benzene release into a bund.
 *
 * The FIRE step is the TNO Yellow Book CPR 14E (2005) worked example 6.6.3
 * exactly (bund 1415 m2, benzene, u10 5 m/s, target 100 m from the centre,
 * transmissivity 0.71474 read from Hottel's charts), including the example's
 * printed air viscosity of 7.5133e-6 m2/s, which is half the physical value
 * (FINDINGS-consequence.md section 4 item 2). It reproduces the printed
 * 4,581 W/m2. The gas release is the YB 2.6.2.1 hydrogen case (gamma 1.405 is
 * inferred; the YB does not print it).
 *
 * Every other number is ILLUSTRATIVE, chosen to carry one step into the next
 * (the benzene vapour pressure, the hole, the explosion charge, the exposure
 * times). None of those is a published worked example, and the UI says so.
 */
export const defaultStudy = () => ({
  source: {
    liquid: {
      dischargeCoefficient: '0.62',
      holeDiameterMm: '50',
      liquidDensityKgM3: '879',
      liquidHeadM: '5',
      pressureAboveLiquidBar: String(ATM_BAR),
      ambientPressureBar: String(ATM_BAR),
    },
    gas: {
      dischargeCoefficient: '0.62',
      holeDiameterMm: '100',
      upstreamPressureBar: '50',
      upstreamTemperatureC: '15',
      molarMassGMol: '2.016',
      heatCapacityRatio: '1.405',
      ambientPressureBar: String(ATM_BAR),
    },
    pool: {
      spillSource: 'typed',
      spillVolumeM3: '700',
      releaseDurationS: '600',
      containment: 'bund',
      bundAreaM2: '1415',
      bundWallHeightM: '1',
      poolThicknessM: '0.01',
    },
    evaporation: {
      windSpeed10mMS: '5',
      vapourPressureKPa: '10',
      molarMassGMol: '78.11',
      liquidTemperatureC: '20',
      schmidtNumber: '0.8',
      ambientPressureBar: String(ATM_BAR),
    },
  },
  dispersion: {
    rateSource: 'evaporation',
    massRateKgS: '1',
    windSpeedMS: '5',
    sigmaMode: 'class',
    stabilityClass: 'D',
    sigmaYM: '',
    sigmaZM: '',
    downwindDistanceM: '500',
    crosswindDistanceM: '50',
    receptorHeightM: '0',
    releaseHeightM: '0',
    molarMassGMol: '78.11',
    temperatureC: '25',
    pressureBar: String(ATM_BAR),
    targetConcentration: '100',
    targetUnit: 'ppm',
  },
  fire: {
    diameterSource: 'pool',
    poolDiameterM: '20',
    burningMethod: 'babrauskas',
    fuel: 'benzene',
    customBurning: false,
    massBurningFluxInfKgM2S: '',
    kBetaPerM: '',
    heatOfVaporisationMJKg: '',
    liquidHeatCapacityJKgK: '',
    boilingPointC: '',
    ambientTemperatureC: '20',
    heatOfCombustionMJKg: '40.15',
    flameLengthMethod: 'thomas-wind',
    airDensityKgM3: '1.2243',
    windSpeed10mMS: '5',
    airKinematicViscosityM2S: '7.5133e-6',
    sepMethod: 'radiative-fraction-soot',
    radiativeFraction: '0.4',
    sootFraction: '0.8',
    sootEmissivePowerKWM2: '20',
    distanceFromCentreM: '100',
    transmissivityMode: 'given',
    transmissivity: '0.71474',
    waterVapourPartialPressurePa: '1200',
    searchTransmissivity: '0.8',
    targetHeatFluxKWM2: '5',
  },
  explosion: {
    chargeMode: 'fuel',
    fuelMassKg: '1000',
    heatOfCombustionMJKg: '46',
    yieldFactor: '0.03',
    tntBlastEnergyMJKg: '4.68',
    tntMassKg: '100',
    distanceM: '100',
    ambientPressureBar: String(ATM_BAR),
    targetOverpressureKPa: '20',
  },
  harm: {
    thermal: { link: 'fire', preset: 'eisenberg', heatFluxKWM2: '10', exposureTimeS: '60' },
    toxic: {
      link: 'dispersion-centreline', preset: 'lees-benzene', concentration: '1000', unit: 'ppm',
      exposureMinutes: '30', molarMassGMol: '78.11',
    },
    overpressure: { link: 'explosion', preset: 'hsc', overpressureKPa: '20' },
  },
});

/**
 * Read a saved payload back into a study, tolerating fields a later build
 * adds and filling any a saved study lacks from the defaults. Returns null
 * when the payload is not a study at all.
 */
export const studyFromPayload = (payload) => {
  const s = payload?.study;
  if (!s || typeof s !== 'object' || !s.source || !s.dispersion) return null;
  const d = defaultStudy();
  const merge = (base, over) => ({ ...base, ...(over && typeof over === 'object' ? over : {}) });
  return {
    source: {
      liquid: merge(d.source.liquid, s.source.liquid),
      gas: merge(d.source.gas, s.source.gas),
      pool: merge(d.source.pool, s.source.pool),
      evaporation: merge(d.source.evaporation, s.source.evaporation),
    },
    dispersion: merge(d.dispersion, s.dispersion),
    fire: merge(d.fire, s.fire),
    explosion: merge(d.explosion, s.explosion),
    harm: {
      thermal: merge(d.harm.thermal, s.harm?.thermal),
      toxic: merge(d.harm.toxic, s.harm?.toxic),
      overpressure: merge(d.harm.overpressure, s.harm?.overpressure),
    },
  };
};

// --------------------------------------------------------------- helpers

const ok = (r) => r && !r.error;

/** A refusal the studio raises when a linked input has nothing to link to. */
const upstreamMissing = (field, what) => ({
  error: `${field}: ${what} has no result yet, so there is nothing to carry over. Fix it there or type a value here.`,
  field,
  upstream: true,
});

/** Evenly spaced in log between lo and hi, n points. */
export const logGrid = (lo, hi, n = 60) => {
  if (!(lo > 0) || !(hi > lo) || n < 2) return [];
  const a = Math.log(lo);
  const b = Math.log(hi);
  return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)));
};

export const linGrid = (lo, hi, n = 60) => {
  if (!(hi > lo) || n < 2) return [];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
};

// --------------------------------------------------------------- source term

export const liquidEngineInput = (l) => ({
  dischargeCoefficient: toNumber(l.dischargeCoefficient),
  holeDiameterM: mmToM(l.holeDiameterMm),
  liquidDensityKgM3: toNumber(l.liquidDensityKgM3),
  liquidHeadM: toNumber(l.liquidHeadM),
  pressureAboveLiquidPa: barToPa(l.pressureAboveLiquidBar),
  ambientPressurePa: barToPa(l.ambientPressureBar),
});

export const gasEngineInput = (g) => ({
  dischargeCoefficient: toNumber(g.dischargeCoefficient),
  holeDiameterM: mmToM(g.holeDiameterMm),
  upstreamPressurePa: barToPa(g.upstreamPressureBar),
  upstreamTemperatureK: celsiusToK(g.upstreamTemperatureC),
  molarMassKgMol: gToKgPerMol(g.molarMassGMol),
  heatCapacityRatio: toNumber(g.heatCapacityRatio),
  ambientPressurePa: barToPa(g.ambientPressureBar),
});

/**
 * The spill volume: typed, or the liquid release held for a duration. The
 * second is the studio's arithmetic (rate x duration / density) on the
 * engine's release rate and is labelled so.
 */
export const spillVolume = (pool, liquid, liquidResult) => {
  if (pool.spillSource !== 'liquid-release') {
    return { volumeM3: toNumber(pool.spillVolumeM3), from: 'typed' };
  }
  if (!ok(liquidResult)) return upstreamMissing('spillVolumeM3', 'The liquid release');
  const t = toNumber(pool.releaseDurationS);
  if (!(t > 0)) return { error: 'releaseDurationS: must be a duration above 0 s', field: 'releaseDurationS' };
  const rho = toNumber(liquid.liquidDensityKgM3);
  return { volumeM3: (liquidResult.massRateKgS * t) / rho, from: 'liquid-release', massKg: liquidResult.massRateKgS * t };
};

export const poolEngineInput = (pool, volumeM3) => (pool.containment === 'thickness'
  ? { spillVolumeM3: volumeM3, poolThicknessM: toNumber(pool.poolThicknessM) }
  : { spillVolumeM3: volumeM3, bundAreaM2: toNumber(pool.bundAreaM2), bundWallHeightM: toNumber(pool.bundWallHeightM) });

export const evaluateSource = (source) => {
  const liquid = liquidOrificeDischarge(liquidEngineInput(source.liquid));
  const gas = gasOrificeDischarge(gasEngineInput(source.gas));
  const volume = spillVolume(source.pool, source.liquid, liquid);
  const pool = volume.error ? volume : poolFromSpill(poolEngineInput(source.pool, volume.volumeM3));
  const ev = source.evaporation;
  const evaporation = ok(pool)
    ? poolEvaporationMackayMatsugu({
      poolDiameterM: pool.equivalentDiameterM,
      windSpeed10mMS: toNumber(ev.windSpeed10mMS),
      vapourPressurePa: kpaToPa(ev.vapourPressureKPa),
      molarMassKgMol: gToKgPerMol(ev.molarMassGMol),
      liquidTemperatureK: celsiusToK(ev.liquidTemperatureC),
      schmidtNumber: toNumber(ev.schmidtNumber),
      ambientPressurePa: barToPa(ev.ambientPressureBar),
    })
    : upstreamMissing('poolDiameterM', 'The pool');
  return { liquid, gas, volume, pool, evaporation };
};

// --------------------------------------------------------------- dispersion

export const plumeRate = (disp, source) => {
  if (disp.rateSource === 'evaporation') {
    return ok(source.evaporation)
      ? { massRateKgS: source.evaporation.evaporationRateKgS, from: 'evaporation' }
      : upstreamMissing('massRateKgS', 'The pool evaporation');
  }
  if (disp.rateSource === 'gas-release') {
    return ok(source.gas)
      ? { massRateKgS: source.gas.massRateKgS, from: 'gas-release' }
      : upstreamMissing('massRateKgS', 'The gas release');
  }
  return { massRateKgS: toNumber(disp.massRateKgS), from: 'typed' };
};

const plumeCommon = (disp, massRateKgS) => {
  const common = {
    massRateKgS,
    windSpeedMS: toNumber(disp.windSpeedMS),
    receptorHeightM: toNumber(disp.receptorHeightM),
    releaseHeightM: toNumber(disp.releaseHeightM),
    molarMassGMol: toNumber(disp.molarMassGMol),
    temperatureK: celsiusToK(disp.temperatureC),
    pressurePa: barToPa(disp.pressureBar),
  };
  if (disp.sigmaMode === 'user') {
    common.sigmaYM = toNumber(disp.sigmaYM);
    common.sigmaZM = toNumber(disp.sigmaZM);
  } else {
    common.stabilityClass = disp.stabilityClass;
  }
  return common;
};

/** The target concentration in mg/m3, converted by the engine when typed in ppm. */
export const targetMgM3 = (disp) => {
  const v = toNumber(disp.targetConcentration);
  if (disp.targetUnit === 'mg/m3') return { concentrationMgM3: v };
  const r = ppmToMgM3({
    concentrationPpm: v,
    molarMassGMol: toNumber(disp.molarMassGMol),
    temperatureK: celsiusToK(disp.temperatureC),
    pressurePa: barToPa(disp.pressureBar),
  });
  return r.error ? r : { concentrationMgM3: r.concentrationMgM3 };
};

export const evaluateDispersion = (disp, source) => {
  const rate = plumeRate(disp, source);
  if (rate.error) {
    return { rate, centreline: rate, receptor: rate, distance: rate, series: null };
  }
  const common = plumeCommon(disp, rate.massRateKgS);
  const x = toNumber(disp.downwindDistanceM);
  const centreline = gaussianPlume({ ...common, downwindDistanceM: x, crosswindDistanceM: 0 });
  const receptor = gaussianPlume({ ...common, downwindDistanceM: x, crosswindDistanceM: toNumber(disp.crosswindDistanceM) });

  let distance;
  if (disp.sigmaMode === 'user') {
    distance = {
      unavailable: true,
      message: 'A distance to a concentration needs sigmas that grow with distance. With sigmas you give, they are fixed at one distance, so choose a stability class for this search.',
    };
  } else {
    const t = targetMgM3(disp);
    distance = t.error ? t : plumeDistanceToConcentration({
      massRateKgS: rate.massRateKgS,
      windSpeedMS: common.windSpeedMS,
      stabilityClass: disp.stabilityClass,
      targetConcentrationMgM3: t.concentrationMgM3,
      releaseHeightM: common.releaseHeightM,
      receptorHeightM: common.receptorHeightM,
    });
    if (ok(distance)) distance = { ...distance, targetConcentrationMgM3: t.concentrationMgM3 };
  }

  // Concentration against distance on the centreline, Briggs class only
  // (explicit sigmas belong to one distance and do not make a curve).
  let series = null;
  if (disp.sigmaMode !== 'user' && ok(centreline)) {
    series = logGrid(10, 20000, 70).map((d) => {
      const r = gaussianPlume({ ...common, downwindDistanceM: d, crosswindDistanceM: 0 });
      return {
        distanceM: d,
        concentrationMgM3: ok(r) ? r.concentrationMgM3 : null,
        concentrationPpm: ok(r) && Number.isFinite(r.concentrationPpm) ? r.concentrationPpm : null,
      };
    });
  }
  return { rate, centreline, receptor, distance, series };
};

// --------------------------------------------------------------- fire

export const poolDiameterFor = (fire, source) => {
  if (fire.diameterSource === 'pool') {
    return ok(source.pool)
      ? { poolDiameterM: source.pool.equivalentDiameterM, from: 'pool' }
      : upstreamMissing('poolDiameterM', 'The pool from spill');
  }
  return { poolDiameterM: toNumber(fire.poolDiameterM), from: 'typed' };
};

export const burningEngineInput = (fire, poolDiameterM) => {
  if (fire.burningMethod === 'burgess') {
    return {
      method: 'burgess',
      heatOfCombustionJKg: mjToJ(fire.heatOfCombustionMJKg),
      heatOfVaporisationJKg: mjToJ(fire.heatOfVaporisationMJKg),
      liquidHeatCapacityJKgK: toNumber(fire.liquidHeatCapacityJKgK),
      boilingPointK: celsiusToK(fire.boilingPointC),
      ambientTemperatureK: celsiusToK(fire.ambientTemperatureC),
    };
  }
  if (fire.customBurning) {
    const kb = String(fire.kBetaPerM ?? '').trim().toLowerCase();
    return {
      method: 'babrauskas',
      massBurningFluxInfKgM2S: toNumber(fire.massBurningFluxInfKgM2S),
      // "none" is the engine's null: a burning rate independent of diameter.
      kBetaPerM: kb === 'none' ? null : toNumber(fire.kBetaPerM),
      poolDiameterM,
    };
  }
  return { method: 'babrauskas', fuel: fire.fuel, poolDiameterM };
};

export const sepEngineInput = (fire) => {
  const sep = { method: fire.sepMethod };
  if (fire.sepMethod !== 'mudan-diameter') sep.radiativeFraction = toNumber(fire.radiativeFraction);
  if (fire.sepMethod === 'radiative-fraction-soot') {
    sep.sootFraction = toNumber(fire.sootFraction);
    const s = kwToW(fire.sootEmissivePowerKWM2);
    if (s !== undefined) sep.sootEmissivePowerWM2 = s;
  }
  return sep;
};

/** Everything poolFireSolidFlame takes except the distance and the transmissivity. */
export const solidFlameBase = (fire, poolDiameterM, burningFluxKgM2S) => ({
  poolDiameterM,
  burningFluxKgM2S,
  heatOfCombustionJKg: mjToJ(fire.heatOfCombustionMJKg),
  flameLengthMethod: fire.flameLengthMethod,
  airDensityKgM3: toNumber(fire.airDensityKgM3),
  windSpeed10mMS: toNumber(fire.windSpeed10mMS),
  airKinematicViscosityM2S: toNumber(fire.airKinematicViscosityM2S),
  sep: sepEngineInput(fire),
});

const transmissivityArgs = (fire) => (fire.transmissivityMode === 'bagster'
  ? { waterVapourPartialPressurePa: toNumber(fire.waterVapourPartialPressurePa) }
  : { transmissivity: toNumber(fire.transmissivity) });

export const evaluateFire = (fire, source) => {
  const diameter = poolDiameterFor(fire, source);
  if (diameter.error) {
    return { diameter, burning: diameter, flame: diameter, bagster: null, series: null, distance: diameter };
  }
  const burning = poolBurningRate(burningEngineInput(fire, diameter.poolDiameterM));
  if (burning.error) {
    return { diameter, burning, flame: burning, bagster: null, series: null, distance: burning };
  }
  const base = solidFlameBase(fire, diameter.poolDiameterM, burning.burningFluxKgM2S);
  const x = toNumber(fire.distanceFromCentreM);
  const flame = poolFireSolidFlame({ ...base, distanceFromCentreM: x, ...transmissivityArgs(fire) });
  const bagster = fire.transmissivityMode === 'bagster'
    ? atmosphericTransmissivityBagster({
      waterVapourPartialPressurePa: toNumber(fire.waterVapourPartialPressurePa),
      pathLengthM: Number.isFinite(x) ? x - diameter.poolDiameterM / 2 : x,
    })
    : null;

  // Heat flux against distance from the pool centre. The nearest point is
  // just outside the flame base, or just past the overhang of a tilted flame
  // (the engine refuses a target under the flame). With Bagster, points
  // outside 1e4 < pw x < 1e5 N/m are refused by the engine and left as gaps.
  let series = null;
  if (ok(flame)) {
    const R = diameter.poolDiameterM / 2;
    const reach = R + flame.flameLengthM * Math.max(0, Math.sin((flame.tiltDeg * Math.PI) / 180));
    const hi = Math.max(8 * reach, 2 * (Number.isFinite(x) ? x : 0), reach + 50);
    let refused = 0;
    const points = linGrid(reach * 1.001, hi, 80).map((d) => {
      const r = poolFireSolidFlame({ ...base, distanceFromCentreM: d, ...transmissivityArgs(fire) });
      if (!ok(r)) refused += 1;
      return { distanceM: d, heatFluxKWM2: ok(r) ? r.heatFluxWM2 / UNIT.W_PER_KW : null };
    });
    series = { points, refused, reachM: reach };
  }

  // Distance to a heat flux: the engine requires a FIXED transmissivity (a
  // root search would walk out of Bagster's band).
  const tauForSearch = fire.transmissivityMode === 'bagster'
    ? toNumber(fire.searchTransmissivity)
    : toNumber(fire.transmissivity);
  const distance = solidFlameDistanceForHeatFlux({
    ...base,
    transmissivity: tauForSearch,
    targetHeatFluxWM2: kwToW(fire.targetHeatFluxKWM2),
  });
  return { diameter, burning, flame, bagster, series, distance, tauForSearch };
};

// --------------------------------------------------------------- explosion

export const evaluateExplosion = (exp) => {
  const tnt = exp.chargeMode === 'tnt'
    ? (() => {
      const m = toNumber(exp.tntMassKg);
      return m > 0 ? { tntMassKg: m, given: true } : { error: 'tntMassKg: must be a TNT mass above 0 kg', field: 'tntMassKg' };
    })()
    : tntEquivalentMass({
      fuelMassKg: toNumber(exp.fuelMassKg),
      heatOfCombustionJKg: mjToJ(exp.heatOfCombustionMJKg),
      yieldFactor: toNumber(exp.yieldFactor),
      tntBlastEnergyJKg: mjToJ(exp.tntBlastEnergyMJKg),
    });
  if (tnt.error) return { tnt, scaled: tnt, overpressure: tnt, series: null, distance: tnt };
  const ambientPressurePa = barToPa(exp.ambientPressureBar);
  const distanceM = toNumber(exp.distanceM);
  const scaledD = scaledDistance({ distanceM, tntMassKg: tnt.tntMassKg });
  const overpressure = kinneyGrahamOverpressure({ distanceM, tntMassKg: tnt.tntMassKg, ambientPressurePa });
  const w13 = Math.cbrt(tnt.tntMassKg);
  const series = logGrid(KINNEY_GRAHAM_Z_RANGE.min, KINNEY_GRAHAM_Z_RANGE.max, 70).map((z) => {
    const r = kinneyGrahamOverpressure({ scaledDistanceMKg13: z, ambientPressurePa });
    return { distanceM: z * w13, overpressureKPa: ok(r) ? r.overpressurePa / UNIT.PA_PER_KPA : null };
  });
  const distance = distanceForOverpressure({
    tntMassKg: tnt.tntMassKg,
    overpressurePa: kpaToPa(exp.targetOverpressureKPa),
    ambientPressurePa,
  });
  return { tnt, scaled: scaledD, overpressure, series, distance };
};

// --------------------------------------------------------------- harm

export const evaluateHarm = (harm, { fire, dispersion, explosion, disp }) => {
  // Thermal
  let flux;
  if (harm.thermal.link === 'fire') {
    flux = ok(fire?.flame) ? { heatFluxWM2: fire.flame.heatFluxWM2, from: 'fire' } : upstreamMissing('heatFluxWM2', 'The Fire tab');
  } else {
    flux = { heatFluxWM2: kwToW(harm.thermal.heatFluxKWM2), from: 'typed' };
  }
  const thermal = flux.error ? flux : thermalProbit({
    coefficients: harm.thermal.preset,
    heatFluxWM2: flux.heatFluxWM2,
    exposureTimeS: toNumber(harm.thermal.exposureTimeS),
  });

  // Toxic
  const t = harm.toxic;
  let conc;
  if (t.link === 'dispersion-receptor' || t.link === 'dispersion-centreline') {
    const r = t.link === 'dispersion-receptor' ? dispersion?.receptor : dispersion?.centreline;
    conc = ok(r)
      ? {
        concentrationMgM3: r.concentrationMgM3,
        molarMassGMol: toNumber(disp?.molarMassGMol),
        temperatureK: celsiusToK(disp?.temperatureC),
        pressurePa: barToPa(disp?.pressureBar),
        from: t.link,
      }
      : upstreamMissing('concentrationMgM3', 'The Dispersion tab');
  } else {
    const v = toNumber(t.concentration);
    conc = {
      ...(t.unit === 'mg/m3' ? { concentrationMgM3: v } : { concentrationPpm: v }),
      molarMassGMol: toNumber(t.molarMassGMol),
      from: 'typed',
    };
  }
  let toxic;
  if (conc.error) toxic = conc;
  else {
    const { from, ...args } = conc;
    // An exact zero at the receptor is outside the probit (ln 0); say so
    // plainly rather than hand the engine a zero it will refuse by field.
    if (args.concentrationMgM3 === 0) {
      toxic = { error: 'concentrationMgM3: the concentration carried over is 0 mg/m3, so there is no dose and no probit', field: 'concentrationMgM3' };
    } else {
      toxic = toxicProbit({ coefficients: t.preset, exposureMinutes: toNumber(t.exposureMinutes), ...args });
    }
  }

  // Overpressure
  let op;
  if (harm.overpressure.link === 'explosion') {
    op = ok(explosion?.overpressure) ? { overpressurePa: explosion.overpressure.overpressurePa, from: 'explosion' } : upstreamMissing('overpressurePa', 'The Explosion tab');
  } else {
    op = { overpressurePa: kpaToPa(harm.overpressure.overpressureKPa), from: 'typed' };
  }
  const overpressure = op.error ? op : overpressureProbit({ coefficients: harm.overpressure.preset, overpressurePa: op.overpressurePa });

  return { flux, thermal, conc, toxic, op, overpressure };
};

// --------------------------------------------------------------- study

export const evaluateStudy = (study) => {
  const source = evaluateSource(study.source);
  const dispersion = evaluateDispersion(study.dispersion, source);
  const fire = evaluateFire(study.fire, source);
  const explosion = evaluateExplosion(study.explosion);
  const harm = evaluateHarm(study.harm, {
    fire, dispersion, explosion, disp: study.dispersion,
  });
  return { source, dispersion, fire, explosion, harm };
};

/** ppm for a mg/m3 result, by the engine's conversion at the study's T and P. */
export const toPpm = (mgM3, disp) => {
  const r = mgM3ToPpm({
    concentrationMgM3: mgM3,
    molarMassGMol: toNumber(disp.molarMassGMol),
    temperatureK: celsiusToK(disp.temperatureC),
    pressurePa: barToPa(disp.pressureBar),
  });
  return ok(r) ? r.concentrationPpm : null;
};

// --------------------------------------------------------------- words

export const DISTANCE_STATE_TEXT = Object.freeze({
  REACHED: 'The concentration falls to the target at the distance shown.',
  NOT_REACHED: 'The concentration never reaches the target: the highest centreline value is below it.',
  BEYOND_SEARCH_RANGE: 'The concentration is still above the target at the end of the search range.',
});

export const HEAT_DISTANCE_STATE_TEXT = Object.freeze({
  REACHED: 'The heat flux falls to the target at the distance shown.',
  NOT_REACHED: 'The heat flux never reaches the target: even just outside the flame it is lower.',
  BEYOND_SEARCH_RANGE: 'The heat flux is still above the target at the end of the search range (10 km).',
});

/** What this studio does not model, in the words the scope notice uses. */
export const NOT_MODELLED = Object.freeze([
  'two-phase (flashing) discharge',
  'the instantaneous puff',
  'urban dispersion coefficients',
  'jet fires',
  'the TNO multi-energy method',
  'Kingery-Bulmash blast curves',
  'unconfined pool spreading (a pool is a bund or a stated thickness)',
  'dense gas dispersion',
]);

export const formatSci = (x, digits = 3) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'n/a';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 0.01 && abs < 1e5) return String(Number(x.toPrecision(digits)));
  return x.toExponential(digits - 1).replace('e+', 'e');
};

export const formatPercent = (p) => {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 'n/a';
  if (p === 0) return '0 %';
  if (p < 1e-4) return `${formatSci(p * 100, 2)} %`;
  return `${Number((p * 100).toPrecision(3))} %`;
};
