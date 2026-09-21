/**
 * QRA Studio data shaping (PS3).
 *
 * The engine has its own gate (packages/engines/__tests__/hse.qra.test.js,
 * 171 tests against an independent Python oracle, second routes and the
 * published Purple Book, R2P2, HSE CBA checklist and Bevi values). These pin
 * the layer between the user's text and the engine: that the shim is the
 * vendored engine, that published goldens come through the studio's own
 * import path unchanged, that a blank stays absent and a refusal reaches the
 * page with its field, that an event tree outcome reaches the register, that
 * the owner's boundary rule (a value at a limit is in the LOWER band) holds
 * through the studio, and that a saved study reads back.
 */
import * as shim from '@/utils/processSafety/engine/qra';
import * as vendored from '../../../../packages/engines/engines/hse/qra';
import * as consequence from '../../../../packages/engines/engines/hse/consequence';
import { npv } from '../../../../packages/engines/engines/economics/cashflow.ts';
import {
  alarpBand, costBenefit, fnCriterionComparison, individualRiskPerAnnum, locationIndividualRisk, lsirTransect,
  pbFatalityFractions, potentialLossOfLife,
} from '../../../../packages/engines/engines/hse/qra';
import {
  UNIT, contourInside, criterionLimits, criterionLine, defaultStudy, deltaPll, evaluateCell, evaluateCostBenefit,
  evaluateEventTree, evaluateStudy, fnStaircase, formatSci, kpaToPa, kwToW, oneIn, percentToFraction,
  scenarioFrequency, studyFromPayload, toNumber, toNumberList,
} from '@/utils/processSafety/qraStudy';

const G = require('../../../../packages/engines/test-data/hse/goldens/qra_cases.json');

const clone = (x) => JSON.parse(JSON.stringify(x));

describe('the engine shim', () => {
  it('re-exports the vendored engine itself', () => {
    [
      'eventTree', 'flammableReleaseEventTree', 'pbDirectIgnitionProbability', 'locationIndividualRisk',
      'individualRiskPerAnnum', 'potentialLossOfLife', 'fatalAccidentRateFromPll', 'fnCurve', 'fnCriterionComparison',
      'alarpBand', 'costBenefit', 'pbFatalityFractions', 'thermalFatalityTransect', 'lsirTransect',
      'TOLERABILITY_PRESETS', 'FN_CRITERIA', 'PB_IR_CONTOURS_PER_YR',
    // eslint-disable-next-line import/namespace
    ].forEach((name) => expect(shim[name]).toBe(vendored[name]));
  });

  it('re-grades none of H4 and none of the Facilities point-source radiation', () => {
    const names = Object.keys(shim);
    ['thermalProbit', 'toxicProbit', 'gaussianPlume', 'poolFireSolidFlame', 'radiationIntensity', 'flareSetbackM', 'poolFireSetbackM', 'npv']
      .forEach((fn) => expect(names).not.toContain(fn));
  });

  it('discounts through the canonical economics npv, and the engine says so', () => {
    // A discounted checklist case through the engine equals the canonical npv
    // of the same year-end flows; no second npv exists in the studio.
    const r = costBenefit({
      deltaPllPerYr: 1e-3, vpf: 1e6, lifetimeYears: 10, capitalCost: 5e4, annualCost: 1e3, disproportionFactor: 3,
      benefitDiscountRate: 0.035, costDiscountRate: 0.035,
    });
    const years = Array.from({ length: 10 }, () => 1000);
    expect(r.presentValueBenefit).toBe(npv(years, 0.035, 0, 1));
    expect(r.presentValueCost).toBe(npv([5e4, ...years], 0.035, 0, 0));
    expect(r.basis.discounting).toMatch(/engines\/economics\/cashflow\.ts npv/);
  });
});

describe('published goldens through the studio', () => {
  it('reproduces the HSE CBA checklist worked example from the default study: 9,283 and about 93,000', () => {
    const g = G.costBenefit.find((c) => c.id === 'hse-cba-checklist-example');
    const { result } = evaluateStudy(defaultStudy()).costBenefit;
    expect(result.presentValueBenefit).toBeCloseTo(g.expected.presentValueBenefit, 9);
    expect(Math.abs(result.presentValueBenefit - g.printed.total)).toBeLessThanOrEqual(g.printedAbsTol);
    expect(result.maximumReasonablyPracticableCost).toBeCloseTo(g.expected.maximumReasonablyPracticableCost, 6);
    expect(result.verdict).toBe(g.expected.verdict);
    expect(result.fatalityBenefitPerYr).toBeCloseTo(g.expected.fatalityBenefitPerYr, 9);
    // the same call the golden makes, made directly, gives the same object
    expect(result).toEqual(costBenefit({ ...g.args, annualCost: 0 }));
  });

  it('reproduces the Purple Book Appendix 6.B contribution, printed 7.0e-9 per year', () => {
    const g = G.individualRisk.pbAppendix6bContribution;
    const study = defaultStudy();
    study.scenarios = [{
      ...study.scenarios[3], id: 'x', name: g.args.scenarios[0].name, frequencySource: 'typed',
      frequencyPerYr: String(g.args.scenarios[0].frequencyPerYr),
    }];
    study.locations = [study.locations[0]];
    study.cells = { x: { l1: { mode: 'typed', pd: String(g.args.scenarios[0].fatalityProbability) } } };
    const r = evaluateStudy(study).register.locations[0].lsir;
    expect(Number(r.lsirPerYr.toFixed(g.printedDecimals))).toBe(g.printed);
    expect(r).toEqual(locationIndividualRisk(g.args));
  });

  it('bands the R2P2 para 128 public gas risk broadly acceptable', () => {
    const study = defaultStudy();
    study.locations[2].criterion = 'r2p2-public';
    study.scenarios = [{ ...study.scenarios[3], id: 'g', frequencySource: 'typed', frequencyPerYr: String(1 / 1510000) }];
    study.cells = { g: { l1: { mode: 'typed', pd: '0' }, l2: { mode: 'typed', pd: '0' }, l3: { mode: 'typed', pd: '1' } } };
    expect(evaluateStudy(study).register.locations[2].band.band).toBe('BROADLY_ACCEPTABLE');
  });
});

describe('the default study, every number the engine\'s', () => {
  const study = defaultStudy();
  const e = evaluateStudy(study);

  it('takes the direct ignition from Table 4.5 and the scenario frequencies from the event tree', () => {
    expect(e.eventTree.ignition.probability).toBe(0.04);
    expect(e.eventTree.ignition.band).toBe('medium');
    const totals = e.eventTree.tree.outcomeTotalsPerYr;
    expect(e.register.freqs[0]).toEqual({ value: totals['jet or pool fire'], linked: true });
    expect(e.register.freqs[1].value).toBe(totals['flash fire']);
    expect(e.register.freqs[2].value).toBe(totals.explosion);
    expect(e.register.freqs[3]).toEqual({ value: 5e-6 });
  });

  it('turns each dose into Pd by the Purple Book rules, in SI at the edge', () => {
    const c = e.register.cells;
    expect(c.s1.l1).toEqual(pbFatalityFractions({
      effect: 'fire', period: 'day', insideFlameEnvelope: false, heatFluxWM2: 20000, fireDurationS: 600,
    }));
    expect(c.s1.l1.exposureTimeUsedS).toBe(20);
    expect(c.s2.l1.probabilityOfDeath).toBe(1);
    expect(c.s2.l2.probabilityOfDeath).toBe(0);
    expect(c.s3.l1.probabilityOfDeath).toBe(1);
    expect(c.s3.l2.probabilityOfDeath).toBe(0);
    expect(c.s3.l2.fractionDyingIndoors).toBe(0.025);
    expect(c.s4.l3.fractionIndoors).toBe(0.99);
    expect(c.s1.l3).toEqual({ typed: true, probabilityOfDeath: 0 });
  });

  it('gives each LSIR, band and contour as the engine does', () => {
    const [pa, cr, sb] = e.register.locations;
    const expectLsir = (lid) => locationIndividualRisk({
      scenarios: study.scenarios.map((s, i) => ({
        name: s.name, frequencyPerYr: e.register.freqs[i].value, fatalityProbability: e.register.cells[s.id][lid].probabilityOfDeath,
      })),
    });
    expect(pa.lsir).toEqual(expectLsir('l1'));
    expect(pa.band).toEqual(alarpBand({ individualRiskPerYr: pa.lsir.lsirPerYr, thresholds: 'r2p2-workers' }));
    expect(pa.band.band).toBe('TOLERABLE');
    expect(pa.contour).toBe(1e-5);
    expect(cr.band.band).toBe('BROADLY_ACCEPTABLE');
    expect(sb.band).toEqual(alarpBand({ individualRiskPerYr: sb.lsir.lsirPerYr, thresholds: 'r2p2-public' }));
  });

  it('gives the IRPA of the most exposed person from hours', () => {
    expect(e.individual.irpa).toEqual(individualRiskPerAnnum({
      locations: e.register.locations.map((r, j) => ({
        name: r.label, lsirPerYr: r.lsir.lsirPerYr, hoursPerYr: Number(study.locations[j].occupancyHoursPerYr),
      })),
    }));
    expect(e.individual.irpaBand.band).toBe('TOLERABLE');
  });

  it('gives PLL, FAR and an F-N curve below the Purple Book line', () => {
    expect(e.societal.pll).toEqual(potentialLossOfLife({
      scenarios: study.scenarios.map((s, i) => ({ name: s.name, frequencyPerYr: e.register.freqs[i].value, fatalities: Number(s.fatalities) })),
    }));
    expect(e.societal.far.far).toBeCloseTo((e.societal.pll.pllPerYr * 1e8) / 80000, 12);
    expect(e.societal.comparison.state).toBe('BELOW');
    expect(e.societal.comparison.checks.map((c) => c.fatalities)).toEqual([12]);
  });

  it('gives the transect and its contour crossings', () => {
    const t = e.transect;
    expect(t.result).toEqual(lsirTransect({
      distancesM: [10, 20, 30, 50, 75, 100, 150, 200, 300],
      scenarios: t.rows.map((r) => ({ name: r.name, frequencyPerYr: r.frequencyPerYr, fatalityProbabilities: r.probabilities })),
    }));
    expect(t.rows[0].probabilities).toEqual(vendored.thermalFatalityTransect({
      heatFluxesWM2: [60, 35, 22, 12, 7, 4.5, 2.5, 1.6, 0.8].map((q) => q * 1000), exposureTimeS: 20, coefficients: 'purple-book',
    }).probabilities);
    expect(t.result.contours[0].crossingsM).toEqual([]);
    expect(t.result.contours[1].crossingsM).toHaveLength(1);
  });
});

describe('the boundary rule: a value exactly at a limit is in the lower band', () => {
  const at = (ir, criterion) => {
    const study = defaultStudy();
    study.locations[0].criterion = criterion;
    study.scenarios = [{ ...study.scenarios[3], id: 'b', frequencySource: 'typed', frequencyPerYr: String(ir) }];
    study.cells = { b: { l1: { mode: 'typed', pd: '1' }, l2: { mode: 'typed', pd: '0' }, l3: { mode: 'typed', pd: '0' } } };
    return evaluateStudy(study).register.locations[0].band;
  };
  it('1e-3 for a worker is TOLERABLE, and at the limit', () => {
    const b = at(1e-3, 'r2p2-workers');
    expect(b.band).toBe('TOLERABLE');
    expect(b.atBoundary).toBe('unacceptable');
  });
  it('1e-6 is BROADLY_ACCEPTABLE, and just above it is TOLERABLE', () => {
    expect(at(1e-6, 'r2p2-workers').band).toBe('BROADLY_ACCEPTABLE');
    expect(at(1.001e-6, 'r2p2-workers').band).toBe('TOLERABLE');
  });
  it('1e-4 for the public is TOLERABLE, and above it UNACCEPTABLE', () => {
    expect(at(1e-4, 'r2p2-public').band).toBe('TOLERABLE');
    expect(at(1.01e-4, 'r2p2-public').band).toBe('UNACCEPTABLE');
  });
  it('a cost exactly DF times the benefit is not grossly disproportionate', () => {
    const study = defaultStudy();
    Object.assign(study.costBenefit, {
      deltaPllPerYr: '1e-5', vpf: '1000000', lifetimeYears: '1', capitalCost: '10', annualCost: '', disproportionFactor: '1', otherHarms: [],
    });
    const { result } = evaluateStudy(study).costBenefit;
    expect(result.verdict).toBe('NOT_GROSSLY_DISPROPORTIONATE');
    expect(result.atBoundary).toBe(true);
  });
});

describe('blank stays absent, and refusals reach the page by field', () => {
  it('reads text as numbers without turning a blank into zero', () => {
    expect(toNumber('')).toBeUndefined();
    expect(toNumber('  ')).toBeUndefined();
    expect(toNumber('1e-5')).toBe(1e-5);
    expect(Number.isNaN(toNumber('abc'))).toBe(true);
    expect(kwToW('')).toBeUndefined();
    expect(kwToW('35')).toBe(35 * UNIT.W_PER_KW);
    expect(kpaToPa('30')).toBe(30000);
    expect(percentToFraction('3.5')).toBeCloseTo(0.035, 15);
    expect(toNumberList('10, 20 ,30')).toEqual([10, 20, 30]);
    expect(toNumberList('')).toEqual([]);
  });

  it('refuses a blank scenario frequency at every location, naming the field', () => {
    const study = defaultStudy();
    study.scenarios[3].frequencyPerYr = '';
    const e = evaluateStudy(study);
    e.register.locations.forEach((r) => {
      expect(r.lsir.field).toBe('scenarios[3].frequencyPerYr');
      expect(r.band).toBeNull();
    });
    expect(e.individual.irpa.upstream).toBe(true);
    expect(e.societal.pll.field).toBe('scenarios[3].frequencyPerYr');
  });

  it('refuses a blank heat flux in a cell by the engine field, and a blank Pd', () => {
    const study = defaultStudy();
    expect(evaluateCell({ mode: 'pb', dose: '', inFlame: false }, study.scenarios[0], study.locations[0]).field).toBe('heatFluxWM2');
    expect(evaluateCell({ mode: 'pb', dose: '5', inFlame: false }, { ...study.scenarios[0], fireDurationS: '' }, study.locations[0]).field).toBe('fireDurationS');
    study.cells.s4.l1 = { mode: 'typed', pd: '' };
    const r = evaluateStudy(study).register.locations[0].lsir;
    expect(r.field).toBe('scenarios[3].fatalityProbability');
    expect(r.error).toMatch(/'H2S release' must be a probability of death/);
  });

  it('sends a blank occupancy to the engine, which refuses it', () => {
    const study = defaultStudy();
    study.locations[2].occupancyHoursPerYr = '';
    expect(evaluateStudy(study).individual.irpa.field).toBe('locations[2].occupancyFraction');
  });

  it('refuses a year of occupancy spread over two places', () => {
    const study = defaultStudy();
    study.locations[0].occupancyHoursPerYr = '8000';
    study.locations[1].occupancyHoursPerYr = '1000';
    expect(evaluateStudy(study).individual.irpa.field).toBe('locations');
  });

  it('refuses a fractional life and a DF below 1 in the cost-benefit test', () => {
    const study = defaultStudy();
    study.costBenefit.lifetimeYears = '2.5';
    expect(evaluateStudy(study).costBenefit.result.field).toBe('lifetimeYears');
    study.costBenefit.lifetimeYears = '25';
    study.costBenefit.disproportionFactor = '0.5';
    expect(evaluateStudy(study).costBenefit.result.field).toBe('disproportionFactor');
  });

  it('carries an event tree refusal into the scenarios that link to it', () => {
    const study = defaultStudy();
    study.eventTree.massRateKgS = '';
    const e = evaluateStudy(study);
    expect(e.eventTree.ignition.field).toBe('massRateKgS');
    expect(e.register.freqs[0].refusal.upstream).toBe(true);
    expect(e.register.freqs[3].refusal).toBeUndefined();
  });

  it('refuses branch probabilities that do not close to 1, by the split', () => {
    const et = { ...defaultStudy().eventTree, splitMode: 'given', flashFire: '0.6', explosion: '0.5' };
    expect(evaluateEventTree(et).tree.field).toBe('vapourCloudSplit');
  });

  it('refuses an unknown outcome name rather than reading it off the prototype', () => {
    const { tree } = evaluateEventTree(defaultStudy().eventTree);
    const r = scenarioFrequency({ frequencySource: 'event-tree', outcome: 'constructor' }, tree);
    expect(r.refusal.field).toBe('frequencyPerYr');
    expect(r.value).toBeUndefined();
  });
});

describe('the studio\'s own small steps', () => {
  it('reads the PLL reduction as the register PLL less the PLL after', () => {
    const study = defaultStudy();
    const e = evaluateStudy(study);
    const d = deltaPll({ deltaSource: 'register', pllAfterPerYr: '1e-4' }, e.societal);
    expect(d.value).toBeCloseTo(e.societal.pll.pllPerYr - 1e-4, 18);
    expect(deltaPll({ deltaSource: 'register', pllAfterPerYr: '' }, e.societal).refusal.field).toBe('pllAfterPerYr');
  });

  it('passes a blank rate as absent so the engine keeps its stated undiscounted default', () => {
    const study = defaultStudy();
    const { result } = evaluateCostBenefit(study.costBenefit, evaluateStudy(study).societal);
    expect(result.basis.discounting).toMatch(/undiscounted/);
    study.costBenefit.costDiscountRatePct = '3.5';
    const r2 = evaluateCostBenefit(study.costBenefit, evaluateStudy(study).societal).result;
    expect(r2.basis.discounting).toMatch(/costs at 0\.035/);
  });

  it('names the Purple Book contour a value lies inside, and none below 1e-8', () => {
    expect(contourInside(3e-5)).toBe(1e-5);
    expect(contourInside(1e-4)).toBe(1e-4);
    expect(contourInside(2e-3)).toBe(1e-4);
    expect(contourInside(5e-9)).toBeNull();
  });

  it('reads the band limits of a criterion from the engine', () => {
    expect(criterionLimits('r2p2-public', {})).toMatchObject({ unacceptableAbovePerYr: 1e-4, broadlyAcceptableAtOrBelowPerYr: 1e-6 });
    expect(criterionLimits('custom', { customUpperPerYr: '1e-6', customLowerPerYr: '1e-3' }).field)
      .toBe('thresholds.broadlyAcceptableAtOrBelowPerYr');
  });

  it('draws the F-N staircase at the engine corners, holding each F to the left of its corner', () => {
    const pts = [{ fatalities: 2, cumulativeFrequencyPerYr: 1e-4 }, { fatalities: 10, cumulativeFrequencyPerYr: 1e-5 }];
    expect(fnStaircase(pts)).toEqual([
      { n: 1, f: 1e-4 }, { n: 2, f: 1e-4 }, { n: 2, f: 1e-5 }, { n: 10, f: 1e-5 },
    ]);
  });

  it('samples the criterion line from the engine, only inside its range', () => {
    const { line } = criterionLine('vrom-establishments', 1, 1000);
    expect(line.length).toBeGreaterThan(5);
    line.forEach((p) => {
      expect(p.n).toBeGreaterThanOrEqual(10);
      const r = fnCriterionComparison({ scenarios: [{ name: 'p', frequencyPerYr: 1, fatalities: p.n }], criterion: 'vrom-establishments' });
      expect(p.f).toBe(r.checks[0].criterionFrequencyPerYr);
    });
    expect(criterionLine('r2p2-para-136', 1, 1000).points).toEqual([{ fatalities: 50, frequencyPerYr: 1 / 5000 }]);
  });

  it('formats risks as R2P2 words them', () => {
    expect(oneIn(1e-4)).toBe('1 in 10,000');
    expect(oneIn(0)).toBe('n/a');
    expect(formatSci(1.2345e-7, 3)).toBe('1.23e-7');
  });
});

describe('save and restore', () => {
  it('reads back what it saved, and fills fields a newer build added', () => {
    const study = defaultStudy();
    study.scenarios[0].name = 'Renamed';
    study.cells.s1.l1.dose = '25';
    const payload = clone({ name: 'x', schema: 1, study });
    delete payload.study.costBenefit.benefitGrowthRatePct;
    delete payload.study.scenarios[1].fireDurationS;
    const back = studyFromPayload(payload);
    expect(back.scenarios[0].name).toBe('Renamed');
    expect(back.cells.s1.l1.dose).toBe('25');
    expect(back.costBenefit.benefitGrowthRatePct).toBe('');
    expect(back.scenarios[1].fireDurationS).toBe('');
    expect(evaluateStudy(back).register.cells.s1.l1).toEqual(
      pbFatalityFractions({ effect: 'fire', period: 'day', insideFlameEnvelope: false, heatFluxWM2: 25000, fireDurationS: 600 }),
    );
  });

  it('refuses a payload that is no QRA study', () => {
    expect(studyFromPayload(null)).toBeNull();
    expect(studyFromPayload({ study: { source: {}, dispersion: {} } })).toBeNull();
  });

  it('stores no computed result', () => {
    const text = JSON.stringify(defaultStudy());
    ['lsirPerYr', 'pllPerYr', 'presentValue', 'band', 'verdict'].forEach((k) => expect(text).not.toContain(k));
  });
});

describe('the transect uses the H4 thermal probit unchanged', () => {
  it('is the consequence engine function', () => {
    const r = vendored.thermalFatalityTransect({ heatFluxesWM2: [12500], exposureTimeS: 30 });
    expect(r.probabilities[0]).toBe(consequence.thermalProbit({ heatFluxWM2: 12500, exposureTimeS: 30 }).probability);
  });
});
