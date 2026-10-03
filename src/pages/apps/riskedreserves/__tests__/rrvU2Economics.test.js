/**
 * Risked Reserves Valuation U2-002: the derived minimum economic field size
 * and the value of a discovery by field size. The gates call the shipped
 * functions (which call the canonical `calculateEconomics`) and hold them
 * against hand calculations; nothing here restates an NPV loop.
 *
 * WORKED HAND CALCULATION (model H). Price 50 $/boe, variable opex 10 $/boe,
 * no fixed opex, development capex 200 $MM, one producing year, no decline,
 * no royalty, no tax, discount 10%. The canonical engine discounts mid-year:
 * year 0 (the capex) at 1.1^0.5, year 1 (the production) at 1.1^1.5.
 *   NPV(V) = 40 V / 1.1^1.5 - 200 / 1.1^0.5
 *   MEFS:    40 V / 1.1 = 200          so  V = 5.5 MMboe
 *   slope    u = 40 / 1.1^1.5 = 34.67137 $/boe
 *   offset   D = 200 / 1.1^0.5 = 190.69252 $MM       (D / u = 5.5)
 *   NPV(20) = 800 / 1.1^1.5 - 190.69252 = 502.73482 $MM
 * With royalty 10% and tax 30%: the year-1 cash per barrel is
 * (50 x 0.9 - 10) x 0.7 = 24.5 $, the year-0 capex earns no relief, so
 *   MEFS = 200 x 1.1 / 24.5 = 8.97959 MMboe.
 * With a capex of 5 $ per barrel developed on top of the 200 (no tax):
 *   40 V / 1.1 = 200 + 5 V             so  V = 200 / (36.3636 - 5) = 6.37681 MMboe.
 */
import { calculateEconomics } from '@/utils/npvCalculations';
import { valueProspect, lognormalFromP90P10, exceedance } from '@/utils/prospectValuation';
import { ECONOMICS_DEFAULTS } from '@/pages/apps/ReservoirCalcPro/services/prospectEconomics';
import {
  ECON_MODEL_DEFAULTS, ECON_MODEL_KEYS, modelProblem, npvOfSize, derivedMefs, valueLine, valueBySize, emvOnCurve, valueSizeCurves,
} from '../services/rrvEconomics';

jest.mock('@/utils/npvCalculations', () => {
  const actual = jest.requireActual('@/utils/npvCalculations');
  return { ...actual, calculateEconomics: jest.fn(actual.calculateEconomics) };
});

const H = { price: 50, opexPerBoe: 10, opexFixed: 0, capex: 200, capexPerBoe: 0, life: 1, decline: 0, royalty: 0, tax: 0, discount: 10 };
const U = 40 / 1.1 ** 1.5;
const D = 200 / 1.1 ** 0.5;

describe('the canonical engine is the only NPV', () => {
  test('npvOfSize is calculateEconomics on the case, and matches the hand calculation', () => {
    calculateEconomics.mockClear();
    const npv = npvOfSize(20, H);
    expect(calculateEconomics).toHaveBeenCalledTimes(1);
    expect(calculateEconomics.mock.results[0].value.metrics.npv).toBe(npv);
    expect(npv).toBeCloseTo(502.73482, 4);
    expect(npv).toBeCloseTo(U * 20 - D, 9);
    // the case handed to the engine: capex in year 0, production in year 1
    const sent = calculateEconomics.mock.calls[0][0];
    expect(sent.capex).toEqual([200, 0]);
    expect(sent.production.oil).toEqual([0, 20e6]);
    expect(sent.discountRate).toBe(10);
  });

  test('the starting model is the ReservoirCalc Pro screening model, so the chain has one set of defaults', () => {
    for (const k of Object.keys(ECONOMICS_DEFAULTS)) expect(ECON_MODEL_DEFAULTS[k]).toBe(ECONOMICS_DEFAULTS[k]);
    expect(ECON_MODEL_DEFAULTS.capexPerBoe).toBe(0);
    expect(ECON_MODEL_KEYS).toEqual(['price', 'opexPerBoe', 'opexFixed', 'capex', 'capexPerBoe', 'life', 'decline', 'royalty', 'tax', 'discount']);
  });
});

describe('the derived MEFS', () => {
  test('model H: 5.5 MMboe by hand, and the engine NPV there is zero', () => {
    const d = derivedMefs(H);
    expect(d.ok).toBe(true);
    expect(d.mefs).toBeCloseTo(5.5, 9);
    expect(d.npvAtMefs).toBeGreaterThanOrEqual(0);
    expect(d.npvAtMefs).toBeLessThan(1e-8);
    // the smallest size that pays: a hair below loses money
    expect(npvOfSize(d.mefs * (1 - 1e-6), H)).toBeLessThan(0);
  });

  test('negative control: the undiscounted answer (5.0) and the old typed default (10) are not the size that pays', () => {
    expect(Math.abs(derivedMefs(H).mefs - 200 / 40)).toBeGreaterThan(0.4);
    expect(npvOfSize(5.0, H)).toBeLessThan(-15);
    expect(npvOfSize(10, H)).toBeGreaterThan(100);
  });

  test('royalty and tax: 200 x 1.1 / 24.5 = 8.97959 MMboe', () => {
    expect(derivedMefs({ ...H, royalty: 10, tax: 30 }).mefs).toBeCloseTo(8.979592, 6);
  });

  test('capex per barrel developed: 200 / (40 / 1.1 - 5) = 6.37681 MMboe', () => {
    expect(derivedMefs({ ...H, capexPerBoe: 5 }).mefs).toBeCloseTo(6.376812, 6);
  });

  test('a model with nothing to pay for has an MEFS of zero', () => {
    expect(derivedMefs({ ...H, capex: 0 }).mefs).toBe(0);
  });

  test('a model in which no size pays says so and gives no number', () => {
    const d = derivedMefs({ ...H, price: 10 });
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/no field size pays/);
    expect(d.mefs).toBeUndefined();
  });

  test('a blank assumption is named, never read as zero', () => {
    expect(modelProblem({ ...H, price: '' })).toMatch(/enter price/);
    expect(derivedMefs({ ...H, tax: '' }).reason).toMatch(/enter tax/);
    expect(modelProblem({ ...H, life: 0 })).toMatch(/at least one year/);
    expect(modelProblem({ ...H, opexFixed: -1 })).toMatch(/zero or more/);
    expect(modelProblem(H)).toBeNull();
  });
});

describe('the value line the valuation engine reads', () => {
  const vol = { p90: 10, p10: 60 };

  test('model H is a straight line, and the line is it: u = 34.67137 $/boe, D = 190.69252 $MM', () => {
    const line = valueLine(H, vol);
    expect(line.ok).toBe(true);
    expect(line.mefs).toBeCloseTo(5.5, 9);
    expect(line.unitValue).toBeCloseTo(34.67137, 4);
    expect(line.unitValue).toBeCloseTo(U, 7);
    expect(line.devCost).toBeCloseTo(190.69252, 4);
    expect(line.devCost).toBeCloseTo(D, 6);
    expect(line.devCost / line.unitValue).toBeCloseTo(5.5, 8);
  });

  test('consistent by construction: a discovery of exactly the MEFS is worth zero, on any model', () => {
    for (const a of [H, ECON_MODEL_DEFAULTS, { ...ECON_MODEL_DEFAULTS, capexPerBoe: 6, opexFixed: 25 }]) {
      const line = valueLine(a, vol);
      expect(Math.abs(line.unitValue * line.mefs - line.devCost)).toBeLessThan(1e-6);
      expect(Math.abs(npvOfSize(line.mefs, a))).toBeLessThan(1e-6);
    }
  });

  test('negative control: the Step 1 defaults were not (a 10 MMboe discovery at 8 $/boe and 100 $MM is worth minus 20)', () => {
    expect(8 * 10 - 100).toBe(-20);
  });

  test('EMV on the line is Pc x engine NPV at the mean commercial size, less the well', () => {
    for (const a of [H, ECON_MODEL_DEFAULTS]) {
      const line = valueLine(a, vol);
      const v = valueProspect({ pg: 0.25, ...vol, mefs: line.mefs, unitValue: line.unitValue, devCost: line.devCost, wellCost: 25 });
      expect(line.meanCommercial).toBeCloseTo(v.meanIfCommercial, 9);
      expect(v.emv).toBeCloseTo(v.pc * npvOfSize(v.meanIfCommercial, a) - 25, 8);
      expect(v.npvIfCommercial).toBeCloseTo(npvOfSize(v.meanIfCommercial, a), 8);
    }
  });

  test('a typed MEFS above the derived one: the line still passes through the engine NPV at both ends', () => {
    const line = valueLine(ECON_MODEL_DEFAULTS, vol, 40);
    expect(line.mefs).toBe(40);
    expect(line.derivedMefs).toBeLessThan(40);
    expect(line.unitValue * 40 - line.devCost).toBeCloseTo(npvOfSize(40, ECON_MODEL_DEFAULTS), 8);
    expect(line.unitValue * line.meanCommercial - line.devCost).toBeCloseTo(npvOfSize(line.meanCommercial, ECON_MODEL_DEFAULTS), 8);
  });

  test('no success case yet: the model still gives its MEFS and a line', () => {
    const line = valueLine(H, { p90: '', p10: '' });
    expect(line.ok).toBe(true);
    expect(line.mefs).toBeCloseTo(5.5, 9);
    expect(line.unitValue).toBeCloseTo(U, 7);
  });
});

describe('value by field size', () => {
  test('the table is the engine at each size; the value per barrel grows with size because the capex is fixed', () => {
    const rows = valueBySize(H, [5.5, 10, 20, 40]);
    expect(rows.map((r) => r.size)).toEqual([5.5, 10, 20, 40]);
    expect(rows[0].npv).toBeCloseTo(0, 6);
    expect(rows[2].npv).toBeCloseTo(502.73482, 4);
    expect(rows[2].perBoe).toBeCloseTo(502.73482 / 20, 5);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i].perBoe).toBeGreaterThan(rows[i - 1].perBoe);
  });

  test('the curve and the line for the plot coincide on a linear model and part on one that is not', () => {
    const lin = valueLine(H, { p90: 10, p10: 60 });
    const c = valueSizeCurves(H, lin, 0, 80);
    expect(c.curve).toHaveLength(40);
    for (let i = 0; i < c.curve.length; i += 1) expect(c.curve[i][1]).toBeCloseTo(c.line[i][1], 6);
    // a heavy fixed opex: late years lose money and pay no tax, so the engine NPV bends
    const bent = { ...ECON_MODEL_DEFAULTS, opexFixed: 60 };
    const bl = valueLine(bent, { p90: 10, p10: 60 });
    const b = valueSizeCurves(bent, bl, 0, 200);
    const gap = Math.max(...b.curve.map((pt, i) => Math.abs(pt[1] - b.line[i][1])));
    expect(gap).toBeGreaterThan(1);
    // with no model there is only the line
    expect(valueSizeCurves(null, { unitValue: 8, devCost: 100 }, 0, 50).curve).toBeNull();
  });
});

describe('the cross-check: EMV with the curve integrated', () => {
  const e = (a, over = {}) => {
    const line = valueLine(a, { p90: 10, p10: 60 });
    return { pg: 0.25, p90: 10, p10: 60, mefs: line.mefs, unitValue: line.unitValue, devCost: line.devCost, wellCost: 25, ...over };
  };

  test('on a linear model it IS the engine EMV (1e-8)', () => {
    const input = e(H);
    expect(emvOnCurve(input, H)).toBeCloseTo(valueProspect(input).emv, 8);
  });

  test('on a bent model it agrees with a brute-force integral of the engine NPV over the lognormal, and differs from the line', () => {
    const bent = { ...ECON_MODEL_DEFAULTS, opexFixed: 60 };
    const input = e(bent);
    const ln = lognormalFromP90P10(10, 60);
    // brute force: sum NPV(mid) x P(V in the slice) over 4,000 log slices above the MEFS
    const top = ln.percentile(1e-6);
    let sum = 0;
    const n = 4000;
    for (let k = 0; k < n; k += 1) {
      const a = input.mefs * (top / input.mefs) ** (k / n);
      const b = input.mefs * (top / input.mefs) ** ((k + 1) / n);
      sum += npvOfSize(Math.sqrt(a * b), bent) * (exceedance(ln, a) - exceedance(ln, b));
    }
    const brute = 0.25 * sum - 25;
    const onCurve = emvOnCurve(input, bent);
    expect(onCurve).toBeCloseTo(brute, 1);
    const onLine = valueProspect(input).emv;
    expect(Math.abs(onCurve - onLine)).toBeGreaterThan(0.05);
    // and the line is still a fair summary: within 5% of the mean commercial value at stake
    expect(Math.abs(onCurve - onLine)).toBeLessThan(0.05 * Math.abs(onLine + 25));
  });
});
