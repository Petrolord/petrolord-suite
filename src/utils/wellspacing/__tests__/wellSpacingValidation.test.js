/**
 * WS-U1 validation gates (PL1, "gates must call the engine"). Every formula
 * the Well Spacing Optimizer prints is held against a published worked value
 * or a published table, by calling the engine function the app calls, with
 * a negative control that shows the gate can fail. The units of every
 * constant are pinned: k in md (not darcies), t in hours (not days), lengths
 * in ft, A in acres times 43,560 ft2.
 *
 * Sources
 *   Ahmed and McKinney, Advanced Reservoir Engineering (Gulf, 2005), Ch. 1,
 *     the publisher's public sample chapter: Ex. 1.5 and 1.6 (40 acres,
 *     re = 745 ft), Eq. 1.2.124 and Ex. 1.18 (pseudosteady-state rate,
 *     416 STB/d), Eq. 1.2.134 and Ex. 1.21 (interference of offset wells,
 *     line source), Table 1.4 (Earlougher's shape factors and tDA).
 *   Abramowitz and Stegun, Handbook of Mathematical Functions, Table 5.1
 *     (E1(1) = 0.219384, E1(1.5) = 0.100020, E1(5) = 0.001148).
 *   Standing (1947) Bo, as computed in the T1 test (1.284 at the sample).
 *   Arps (1945) exponential decline: Np = (qi - q) / D, D nominal.
 *   US Public Land Survey: a 40-acre quarter-quarter section is 1,320 ft on
 *     a side.
 */
import {
  drainageRadiusFt, interWellDistanceFt, radiusOfInvestigationFt, hoursToReach, pssOnsetHours,
  pssRateStbd, lineSourceArgument, lineSourceDropPsi, eurImpliedAreaAcres, LAYOUTS, layoutOf, drainageCase,
} from '../drainage';
import { expE1 } from '@/utils/welltest/numerics';
import { evaluateSpacingCases, standingBo, validateInputs } from '@/utils/wellSpacingCalculations';

const SAMPLE = {
  fieldName: 'Example field', reservoirArea: '5000', avgNetPayThickness: '60', porosity: '15.2',
  initialWaterSaturation: '0.25', reservoirTemperature: '180', reservoirPressure: '3500', recoveryFactor: '35',
  oilGravity: '35', gasGravity: '0.75', initialSolutionGOR: '500',
  wellCost: '5000000', operatingExpense: '200000', minEconomicFlowRate: '10', typicalWellDeclineRate: '15',
  oilPrice: '75', gasPrice: '3.5', discountRate: '10', projectDuration: '20', royaltiesTaxes: '25',
  minSpacing: '20', maxSpacing: '160', spacingIncrement: '10',
};

describe('geometry: drainage radius and the distance between wells', () => {
  it('40 acres: re = 745 ft (Ahmed Ex. 1.5 and 1.6); 160 acres: 1,489 ft', () => {
    expect(drainageRadiusFt(40)).toBeCloseTo(744.73, 2);
    expect(Math.round(drainageRadiusFt(40))).toBe(745);
    expect(drainageRadiusFt(160)).toBeCloseTo(2 * 744.73, 1);
  });
  it('square grid: 40 acres is 1,320 ft between wells (a quarter-quarter section)', () => {
    expect(interWellDistanceFt(40, 'square')).toBeCloseTo(1320, 9);
    expect(interWellDistanceFt(640, 'square')).toBeCloseTo(5280, 9); // one section, one mile
  });
  it('staggered grid: the regular hexagon of area A has neighbours sqrt(2A / sqrt 3) apart', () => {
    const d = interWellDistanceFt(40, 'triangular');
    expect(d).toBeCloseTo(1418.43, 2);
    // the hexagon closes on the area: (sqrt 3 / 2) d^2 = A
    expect((Math.sqrt(3) / 2) * d * d).toBeCloseTo(40 * 43560, 6);
  });
  it('the flood-pattern names of earlier builds map onto a layout', () => {
    expect(layoutOf('5-spot').key).toBe('square');
    expect(layoutOf('line-drive').key).toBe('square');
    expect(layoutOf('7-spot').key).toBe('triangular');
    expect(LAYOUTS.square.CA).toBe(30.8828); // Ahmed Table 1.4, square, well at centre
    expect(LAYOUTS.triangular.CA).toBe(31.6); // regular hexagon
    expect(LAYOUTS.square.tdaExact).toBe(0.1);
  });
  it('NEGATIVE CONTROL: an area in m2 read as acres (no 43,560) is 209 times short', () => {
    const wrong = Math.sqrt(40 / Math.PI);
    expect(Math.abs(wrong - drainageRadiusFt(40))).toBeGreaterThan(700);
  });
});

describe('pseudosteady-state deliverability (Ahmed Eq. 1.2.124, Ex. 1.18)', () => {
  // 40-acre square, k 50 md, h 15 ft, pbar 3,200, pwf 1,500 psi, mu 2.6 cp, Bo 1.15, rw 0.25 ft, CA 30.8828
  const EX = { kMd: 50, hFt: 15, pAvgPsia: 3200, pwfPsia: 1500, muCp: 2.6, bo: 1.15, areaAcres: 40, CA: 30.8828, rwFt: 0.25, skin: 0 };
  it('416 STB/d', () => {
    expect(pssRateStbd(EX)).toBeCloseTo(415.9, 1);
    expect(Math.round(pssRateStbd(EX))).toBe(416);
  });
  it('a positive skin lowers it as 0.5 ln(...) + s', () => {
    const q0 = pssRateStbd(EX);
    const q5 = pssRateStbd({ ...EX, skin: 5 });
    const x = 0.5 * Math.log((2.2458 * 40 * 43560) / (30.8828 * 0.0625));
    expect(q0 / q5).toBeCloseTo((x + 5) / x, 9);
  });
  it('NEGATIVE CONTROL: k typed in darcies (0.05) is 1,000 times low', () => {
    expect(pssRateStbd({ ...EX, kMd: 0.05 })).toBeCloseTo(0.4159, 3);
    expect(Math.abs(pssRateStbd({ ...EX, kMd: 0.05 }) - 416)).toBeGreaterThan(400);
  });
  it('refuses a flowing pressure at or above the average pressure', () => {
    expect(pssRateStbd({ ...EX, pwfPsia: 3200 })).toBeNaN();
  });
});

describe('interference of an offset well, line source (Ahmed Eq. 1.2.134, Ex. 1.21)', () => {
  // q2 160 STB/d at 400 ft, q3 200 STB/d at 700 ft, 15 hr; k 40 md, h 20 ft, phi 0.15, mu 2 cp, Bo 1.2, ct 20e-6
  const ROCK = { kMd: 40, hFt: 20, phi: 0.15, muCp: 2, bo: 1.2, ctPerPsi: 20e-6, tHours: 15 };
  it('the Ei arguments are the printed 1.5168 and 4.645', () => {
    expect(lineSourceArgument({ ...ROCK, rFt: 400 })).toBeCloseTo(1.5168, 4);
    expect(lineSourceArgument({ ...ROCK, rFt: 700 })).toBeCloseTo(4.645, 3);
  });
  it('the coefficients are the printed 33.888 and 42.36 psi', () => {
    // dp / E1(x) = 70.6 q mu B / (k h)
    const coef = (q, r) => lineSourceDropPsi({ ...ROCK, qStbd: q, rFt: r }) / expE1(lineSourceArgument({ ...ROCK, rFt: r }));
    expect(coef(160, 400)).toBeCloseTo(33.888, 3);
    expect(coef(200, 700)).toBeCloseTo(42.36, 2);
  });
  it('E1 is the tabulated function (Abramowitz and Stegun, Table 5.1)', () => {
    expect(expE1(1)).toBeCloseTo(0.219384, 6);
    expect(expE1(1.5)).toBeCloseTo(0.100020, 6);
    expect(expE1(5)).toBeCloseTo(0.001148, 6);
  });
  it('the drops: 0.074 psi from well 3 (printed 0.08); 3.31 psi from well 2 where the book reads E1(1.5168) as 0.13', () => {
    // The book's own E1 readings are 0.13 and 1.84e-3; the function at those
    // arguments is 0.0976 and 1.745e-3 (Table 5.1 brackets both). The
    // arguments and coefficients above match the book exactly; the drop
    // follows the tabulated function, so well 2 is 3.31 psi where the book
    // prints 4.41. Recorded in docs/upgrade/WellSpacingOptimizer-UPGRADE.md.
    expect(lineSourceDropPsi({ ...ROCK, qStbd: 200, rFt: 700 })).toBeCloseTo(0.074, 3);
    expect(lineSourceDropPsi({ ...ROCK, qStbd: 160, rFt: 400 })).toBeCloseTo(3.306, 3);
    expect(expE1(1.5168)).toBeLessThan(expE1(1.5));
    expect(expE1(1.5168)).toBeLessThan(0.13);
  });
  it('NEGATIVE CONTROL: time in days (15 / 24) moves the argument 24 times', () => {
    expect(lineSourceArgument({ ...ROCK, rFt: 400, tHours: 15 / 24 })).toBeCloseTo(1.5168 * 24, 3);
  });
});

describe('radius of investigation and the times the app prints', () => {
  const R = { kMd: 40, phi: 0.15, muCp: 2, ctPerPsi: 20e-6 };
  it('ri = sqrt(k t / (948 phi mu ct)): at ri the line-source argument is exactly 1 (Lee 1982)', () => {
    const ri = radiusOfInvestigationFt({ ...R, tHours: 15 });
    expect(lineSourceArgument({ ...R, rFt: ri, tHours: 15 })).toBeCloseTo(1, 12);
    expect(ri).toBeCloseTo(Math.sqrt((40 * 15) / (948 * 0.15 * 2 * 20e-6)), 9);
  });
  it('hoursToReach inverts it', () => {
    expect(radiusOfInvestigationFt({ ...R, tHours: hoursToReach({ ...R, rFt: 660 }) })).toBeCloseTo(660, 9);
  });
  it('pseudosteady onset: tDA = 0.0002637 k t / (phi mu ct A) = 0.1 (Ahmed Eq. 1.2.75b, Table 1.4)', () => {
    const t = pssOnsetHours({ areaAcres: 40, kMd: 20, phi: 0.15, muCp: 1.5, ctPerPsi: 25e-6 });
    expect((0.0002637 * 20 * t) / (0.15 * 1.5 * 25e-6 * 40 * 43560)).toBeCloseTo(0.1, 12);
    expect(t).toBeCloseTo(185.84, 2); // hours, the Ahmed Ex. 1.17 well
  });
  it('NEGATIVE CONTROL: the 0.000264 of a days-based tD would be 24 times off', () => {
    const tDaysConst = (0.1 * 0.15 * 1.5 * 25e-6 * 40 * 43560) / (0.0002637 * 24 * 20);
    expect(pssOnsetHours({ areaAcres: 40, kMd: 20, phi: 0.15, muCp: 1.5, ctPerPsi: 25e-6 }) / tDaysConst).toBeCloseTo(24, 9);
  });
  it('a case says what it waits for, and prints no number', () => {
    const c = drainageCase({ spacingAcres: 40, layout: 'square', planRateStbd: 100, rock: { phi: 0.15 } });
    expect(c.interferenceDays).toBeNaN();
    expect(c.timing).toMatch(/permeability, oil viscosity, total compressibility not given/);
    expect(c.deliverability).toMatch(/Not computed/);
    expect(c.distanceFt).toBe(1320);
  });
});

describe('the volumetric EUR and the decline the economics use', () => {
  it('Standing Bo 1.284 and EUR 289.2 Mbbl at 20 acres (T1); the EUR closes on (qi - qlimit) / Dn', async () => {
    expect(standingBo({ gor: 500, api: 35, gasGravity: 0.75, temperatureF: 180 }).bo).toBeCloseTo(1.2845, 4);
    const r = await evaluateSpacingCases(SAMPLE);
    const row = r.spacingResults.find((x) => x.spacing === 20);
    expect(row.eurPerWell).toBeCloseTo(289.2, 1);
    const Dn = -Math.log(1 - 0.15);
    const qi = row.initialRateBpd * 365.25;
    expect(((qi - 10 * 365.25) / Dn) / 1000).toBeCloseTo(row.eurPerWell, 9);
  });
  it('a Bo given on the form replaces Standing, and says so', async () => {
    const r = await evaluateSpacingCases({ ...SAMPLE, oilFvf: '1.4754' });
    expect(r.boSource).toBe('given');
    expect(r.spacingResults[0].eurPerWell).toBeCloseTo((7758 * 20 * 60 * 0.152 * 0.75 * 0.35) / 1.4754 / 1000, 9);
  });
  it('the EUR-implied area returns the spacing it came from', async () => {
    const r = await evaluateSpacingCases(SAMPLE);
    const row = r.spacingResults.find((x) => x.spacing === 80);
    expect(eurImpliedAreaAcres({ eurStb: row.eurPerWell * 1000, hFt: 60, phi: 0.152, swi: 0.25, rf: 0.35, bo: r.boUsed })).toBeCloseTo(80, 9);
  });
  it('NEGATIVE CONTROL: a nominal decline read as effective moves the EUR', async () => {
    const r = await evaluateSpacingCases(SAMPLE);
    const row = r.spacingResults.find((x) => x.spacing === 20);
    const qi = row.initialRateBpd * 365.25;
    expect(Math.abs((qi - 3652.5) / 0.15 / 1000 - row.eurPerWell)).toBeGreaterThan(15);
  });
});

describe('the deliverability check on the example field', () => {
  it('the plan rate rises with spacing; the pseudosteady rate barely moves', async () => {
    const r = await evaluateSpacingCases({ ...SAMPLE, permeability: '50', skin: '2', oilViscosity: '1.2', totalCompressibility: '0.000015', wellboreRadius: '0.354', flowingPressure: '1500' });
    const at = (s) => r.spacingResults.find((x) => x.spacing === s);
    expect(at(160).initialRateBpd / at(20).initialRateBpd).toBeGreaterThan(7);
    expect(at(20).drainage.pssRateStbd / at(160).drainage.pssRateStbd).toBeLessThan(1.2);
    expect(at(40).drainage.distanceFt).toBe(1320);
  });
  it('validation refuses a flowing pressure above the average pressure', () => {
    expect(validateInputs({ ...SAMPLE, flowingPressure: '3600' }).errors.join(' ')).toMatch(/Flowing bottomhole pressure must be below/);
  });
});
