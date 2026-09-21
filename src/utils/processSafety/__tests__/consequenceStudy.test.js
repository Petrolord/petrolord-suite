/**
 * Consequence Modelling Studio data shaping (PS2).
 *
 * The engine has its own gate (packages/engines/__tests__/hse.consequence.test.js,
 * 206 tests against an independent scipy oracle, second routes and the
 * published Yellow Book, Purple Book, OSD/30 and CBU values). These pin the
 * layer between the user's text and the engine: that the shim is the vendored
 * engine, that published goldens come through the studio's own import path
 * and its unit conversions unchanged, that a blank stays absent, that one
 * step's output reaches the next, and that a saved study reads back.
 */
import * as shim from '@/utils/processSafety/engine/consequence';
import * as vendored from '../../../../packages/engines/engines/hse/consequence';
import {
  ATM_BAR, UNIT, barToPa, celsiusToK, defaultStudy, evaluateDispersion, evaluateExplosion,
  evaluateFire, evaluateHarm, evaluateSource, evaluateStudy, formatPercent, formatSci, gToKgPerMol,
  kwToW, logGrid, mmToM, studyFromPayload, toNumber,
} from '@/utils/processSafety/consequenceStudy';

const G = require('../../../../packages/engines/test-data/hse/goldens/consequence_cases.json');

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

describe('the engine shim', () => {
  it('re-exports the vendored engine itself', () => {
    expect(shim.liquidOrificeDischarge).toBe(vendored.liquidOrificeDischarge);
    expect(shim.gasOrificeDischarge).toBe(vendored.gasOrificeDischarge);
    expect(shim.poolFromSpill).toBe(vendored.poolFromSpill);
    expect(shim.poolEvaporationMackayMatsugu).toBe(vendored.poolEvaporationMackayMatsugu);
    expect(shim.gaussianPlume).toBe(vendored.gaussianPlume);
    expect(shim.plumeDistanceToConcentration).toBe(vendored.plumeDistanceToConcentration);
    expect(shim.poolFireSolidFlame).toBe(vendored.poolFireSolidFlame);
    expect(shim.solidFlameDistanceForHeatFlux).toBe(vendored.solidFlameDistanceForHeatFlux);
    expect(shim.tntEquivalentMass).toBe(vendored.tntEquivalentMass);
    expect(shim.kinneyGrahamOverpressure).toBe(vendored.kinneyGrahamOverpressure);
    expect(shim.distanceForOverpressure).toBe(vendored.distanceForOverpressure);
    expect(shim.thermalProbit).toBe(vendored.thermalProbit);
    expect(shim.toxicProbit).toBe(vendored.toxicProbit);
    expect(shim.overpressureProbit).toBe(vendored.overpressureProbit);
    expect(shim.THERMAL_PROBITS).toBe(vendored.THERMAL_PROBITS);
  });

  it('exports none of the point-source radiation the Facilities engines own', () => {
    const names = Object.keys(shim);
    ['radiationIntensity', 'distanceForIntensity', 'RADIATION_LEVELS', 'flareSetbackM', 'poolFireSetbackM']
      .forEach((fn) => expect(names).not.toContain(fn));
  });
});

describe('published goldens through the studio', () => {
  it('reproduces the Yellow Book 6.6.3 benzene pool fire from the default study, printed 4,581 W/m2', () => {
    // The default study's bund (1415 m2) gives the golden's diameter through
    // poolFromSpill, and the fire tab carries the example's inputs in the
    // studio's units (MJ/kg). The golden is called by the engine gate too;
    // here it is reached through the Suite's import path and conversions.
    const y = G.fires.ybPoolFire;
    const e = evaluateStudy(defaultStudy());
    expect(e.fire.diameter.from).toBe('pool');
    expect(e.fire.diameter.poolDiameterM).toBe(y.args.poolDiameterM);
    expect(e.fire.burning.burningFluxKgM2S).toBe(y.args.burningFluxKgM2S);
    Object.entries(y.expected).forEach(([k, v]) => expect(rel(e.fire.flame[k], v)).toBeLessThan(1e-12));
    expect(rel(e.fire.flame.heatFluxWM2, y.printed.heatFluxWM2)).toBeLessThan(y.publishedRelTol.heatFluxWM2);
    expect(rel(e.fire.flame.tiltDeg, y.printed.tiltDeg)).toBeLessThan(y.publishedRelTol.tiltDeg);
    expect(rel(e.fire.flame.flameLengthM, y.printed.flameLengthM)).toBeLessThan(y.publishedRelTol.flameLengthM);
  });

  it('reproduces the Purple Book Appendix 6.B CO plume, printed 21.3 g/m3, with sigmas given', () => {
    const c = G.dispersion.plume.find((p) => p.id === 'pb-co-361m');
    const disp = {
      ...defaultStudy().dispersion,
      rateSource: 'typed',
      massRateKgS: String(c.args.massRateKgS),
      windSpeedMS: String(c.args.windSpeedMS),
      sigmaMode: 'user',
      sigmaYM: String(c.args.sigmaYM),
      sigmaZM: String(c.args.sigmaZM),
      downwindDistanceM: String(c.args.downwindDistanceM),
      receptorHeightM: String(c.args.receptorHeightM),
      releaseHeightM: String(c.args.releaseHeightM),
      molarMassGMol: '28.01',
    };
    const e = evaluateDispersion(disp, {});
    expect(rel(e.centreline.concentrationKgM3, c.expected.concentrationKgM3)).toBeLessThan(1e-12);
    expect(Number((e.centreline.concentrationMgM3 / 1000).toFixed(1))).toBe(c.printed.concentrationGM3);
    expect(e.distance.unavailable).toBe(true);
    expect(e.series).toBeNull();
  });

  it('reproduces the Purple Book CO probit (Pr 5.97, P 0.835) through the Harm tab', () => {
    const c = G.probits.toxic.find((p) => p.id === 'pb-co-appendix-6b');
    const harm = {
      ...defaultStudy().harm,
      toxic: {
        link: 'typed', preset: 'pb-carbon-monoxide', concentration: String(c.args.concentrationMgM3), unit: 'mg/m3',
        exposureMinutes: String(c.args.exposureMinutes), molarMassGMol: '',
      },
    };
    const h = evaluateHarm(harm, {});
    expect(h.toxic.probit).toBeCloseTo(c.expected.probit, 12);
    expect(Number(h.toxic.probit.toFixed(2))).toBe(c.printed.probit);
    expect(Math.abs(h.toxic.probability - c.printed.probability)).toBeLessThan(c.printedProbabilityAbsTol);
  });

  it('reproduces the Yellow Book hydrogen release (printed 15.31 kg/s) from the default gas inputs in bar and C', () => {
    const c = G.sourceTerms.gas.find((p) => p.id === 'yb-hydrogen-t0');
    const e = evaluateSource(defaultStudy().source);
    expect(rel(e.gas.massRateKgS, c.expected.massRateKgS)).toBeLessThan(1e-12);
    expect(Number(e.gas.massRateKgS.toFixed(2))).toBe(c.printed);
    expect(e.gas.regime).toBe('CHOKED');
  });
});

describe('text to engine input', () => {
  it('keeps a blank absent and never turns it into zero', () => {
    expect(toNumber('')).toBeUndefined();
    expect(toNumber('  ')).toBeUndefined();
    expect(Number.isNaN(toNumber('5x'))).toBe(true);
    expect(barToPa('')).toBeUndefined();
    expect(celsiusToK('')).toBeUndefined();
    expect(Number.isNaN(barToPa('abc'))).toBe(true);
  });

  it('converts at the edge with the stated factors', () => {
    expect(barToPa('50')).toBe(5e6);
    expect(barToPa(String(ATM_BAR))).toBeCloseTo(101325, 9);
    expect(celsiusToK('15')).toBe(288.15);
    expect(kwToW('4.73')).toBeCloseTo(4730, 9);
    expect(mmToM('100')).toBeCloseTo(0.1, 15);
    expect(gToKgPerMol('2.016')).toBeCloseTo(0.002016, 15);
    expect(UNIT.J_PER_MJ).toBe(1e6);
  });

  it('a blank hole diameter is refused by the engine, which names the field', () => {
    const s = defaultStudy();
    s.source.liquid.holeDiameterMm = '';
    const e = evaluateSource(s.source);
    expect(e.liquid.field).toBe('holeDiameterM');
  });

  it('a blank Schmidt number takes the engine default 0.8', () => {
    const s = defaultStudy();
    const a = evaluateSource(s.source).evaporation.evaporationRateKgS;
    s.source.evaporation.schmidtNumber = '';
    expect(evaluateSource(s.source).evaporation.evaporationRateKgS).toBe(a);
  });
});

describe('the source term', () => {
  it('shows SUBSONIC below the critical pressure ratio', () => {
    const s = defaultStudy();
    s.source.gas.upstreamPressureBar = '1.5';
    const g = evaluateSource(s.source).gas;
    expect(g.regime).toBe('SUBSONIC');
    expect(g.pressureRatio).toBeGreaterThan(g.criticalPressureRatio);
  });

  it('refuses a spill that overtops the bund, naming the spill volume', () => {
    const s = defaultStudy();
    s.source.pool.spillVolumeM3 = '2000';
    expect(evaluateSource(s.source).pool.field).toBe('spillVolumeM3');
  });

  it('makes a spill from the liquid release held for a duration (the studio arithmetic)', () => {
    const s = defaultStudy();
    s.source.pool.spillSource = 'liquid-release';
    s.source.pool.releaseDurationS = '600';
    const e = evaluateSource(s.source);
    expect(e.volume.volumeM3).toBeCloseTo((e.liquid.massRateKgS * 600) / 879, 12);
    expect(e.pool.areaM2).toBe(1415);
  });

  it('refuses a boiling pool', () => {
    const s = defaultStudy();
    s.source.evaporation.vapourPressureKPa = '120';
    expect(evaluateSource(s.source).evaporation.field).toBe('vapourPressurePa');
  });
});

describe('chaining between tabs', () => {
  it('carries the evaporation rate into the plume', () => {
    const e = evaluateStudy(defaultStudy());
    expect(e.dispersion.rate.from).toBe('evaporation');
    expect(e.dispersion.rate.massRateKgS).toBe(e.source.evaporation.evaporationRateKgS);
    const direct = shim.gaussianPlume({
      massRateKgS: e.source.evaporation.evaporationRateKgS, windSpeedMS: 5, downwindDistanceM: 500,
      stabilityClass: 'D', molarMassGMol: 78.11,
    });
    expect(e.dispersion.centreline.concentrationMgM3).toBe(direct.concentrationMgM3);
    expect(e.dispersion.centreline.concentrationPpm).toBe(direct.concentrationPpm);
  });

  it('says where a link has nothing to carry, when the upstream step is refused', () => {
    const s = defaultStudy();
    s.source.evaporation.windSpeed10mMS = '0';
    const e = evaluateStudy(s);
    expect(e.source.evaporation.field).toBe('windSpeed10mMS');
    expect(e.dispersion.rate.error).toMatch(/^massRateKgS: The pool evaporation has no result yet/);
  });

  it('carries the heat flux, concentration and overpressure into the probits', () => {
    const e = evaluateStudy(defaultStudy());
    expect(e.harm.flux.heatFluxWM2).toBe(e.fire.flame.heatFluxWM2);
    expect(e.harm.conc.concentrationMgM3).toBe(e.dispersion.centreline.concentrationMgM3);
    expect(e.harm.op.overpressurePa).toBe(e.explosion.overpressure.overpressurePa);
    expect(e.harm.thermal.probit).toBe(shim.thermalProbit({
      coefficients: 'eisenberg', heatFluxWM2: e.fire.flame.heatFluxWM2, exposureTimeS: 60,
    }).probit);
  });
});

describe('dispersion', () => {
  it('gives a far root for a ground release and two roots for an elevated one', () => {
    const d = { ...defaultStudy().dispersion, rateSource: 'typed', massRateKgS: '5', targetUnit: 'mg/m3', targetConcentration: '50' };
    const ground = evaluateDispersion(d, {});
    expect(ground.distance.state).toBe('REACHED');
    expect(ground.distance.nearDistanceM).toBeNull();
    const high = evaluateDispersion({ ...d, releaseHeightM: '30' }, {});
    expect(high.distance.state).toBe('REACHED');
    expect(high.distance.nearDistanceM).toBeGreaterThan(0);
    expect(high.distance.farDistanceM).toBeGreaterThan(high.distance.nearDistanceM);
  });

  it('reports NOT_REACHED and BEYOND_SEARCH_RANGE as the engine names them', () => {
    const d = { ...defaultStudy().dispersion, rateSource: 'typed', massRateKgS: '5', targetUnit: 'mg/m3' };
    expect(evaluateDispersion({ ...d, releaseHeightM: '100', targetConcentration: '1e6' }, {}).distance.state).toBe('NOT_REACHED');
    expect(evaluateDispersion({ ...d, stabilityClass: 'F', targetConcentration: '1e-6' }, {}).distance.state).toBe('BEYOND_SEARCH_RANGE');
  });

  it('converts a ppm target by the engine before the search', () => {
    const d = { ...defaultStudy().dispersion, targetUnit: 'ppm', targetConcentration: '100' };
    const e = evaluateDispersion(d, evaluateSource(defaultStudy().source));
    const mg = shim.ppmToMgM3({ concentrationPpm: 100, molarMassGMol: 78.11, temperatureK: 298.15, pressurePa: 101325 });
    expect(e.distance.targetConcentrationMgM3).toBeCloseTo(mg.concentrationMgM3, 9);
  });

  it('carries the Briggs range warning from the engine', () => {
    const d = { ...defaultStudy().dispersion, downwindDistanceM: '50' };
    const e = evaluateDispersion(d, evaluateSource(defaultStudy().source));
    expect(e.centreline.warning).toMatch(/outside 100 m to 10 km/);
  });

  it('draws the curve from engine values only', () => {
    const e = evaluateStudy(defaultStudy());
    const p = e.dispersion.series[20];
    const direct = shim.gaussianPlume({ massRateKgS: e.dispersion.rate.massRateKgS, windSpeedMS: 5, downwindDistanceM: p.distanceM, stabilityClass: 'D' });
    expect(p.concentrationMgM3).toBe(direct.concentrationMgM3);
  });
});

describe('fire', () => {
  it('refuses Bagster outside its band, naming the path length', () => {
    const f = { ...defaultStudy().fire, transmissivityMode: 'bagster', waterVapourPartialPressurePa: '10' };
    const e = evaluateFire(f, evaluateSource(defaultStudy().source));
    expect(e.flame.field).toBe('pathLengthM');
  });

  it('computes Bagster inside its band with x from the flame surface', () => {
    const f = { ...defaultStudy().fire, transmissivityMode: 'bagster', waterVapourPartialPressurePa: '1200' };
    const src = evaluateSource(defaultStudy().source);
    const e = evaluateFire(f, src);
    const x = 100 - src.pool.equivalentDiameterM / 2;
    expect(e.flame.transmissivity).toBeCloseTo(2.02 * (1200 * x) ** -0.09, 12);
    expect(e.bagster.waterVapourPathProductPaM).toBeCloseTo(1200 * x, 9);
  });

  it('refuses a target under the tilted flame', () => {
    const f = { ...defaultStudy().fire, distanceFromCentreM: '40' };
    const e = evaluateFire(f, evaluateSource(defaultStudy().source));
    expect(e.flame.field).toBe('tiltDeg');
  });

  it('finds the distance to a heat flux with a fixed transmissivity, and asks for one under Bagster', () => {
    const src = evaluateSource(defaultStudy().source);
    const e = evaluateFire(defaultStudy().fire, src);
    expect(e.distance.state).toBe('REACHED');
    const at = shim.poolFireSolidFlame({ ...G.fires.ybPoolFire.args, distanceFromCentreM: e.distance.distanceFromCentreM });
    expect(rel(at.heatFluxWM2, 5000)).toBeLessThan(1e-9);
    const b = evaluateFire({ ...defaultStudy().fire, transmissivityMode: 'bagster', searchTransmissivity: '' }, src);
    expect(b.distance.field).toBe('transmissivity');
  });

  it('draws the heat flux curve outward from just past the flame', () => {
    const e = evaluateStudy(defaultStudy());
    const pts = e.fire.series.points;
    expect(pts[0].distanceM).toBeGreaterThan(e.fire.series.reachM);
    expect(pts.every((p) => p.heatFluxKWM2 > 0)).toBe(true);
    expect(pts[pts.length - 1].heatFluxKWM2).toBeLessThan(pts[0].heatFluxKWM2);
  });

  it('takes Burgess with its inputs in MJ/kg and C', () => {
    const f = {
      ...defaultStudy().fire, burningMethod: 'burgess', heatOfVaporisationMJKg: '0.394',
      liquidHeatCapacityJKgK: '1740', boilingPointC: '80.1', ambientTemperatureC: '20',
    };
    const e = evaluateFire(f, evaluateSource(defaultStudy().source));
    const direct = shim.poolBurningRate({
      method: 'burgess', heatOfCombustionJKg: 40.15e6, heatOfVaporisationJKg: 0.394e6,
      liquidHeatCapacityJKgK: 1740, boilingPointK: 353.25, ambientTemperatureK: 293.15,
    });
    expect(e.burning.burningFluxKgM2S).toBeCloseTo(direct.burningFluxKgM2S, 12);
  });
});

describe('explosion', () => {
  it('refuses a TNT blast energy typed in kJ/kg', () => {
    const x = { ...defaultStudy().explosion, tntBlastEnergyMJKg: '4680' };
    expect(evaluateExplosion(x).tnt.field).toBe('tntBlastEnergyJKg');
  });

  it('refuses a scaled distance outside 0.05 to 40', () => {
    const x = { ...defaultStudy().explosion, distanceM: '1000' };
    const e = evaluateExplosion(x);
    expect(e.overpressure.field).toBe('scaledDistanceMKg13');
  });

  it('inverts the overpressure to the distance that gives it', () => {
    const e = evaluateExplosion(defaultStudy().explosion);
    const back = shim.kinneyGrahamOverpressure({ distanceM: e.distance.distanceM, tntMassKg: e.tnt.tntMassKg });
    expect(rel(back.overpressurePa, 20000)).toBeLessThan(1e-9);
  });

  it('draws the curve across the fit range only', () => {
    const e = evaluateExplosion(defaultStudy().explosion);
    const w = Math.cbrt(e.tnt.tntMassKg);
    expect(e.series[0].distanceM / w).toBeCloseTo(0.05, 12);
    expect(e.series[e.series.length - 1].distanceM / w).toBeCloseTo(40, 9);
    expect(e.series.every((p) => p.overpressureKPa > 0)).toBe(true);
  });
});

describe('a saved study', () => {
  it('reads back, filling a field a later build added', () => {
    const s = defaultStudy();
    s.dispersion.stabilityClass = 'F';
    const saved = JSON.parse(JSON.stringify({ name: 'A', schema: 1, study: s }));
    delete saved.study.fire.searchTransmissivity;
    const back = studyFromPayload(saved);
    expect(back.dispersion.stabilityClass).toBe('F');
    expect(back.fire.searchTransmissivity).toBe(defaultStudy().fire.searchTransmissivity);
    expect(evaluateStudy(back).dispersion.centreline.stabilityClass).toBe('F');
  });

  it('refuses a payload that is not a study', () => {
    expect(studyFromPayload(null)).toBeNull();
    expect(studyFromPayload({ study: { scenarios: [] } })).toBeNull();
  });
});

describe('formatting', () => {
  it('prints small probabilities in scientific form and zero as zero', () => {
    expect(formatPercent(0.8334)).toBe('83.3 %');
    expect(formatPercent(1.2e-5)).toBe('1.2e-3 %');
    expect(formatPercent(0)).toBe('0 %');
    expect(formatSci(4582.518)).toBe('4580');
    logGrid(1, 100, 3).forEach((v, i) => expect(v).toBeCloseTo([1, 10, 100][i], 9));
  });
});
