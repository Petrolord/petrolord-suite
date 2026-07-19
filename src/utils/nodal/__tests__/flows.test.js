import { buildFluidModel, pvtAt } from '../pvt';
import { inSituRates, pipeArea } from '../flows';

const MODEL = buildFluidModel({ api: 35, gasSg: 0.75, gor: 600, salinityPpm: 30000 });
const AREA = pipeArea(2.441);

describe('nodal in-situ flows', () => {
  test('pipeArea of 2.441 in tubing', () => {
    expect(AREA).toBeCloseTo((Math.PI / 4) * (2.441 / 12) ** 2, 12);
  });

  test('no free gas above the bubble point', () => {
    const pvt = pvtAt(MODEL, 5000, 190);
    const f = inSituRates({ qo: 1000, wct: 0.25, gor: 600, pvt, areaFt2: AREA });
    expect(f.freeGasScfd).toBe(0);
    expect(f.vsg).toBe(0);
    expect(f.lambdaL).toBeCloseTo(1, 9);
  });

  test('free gas grows as pressure drops and holdup input drops', () => {
    const deep = inSituRates({ qo: 1000, wct: 0.25, gor: 600, pvt: pvtAt(MODEL, 2000, 170), areaFt2: AREA });
    const shallow = inSituRates({ qo: 1000, wct: 0.25, gor: 600, pvt: pvtAt(MODEL, 500, 110), areaFt2: AREA });
    expect(shallow.freeGasScfd).toBeGreaterThan(deep.freeGasScfd);
    expect(shallow.vsg).toBeGreaterThan(deep.vsg);
    expect(shallow.lambdaL).toBeLessThan(deep.lambdaL);
  });

  test('water cut splits the liquid stream', () => {
    const pvt = pvtAt(MODEL, 2000, 170);
    const dry = inSituRates({ qo: 1000, wct: 0, gor: 600, pvt, areaFt2: AREA });
    const wet = inSituRates({ qo: 1000, wct: 0.5, gor: 600, pvt, areaFt2: AREA });
    expect(dry.qw).toBe(0);
    expect(wet.qw).toBeCloseTo(1000, 6);
    expect(wet.vsl).toBeGreaterThan(dry.vsl);
    expect(wet.rhoL).toBeGreaterThan(dry.rhoL);
  });

  test('no-slip density is the holdup-weighted mixture', () => {
    const pvt = pvtAt(MODEL, 1000, 140);
    const f = inSituRates({ qo: 800, wct: 0.25, gor: 600, pvt, areaFt2: AREA });
    const expected = f.rhoL * f.lambdaL + pvt.rhoG * (1 - f.lambdaL);
    expect(f.rhoNs).toBeCloseTo(expected, 12);
  });
});
