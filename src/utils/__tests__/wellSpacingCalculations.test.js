// Well Spacing Optimizer engine tests.
//
// This engine shipped with no tests at all, which is how four defects that
// each put a wrong number on screen survived from the initial import. Every
// group below pins one of them, plus the physical identities the model rests
// on.

import {
  validateInputs,
  calculateOptimalSpacing,
  generateCSV,
  generateJSON,
} from '../wellSpacingCalculations';

const BASE = {
  fieldName: 'Test Field',
  reservoirArea: '5000',
  avgNetPayThickness: '60',
  porosity: '15',
  initialWaterSaturation: '0.25',
  reservoirTemperature: '180',
  reservoirPressure: '3500',
  recoveryFactor: '35',
  oilGravity: '35',
  gasGravity: '0.75',
  initialSolutionGOR: '500',
  wellCost: '5000000',
  operatingExpense: '200000',
  minEconomicFlowRate: '10',
  typicalWellDeclineRate: '15',
  oilPrice: '75',
  gasPrice: '3.5',
  discountRate: '10',
  projectDuration: '20',
  royaltiesTaxes: '25',
  minSpacing: '20',
  maxSpacing: '160',
  spacingIncrement: '10',
};

const withOverrides = (o) => ({ ...BASE, ...o });

describe('validateInputs', () => {
  test('accepts the reference case', () => {
    expect(validateInputs(BASE).ok).toBe(true);
  });

  test('names the offending field rather than returning a bare false', () => {
    const { ok, errors } = validateInputs(withOverrides({ porosity: '' }));
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/Porosity/);
  });

  test('rejects a water saturation entered as a percentage', () => {
    // Swi is a FRACTION while porosity and recovery factor are percentages.
    // Entering 25 here used to sail through and make (1 - Swi) negative,
    // producing negative pore volume with no warning anywhere.
    const { ok, errors } = validateInputs(withOverrides({ initialWaterSaturation: '25' }));
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/water saturation/i);
    expect(errors.join(' ')).toMatch(/fraction/);
  });

  test('rejects a decline rate of 100 percent or more', () => {
    // ln(1 - 1) is -Infinity, which used to poison the whole row as NaN.
    expect(validateInputs(withOverrides({ typicalWellDeclineRate: '100' })).ok).toBe(false);
    expect(validateInputs(withOverrides({ typicalWellDeclineRate: '150' })).ok).toBe(false);
    expect(validateInputs(withOverrides({ typicalWellDeclineRate: '99' })).ok).toBe(true);
  });

  test('rejects a spacing range that fits no well, or is inverted', () => {
    expect(validateInputs(withOverrides({ minSpacing: '6000' })).ok).toBe(false);
    expect(validateInputs(withOverrides({ minSpacing: '160', maxSpacing: '20' })).ok).toBe(false);
  });

  test('does not require the inputs the engine never reads', () => {
    // Temperature, pressure, oil gravity and gas gravity are recorded on the
    // case and enter no equation. Requiring them implied they mattered.
    const stripped = withOverrides({
      reservoirTemperature: '', reservoirPressure: '', oilGravity: '', gasGravity: '',
    });
    expect(validateInputs(stripped).ok).toBe(true);
  });

  test('allows a genuinely zero gas price, royalty or discount rate', () => {
    expect(validateInputs(withOverrides({ gasPrice: '0' })).ok).toBe(true);
    expect(validateInputs(withOverrides({ royaltiesTaxes: '0' })).ok).toBe(true);
    expect(validateInputs(withOverrides({ discountRate: '0' })).ok).toBe(true);
  });
});

describe('results are ordered by spacing', () => {
  // Defect 1: generateJustification sorted the returned array in place, twice,
  // so the table and all three charts came out in ascending cost-per-barrel
  // order and the NPV curve was drawn across a non-monotonic x axis.
  test('spacingResults ascend by spacing after the optimum is chosen', async () => {
    const { spacingResults } = await calculateOptimalSpacing(BASE);
    const spacings = spacingResults.map((r) => r.spacing);
    expect(spacings).toEqual([...spacings].sort((a, b) => a - b));
    expect(spacings[0]).toBe(20);
    expect(spacings[spacings.length - 1]).toBe(160);
  });

  test('a non-integer increment does not produce floating point spacing labels', async () => {
    const { spacingResults } = await calculateOptimalSpacing(
      withOverrides({ minSpacing: '20', maxSpacing: '21', spacingIncrement: '0.1' }),
    );
    for (const r of spacingResults) {
      expect(String(r.spacing)).not.toMatch(/\d{6,}/);
    }
  });
});

describe('the rate stream agrees with the EUR', () => {
  // Defect 2: initialRate was EUR * 1000 * 0.15 treated as a DAILY rate and
  // then multiplied by 365, so the production stream overshot the EUR in the
  // same row by orders of magnitude and NPV was inflated with it.
  test('produced volume equals EUR when the well reaches its economic rate', async () => {
    const { spacingResults } = await calculateOptimalSpacing(
      withOverrides({ projectDuration: '100' }),   // long enough not to truncate
    );
    for (const r of spacingResults) {
      expect(r.truncatedByDuration).toBe(false);
      expect(r.producedPerWell / r.eurPerWell).toBeGreaterThan(0.999);
      expect(r.producedPerWell / r.eurPerWell).toBeLessThan(1.001);
    }
  });

  test('produced volume is strictly less than EUR when the duration truncates', async () => {
    const { spacingResults } = await calculateOptimalSpacing(
      withOverrides({ projectDuration: '5' }),
    );
    for (const r of spacingResults) {
      expect(r.truncatedByDuration).toBe(true);
      expect(r.producedPerWell).toBeLessThan(r.eurPerWell);
    }
  });

  test('the initial rate is a plausible daily rate, not an annual volume', async () => {
    const { optimalSpacing } = await calculateOptimalSpacing(BASE);
    // A 40 acre well on 60 ft of 15 percent porosity rock is a few hundred
    // bbl/d, not a six figure number.
    expect(optimalSpacing.initialRateBpd).toBeGreaterThan(10);
    expect(optimalSpacing.initialRateBpd).toBeLessThan(20000);
  });
});

describe('cost per barrel', () => {
  // Defect 3: opex was accumulated across the life inside the loop and then
  // multiplied by the life again, so it entered as N x opex x life squared.
  test('equals capex plus opex divided by produced volume', async () => {
    const { spacingResults } = await calculateOptimalSpacing(
      withOverrides({ projectDuration: '100' }),
    );
    const r = spacingResults[4];
    const capex = r.totalCapex * 1e6;
    const producedBbl = r.numberOfWells * r.producedPerWell * 1000;
    // Opex is a flat annual charge per well over the well's life.
    const opex = r.numberOfWells * 200000 * r.economicLife;
    expect(r.costPerBarrel).toBeCloseTo((capex + opex) / producedBbl, 6);
  });

  test('scales linearly with opex rather than quadratically', async () => {
    const single = await calculateOptimalSpacing(withOverrides({ projectDuration: '100' }));
    const doubled = await calculateOptimalSpacing(
      withOverrides({ projectDuration: '100', operatingExpense: '400000' }),
    );
    const a = single.spacingResults[4];
    const b = doubled.spacingResults[4];
    const capexPerBbl = (a.totalCapex * 1e6) / (a.numberOfWells * a.producedPerWell * 1000);
    const opexA = a.costPerBarrel - capexPerBbl;
    const opexB = b.costPerBarrel - capexPerBbl;
    expect(opexB / opexA).toBeCloseTo(2, 3);
  });
});

describe('the recovery model is coverage times the stated recovery factor', () => {
  // Defect 4 was never a coding error so much as an unstated assumption. The
  // app claimed a recovery response to spacing that it does not model. These
  // pin what it actually computes so nobody mistakes the step pattern for
  // interference physics.
  test('field recovery is areal coverage times the recovery factor', async () => {
    const { spacingResults } = await calculateOptimalSpacing(BASE);
    for (const r of spacingResults) {
      expect(r.totalFieldRecovery).toBeCloseTo(r.arealCoverage * 0.35 * 100, 9);
    }
  });

  test('a spacing that divides the area evenly covers all of it', async () => {
    const { spacingResults } = await calculateOptimalSpacing(
      withOverrides({ minSpacing: '50', maxSpacing: '50', spacingIncrement: '10' }),
    );
    // 5000 / 50 = 100 wells exactly.
    expect(spacingResults[0].numberOfWells).toBe(100);
    expect(spacingResults[0].arealCoverage).toBeCloseTo(1, 9);
    expect(spacingResults[0].totalFieldRecovery).toBeCloseTo(35, 9);
  });

  test('EUR per well rises linearly with spacing', async () => {
    // Each well drains exactly its spacing area, so doubling the spacing
    // doubles the EUR per well. That is the model, stated.
    const { spacingResults } = await calculateOptimalSpacing(BASE);
    const at20 = spacingResults.find((r) => r.spacing === 20);
    const at40 = spacingResults.find((r) => r.spacing === 40);
    expect(at40.eurPerWell / at20.eurPerWell).toBeCloseTo(2, 9);
  });
});

describe('volumetrics', () => {
  test('EUR per well matches the closed form', async () => {
    const { spacingResults } = await calculateOptimalSpacing(BASE);
    const r = spacingResults.find((x) => x.spacing === 40);
    // 40 acres x 60 ft x 0.15 x (1 - 0.25) x 7758 x 0.35, in Mbbl.
    const expected = (40 * 60 * 0.15 * 0.75 * 7758 * 0.35) / 1000;
    expect(r.eurPerWell).toBeCloseTo(expected, 6);
  });

  test('well count is the whole number that fits in the area', async () => {
    const { spacingResults } = await calculateOptimalSpacing(BASE);
    for (const r of spacingResults) {
      expect(r.numberOfWells).toBe(Math.floor(5000 / r.spacing));
    }
  });
});

describe('exports', () => {
  test('CSV carries a row per case and the new coverage column', async () => {
    const results = await calculateOptimalSpacing(BASE);
    const csv = generateCSV(results);
    const lines = csv.split('\n');
    expect(lines[0]).toMatch(/Areal Coverage/);
    expect(lines[0]).toMatch(/Produced per Well/);
    expect(lines).toHaveLength(results.spacingResults.length + 1);
  });

  test('JSON records the objective and the recovery model it used', async () => {
    const results = await calculateOptimalSpacing(BASE);
    const json = generateJSON(BASE, results);
    expect(json.metadata.objective).toMatch(/NPV/);
    expect(json.metadata.recoveryModel).toMatch(/no interference/i);
    expect(json.optimizationResults).toHaveLength(results.spacingResults.length);
  });
});
