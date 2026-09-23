// Process safety domain (Wave D8): the scenario basis and every number the
// three episodes quote, computed by the engines the apps call.
//
// The release source is BINDING (../../d8spine.mjs FACILITY_DESIGN): the
// Ekene Alpha production separator at 150 psig and 140 degF, handling
// 1000 bopd, 1500 bwpd and 0.45 MMscfd of the field's 32 API oil and 0.75
// gravity gas (../../spine.mjs). Everything else here is DESIGN for this
// synthetic teaching case; ../processsafety.mjs writes each value with its
// source or its reason to the kit as the scenario basis.
//
// Nothing here restates a formula the engines own. The only arithmetic of
// our own is unit conversion, the spill and cloud masses (rate x time), the
// burn-out time and the expected deaths N (people x probability of death),
// each labelled where it is written.

import { LOCKED } from '../../spine.mjs';
import { FACILITY_DESIGN } from '../../d8spine.mjs';
import {
  PA_PER_PSI, ATM_PA, gasOrificeDischarge, liquidOrificeDischarge, poolFromSpill, ppmToMgM3,
  plumeDistanceToConcentration, gaussianPlume, poolBurningRate, poolFireSolidFlame,
  solidFlameDistanceForHeatFlux, atmosphericTransmissivityBagster, tntEquivalentMass,
  kinneyGrahamOverpressure, distanceForOverpressure, thermalProbit, overpressureProbit,
} from '../../../../packages/engines/engines/hse/consequence.js';
import {
  flammableReleaseEventTree, pbDirectIgnitionProbability, pbFatalityFractions,
  locationIndividualRisk, individualRiskPerAnnum, alarpBand, potentialLossOfLife,
  fatalAccidentRateFromPll, fnCurve, fnCriterionComparison, costBenefit,
} from '../../../../packages/engines/engines/hse/qra.js';
import {
  lopaScenario, pfdAvgSif, pfdAvgSubsystem, HOURS_PER_YEAR,
} from '../../../../packages/engines/engines/hse/lopa.js';

// ------------------------------------------------------------ constants

const PSI_ATM = ATM_PA / PA_PER_PSI;            // 14.6959... psi
const AIR_MOLAR_MASS = 28.9647;                // g/mol, standard dry air
const WATER_DENSITY_60F = 999.016;             // kg/m3, the API gravity reference
const PA_PER_BAR = 1e5;                        // the studios' own factor

/** Round to n significant figures and return the typed string. */
export const sig = (x, n = 4) => String(Number(Number(x).toPrecision(n)));

const fail = (label, r) => {
  if (!r || r.error) throw new Error(`ASSERT process safety: ${label} refused by the engine: ${r?.error}`);
  return r;
};

// ------------------------------------------------------------ the design

const sepPsia = FACILITY_DESIGN.separator_pressure_psig + PSI_ATM;
const sepBarA = (sepPsia * PA_PER_PSI) / PA_PER_BAR;
const sepC = ((FACILITY_DESIGN.separator_temperature_f - 32) * 5) / 9;
const gasMolarMass = LOCKED.gas_sg * AIR_MOLAR_MASS;
const oilDensity = (141.5 / (131.5 + LOCKED.api)) * WATER_DENSITY_60F;

/**
 * The scenario basis. Strings are what a presenter types (the apps take
 * text); numbers are layout and manning used in our own arithmetic.
 */
export const D = {
  separator: {
    pressurePsig: FACILITY_DESIGN.separator_pressure_psig,
    pressureBarA: sig(sepBarA, 6),
    temperatureF: FACILITY_DESIGN.separator_temperature_f,
    temperatureC: sig(sepC, 4),
    oilBopd: FACILITY_DESIGN.oil_bopd,
    waterBwpd: FACILITY_DESIGN.water_bwpd,
    gasMmscfd: FACILITY_DESIGN.gas_mmscfd,
  },
  ambientBarA: sig(ATM_PA / PA_PER_BAR, 6),
  gas: { molarMassGMol: sig(gasMolarMass, 4), gamma: '1.27', lflPpm: '44000', heatOfCombustionMJKg: '47' },
  oil: { densityKgM3: sig(oilDensity, 4), headM: '1.5' },
  hole: { diameterMm: '25', cd: '0.62' },
  isolationS: '180',
  dripTray: { areaM2: '72', coamingM: '0.15' },
  weather: { windMS: '5', stability: 'D', airC: '27', rh: 0.8, pSatPa: 3567, airDensity: '1.176', airNu: '1.57e-5' },
  fire: { mInf: '0.035', kBeta: '2.8', dHcMJKg: '42.6', fs: '0.35', soot: '0.8', sootKW: '20', tau: '0.75', tauPathM: 20 },
  thresholdsKW: { escape: '12.5', personnel: '4.7', equipment: '37.5' },
  explosion: { yield: '0.1', eTntMJKg: '4.68' },
  exposureS: '20',
  fireTargetM: 15,                 // the Fire tab target: the edge of the process deck
  // where people stand, metres from the separator (release point and pool centre)
  places: [
    { id: 'l1', name: 'Process deck', distanceM: 10, people: 1.0, hours: 1095, period: 'day' },
    { id: 'l2', name: 'Control room', distanceM: 30, people: 1.5, hours: 1095, period: 'day' },
    { id: 'l3', name: 'Accommodation', distanceM: 45, people: 9.5, hours: 2190, period: 'night' },
  ],
  pob: 12,
  deckOccupiedFraction: 0.5,
  frequencies: { gasPerYr: '2e-4', oilPerYr: '1e-4' },
  ignition: { gasSubstance: 'gas-low-reactivity', gasDelayed: '0.1', oilSubstance: 'k1-liquid', oilDelayed: 0 },
  jetPd: { l1: '0.5', l2: '0', l3: '0' },
  criteria: { irpa: 'r2p2-workers', fn: 'r2p2-para-136', tmelPerYr: '1e-5' },
  cba: { measure: 'Second gas detector (1oo2) tripping ignition sources on the separator module', delayedAfter: '0.05', capitalUsd: '150000', lifeYears: '20', df: '3', vpfUsd: '2000000' },
  lopa: {
    iefPerYr: '0.1',
    presence: '0.5',
    fatalInjury: '0.5',
    psvPfd: '0.01',
    alarmPfd: '0.1',
    sensors: { architecture: '1oo2', lDU: '5e-7', lDD: '1.5e-6', mttr: '8', mrt: '8', beta: '0.1', betaD: '0.05', t1: '8760' },
    logic: { architecture: '1oo1', lDU: '1e-8', lDD: '1e-6', mttr: '8', mrt: '8', t1: '8760' },
    final: { architecture: '1oo1', lDU: '2.5e-6', mrt: '24', t1: '8760' },
    stretchedT1: '70080',
  },
};

const num = Number;

// ------------------------------------------------------------ 34 consequence

/** The consequence chain, through the engine, with the studio's unit edge. */
export function consequence(over = {}) {
  const hole = num(over.holeMm ?? D.hole.diameterMm) / 1000;
  const P = num(D.separator.pressureBarA) * PA_PER_BAR;
  const Pa = num(D.ambientBarA) * PA_PER_BAR;
  const gas = fail('gas release', gasOrificeDischarge({
    dischargeCoefficient: num(D.hole.cd), holeDiameterM: hole, upstreamPressurePa: P,
    upstreamTemperatureK: num(D.separator.temperatureC) + 273.15,
    molarMassKgMol: num(D.gas.molarMassGMol) / 1000, heatCapacityRatio: num(D.gas.gamma), ambientPressurePa: Pa,
  }));
  const rho = num(D.oil.densityKgM3);
  const liquid = fail('liquid release', liquidOrificeDischarge({
    dischargeCoefficient: num(D.hole.cd), holeDiameterM: hole, liquidDensityKgM3: rho,
    liquidHeadM: num(D.oil.headM), pressureAboveLiquidPa: P, ambientPressurePa: Pa,
  }));
  // the studio's own arithmetic: rate x duration / density
  const spillM3 = (liquid.massRateKgS * num(D.isolationS)) / rho;
  const pool = fail('pool', poolFromSpill({
    spillVolumeM3: spillM3, bundAreaM2: num(D.dripTray.areaM2), bundWallHeightM: num(D.dripTray.coamingM),
  }));

  const airK = num(D.weather.airC) + 273.15;
  const wind = num(over.windMS ?? D.weather.windMS);
  const lflMg = fail('LFL conversion', ppmToMgM3({
    concentrationPpm: num(D.gas.lflPpm), molarMassGMol: num(D.gas.molarMassGMol), temperatureK: airK, pressurePa: Pa,
  })).concentrationMgM3;
  const lfl = fail('distance to LFL', plumeDistanceToConcentration({
    massRateKgS: gas.massRateKgS, windSpeedMS: wind, stabilityClass: D.weather.stability,
    targetConcentrationMgM3: lflMg, releaseHeightM: 0, receptorHeightM: 0,
  }));
  const atDeck = fail('plume at the deck', gaussianPlume({
    massRateKgS: gas.massRateKgS, windSpeedMS: wind, downwindDistanceM: D.places[0].distanceM,
    stabilityClass: D.weather.stability, molarMassGMol: num(D.gas.molarMassGMol), temperatureK: airK, pressurePa: Pa,
  }));

  const burning = fail('burning rate', poolBurningRate({
    method: 'babrauskas', massBurningFluxInfKgM2S: num(D.fire.mInf), kBetaPerM: num(D.fire.kBeta),
    poolDiameterM: pool.equivalentDiameterM,
  }));
  const pw = D.weather.rh * D.weather.pSatPa;
  const bagster = fail('Bagster', atmosphericTransmissivityBagster({ waterVapourPartialPressurePa: pw, pathLengthM: D.fire.tauPathM }));
  const flameBase = {
    poolDiameterM: pool.equivalentDiameterM,
    burningFluxKgM2S: burning.burningFluxKgM2S,
    heatOfCombustionJKg: num(D.fire.dHcMJKg) * 1e6,
    flameLengthMethod: 'thomas-wind',
    airDensityKgM3: num(D.weather.airDensity),
    windSpeed10mMS: wind,
    airKinematicViscosityM2S: num(D.weather.airNu),
    sep: { method: 'radiative-fraction-soot', radiativeFraction: num(D.fire.fs), sootFraction: num(D.fire.soot), sootEmissivePowerWM2: num(D.fire.sootKW) * 1000 },
    transmissivity: num(D.fire.tau),
  };
  const fluxAt = (x) => fail(`heat flux at ${x} m`, poolFireSolidFlame({ ...flameBase, distanceFromCentreM: x }));
  // A place the tilted flame reaches over is in the flame envelope: the
  // engine refuses it by the tilt (a target under the flame), and the QRA
  // takes it as in the flame (Purple Book Figure 5.4).
  const flame = D.places.map((p) => {
    const r = poolFireSolidFlame({ ...flameBase, distanceFromCentreM: p.distanceM });
    if (r.error && r.field === 'tiltDeg') return { ...p, underFlame: true, refusal: r };
    return { ...p, underFlame: false, fire: fail(`heat flux at ${p.distanceM} m`, r) };
  });
  const target = fluxAt(D.fireTargetM);
  const distTo = (kw) => fail(`distance to ${kw} kW/m2`, solidFlameDistanceForHeatFlux({ ...flameBase, targetHeatFluxWM2: num(kw) * 1000 }));
  const toEscape = distTo(D.thresholdsKW.escape);
  const toPersonnel = distTo(D.thresholdsKW.personnel);
  const toEquipment = distTo(D.thresholdsKW.equipment);
  // burn-out time, our arithmetic: spill mass / (burning flux x pool area)
  const burnOutS = (spillM3 * rho) / (burning.burningFluxKgM2S * pool.areaM2);

  // the flammable mass in the plume, our arithmetic: Q x (distance to LFL / wind)
  const cloudKgExact = gas.massRateKgS * (lfl.farDistanceM / wind);
  const cloudKg = sig(cloudKgExact, 3);
  const tnt = fail('TNT', tntEquivalentMass({
    fuelMassKg: num(cloudKg), heatOfCombustionJKg: num(D.gas.heatOfCombustionMJKg) * 1e6,
    yieldFactor: num(D.explosion.yield), tntBlastEnergyJKg: num(D.explosion.eTntMJKg) * 1e6,
  }));
  const blast = D.places.map((p) => ({
    ...p,
    op: fail(`overpressure at ${p.distanceM} m`, kinneyGrahamOverpressure({ distanceM: p.distanceM, tntMassKg: tnt.tntMassKg, ambientPressurePa: Pa })),
  }));
  const to10kPa = fail('distance to 10 kPa', distanceForOverpressure({ tntMassKg: tnt.tntMassKg, overpressurePa: 10000, ambientPressurePa: Pa }));

  const thermal = fail('thermal probit', thermalProbit({ coefficients: 'purple-book', heatFluxWM2: target.heatFluxWM2, exposureTimeS: num(D.exposureS) }));
  const blastHarm = fail('blast probit', overpressureProbit({ coefficients: 'hsc', overpressurePa: blast[0].op.overpressurePa }));

  // physical consistency: the hole outflows exceed the throughputs, so the
  // releases are fed by the separator's inventory (a statement, asserted)
  const gasThroughputKgS = (num(D.separator.gasMmscfd) * 1e6 / 379.49) * 0.45359237 * num(D.gas.molarMassGMol) / 86400;
  const oilThroughputKgS = (num(D.separator.oilBopd) * 0.158987294928 * rho) / 86400;

  return {
    gas, liquid, spillM3, pool, lflMg, lfl, atDeck, burning, bagster, pw, flame, target, toEscape, toPersonnel,
    toEquipment, burnOutS, cloudKgExact, cloudKg, tnt, blast, to10kPa, thermal, blastHarm,
    gasThroughputKgS, oilThroughputKgS, flameBase,
  };
}

// ------------------------------------------------------------ 36 QRA

/** The QRA register, through the engine, the way the studio maps it. */
export function qra(cons, over = {}) {
  const delayed = num(over.gasDelayed ?? D.ignition.gasDelayed);
  const rateTyped = sig(cons.gas.massRateKgS, 4);
  const ign = fail('PB ignition (gas)', pbDirectIgnitionProbability({ releaseType: 'continuous', massRateKgS: num(rateTyped), substance: D.ignition.gasSubstance }));
  const tree = fail('gas event tree', flammableReleaseEventTree({
    initiatingFrequencyPerYr: num(D.frequencies.gasPerYr), immediateIgnitionProbability: ign.probability,
    delayedIgnitionProbability: delayed, vapourCloudSplit: 'purple-book', immediateOutcome: 'jet or pool fire',
  }));
  const oilIgn = fail('PB ignition (oil)', pbDirectIgnitionProbability({ releaseType: 'continuous', massRateKgS: cons.liquid.massRateKgS, substance: D.ignition.oilSubstance }));
  const oilTree = fail('oil event tree', flammableReleaseEventTree({
    initiatingFrequencyPerYr: num(D.frequencies.oilPerYr), immediateIgnitionProbability: oilIgn.probability,
    delayedIgnitionProbability: D.ignition.oilDelayed, vapourCloudSplit: 'purple-book', immediateOutcome: 'jet or pool fire',
  }));
  const poolFireFreq = sig(oilTree.outcomeTotalsPerYr['jet or pool fire'], 4);

  // the typed doses, rounded as a presenter types them
  const fluxKW = Object.fromEntries(cons.flame.map((p) => [p.id, p.underFlame ? null : sig(p.fire.heatFluxWM2 / 1000, 4)]));
  const underFlame = Object.fromEntries(cons.flame.map((p) => [p.id, p.underFlame]));
  const opKPa = Object.fromEntries(cons.blast.map((p) => [p.id, sig(p.op.overpressurePa / 1000, 4)]));
  const inside = Object.fromEntries(D.places.map((p) => [p.id, p.distanceM < cons.lfl.farDistanceM]));
  const fireDuration = sig(cons.burnOutS, 4);

  const scen = [
    { id: 's1', name: 'Gas 25 mm, jet fire', source: 'event-tree', outcome: 'jet or pool fire', effect: 'fire' },
    { id: 's2', name: 'Gas 25 mm, flash fire', source: 'event-tree', outcome: 'flash fire', effect: 'flash-fire' },
    { id: 's3', name: 'Gas 25 mm, explosion', source: 'event-tree', outcome: 'explosion', effect: 'explosion' },
    { id: 's4', name: 'Oil 25 mm, pool fire', source: 'typed', frequency: poolFireFreq, effect: 'fire', fireDurationS: fireDuration },
  ];
  const cellArgs = (s, p) => {
    if (s.id === 's1') return { typed: true, pd: D.jetPd[p.id] };
    if (s.id === 's2') return { effect: 'flash-fire', period: p.period, insideFlameEnvelope: inside[p.id] };
    if (s.id === 's3') return { effect: 'explosion', period: p.period, peakOverpressurePa: num(opKPa[p.id]) * 1000 };
    if (underFlame[p.id]) return { effect: 'fire', period: p.period, insideFlameEnvelope: true };
    return { effect: 'fire', period: p.period, insideFlameEnvelope: false, heatFluxWM2: num(fluxKW[p.id]) * 1000, fireDurationS: num(fireDuration) };
  };
  const cells = {};
  for (const s of scen) {
    cells[s.id] = {};
    for (const p of D.places) {
      const a = cellArgs(s, p);
      cells[s.id][p.id] = a.typed
        ? { probabilityOfDeath: num(a.pd), typed: true, pd: a.pd }
        : { ...fail(`Pd ${s.id} ${p.id}`, pbFatalityFractions(a)), args: a };
    }
  }
  const freq = (s) => (s.source === 'event-tree' ? tree.outcomeTotalsPerYr[s.outcome] : num(s.frequency));
  // expected deaths N: our arithmetic, people present x probability of death
  for (const s of scen) {
    s.fatalitiesExact = D.places.reduce((a, p) => a + p.people * cells[s.id][p.id].probabilityOfDeath, 0);
    s.fatalities = sig(s.fatalitiesExact, 4);
  }
  const lsir = D.places.map((p) => ({
    ...p,
    r: fail(`LSIR ${p.id}`, locationIndividualRisk({
      scenarios: scen.map((s) => ({ name: s.name, frequencyPerYr: freq(s), fatalityProbability: cells[s.id][p.id].probabilityOfDeath })),
    })),
  }));
  const irpa = fail('IRPA', individualRiskPerAnnum({
    locations: lsir.map((l) => ({ name: l.name, lsirPerYr: l.r.lsirPerYr, hoursPerYr: l.hours })),
  }));
  const band = fail('ALARP band', alarpBand({ individualRiskPerYr: irpa.irpaPerYr, thresholds: D.criteria.irpa }));
  const societal = scen.map((s) => ({ name: s.name, frequencyPerYr: freq(s), fatalities: num(s.fatalities) }));
  const pll = fail('PLL', potentialLossOfLife({ scenarios: societal }));
  const exposedHours = D.pob * HOURS_PER_YEAR;
  const far = fail('FAR', fatalAccidentRateFromPll({ pllPerYr: pll.pllPerYr, exposedHoursPerYr: exposedHours }));
  const fn = fail('F-N', fnCurve({ scenarios: societal }));
  const fnCmp = fail('F-N criterion', fnCriterionComparison({ scenarios: societal, criterion: D.criteria.fn }));
  return {
    rateTyped, ign, tree, oilIgn, oilTree, poolFireFreq, fluxKW, underFlame, opKPa, inside, fireDuration,
    scen, cells, lsir, irpa, band, pll, exposedHours, far, fn, fnCmp, freq,
  };
}

/** The cost-benefit of the measure: the register PLL less the PLL after it. */
export function cba(q, cons) {
  const after = qra(cons, { gasDelayed: D.cba.delayedAfter });
  const pllAfter = sig(after.pll.pllPerYr, 4);
  const delta = q.pll.pllPerYr - num(pllAfter);
  const r = fail('cost-benefit', costBenefit({
    deltaPllPerYr: delta, vpf: num(D.cba.vpfUsd), otherHarms: [], lifetimeYears: num(D.cba.lifeYears),
    capitalCost: num(D.cba.capitalUsd), disproportionFactor: num(D.cba.df),
  }));
  return { after, pllAfter, delta, r };
}

// ------------------------------------------------------------ 35 LOPA

const sub = (name, s, t1 = s.t1) => ({
  name,
  architecture: s.architecture,
  lambdaDuPerHour: num(s.lDU),
  ...(s.lDD ? { lambdaDdPerHour: num(s.lDD) } : {}),
  ...(s.mttr ? { mttrHours: num(s.mttr) } : {}),
  mrtHours: num(s.mrt),
  ...(s.beta ? { beta: num(s.beta) } : {}),
  ...(s.betaD ? { betaD: num(s.betaD) } : {}),
  proofTestIntervalHours: num(t1),
  proofTestCoverage: 1,
});

export function lopa(over = {}) {
  const L = D.lopa;
  const subs = [
    sub('Separator pressure transmitters', L.sensors),
    sub('Safety PLC', L.logic),
    sub('Separator inlet shutdown valve', L.final, over.finalT1 ?? L.final.t1),
  ];
  const parts = subs.map((s) => fail(`subsystem ${s.name}`, pfdAvgSubsystem(s)));
  const sif = fail('SIF', pfdAvgSif(subs));
  const input = {
    initiatingEventFrequencyPerYr: num(L.iefPerYr),
    conditionalModifiers: [
      { name: 'Someone on the process deck', probability: num(L.presence) },
      { name: 'Fatal injury, given someone is there', probability: num(L.fatalInjury) },
    ],
    ipls: [
      { name: 'Separator PSV sized for a blocked gas outlet', pfd: num(L.psvPfd), independent: true, auditable: true },
      { name: 'High pressure alarm and operator response', pfd: num(L.alarmPfd), independent: over.alarmIndependent === true, auditable: true },
    ],
    tmelPerYr: num(D.criteria.tmelPerYr),
  };
  const without = fail('LOPA', lopaScenario(input));
  const withSif = fail('LOPA with SIF', lopaScenario({ ...input, sifPfdAvg: sif.pfdAvg }));
  return { parts, sif, without, withSif };
}
